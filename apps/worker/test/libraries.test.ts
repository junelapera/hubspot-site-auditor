import assert from "node:assert/strict";
import { test } from "node:test";
import { auditLibraries, checkLibraries, compareVersions, createDetector, type RetireRepo } from "../src/checks/libraries.js";
import type { PageResult } from "../src/types.js";

// A trimmed copy of the jQuery entry in Retire.js's jsrepository-v4.json.
const repo: RetireRepo = {
  "retire-example": { extractors: { filename: ["retire-example-(§§version§§)(.min)?\\.js"] } },
  jquery: {
    vulnerabilities: [
      { below: "1.9.0b1", severity: "medium", identifiers: { summary: "XSS via selector", CVE: ["CVE-2012-6708"] }, info: ["https://bugs.jquery.com/ticket/11290"] },
      { atOrAbove: "1.2.0", below: "3.5.0", severity: "medium", identifiers: { summary: "htmlPrefilter XSS", CVE: ["CVE-2020-11022"] } },
    ],
    extractors: {
      uri: ["/(§§version§§)/jquery(\\.min)?\\.js"],
      filename: ["jquery-(§§version§§)(\\.min)?\\.js"],
      filecontent: ["/\\*!? jQuery v(§§version§§)"],
      hashes: { "da39a3ee5e6b4b0d3255bfef95601890afd80709": "1.0.0" }, // sha1 of ""
    },
  },
};
const detector = createDetector(repo);

test("version comparison handles pre-releases and different lengths", () => {
  assert.ok(compareVersions("1.11.2", "1.9.0") > 0);
  assert.ok(compareVersions("3.5.0-beta", "3.5.0") < 0);
  assert.ok(compareVersions("3.5.0.1", "3.5.0") > 0);
  assert.equal(compareVersions("3.5.0", "3.5.0"), 0);
});

test("detects by file name, URL path, content and hash", () => {
  assert.deepEqual(detector.fromUrl("https://cdn.x.com/libs/jquery-1.11.2.min.js"), [
    { component: "jquery", version: "1.11.2", url: "https://cdn.x.com/libs/jquery-1.11.2.min.js" },
  ]);
  assert.equal(detector.fromUrl("https://cdn.x.com/3.7.1/jquery.min.js")[0].version, "3.7.1");
  assert.deepEqual(detector.fromUrl("https://x.com/hubfs/theme/main.js"), []);
  assert.equal(detector.fromContent("https://x.com/bundle.js", "/*! jQuery v3.4.1 | (c) OpenJS */ more code")[0].version, "3.4.1");
  assert.equal(detector.fromContent("https://x.com/empty.js", "")[0].version, "1.0.0");
  assert.deepEqual(detector.fromUrl("https://x.com/retire-example-0.0.1.js"), [], "the example entry is ignored");
});

test("vulnerabilities respect below and atOrAbove", () => {
  assert.equal(detector.vulnerabilities("jquery", "1.11.2").length, 1);
  assert.equal(detector.vulnerabilities("jquery", "1.8.3").length, 2);
  assert.equal(detector.vulnerabilities("jquery", "3.7.1").length, 0);
});

const page = (url: string, libraries: PageResult["libraries"]): PageResult => ({
  url, status: 200, redirected: false, findings: [], images: [], links: [], insecure: [], cookies: [], scripts: [], libraries, anchors: [], forms: [],
});

test("libraries dedupe by version across pages, vulnerable first", () => {
  const libs = auditLibraries(
    [
      page("https://x.com/1", [{ component: "jquery", version: "3.7.1", url: "https://x.com/a.js" }, { component: "jquery", version: "1.11.2", url: "https://x.com/old.js" }]),
      page("https://x.com/2", [{ component: "jquery", version: "1.11.2", url: "https://x.com/old.js" }]),
    ],
    detector,
  );
  assert.deepEqual(libs.map((l) => [l.version, l.severity, l.pages.length, l.urls.length]), [
    ["1.11.2", "medium", 2, 1],
    ["3.7.1", null, 1, 1],
  ]);
  const check = checkLibraries(libs);
  assert.equal(check.pass, false);
  assert.equal(check.current, "jquery 1.11.2 (1 known, worst medium)");
  assert.equal(checkLibraries([libs[1]]).current, "1 library found, none with known vulnerabilities");
});

test("library fix says when HubSpot serves the script", async () => {
  const { suggestLibraryFix } = await import("../src/fixes.js");
  const lib = { component: "moment.js", version: "2.30.1", pages: ["https://x.com/"], severity: "medium" as const,
    vulnerabilities: [{ severity: "medium" as const, summary: "Path traversal", cves: ["CVE-1"], info: "" }] };
  assert.match(suggestLibraryFix({ ...lib, urls: ["https://x.com/_hcms/forms/v2.js"] })!.summary, /HubSpot serves/);
  assert.match(suggestLibraryFix({ ...lib, urls: ["https://x.com/hubfs/theme/moment.js"] })!.steps[0], /^Update moment\.js/);
  assert.equal(suggestLibraryFix({ ...lib, urls: [], severity: null, vulnerabilities: [] }), null);
});
