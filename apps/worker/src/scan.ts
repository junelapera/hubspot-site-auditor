import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import pLimit from "p-limit";
import { chromium, type Browser } from "playwright";
import { isRateLimited, retryDelay, sleep, USER_AGENT } from "./http.js";
import { testForm } from "./checks/forms.js";
import type { LibraryDetector } from "./checks/libraries.js";
import { isFirstParty, parseMixedContentMessage, parseSetCookie } from "./checks/page-security.js";
import type { AxeFinding, CookieInfo, DetectedLibrary, Impact, ImageInfo, InsecureResource, LinkInfo, Location, PageForm, PageResult } from "./types.js";

const INSPECT_SRC = readFileSync(new URL("./browser/inspect.js", import.meta.url), "utf8");

export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];

export const DESKTOP = { width: 1366, height: 900 };


export interface ScanOptions {
  concurrency?: number;
  delayMs?: number;
  onPage?: (result: PageResult, done: number, total: number) => void;
  /** Retire.js matcher; without it, libraries aren't checked. */
  detector?: LibraryDetector;
}

/** Library matches per script URL, shared by every page in a scan so each script is checked once. */
type LibraryCache = Map<string, Promise<DetectedLibrary[]>>;

const FORM_TIMEOUT_MS = 30_000;

export async function scanPages(urls: string[], opts: ScanOptions = {}): Promise<PageResult[]> {
  const { concurrency = 3, delayMs = 500, onPage, detector } = opts;
  const libraryCache: LibraryCache = new Map();
  // Each HubSpot form (by form ID) is tested on the first page it's found on.
  const formsTested = new Set<string>();
  const browser = await chromium.launch();
  const limit = pLimit(concurrency);
  let done = 0;

  try {
    return await Promise.all(
      urls.map((url) =>
        limit(async () => {
          const result = await scanPage(browser, url, detector && { detector, cache: libraryCache }, formsTested);
          onPage?.(result, ++done, urls.length);
          await sleep(delayMs);
          return result;
        }),
      ),
    );
  } finally {
    await browser.close();
  }
}

export async function scanPage(
  browser: Browser,
  url: string,
  libraries?: { detector: LibraryDetector; cache: LibraryCache },
  formsTested?: Set<string>,
): Promise<PageResult> {
  const context = await browser.newContext({ viewport: DESKTOP, userAgent: USER_AGENT });
  const page = await context.newPage();
  const empty = { findings: [], images: [], links: [], insecure: [], cookies: [], scripts: [], libraries: [], anchors: [], forms: [] };

  // What the browser saw while loading: mixed-content warnings, script requests, first-party Set-Cookie headers.
  const consoleInsecure: InsecureResource[] = [];
  const scripts = new Set<string>();
  const cookieReads: Promise<CookieInfo[]>[] = [];
  const libraryReads: Promise<DetectedLibrary[]>[] = [];
  const siteHost = new URL(url).hostname;
  page.on("console", (msg) => {
    const found = parseMixedContentMessage(msg.text());
    if (found) consoleInsecure.push({ ...found, location: null });
  });
  page.on("request", (req) => {
    if (req.resourceType() === "script") scripts.add(req.url());
  });
  page.on("response", (res) => {
    if (libraries && res.request().resourceType() === "script" && res.ok()) {
      const scriptUrl = res.url();
      let found = libraries.cache.get(scriptUrl);
      if (!found) {
        const fromUrl = libraries.detector.fromUrl(scriptUrl);
        // Matched by URL or file name, or else by the body the browser already downloaded.
        found = fromUrl.length
          ? Promise.resolve(fromUrl)
          : res
              .text()
              .then((body) => libraries.detector.fromContent(scriptUrl, body))
              .catch(() => []);
        libraries.cache.set(scriptUrl, found);
      }
      libraryReads.push(found);
    }
    let host: string;
    try {
      host = new URL(res.url()).hostname;
    } catch {
      return;
    }
    if (!isFirstParty(host, siteHost)) return;
    cookieReads.push(
      res
        .headerValues("set-cookie")
        .then((values) => values.flatMap((v) => v.split("\n")).map(parseSetCookie).filter((c): c is CookieInfo => c !== null))
        .catch(() => []),
    );
  });

  try {
    let response = await page.goto(url, { waitUntil: "load", timeout: 45_000 });
    for (let attempt = 0; isRateLimited(response?.status() ?? null) && attempt < 3; attempt++) {
      await sleep(retryDelay(response!.headers()["retry-after"] ?? null, attempt));
      response = await page.goto(url, { waitUntil: "load", timeout: 45_000 });
    }
    // Never run axe on a rate-limit or error page: its findings would be junk.
    const status = response?.status() ?? null;
    if (status === null || status >= 400) {
      const error = isRateLimited(status) ? `Rate limited (HTTP ${status})` : `HTTP ${status}`;
      return { url, status, redirected: false, error, ...empty };
    }
    // Let JS-built modules and HubSpot forms render; don't fail if trackers keep the network busy.
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});

    const axe = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

    const nodes = axe.violations.flatMap((v) => v.nodes.map((node) => ({ v, node })));
    const inspected = (await page.evaluate(
      `(${INSPECT_SRC})(${JSON.stringify({ targets: nodes.map(({ node }) => node.target) })})`,
    )) as { targets: Location[]; images: ImageInfo[]; links: LinkInfo[]; insecure: InsecureResource[]; anchors: string[]; forms: PageForm[] };

    const findings: AxeFinding[] = nodes.map(({ v, node }, i) => ({
      ruleId: v.id,
      impact: (node.impact ?? v.impact ?? "minor") as Impact,
      help: v.help,
      helpUrl: v.helpUrl,
      tags: v.tags,
      html: node.html,
      failureSummary: node.failureSummary ?? "",
      target: node.target.map(String).join(" >>> "),
      location: inspected.targets[i],
    }));

    // Forms last: the test types Tab, submits empty and blocks non-GET requests, so the page is spent after it.
    if (formsTested) {
      for (const form of inspected.forms) {
        if (form.crossOrigin || formsTested.has(form.formId)) continue;
        formsTested.add(form.formId);
        try {
          form.test = await withTimeout(testForm(page, form.index), FORM_TIMEOUT_MS);
        } catch (err) {
          form.test = null;
          form.testError = (err as Error).message.split("\n")[0];
        }
      }
    }

    return {
      url,
      status: response?.status() ?? null,
      redirected: Boolean(response?.request().redirectedFrom()),
      findings,
      images: inspected.images,
      links: inspected.links,
      insecure: [...inspected.insecure, ...consoleInsecure],
      cookies: (await Promise.all(cookieReads)).flat(),
      scripts: [...scripts],
      libraries: (await Promise.all(libraryReads)).flat(),
      anchors: inspected.anchors,
      forms: inspected.forms,
    };
  } catch (err) {
    return { url, status: null, redirected: false, error: (err as Error).message, ...empty };
  } finally {
    await context.close();
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
