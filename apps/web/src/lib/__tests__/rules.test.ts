import assert from "node:assert/strict";
import { test } from "node:test";
import { criteriaFromTags, summarizeRules } from "../rules";

test("WCAG criteria come from axe tags", () => {
  assert.deepEqual(criteriaFromTags(["cat.color", "wcag2aa", "wcag143", "wcag1410", "best-practice"]), ["1.4.3", "1.4.10"]);
});

const issue = (rule_id: string, tags: string[], module: string, impact: "critical" | "serious", pages: string[]) => ({
  rule_id, help: rule_id, help_url: "", tags, impact, scope: "module" as const, module, pages,
});

test("one row per rule in WCAG order, best practice last, modules by pages", () => {
  const rows = summarizeRules([
    issue("region", ["best-practice"], ".a", "serious", ["/1"]),
    issue("color-contrast", ["wcag2aa", "wcag143"], ".a", "serious", ["/1"]),
    issue("color-contrast", ["wcag2aa", "wcag143"], ".b", "serious", ["/1", "/2"]),
    issue("image-alt", ["wcag2a", "wcag111"], ".hero", "critical", ["/3"]),
  ]);
  assert.deepEqual(rows.map((r) => r.rule_id), ["image-alt", "color-contrast", "region"]);
  const contrast = rows[1];
  assert.deepEqual(contrast.criteria, ["1.4.3"]);
  assert.equal(contrast.issue_count, 2);
  assert.equal(contrast.pages_affected, 2);
  assert.deepEqual(contrast.modules.map((m) => m.label), [".b", ".a"]);
});
