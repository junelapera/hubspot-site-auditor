// Form check: labels, required state, error messages, focus outline, keyboard
// reachability and contrast for each HubSpot form, tested once per scan.
//
// Forms are only ever submitted EMPTY, and only after every non-GET request from
// the page is blocked, so nothing can reach HubSpot and no contact is created.
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "playwright";
import type { FormCheck, FormFinding, FormTest, Location, PageForm, PageResult } from "../types.js";

const FORMS_SRC = readFileSync(new URL("../browser/forms.js", import.meta.url), "utf8");

const CONTRAST_MIN = 4.5;
const SUBMIT_WAIT_MS = 1_500;

interface FocusStyle {
  outline: string;
  boxShadow: string;
  border: string;
  background: string;
  /** Wrapper, field container and label styles, for focus shown with :focus-within. */
  around: string;
}

export interface FieldInfo {
  index: number;
  label: string;
  type: string;
  name: string | null;
  hasName: boolean;
  placeholder: string;
  consent: boolean;
  looksRequired: boolean;
  announcedRequired: boolean;
  placeholderContrast: number | null;
  empty: boolean;
  tabIndex: number;
  style: FocusStyle;
}

interface FieldsResult {
  submit: { label: string; style: FocusStyle; tabIndex: number } | null;
  fields: FieldInfo[];
}

export interface ErrorsResult {
  fields: { index: number; error: string | null; associated?: boolean; invalid?: boolean; live?: boolean }[];
  focusedField: string | null;
}

const evaluate = <T>(page: Page, args: { action: string; index: number }) =>
  page.evaluate(`(${FORMS_SRC})(${JSON.stringify(args)})`) as Promise<T>;

// ---------- Pure checks (unit-tested) ----------

/** Labels, required state, consent and placeholder contrast: from the markup alone. */
export function staticFindings(fields: FieldInfo[]): FormFinding[] {
  const findings: FormFinding[] = [];
  for (const f of fields) {
    if (!f.hasName) {
      if (f.consent) findings.push({ check: "consent-no-label", field: f.label, detail: "Consent checkbox has no label a screen reader can read" });
      else if (f.placeholder) findings.push({ check: "placeholder-only", field: f.label, detail: "Only a placeholder, which disappears on typing and isn't a reliable label" });
      else findings.push({ check: "missing-label", field: f.label, detail: "No label, aria-label or aria-labelledby" });
    }
    if (f.looksRequired && !f.announcedRequired) {
      findings.push({ check: "required-not-announced", field: f.label, detail: "Marked required with * but has no required or aria-required attribute" });
    }
    if (f.placeholderContrast !== null && f.placeholderContrast < CONTRAST_MIN) {
      findings.push({ check: "low-contrast", field: f.label, detail: `Placeholder text ${f.placeholderContrast}:1 (needs ${CONTRAST_MIN}:1)` });
    }
  }
  return findings;
}

/** Focused looks different from unfocused: an outline, or a changed shadow, border or background on it or around it. */
export function focusIsVisible(before: FocusStyle, after: FocusStyle): boolean {
  if (after.outline !== "none" && !/transparent|rgba\([^)]*,\s*0\)/.test(after.outline)) return true;
  return (
    after.boxShadow !== before.boxShadow ||
    after.border !== before.border ||
    after.background !== before.background ||
    after.around !== before.around
  );
}

/** What an empty submit showed: errors shown at all, tied to their field, and announced. */
export function errorFindings(fields: FieldInfo[], errors: ErrorsResult): FormFinding[] {
  const required = fields.filter((f) => f.looksRequired || f.announcedRequired);
  const shown = errors.fields.filter((e) => e.error);
  if (!shown.length) {
    return required.length
      ? [{ check: "errors-not-shown", field: null, detail: "Submitting the form empty showed no error next to any required field" }]
      : [];
  }
  const findings: FormFinding[] = [];
  for (const e of shown) {
    if (!e.associated) {
      findings.push({
        check: "error-not-associated",
        field: fields[e.index]?.label ?? null,
        detail: `Error "${e.error}" isn't linked to the field with aria-describedby${e.invalid ? "" : ", and the field isn't marked aria-invalid"}`,
      });
    }
  }
  const focusMoved = errors.focusedField !== null && shown.some((e) => String(e.index) === errors.focusedField);
  if (!shown.some((e) => e.live) && !focusMoved) {
    findings.push({
      check: "errors-not-announced",
      field: null,
      detail: "Errors appear silently: not in a live region or role=alert, and focus doesn't move to the first invalid field",
    });
  }
  return findings;
}

// ---------- Browser test ----------

/** Test one tagged form on an open page. Leaves every non-GET request blocked for the rest of the page's life. */
export async function testForm(page: Page, index: number): Promise<FormTest> {
  const info = await evaluate<FieldsResult | null>(page, { action: "fields", index });
  if (!info) throw new Error("Form disappeared before it could be tested");
  const findings = staticFindings(info.fields);

  // Keyboard: Tab from the first field through the form, noting what gets focus and whether it shows.
  const reached = new Set<string>();
  const noOutline: string[] = [];
  const targets = info.fields.length + (info.submit ? 1 : 0);
  if (info.fields.length) {
    await page.focus(`[data-audit-form="${index}"] [data-audit-field="0"]`);
    for (let i = 0; i < targets + 5; i++) {
      const active = await evaluate<{ inForm: boolean; field?: string | null; style?: FocusStyle }>(page, { action: "active", index });
      if (!active.inForm) break;
      if (active.field != null && !reached.has(active.field)) {
        reached.add(active.field);
        const before = active.field === "submit" ? info.submit?.style : info.fields[Number(active.field)]?.style;
        const label = active.field === "submit" ? `${info.submit?.label} button` : info.fields[Number(active.field)]?.label;
        if (before && active.style && !focusIsVisible(before, active.style)) noOutline.push(label ?? "field");
      }
      await page.keyboard.press("Tab");
    }
    // A radio group is one Tab stop: reaching any of its options counts.
    const reachedNames = new Set(info.fields.filter((f) => reached.has(String(f.index))).map((f) => f.name));
    for (const f of info.fields) {
      if (reached.has(String(f.index)) || (f.type === "radio" && reachedNames.has(f.name))) continue;
      findings.push({ check: "not-keyboard-reachable", field: f.label, detail: "Tab skips this field" });
    }
    if (info.submit && !reached.has("submit")) {
      findings.push({ check: "not-keyboard-reachable", field: `${info.submit.label} button`, detail: "Tab never reaches the submit button" });
    }
    for (const label of noOutline) {
      findings.push({ check: "no-focus-outline", field: label, detail: "Looks the same focused and unfocused" });
    }
  }

  // Empty submit, with every non-GET request blocked so nothing can be sent.
  const required = info.fields.filter((f) => f.looksRequired || f.announcedRequired);
  const notSubmittedReason = !info.submit
    ? "No submit button found"
    : !required.length
      ? "No required fields, so an empty submit wouldn't show errors"
      : info.fields.some((f) => !f.empty)
        ? "Some fields were pre-filled"
        : undefined;
  if (notSubmittedReason) return { fieldCount: info.fields.length, submitted: false, notSubmittedReason, blockedRequests: 0, findings };

  let blockedRequests = 0;
  await page.route("**/*", (route) => {
    if (["GET", "HEAD", "OPTIONS"].includes(route.request().method())) return route.fallback();
    blockedRequests++;
    return route.abort("blockedbyclient");
  });
  await page.evaluate(`document.querySelector('[data-audit-form="${index}"] [data-audit-field="submit"]').click()`);
  await page.waitForTimeout(SUBMIT_WAIT_MS);
  const errors = await evaluate<ErrorsResult>(page, { action: "errors", index });
  findings.push(...errorFindings(info.fields, errors));

  // Error text contrast: axe's own check, now that the errors are showing.
  const axe = await new AxeBuilder({ page }).include(`[data-audit-form="${index}"]`).withRules(["color-contrast"]).analyze();
  for (const node of axe.violations.flatMap((v) => v.nodes)) {
    if (!/hs-error-msg|role="alert"|error/i.test(node.html)) continue;
    const ratio = /contrast of ([\d.]+)/.exec(node.failureSummary ?? "")?.[1];
    findings.push({ check: "low-contrast", field: null, detail: `Error text${ratio ? ` ${ratio}:1` : ""} (needs ${CONTRAST_MIN}:1)` });
  }

  return { fieldCount: info.fields.length, submitted: true, blockedRequests, findings: dedupe(findings) };
}

function dedupe(findings: FormFinding[]): FormFinding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.check}|${f.field}|${f.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------- Aggregation ----------

export interface FormSummary {
  formId: string;
  label: string | null;
  kind: "hubspot" | "iframe";
  status: "checked" | "not-checked";
  /** Why it wasn't checked, or why it wasn't submitted. */
  note: string | null;
  submitted: boolean;
  fieldCount: number;
  findings: FormFinding[];
  location: Location;
  pages: string[];
}

export const FORM_CHECK_ORDER: FormCheck[] = [
  "missing-label",
  "placeholder-only",
  "consent-no-label",
  "not-keyboard-reachable",
  "required-not-announced",
  "errors-not-shown",
  "error-not-associated",
  "errors-not-announced",
  "no-focus-outline",
  "low-contrast",
];

/** One row per form (by HubSpot form ID), with every page it's on. Forms with failing checks first. */
export function auditForms(pages: PageResult[]): FormSummary[] {
  const byId = new Map<string, FormSummary>();
  for (const page of pages) {
    for (const f of page.forms ?? []) {
      let summary = byId.get(f.formId);
      if (!summary) {
        summary = {
          formId: f.formId,
          label: f.label,
          kind: f.crossOrigin ? "iframe" : "hubspot",
          status: "not-checked",
          note: f.crossOrigin ? `In a cross-origin iframe (${f.src}): test it by hand` : null,
          submitted: false,
          fieldCount: 0,
          findings: [],
          location: f.location,
          pages: [],
        };
        byId.set(f.formId, summary);
      }
      if (!summary.pages.includes(page.url)) summary.pages.push(page.url);
      applyTest(summary, f);
    }
  }
  const order = (c: FormCheck) => FORM_CHECK_ORDER.indexOf(c);
  for (const s of byId.values()) s.findings.sort((a, b) => order(a.check) - order(b.check));
  return [...byId.values()].sort((a, b) => b.findings.length - a.findings.length || b.pages.length - a.pages.length);
}

function applyTest(summary: FormSummary, f: PageForm) {
  if (f.crossOrigin || summary.status === "checked") return;
  if (f.test) {
    summary.status = "checked";
    summary.submitted = f.test.submitted;
    summary.note = f.test.notSubmittedReason ? `Not submitted: ${f.test.notSubmittedReason.toLowerCase()}` : null;
    summary.fieldCount = f.test.fieldCount;
    summary.findings = f.test.findings;
  } else if (f.testError) {
    summary.note = `Couldn't be tested: ${f.testError}`;
  }
}
