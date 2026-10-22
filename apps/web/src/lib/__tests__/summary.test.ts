import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeModules } from "../summary";

const i = (module: string, impact: "critical" | "minor", pages: string[], rule_id = "r") =>
  ({ scope: "module" as const, module, named: true, impact, rule_id, pages });

test("groups by module, unions pages, keeps worst severity, sorts by weight", () => {
  const rows = summarizeModules([
    i(".a", "minor", ["/1", "/2"]),
    i(".a", "critical", ["/2", "/3"], "x"),
    i(".b", "minor", ["/1"]),
  ]);
  assert.deepEqual(rows.map((r) => r.module), [".a", ".b"]);
  assert.equal(rows[0].issue_count, 2);
  assert.equal(rows[0].pages_affected, 3);
  assert.equal(rows[0].worst_impact, "critical");
  assert.deepEqual(rows[0].rules, ["r", "x"]);
  assert.equal(rows[0].weight, 2 * 1 + 2 * 4);
});
