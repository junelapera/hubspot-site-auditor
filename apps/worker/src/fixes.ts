// Template-based fix suggestions (Phase 1). Predictable and fast; Phase 3 swaps
// in Claude API snippets tailored to the module's actual code.
import { fileStem, imageKind, MAX_ALT_LENGTH, redundantWith, type AltCheck, type FlaggedImage, type ImageKind } from "./checks/alt.js";
import type { LinkCheck, LinkIssue } from "./checks/links.js";
import type { JsLibrary } from "./checks/libraries.js";
import type { MixedContentIssue } from "./checks/page-security.js";
import type { SecurityResult } from "./checks/security.js";
import type { FormCheck, Issue } from "./types.js";

export interface Snippet {
  lang: "html" | "hubl" | "css" | "js" | "text";
  code: string;
}

export interface FixSuggestion {
  summary: string;
  steps: string[];
  snippet?: Snippet;
  reference?: string;
}

const REVIEW_NOTE = "Suggested fix — review before applying.";

// ---------- axe rules ----------

type RuleTemplate = (issue: Issue) => Omit<FixSuggestion, "reference">;

const RULES: Record<string, RuleTemplate> = {
  "color-contrast": (issue) => {
    const c = parseContrast(issue.failureSummary);
    const facts = c
      ? `Current ratio ${c.ratio}:1 (text ${c.fg} on ${c.bg}); needs ${c.expected}.`
      : "Text contrast is below the WCAG AA minimum.";
    return {
      summary: `Raise text contrast. ${facts}`,
      steps: [
        "Darken the text color or lighten the background until the ratio is at least 4.5:1 (3:1 for large text: 24px, or 18.66px bold).",
        "If the color comes from a module style field, restrict the field's color options or set a compliant default.",
        "If the color is in the theme, fix it in the theme CSS so every page using it is fixed.",
      ],
      snippet: c
        ? {
            lang: "css",
            code: `${cssSelector(issue)} {\n  color: ${passingColor(c.fg, c.bg, parseFloat(c.expected))}; /* was ${c.fg} */\n}`,
          }
        : undefined,
    };
  },

  "image-alt": (issue) =>
    issue.scope === "content"
      ? {
          summary: "Add alt text to this image in the editor.",
          steps: [
            "Open the page or post in the HubSpot editor and select the image.",
            "Describe what the image shows or does in the Alt text field. Leave it empty only if the image is purely decorative.",
          ],
        }
      : !issue.module
        ? {
            // Template / header / footer markup: there's no module image field to read from.
            summary: "Add an alt attribute to this <img> in the template.",
            steps: [
              "Find this image in the template or partial (the element path above shows where).",
              "Describe the image, or use alt=\"\" if it's decorative. For blog author photos, use the author's name.",
            ],
            snippet: {
              lang: "hubl",
              code: `{# Blog author avatar #}\n<img src="{{ content.blog_post_author.avatar }}"\n     alt="{{ content.blog_post_author.display_name }}">\n\n{# Decorative image #}\n<img src="…" alt="">`,
            },
          }
        : {
          summary: "Output the image field's alt text in the module markup.",
          steps: [
            "In the module's HTML + HubL, render the alt value from the image field.",
            "Make sure the field's alt text is filled in on each page, or provide a sensible default.",
          ],
          snippet: {
            lang: "hubl",
            code: `{% if module.image.src %}\n  <img src="{{ module.image.src }}"\n       alt="{{ module.image.alt }}"\n       width="{{ module.image.width }}" height="{{ module.image.height }}"\n       loading="{{ module.image.loading }}">\n{% endif %}`,
          },
        },

  "link-name": () => ({
    summary: "Give the link an accessible name.",
    steps: [
      "Add visible link text, or an aria-label when the link is icon-only.",
      "For a linked image, put the destination description in the image's alt.",
    ],
    snippet: {
      lang: "html",
      code: `<a href="{{ module.link.url.href }}" aria-label="{{ module.link_label }}">\n  <svg aria-hidden="true" focusable="false">…</svg>\n</a>`,
    },
  }),

  "button-name": () => ({
    summary: "Give the button an accessible name.",
    steps: ["Add visible text, or an aria-label for icon-only buttons. Mark the icon aria-hidden."],
    snippet: {
      lang: "html",
      code: `<button type="button" aria-label="Open menu">\n  <svg aria-hidden="true" focusable="false">…</svg>\n</button>`,
    },
  }),

  label: () => ({
    summary: "Associate a label with this form control.",
    steps: [
      "Add a <label for> that matches the input's id, or an aria-label if a visible label isn't possible.",
      "A placeholder is not a label.",
    ],
    snippet: { lang: "html", code: `<label for="search-input">Search</label>\n<input id="search-input" type="search" name="q">` },
  }),

  "select-name": () => ({
    summary: "Associate a label with this select.",
    steps: ["Add a <label for> matching the select's id."],
    snippet: { lang: "html", code: `<label for="topic">Topic</label>\n<select id="topic" name="topic">…</select>` },
  }),

  "frame-title": () => ({
    summary: "Add a title to the iframe describing its content.",
    steps: ["Set a title attribute on the iframe, e.g. the video or map name."],
    snippet: { lang: "html", code: `<iframe src="…" title="Video: Customer story with Acme"></iframe>` },
  }),

  "aria-allowed-attr": () => ({
    summary: "Remove ARIA attributes the element's role doesn't support.",
    steps: ["Remove the attribute, or change the element/role to one that supports it."],
  }),

  "aria-prohibited-attr": () => ({
    summary: "Remove aria-label / aria-labelledby from an element whose role prohibits naming.",
    steps: ["Remove the attribute, or give the element a role that supports a name (e.g. role=\"group\" or \"region\")."],
  }),

  "aria-hidden-focus": () => ({
    summary: "Focusable content inside aria-hidden must not be reachable by keyboard.",
    steps: ["Add tabindex=\"-1\" (or the inert attribute) to focusable children while the container is hidden, or remove aria-hidden."],
    snippet: { lang: "js", code: `hiddenPanel.inert = true; // when collapsed\nhiddenPanel.inert = false; // when expanded` },
  }),

  "nested-interactive": () => ({
    summary: "Don't put links or buttons inside other links or buttons.",
    steps: ["Restructure so the interactive elements are siblings, e.g. make the card's title the link and stretch it with CSS."],
  }),

  list: () => ({
    summary: "Lists may only contain <li>, <script> or <template> as direct children.",
    steps: ["Wrap extra elements in <li>, or move them outside the <ul>/<ol>."],
  }),

  listitem: () => ({
    summary: "<li> must be inside a <ul> or <ol>.",
    steps: ["Wrap the items in a list element, or replace <li> with <div>."],
  }),

  "target-size": () => ({
    summary: "Make the touch target at least 24 × 24 CSS pixels.",
    steps: ["Increase padding on the control, or add spacing so neighbouring targets don't overlap the 24px area."],
    snippet: { lang: "css", code: `.social-links a {\n  display: inline-flex;\n  min-width: 24px;\n  min-height: 24px;\n}` },
  }),

  "link-in-text-block": () => ({
    summary: "Links in body text must be distinguishable without relying on color.",
    steps: ["Underline links inside text blocks, or ensure 3:1 contrast with surrounding text plus a non-color hover/focus cue."],
    snippet: { lang: "css", code: `.rich-text a {\n  text-decoration: underline;\n}` },
  }),

  "html-has-lang": () => ({
    summary: "Set the page language.",
    steps: ["HubSpot sets lang from the page's language setting. Check Settings → language on the page, or the <html> tag in a custom base template."],
    snippet: { lang: "hubl", code: `<html lang="{{ html_lang }}" {{ html_lang_dir }}>` },
  }),

  "document-title": () => ({
    summary: "Give the page a title.",
    steps: ["Fill in the page title in the page's settings; make sure the base template outputs it."],
    snippet: { lang: "hubl", code: `<title>{{ page_meta.html_title }}</title>` },
  }),
};

export function suggestAxeFix(issue: Issue): FixSuggestion {
  if (issue.scope === "embed") {
    return {
      summary: `This issue is inside a third-party embed (${issue.module}) and can't be fixed in the theme.`,
      steps: [
        "Check the provider's embed options for an accessible player or settings.",
        "Make sure the iframe itself has a descriptive title attribute.",
        "Note it as a third-party limitation in the client report.",
      ],
      reference: issue.helpUrl,
    };
  }

  const template = RULES[issue.ruleId];
  const base = template
    ? template(issue)
    : {
        summary: issue.help,
        steps: ["Follow the guidance in the linked axe rule and apply the fix in the module, template, or content shown."],
      };
  return { ...base, steps: [...base.steps, REVIEW_NOTE], reference: issue.helpUrl };
}

/** axe's color-contrast failure summary carries the measured values. */
export function parseContrast(summary: string) {
  const m =
    /contrast of ([\d.]+) \(foreground color: (#[0-9a-f]{3,8}), background color: (#[0-9a-f]{3,8}).*?Expected contrast ratio of ([\d.]+:1)/is.exec(
      summary,
    );
  return m ? { ratio: m[1], fg: m[2], bg: m[3], expected: m[4] } : null;
}

/** Nearest color to fg (same hue, darker or lighter) that meets the ratio against bg. */
export function passingColor(fg: string, bg: string, ratio: number): string {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  // Move toward black on light backgrounds, toward white on dark ones.
  const target = luminance(b) > 0.18 ? [0, 0, 0] : [255, 255, 255];
  for (let t = 0; t <= 1; t += 0.01) {
    const mixed = f.map((v, i) => Math.round(v + (target[i] - v) * t));
    if (contrast(mixed, b) >= ratio) return rgbToHex(mixed);
  }
  return rgbToHex(target);
}

function hexToRgb(hex: string): number[] {
  let h = hex.replace("#", "").slice(0, 6);
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function rgbToHex(rgb: number[]): string {
  return "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
}

function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function cssSelector(issue: Issue): string {
  const last = issue.path.split(" > ").pop() ?? "";
  const scoped = issue.module?.startsWith(".") ? `${issue.module} ${last}` : last;
  return scoped || "/* element */";
}

// ---------- alt text ----------

/** An example of good alt for each kind of image (imageKind in checks/alt.ts). */
const GOOD_ALT: Record<ImageKind, string> = {
  logo: 'the organisation\'s name, e.g. "Acme Health" (or "Acme Health home" if it links to the homepage)',
  icon: 'alt="" if the text next to it says the same thing; if it stands alone as a button or link, what it does, e.g. "Download the PDF"',
  chart: 'the main takeaway, e.g. "Bar chart: support tickets fell 40% from January to June", with the full figures in text nearby',
  person: 'who it is and why they\'re shown, e.g. "Jo Smith, Head of Marketing"',
  screenshot: 'what it shows that matters here, e.g. "HubSpot deal pipeline with six stages from Discovery to Closed won"',
  photo: 'what\'s in it that matters on this page, e.g. "Two engineers inspecting a wind turbine blade"',
};

const KIND_LABEL: Record<ImageKind, string> = {
  logo: "a logo",
  icon: "an icon",
  chart: "a chart or diagram",
  person: "a photo of a person",
  screenshot: "a screenshot",
  photo: "a photo",
};

/** Where the alt text is edited, from where the image sits. */
function altWhere(img: FlaggedImage): string {
  switch (img.location.scope) {
    case "content":
      return "Edit it in the page or post editor: click the image in the rich text, then the alt text field.";
    case "global":
      return `It's in a global module${img.location.module ? ` (${img.location.module})` : ""}: edit it once and every page updates.`;
    case "module":
      return `Edit the image field's alt text on the ${img.location.module ?? "module"}. If the module has no alt text field, add one to the module (alt="{{ module.image.alt }}").`;
    case "template":
      return "The image is in the template code: set alt there, or move it into a module field so editors can change it.";
    default:
      return "Find the image in the page editor or theme and set its alt text.";
  }
}

function quote(alt: string | null): string {
  return alt === null ? "no alt" : `"${alt.length > 80 ? `${alt.slice(0, 77)}…` : alt}"`;
}

function linkTarget(href: string | null): string | null {
  if (!href) return null;
  try {
    const u = new URL(href);
    return u.pathname === "/" ? u.hostname : u.pathname;
  } catch {
    return href;
  }
}

/**
 * One fix per failing check: why the current alt fails, an example of good alt for
 * this kind of image, and where to change it in HubSpot.
 */
export function suggestAltFix(img: FlaggedImage): FixSuggestion[] {
  const kind = imageKind(img);
  const good = `Good alt for ${KIND_LABEL[kind]}: ${GOOD_ALT[kind]}.`;
  const where = altWhere(img);
  const target = linkTarget(img.linkHref);
  // A linked logo keeps the logo advice, which already covers linking home.
  const linked =
    target && kind !== "logo"
      ? `This image links to ${target}, so its alt is the link's name: say where it goes, e.g. "Read the Acme case study".`
      : null;
  const length = img.alt?.length ?? 0;

  const fixes: Record<AltCheck, FixSuggestion> = {
    missing: {
      summary: `No alt attribute: screen readers read out the file name ("${fileStem(img.src) || "image"}") or just "image".`,
      steps: [linked ?? good, "Use alt=\"\" only if the image is purely decorative.", where, REVIEW_NOTE],
    },
    filename: {
      summary: `Alt ${quote(img.alt)} is a file name (HubSpot fills this in by default), which tells a screen reader user nothing.`,
      steps: [linked ?? good, where, REVIEW_NOTE],
    },
    generic: {
      summary: `Alt ${quote(img.alt)} says what kind of image it is, not what it shows.`,
      steps: [linked ?? good, where, REVIEW_NOTE],
    },
    "empty-linked": {
      summary: `alt="" on an image that is the only content of a link${target ? ` to ${target}` : ""}, so the link has no name.`,
      steps: [linked ?? 'Give the image alt that says where the link goes, e.g. "Read the Acme case study".', where, REVIEW_NOTE],
    },
    "too-long": {
      summary: `Alt is ${length} characters (over ${MAX_ALT_LENGTH}), which is tiring to listen to and often repeats nearby text.`,
      steps: ["Keep alt to one short sentence: what someone needs to know from the image. Move detail into a caption or the body text.", where, REVIEW_NOTE],
    },
    redundant: {
      summary: `Alt ${quote(img.alt)} repeats the ${redundantWith(img.alt, img) ?? "text"} next to it, so screen readers hear it twice.`,
      steps: ['Use alt="" if the nearby text already says what the image shows, or describe something the text doesn\'t.', where, REVIEW_NOTE],
    },
  };
  return img.checks.map((c) => fixes[c]);
}

// ---------- links ----------

/** HubSpot's bulk redirect import columns, in the order of its sample file. */
export const REDIRECT_CSV_HEADER =
  "original url,redirect to,redirect type,redirect style,priority,match query strings,ignore trailing slash,ignore protocol,disable if page exists,note";

/** One row for HubSpot's bulk redirect import: a permanent (301) redirect that steps aside if a live page appears at the old URL. */
export function redirectRow(from: string, to: string, note: string): string {
  return [from, to, "STANDARD", "301", "", "FALSE", "TRUE", "TRUE", "TRUE", note].map(csvCell).join(",");
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function redirectSnippet(from: string, to: string, note: string): Snippet {
  return { lang: "text", code: `${REDIRECT_CSV_HEADER}\n${redirectRow(from, to, note)}` };
}

export function suggestLinkFix(issue: LinkIssue): FixSuggestion {
  const final = issue.status.hops.at(-1)?.url ?? issue.url;
  const r = issue.replacement;
  const likely = r ? `Likely replacement: ${r.url} (${r.reason.charAt(0).toLowerCase()}${r.reason.slice(1)}).` : null;
  const fixes: Record<LinkCheck, FixSuggestion> = {
    broken: {
      summary: `Link returns ${issue.status.finalStatus ?? issue.status.error}.`,
      steps: r
        ? [
            likely!,
            `Update the link to ${path(r.url)}, and add a redirect from ${path(issue.url)} so other links and search results to the old URL land there too (import the row below in HubSpot URL redirects).`,
            REVIEW_NOTE,
          ]
        : ["Update the link to a live page, or add a redirect for the old URL in HubSpot URL redirects.", "No live page with a similar address was found; pick the closest page by hand."],
      snippet: r ? redirectSnippet(path(issue.url), path(r.url), "Broken link found by site audit") : undefined,
    },
    "redirect-chain": {
      summary: `Link takes ${issue.status.hops.length - 1} redirect hops before landing.`,
      steps: [
        `Update the link to point straight at ${final}.`,
        "Also update the earlier redirects in HubSpot so each one points directly to the final URL (import the row below with \"Overwrite existing redirects\" ticked).",
      ],
      snippet: redirectSnippet(path(issue.url), path(final), "Redirect chain shortened by site audit"),
    },
    "redirect-to-dead": {
      summary: `Link redirects to ${final}, which returns ${issue.status.finalStatus ?? issue.status.error}.`,
      steps: r
        ? [
            likely!,
            `Point the HubSpot redirect for ${path(issue.url)} at ${path(r.url)} (import the row below with "Overwrite existing redirects" ticked), and update the link itself.`,
            REVIEW_NOTE,
          ]
        : ["Point the HubSpot redirect at a live page, and update the link itself.", "No live page with a similar address was found; pick the closest page by hand."],
      snippet: r ? redirectSnippet(path(issue.url), path(r.url), "Redirect to a dead page fixed by site audit") : undefined,
    },
    "http-internal": {
      summary: "Internal link uses http://, adding a redirect hop and a mixed-content risk.",
      steps: ["Change the link to https:// or a relative path."],
    },
    "not-checked": {
      summary: "The site rate-limited the scanner (HTTP 429), so this link couldn't be checked.",
      steps: ["Re-run the scan later, or allow-list the scanner's IP in Cloudflare."],
    },
    "broken-external": {
      summary: issue.status.finalStatus
        ? `External link returns ${issue.status.finalStatus}.`
        : `External link's site can't be reached (${issue.status.error}).`,
      steps: [
        "Open the link in a browser to confirm it's gone, then update it to the page's new address or remove it.",
        r
          ? `${r.reason}: ${r.url}. Use it to see what the page was and search the other site for its new address; link to the archived copy only if there's no live one.`
          : "If it points to a resource that moved, search the other site for it; the Wayback Machine (web.archive.org) has no copy of this URL.",
        REVIEW_NOTE,
      ],
    },
    "broken-anchor": {
      summary: `Link jumps to #${issue.url.split("#")[1]}, but no element on ${path(issue.url.split("#")[0]) || "the page"} has that ID.`,
      steps: [
        r
          ? `The page has an ID #${r.url.split("#")[1]}, probably the one meant. Change the link's anchor to #${r.url.split("#")[1]} (IDs are case-sensitive).`
          : "Change the link to an ID that exists on the target page, or add the ID to the section it should jump to (in the module's ID / anchor field, or the rich text editor's anchor tool).",
        ...(r ? [] : ["IDs are case-sensitive; check the spelling matches exactly."]),
        REVIEW_NOTE,
      ],
    },
  };
  return fixes[issue.check];
}

// ---------- Forms ----------

export const FORM_FIX_LOCATION: Record<FormCheck, string> = {
  "missing-label": "Form editor",
  "placeholder-only": "Form editor",
  "consent-no-label": "Form editor (consent options)",
  "required-not-announced": "Theme JS or form editor",
  "errors-not-shown": "Theme JS",
  "error-not-associated": "Theme JS",
  "errors-not-announced": "Theme JS",
  "no-focus-outline": "Theme CSS",
  "not-keyboard-reachable": "Theme or form editor",
  "low-contrast": "Theme CSS",
};

// Runs when a HubSpot form (v3 embed) is ready or re-renders, so attributes survive validation.
const ON_FORM_READY = `window.addEventListener("message", (event) => {
  if (event.data.type !== "hsFormCallback" || event.data.eventName !== "onFormReady") return;
  const form = document.querySelector(\`form[data-form-id="\${event.data.id}"]\`);
  if (form) fixForm(form);
});`;

/** One fix per kind of form problem (not per field): the setting or snippet that clears it everywhere. */
export function suggestFormFix(check: FormCheck): FixSuggestion {
  const fixes: Record<FormCheck, FixSuggestion> = {
    "missing-label": {
      summary: "Give every field a label in the form editor.",
      steps: [
        "Open the form in HubSpot (Marketing > Forms) and fill in each field's label.",
        "If the design hides labels, keep them and hide them visually in the theme CSS instead of deleting them.",
        REVIEW_NOTE,
      ],
      snippet: {
        lang: "css",
        code: `/* Hide labels visually but keep them for screen readers */
.hs-form .hs-form-field > label {
  position: absolute !important;
  width: 1px; height: 1px;
  overflow: hidden; clip: rect(0 0 0 0);
  white-space: nowrap;
}`,
      },
    },
    "placeholder-only": {
      summary: "Use a real label, not just placeholder text.",
      steps: [
        "In the form editor, move the placeholder text into the field's label (placeholders disappear as soon as someone types).",
        "Keep a short hint in the help text or placeholder only if it adds something the label doesn't.",
        REVIEW_NOTE,
      ],
    },
    "consent-no-label": {
      summary: "Label the consent checkbox.",
      steps: [
        "In the form's GDPR / consent options, make sure each checkbox has its consent text set (it becomes the label).",
        "If the theme restyles checkboxes, check it doesn't hide the <label> or move its text out of it.",
        REVIEW_NOTE,
      ],
    },
    "required-not-announced": {
      summary: "Required fields show a * but screen readers aren't told they're required.",
      steps: [
        "Add aria-required to every field HubSpot marks with *, when the form loads.",
        "Also keep the * explained once at the top of the form (\"Fields marked * are required\").",
        REVIEW_NOTE,
      ],
      snippet: {
        lang: "js",
        code: `function fixForm(form) {
  form.querySelectorAll(".hs-form-field").forEach((field) => {
    if (!field.querySelector(".hs-form-required")) return;
    field.querySelectorAll("input, select, textarea").forEach((el) => el.setAttribute("aria-required", "true"));
  });
}
${ON_FORM_READY}`,
      },
    },
    "errors-not-shown": {
      summary: "An empty submit showed no error messages next to the required fields.",
      steps: [
        "Check the theme isn't hiding .hs-error-msgs, and that the form's validation runs on submit, not only on blur.",
        "Test by hand: submit the form empty with a keyboard and a screen reader.",
        REVIEW_NOTE,
      ],
    },
    "error-not-associated": {
      summary: "Error messages aren't linked to their fields, so screen readers don't read them with the field.",
      steps: [
        "When HubSpot shows an error, give it an id, point the field's aria-describedby at it, and set aria-invalid.",
        REVIEW_NOTE,
      ],
      snippet: {
        lang: "js",
        code: `// Link HubSpot error messages to their fields as they appear.
new MutationObserver(() => {
  document.querySelectorAll(".hs-form .hs-form-field").forEach((field, i) => {
    const input = field.querySelector("input, select, textarea");
    const error = field.querySelector(".hs-error-msgs");
    if (!input) return;
    if (error) {
      error.id ||= \`hs-error-\${i}\`;
      input.setAttribute("aria-describedby", error.id);
      input.setAttribute("aria-invalid", "true");
    } else {
      input.removeAttribute("aria-invalid");
    }
  });
}).observe(document.body, { childList: true, subtree: true });`,
      },
    },
    "errors-not-announced": {
      summary: "Errors appear silently: screen reader users aren't told the submit failed.",
      steps: [
        "Move focus to the first invalid field after a failed submit, or put the error summary in a role=\"alert\" region.",
        REVIEW_NOTE,
      ],
      snippet: {
        lang: "js",
        code: `// After a failed submit, focus the first field with an error.
document.addEventListener("submit", () => {
  setTimeout(() => {
    const invalid = document.querySelector(".hs-form .hs-form-field .hs-error-msgs");
    invalid?.closest(".hs-form-field")?.querySelector("input, select, textarea")?.focus();
  }, 100);
}, true);`,
      },
    },
    "no-focus-outline": {
      summary: "Fields and buttons don't show where keyboard focus is.",
      steps: [
        "Add a visible focus style for form fields and the submit button in the theme CSS (at least 3:1 against the background).",
        "Remove any outline: none on .hs-input / .hs-button that isn't replaced by another focus style.",
        REVIEW_NOTE,
      ],
      snippet: {
        lang: "css",
        code: `.hs-form .hs-input:focus-visible,
.hs-form .hs-button:focus-visible,
.hs-form input[type="checkbox"]:focus-visible,
.hs-form input[type="radio"]:focus-visible {
  outline: 3px solid currentColor;
  outline-offset: 2px;
}`,
      },
    },
    "not-keyboard-reachable": {
      summary: "Some fields or the submit button can't be reached with Tab.",
      steps: [
        "Look for tabindex=\"-1\" on fields or the button, or a custom control (styled checkbox, dropdown) that replaced the real input.",
        "Keep the native input focusable and style it, rather than hiding it and drawing a fake one.",
        REVIEW_NOTE,
      ],
    },
    "low-contrast": {
      summary: "Placeholder or error text doesn't have enough contrast (4.5:1).",
      steps: ["Darken the placeholder and error text colours in the theme CSS until they reach 4.5:1 against the field background.", REVIEW_NOTE],
      snippet: {
        lang: "css",
        code: `.hs-form .hs-input::placeholder { color: #595959; }   /* 7:1 on white */
.hs-form .hs-error-msg, .hs-form .hs-error-msgs label { color: #b3261e; }   /* 6.5:1 on white */`,
      },
    },
  };
  return fixes[check];
}

// ---------- JavaScript libraries ----------

// Scripts HubSpot serves itself (forms, chat, banner, analytics): not in the theme.
const HUBSPOT_SCRIPT_HOST = /(^|\.)(hubspot|hsappstatic|hs-scripts|hsforms|hs-analytics|hs-banner|hsadspixel|usemessages|hscollectedforms)\.(com|net)$/;

export function isHubSpotScript(url: string): boolean {
  try {
    const u = new URL(url);
    return u.pathname.startsWith("/_hcms/") || HUBSPOT_SCRIPT_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

export function suggestLibraryFix(lib: JsLibrary): FixSuggestion | null {
  if (!lib.severity) return null;
  const cveCount = lib.vulnerabilities.reduce((n, v) => n + v.cves.length, 0);
  const summary =
    `${lib.component} ${lib.version} has ${lib.vulnerabilities.length} known ${lib.vulnerabilities.length === 1 ? "vulnerability" : "vulnerabilities"}` +
    (cveCount ? ` (${cveCount} CVE${cveCount === 1 ? "" : "s"})` : "") +
    ".";
  const reference = lib.vulnerabilities.find((v) => v.info)?.info;

  if (lib.urls.every(isHubSpotScript)) {
    return {
      summary: `${summary} It's bundled in a script HubSpot serves (forms, chat, banner or analytics), not in the theme.`,
      steps: [
        "Nothing to change in the theme or modules: HubSpot updates these scripts itself.",
        "For a SecurityScorecard or client response, note that the library is part of HubSpot's platform code, and raise it with HubSpot support if it persists.",
        REVIEW_NOTE,
      ],
      reference,
    };
  }
  return {
    summary,
    steps: [
      `Update ${lib.component} to the latest version, then check the pages that use it still work (jQuery majors in particular change behaviour; jQuery Migrate helps).`,
      "If the theme bundles it, update the file in the theme. If a module or embed loads it, update that module's or embed's code.",
      "If nothing on the site uses it any more, remove it.",
      REVIEW_NOTE,
    ],
    reference,
  };
}

// ---------- Mixed content ----------

export function suggestMixedContentFix(issue: MixedContentIssue): FixSuggestion {
  const https = issue.url.replace(/^http:/, "https:");
  const where = !issue.location
    ? "Search the theme CSS and JS (and any embed code) for this URL; the browser loaded it from a stylesheet or script, not the page markup."
    : issue.location.scope === "content"
      ? "Edit the URL in the page or post editor (or the CTA tool)."
      : "Edit the URL in the module or template field that holds it; global modules fix every page at once.";
  return {
    summary: issue.blocked
      ? `Browsers block this http:// ${issue.kind}, so it doesn't load at all on the HTTPS page.`
      : `Browsers upgrade or warn about this http:// ${issue.kind}; it breaks if the host has no HTTPS.`,
    steps: [
      `Change it to ${https} (check that the HTTPS address loads first), or upload the file to HubSpot File Manager.`,
      where,
      REVIEW_NOTE,
    ],
    snippet: { lang: "text", code: https },
  };
}

function path(u: string): string {
  try {
    const url = new URL(u);
    return url.pathname + url.search;
  } catch {
    return u;
  }
}

// ---------- security ----------

export function suggestSecurityFix(result: SecurityResult): FixSuggestion | null {
  if (result.pass) return null;
  return {
    summary: `${result.name}: currently "${result.current}".`,
    steps: [
      `Set it to: ${result.recommended}.`,
      `Where: ${result.fixLocation}.`,
      ...(result.id === "header-csp"
        ? ["Deploy as Content-Security-Policy-Report-Only first; HubSpot sites load scripts from many HubSpot and tracking domains."]
        : []),
      ...(result.id === "mixed-content" ? ["Each resource, the module it sits in and the pages it's on are listed under Mixed content below."] : []),
      ...(result.id === "cookies"
        ? ["Leave HttpOnly off only for a cookie that the site's own JavaScript must read.", "Cloudflare's own cookies (__cf_bm, _cfuvid) are set by Cloudflare; check its settings before changing anything at the origin."]
        : []),
      REVIEW_NOTE,
    ],
  };
}
