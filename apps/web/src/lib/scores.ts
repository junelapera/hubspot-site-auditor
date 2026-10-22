// Per-scan accessibility score (0-100) and security grade (A-F), so progress shows over time.
// Computed when a page is shown rather than stored, so marked issues are left out
// the same way as everywhere else, and older scans get a score too.
import type { Impact, IssueRow, SecurityRow } from "./types";

/** Points a page loses for each issue on it. */
export const IMPACT_PENALTY: Record<Impact, number> = { critical: 15, serious: 8, moderate: 3, minor: 1 };

/**
 * Average page score: each scanned page starts at 100 and loses points per issue
 * on it (floor 0). Averaging over pages keeps the score comparable when the page
 * limit changes. Axe issues only; alt-text quality checks are heuristics and stay out.
 * Returns null when no page was scanned.
 */
export function accessibilityScore(issues: Pick<IssueRow, "impact" | "pages">[], pagesScanned: number): number | null {
  if (pagesScanned <= 0) return null;
  const lost = new Map<string, number>();
  for (const i of issues) for (const url of i.pages) lost.set(url, (lost.get(url) ?? 0) + IMPACT_PENALTY[i.impact]);
  let total = Math.max(0, pagesScanned - lost.size) * 100;
  for (const points of lost.values()) total += Math.max(0, 100 - points);
  return Math.round(total / pagesScanned);
}

/** Points lost per failed security check. Checks not listed here lose 5. */
export const SECURITY_PENALTY: Record<string, number> = {
  "tls-legacy": 20,
  "tls-cert-expiry": 20,
  "https-redirect": 10,
  hsts: 10,
  "header-csp": 10,
  "header-x-frame-options": 10,
  "mixed-content": 10,
  "header-x-content-type-options": 5,
  "header-referrer-policy": 5,
  "header-permissions-policy": 5,
  "version-leak": 5,
  cookies: 5,
};

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface SecurityGrade {
  grade: Grade;
  points: number;
}

/** 100 minus the points for each failed check; A 90+, B 80+, C 70+, D 60+, else F. Null without results. */
export function securityGrade(checks: Pick<SecurityRow, "check_id" | "pass">[]): SecurityGrade | null {
  if (!checks.length) return null;
  const points = Math.max(0, 100 - checks.reduce((sum, c) => sum + (c.pass ? 0 : (SECURITY_PENALTY[c.check_id] ?? 5)), 0));
  const grade: Grade = points >= 90 ? "A" : points >= 80 ? "B" : points >= 70 ? "C" : points >= 60 ? "D" : "F";
  return { grade, points };
}
