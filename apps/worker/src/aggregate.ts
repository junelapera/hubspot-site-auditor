import { createHash } from "node:crypto";
import type { Impact, Issue, ModuleSummary, PageResult, Scope, Viewport } from "./types.js";

export const IMPACT_RANK: Record<Impact, number> = { critical: 4, serious: 3, moderate: 2, minor: 1 };

/**
 * Stable across runs and pages: rule + where the element lives + its tag/class path.
 * Phase 2 run comparison (fixed / new / still open) depends on this not changing.
 */
export function fingerprint(ruleId: string, scope: Scope, module: string | null, path: string): string {
  return createHash("sha1").update([ruleId, scope, module ?? "", path].join("|")).digest("hex").slice(0, 16);
}

export function moduleKey(scope: Scope, module: string | null): string {
  return `${scope}:${module ?? ""}`;
}

export function moduleLabel(scope: Scope, module: string | null): string {
  if (scope === "embed") return `Embed: ${module}`;
  if (module) return scope === "global" ? `${module} (global)` : module;
  if (scope === "global") return "Global (header/footer)";
  if (scope === "template") return "Template";
  return "Unknown";
}

export function dedupeIssues(pages: PageResult[]): Issue[] {
  const byFingerprint = new Map<string, Issue>();

  for (const page of pages) {
    for (const f of page.findings) {
      const { scope, module, named, partial, path } = f.location;
      const fp = fingerprint(f.ruleId, scope, module, path);
      const existing = byFingerprint.get(fp);

      if (existing) {
        if (!existing.pages.includes(page.url)) existing.pages.push(page.url);
        if (!existing.viewports.includes(f.viewport)) existing.viewports.push(f.viewport);
        if (IMPACT_RANK[f.impact] > IMPACT_RANK[existing.impact]) existing.impact = f.impact;
        continue;
      }

      byFingerprint.set(fp, {
        fingerprint: fp,
        ruleId: f.ruleId,
        impact: f.impact,
        help: f.help,
        helpUrl: f.helpUrl,
        tags: f.tags,
        scope,
        module,
        named,
        partial,
        path,
        html: f.html,
        failureSummary: f.failureSummary,
        pages: [page.url],
        viewports: [f.viewport],
      });
    }
  }

  // Same order in every scan, whichever width found it first.
  const ORDER: Viewport[] = ["desktop", "mobile"];
  for (const issue of byFingerprint.values()) issue.viewports.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  return [...byFingerprint.values()];
}

/** Module list sorted by impact: the first row is the fix that clears the most issues. */
export function summarizeModules(issues: Issue[]): ModuleSummary[] {
  const groups = new Map<string, Issue[]>();
  for (const issue of issues) {
    const key = moduleKey(issue.scope, issue.module);
    groups.set(key, [...(groups.get(key) ?? []), issue]);
  }

  // Impact = how many page-level occurrences one fix clears, weighted by severity.
  const weights = new Map<string, number>();
  for (const [key, group] of groups) {
    weights.set(key, group.reduce((sum, i) => sum + i.pages.length * IMPACT_RANK[i.impact], 0));
  }

  return [...groups.entries()]
    .map(([key, group]): ModuleSummary => {
      const { scope, module, named } = group[0];
      return {
        key,
        label: moduleLabel(scope, module),
        scope,
        named,
        issueCount: group.length,
        worstImpact: group.reduce<Impact>(
          (worst, i) => (IMPACT_RANK[i.impact] > IMPACT_RANK[worst] ? i.impact : worst),
          "minor",
        ),
        pagesAffected: new Set(group.flatMap((i) => i.pages)).size,
        rules: [...new Set(group.map((i) => i.ruleId))],
      };
    })
    .sort((a, b) => weights.get(b.key)! - weights.get(a.key)!);
}

/** Share of issues mapped to a named module — PRD target is 90%+. */
export function namedModuleRate(issues: Issue[]): number {
  const inModules = issues.filter((i) => i.scope === "module" || (i.scope === "global" && i.module));
  if (!inModules.length) return 1;
  return inModules.filter((i) => i.named).length / inModules.length;
}
