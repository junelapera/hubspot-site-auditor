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

export const IMPACT_STYLE: Record<Impact | "pass" | "fail", string> = {
  critical: "bg-red-100 text-red-800 ring-red-200",
  serious: "bg-orange-100 text-orange-800 ring-orange-200",
  moderate: "bg-amber-100 text-amber-800 ring-amber-200",
  minor: "bg-slate-100 text-slate-700 ring-slate-200",
  pass: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  fail: "bg-red-100 text-red-800 ring-red-200",
};

export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search || "/";
  } catch {
    return url;
  }
}

export function timeAgo(iso: string): string {
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
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
};
