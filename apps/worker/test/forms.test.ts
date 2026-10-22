import assert from "node:assert/strict";
import { test } from "node:test";
import { auditForms, errorFindings, focusIsVisible, staticFindings, type FieldInfo } from "../src/checks/forms.js";
import type { Location, PageForm, PageResult } from "../src/types.js";

const style = { outline: "none", boxShadow: "none", border: "a", background: "b", around: "c" };
const field = (over: Partial<FieldInfo>): FieldInfo => ({
  index: 0, label: "Email*", type: "email", name: "email", hasName: true, placeholder: "", consent: false,
  looksRequired: true, announcedRequired: true, placeholderContrast: null, empty: true, tabIndex: 0, style, ...over,
});

test("static: labels, placeholder-only, consent, required, placeholder contrast", () => {
  const f = staticFindings([
    field({ label: "email", hasName: false }),
    field({ label: "Your email", hasName: false, placeholder: "Your email" }),
    field({ label: "LEGAL_CONSENT.x", hasName: false, consent: true, type: "checkbox" }),
    field({ label: "Phone*", announcedRequired: false }),
    field({ label: "Name", looksRequired: false, announcedRequired: false, placeholder: "Jo", placeholderContrast: 2.5 }),
    field({}),
  ]);
  assert.deepEqual(f.map((x) => [x.check, x.field]), [
    ["missing-label", "email"],
    ["placeholder-only", "Your email"],
    ["consent-no-label", "LEGAL_CONSENT.x"],
    ["required-not-announced", "Phone*"],
    ["low-contrast", "Name"],
  ]);
});

test("focus is visible with an outline, or any change on or around the field", () => {
  assert.ok(!focusIsVisible(style, style));
  assert.ok(focusIsVisible(style, { ...style, outline: "solid 2px rgb(0, 0, 0)" }));
  assert.ok(!focusIsVisible(style, { ...style, outline: "solid 2px rgba(0, 0, 0, 0)" }));
  assert.ok(focusIsVisible(style, { ...style, border: "z" }));
  assert.ok(focusIsVisible(style, { ...style, around: "focus-within" }));
});

test("errors: not shown, not linked, not announced", () => {
  const fields = [field({ index: 0 }), field({ index: 1, label: "Name" })];
  assert.deepEqual(errorFindings(fields, { fields: [{ index: 0, error: null }], focusedField: null }).map((f) => f.check), ["errors-not-shown"]);
  assert.deepEqual(errorFindings([field({ looksRequired: false, announcedRequired: false })], { fields: [{ index: 0, error: null }], focusedField: null }), []);

  const silent = errorFindings(fields, {
    fields: [{ index: 0, error: "Required", associated: false, invalid: false, live: false }, { index: 1, error: "Required", associated: true, live: false }],
    focusedField: null,
  });
  assert.deepEqual(silent.map((f) => [f.check, f.field]), [["error-not-associated", "Email*"], ["errors-not-announced", null]]);

  // Focus moving to an invalid field counts as announcing it.
  const focused = errorFindings(fields, { fields: [{ index: 0, error: "Required", associated: true, live: false }], focusedField: "0" });
  assert.deepEqual(focused, []);
});

const loc: Location = { scope: "global", module: "HubSpot form", named: true, partial: null, path: "form" };
const page = (url: string, forms: PageForm[]): PageResult => ({
  url, status: 200, redirected: false, findings: [], images: [], links: [], insecure: [], cookies: [], scripts: [], libraries: [], anchors: [], forms,
});

test("forms aggregate by form ID across pages; iframes are not checked", () => {
  const tested: PageForm = {
    index: 0, formId: "abc", label: "Subscribe", crossOrigin: false, src: null, location: loc,
    test: { fieldCount: 1, submitted: true, blockedRequests: 0, findings: [{ check: "low-contrast", field: null, detail: "x" }, { check: "missing-label", field: "e", detail: "y" }] },
  };
  const again: PageForm = { ...tested, test: undefined };
  const frame: PageForm = { index: -1, formId: "share.hsforms.com/x", label: null, crossOrigin: true, src: "https://share.hsforms.com/x", location: loc };
  const forms = auditForms([page("https://a.com/1", [tested, frame]), page("https://a.com/2", [again])]);

  assert.equal(forms.length, 2);
  assert.equal(forms[0].formId, "abc");
  assert.equal(forms[0].status, "checked");
  assert.deepEqual(forms[0].pages, ["https://a.com/1", "https://a.com/2"]);
  assert.deepEqual(forms[0].findings.map((f) => f.check), ["missing-label", "low-contrast"], "sorted by check order");
  assert.equal(forms[1].status, "not-checked");
  assert.match(forms[1].note ?? "", /cross-origin iframe/);
});
