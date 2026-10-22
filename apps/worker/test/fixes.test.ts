import assert from "node:assert/strict";
import { test } from "node:test";
import { parseContrast, passingColor } from "../src/fixes.js";

const summary =
  "Fix any of the following:\n  Element has insufficient color contrast of 2.86 (foreground color: #ffffff, background color: #f58025, font size: 12.0pt (16px), font weight: normal). Expected contrast ratio of 4.5:1";

test("parses axe contrast summary", () =>
  assert.deepEqual(parseContrast(summary), { ratio: "2.86", fg: "#ffffff", bg: "#f58025", expected: "4.5:1" }));

test("white on orange: suggests a dark text color that passes", () => {
  const color = passingColor("#ffffff", "#f58025", 4.5);
  assert.notEqual(color, "#ffffff");
  // verify independently with the WCAG formula
  const lum = (h: string) =>
    [1, 3, 5]
      .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
  const [a, b] = [lum(color), lum("#f58025")].sort((x, y) => y - x);
  assert.ok((a + 0.05) / (b + 0.05) >= 4.5, color);
});

test("grey on dark: lightens", () => {
  const color = passingColor("#777777", "#111111", 4.5);
  assert.ok(parseInt(color.slice(1, 3), 16) >= 0x77, color);
});

import { suggestAxeFix } from "../src/fixes.js";
import type { Issue } from "../src/types.js";

const issue = (over: Partial<Issue>): Issue => ({
  fingerprint: "x", ruleId: "image-alt", impact: "critical", help: "", helpUrl: "", tags: [],
  scope: "module", module: ".hero", named: true, partial: null, path: "img", html: "<img>",
  failureSummary: "", pages: [], ...over,
});

test("image-alt in a module points at the module field", () =>
  assert.match(suggestAxeFix(issue({})).snippet!.code, /module\.image\.alt/));
test("image-alt in a template doesn't suggest module fields", () =>
  assert.doesNotMatch(suggestAxeFix(issue({ scope: "template", module: null })).snippet!.code, /module\./));
test("image-alt in post content points at the editor", () =>
  assert.match(suggestAxeFix(issue({ scope: "content", module: "Blog post body" })).summary, /editor/));
