import assert from "node:assert/strict";
import { test } from "node:test";
import { exportFilename, imagesCsv, issuesCsv, linksCsv, mixedContentCsv, redirectsCsv } from "../exports";
import type { ImageRow, IssueRow, LinkRow, ModuleSummaryRow } from "../types";

const fix = { summary: "Raise contrast.", steps: ["Darken the text."], snippet: { lang: "css" as const, code: ".hero a { color: #000; }" } };
const issue = (over: Partial<IssueRow>): IssueRow => ({
  id: 1, fingerprint: "f", rule_id: "color-contrast", impact: "serious", help: "Elements must meet minimum color contrast ratio thresholds",
  help_url: "https://dequeuniversity.com/rules/axe/4.10/color-contrast", tags: ["wcag2aa", "wcag143"], scope: "module", module: ".hero", named: true, path: "a",
  html: "<a>", failure_summary: "", fix, pages: ["https://x.com/a"], viewports: ["desktop"], ...over,
});
const summary = (scope: ModuleSummaryRow["scope"], module: string | null): ModuleSummaryRow => ({
  run_id: "r", scope, module, named: true, issue_count: 1, worst_impact: "serious", pages_affected: 1, rules: [], weight: 1,
});

function parse(csv: string) {
  // Good enough for these fixtures: no embedded commas outside quotes we control.
  return csv.replace(/^﻿/, "").trim().split("\r\n");
}

test("issues: one row per module + rule, pages merged, worst severity kept", () => {
  const csv = issuesCsv(
    [
      issue({ id: 1, path: "a.one", pages: ["https://x.com/a", "https://x.com/b"] }),
      issue({ id: 2, path: "a.two", impact: "critical", pages: ["https://x.com/b", "https://x.com/c"] }),
      issue({ id: 3, rule_id: "image-alt", help: "Images must have alternative text", impact: "critical" }),
    ],
    [summary("module", ".hero")],
  );
  const lines = parse(csv);
  assert.equal(lines.length, 1 + 2, "header + 2 groups (contrast, image-alt)");
  const contrast = lines.find((l) => l.includes("color-contrast"))!;
  assert.match(contrast, /^\[\.hero\] Elements must meet/);
  assert.match(contrast, /,High,critical,\.hero,Module code,color-contrast,2,3,/);
});

test("issues: Found at lists every width any issue in the group was seen at", () => {
  const csv = issuesCsv(
    [issue({ id: 1, path: "a.one", viewports: ["mobile"] }), issue({ id: 2, path: "a.two" }), issue({ id: 3, rule_id: "image-alt", viewports: ["mobile"] })],
    [summary("module", ".hero")],
  );
  const lines = parse(csv);
  assert.match(lines[0], /,Pages affected,Found at,Description,/);
  assert.match(lines.find((l) => l.includes("color-contrast"))!, /,color-contrast,2,1,"desktop, mobile",/);
  assert.match(lines.find((l) => l.includes("image-alt"))!, /,image-alt,1,1,mobile,/);
});

test("issues: rows follow the module list order", () => {
  const csv = issuesCsv(
    [issue({ module: ".footer", scope: "global" }), issue({ id: 2, module: ".hero" })],
    [summary("module", ".hero"), summary("global", ".footer")],
  );
  const [, first, second] = parse(csv);
  assert.match(first, /^\[\.hero\]/);
  assert.match(second, /^\[\.footer \(global\)\]/);
});

test("images: hostile alt text can't become a formula", () => {
  const img: ImageRow = {
    id: 1, src: "https://x.com/i.png", alt: "=HYPERLINK(\"http://evil\",\"x\")", checks: ["generic"], severity: "serious",
    scope: "module", module: ".hero", fixes: [], pages: ["https://x.com/a"],
  };
  assert.match(imagesCsv([img]), /"'=HYPERLINK/);
});

test("mixed content: one row per resource with module and pages", () => {
  const lines = parse(
    mixedContentCsv([
      { id: 1, url: "http://cdn.x.com/a.js", kind: "script", blocked: true, scope: "global", module: ".site-header", path: "script", fix, pages: ["https://x.com/a"] },
    ]),
  );
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^script,Yes,http:\/\/cdn\.x\.com\/a\.js,\.site-header \(global\),/);
});

test("filename is safe and dated", () =>
  assert.equal(exportFilename("www.saltedstone.com", "2026-10-22T07:20:28Z", "issues"), "www.saltedstone.com-2026-10-22-issues.csv"));


const linkRow = (over: Partial<LinkRow>): LinkRow => ({
  id: 1, check: "broken", url: "https://x.com/old", href: "/old", text: "Old", hops: [{ url: "https://x.com/old", status: 404 }],
  final_status: 404, error: null, scope: "module", module: ".nav", fix, pages: ["https://x.com/a"], ...over,
});

test("redirects: HubSpot sample columns, no BOM, dead → replacement and chain → final, one row per old URL", () => {
  const csv = redirectsCsv([
    linkRow({ replacement: { url: "https://x.com/new", reason: "Same page name at a different path" } }),
    linkRow({ id: 2, module: ".footer", replacement: { url: "https://x.com/new", reason: "Same page name at a different path" } }),
    linkRow({ id: 3, check: "broken", url: "https://x.com/nothing-close", replacement: null }),
    linkRow({ id: 4, check: "redirect-chain", url: "https://x.com/a", hops: [{ url: "https://x.com/a", status: 301 }, { url: "https://x.com/b", status: 301 }, { url: "https://x.com/c", status: 200 }] }),
    linkRow({ id: 5, check: "broken-external", url: "https://other.org/gone", replacement: { url: "https://web.archive.org/web/2024/https://other.org/gone", reason: "Archived copy" } }),
    linkRow({ id: 6, url: `https://x.com/${"a".repeat(150)}`, replacement: { url: "https://x.com/new", reason: "Similar" } }),
  ]);
  assert.ok(!csv.startsWith("﻿"));
  const lines = csv.trim().split("\r\n");
  assert.equal(lines[0], "original url,redirect to,redirect type,redirect style,priority,match query strings,ignore trailing slash,ignore protocol,disable if page exists,note");
  assert.deepEqual(lines.slice(1), [
    "/old,/new,STANDARD,301,,FALSE,TRUE,TRUE,TRUE,Broken link found by site audit",
    "/a,/c,STANDARD,301,,FALSE,TRUE,TRUE,TRUE,Redirect chain shortened by site audit",
  ]);
});

test("links CSV: likely replacement and why", () => {
  const lines = parse(linksCsv([linkRow({ replacement: { url: "https://x.com/new", reason: "Similar page name (2 of 3 words match)" } })]));
  assert.match(lines[0], /,Likely replacement,Why,/);
  assert.match(lines[1], /,https:\/\/x\.com\/new,Similar page name \(2 of 3 words match\),/);
});
