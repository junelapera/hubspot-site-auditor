import pLimit from "p-limit";
import { isRateLimited, politeFetch, sleep } from "../http.js";
import type { Location, PageResult } from "../types.js";

export type LinkCheck = "broken" | "redirect-chain" | "redirect-to-dead" | "http-internal" | "not-checked";

export const LINK_FIX_LOCATION: Record<LinkCheck, string> = {
  broken: "Module or page",
  "redirect-chain": "HubSpot URL redirects",
  "redirect-to-dead": "HubSpot URL redirects",
  "http-internal": "Module or page",
  "not-checked": "Re-scan, or allow-list the scanner",
};

const MAX_HOPS = 10;
const DELAY_MS = 250;

export interface Hop {
  url: string;
  status: number;
}

export interface UrlStatus {
  url: string;
  hops: Hop[]; // every response, including the final one
  finalStatus: number | null;
  error?: string;
}

export interface LinkIssue {
  check: LinkCheck;
  url: string;
  href: string;
  status: UrlStatus;
  location: Location;
  text: string;
  pages: string[];
}

/** Follow redirects by hand so every hop is recorded. HEAD first, GET when the server rejects HEAD. */
export async function resolveUrl(url: string): Promise<UrlStatus> {
  const hops: Hop[] = [];
  let current = url;

  try {
    for (let i = 0; i < MAX_HOPS; i++) {
      let res = await request(current, "HEAD");
      if ([403, 405, 501].includes(res.status) || res.status >= 500) res = await request(current, "GET");
      hops.push({ url: current, status: res.status });

      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        current = new URL(location, current).href;
        continue;
      }
      return { url, hops, finalStatus: res.status };
    }
    return { url, hops, finalStatus: null, error: "Too many redirects" };
  } catch (err) {
    return { url, hops, finalStatus: null, error: (err as Error).message };
  }
}

async function request(url: string, method: "HEAD" | "GET") {
  const res = await politeFetch(url, { method, redirect: "manual" });
  // Free the socket; we only need status and headers.
  await res.body?.cancel();
  return res;
}

export function classify(status: UrlStatus): LinkCheck[] {
  // Still throttled after retries: we don't know if the link works, so never call it broken.
  if (isRateLimited(status.finalStatus)) return ["not-checked"];

  const redirects = status.hops.length - 1;
  const checks: LinkCheck[] = [];
  const dead = status.finalStatus === null || status.finalStatus >= 400;

  if (dead && redirects > 0) checks.push("redirect-to-dead");
  else if (dead) checks.push("broken");
  if (redirects > 1) checks.push("redirect-chain");
  return checks;
}

function isCheckable(href: string | null): boolean {
  return Boolean(href) && !/^(mailto:|tel:|javascript:|#|sms:|data:)/i.test(href!.trim());
}

function withoutHash(u: string): string {
  const url = new URL(u);
  url.hash = "";
  return url.href;
}

/** Phase 1: internal links only. External links come in Phase 2 with per-domain rate limits. */
export async function auditInternalLinks(
  pages: PageResult[],
  siteHost: string,
  { concurrency = 2, knownLive = [] as string[] } = {},
): Promise<LinkIssue[]> {
  const isInternal = (u: URL) => u.hostname === siteHost || u.hostname === siteHost.replace(/^www\./, "");

  type Occurrence = { page: string; href: string; text: string; location: Location; url: string; http: boolean };
  const occurrences: Occurrence[] = [];

  for (const page of pages) {
    for (const link of page.links) {
      if (!isCheckable(link.href)) continue;
      let parsed: URL;
      try {
        parsed = new URL(link.resolved);
      } catch {
        continue;
      }
      if (!/^https?:$/.test(parsed.protocol) || !isInternal(parsed)) continue;
      occurrences.push({
        page: page.url,
        href: link.href,
        text: link.text,
        location: link.location,
        url: withoutHash(parsed.href),
        http: parsed.protocol === "http:",
      });
    }
  }

  // Skip URLs known to be live without a redirect: pages we just scanned, and exact
  // sitemap URLs. Near-misses (trailing slash, http) still get requested — those redirect.
  const live = new Set([...knownLive, ...pages.filter((p) => p.status === 200 && !p.redirected).map((p) => p.url)]);
  const unique = [...new Set(occurrences.map((o) => o.url))].filter((u) => !live.has(u));

  const limit = pLimit(concurrency);
  const statuses = new Map<string, UrlStatus>(
    await Promise.all(
      unique.map((u) =>
        limit(async () => {
          const status = await resolveUrl(u);
          await sleep(DELAY_MS);
          return [u, status] as const;
        }),
      ),
    ),
  );

  const issues = new Map<string, LinkIssue>();
  for (const o of occurrences) {
    const status = statuses.get(o.url) ?? { url: o.url, hops: [{ url: o.url, status: 200 }], finalStatus: 200 };
    const checks = [...classify(status), ...(o.http ? (["http-internal"] as const) : [])];

    for (const check of checks) {
      const key = [check, o.url, o.location.scope, o.location.module, o.location.path].join("|");
      const existing = issues.get(key);
      if (existing) {
        if (!existing.pages.includes(o.page)) existing.pages.push(o.page);
        continue;
      }
      issues.set(key, { check, url: o.url, href: o.href, status, location: o.location, text: o.text, pages: [o.page] });
    }
  }
  return [...issues.values()];
}
