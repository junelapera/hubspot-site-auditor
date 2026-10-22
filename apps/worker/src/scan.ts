import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import pLimit from "p-limit";
import { chromium, type Browser } from "playwright";
import { isRateLimited, retryDelay, sleep, USER_AGENT } from "./http.js";
import type { AxeFinding, Impact, ImageInfo, LinkInfo, Location, PageResult } from "./types.js";

const INSPECT_SRC = readFileSync(new URL("./browser/inspect.js", import.meta.url), "utf8");

export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];

export const DESKTOP = { width: 1366, height: 900 };


export interface ScanOptions {
  concurrency?: number;
  delayMs?: number;
  onPage?: (result: PageResult, done: number, total: number) => void;
}

export async function scanPages(urls: string[], opts: ScanOptions = {}): Promise<PageResult[]> {
  const { concurrency = 3, delayMs = 500, onPage } = opts;
  const browser = await chromium.launch();
  const limit = pLimit(concurrency);
  let done = 0;

  try {
    return await Promise.all(
      urls.map((url) =>
        limit(async () => {
          const result = await scanPage(browser, url);
          onPage?.(result, ++done, urls.length);
          await sleep(delayMs);
          return result;
        }),
      ),
    );
  } finally {
    await browser.close();
  }
}

export async function scanPage(browser: Browser, url: string): Promise<PageResult> {
  const context = await browser.newContext({ viewport: DESKTOP, userAgent: USER_AGENT });
  const page = await context.newPage();

  try {
    let response = await page.goto(url, { waitUntil: "load", timeout: 45_000 });
    for (let attempt = 0; isRateLimited(response?.status() ?? null) && attempt < 3; attempt++) {
      await sleep(retryDelay(response!.headers()["retry-after"] ?? null, attempt));
      response = await page.goto(url, { waitUntil: "load", timeout: 45_000 });
    }
    // Never run axe on a rate-limit or error page: its findings would be junk.
    const status = response?.status() ?? null;
    if (status === null || status >= 400) {
      const error = isRateLimited(status) ? `Rate limited (HTTP ${status})` : `HTTP ${status}`;
      return { url, status, redirected: false, error, findings: [], images: [], links: [] };
    }
    // Let JS-built modules and HubSpot forms render; don't fail if trackers keep the network busy.
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});

    const axe = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

    const nodes = axe.violations.flatMap((v) => v.nodes.map((node) => ({ v, node })));
    const inspected = (await page.evaluate(
      `(${INSPECT_SRC})(${JSON.stringify({ targets: nodes.map(({ node }) => node.target) })})`,
    )) as { targets: Location[]; images: ImageInfo[]; links: LinkInfo[] };

    const findings: AxeFinding[] = nodes.map(({ v, node }, i) => ({
      ruleId: v.id,
      impact: (node.impact ?? v.impact ?? "minor") as Impact,
      help: v.help,
      helpUrl: v.helpUrl,
      tags: v.tags,
      html: node.html,
      failureSummary: node.failureSummary ?? "",
      target: node.target.map(String).join(" >>> "),
      location: inspected.targets[i],
    }));

    return {
      url,
      status: response?.status() ?? null,
      redirected: Boolean(response?.request().redirectedFrom()),
      findings,
      images: inspected.images,
      links: inspected.links,
    };
  } catch (err) {
    return { url, status: null, redirected: false, error: (err as Error).message, findings: [], images: [], links: [] };
  } finally {
    await context.close();
  }
}
