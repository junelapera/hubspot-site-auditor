// Row shapes for the tables in supabase/migrations. The worker writes these;
// the web app only reads them (and inserts sites and queued runs).

export type Scope = "module" | "global" | "template" | "content" | "embed" | "unknown";
export type Impact = "critical" | "serious" | "moderate" | "minor";
export type RunStatus = "queued" | "running" | "done" | "failed";
/** Window width axe ran at: desktop 1366px, mobile 390px. */
export type Viewport = "desktop" | "mobile";

export interface Snippet {
  lang: "html" | "hubl" | "css" | "js" | "text";
  code: string;
}

export interface Fix {
  summary: string;
  steps: string[];
  snippet?: Snippet;
  reference?: string;
}

export interface Site {
  id: string;
  domain: string;
  name: string | null;
  include_paths: string[];
  exclude_paths: string[];
  page_limit: number;
  created_at: string;
}

export interface RunSummary {
  issues: number;
  modules: number;
  imagesFlagged: number;
  linkIssues: number;
  securityFailed: number;
  rawFindings: number;
  pagesScanned: number;
  pagesFailed: number;
  /** External link URLs requested / left out (skip list or cap). Missing on older scans. */
  externalLinksChecked?: number;
  externalLinksSkipped?: number;
  namedModuleRate: number;
  durationMs: number;
  /** Missing on scans from before these checks existed. */
  mixedContent?: number;
  scriptDomains?: number;
  /** null: the Retire.js database couldn't be downloaded, so libraries weren't checked. */
  jsLibraries?: number | null;
  jsLibrariesVulnerable?: number | null;
  forms?: number;
  formIssues?: number;
  /** Widths axe ran at. Missing on desktop-only scans from before the mobile pass. */
  viewports?: Viewport[];
  /** Pages whose mobile pass failed (their issues are desktop only). */
  mobileFailed?: number;
  /** Sampled scans: sitemap pages, pages read, modules found and covered. */
  sample?: { discovered: number; fetched: number; modules: number; covered: number } | null;
}

/** audit: the full scan. redirects: an old-URL redirect check (options.oldUrls), with its own summary and report. */
export type RunKind = "audit" | "redirects";

export interface Run {
  id: string;
  site_id: string;
  kind: RunKind;
  status: RunStatus;
  /** Crawl settings at queue time; urls / extraUrls for a pasted page list; oldUrls for a redirect check. */
  options: { include?: string[]; exclude?: string[]; limit?: number; urls?: string[]; extraUrls?: string[]; sample?: boolean; oldUrls?: string[] };
  stage: string | null;
  pages_total: number | null;
  pages_done: number;
  error: string | null;
  /** A redirect check's summary is a RedirectCheckSummary instead: read it with redirectSummary(). */
  summary: RunSummary | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export type OldUrlStatus = "live" | "redirected" | "missing" | "redirect-to-dead" | "redirect-home" | "redirect-chain" | "not-checked" | "error";

/** runs.summary of a redirect check. Mirrors RedirectCheckResult.stats in apps/worker/src/pipeline.ts. */
export interface RedirectCheckSummary {
  total: number;
  /** Lines that weren't a URL or path, left out. */
  invalid: number;
  counts: Record<OldUrlStatus, number>;
  /** Problems with a likely new page. */
  suggested: number;
  /** False when the new site's sitemap couldn't be read: no suggestions then. */
  sitemapRead: boolean;
  durationMs: number;
}

export interface OldUrlRow {
  id: number;
  /** As listed in the old sitemap. */
  url: string;
  /** Its path and query on this site: what was requested. */
  checked_url: string;
  status: OldUrlStatus;
  hops: { url: string; status: number }[];
  final_status: number | null;
  error: string | null;
  replacement: { url: string; reason: string } | null;
}

export interface ModuleSummaryRow {
  run_id: string;
  scope: Scope;
  module: string | null;
  named: boolean;
  issue_count: number;
  worst_impact: Impact;
  pages_affected: number;
  rules: string[];
  weight: number;
}

export interface IssueRow {
  id: number;
  fingerprint: string;
  rule_id: string;
  impact: Impact;
  help: string;
  help_url: string;
  tags: string[];
  scope: Scope;
  module: string | null;
  named: boolean;
  path: string;
  html: string;
  failure_summary: string;
  fix: Fix;
  pages: string[];
  /** Widths it was found at; '{desktop}' on scans from before the mobile pass. */
  viewports: Viewport[];
}

export interface PageRow {
  id: number;
  url: string;
  status: number | null;
  redirected: boolean;
  error: string | null;
  /** The mobile pass failed though the desktop one worked. */
  mobile_error: string | null;
  finding_count: number;
}

export interface ImageRow {
  id: number;
  src: string;
  alt: string | null;
  checks: string[];
  severity: "critical" | "serious" | "minor";
  scope: Scope;
  module: string | null;
  fixes: Fix[];
  pages: string[];
}

export interface LinkRow {
  id: number;
  check: string;
  url: string;
  href: string;
  text: string;
  hops: { url: string; status: number }[];
  final_status: number | null;
  error: string | null;
  scope: Scope;
  module: string | null;
  fix: Fix;
  /** Likely right target (similar live page, closest ID, archived copy). Missing on older scans. */
  replacement?: { url: string; reason: string } | null;
  pages: string[];
}

export interface SecurityRow {
  id: number;
  check_id: string;
  name: string;
  pass: boolean;
  current: string;
  recommended: string;
  fix_location: string;
  fix: Fix | null;
}

export interface MixedContentRow {
  id: number;
  url: string;
  kind: string;
  blocked: boolean;
  scope: Scope;
  module: string | null;
  path: string;
  fix: Fix;
  pages: string[];
}

export interface ScriptDomainRow {
  id: number;
  domain: string;
  urls: string[];
  pages: string[];
}

export interface JsLibraryRow {
  id: number;
  component: string;
  version: string;
  severity: "low" | "medium" | "high" | "critical" | null;
  vulnerabilities: { severity: string; summary: string; cves: string[]; info: string }[];
  fix: Fix | null;
  urls: string[];
  pages: string[];
}

export interface FormFinding {
  check: string;
  field: string | null;
  detail: string;
}

export interface FormRow {
  id: number;
  form_id: string;
  label: string | null;
  kind: "hubspot" | "iframe";
  status: "checked" | "not-checked";
  note: string | null;
  submitted: boolean;
  field_count: number;
  findings: FormFinding[];
  fixes: Record<string, Fix>;
  scope: Scope;
  module: string | null;
  pages: string[];
}

export type IssueMarkKind = "wont_fix" | "false_positive";

export interface IssueMark {
  id: number;
  site_id: string;
  fingerprint: string;
  kind: IssueMarkKind;
  note: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** A read-only client link to one scan's report. One active (not revoked) link per scan. */
export interface ReportLink {
  id: string;
  run_id: string;
  token: string;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
}

/** What shared_report(token) returns: only what the client report shows. Marked issues are already left out. */
export interface SharedReport {
  site: { domain: string; name: string | null };
  created_at: string;
  expires_at: string | null;
  summary: Pick<RunSummary, "pagesScanned" | "pagesFailed" | "viewports" | "sample">;
  issues: Pick<IssueRow, "id" | "rule_id" | "impact" | "help" | "help_url" | "tags" | "scope" | "module" | "named" | "pages" | "viewports">[];
  pages: { url: string; status: number | null; failed: boolean }[];
  security: Pick<SecurityRow, "check_id" | "name" | "pass" | "current" | "recommended">[];
}
