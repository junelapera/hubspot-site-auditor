// Issues grouped by axe rule and WCAG success criterion, for conformance summaries.
import { moduleLabel } from "./format";
import type { Impact, IssueRow } from "./types";

const RANK: Record<Impact, number> = { critical: 4, serious: 3, moderate: 2, minor: 1 };

/** WCAG 2.2 level A and AA success criteria. */
export const WCAG_SC: Record<string, { name: string; level: "A" | "AA" }> = {
  "1.1.1": { name: "Non-text Content", level: "A" },
  "1.2.1": { name: "Audio-only and Video-only (Prerecorded)", level: "A" },
  "1.2.2": { name: "Captions (Prerecorded)", level: "A" },
  "1.2.3": { name: "Audio Description or Media Alternative (Prerecorded)", level: "A" },
  "1.2.4": { name: "Captions (Live)", level: "AA" },
  "1.2.5": { name: "Audio Description (Prerecorded)", level: "AA" },
  "1.3.1": { name: "Info and Relationships", level: "A" },
  "1.3.2": { name: "Meaningful Sequence", level: "A" },
  "1.3.3": { name: "Sensory Characteristics", level: "A" },
  "1.3.4": { name: "Orientation", level: "AA" },
  "1.3.5": { name: "Identify Input Purpose", level: "AA" },
  "1.4.1": { name: "Use of Color", level: "A" },
  "1.4.2": { name: "Audio Control", level: "A" },
  "1.4.3": { name: "Contrast (Minimum)", level: "AA" },
  "1.4.4": { name: "Resize Text", level: "AA" },
  "1.4.5": { name: "Images of Text", level: "AA" },
  "1.4.10": { name: "Reflow", level: "AA" },
  "1.4.11": { name: "Non-text Contrast", level: "AA" },
  "1.4.12": { name: "Text Spacing", level: "AA" },
  "1.4.13": { name: "Content on Hover or Focus", level: "AA" },
  "2.1.1": { name: "Keyboard", level: "A" },
  "2.1.2": { name: "No Keyboard Trap", level: "A" },
  "2.1.4": { name: "Character Key Shortcuts", level: "A" },
  "2.2.1": { name: "Timing Adjustable", level: "A" },
  "2.2.2": { name: "Pause, Stop, Hide", level: "A" },
  "2.3.1": { name: "Three Flashes or Below Threshold", level: "A" },
  "2.4.1": { name: "Bypass Blocks", level: "A" },
  "2.4.2": { name: "Page Titled", level: "A" },
  "2.4.3": { name: "Focus Order", level: "A" },
  "2.4.4": { name: "Link Purpose (In Context)", level: "A" },
  "2.4.5": { name: "Multiple Ways", level: "AA" },
  "2.4.6": { name: "Headings and Labels", level: "AA" },
  "2.4.7": { name: "Focus Visible", level: "AA" },
  "2.4.11": { name: "Focus Not Obscured (Minimum)", level: "AA" },
  "2.5.1": { name: "Pointer Gestures", level: "A" },
  "2.5.2": { name: "Pointer Cancellation", level: "A" },
  "2.5.3": { name: "Label in Name", level: "A" },
  "2.5.4": { name: "Motion Actuation", level: "A" },
  "2.5.7": { name: "Dragging Movements", level: "AA" },
  "2.5.8": { name: "Target Size (Minimum)", level: "AA" },
  "3.1.1": { name: "Language of Page", level: "A" },
  "3.1.2": { name: "Language of Parts", level: "AA" },
  "3.2.1": { name: "On Focus", level: "A" },
  "3.2.2": { name: "On Input", level: "A" },
  "3.2.3": { name: "Consistent Navigation", level: "AA" },
  "3.2.4": { name: "Consistent Identification", level: "AA" },
  "3.2.6": { name: "Consistent Help", level: "A" },
  "3.3.1": { name: "Error Identification", level: "A" },
  "3.3.2": { name: "Labels or Instructions", level: "A" },
  "3.3.3": { name: "Error Suggestion", level: "AA" },
  "3.3.4": { name: "Error Prevention (Legal, Financial, Data)", level: "AA" },
  "3.3.7": { name: "Redundant Entry", level: "A" },
  "3.3.8": { name: "Accessible Authentication (Minimum)", level: "AA" },
  "4.1.2": { name: "Name, Role, Value", level: "A" },
  "4.1.3": { name: "Status Messages", level: "AA" },
};

/** axe tags like "wcag143" → "1.4.3". */
export function criteriaFromTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => /^wcag(\d)(\d)(\d+)$/.exec(t)).filter((m) => m !== null).map((m) => `${m[1]}.${m[2]}.${m[3]}`))];
}

function compareSc(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
}

type RuleInput = Pick<IssueRow, "rule_id" | "help" | "help_url" | "tags" | "impact" | "scope" | "module" | "pages">;

export interface RuleSummary {
  rule_id: string;
  help: string;
  help_url: string;
  /** WCAG success criteria; empty for axe best-practice rules. */
  criteria: string[];
  worst_impact: Impact;
  issue_count: number;
  pages_affected: number;
  /** Where the issues are, most pages first. */
  modules: { label: string; issues: number; pages: number }[];
}

/** One row per axe rule, in WCAG order (best-practice rules last). */
export function summarizeRules(issues: RuleInput[]): RuleSummary[] {
  const groups = new Map<string, RuleInput[]>();
  for (const i of issues) groups.set(i.rule_id, [...(groups.get(i.rule_id) ?? []), i]);

  return [...groups.values()]
    .map((g): RuleSummary => {
      const byModule = new Map<string, RuleInput[]>();
      for (const i of g) {
        const label = moduleLabel(i.scope, i.module);
        byModule.set(label, [...(byModule.get(label) ?? []), i]);
      }
      return {
        rule_id: g[0].rule_id,
        help: g[0].help,
        help_url: g[0].help_url,
        criteria: criteriaFromTags(g.flatMap((i) => i.tags ?? [])).sort(compareSc),
        worst_impact: g.reduce<Impact>((w, i) => (RANK[i.impact] > RANK[w] ? i.impact : w), "minor"),
        issue_count: g.length,
        pages_affected: new Set(g.flatMap((i) => i.pages)).size,
        modules: [...byModule.entries()]
          .map(([label, m]) => ({ label, issues: m.length, pages: new Set(m.flatMap((i) => i.pages)).size }))
          .sort((a, b) => b.pages - a.pages || a.label.localeCompare(b.label)),
      };
    })
    .sort((a, b) => {
      if (!a.criteria.length || !b.criteria.length) return a.criteria.length ? -1 : b.criteria.length ? 1 : a.rule_id.localeCompare(b.rule_id);
      return compareSc(a.criteria[0], b.criteria[0]) || RANK[b.worst_impact] - RANK[a.worst_impact];
    });
}
