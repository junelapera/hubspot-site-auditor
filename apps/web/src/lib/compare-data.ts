import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { compareRuns, type Comparison } from "./compare";
import type { IssueMark, Run } from "./types";

const ISSUE_FIELDS = "fingerprint, rule_id, help, impact, scope, module, pages";

/** The most recent finished scan of the same site before this one. */
export async function previousRun(supabase: SupabaseClient, run: Pick<Run, "site_id" | "created_at">) {
  const { data } = await supabase
    .from("runs")
    .select("id, created_at")
    .eq("site_id", run.site_id)
    .eq("status", "done")
    .lt("created_at", run.created_at)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Pick<Run, "id" | "created_at">>();
  return data;
}

/** Compare an older scan (base) with a newer one (head), honouring the site's marks. Read as the user (RLS). */
export async function loadComparison(supabase: SupabaseClient, siteId: string, baseId: string, headId: string): Promise<Comparison> {
  const [base, head, pages, marks] = await Promise.all([
    supabase.from("issues").select(ISSUE_FIELDS).eq("run_id", baseId),
    supabase.from("issues").select(ISSUE_FIELDS).eq("run_id", headId),
    supabase.from("pages").select("url").eq("run_id", headId).is("error", null),
    supabase.from("issue_marks").select("*").eq("site_id", siteId).returns<IssueMark[]>(),
  ]);
  for (const r of [base, head, pages, marks]) if (r.error) throw r.error;
  return compareRuns(base.data ?? [], head.data ?? [], (pages.data ?? []).map((p) => p.url), marks.data ?? []);
}
