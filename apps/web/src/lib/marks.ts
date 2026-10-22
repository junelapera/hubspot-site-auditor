"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import type { IssueMarkKind } from "@/lib/types";

export type MarkState = { error?: string };

const KINDS: IssueMarkKind[] = ["wont_fix", "false_positive"];

/** Mark (or re-mark) an issue for a site. It stays hidden in later scans until unmarked. */
export async function markIssue(siteId: string, fingerprint: string, _prev: MarkState, formData: FormData): Promise<MarkState> {
  const { supabase, user } = await requireUser();
  const kind = String(formData.get("kind") ?? "") as IssueMarkKind;
  const note = String(formData.get("note") ?? "").trim();
  if (!KINDS.includes(kind)) return { error: "Choose won't fix or false positive." };
  if (note.length > 1000) return { error: "Keep the note under 1,000 characters." };

  const { error } = await supabase
    .from("issue_marks")
    .upsert(
      { site_id: siteId, fingerprint, kind, note, created_by: user.id, updated_at: new Date().toISOString() },
      { onConflict: "site_id,fingerprint" },
    );
  if (error) return { error: error.message };

  revalidatePath("/runs/[id]", "page");
  return {};
}

export async function unmarkIssue(siteId: string, fingerprint: string): Promise<MarkState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("issue_marks").delete().eq("site_id", siteId).eq("fingerprint", fingerprint);
  if (error) return { error: error.message };

  revalidatePath("/runs/[id]", "page");
  return {};
}
