import assert from "node:assert/strict";
import { test } from "node:test";
import { accessibilityScore, securityGrade } from "../scores";

test("accessibility score averages page scores; clean pages count as 100", () => {
  // /1 loses 15 + 8, /2 loses 8; two more pages are clean.
  const score = accessibilityScore(
    [
      { impact: "critical", pages: ["/1"] },
      { impact: "serious", pages: ["/1", "/2"] },
    ],
    4,
  );
  assert.equal(score, Math.round((77 + 92 + 100 + 100) / 4));
});

test("accessibility score floors each page at 0 and is null with no pages", () => {
  const many = Array.from({ length: 10 }, () => ({ impact: "critical" as const, pages: ["/1"] }));
  assert.equal(accessibilityScore(many, 1), 0);
  assert.equal(accessibilityScore([], 0), null);
  assert.equal(accessibilityScore([], 3), 100);
});

test("security grade from failed checks", () => {
  const pass = (check_id: string) => ({ check_id, pass: true });
  const fail = (check_id: string) => ({ check_id, pass: false });
  assert.deepEqual(securityGrade([pass("hsts"), pass("header-csp")]), { grade: "A", points: 100 });
  assert.deepEqual(securityGrade([fail("hsts"), fail("header-csp"), fail("https-redirect")]), { grade: "C", points: 70 });
  assert.deepEqual(securityGrade([fail("tls-legacy"), fail("tls-cert-expiry"), fail("something-new")]), { grade: "F", points: 55 });
  assert.equal(securityGrade([]), null);
});
