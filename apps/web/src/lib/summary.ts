// Module list for a set of issues: one row per module, sorted by impact
// (pages affected x severity), so the first row is the fix that clears the most.
// Computed in code rather than the module_summary view so marked issues can be left out.
import type { Impact, IssueRow, ModuleSummaryRow } from "./types";

const RANK: Record<Impact, number> = { critical: 4, serious: 3, moderate: 2, minor: 1 };

type SummaryInput = Pick<IssueRow, "scope" | "module" | "named" | "impact" | "rule_id" | "pages">;

export function moduleKey(i: { scope: string; module: string | null }) {
  return `${i.scope}:${i.module ?? ""}`;
}

export function summarizeModules(issues: SummaryInput[], runId = ""): ModuleSummaryRow[] {
  const groups = new Map<string, SummaryInput[]>();
  for (const i of issues) groups.set(moduleKey(i), [...(groups.get(moduleKey(i)) ?? []), i]);

  return [...groups.values()]
    .map((g): ModuleSummaryRow => ({
      run_id: runId,
      scope: g[0].scope,
      module: g[0].module,
      named: g.every((i) => i.named),
      issue_count: g.length,
      worst_impact: g.reduce<Impact>((w, i) => (RANK[i.impact] > RANK[w] ? i.impact : w), "minor"),
      pages_affected: new Set(g.flatMap((i) => i.pages)).size,
      rules: [...new Set(g.map((i) => i.rule_id))],
      weight: g.reduce((sum, i) => sum + i.pages.length * RANK[i.impact], 0),
    }))
    .sort((a, b) => b.weight - a.weight);
}
