// Row shapes for the tables in supabase/migrations. The worker writes these;
// the web app only reads them (and inserts sites and queued runs).

export type Scope = "module" | "global" | "template" | "content" | "embed" | "unknown";
export type Impact = "critical" | "serious" | "moderate" | "minor";
export type RunStatus = "queued" | "running" | "done" | "failed";

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
  namedModuleRate: number;
  durationMs: number;
}

export interface Run {
  id: string;
  site_id: string;
  status: RunStatus;
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
  scope: Scope;
  module: string | null;
  named: boolean;
  path: string;
  html: string;
  failure_summary: string;
  fix: Fix;
  pages: string[];
}

export interface PageRow {
  id: number;
  url: string;
  status: number | null;
  redirected: boolean;
  error: string | null;
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
