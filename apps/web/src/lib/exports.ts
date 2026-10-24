// CSV exports for a run. Pure functions over database rows so they can be tested.
import { toCsv, type Cell } from "./csv";
import { ALT_CHECK_LABEL, FORM_CHECK_IMPACT, FORM_CHECK_LABEL, LINK_CHECK_LABEL, moduleLabel } from "./format";
import { summarizeRules, WCAG_SC } from "./rules";
import { OLD_URL_LABEL, OLD_URL_ORDER } from "./old-urls";
import type { Fix, FormRow, Impact, ImageRow, IssueRow, JsLibraryRow, LinkRow, MixedContentRow, ModuleSummaryRow, OldUrlRow, Scope, ScriptDomainRow, SecurityRow } from "./types";

export const EXPORT_KINDS = ["issues", "rules", "images", "links", "redirects", "security", "mixed-content", "scripts", "libraries", "forms", "old-urls", "old-url-redirects"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

const MAX_PAGES_LISTED = 50;
const IMPACT_RANK: Record<Impact, number> = { critical: 4, serious: 3, moderate: 2, minor: 1 };

// Teamwork and Jira both accept High / Medium / Low.
const PRIORITY: Record<Impact, string> = { critical: "High", serious: "High", moderate: "Medium", minor: "Low" };

const WHERE_TO_FIX: Record<Scope, string> = {
  module: "Module code",
  global: "Header/footer (global)",
  template: "Page or blog template",
  content: "Page/post editor or CTA tool",
  embed: "Third-party embed (not fixable in the theme)",
  unknown: "Unknown",
};

function pageList(pages: string[]): string {
  const shown = pages.slice(0, MAX_PAGES_LISTED).join("\n");
  return pages.length > MAX_PAGES_LISTED ? `${shown}\n…and ${pages.length - MAX_PAGES_LISTED} more` : shown;
}

function fixText(fix: Fix | null | undefined): string {
  if (!fix) return "";
  return [fix.summary, ...fix.steps.map((s) => `- ${s}`)].join("\n");
}

/** One row per module + rule (PRD): the unit a developer fixes, ready for Teamwork / Jira import. */
export function issuesCsv(issues: IssueRow[], modules: ModuleSummaryRow[]): string {
  const moduleOrder = new Map(modules.map((m, i) => [`${m.scope}:${m.module ?? ""}`, i]));
  const groups = new Map<string, IssueRow[]>();
  for (const issue of issues) {
    const key = `${issue.scope}:${issue.module ?? ""}|${issue.rule_id}`;
    groups.set(key, [...(groups.get(key) ?? []), issue]);
  }

  const rows = [...groups.values()]
    .map((group) => {
      const worst = group.reduce((a, b) => (IMPACT_RANK[b.impact] > IMPACT_RANK[a.impact] ? b : a));
      const pages = [...new Set(group.flatMap((i) => i.pages))];
      return { group, worst, pages, order: moduleOrder.get(`${worst.scope}:${worst.module ?? ""}`) ?? Infinity };
    })
    .sort((a, b) => a.order - b.order || IMPACT_RANK[b.worst.impact] - IMPACT_RANK[a.worst.impact]);

  return toCsv(
    [
      "Title",
      "Priority",
      "Severity",
      "Module",
      "Where to fix",
      "Rule",
      "Elements",
      "Pages affected",
      "Found at",
      "Description",
      "Suggested fix",
      "Code snippet",
      "Example failing HTML",
      "Rule reference",
      "Affected pages",
    ],
    rows.map(({ group, worst, pages }): Cell[] => {
      const label = moduleLabel(worst.scope, worst.module);
      return [
        `[${label}] ${worst.help}`,
        PRIORITY[worst.impact],
        worst.impact,
        label,
        WHERE_TO_FIX[worst.scope],
        worst.rule_id,
        group.length,
        pages.length,
        foundAt(group),
        `${worst.help}. ${group.length} failing ${group.length === 1 ? "element" : "elements"} across ${pages.length} ${pages.length === 1 ? "page" : "pages"}.`,
        fixText(worst.fix),
        worst.fix.snippet?.code ?? "",
        worst.html,
        worst.help_url,
        pageList(pages),
      ];
    }),
  );
}

/** "desktop, mobile": the widths any issue in the group was found at. */
function foundAt(group: IssueRow[]): string {
  return (["desktop", "mobile"] as const).filter((v) => group.some((i) => i.viewports.includes(v))).join(", ");
}

export function imagesCsv(images: ImageRow[]): string {
  const order = { critical: 0, serious: 1, minor: 2 };
  const sorted = [...images].sort((a, b) => order[a.severity] - order[b.severity] || b.pages.length - a.pages.length);
  return toCsv(
    ["Severity", "Problems", "Current alt", "Image URL", "Module", "Where to fix", "Pages affected", "Suggested fix", "Pages"],
    sorted.map((img): Cell[] => [
      img.severity,
      img.checks.map((c) => ALT_CHECK_LABEL[c] ?? c).join("; "),
      img.alt === null ? "(no alt attribute)" : img.alt,
      img.src,
      moduleLabel(img.scope, img.module),
      WHERE_TO_FIX[img.scope],
      img.pages.length,
      img.fixes.map(fixText).join("\n\n"),
      pageList(img.pages),
    ]),
  );
}

export function linksCsv(links: LinkRow[]): string {
  return toCsv(
    ["Problem", "URL", "Redirect hops", "Final status", "Link text", "Module", "Pages affected", "Likely replacement", "Why", "Suggested fix", "Redirect row (HubSpot import)", "Found on"],
    links.map((l): Cell[] => [
      LINK_CHECK_LABEL[l.check] ?? l.check,
      l.url,
      l.hops.map((h) => `${h.status} ${h.url}`).join("\n"),
      l.final_status ?? l.error ?? "",
      l.text,
      moduleLabel(l.scope, l.module),
      l.pages.length,
      l.replacement?.url ?? "",
      l.replacement?.reason ?? "",
      fixText(l.fix),
      l.fix.snippet?.lang === "text" ? l.fix.snippet.code.split("\n").slice(1).join("\n") : "",
      pageList(l.pages),
    ]),
  );
}

// HubSpot's bulk redirect import: the columns of its sample file, at most 500 rows and 140-character URLs
// (one bad row fails the whole import). Mirrors redirectRow in apps/worker/src/fixes.ts.
const REDIRECT_HEADER = ["original url", "redirect to", "redirect type", "redirect style", "priority", "match query strings", "ignore trailing slash", "ignore protocol", "disable if page exists", "note"];
export const MAX_REDIRECT_ROWS = 500;
const MAX_REDIRECT_URL = 140;

function pathAndQuery(u: string): string {
  const url = new URL(u);
  return url.pathname + url.search;
}

/** Redirects worth adding for this scan's internal links: dead URL → likely replacement, chain start → final URL. */
export function redirectRows(links: LinkRow[]): { from: string; to: string; note: string }[] {
  const rows = new Map<string, { from: string; to: string; note: string }>();
  for (const l of links) {
    let to: string | undefined;
    let note = "";
    if ((l.check === "broken" || l.check === "redirect-to-dead") && l.replacement) {
      to = l.replacement.url;
      note = l.check === "broken" ? "Broken link found by site audit" : "Redirect to a dead page fixed by site audit";
    } else if (l.check === "redirect-chain" && l.hops.length > 2) {
      to = l.hops.at(-1)!.url;
      note = "Redirect chain shortened by site audit";
    }
    if (!to) continue;
    const from = pathAndQuery(l.url);
    // Same old URL linked from several modules: one row. A chain fix and a dead-page fix for one URL can't both be right; the dead-page one wins.
    if (!rows.has(from) || l.check !== "redirect-chain") rows.set(from, { from, to: pathAndQuery(to), note });
  }
  return [...rows.values()];
}

type RedirectRow = { from: string; to: string; note: string };

/** Rows HubSpot would accept: URLs up to 140 characters, and never a redirect away from the home page. */
export function importableRedirects(rows: RedirectRow[]): RedirectRow[] {
  return rows.filter((r) => r.from !== "/" && r.from.length <= MAX_REDIRECT_URL && r.to.length <= MAX_REDIRECT_URL);
}

/**
 * Ready for HubSpot > Domains & URLs > URL redirects > Import, 500 rows per file (part 1, 2, …).
 * A row whose old URL has a query string (WordPress ?p=123) only matches that query string,
 * so it can't catch the bare path too.
 */
function redirectImportCsv(rows: RedirectRow[], part = 1): string {
  const slice = importableRedirects(rows).slice((part - 1) * MAX_REDIRECT_ROWS, part * MAX_REDIRECT_ROWS);
  return toCsv(
    REDIRECT_HEADER,
    slice.map((r): Cell[] => [r.from, r.to, "STANDARD", "301", "", r.from.includes("?") ? "TRUE" : "FALSE", "TRUE", "TRUE", "TRUE", r.note]),
    { bom: false },
  );
}

/** This scan's link redirects. Rows HubSpot would reject (URL over 140 characters) are left out. */
export function redirectsCsv(links: LinkRow[]): string {
  return redirectImportCsv(redirectRows(links));
}

// ---------- Old-URL redirect check ----------

/** Redirects an old-URL check calls for: missing or misdirected old URL → likely new page, chain start → final URL. */
export function oldUrlRedirectRows(rows: OldUrlRow[]): RedirectRow[] {
  const out: RedirectRow[] = [];
  for (const r of rows) {
    if (r.status === "redirect-chain") {
      out.push({ from: pathAndQuery(r.checked_url), to: pathAndQuery(r.hops.at(-1)!.url), note: "Redirect chain shortened by site audit" });
    } else if (r.replacement && (r.status === "missing" || r.status === "redirect-to-dead" || r.status === "redirect-home")) {
      const note = { missing: "Old URL with no redirect", "redirect-to-dead": "Old URL redirected to a dead page", "redirect-home": "Old URL went to the home page" }[r.status];
      out.push({ from: pathAndQuery(r.checked_url), to: pathAndQuery(r.replacement.url), note: `${note}, found by site audit` });
    }
  }
  return out;
}

export function oldUrlRedirectsCsv(rows: OldUrlRow[], part = 1): string {
  return redirectImportCsv(oldUrlRedirectRows(rows), part);
}

/** Every old URL with its result, problems first. */
export function oldUrlsCsv(rows: OldUrlRow[]): string {
  const rank = (r: OldUrlRow) => OLD_URL_ORDER.indexOf(r.status);
  return toCsv(
    ["Result", "Old URL", "Checked at", "Redirect hops", "Final status", "Likely new page", "Why"],
    [...rows]
      .sort((a, b) => rank(a) - rank(b) || a.id - b.id)
      .map((r): Cell[] => [
        OLD_URL_LABEL[r.status] ?? r.status,
        r.url,
        r.checked_url,
        r.hops.map((h) => `${h.status} ${h.url}`).join("\n"),
        r.final_status ?? r.error ?? "",
        r.replacement?.url ?? "",
        r.replacement?.reason ?? "",
      ]),
  );
}

export function securityCsv(checks: SecurityRow[]): string {
  const sorted = [...checks].sort((a, b) => Number(a.pass) - Number(b.pass));
  return toCsv(
    ["Check", "Result", "Current value", "Recommended value", "Where to fix", "Suggested fix"],
    sorted.map((c): Cell[] => [c.name, c.pass ? "Pass" : "Fail", c.current, c.recommended, c.fix_location, fixText(c.fix)]),
  );
}

export function mixedContentCsv(rows: MixedContentRow[]): string {
  return toCsv(
    ["Resource type", "Blocked by browsers", "URL", "Module", "Where to fix", "Pages affected", "Suggested fix", "Found on"],
    rows.map((m): Cell[] => [
      m.kind,
      m.blocked ? "Yes" : "No (upgraded or warned)",
      m.url,
      moduleLabel(m.scope, m.module),
      WHERE_TO_FIX[m.scope],
      m.pages.length,
      fixText(m.fix),
      pageList(m.pages),
    ]),
  );
}

export function scriptsCsv(rows: ScriptDomainRow[]): string {
  return toCsv(
    ["Domain", "Pages", "Example scripts", "Found on"],
    rows.map((s): Cell[] => [s.domain, s.pages.length, s.urls.join("\n"), pageList(s.pages)]),
  );
}

export function librariesCsv(rows: JsLibraryRow[]): string {
  return toCsv(
    ["Library", "Version", "Worst severity", "Known vulnerabilities", "CVEs", "Script URLs", "Pages", "Suggested fix", "Found on"],
    rows.map((l): Cell[] => [
      l.component,
      l.version,
      l.severity ?? "None known",
      l.vulnerabilities.map((v) => `${v.severity}: ${v.summary}`).join("\n"),
      l.vulnerabilities.flatMap((v) => v.cves).join(", "),
      l.urls.join("\n"),
      l.pages.length,
      l.fix ? fixText(l.fix) : "",
      pageList(l.pages),
    ]),
  );
}

/** One row per axe rule with its WCAG criteria: a conformance summary. */
export function rulesCsv(issues: IssueRow[]): string {
  return toCsv(
    ["WCAG criteria", "Level", "Rule", "Description", "Worst severity", "Issues", "Pages affected", "Where (module: pages)", "Reference"],
    summarizeRules(issues).map((r): Cell[] => [
      r.criteria.length ? r.criteria.map((c) => `${c} ${WCAG_SC[c]?.name ?? ""}`.trim()).join("\n") : "Best practice",
      [...new Set(r.criteria.map((c) => WCAG_SC[c]?.level).filter(Boolean))].join(" / "),
      r.rule_id,
      r.help,
      r.worst_impact,
      r.issue_count,
      r.pages_affected,
      r.modules.map((m) => `${m.label}: ${m.pages}`).join("\n"),
      r.help_url,
    ]),
  );
}

/** One row per form problem (a check on a field, or on the whole form); forms with none get one row. */
export function formsCsv(forms: FormRow[]): string {
  const rows: Cell[][] = [];
  for (const f of forms) {
    const status = f.status === "checked" ? (f.submitted ? "Checked, submitted empty" : "Checked") : "Not checked";
    const form: Cell[] = [f.label ?? f.form_id, f.form_id, moduleLabel(f.scope, f.module), status];
    const where: Cell[] = [f.pages.length, pageList(f.pages)];
    if (!f.findings.length) rows.push([...form, "", "", "", f.note ?? "No problems found", "", ...where]);
    for (const x of f.findings) {
      rows.push([
        ...form,
        FORM_CHECK_LABEL[x.check] ?? x.check,
        FORM_CHECK_IMPACT[x.check] ?? "",
        x.field ?? "(whole form)",
        x.detail,
        fixText(f.fixes[x.check]),
        ...where,
      ]);
    }
  }
  return toCsv(["Form", "Form ID", "Module", "Status", "Problem", "Severity", "Field", "Detail", "Suggested fix", "Pages", "Found on"], rows);
}

export function exportFilename(domain: string, createdAt: string, kind: ExportKind): string {
  const date = createdAt.slice(0, 10);
  return `${domain.replace(/[^a-z0-9.-]/gi, "_")}-${date}-${kind}.csv`;
}
