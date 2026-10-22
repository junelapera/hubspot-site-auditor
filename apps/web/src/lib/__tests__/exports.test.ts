import assert from "node:assert/strict";
import { test } from "node:test";
import { exportFilename, imagesCsv, issuesCsv } from "../exports";
import type { ImageRow, IssueRow, ModuleSummaryRow } from "../types";

const fix = { summary: "Raise contrast.", steps: ["Darken the text."], snippet: { lang: "css" as const, code: ".hero a { color: #000; }" } };
const issue = (over: Partial<IssueRow>): IssueRow => ({
  id: 1, fingerprint: "f", rule_id: "color-contrast", impact: "serious", help: "Elements must meet minimum color contrast ratio thresholds",
  help_url: "https://dequeuniversity.com/rules/axe/4.10/color-contrast", scope: "module", module: ".hero", named: true, path: "a",
  html: "<a>", failure_summary: "", fix, pages: ["https://x.com/a"], ...over,
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

test("filename is safe and dated", () =>
  assert.equal(exportFilename("www.saltedstone.com", "2026-10-22T07:20:28Z", "issues"), "www.saltedstone.com-2026-10-22-issues.csv"));
