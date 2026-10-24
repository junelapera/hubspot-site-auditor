import assert from "node:assert/strict";
import { test } from "node:test";
import { oldUrlRedirectsCsv, oldUrlsCsv } from "../exports";
import { parseOldUrls } from "../old-urls";
import type { OldUrlRow } from "../types";

test("parseOldUrls: sitemap <loc> entries (not image locs), entities decoded, duplicates dropped", () => {
  const xml = `<?xml version="1.0"?><urlset><url><loc>https://old.com/a?x=1&amp;y=2</loc>
    <image:image><image:loc>https://old.com/i.png</image:loc></image:image></url><url><loc>https://old.com/a?x=1&amp;y=2</loc></url></urlset>`;
  assert.deepEqual(parseOldUrls(xml), { urls: ["https://old.com/a?x=1&y=2"], rejected: [], sitemapIndex: [] });
});

test("parseOldUrls: plain lines of URLs or paths; anything else is rejected", () => {
  const r = parseOldUrls("/about\nhttps://old.com/blog/\n\nold.com/no-scheme\n//cdn.com/x\nftp://old.com/f");
  assert.deepEqual(r.urls, ["/about", "https://old.com/blog/"]);
  assert.deepEqual(r.rejected, ["old.com/no-scheme", "//cdn.com/x", "ftp://old.com/f"]);
});

test("parseOldUrls: a sitemap index lists its sitemaps instead", () => {
  const r = parseOldUrls(`<sitemapindex><sitemap><loc>https://old.com/post-sitemap.xml</loc></sitemap><sitemap><loc>https://old.com/page-sitemap.xml</loc></sitemap></sitemapindex>`);
  assert.deepEqual(r.urls, []);
  assert.deepEqual(r.sitemapIndex, ["https://old.com/post-sitemap.xml", "https://old.com/page-sitemap.xml"]);
});

let id = 0;
const row = (over: Partial<OldUrlRow>): OldUrlRow => ({
  id: ++id,
  url: "https://old.com/x",
  checked_url: "https://www.a.com/x",
  status: "live",
  hops: [{ url: "https://www.a.com/x", status: 200 }],
  final_status: 200,
  error: null,
  replacement: null,
  ...over,
});

test("old-URL redirects: problems with a suggestion and chains; query strings matched exactly; nothing from the home page", () => {
  const csv = oldUrlRedirectsCsv([
    row({ status: "missing", checked_url: "https://www.a.com/old-post", replacement: { url: "https://www.a.com/blog/old-post", reason: "Same page name" } }),
    row({ status: "missing", checked_url: "https://www.a.com/no-match" }),
    row({ status: "missing", checked_url: "https://www.a.com/?p=12", replacement: { url: "https://www.a.com/blog/p", reason: "x" } }),
    row({ status: "redirect-home", checked_url: "https://www.a.com/services/", replacement: { url: "https://www.a.com/services", reason: "x" } }),
    row({ status: "missing", checked_url: "https://www.a.com/", replacement: { url: "https://www.a.com/home", reason: "x" } }),
    row({
      status: "redirect-chain",
      checked_url: "https://www.a.com/a",
      hops: [{ url: "https://www.a.com/a", status: 301 }, { url: "https://www.a.com/b", status: 301 }, { url: "https://www.a.com/c", status: 200 }],
    }),
    row({ status: "redirected" }),
  ]);
  const lines = csv.trim().split("\r\n");
  assert.equal(lines.length, 5);
  assert.equal(lines[1], "/old-post,/blog/old-post,STANDARD,301,,FALSE,TRUE,TRUE,TRUE,\"Old URL with no redirect, found by site audit\"");
  assert.match(lines[2], /^\/\?p=12,\/blog\/p,STANDARD,301,,TRUE,/);
  assert.match(lines[3], /^\/services\/,\/services,.*home page/);
  assert.match(lines[4], /^\/a,\/c,.*Redirect chain/);
});

test("old-URL redirects: 500 rows per part", () => {
  const rows = Array.from({ length: 1203 }, (_, i) =>
    row({ status: "missing", checked_url: `https://www.a.com/old-${i}`, replacement: { url: `https://www.a.com/new-${i}`, reason: "x" } }),
  );
  const rowsIn = (part: number) => oldUrlRedirectsCsv(rows, part).trim().split("\r\n").slice(1);
  assert.equal(rowsIn(1).length, 500);
  assert.equal(rowsIn(3).length, 203);
  assert.match(rowsIn(2)[0], /^\/old-500,/);
});

test("old-URL results CSV: problems first, with the suggestion and why", () => {
  const csv = oldUrlsCsv([
    row({ status: "live" }),
    row({ status: "missing", checked_url: "https://www.a.com/gone", hops: [{ url: "https://www.a.com/gone", status: 404 }], final_status: 404, replacement: { url: "https://www.a.com/new", reason: "Similar page name" } }),
  ]);
  const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(lines[0], "Result,Old URL,Checked at,Redirect hops,Final status,Likely new page,Why");
  assert.match(lines[1], /^No redirect \(404\),https:\/\/old.com\/x,https:\/\/www.a.com\/gone,404 https:\/\/www.a.com\/gone,404,https:\/\/www.a.com\/new,Similar page name$/);
  assert.match(lines[2], /^Still live,/);
});
