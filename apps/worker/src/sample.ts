// Sampling mode: scan as few pages as possible while still covering every module.
// Each page's HTML is fetched (plain GET, no browser) and its modules are named the
// way browser/inspect.js names them; then pages are picked greedily until every
// module, global partial and template-coded wrapper has been seen at least once.
import pLimit from "p-limit";
import { politeFetch, sleep } from "./http.js";

export const MAX_SAMPLE_DISCOVERY = 2_000;
const FETCH_DELAY_MS = 150;

// Same rules as isStableClass / isBlockClass in browser/inspect.js.
function isBlockClass(c: string): boolean {
  return (
    !/\d{4,}/.test(c) &&
    !/^hs_cos_wrapper/.test(c) &&
    !/^widget_/.test(c) &&
    !/^(is|has)-/.test(c) &&
    !/^(active|open|show|visible|hidden|selected|current)$/.test(c) &&
    !c.includes("__") &&
    !c.includes("--")
  );
}

const SKIP_CONTENT = new Set(["script", "style", "noscript", "template"]);
const VOID = new Set(["link", "meta", "br", "hr", "img", "input", "source", "wbr"]);

interface Tag {
  name: string;
  attrs: string;
  closing: boolean;
  end: number;
}

/** The next real start or end tag after `from`, skipping comments and whole script / style elements. */
function nextTag(html: string, lower: string, from: number): Tag | null {
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g;
  re.lastIndex = from;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (!m[2]) continue; // comment
    const name = m[2].toLowerCase();
    if (!m[1] && SKIP_CONTENT.has(name)) {
      const close = lower.indexOf(`</${name}`, re.lastIndex);
      const closeEnd = close === -1 ? -1 : lower.indexOf(">", close);
      re.lastIndex = closeEnd === -1 ? html.length : closeEnd + 1;
      continue;
    }
    return { name, attrs: m[3], closing: m[1] === "/", end: re.lastIndex };
  }
  return null;
}

function attr(attrs: string, name: string): string | null {
  return new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i").exec(attrs)?.[1] ?? null;
}

/**
 * Names for everything on a page that a module list would show: custom modules by
 * their root block class (like inspect.js), built-in HubSpot types, readable
 * template-coded wrapper IDs, and global partials.
 */
export function modulesInHtml(html: string): string[] {
  const names = new Set<string>();
  const lower = html.toLowerCase();

  for (const m of html.matchAll(/data-global-resource-path="([^"]+)"/g)) names.add(`partial:${m[1]}`);

  const wrapper = /<([a-zA-Z][\w-]*)(\s[^>]*\bhs_cos_wrapper_type_([\w]+)[^>]*)>/g;
  for (const m of html.matchAll(wrapper)) {
    const type = m[3];
    const id = (attr(m[2], "id") ?? "").replace(/^hs_cos_wrapper_/, "").replace(/_$/, "");
    if (id && !/^(widget_|module_)?\d+$/.test(id) && !/\d{4,}|dnd/.test(id)) names.add(`#${id}`);

    if (type !== "module") {
      names.add(`HubSpot ${type.replace(/_/g, " ")}`);
      continue;
    }
    // Root block class of the module's first element, up to two levels deep.
    let pos = m.index! + m[0].length;
    for (let depth = 0; depth < 2; depth++) {
      let tag = nextTag(html, lower, pos);
      while (tag && VOID.has(tag.name) && !tag.closing) tag = nextTag(html, lower, tag.end);
      if (!tag || tag.closing) break;
      const block = (attr(tag.attrs, "class") ?? "").split(/\s+/).filter(Boolean).find(isBlockClass);
      if (block) {
        names.add(`.${block}`);
        break;
      }
      pos = tag.end;
    }
  }
  return [...names];
}

export interface SampledPage {
  url: string;
  modules: string[];
}

/**
 * Greedy set cover: repeatedly take the page that adds the most modules not yet covered
 * (shortest URL on a tie), until everything is covered or the limit is reached.
 */
export function pickSample(pages: SampledPage[], limit: number): { urls: string[]; covered: number; total: number } {
  const all = new Set(pages.flatMap((p) => p.modules));
  const covered = new Set<string>();
  const remaining = [...pages];
  const urls: string[] = [];

  while (urls.length < limit && covered.size < all.size && remaining.length) {
    let best = -1;
    let bestGain = 0;
    for (const [i, p] of remaining.entries()) {
      const gain = p.modules.filter((m) => !covered.has(m)).length;
      if (gain > bestGain || (gain === bestGain && gain > 0 && p.url.length < remaining[best].url.length)) {
        best = i;
        bestGain = gain;
      }
    }
    if (best === -1) break;
    const [page] = remaining.splice(best, 1);
    urls.push(page.url);
    for (const m of page.modules) covered.add(m);
  }
  // A site with no recognisable modules still gets one page scanned.
  if (!urls.length && pages.length) urls.push(pages[0].url);
  return { urls, covered: covered.size, total: all.size };
}

export interface SampleResult {
  urls: string[];
  /** Pages in the sitemap (after filters), pages whose HTML was read, modules found and covered. */
  discovered: number;
  fetched: number;
  modules: number;
  covered: number;
}

/** Read every page's HTML, then pick the fewest pages that cover every module. */
export async function samplePages(
  urls: string[],
  { limit, concurrency = 4, onProgress }: { limit: number; concurrency?: number; onProgress?: (done: number, total: number) => void | Promise<void> },
): Promise<SampleResult> {
  const candidates = urls.slice(0, MAX_SAMPLE_DISCOVERY);
  const run = pLimit(concurrency);
  let done = 0;
  const pages = await Promise.all(
    candidates.map((url) =>
      run(async (): Promise<SampledPage | null> => {
        try {
          const res = await politeFetch(url, { redirect: "follow" });
          if (!res.ok || !/html/i.test(res.headers.get("content-type") ?? "")) {
            await res.body?.cancel();
            return null;
          }
          return { url, modules: modulesInHtml(await res.text()) };
        } catch {
          return null;
        } finally {
          await onProgress?.(++done, candidates.length);
          await sleep(FETCH_DELAY_MS);
        }
      }),
    ),
  );
  const read = pages.filter((p): p is SampledPage => p !== null);
  const picked = pickSample(read, limit);
  return { urls: picked.urls, discovered: urls.length, fetched: read.length, modules: picked.total, covered: picked.covered };
}
