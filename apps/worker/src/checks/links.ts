import pLimit from "p-limit";
import { isRateLimited, politeFetch, sleep } from "../http.js";
import type { Location, PageResult } from "../types.js";
import { suggestAnchor, type Replacement } from "./replacements.js";

export type LinkCheck =
  | "broken"
  | "redirect-chain"
  | "redirect-to-dead"
  | "http-internal"
  | "not-checked"
  | "broken-external"
  | "broken-anchor";

export const LINK_FIX_LOCATION: Record<LinkCheck, string> = {
  broken: "Module or page",
  "redirect-chain": "HubSpot URL redirects",
  "redirect-to-dead": "HubSpot URL redirects",
  "http-internal": "Module or page",
  "not-checked": "Re-scan, or allow-list the scanner",
  "broken-external": "Module or page",
  "broken-anchor": "Module or page",
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
  /** Likely right target: a live page with a similar slug, the closest existing ID, or an archived copy. */
  replacement?: Replacement | null;
}

/**
 * Follow redirects by hand so every hop is recorded. HEAD first, GET when the server rejects HEAD
 * (or, with getOn404, says 404: some servers only get HEAD wrong).
 */
export async function resolveUrl(url: string, { getOn404 = false } = {}): Promise<UrlStatus> {
  const hops: Hop[] = [];
  let current = url;

  try {
    for (let i = 0; i < MAX_HOPS; i++) {
      let res = await request(current, "HEAD");
      if ([403, 405, 501].includes(res.status) || res.status >= 500 || (getOn404 && res.status === 404)) {
        res = await request(current, "GET");
      }
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
    // fetch() hides the useful part (ENOTFOUND, ECONNREFUSED, timeout) in err.cause.
    const cause = (err as { cause?: { code?: string } }).cause?.code;
    const name = (err as Error).name;
    const error = name === "TimeoutError" ? "Timed out" : cause ?? (err as Error).message;
    return { url, hops, finalStatus: null, error };
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

// ---------- External links (Phase 2) ----------

// Sites that answer automated requests with 403 / 999 / login walls whatever the link.
export const EXTERNAL_SKIP = [
  "linkedin.com",
  "facebook.com",
  "fb.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "pinterest.com",
  "threads.net",
  "glassdoor.com",
  "indeed.com",
];
const MAX_EXTERNAL_URLS = 500;
const EXTERNAL_DELAY_MS = 1_000;

function onSkipList(host: string): boolean {
  return EXTERNAL_SKIP.some((d) => host === d || host.endsWith(`.${d}`));
}

/**
 * Dead for certain: gone (404 / 410), server errors after a GET, or a domain that doesn't
 * resolve or refuses connections. Bot walls (401, 403, 429, 999) and timeouts are left out,
 * because the link may well work in a browser.
 */
export function isDeadExternal(status: UrlStatus): boolean {
  if (status.finalStatus === null) return ["ENOTFOUND", "ECONNREFUSED", "EAI_AGAIN", "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID"].includes(status.error ?? "");
  return status.finalStatus === 404 || status.finalStatus === 410 || (status.finalStatus >= 500 && status.finalStatus !== 999);
}

/** Broken links to other sites. One request at a time per domain, a second apart. */
export async function auditExternalLinks(
  pages: PageResult[],
  siteHost: string,
  { hostConcurrency = 4, delayMs = EXTERNAL_DELAY_MS, resolve = resolveUrl } = {},
): Promise<{ issues: LinkIssue[]; checked: number; skipped: number }> {
  const base = siteHost.replace(/^www\./, "");
  const isOwn = (host: string) => host === base || host.endsWith(`.${base}`);

  type Occurrence = { page: string; href: string; text: string; location: Location; url: string };
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
      if (!/^https?:$/.test(parsed.protocol) || isOwn(parsed.hostname)) continue;
      occurrences.push({ page: page.url, href: link.href, text: link.text, location: link.location, url: withoutHash(parsed.href) });
    }
  }

  const all = [...new Set(occurrences.map((o) => o.url))];
  const wanted = all.filter((u) => !onSkipList(new URL(u).hostname));
  const toCheck = wanted.slice(0, MAX_EXTERNAL_URLS);

  const byHost = new Map<string, string[]>();
  for (const u of toCheck) {
    const host = new URL(u).hostname;
    byHost.set(host, [...(byHost.get(host) ?? []), u]);
  }

  const statuses = new Map<string, UrlStatus>();
  const limit = pLimit(hostConcurrency);
  await Promise.all(
    [...byHost.values()].map((urls) =>
      limit(async () => {
        for (const [i, u] of urls.entries()) {
          if (i > 0) await sleep(delayMs);
          statuses.set(u, await resolve(u, { getOn404: true }));
        }
      }),
    ),
  );

  const issues = new Map<string, LinkIssue>();
  for (const o of occurrences) {
    const status = statuses.get(o.url);
    if (!status || !isDeadExternal(status)) continue;
    const key = [o.url, o.location.scope, o.location.module, o.location.path].join("|");
    const existing = issues.get(key);
    if (existing) {
      if (!existing.pages.includes(o.page)) existing.pages.push(o.page);
      continue;
    }
    issues.set(key, { check: "broken-external", url: o.url, href: o.href, status, location: o.location, text: o.text, pages: [o.page] });
  }
  return { issues: [...issues.values()], checked: toCheck.length, skipped: all.length - toCheck.length };
}

// ---------- Broken anchors (Phase 2) ----------

/** Fragments that aren't element targets: top of page, hash routing, HubSpot chat/meeting triggers. */
function isTargetFragment(fragment: string): boolean {
  return fragment !== "" && fragment.toLowerCase() !== "top" && !/^[!/]/.test(fragment) && !/^hs-/.test(fragment);
}

/**
 * #fragment links whose target ID isn't on the target page. Covers same-page links and links
 * to other scanned pages; pages that weren't scanned can't be checked.
 */
export function auditAnchors(pages: PageResult[], siteHost: string): LinkIssue[] {
  const base = siteHost.replace(/^www\./, "");
  const key = (u: URL) => `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "") || "/"}${u.search}`;
  const anchorsByPage = new Map(pages.filter((p) => !p.error).map((p) => [key(new URL(p.url)), new Set(p.anchors ?? [])]));

  const issues = new Map<string, LinkIssue>();
  for (const page of pages) {
    if (page.error) continue;
    for (const link of page.links) {
      let parsed: URL;
      try {
        parsed = new URL(link.resolved);
      } catch {
        continue;
      }
      const host = parsed.hostname.replace(/^www\./, "");
      if (host !== base || !parsed.hash) continue;
      let fragment: string;
      try {
        fragment = decodeURIComponent(parsed.hash.slice(1));
      } catch {
        fragment = parsed.hash.slice(1);
      }
      if (!isTargetFragment(fragment)) continue;
      const targets = anchorsByPage.get(key(parsed));
      if (!targets || targets.has(fragment)) continue;

      const url = parsed.href;
      const closest = suggestAnchor(fragment, [...targets]);
      const k = [url, link.location.scope, link.location.module, link.location.path].join("|");
      const existing = issues.get(k);
      if (existing) {
        if (!existing.pages.includes(page.url)) existing.pages.push(page.url);
        continue;
      }
      issues.set(k, {
        check: "broken-anchor",
        url,
        href: link.href,
        status: { url, hops: [], finalStatus: null },
        location: link.location,
        text: link.text,
        pages: [page.url],
        replacement: closest ? { url: `${url.split("#")[0]}#${closest}`, reason: "Closest ID on the page" } : null,
      });
    }
  }
  return [...issues.values()];
}
