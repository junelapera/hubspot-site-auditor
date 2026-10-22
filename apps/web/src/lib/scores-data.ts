import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { accessibilityScore, securityGrade, type SecurityGrade } from "./scores";
import type { Impact, Run } from "./types";

export interface RunScores {
  accessibility: number | null;
  security: SecurityGrade | null;
}

const PAGE = 1000; // PostgREST's default row cap per request

/** Scores for finished scans of one site, leaving out the site's marked issues. Read as the user (RLS). */
export async function loadRunScores(
  supabase: SupabaseClient,
  siteId: string,
  runs: Pick<Run, "id" | "status" | "summary">[],
): Promise<Map<string, RunScores>> {
  const done = runs.filter((r) => r.status === "done" && r.summary);
  if (!done.length) return new Map();
  const ids = done.map((r) => r.id);

  const [issues, checks, marks] = await Promise.all([
    selectAll<{ run_id: string; fingerprint: string; impact: Impact; pages: string[] }>((from, to) =>
      supabase.from("issues").select("run_id, fingerprint, impact, pages").in("run_id", ids).order("id").range(from, to),
    ),
    selectAll<{ run_id: string; check_id: string; pass: boolean }>((from, to) =>
      supabase.from("security_checks").select("run_id, check_id, pass").in("run_id", ids).order("id").range(from, to),
    ),
    supabase.from("issue_marks").select("fingerprint").eq("site_id", siteId),
  ]);
  if (marks.error) throw marks.error;
  const marked = new Set((marks.data ?? []).map((m) => m.fingerprint));

  return new Map(
    done.map((run) => [
      run.id,
      {
        accessibility: accessibilityScore(
          issues.filter((i) => i.run_id === run.id && !marked.has(i.fingerprint)),
          run.summary!.pagesScanned,
        ),
        security: securityGrade(checks.filter((c) => c.run_id === run.id)),
      },
    ]),
  );
}

async function selectAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: Error | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}
