"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { triggerScanWorker } from "@/lib/dispatch";
import { requireUser } from "@/lib/supabase/server";
import { MAX_LISTED_URLS, parseUrlList } from "@/lib/url-list";

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

type RunOptions = { urls?: string[]; extraUrls?: string[] };

async function insertRun(siteId: string, options: RunOptions = {}): Promise<FormState> {
  const { supabase } = await requireUser();

  // One scan per site at a time, so a double-click doesn't queue two.
  const { count } = await supabase
    .from("runs")
    .select("id", { count: "exact", head: true })
    .eq("site_id", siteId)
    .in("status", ["queued", "running"]);
  if (count) return { error: "A scan is already queued or running for this site." };

  const { error } = await supabase.from("runs").insert({ site_id: siteId, options });
  if (error) return { error: error.message };
  await triggerScanWorker();

  revalidatePath(`/sites/${siteId}`);
  return {};
}

export async function queueRun(siteId: string): Promise<FormState> {
  return insertRun(siteId);
}

/** The pasted text and mode come back with an error, so the form can show them again after React resets it. */
export type ListedRunState = FormState & { text?: string; mode?: "only" | "add" };

/** Scan a pasted list of pages: instead of the sitemap, or on top of it. */
export async function queueListedRun(siteId: string, _prev: ListedRunState, formData: FormData): Promise<ListedRunState> {
  const { supabase } = await requireUser();
  const text = String(formData.get("urls") ?? "");
  const mode = formData.get("mode") === "add" ? "add" : "only";
  const fail = (error: string): ListedRunState => ({ error, text, mode });

  const { data: site } = await supabase.from("sites").select("domain").eq("id", siteId).maybeSingle<{ domain: string }>();
  if (!site) return fail("Site not found.");

  const { urls, rejected } = parseUrlList(text, site.domain);
  if (rejected.length) {
    const shown = rejected.slice(0, 3).map((r) => `“${r.line}” (${r.reason})`).join(", ");
    return fail(`Fix or remove ${rejected.length === 1 ? "this line" : `these ${rejected.length} lines`}: ${shown}${rejected.length > 3 ? ", …" : ""}.`);
  }
  if (!urls.length) return fail("Enter at least one URL or path, like /about.");
  if (urls.length > MAX_LISTED_URLS) return fail(`That's ${urls.length} pages; the limit is ${MAX_LISTED_URLS} per scan.`);

  const result = await insertRun(siteId, mode === "add" ? { extraUrls: urls } : { urls });
  return result.error ? fail(result.error) : {};
}
