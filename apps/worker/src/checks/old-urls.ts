// Old-URL redirect check (migrations): request every URL from the old site's sitemap on the new
// HubSpot site and report the ones left without a working redirect, with a likely new page for each.
import pLimit from "p-limit";
import { isRateLimited, sleep } from "../http.js";
import { resolveUrl, type Hop, type UrlStatus } from "./links.js";
import { suggestPage, type Replacement } from "./replacements.js";

export type OldUrlStatus =
  /** Still answers 200 at the same address. */
  | "live"
  /** Redirects, in one hop, to a live page. */
  | "redirected"
  /** 404 / 410: needs a redirect. */
  | "missing"
  /** Redirects, but to a page that's gone. */
  | "redirect-to-dead"
  /** Ends up on the home page (a redirect there, or "/?p=123" served by it): a soft 404 for visitors and search engines. */
  | "redirect-home"
  /** Reaches a live page, but through more than one redirect. */
  | "redirect-chain"
  /** Still rate limited after retries. */
  | "not-checked"
  /** Server error, timeout, or another status we can't call missing. */
  | "error";

export const OLD_URL_STATUSES: OldUrlStatus[] = ["missing", "redirect-to-dead", "redirect-home", "redirect-chain", "redirected", "live", "not-checked", "error"];

/** Statuses that need a redirect added or changed. */
export const OLD_URL_PROBLEMS: OldUrlStatus[] = ["missing", "redirect-to-dead", "redirect-home", "redirect-chain"];

export interface OldUrlResult {
  /** As listed in the old sitemap. */
  url: string;
  /** Its path and query on the new site: what was requested. */
  checkedUrl: string;
  status: OldUrlStatus;
  hops: Hop[];
  finalStatus: number | null;
  error?: string;
  /** Likely new page, for missing URLs and redirects to a dead page or the home page. */
  replacement: Replacement | null;
}

export const MAX_OLD_URLS = 5_000;
const DELAY_MS = 250;

/** The old URL's path and query on the new site. Paths ("/about") are taken as they are. */
export function toSiteUrl(oldUrl: string, origin: string): string | null {
  let url: URL;
  try {
    url = new URL(oldUrl.trim(), origin);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  return new URL(url.pathname + url.search, origin).href;
}

export function classifyOldUrl(status: UrlStatus): OldUrlStatus {
  if (isRateLimited(status.finalStatus)) return "not-checked";
  const final = status.finalStatus;
  if (final === null) return "error";
  const redirects = status.hops.length - 1;
  const gone = final === 404 || final === 410;

  const start = new URL(status.url);
  if (redirects === 0) {
    // WordPress's "/?p=123": HubSpot ignores the query and serves the home page.
    if (final >= 200 && final < 300) return start.pathname === "/" && start.search ? "redirect-home" : "live";
    return gone ? "missing" : "error";
  }
  if (gone) return "redirect-to-dead";
  if (final < 200 || final >= 300) return "error";
  const end = new URL(status.hops.at(-1)!.url);
  if (end.pathname === "/" && !end.search && (start.pathname !== "/" || start.search)) return "redirect-home";
  return redirects > 1 ? "redirect-chain" : "redirected";
}

export interface OldUrlOptions {
  /** Live pages on the new site (its sitemap): requested only if listed, and the pool for suggestions. */
  livePages?: string[];
  concurrency?: number;
  delayMs?: number;
  resolve?: (url: string) => Promise<UrlStatus>;
  onProgress?: (done: number, total: number) => void | Promise<void>;
}

/**
 * Check each old URL's path on the new site (origin), two at a time with a pause between requests.
 * Old URLs that map to the same path are checked once (the first one listed is kept).
 */
export async function checkOldUrls(oldUrls: string[], origin: string, opts: OldUrlOptions = {}): Promise<OldUrlResult[]> {
  const { livePages = [], concurrency = 2, delayMs = DELAY_MS, resolve = resolveUrl, onProgress } = opts;
  const byChecked = new Map<string, string>();
  for (const old of oldUrls.slice(0, MAX_OLD_URLS)) {
    const checked = toSiteUrl(old, origin);
    if (checked && !byChecked.has(checked)) byChecked.set(checked, old);
  }

  // Exact sitemap URLs are live (HubSpot builds the sitemap from published pages), so they aren't requested.
  const live = new Set(livePages);
  const limit = pLimit(concurrency);
  let done = 0;
  const total = byChecked.size;
  const results = await Promise.all(
    [...byChecked].map(([checkedUrl, url]) =>
      limit(async (): Promise<OldUrlResult> => {
        let status: UrlStatus;
        if (live.has(checkedUrl)) status = { url: checkedUrl, hops: [{ url: checkedUrl, status: 200 }], finalStatus: 200 };
        else {
          status = await resolve(checkedUrl);
          await sleep(delayMs);
        }
        const result = classifyOldUrl(status);
        done++;
        await onProgress?.(done, total);
        return {
          url,
          checkedUrl,
          status: result,
          hops: status.hops,
          finalStatus: status.finalStatus,
          ...(status.error ? { error: status.error } : {}),
          replacement: ["missing", "redirect-to-dead", "redirect-home"].includes(result) ? suggestPage(checkedUrl, livePages) : null,
        };
      }),
    ),
  );
  return results;
}

/** Read an old sitemap file (its <loc> entries) or a plain list, one URL or path per line. */
export function parseOldUrlList(text: string): string[] {
  if (/<sitemapindex[\s>]/i.test(text)) throw new Error("This is a sitemap index: use the sitemaps it lists instead");
  const locs = [...text.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => decodeXml(m[1]));
  const lines = locs.length ? locs : text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  return [...new Set(lines)];
}

function decodeXml(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[e]!);
}
