import { XMLParser } from "fast-xml-parser";
import picomatch from "picomatch";
import { politeFetch } from "./http.js";

export interface CrawlOptions {
  include?: string[];
  exclude?: string[];
  limit?: number;
}

const MAX_SITEMAPS = 200;
const parser = new XMLParser({ ignoreAttributes: true });

export function normalizeDomain(input: string): URL {
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const url = new URL(withScheme);
  return new URL(url.origin);
}

export interface CrawlResult {
  /** URLs to scan, after filters and the page limit. */
  urls: string[];
  /** Every URL the sitemap lists. HubSpot generates it from published content, so these are live pages. */
  sitemapUrls: string[];
}

/** Fetch sitemap.xml (following nested sitemap indexes) and return a filtered, deduped URL list. */
export async function crawlSitemap(domain: string, opts: CrawlOptions = {}): Promise<CrawlResult> {
  let origin = normalizeDomain(domain);
  const queue = [new URL("/sitemap.xml", origin).href];
  const seenSitemaps = new Set<string>();
  const urls = new Set<string>();

  while (queue.length && seenSitemaps.size < MAX_SITEMAPS) {
    const sitemapUrl = queue.shift()!;
    if (seenSitemaps.has(sitemapUrl)) continue;
    seenSitemaps.add(sitemapUrl);

    const res = await politeFetch(sitemapUrl, { redirect: "follow" });
    if (!res.ok) {
      if (seenSitemaps.size === 1) {
        throw new Error(`No sitemap found at ${sitemapUrl} (HTTP ${res.status})`);
      }
      continue;
    }
    // Use the post-redirect host (e.g. bare domain -> www) as the canonical site host.
    if (seenSitemaps.size === 1) origin = new URL(new URL(res.url).origin);
    const doc = parser.parse(await res.text());

    for (const loc of locs(doc.sitemapindex?.sitemap)) queue.push(loc);
    for (const loc of locs(doc.urlset?.url)) urls.add(stripHash(loc));
  }

  return { urls: filterUrls([...urls], origin, opts), sitemapUrls: [...urls] };
}

export function filterUrls(urls: string[], origin: URL, opts: CrawlOptions): string[] {
  const isIncluded = opts.include?.length ? picomatch(opts.include) : () => true;
  const isExcluded = opts.exclude?.length ? picomatch(opts.exclude) : () => false;

  const filtered = urls.filter((u) => {
    const url = new URL(u);
    if (url.hostname !== origin.hostname) return false;
    return isIncluded(url.pathname) && !isExcluded(url.pathname);
  });

  return opts.limit ? filtered.slice(0, opts.limit) : filtered;
}

function locs(entries: unknown): string[] {
  if (!entries) return [];
  const list = Array.isArray(entries) ? entries : [entries];
  return list
    .map((e) => (typeof e === "object" && e && "loc" in e ? String((e as { loc: unknown }).loc).trim() : ""))
    .filter(Boolean);
}

function stripHash(u: string): string {
  const url = new URL(u);
  url.hash = "";
  return url.href;
}
