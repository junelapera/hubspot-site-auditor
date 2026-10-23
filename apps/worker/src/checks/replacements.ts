// Likely replacements for broken links: a live page with the same or a similar slug,
// the closest ID on the target page for a broken anchor, or an archived copy of a dead external page.
import { politeFetch, sleep } from "../http.js";

export interface Replacement {
  url: string;
  /** Why it's suggested, shown next to it ("Same page name", "Closest ID on the page", ...). */
  reason: string;
}

const MIN_SIMILARITY = 0.5;

function segments(u: URL): string[] {
  let p = u.pathname;
  try {
    p = decodeURIComponent(p);
  } catch {
    // keep the raw path
  }
  return p
    .toLowerCase()
    .replace(/\.(html?|php|aspx?)$/, "")
    .split("/")
    .filter(Boolean);
}

function words(slug: string): Set<string> {
  return new Set(slug.split(/[-_+.\s]+/).filter((w) => w.length > 1));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

function sharedPrefix(a: string[], b: string[]): number {
  let n = 0;
  while (n < a.length - 1 && n < b.length - 1 && a[n] === b[n]) n++;
  return n;
}

/**
 * The live page a dead internal URL most likely moved to, matched by slug: the same last path segment
 * elsewhere (e.g. /blog/old-section/post → /blog/post), then a similar one (most words in common),
 * then the nearest live parent section. Never the home page: redirecting there is a soft 404.
 * Returns null when nothing is close or two candidates tie.
 */
export function suggestPage(deadUrl: string, liveUrls: string[]): Replacement | null {
  let dead: URL;
  try {
    dead = new URL(deadUrl);
  } catch {
    return null;
  }
  const host = (u: URL) => u.hostname.replace(/^www\./, "");
  const deadSegs = segments(dead);
  const slug = deadSegs.at(-1);
  if (!slug) return null;

  const live = [...new Set(liveUrls)]
    .map((u) => {
      try {
        return new URL(u);
      } catch {
        return null;
      }
    })
    .filter((u): u is URL => u !== null && host(u) === host(dead) && segments(u).length > 0)
    .filter((u) => segments(u).join("/") !== deadSegs.join("/"));

  type Scored = { url: URL; score: number };
  const best = (list: Scored[]): URL | null => {
    const sorted = list.sort((a, b) => b.score - a.score);
    if (!sorted.length || (sorted[1] && sorted[1].score === sorted[0].score)) return null;
    return sorted[0].url;
  };

  // Same page name, somewhere else on the site. Ties broken by how much of the path they share.
  const sameSlug = best(live.filter((u) => segments(u).at(-1) === slug).map((url) => ({ url, score: sharedPrefix(deadSegs, segments(url)) })));
  if (sameSlug) return { url: sameSlug.href, reason: "Same page name at a different path" };

  // Similar page name: most words in common, nudged towards the same section.
  const deadWords = words(slug);
  const similar = live
    .map((url) => {
      const segs = segments(url);
      const score = jaccard(deadWords, words(segs.at(-1)!));
      return { url, score: score + (score && segs[0] === deadSegs[0] ? 0.05 : 0), raw: score };
    })
    .filter((s) => s.raw >= MIN_SIMILARITY);
  const similarBest = best(similar);
  if (similarBest) {
    const w = words(segments(similarBest).at(-1)!);
    const shared = [...deadWords].filter((x) => w.has(x)).length;
    return { url: similarBest.href, reason: `Similar page name (${shared} of ${deadWords.size} words match)` };
  }

  // Nearest live parent section, e.g. /resources/guides/gone → /resources/guides.
  const liveByPath = new Map(live.map((u) => [segments(u).join("/"), u]));
  for (let n = deadSegs.length - 1; n > 0; n--) {
    const parent = liveByPath.get(deadSegs.slice(0, n).join("/"));
    if (parent) return { url: parent.href, reason: "Nearest live parent page (no page with a similar name)" };
  }
  return null;
}

const squash = (id: string) => id.toLowerCase().replace(/[^a-z0-9]/g, "");

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[b.length];
}

/** The ID on the target page a broken #fragment was most likely meant to be: same letters, or a near spelling. */
export function suggestAnchor(fragment: string, anchors: string[]): string | null {
  const want = squash(fragment);
  if (!want) return null;
  const same = anchors.filter((a) => squash(a) === want);
  if (same.length === 1) return same[0];
  if (same.length > 1) return null;

  const allowed = Math.max(1, Math.floor(want.length / 4));
  const scored = anchors
    .map((a) => ({ a, d: editDistance(want, squash(a)) }))
    .filter((s) => s.d <= allowed)
    .sort((x, y) => x.d - y.d);
  if (!scored.length || (scored[1] && scored[1].d === scored[0].d)) return null;
  return scored[0].a;
}

const WAYBACK_MAX = 50;
const WAYBACK_DELAY_MS = 1_000;

/**
 * The Wayback Machine's latest good copy of each dead external URL (one request at a time, up to 50).
 * Missing from the map when there's no copy or archive.org didn't answer.
 */
export async function archivedCopies(urls: string[], { fetchImpl = politeFetch, delayMs = WAYBACK_DELAY_MS } = {}): Promise<Map<string, Replacement>> {
  const found = new Map<string, Replacement>();
  for (const [i, url] of [...new Set(urls)].slice(0, WAYBACK_MAX).entries()) {
    if (i > 0) await sleep(delayMs);
    try {
      const res = await fetchImpl(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`);
      if (!res.ok) continue;
      const data = (await res.json()) as { archived_snapshots?: { closest?: { available?: boolean; url?: string; status?: string; timestamp?: string } } };
      const snap = data.archived_snapshots?.closest;
      if (!snap?.available || !snap.url || snap.status !== "200") continue;
      const ts = snap.timestamp ?? "";
      const date = ts.length >= 8 ? `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}` : "unknown date";
      found.set(url, { url: snap.url.replace(/^http:/, "https:"), reason: `Archived copy from ${date} (Wayback Machine)` });
    } catch {
      // archive.org down or slow: no suggestion
    }
  }
  return found;
}
