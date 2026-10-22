import { dedupeIssues, namedModuleRate, summarizeModules } from "./aggregate.js";
import { auditImages, type FlaggedImage } from "./checks/alt.js";
import { auditAnchors, auditExternalLinks, auditInternalLinks, type LinkIssue } from "./checks/links.js";
import { auditForms, type FormSummary } from "./checks/forms.js";
import { auditLibraries, checkLibraries, createDetector, loadRetireRepo, type JsLibrary } from "./checks/libraries.js";
import {
  auditMixedContent,
  auditThirdPartyScripts,
  checkCookies,
  checkMixedContent,
  type MixedContentIssue,
  type ScriptDomain,
} from "./checks/page-security.js";
import { checkSecurity, type SecurityResult } from "./checks/security.js";
import { crawlSitemap, type CrawlOptions } from "./crawl.js";
import {
  suggestAltFix,
  suggestAxeFix,
  suggestFormFix,
  suggestLibraryFix,
  suggestLinkFix,
  suggestMixedContentFix,
  suggestSecurityFix,
  type FixSuggestion,
} from "./fixes.js";
import { scanPages } from "./scan.js";
import type { Issue, ModuleSummary, PageResult } from "./types.js";

export interface AuditInput extends CrawlOptions {
  domain?: string;
  /** Scan only these pages instead of the sitemap. */
  urls?: string[];
  /** Scan these pages as well as the sitemap's. */
  extraUrls?: string[];
  concurrency?: number;
}

export interface AuditHooks {
  onUrls?: (urls: string[]) => void | Promise<void>;
  onPage?: (page: PageResult, done: number, total: number) => void | Promise<void>;
  onStage?: (stage: "links" | "security") => void | Promise<void>;
}

export interface AuditResult {
  siteHost: string;
  urls: string[];
  pages: PageResult[];
  issues: (Issue & { fix: FixSuggestion })[];
  modules: ModuleSummary[];
  images: (FlaggedImage & { fixes: FixSuggestion[] })[];
  links: (LinkIssue & { fix: FixSuggestion })[];
  security: (SecurityResult & { fix: FixSuggestion | null })[];
  mixedContent: (MixedContentIssue & { fix: FixSuggestion })[];
  scripts: ScriptDomain[];
  /** Null when the Retire.js database couldn't be downloaded; the check is then left out. */
  libraries: (JsLibrary & { fix: FixSuggestion | null })[] | null;
  /** Fixes keyed by form check, one per kind of problem the form has. */
  forms: (FormSummary & { fixes: Record<string, FixSuggestion> })[];
  stats: {
    pagesScanned: number;
    pagesFailed: number;
    /** External link URLs requested, and those left out (skip list or over the cap). */
    externalLinksChecked: number;
    externalLinksSkipped: number;
    rawFindings: number;
    namedModuleRate: number;
    durationMs: number;
    stageMs: { crawl: number; scan: number; links: number; security: number };
  };
}

/** Crawl → scan (incl. form tests) → map to modules → alt / links / security / mixed content / scripts → fix suggestions. */
export async function runAudit(input: AuditInput, hooks: AuditHooks = {}): Promise<AuditResult> {
  const started = Date.now();
  const mark = (() => {
    let last = started;
    return () => {
      const now = Date.now();
      const elapsed = now - last;
      last = now;
      return elapsed;
    };
  })();

  const filters = { include: input.include, exclude: input.exclude, limit: input.limit };
  let crawl: { urls: string[]; sitemapUrls: string[] };
  if (input.urls?.length) {
    // Only the listed pages. The sitemap is still read (not scanned) when there's a domain,
    // so the link check can skip pages known to be live instead of requesting every link.
    const sitemap = input.domain ? await crawlSitemap(input.domain).catch(() => null) : null;
    crawl = { urls: unique(input.urls), sitemapUrls: sitemap?.sitemapUrls ?? [] };
  } else {
    crawl = await crawlSitemap(input.domain!, filters);
    // Pages the sitemap misses, scanned on top of it (outside the page limit and path filters).
    if (input.extraUrls?.length) crawl = { ...crawl, urls: unique([...crawl.urls, ...input.extraUrls]) };
  }
  const { urls } = crawl;
  if (!urls.length) throw new Error("No URLs to scan after filters");
  const crawlMs = mark();
  await hooks.onUrls?.(urls);

  // The Retire.js database is downloaded fresh each scan; if GitHub is down, scan without it.
  const detector = await loadRetireRepo().then(createDetector, () => null);
  const pages = await scanPages(urls, { concurrency: input.concurrency, onPage: hooks.onPage, detector: detector ?? undefined });
  const scanMs = mark();

  // Checks run against the host the pages actually live on (after any bare → www redirect).
  const siteHost = new URL(urls[0]).hostname;
  const issues = dedupeIssues(pages);

  await hooks.onStage?.("links");
  const [internal, external] = await Promise.all([
    auditInternalLinks(pages, siteHost, { knownLive: crawl.sitemapUrls }),
    auditExternalLinks(pages, siteHost),
  ]);
  const links = [...internal, ...external.issues, ...auditAnchors(pages, siteHost)];
  const linksMs = mark();

  await hooks.onStage?.("security");
  const mixedContent = auditMixedContent(pages);
  const libraries = detector ? auditLibraries(pages, detector) : null;
  const security = [
    ...(await checkSecurity(siteHost)),
    checkMixedContent(mixedContent),
    checkCookies(pages),
    ...(libraries ? [checkLibraries(libraries)] : []),
  ];
  const securityMs = mark();

  return {
    siteHost,
    urls,
    pages,
    issues: issues.map((i) => ({ ...i, fix: suggestAxeFix(i) })),
    modules: summarizeModules(issues),
    images: auditImages(pages).map((i) => ({ ...i, fixes: suggestAltFix(i.checks) })),
    links: links.map((l) => ({ ...l, fix: suggestLinkFix(l) })),
    security: security.map((s) => ({ ...s, fix: suggestSecurityFix(s) })),
    mixedContent: mixedContent.map((m) => ({ ...m, fix: suggestMixedContentFix(m) })),
    scripts: auditThirdPartyScripts(pages, siteHost),
    libraries: libraries?.map((l) => ({ ...l, fix: suggestLibraryFix(l) })) ?? null,
    forms: auditForms(pages).map((f) => ({
      ...f,
      fixes: Object.fromEntries([...new Set(f.findings.map((x) => x.check))].map((c) => [c, suggestFormFix(c)])),
    })),
    stats: {
      pagesScanned: pages.filter((p) => !p.error).length,
      pagesFailed: pages.filter((p) => p.error).length,
      externalLinksChecked: external.checked,
      externalLinksSkipped: external.skipped,
      rawFindings: pages.reduce((n, p) => n + p.findings.length, 0),
      namedModuleRate: namedModuleRate(issues),
      durationMs: Date.now() - started,
      stageMs: { crawl: crawlMs, scan: scanMs, links: linksMs, security: securityMs },
    },
  };
}

function unique(urls: string[]): string[] {
  return [...new Set(urls)];
}
