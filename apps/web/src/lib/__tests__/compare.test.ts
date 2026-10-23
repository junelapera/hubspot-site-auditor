import assert from "node:assert/strict";
import { test } from "node:test";
import { compareRuns, type CompareIssue } from "../compare";
import type { IssueMark } from "../types";

const issue = (fingerprint: string, pages: string[], over: Partial<CompareIssue> = {}): CompareIssue => ({
  fingerprint, pages, rule_id: "color-contrast", help: "Contrast", impact: "serious", scope: "module", module: ".hero", viewports: ["desktop"], ...over,
});
const fps = (list: { fingerprint: string }[]) => list.map((i) => i.fingerprint).sort();

test("unchanged site: everything still open, nothing new or fixed", () => {
  const run = [issue("a", ["/1"]), issue("b", ["/2"])];
  const c = compareRuns(run, run, ["/1", "/2"]);
  assert.deepEqual([c.fixed.length, c.new.length, c.open.length], [0, 0, 2]);
});

test("issue gone from a rescanned page is fixed; new one is new", () => {
  const c = compareRuns([issue("a", ["/1"]), issue("b", ["/2"])], [issue("b", ["/2"]), issue("c", ["/3"])], ["/1", "/2", "/3"]);
  assert.deepEqual(fps(c.fixed), ["a"]);
  assert.deepEqual(fps(c.new), ["c"]);
  assert.deepEqual(fps(c.open), ["b"]);
});

test("issue whose pages weren't scanned again is not rechecked, not fixed", () => {
  const c = compareRuns([issue("a", ["/old-page"])], [], ["/1"]);
  assert.deepEqual([c.fixed.length, c.notRechecked.length], [0, 1]);
});

test("fixed if any of its old pages was rescanned", () => {
  const c = compareRuns([issue("a", ["/1", "/unscanned"])], [], ["/1"]);
  assert.deepEqual(fps(c.fixed), ["a"]);
});

test("marked issues are hidden from every bucket and keep their status", () => {
  const mark: IssueMark = { id: 1, site_id: "s", fingerprint: "b", kind: "false_positive", note: "", created_by: null, created_at: "", updated_at: "" };
  const c = compareRuns([issue("a", ["/1"]), issue("b", ["/1"])], [issue("b", ["/1"])], ["/1"], [mark]);
  assert.deepEqual(fps(c.open), []);
  assert.deepEqual(fps(c.fixed), ["a"]);
  assert.equal(c.hidden.length, 1);
  assert.equal(c.hidden[0].status, "open");
});

test("worst severity first", () => {
  const c = compareRuns([], [issue("m", ["/1"], { impact: "minor" }), issue("c", ["/1"], { impact: "critical" })], ["/1"]);
  assert.deepEqual(c.new.map((i) => i.impact), ["critical", "minor"]);
});

const BOTH = ["desktop", "mobile"] as const;

test("first scan with the mobile pass: mobile-only issues aren't new", () => {
  const c = compareRuns([issue("a", ["/1"])], [issue("a", ["/1"], { viewports: [...BOTH] }), issue("m", ["/1"], { viewports: ["mobile"] }), issue("d", ["/1"])], ["/1"], [], {
    base: ["desktop"],
    head: [...BOTH],
  });
  assert.deepEqual(fps(c.open), ["a"]);
  assert.deepEqual(fps(c.newlyChecked), ["m"]);
  assert.deepEqual(fps(c.new), ["d"]);
});

test("both scans at both widths: a mobile-only issue is new as usual", () => {
  const c = compareRuns([], [issue("m", ["/1"], { viewports: ["mobile"] })], ["/1"], [], { base: [...BOTH], head: [...BOTH] });
  assert.deepEqual(fps(c.new), ["m"]);
});

test("mobile-only issue isn't fixed by a desktop-only rescan", () => {
  const c = compareRuns([issue("m", ["/1"], { viewports: ["mobile"] })], [], ["/1"], [], { base: [...BOTH], head: ["desktop"] });
  assert.deepEqual([c.fixed.length, c.notRechecked.length], [0, 1]);
});
