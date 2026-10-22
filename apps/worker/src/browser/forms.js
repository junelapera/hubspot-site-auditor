// Runs inside the scanned page. Kept as plain JS (not compiled by tsx) so
// page.evaluate gets exactly this source.
//
// Checks one form that inspect.js tagged with data-audit-form="<index>".
// Input:  { action, index }
//   "fields" → tags fields with data-audit-field, returns static checks and
//              each field's unfocused style
//   "active" → which tagged field has focus, and its style
//   "errors" → after an empty submit: error messages and how they're tied to fields
(function forms({ action, index }) {
  const form = document.querySelector(`[data-audit-form="${index}"]`);
  if (!form) return null;

  const FIELD = "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=image]):not([type=reset]), select, textarea";
  const SUBMIT = "input[type=submit], button[type=submit], button:not([type])";

  function isVisible(el) {
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && (box.width > 0 || box.height > 0) && !el.closest("[hidden]");
  }

  function text(el) {
    return (el ? el.textContent : "").replace(/\s+/g, " ").trim();
  }

  function accessibleName(el) {
    const labelledby = (el.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean);
    if (labelledby.length) {
      const name = labelledby.map((id) => text(document.getElementById(id))).join(" ").trim();
      if (name) return name;
    }
    const aria = (el.getAttribute("aria-label") || "").trim();
    if (aria) return aria;
    const labels = el.labels ? [...el.labels] : [];
    const fromLabels = labels.map(text).join(" ").trim();
    if (fromLabels) return fromLabels;
    return (el.getAttribute("title") || "").trim();
  }

  function fieldLabel(el) {
    return accessibleName(el) || el.getAttribute("placeholder") || el.getAttribute("name") || el.tagName.toLowerCase();
  }

  // HubSpot marks required fields with <span class="hs-form-required">*</span> in the label.
  function looksRequired(el) {
    const field = el.closest(".hs-form-field, .field, fieldset") || el.parentElement;
    if (field && field.querySelector(".hs-form-required")) return true;
    const label = el.labels && el.labels[0];
    return Boolean(label && /\*\s*$/.test(text(label)));
  }

  function isAnnouncedRequired(el) {
    if (el.required || el.getAttribute("aria-required") === "true") return true;
    // A required checkbox / radio group is announced on its group.
    const group = el.closest("[role=group], [role=radiogroup], fieldset");
    return Boolean(group && group.getAttribute("aria-required") === "true");
  }

  function look(el) {
    if (!el) return "";
    const s = getComputedStyle(el);
    const outline = s.outlineStyle === "none" || parseFloat(s.outlineWidth) === 0 ? "none" : `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`;
    return [outline, s.boxShadow, s.borderTopColor, s.borderBottomColor, s.borderTopWidth, s.borderBottomWidth, s.backgroundColor, s.color].join(" | ");
  }

  function focusStyle(el) {
    const s = getComputedStyle(el);
    // Themes often show focus on the wrapper (:focus-within) or the label instead of the input.
    const field = el.closest(".hs-form-field, .field");
    const label = el.labels && el.labels[0];
    return {
      outline: s.outlineStyle === "none" || parseFloat(s.outlineWidth) === 0 ? "none" : `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
      boxShadow: s.boxShadow,
      border: `${s.borderTopColor} ${s.borderBottomColor} ${s.borderTopWidth} ${s.borderBottomWidth}`,
      background: s.backgroundColor,
      around: [look(el.parentElement), field !== el.parentElement ? look(field) : "", look(label)].join(" || "),
    };
  }

  // ---------- Contrast (placeholder text) ----------

  function parseColor(c) {
    const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(c || "");
    if (!m) return null;
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }

  function background(el) {
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const c = parseColor(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0.99) return c;
      if (getComputedStyle(node).backgroundImage !== "none") return null; // image or gradient: can't tell
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  function luminance({ r, g, b }) {
    const [R, G, B] = [r, g, b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  }

  function contrast(fg, bg) {
    const mixed = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
    const [l1, l2] = [luminance(mixed), luminance(bg)].sort((a, b) => b - a);
    return (l1 + 0.05) / (l2 + 0.05);
  }

  function placeholderContrast(el) {
    if (!el.getAttribute("placeholder")) return null;
    const fg = parseColor(getComputedStyle(el, "::placeholder").color);
    const bg = background(el);
    if (!fg || !bg) return null;
    return Math.round(contrast(fg, bg) * 100) / 100;
  }

  // ---------- Actions ----------

  const fields = [...form.querySelectorAll(FIELD)].filter(isVisible);
  const submit = [...form.querySelectorAll(SUBMIT)].find(isVisible) || null;

  if (action === "fields") {
    // Read finished styles, not mid-transition ones.
    if (!document.getElementById("audit-no-transitions")) {
      const style = document.createElement("style");
      style.id = "audit-no-transitions";
      style.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
      document.head.appendChild(style);
    }
    fields.forEach((el, i) => el.setAttribute("data-audit-field", String(i)));
    if (submit) submit.setAttribute("data-audit-field", "submit");

    return {
      submit: submit ? { label: (submit.value || text(submit) || "Submit").trim(), style: focusStyle(submit), tabIndex: submit.tabIndex } : null,
      fields: fields.map((el, i) => ({
        index: i,
        label: fieldLabel(el),
        type: el.type || el.tagName.toLowerCase(),
        name: el.getAttribute("name"),
        hasName: Boolean(accessibleName(el)),
        placeholder: el.getAttribute("placeholder") || "",
        consent: Boolean(el.closest(".legal-consent-container")) || /^LEGAL_CONSENT/.test(el.getAttribute("name") || ""),
        looksRequired: looksRequired(el),
        announcedRequired: isAnnouncedRequired(el),
        placeholderContrast: placeholderContrast(el),
        empty: el.type === "checkbox" || el.type === "radio" ? !el.checked : el.tagName === "SELECT" ? !el.value : el.value === "",
        tabIndex: el.tabIndex,
        style: focusStyle(el),
      })),
    };
  }

  if (action === "active") {
    const el = document.activeElement;
    if (!el || !form.contains(el)) return { inForm: false };
    return { inForm: true, field: el.getAttribute("data-audit-field"), style: focusStyle(el) };
  }

  if (action === "errors") {
    const active = document.activeElement;
    const results = fields.map((el, i) => {
      const container = el.closest(".hs-form-field, .field") || el.parentElement;
      const errorEl = container && [...container.querySelectorAll(".hs-error-msgs, .hs-error-msg, [role=alert], .error-message")].find((e) => isVisible(e) && text(e));
      if (!errorEl) return { index: i, error: null };
      const describedby = [
        ...(el.getAttribute("aria-describedby") || "").split(/\s+/),
        ...(el.getAttribute("aria-errormessage") || "").split(/\s+/),
      ].filter(Boolean);
      const associated = describedby.some((id) => {
        const target = document.getElementById(id);
        return target && (target === errorEl || target.contains(errorEl) || errorEl.contains(target));
      });
      const live = errorEl.closest("[role=alert], [aria-live=polite], [aria-live=assertive], [role=status]");
      return { index: i, error: text(errorEl).slice(0, 200), associated, invalid: el.getAttribute("aria-invalid") === "true", live: Boolean(live) };
    });
    const focusedField = active && form.contains(active) ? active.getAttribute("data-audit-field") : null;
    return { fields: results, focusedField };
  }

  return null;
})
