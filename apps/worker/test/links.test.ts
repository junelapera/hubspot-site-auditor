import assert from "node:assert/strict";
import { test } from "node:test";
import { auditAnchors, auditExternalLinks, isDeadExternal, type UrlStatus } from "../src/checks/links.js";
import type { LinkInfo, Location, PageResult } from "../src/types.js";

const loc: Location = { scope: "module", module: ".nav", named: true, partial: null, path: "a" };
const link = (resolved: string, href = resolved): LinkInfo => ({ href, resolved, text: "Link", location: loc });
const page = (url: string, links: LinkInfo[], anchors: string[] = []): PageResult => ({
  url, status: 200, redirected: false, findings: [], images: [], links, insecure: [], cookies: [], scripts: [], libraries: [], anchors,
});
const status = (finalStatus: number | null, error?: string): UrlStatus => ({ url: "u", hops: finalStatus ? [{ url: "u", status: finalStatus }] : [], finalStatus, error });

test("external: only certain deaths count", () => {
  assert.ok(isDeadExternal(status(404)));
  assert.ok(isDeadExternal(status(410)));
  assert.ok(isDeadExternal(status(502)));
  assert.ok(isDeadExternal(status(null, "ENOTFOUND")));
  for (const s of [status(200), status(403), status(429), status(999), status(401), status(null, "Timed out")]) assert.ok(!isDeadExternal(s));
});

test("external: skips own domain, skip list and mailto; one request per URL; dead ones reported", async () => {
  const requested: string[] = [];
  const resolve = async (u: string) => {
    requested.push(u);
    return u.includes("gone") ? status(404) : status(200);
  };
  const { issues, checked, skipped } = await auditExternalLinks(
    [
      page("https://www.a.com/1", [
        link("https://www.a.com/about"),
        link("https://blog.a.com/post"),
        link("https://www.linkedin.com/company/a"),
        link("mailto:hi@a.com", "mailto:hi@a.com"),
        link("https://other.org/gone#x"),
        link("https://other.org/fine"),
      ]),
      page("https://www.a.com/2", [link("https://other.org/gone")]),
    ],
    "www.a.com",
    { delayMs: 0, resolve },
  );
  assert.deepEqual(requested.sort(), ["https://other.org/fine", "https://other.org/gone"]);
  assert.equal(checked, 2);
  assert.equal(skipped, 1);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].check, "broken-external");
  assert.deepEqual(issues[0].pages, ["https://www.a.com/1", "https://www.a.com/2"]);
});

test("anchors: missing IDs on this page and on other scanned pages", () => {
  const issues = auditAnchors(
    [
      page(
        "https://www.a.com/",
        [
          link("https://www.a.com/#pricing", "#pricing"),
          link("https://www.a.com/#missing", "#missing"),
          link("https://www.a.com/#top", "#top"),
          link("https://www.a.com/#/route", "#/route"),
          link("https://www.a.com/#hs-chat-open", "#hs-chat-open"),
          link("https://www.a.com/about/#team", "/about/#team"),
          link("https://www.a.com/about#nope", "/about#nope"),
          link("https://www.a.com/not-scanned#x", "/not-scanned#x"),
        ],
        ["pricing"],
      ),
      page("https://www.a.com/about", [], ["team"]),
    ],
    "www.a.com",
  );
  assert.deepEqual(issues.map((i) => i.url).sort(), ["https://www.a.com/#missing", "https://www.a.com/about#nope"]);
  assert.ok(issues.every((i) => i.check === "broken-anchor"));
});
