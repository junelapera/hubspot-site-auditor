import { dedupeIssues, namedModuleRate, summarizeModules } from "./aggregate.js";
import { auditImages, type FlaggedImage } from "./checks/alt.js";
import { auditInternalLinks, type LinkIssue } from "./checks/links.js";
import { checkSecurity, type SecurityResult } from "./checks/security.js";
import { crawlSitemap, type CrawlOptions } from "./crawl.js";
import { suggestAltFix, suggestAxeFix, suggestLinkFix, suggestSecurityFix, type FixSuggestion } from "./fixes.js";
import { scanPages } from "./scan.js";
import type { Issue, ModuleSummary, PageResult } from "./types.js";

export interface AuditInput extends CrawlOptions {
  domain?: string;
  /** Use this list instead of the sitemap. */
  urls?: string[];
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
  stats: {
    pagesScanned: number;
    pagesFailed: number;
    rawFindings: number;
    namedModuleRate: number;
    durationMs: number;
    stageMs: { crawl: number; scan: number; links: number; security: number };
  };
}

/** Crawl → scan → map to modules → alt / links / security → fix suggestions. */
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

  const crawl = input.urls?.length
    ? { urls: input.urls, sitemapUrls: [] }
    : await crawlSitemap(input.domain!, { include: input.include, exclude: input.exclude, limit: input.limit });
  const { urls } = crawl;
  if (!urls.length) throw new Error("No URLs to scan after filters");
  const crawlMs = mark();
  await hooks.onUrls?.(urls);

  const pages = await scanPages(urls, { concurrency: input.concurrency, onPage: hooks.onPage });
  const scanMs = mark();

  // Checks run against the host the pages actually live on (after any bare → www redirect).
  const siteHost = new URL(urls[0]).hostname;
  const issues = dedupeIssues(pages);

  await hooks.onStage?.("links");
  const links = await auditInternalLinks(pages, siteHost, { knownLive: crawl.sitemapUrls });
  const linksMs = mark();

  await hooks.onStage?.("security");
  const security = await checkSecurity(siteHost);
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
    stats: {
      pagesScanned: pages.filter((p) => !p.error).length,
      pagesFailed: pages.filter((p) => p.error).length,
      rawFindings: pages.reduce((n, p) => n + p.findings.length, 0),
      namedModuleRate: namedModuleRate(issues),
      durationMs: Date.now() - started,
      stageMs: { crawl: crawlMs, scan: scanMs, links: linksMs, security: securityMs },
    },
  };
}
