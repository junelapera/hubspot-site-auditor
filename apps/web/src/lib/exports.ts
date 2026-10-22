// CSV exports for a run. Pure functions over database rows so they can be tested.
import { toCsv, type Cell } from "./csv";
import { ALT_CHECK_LABEL, LINK_CHECK_LABEL, moduleLabel } from "./format";
import type { Fix, Impact, ImageRow, IssueRow, LinkRow, ModuleSummaryRow, Scope, SecurityRow } from "./types";

export const EXPORT_KINDS = ["issues", "images", "links", "security"] as const;
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
    ["Problem", "URL", "Redirect hops", "Final status", "Link text", "Module", "Pages affected", "Suggested fix", "Redirect row (from,to)", "Found on"],
    links.map((l): Cell[] => [
      LINK_CHECK_LABEL[l.check] ?? l.check,
      l.url,
      l.hops.map((h) => `${h.status} ${h.url}`).join("\n"),
      l.final_status ?? l.error ?? "",
      l.text,
      moduleLabel(l.scope, l.module),
      l.pages.length,
      fixText(l.fix),
      l.fix.snippet?.lang === "text" ? l.fix.snippet.code.split("\n").slice(1).join("\n") : "",
      pageList(l.pages),
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

export function exportFilename(domain: string, createdAt: string, kind: ExportKind): string {
  const date = createdAt.slice(0, 10);
  return `${domain.replace(/[^a-z0-9.-]/gi, "_")}-${date}-${kind}.csv`;
}
