import assert from "node:assert/strict";
import { test } from "node:test";
import { checkOldUrls, classifyOldUrl, parseOldUrlList, toSiteUrl } from "../src/checks/old-urls.js";
import type { UrlStatus } from "../src/checks/links.js";

const ORIGIN = "https://www.a.com";
const status = (url: string, ...hops: [string, number][]): UrlStatus => ({
  url,
  hops: hops.map(([u, s]) => ({ url: u, status: s })),
  finalStatus: hops.at(-1)?.[1] ?? null,
});

test("old URLs keep their path and query, on the new site's host", () => {
  assert.equal(toSiteUrl("http://old-site.com/blog/post/?p=1#top", ORIGIN), "https://www.a.com/blog/post/?p=1");
  assert.equal(toSiteUrl("/about", ORIGIN), "https://www.a.com/about");
  assert.equal(toSiteUrl("mailto:x@a.com", ORIGIN), null);
});

test("classify: live, missing, redirected, chains, dead ends and the home page", () => {
  const u = "https://www.a.com/old";
  assert.equal(classifyOldUrl(status(u, [u, 200])), "live");
  assert.equal(classifyOldUrl(status(u, [u, 404])), "missing");
  assert.equal(classifyOldUrl(status(u, [u, 410])), "missing");
  assert.equal(classifyOldUrl(status(u, [u, 301], ["https://www.a.com/new", 200])), "redirected");
  assert.equal(classifyOldUrl(status(u, [u, 301], ["https://www.a.com/x", 301], ["https://www.a.com/new", 200])), "redirect-chain");
  assert.equal(classifyOldUrl(status(u, [u, 301], ["https://www.a.com/new", 404])), "redirect-to-dead");
  assert.equal(classifyOldUrl(status(u, [u, 301], ["https://www.a.com/", 200])), "redirect-home");
  assert.equal(classifyOldUrl(status(u, [u, 429])), "not-checked");
  assert.equal(classifyOldUrl(status(u, [u, 500])), "error");
  assert.equal(classifyOldUrl({ url: u, hops: [], finalStatus: null, error: "Timed out" }), "error");
  assert.equal(classifyOldUrl(status("https://www.a.com/?p=12", ["https://www.a.com/?p=12", 200])), "redirect-home");
  // The home page itself (old "/" → new "/") is just live.
  assert.equal(classifyOldUrl(status("https://www.a.com/", ["https://www.a.com/", 200])), "live");
});

test("checkOldUrls: sitemap pages aren't requested, duplicates are checked once, problems get a suggestion", async () => {
  const requested: string[] = [];
  const answers: Record<string, UrlStatus> = {
    "https://www.a.com/blog/2019/crm-migration-guide": status("https://www.a.com/blog/2019/crm-migration-guide", ["https://www.a.com/blog/2019/crm-migration-guide", 404]),
    "https://www.a.com/old-services": status("https://www.a.com/old-services", ["https://www.a.com/old-services", 301], ["https://www.a.com/", 200]),
  };
  const results = await checkOldUrls(
    ["https://old.a.com/about", "https://old.a.com/blog/2019/crm-migration-guide", "/blog/2019/crm-migration-guide", "/old-services"],
    ORIGIN,
    {
      livePages: ["https://www.a.com/", "https://www.a.com/about", "https://www.a.com/blog/crm-migration-guide", "https://www.a.com/services"],
      delayMs: 0,
      resolve: async (url) => {
        requested.push(url);
        return answers[url];
      },
    },
  );
  assert.deepEqual(requested.sort(), ["https://www.a.com/blog/2019/crm-migration-guide", "https://www.a.com/old-services"]);
  assert.equal(results.length, 3);
  const by = Object.fromEntries(results.map((r) => [r.checkedUrl.replace(ORIGIN, ""), r]));
  assert.equal(by["/about"].status, "live");
  assert.equal(by["/about"].url, "https://old.a.com/about");
  assert.equal(by["/blog/2019/crm-migration-guide"].status, "missing");
  assert.equal(by["/blog/2019/crm-migration-guide"].replacement?.url, "https://www.a.com/blog/crm-migration-guide");
  assert.equal(by["/old-services"].status, "redirect-home");
  assert.equal(by["/old-services"].replacement?.url, "https://www.a.com/services");
});

test("parseOldUrlList reads sitemap <loc> entries or plain lines, and refuses a sitemap index", () => {
  const xml = `<?xml version="1.0"?><urlset><url><loc>https://old.com/a?x=1&amp;y=2</loc><image:image><image:loc>https://old.com/i.png</image:loc></image:image></url>
    <url><loc><![CDATA[https://old.com/b]]></loc></url><url><loc>https://old.com/b</loc></url></urlset>`;
  assert.deepEqual(parseOldUrlList(xml), ["https://old.com/a?x=1&y=2", "https://old.com/b"]);
  assert.deepEqual(parseOldUrlList("/a\n\n# comment\nhttps://old.com/b\r\n/a"), ["/a", "https://old.com/b"]);
  assert.throws(() => parseOldUrlList("<sitemapindex><sitemap><loc>https://old.com/post-sitemap.xml</loc></sitemap></sitemapindex>"), /sitemap index/);
});
