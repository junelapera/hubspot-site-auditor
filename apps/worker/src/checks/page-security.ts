// Security checks built from what the browser saw on each scanned page:
// mixed content, first-party cookie flags, and third-party script domains.
import type { CookieInfo, InsecureKind, InsecureResource, Location, PageResult } from "../types.js";
import type { SecurityResult } from "./security.js";

/** www.client.com → client.com, so blog.client.com and client.com count as first-party too. */
export function siteBase(siteHost: string): string {
  return siteHost.replace(/^www\./, "");
}

export function isFirstParty(host: string, siteHost: string): boolean {
  const base = siteBase(siteHost);
  return host === base || host.endsWith(`.${base}`);
}

// ---------- Mixed content ----------

const CONSOLE_KIND: Record<string, InsecureKind> = {
  script: "script",
  stylesheet: "stylesheet",
  font: "font",
  image: "image",
  element: "image", // Chrome's word for auto-upgraded images, audio and video
  video: "media",
  audio: "media",
  frame: "iframe",
  endpoint: "form",
  plugin: "plugin",
};

/** Chrome logs every mixed-content request, including CSS fonts and blocked scripts the DOM can't show. */
export function parseMixedContentMessage(text: string): { url: string; kind: InsecureKind } | null {
  if (!text.startsWith("Mixed Content:")) return null;
  const m = /insecure ([\w ]+?) '(http:\/\/[^']+)'/.exec(text);
  if (!m) return null;
  const word = m[1].split(" ").pop()!.toLowerCase();
  return { url: m[2], kind: CONSOLE_KIND[word] ?? "other" };
}

/** Script, stylesheet, iframe and font requests are blocked by browsers; images and media are upgraded. */
export const BLOCKED_KINDS: InsecureKind[] = ["script", "stylesheet", "iframe", "font", "plugin", "form"];

export interface MixedContentIssue {
  url: string;
  kind: InsecureKind;
  blocked: boolean;
  location: Location | null;
  pages: string[];
}

/** One row per resource and place it sits (same as images), with the pages it's on. */
export function auditMixedContent(pages: PageResult[]): MixedContentIssue[] {
  const byKey = new Map<string, MixedContentIssue>();
  for (const page of pages) {
    for (const r of dedupeOnPage(page.insecure ?? [])) {
      const l = r.location;
      const key = [r.url, l?.scope ?? "", l?.module ?? "", l?.path ?? ""].join("|");
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.pages.includes(page.url)) existing.pages.push(page.url);
        continue;
      }
      byKey.set(key, { url: r.url, kind: r.kind, blocked: BLOCKED_KINDS.includes(r.kind), location: l, pages: [page.url] });
    }
  }
  return [...byKey.values()].sort((a, b) => Number(b.blocked) - Number(a.blocked) || b.pages.length - a.pages.length);
}

/** A URL the console reported is dropped when the markup already placed it in a module. */
function dedupeOnPage(resources: InsecureResource[]): InsecureResource[] {
  const located = new Set(resources.filter((r) => r.location).map((r) => r.url));
  const seen = new Set<string>();
  return resources.filter((r) => {
    if (!r.location && located.has(r.url)) return false;
    const key = `${r.url}|${r.location ? JSON.stringify(r.location) : ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function checkMixedContent(issues: MixedContentIssue[]): SecurityResult {
  const pages = new Set(issues.flatMap((i) => i.pages)).size;
  const blocked = issues.filter((i) => i.blocked).length;
  return {
    id: "mixed-content",
    name: "Mixed content",
    pass: issues.length === 0,
    current: issues.length
      ? `${issues.length} http:// ${issues.length === 1 ? "resource" : "resources"} on ${pages} ${pages === 1 ? "page" : "pages"}` +
        (blocked ? ` (${blocked} blocked by browsers)` : "")
      : "No http:// resources on HTTPS pages",
    recommended: "Every image, script, stylesheet, font and iframe loaded over https://",
    fixLocation: "The module, template or content field that holds the URL",
  };
}

// ---------- Cookies ----------

/** Name and flags from a Set-Cookie header. The value is dropped. */
export function parseSetCookie(header: string): CookieInfo | null {
  const [pair, ...attrs] = header.split(";").map((s) => s.trim());
  const eq = pair.indexOf("=");
  const name = (eq === -1 ? pair : pair.slice(0, eq)).trim();
  if (!name) return null;
  const lower = attrs.map((a) => a.toLowerCase());
  const sameSite = lower.find((a) => a.startsWith("samesite="));
  return {
    name,
    secure: lower.includes("secure"),
    httpOnly: lower.includes("httponly"),
    sameSite: sameSite ? attrs[lower.indexOf(sameSite)].split("=")[1].trim() : null,
  };
}

/**
 * Cookies set by the site's own Set-Cookie headers, each needing Secure, HttpOnly and SameSite.
 * Cookies set by JavaScript (HubSpot analytics, consent banners) can't be HttpOnly and aren't checked.
 */
export function checkCookies(pages: PageResult[]): SecurityResult {
  const byName = new Map<string, CookieInfo>();
  for (const c of pages.flatMap((p) => p.cookies ?? [])) {
    const prev = byName.get(c.name);
    // If any response sets it without a flag, report the weaker one.
    byName.set(c.name, prev ? { ...c, secure: prev.secure && c.secure, httpOnly: prev.httpOnly && c.httpOnly, sameSite: prev.sameSite && c.sameSite } : c);
  }
  const failing = [...byName.values()]
    .map((c) => ({
      name: c.name,
      missing: [!c.secure && "Secure", !c.httpOnly && "HttpOnly", !c.sameSite && "SameSite"].filter(Boolean) as string[],
    }))
    .filter((c) => c.missing.length)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    id: "cookies",
    name: "Cookie flags",
    pass: failing.length === 0,
    current: !byName.size
      ? "No cookies set by the site's response headers"
      : failing.length
        ? failing.map((c) => `${c.name}: no ${c.missing.join(", ")}`).join("; ")
        : `${byName.size} ${byName.size === 1 ? "cookie" : "cookies"}, all with Secure, HttpOnly and SameSite`,
    recommended: "Set-Cookie with Secure; HttpOnly; SameSite=Lax (or Strict)",
    fixLocation: "Cloudflare or origin (whatever sets the cookie)",
  };
}

// ---------- Third-party scripts ----------

export interface ScriptDomain {
  domain: string;
  /** Up to 5 example script URLs, without query strings. */
  urls: string[];
  pages: string[];
}

const MAX_URLS = 5;

export function auditThirdPartyScripts(pages: PageResult[], siteHost: string): ScriptDomain[] {
  const byDomain = new Map<string, ScriptDomain>();
  for (const page of pages) {
    for (const src of page.scripts ?? []) {
      let url: URL;
      try {
        url = new URL(src);
      } catch {
        continue;
      }
      if (!/^https?:$/.test(url.protocol) || isFirstParty(url.hostname, siteHost)) continue;
      const entry = byDomain.get(url.hostname) ?? { domain: url.hostname, urls: [], pages: [] };
      const clean = url.origin + url.pathname;
      if (entry.urls.length < MAX_URLS && !entry.urls.includes(clean)) entry.urls.push(clean);
      if (!entry.pages.includes(page.url)) entry.pages.push(page.url);
      byDomain.set(url.hostname, entry);
    }
  }
  return [...byDomain.values()].sort((a, b) => b.pages.length - a.pages.length || a.domain.localeCompare(b.domain));
}
