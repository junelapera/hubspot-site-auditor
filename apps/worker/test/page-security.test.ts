import assert from "node:assert/strict";
import { test } from "node:test";
import {
  auditMixedContent,
  auditThirdPartyScripts,
  checkCookies,
  checkMixedContent,
  isFirstParty,
  parseMixedContentMessage,
  parseSetCookie,
} from "../src/checks/page-security.js";
import type { Location, PageResult } from "../src/types.js";

const hero: Location = { scope: "module", module: ".hero", named: true, partial: null, path: "img" };

const page = (url: string, over: Partial<PageResult>): PageResult => ({
  url,
  status: 200,
  redirected: false,
  findings: [],
  images: [],
  links: [],
  insecure: [],
  cookies: [],
  scripts: [],
  libraries: [],
  ...over,
});

test("first-party covers the bare domain and subdomains, not lookalikes", () => {
  assert.ok(isFirstParty("www.client.com", "www.client.com"));
  assert.ok(isFirstParty("client.com", "www.client.com"));
  assert.ok(isFirstParty("blog.client.com", "www.client.com"));
  assert.ok(!isFirstParty("notclient.com", "www.client.com"));
  assert.ok(!isFirstParty("js.hs-scripts.com", "www.client.com"));
});

test("parses Chrome mixed-content console messages", () => {
  assert.deepEqual(
    parseMixedContentMessage(
      "Mixed Content: The page at 'https://a.com/' was loaded over HTTPS, but requested an insecure script 'http://cdn.x.com/a.js'. This request has been blocked; the content must be served over HTTPS.",
    ),
    { url: "http://cdn.x.com/a.js", kind: "script" },
  );
  assert.deepEqual(
    parseMixedContentMessage(
      "Mixed Content: The page at 'https://a.com/' was loaded over HTTPS, but requested an insecure element 'http://a.com/x.png'. This request was automatically upgraded to HTTPS.",
    ),
    { url: "http://a.com/x.png", kind: "image" },
  );
  assert.equal(parseMixedContentMessage("Some other warning 'http://a.com/'"), null);
});

test("mixed content dedupes across pages and drops console copies of located URLs", () => {
  const img = "http://a.com/x.png";
  const font = "http://fonts.x.com/f.woff2";
  const issues = auditMixedContent([
    page("https://a.com/1", {
      insecure: [
        { url: img, kind: "image", location: hero },
        { url: img, kind: "image", location: null },
        { url: font, kind: "font", location: null },
      ],
    }),
    page("https://a.com/2", { insecure: [{ url: img, kind: "image", location: hero }] }),
  ]);
  assert.equal(issues.length, 2);
  assert.equal(issues[0].url, font, "blocked resources sort first");
  assert.equal(issues[0].blocked, true);
  assert.deepEqual(issues[1].pages, ["https://a.com/1", "https://a.com/2"]);

  const check = checkMixedContent(issues);
  assert.equal(check.pass, false);
  assert.equal(check.current, "2 http:// resources on 2 pages (1 blocked by browsers)");
  assert.equal(checkMixedContent([]).pass, true);
});

test("Set-Cookie parsing keeps the name and flags, never the value", () => {
  assert.deepEqual(parseSetCookie("__cf_bm=secret-value; path=/; HttpOnly; Secure; SameSite=None"), {
    name: "__cf_bm",
    secure: true,
    httpOnly: true,
    sameSite: "None",
  });
  assert.deepEqual(parseSetCookie("session=abc"), { name: "session", secure: false, httpOnly: false, sameSite: null });
  assert.equal(parseSetCookie("=x"), null);
});

test("cookie check reports missing flags, using the weakest setting seen", () => {
  const ok = { name: "good", secure: true, httpOnly: true, sameSite: "Lax" };
  const result = checkCookies([
    page("https://a.com/1", { cookies: [ok, { name: "sid", secure: true, httpOnly: true, sameSite: "Lax" }] }),
    page("https://a.com/2", { cookies: [{ name: "sid", secure: true, httpOnly: false, sameSite: null }] }),
  ]);
  assert.equal(result.pass, false);
  assert.equal(result.current, "sid: no HttpOnly, SameSite");
  assert.doesNotMatch(result.current, /good/);

  assert.equal(checkCookies([page("https://a.com/", { cookies: [ok] })]).pass, true);
  assert.equal(checkCookies([page("https://a.com/", {})]).current, "No cookies set by the site's response headers");
});

test("third-party scripts grouped by domain, first-party and query strings left out", () => {
  const domains = auditThirdPartyScripts(
    [
      page("https://www.a.com/1", {
        scripts: ["https://www.a.com/main.js", "https://cdn.a.com/x.js", "https://js.hs-scripts.com/123.js?v=1", "https://gtm.example/gtm.js"],
      }),
      page("https://www.a.com/2", { scripts: ["https://js.hs-scripts.com/123.js?v=2"] }),
    ],
    "www.a.com",
  );
  assert.deepEqual(
    domains.map((d) => [d.domain, d.pages.length, d.urls]),
    [
      ["js.hs-scripts.com", 2, ["https://js.hs-scripts.com/123.js"]],
      ["gtm.example", 1, ["https://gtm.example/gtm.js"]],
    ],
  );
});
