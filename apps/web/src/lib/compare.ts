// Compare two scans of the same site by issue fingerprint (rule + module + element path).
import type { Impact, IssueMark, IssueRow } from "./types";

export type CompareStatus = "fixed" | "new" | "open" | "not_rechecked";

export type CompareIssue = Pick<IssueRow, "fingerprint" | "rule_id" | "help" | "impact" | "scope" | "module" | "pages">;

export interface ComparedIssue extends CompareIssue {
  status: CompareStatus;
  /** Pages it was on in the older scan (empty for new issues). */
  basePages: string[];
  mark?: IssueMark;
}

export interface Comparison {
  fixed: ComparedIssue[];
  new: ComparedIssue[];
  open: ComparedIssue[];
  /** Gone from the newer scan, but none of its pages were scanned again (page limit or path filters changed). */
  notRechecked: ComparedIssue[];
  /** Marked won't fix / false positive: kept out of the counts above. */
  hidden: ComparedIssue[];
}

const IMPACT_RANK: Record<Impact, number> = { critical: 4, serious: 3, moderate: 2, minor: 1 };

export function compareRuns(
  base: CompareIssue[],
  head: CompareIssue[],
  headScannedPages: string[],
  marks: IssueMark[] = [],
): Comparison {
  const baseByFp = new Map(base.map((i) => [i.fingerprint, i]));
  const headByFp = new Map(head.map((i) => [i.fingerprint, i]));
  const scanned = new Set(headScannedPages);
  const markByFp = new Map(marks.map((m) => [m.fingerprint, m]));
  const result: Comparison = { fixed: [], new: [], open: [], notRechecked: [], hidden: [] };

  const place = (issue: ComparedIssue) => {
    const mark = markByFp.get(issue.fingerprint);
    if (mark) result.hidden.push({ ...issue, mark });
    else if (issue.status === "not_rechecked") result.notRechecked.push(issue);
    else result[issue.status].push(issue);
  };

  for (const h of head) {
    const b = baseByFp.get(h.fingerprint);
    place({ ...h, status: b ? "open" : "new", basePages: b?.pages ?? [] });
  }
  for (const b of base) {
    if (headByFp.has(b.fingerprint)) continue;
    // Only call it fixed if the newer scan looked at a page where it used to be.
    const rechecked = b.pages.some((p) => scanned.has(p));
    place({ ...b, status: rechecked ? "fixed" : "not_rechecked", basePages: b.pages });
  }

  const order = (a: ComparedIssue, b: ComparedIssue) =>
    IMPACT_RANK[b.impact] - IMPACT_RANK[a.impact] || b.pages.length - a.pages.length;
  for (const list of Object.values(result)) list.sort(order);
  return result;
}
