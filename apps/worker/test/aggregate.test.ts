import assert from "node:assert/strict";
import { test } from "node:test";
import { dedupeIssues, fingerprint } from "../src/aggregate.js";
import type { AxeFinding, PageResult, Viewport } from "../src/types.js";

const finding = (viewport: Viewport, over: Partial<AxeFinding> = {}): AxeFinding => ({
  ruleId: "color-contrast", impact: "serious", help: "", helpUrl: "", tags: [], html: "<a>", failureSummary: "", target: "a",
  location: { scope: "module", module: ".hero", named: true, partial: null, path: "div.hero > a" },
  viewport, ...over,
});
const page = (url: string, findings: AxeFinding[]): PageResult => ({
  url, status: 200, redirected: false, findings,
  images: [], links: [], insecure: [], cookies: [], scripts: [], libraries: [], anchors: [], forms: [],
});

test("same element at both widths is one issue, tagged with both", () => {
  const issues = dedupeIssues([page("/a", [finding("mobile"), finding("desktop")]), page("/b", [finding("desktop")])]);
  assert.equal(issues.length, 1);
  assert.deepEqual(issues[0].viewports, ["desktop", "mobile"]);
  assert.deepEqual(issues[0].pages, ["/a", "/b"]);
});

test("width isn't part of the fingerprint", () => {
  const [issue] = dedupeIssues([page("/a", [finding("mobile")])]);
  assert.equal(issue.fingerprint, fingerprint("color-contrast", "module", ".hero", "div.hero > a"));
  assert.deepEqual(issue.viewports, ["mobile"]);
});

test("a mobile-only element stays a separate, mobile-only issue", () => {
  const menu = finding("mobile", { ruleId: "target-size", location: { scope: "global", module: "header", named: true, partial: null, path: "button.menu-toggle" } });
  const issues = dedupeIssues([page("/a", [finding("desktop"), menu])]);
  assert.deepEqual(issues.map((i) => i.viewports), [["desktop"], ["mobile"]]);
});
