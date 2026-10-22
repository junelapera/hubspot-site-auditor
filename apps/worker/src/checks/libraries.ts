// Outdated JavaScript libraries with known vulnerabilities, using the Retire.js
// database. Scripts are matched by URL, file name, content and hash, using the
// bodies the browser already downloaded, so no extra requests go to the site.
// Retire.js "func" detectors (code run in the page) are not used.
import { createHash } from "node:crypto";
import { politeFetch } from "../http.js";
import type { DetectedLibrary, PageResult } from "../types.js";
import type { SecurityResult } from "./security.js";

export const RETIRE_REPO_URL = "https://raw.githubusercontent.com/RetireJS/retire.js/master/repository/jsrepository-v4.json";

// Retire.js's placeholder for a version number in its patterns.
const VERSION = "[0-9][0-9.a-z_\\-]+";

export type Severity = "low" | "medium" | "high" | "critical";
const SEVERITY_RANK: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 };

interface RawVulnerability {
  below?: string;
  atOrAbove?: string;
  severity: Severity;
  identifiers?: { summary?: string; CVE?: string[]; githubID?: string };
  info?: string[];
}

interface RawComponent {
  vulnerabilities?: RawVulnerability[];
  extractors?: { uri?: string[]; filename?: string[]; filecontent?: string[]; hashes?: Record<string, string> };
}

export type RetireRepo = Record<string, RawComponent>;

interface CompiledComponent {
  name: string;
  uri: RegExp[];
  filename: RegExp[];
  filecontent: RegExp[];
  hashes: Record<string, string>;
  vulnerabilities: RawVulnerability[];
}

export interface LibraryDetector {
  fromUrl(url: string): DetectedLibrary[];
  fromContent(url: string, content: string): DetectedLibrary[];
  vulnerabilities(component: string, version: string): Vulnerability[];
}

export interface Vulnerability {
  severity: Severity;
  summary: string;
  cves: string[];
  info: string;
}

export async function loadRetireRepo(): Promise<RetireRepo> {
  const res = await politeFetch(RETIRE_REPO_URL, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Retire.js database: HTTP ${res.status}`);
  return (await res.json()) as RetireRepo;
}

function compile(patterns: string[] | undefined, anchored = false): RegExp[] {
  return (patterns ?? []).flatMap((p) => {
    try {
      const source = p.replaceAll("§§version§§", VERSION);
      return [new RegExp(anchored ? `^${source}$` : source)];
    } catch {
      return []; // a pattern JavaScript can't compile: skip it rather than fail the scan
    }
  });
}

/** "1.11.2.min" → "1.11.2" (the version pattern also swallows .min). */
function cleanVersion(v: string): string {
  return v.replace(/[.-]min$/, "").replace(/[.-]$/, "");
}

export function createDetector(repo: RetireRepo): LibraryDetector {
  const components: CompiledComponent[] = Object.entries(repo)
    .filter(([name]) => name !== "retire-example")
    .map(([name, c]) => ({
      name,
      uri: compile(c.extractors?.uri),
      filename: compile(c.extractors?.filename, true),
      filecontent: compile(c.extractors?.filecontent),
      hashes: c.extractors?.hashes ?? {},
      vulnerabilities: c.vulnerabilities ?? [],
    }));
  const byName = new Map(components.map((c) => [c.name, c]));

  const match = (url: string, test: (c: CompiledComponent) => string | null): DetectedLibrary[] =>
    components.flatMap((c) => {
      const version = test(c);
      return version ? [{ component: c.name, version: cleanVersion(version), url }] : [];
    });

  const first = (regexes: RegExp[], text: string) => {
    for (const re of regexes) {
      const m = re.exec(text);
      if (m?.[1]) return m[1];
    }
    return null;
  };

  return {
    fromUrl(url) {
      let path: string;
      try {
        path = new URL(url).pathname;
      } catch {
        return [];
      }
      const file = path.split("/").pop() ?? "";
      return match(url, (c) => first(c.uri, url) ?? first(c.filename, file));
    },
    fromContent(url, content) {
      const sha1 = createHash("sha1").update(content).digest("hex");
      return match(url, (c) => c.hashes[sha1] ?? first(c.filecontent, content));
    },
    vulnerabilities(component, version) {
      return (byName.get(component)?.vulnerabilities ?? [])
        .filter((v) => (!v.below || compareVersions(version, v.below) < 0) && (!v.atOrAbove || compareVersions(version, v.atOrAbove) >= 0))
        .map((v) => ({
          severity: v.severity,
          summary: v.identifiers?.summary ?? "Known vulnerability",
          cves: v.identifiers?.CVE ?? [],
          info: v.info?.[0] ?? "",
        }));
    },
  };
}

/** Compares dotted versions; a pre-release ("1.2.0-beta") sorts before its release. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/);
  const pb = b.split(/[.-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i];
    const y = pb[i];
    if (x === undefined) return /^\d+$/.test(y) ? -1 : 1;
    if (y === undefined) return /^\d+$/.test(x) ? 1 : -1;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) {
      if (Number(x) !== Number(y)) return Number(x) - Number(y);
    } else if (nx !== ny) {
      return nx ? 1 : -1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

export interface JsLibrary {
  component: string;
  version: string;
  /** Up to 5 script URLs it was found in. */
  urls: string[];
  pages: string[];
  vulnerabilities: Vulnerability[];
  /** Worst severity, or null when this version has no known vulnerabilities. */
  severity: Severity | null;
}

/** One row per library + version, vulnerable ones first. */
export function auditLibraries(pages: PageResult[], detector: LibraryDetector): JsLibrary[] {
  const byKey = new Map<string, JsLibrary>();
  for (const page of pages) {
    for (const d of page.libraries ?? []) {
      const key = `${d.component}@${d.version}`;
      let lib = byKey.get(key);
      if (!lib) {
        const vulnerabilities = detector.vulnerabilities(d.component, d.version);
        lib = {
          component: d.component,
          version: d.version,
          urls: [],
          pages: [],
          vulnerabilities,
          severity: vulnerabilities.reduce<Severity | null>((w, v) => (!w || SEVERITY_RANK[v.severity] > SEVERITY_RANK[w] ? v.severity : w), null),
        };
        byKey.set(key, lib);
      }
      if (lib.urls.length < 5 && !lib.urls.includes(d.url)) lib.urls.push(d.url);
      if (!lib.pages.includes(page.url)) lib.pages.push(page.url);
    }
  }
  const rank = (l: JsLibrary) => (l.severity ? SEVERITY_RANK[l.severity] : 0);
  return [...byKey.values()].sort((a, b) => rank(b) - rank(a) || a.component.localeCompare(b.component));
}

export function checkLibraries(libraries: JsLibrary[]): SecurityResult {
  const vulnerable = libraries.filter((l) => l.severity);
  return {
    id: "js-libraries",
    name: "JavaScript libraries",
    pass: vulnerable.length === 0,
    current: vulnerable.length
      ? vulnerable.map((l) => `${l.component} ${l.version} (${l.vulnerabilities.length} known, worst ${l.severity})`).join("; ")
      : libraries.length
        ? `${libraries.length} ${libraries.length === 1 ? "library" : "libraries"} found, none with known vulnerabilities`
        : "No known libraries found",
    recommended: "No library versions with known vulnerabilities (Retire.js database)",
    fixLocation: "Theme files, or the module / embed that loads the script",
  };
}
