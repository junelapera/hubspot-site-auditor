import assert from "node:assert/strict";
import { test } from "node:test";
import { archivedCopies, suggestAnchor, suggestPage } from "../src/checks/replacements.js";
import { REDIRECT_CSV_HEADER, redirectRow, suggestLinkFix } from "../src/fixes.js";
import type { LinkIssue } from "../src/checks/links.js";

const site = (...paths: string[]) => paths.map((p) => `https://www.a.com${p}`);
const LIVE = site("/", "/blog", "/blog/hubspot-onboarding-guide", "/services/crm-migration", "/resources/guides", "/about");

test("same slug at a new path wins", () => {
  const r = suggestPage("https://www.a.com/blog/2023/hubspot-onboarding-guide", LIVE);
  assert.equal(r?.url, "https://www.a.com/blog/hubspot-onboarding-guide");
  assert.match(r!.reason, /Same page name/);
});

test("similar slug: most words in common", () => {
  const r = suggestPage("https://www.a.com/services/hubspot-crm-migration", LIVE);
  assert.equal(r?.url, "https://www.a.com/services/crm-migration");
  assert.match(r!.reason, /2 of 3 words/);
});

test("falls back to the nearest live parent, never the home page", () => {
  assert.equal(suggestPage("https://www.a.com/resources/guides/zzz-gone", LIVE)?.url, "https://www.a.com/resources/guides");
  assert.equal(suggestPage("https://www.a.com/totally-unrelated", LIVE), null);
});

test("bare and www hosts match; .html and case are ignored", () => {
  assert.equal(suggestPage("https://a.com/old/About.html", LIVE)?.url, "https://www.a.com/about");
});

test("two equally good candidates: no guess", () => {
  assert.equal(suggestPage("https://www.a.com/x/pricing", site("/en/pricing", "/fr/pricing")), null);
});

test("anchor: same letters, or one close spelling", () => {
  assert.equal(suggestAnchor("Contact_Form", ["contact-form", "faq"]), "contact-form");
  assert.equal(suggestAnchor("pricng", ["pricing", "faq"]), "pricing");
  assert.equal(suggestAnchor("team", ["faq", "pricing"]), null);
});

test("archived copies: only good snapshots, https", async () => {
  const answers: Record<string, unknown> = {
    "https://x.org/gone": { archived_snapshots: { closest: { available: true, status: "200", url: "http://web.archive.org/web/20240312000000/https://x.org/gone", timestamp: "20240312000000" } } },
    "https://x.org/never": { archived_snapshots: {} },
  };
  const fetchImpl = (async (u: string) => {
    const target = decodeURIComponent(new URL(u).searchParams.get("url")!);
    return new Response(JSON.stringify(answers[target] ?? {}), { status: 200 });
  }) as unknown as typeof fetch;
  const found = await archivedCopies(["https://x.org/gone", "https://x.org/never"], { fetchImpl, delayMs: 0 });
  assert.deepEqual([...found.keys()], ["https://x.org/gone"]);
  assert.match(found.get("https://x.org/gone")!.url, /^https:\/\/web\.archive\.org\//);
  assert.match(found.get("https://x.org/gone")!.reason, /2024-03-12/);
});

const linkIssue = (over: Partial<LinkIssue>): LinkIssue => ({
  check: "broken", url: "https://www.a.com/old-page", href: "/old-page", text: "Old",
  status: { url: "https://www.a.com/old-page", hops: [{ url: "https://www.a.com/old-page", status: 404 }], finalStatus: 404 },
  location: { scope: "module", module: ".nav", named: true, partial: null, path: "a" }, pages: [], ...over,
});

test("broken link with a replacement: HubSpot redirect row from old path to new", () => {
  const fix = suggestLinkFix(linkIssue({ replacement: { url: "https://www.a.com/new-page", reason: "Similar page name (1 of 2 words match)" } }));
  const [header, row] = fix.snippet!.code.split("\n");
  assert.equal(header, REDIRECT_CSV_HEADER);
  assert.equal(row, "/old-page,/new-page,STANDARD,301,,FALSE,TRUE,TRUE,TRUE,Broken link found by site audit");
  assert.match(fix.steps[0], /Likely replacement: https:\/\/www\.a\.com\/new-page \(similar page name/);
});

test("broken link without a replacement: no redirect row to the home page", () => {
  assert.equal(suggestLinkFix(linkIssue({ replacement: null })).snippet, undefined);
});

test("redirect rows quote cells with commas", () => {
  assert.equal(redirectRow("/a", "/b", "x, y").split(",").at(-2), '"x');
});
