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

export interface Run {
  id: string;
  site_id: string;
  status: RunStatus;
  /** Crawl settings at queue time; urls / extraUrls for a pasted page list. */
  options: { include?: string[]; exclude?: string[]; limit?: number; urls?: string[]; extraUrls?: string[]; sample?: boolean };
  stage: string | null;
  pages_total: number | null;
  pages_done: number;
  error: string | null;
  summary: RunSummary | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
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
