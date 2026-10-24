"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { triggerScanWorker } from "@/lib/dispatch";
import { requireUser } from "@/lib/supabase/server";
import { MAX_OLD_URLS, parseOldUrls } from "@/lib/old-urls";
import type { RunKind } from "@/lib/types";
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

type RunOptions = { urls?: string[]; extraUrls?: string[]; sample?: boolean; oldUrls?: string[] };

async function insertRun(siteId: string, options: RunOptions = {}, kind: RunKind = "audit"): Promise<FormState> {
  const { supabase } = await requireUser();

  // One scan per site at a time, so a double-click doesn't queue two.
  const { count } = await supabase
    .from("runs")
    .select("id", { count: "exact", head: true })
    .eq("site_id", siteId)
    .in("status", ["queued", "running"]);
  if (count) return { error: "A scan is already queued or running for this site." };

  const { error } = await supabase.from("runs").insert({ site_id: siteId, kind, options });
  if (error) return { error: error.message };
  await triggerScanWorker();

  revalidatePath(`/sites/${siteId}`);
  return {};
}

/** Delete a site with all its scans and marks. Typing the domain confirms it; refused while a scan is queued or running. */
export async function deleteSite(siteId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireUser();
  const { data: site } = await supabase.from("sites").select("domain").eq("id", siteId).maybeSingle<{ domain: string }>();
  if (!site) return { error: "Site not found." };
  if (String(formData.get("confirm") ?? "").trim().toLowerCase() !== site.domain) {
    return { error: `Type ${site.domain} exactly to confirm.` };
  }

  const busy = "A scan is queued or running for this site. Wait for it to finish, then delete the site.";
  const { count } = await supabase
    .from("runs")
    .select("id", { count: "exact", head: true })
    .eq("site_id", siteId)
    .in("status", ["queued", "running"]);
  if (count) return { error: busy };

  // RLS refuses the delete (0 rows) if a scan was queued in the meantime.
  const { data, error } = await supabase.from("sites").delete().eq("id", siteId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: busy };

  revalidatePath("/");
  redirect("/");
}

export async function queueRun(siteId: string): Promise<FormState> {
  return insertRun(siteId);
}

/** Read every page, then scan only enough pages to cover every module (up to the page limit). */
export async function queueSampledRun(siteId: string): Promise<FormState> {
  return insertRun(siteId, { sample: true });
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

export type OldUrlCheckState = FormState;

/** Old-URL redirect check: request each old URL's path on this site and report the ones without a working redirect. */
export async function queueOldUrlCheck(siteId: string, _prev: OldUrlCheckState, formData: FormData): Promise<OldUrlCheckState> {
  const text = String(formData.get("old_urls") ?? "");
  const fail = (error: string): OldUrlCheckState => ({ error });

  const { urls, rejected, sitemapIndex } = parseOldUrls(text);
  if (sitemapIndex.length) return fail(`That's a sitemap index: it lists ${sitemapIndex.length} sitemaps, not pages. Add the sitemaps it lists instead.`);
  if (rejected.length) {
    const shown = rejected.slice(0, 3).map((r) => `“${r.slice(0, 80)}”`).join(", ");
    return fail(`Fix or remove ${rejected.length === 1 ? "this line" : `these ${rejected.length} lines`} (not a URL or a path starting with /): ${shown}${rejected.length > 3 ? ", …" : ""}.`);
  }
  if (!urls.length) return fail("Add the old site's URLs: upload its sitemap, or paste one URL or path per line.");
  if (urls.length > MAX_OLD_URLS) return fail(`That's ${urls.length.toLocaleString("en-US")} URLs; the limit is ${MAX_OLD_URLS.toLocaleString("en-US")} per check. Split the list.`);

  const result = await insertRun(siteId, { oldUrls: urls }, "redirects");
  return result.error ? fail(result.error) : {};
}

// ---------- Client report links ----------

const LINK_EXPIRY_DAYS: Record<string, number | null> = { never: null, "7": 7, "30": 30, "90": 90 };

/** Create the scan's client link, replacing (revoking) the current one if there is one. */
export async function createReportLink(runId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireUser();
  const choice = String(formData.get("expiry") ?? "never");
  if (!(choice in LINK_EXPIRY_DAYS)) return { error: "Pick when the link expires." };
  const days = LINK_EXPIRY_DAYS[choice];

  // One active link per scan: the old one stops working before the new one exists.
  const { error: revokeError } = await supabase
    .from("report_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("run_id", runId)
    .is("revoked_at", null);
  if (revokeError) return { error: revokeError.message };

  const expires_at = days ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
  const { error } = await supabase.from("report_links").insert({ run_id: runId, expires_at });
  if (error) return { error: error.code === "42501" ? "Links can only be made for finished scans." : error.message };

  revalidatePath(`/runs/${runId}`);
  return {};
}

/** Turn off the scan's client link. Anyone who has it sees "link turned off" from then on. */
export async function revokeReportLink(runId: string): Promise<FormState> {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("report_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("run_id", runId)
    .is("revoked_at", null);
  if (error) return { error: error.message };
  revalidatePath(`/runs/${runId}`);
  return {};
}
