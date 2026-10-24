// Old-URL redirect check: read the old site's URLs from a sitemap file or a pasted list.
// Used in the browser (to read an uploaded file into the list) and in the server action.
import type { OldUrlStatus, RedirectCheckSummary, Run } from "./types";

/** Mirrors MAX_OLD_URLS in apps/worker/src/checks/old-urls.ts. */
export const MAX_OLD_URLS = 5_000;

export interface OldUrlList {
  urls: string[];
  /** Lines that aren't an http(s) URL or a path. */
  rejected: string[];
  /** Child sitemaps, when the text is a sitemap index rather than a list of pages. */
  sitemapIndex: string[];
}

function decodeXml(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[e]!);
}

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => decodeXml(m[1]));
}

/** A sitemap's <loc> entries (images' <image:loc> aren't pages), or one URL or path per line. Old URLs can be on any domain: only the path is used. */
export function parseOldUrls(text: string): OldUrlList {
  if (/<sitemapindex[\s>]/i.test(text)) return { urls: [], rejected: [], sitemapIndex: locs(text) };
  const found = locs(text);
  const lines = found.length ? found : text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const urls: string[] = [];
  const rejected: string[] = [];
  for (const line of lines) {
    const ok = line.startsWith("/") ? !line.startsWith("//") : /^https?:\/\/[^/\s]+/i.test(line);
    if (!ok || /\s/.test(line)) rejected.push(line);
    else if (!urls.includes(line)) urls.push(line);
  }
  return { urls, rejected, sitemapIndex: [] };
}

export const OLD_URL_LABEL: Record<OldUrlStatus, string> = {
  missing: "No redirect (404)",
  "redirect-to-dead": "Redirects to a dead page",
  "redirect-home": "Goes to the home page",
  "redirect-chain": "Redirect chain",
  redirected: "Redirected",
  live: "Still live",
  "not-checked": "Not checked (rate limited)",
  error: "Couldn't check",
};

/** Report order: what needs a redirect first. */
export const OLD_URL_ORDER: OldUrlStatus[] = ["missing", "redirect-to-dead", "redirect-home", "redirect-chain", "not-checked", "error", "redirected", "live"];

/** Statuses that need a redirect added or changed. */
export const OLD_URL_PROBLEMS: OldUrlStatus[] = ["missing", "redirect-to-dead", "redirect-home", "redirect-chain"];

/** A redirect check's summary (runs.summary has a different shape for those). */
export function redirectSummary(run: Pick<Run, "kind" | "summary">): RedirectCheckSummary | null {
  return run.kind === "redirects" && run.summary ? (run.summary as unknown as RedirectCheckSummary) : null;
}
