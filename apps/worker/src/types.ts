export type Scope = "module" | "global" | "template" | "content" | "embed" | "unknown";
export type Impact = "critical" | "serious" | "moderate" | "minor";

/** Where an element sits on a HubSpot page. Produced by browser/inspect.js. */
export interface Location {
  scope: Scope;
  module: string | null;
  moduleType?: string;
  named: boolean;
  partial: string | null;
  path: string;
}

export interface ImageInfo {
  src: string;
  alt: string | null;
  role: string | null;
  ariaHidden: boolean;
  onlyContentOfLink: boolean;
  caption: string | null;
  heading: string | null;
  location: Location;
}

export interface LinkInfo {
  href: string;
  resolved: string;
  text: string;
  location: Location;
}

export type InsecureKind = "script" | "stylesheet" | "font" | "image" | "media" | "iframe" | "form" | "plugin" | "other";

/** An http:// resource on an HTTPS page. location is null when only the browser console reported it. */
export interface InsecureResource {
  url: string;
  kind: InsecureKind;
  location: Location | null;
}

/** A cookie set by a first-party Set-Cookie header. Values are never kept. */
export interface CookieInfo {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string | null;
}

/** One failing axe node on one page. */
export interface AxeFinding {
  ruleId: string;
  impact: Impact;
  help: string;
  helpUrl: string;
  tags: string[];
  html: string;
  failureSummary: string;
  target: string;
  location: Location;
}

export interface PageResult {
  url: string;
  status: number | null;
  /** True when the URL redirected before landing; its final status hides the redirect. */
  redirected: boolean;
  error?: string;
  findings: AxeFinding[];
  images: ImageInfo[];
  links: LinkInfo[];
  insecure: InsecureResource[];
  cookies: CookieInfo[];
  /** Every script URL the page requested, first- and third-party. */
  scripts: string[];
}

/** A deduplicated issue: same rule + same element path + same module, across pages. */
export interface Issue {
  fingerprint: string;
  ruleId: string;
  impact: Impact;
  help: string;
  helpUrl: string;
  tags: string[];
  scope: Scope;
  module: string | null;
  named: boolean;
  partial: string | null;
  path: string;
  html: string;
  failureSummary: string;
  pages: string[];
}

export interface ModuleSummary {
  key: string;
  label: string;
  scope: Scope;
  named: boolean;
  issueCount: number;
  worstImpact: Impact;
  pagesAffected: number;
  rules: string[];
}
