"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { triggerScanWorker } from "@/lib/dispatch";
import { requireUser } from "@/lib/supabase/server";

export type FormState = { error?: string };

function parseDomain(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function parseGlobs(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function addSite(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireUser();
  const domain = parseDomain(String(formData.get("domain") ?? ""));
  if (!domain || !domain.includes(".")) return { error: "Enter a domain like www.example.com" };

  const name = String(formData.get("name") ?? "").trim() || null;
  const { data, error } = await supabase.from("sites").insert({ domain, name }).select("id").single();
  if (error) {
    return { error: error.code === "23505" ? `${domain} is already added.` : error.message };
  }
  redirect(`/sites/${data.id}`);
}

export async function updateSiteSettings(siteId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireUser();
  const pageLimit = Number(formData.get("page_limit"));
  if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 5000) {
    return { error: "Page limit must be a whole number between 1 and 5000." };
  }

  const { error } = await supabase
    .from("sites")
    .update({
      page_limit: pageLimit,
      include_paths: parseGlobs(formData.get("include_paths")),
      exclude_paths: parseGlobs(formData.get("exclude_paths")),
    })
    .eq("id", siteId);
  if (error) return { error: error.message };

  revalidatePath(`/sites/${siteId}`);
  return {};
}

export async function queueRun(siteId: string): Promise<FormState> {
  const { supabase } = await requireUser();

  // One scan per site at a time, so a double-click doesn't queue two.
  const { count } = await supabase
    .from("runs")
    .select("id", { count: "exact", head: true })
    .eq("site_id", siteId)
    .in("status", ["queued", "running"]);
  if (count) return { error: "A scan is already queued or running for this site." };

  const { error } = await supabase.from("runs").insert({ site_id: siteId });
  if (error) return { error: error.message };
  await triggerScanWorker();

  revalidatePath(`/sites/${siteId}`);
  return {};
}
