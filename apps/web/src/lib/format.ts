import type { Impact, Scope } from "./types";

// Mirrors moduleLabel in apps/worker/src/aggregate.ts.
export function moduleLabel(scope: Scope, module: string | null): string {
  if (scope === "embed") return `Embed: ${module}`;
  if (module) return scope === "global" ? `${module} (global)` : module;
  if (scope === "global") return "Global (header/footer)";
  if (scope === "template") return "Template";
  return "Unknown";
}

export const SCOPE_HINT: Record<Scope, string> = {
  module: "Fix once in the module",
  global: "Header/footer — fix once, applies site-wide",
  template: "Fix in the page or blog template",
  content: "Fix in the page/post editor or CTA tool",
  embed: "Third-party embed — not fixable in the theme",
  unknown: "Couldn't locate the element",
};

// Brand chip colors; text is always ink (>= 5.09:1 on each).
export const IMPACT_STYLE: Record<Impact | "pass" | "fail", string> = {
  critical: "bg-pink",
  serious: "bg-orange",
  moderate: "bg-yellow",
  minor: "bg-tan",
  pass: "bg-mint",
  fail: "bg-pink",
};

export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search || "/";
  } catch {
    return url;
  }
}


export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export const ALT_CHECK_LABEL: Record<string, string> = {
  missing: "Missing alt",
  filename: "File name as alt",
  generic: "Generic alt",
  "empty-linked": "Empty alt on linked image",
  "too-long": "Too long",
  redundant: "Repeats nearby text",
};

export const LINK_CHECK_LABEL: Record<string, string> = {
  broken: "Broken",
  "redirect-chain": "Redirect chain",
  "redirect-to-dead": "Redirects to a dead page",
  "http-internal": "Uses http://",
  "not-checked": "Not checked (rate limited)",
  "broken-external": "Broken external link",
  "broken-anchor": "Broken anchor",
};

export const MARK_LABEL = { wont_fix: "Won't fix", false_positive: "False positive" } as const;

// Grade chips use the brand chip colors, ink text.
export const GRADE_STYLE = { A: "bg-mint", B: "bg-teal", C: "bg-yellow", D: "bg-orange", F: "bg-pink" } as const;
