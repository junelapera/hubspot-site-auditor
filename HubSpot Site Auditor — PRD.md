# HubSpot Site Auditor — PRD

Oct 22, 2026 · @June Leoman Lapera

## Overview

HubSpot Site Auditor is one tool that scans a whole HubSpot site for accessibility and security issues and tells you what to fix. It runs five checks in one run: an axe-core scan of every page, an alt-text audit, a HubSpot form check, a broken link and redirect check, and a passive security check. Every issue comes with a suggested fix.

Today's scanners (WAVE, Lighthouse, Siteimprove) report problems per page. On a HubSpot site, the same module appears on dozens of pages, so one bug shows up as 40 separate issues. A developer then has to trace each one back to a module by hand.

This tool flips the report around. It groups issues by module, so one fix in one module clears the issue on every page that uses it.

Security issues are mostly site-wide, so they are grouped by where the fix lives instead: HubSpot domain settings, Cloudflare, the theme, or a single module.

## Goals and non-goals

The main goal is to cut the time from "site has issues" to "I know which modules to fix" from hours to minutes.

**Goals**

- Scan every URL in a site's sitemap with axe-core in one run.
- Map each issue to the HubSpot module that produced it.
- Flag missing or useless alt text on page images and File Manager assets.
- Check HubSpot forms for labels, errors, focus, and keyboard use.
- Find broken links, redirect chains, and old URLs with no redirect.
- Check security headers, TLS, redirects, cookies, and mixed content, and say where each fix lives.
- Give a suggested fix for every issue: a code snippet, a setting, or a redirect row.
- Produce a report that can go straight into a client remediation ticket.
- Re-run the same scan later and show what was fixed and what is new.

**Non-goals**

- Auto-fixing code. The tool reports; developers fix.
- Replacing manual testing with screen readers or keyboard-only checks.
- Full WCAG conformance certification.
- Scanning non-HubSpot sites in v1 (they still work, but without module grouping).

## Users and use cases

The primary user is a HubSpot CMS developer at an agency who handles a11y remediation across several client portals.

| User | What they need | Example |
| --- | --- | --- |
| HubSpot developer | Know which modules to fix, in priority order | Fix the hero module once instead of chasing 40 page issues |
| Project or account manager | A clear summary to scope and quote the work | "12 modules need fixes, 3 critical" for a remediation proposal |
| Client content editor | A list of images missing alt text they can fix themselves | File Manager images with filenames as alt text |

**Key use cases**

1. **Pre-sale audit.** Scan a prospect's site to scope a remediation project.
2. **Remediation sprint.** Work through the module list, then re-scan to confirm fixes.
3. **Post-migration check.** After a WordPress-to-HubSpot migration, catch a11y regressions, broken links, and missing redirects before launch.
4. **Monthly health check.** Re-run on retainer clients to catch new issues from content edits.
5. **Security score fix.** When a client's SecurityScorecard grade drops, find which headers or settings caused it.

## Features

The tool has eight parts: a site crawl, a module-aware axe scan, an alt-text audit, a form check, a link and redirect check, a security check, fix suggestions, and a run history.

### 1. Site crawl

- Enter a domain. The tool fetches `/sitemap.xml` (and nested sitemaps) to build the URL list.
- Optional: paste a URL list instead, or add URLs the sitemap misses (landing pages, system pages).
- Filters: include or exclude paths (e.g. skip `/blog/page/*`), and a page limit per run.
- Sampling mode: scan one page per template to get a fast first pass on large sites.

### 2. Module-aware axe scan

- Runs axe-core on each page in a headless browser, at desktop and mobile widths.
- For each failing element, walks up the DOM to the nearest HubSpot module wrapper (`.hs_cos_wrapper_type_module`).
- Names the module by its root BEM class (e.g. `.hero-banner`), falling back to the wrapper ID.
- Marks issues outside any module as **Template** or **Global (header/footer)**.
- Deduplicates: the same rule failing on the same selector in the same module counts as one issue, with a list of affected pages.
- Checks WCAG 2.1 and 2.2 Level A and AA rules by default.

### 3. Alt-text audit

Runs on every image found during the page scan, plus a separate pass over File Manager images through the HubSpot Files API.

| Check | Flagged when | Severity |
| --- | --- | --- |
| Missing alt | No `alt` attribute at all | Critical |
| Filename as alt | Alt matches the file name, e.g. `IMG_4021.jpg` | Serious |
| Generic alt | Alt is a placeholder word such as "image", "photo", "banner", "logo" | Serious |
| Empty alt on linked image | `alt=""` on an image that is the only content of a link | Serious |
| Too long | Alt over 150 characters | Minor |
| Redundant | Alt repeats the caption or nearby heading word for word | Minor |
| Unused File Manager image | Image in File Manager not found on any scanned page | Info |

Each flagged image shows a thumbnail, its current alt, the pages it appears on, and the module it sits in.

### 4. Form check

HubSpot forms are rendered by HubSpot, not by the module, so they get their own check and their fixes point to the form editor or theme CSS/JS.

| Check | Flagged when | Where the fix lives |
| --- | --- | --- |
| Missing label | A field has only a placeholder, or no programmatic label | Form editor |
| Required fields | Required state is not announced to screen readers | Theme JS or form editor |
| Error messages | Errors are not tied to their field or not announced | Theme JS |
| Focus state | No visible focus outline on fields or the submit button | Theme CSS |
| Contrast | Label, placeholder, or error text below 4.5:1 | Theme CSS |
| Consent checkbox | GDPR or legal consent checkbox has no label | Form editor |
| Keyboard flow | A field or the submit button cannot be reached with Tab | Theme or form editor |

The scanner tabs through each form and submits it empty to trigger error messages. It never submits a filled form, so no test contacts are created. Forms inside a cross-origin iframe are listed as "not checked" for manual testing.

### 5. Links and redirects

Every link on every scanned page is checked, and broken ones are mapped to the module that holds them.

| Check | Flagged when | Where the fix lives |
| --- | --- | --- |
| Broken internal link | Link returns 404 or 410 | Module or page |
| Broken external link | Link returns a 4xx or 5xx error | Module or page |
| Redirect chain | Link takes more than one redirect hop | HubSpot URL redirects |
| Redirect to a dead page | Redirect target itself returns 404 | HubSpot URL redirects |
| Old URL not redirected | A URL from an uploaded old sitemap (e.g. WordPress) returns 404 | HubSpot URL redirects |
| Broken anchor | A `#section` link points to an ID that is not on the page | Module or page |
| Internal link uses HTTP | Link starts with `http://` on an HTTPS site | Module or page |

For old URLs with no redirect, the tool suggests a new URL by slug match and exports a CSV ready for HubSpot's bulk redirect import.

### 6. Security check

Runs passive checks only: it reads what any browser sees and never sends attack traffic. Each result says where the fix lives, not just which page failed.

| Check | Flagged when | Where the fix lives |
| --- | --- | --- |
| HTTPS redirect | HTTP does not redirect to HTTPS, or takes more than one hop | HubSpot domain settings |
| HSTS | Header missing, or `max-age` under one year | HubSpot domain settings or Cloudflare |
| TLS | TLS 1.0 or 1.1 still accepted, or certificate expires within 30 days | HubSpot domain settings |
| Security headers | Missing `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy` | HubSpot domain settings or Cloudflare |
| Version leaks | `Server` or `X-Powered-By` shows software versions | Cloudflare or origin |
| Mixed content | An `http://` image, script, or font on an HTTPS page | Module or page (mapped like a11y issues) |
| Cookies | First-party cookie missing `Secure`, `HttpOnly`, or `SameSite` | Theme or third-party script |
| Outdated JS libraries | A library version with known CVEs, e.g. old jQuery | Theme or module |
| Third-party scripts | Lists every external script domain; flags new ones since the last run | Template, page, or tracking settings |

Each check shows pass or fail, the current value, and the recommended value, ready to paste into a SecurityScorecard response.

### 7. Fix suggestions

Every issue gets a short suggested fix, written for the place where it gets fixed.

| Issue type | The suggestion shows |
| --- | --- |
| a11y issue in a module | The failing HTML, a corrected HTML, HubL, or CSS snippet, and the axe rule link |
| Alt text | Why the current alt fails and an example of good alt for that kind of image |
| Form issue | The form editor setting to change, or a theme CSS/JS snippet |
| Broken link | The likely replacement URL, or a ready-made redirect row |
| Security issue | The header or setting, its recommended value, and where to set it |

In v1, suggestions come from a template per axe rule and per check, so they are fast and predictable. Later, the Claude API tailors the snippet to the module's actual code. Suggestions are a starting point; the developer reviews before applying.

### 8. Run history

- Every scan is saved per site.
- Compare any two runs: **fixed**, **new**, and **still open** issues.
- Mark an issue as **won't fix** or **false positive** with a note; it stays hidden in later runs.

## How it works

The web app queues a scan in Supabase; a separate worker picks it up, runs every page through a five-step pipeline, and writes results back.

&#91;embedded content: architecture · app, database, worker, 5-step scan pipeline\]

The "Map source" step is what makes this tool different: it turns page-level results into a fix list by module, form, or setting.

## Reports and outputs

The main view is a module list sorted by impact, so the first row is always the fix that clears the most issues.

**Dashboard**

- Totals: pages scanned, issues by severity, images flagged, security checks failed.
- Accessibility score and security grade (A to F) per run, so progress shows over time.
- Top 5 modules by issue count.

**Module view** (default)

| Column | Example |
| --- | --- |
| Module | `.hero-banner` |
| Issues | 4 rules failing |
| Worst severity | Critical |
| Pages affected | 38 |
| Rules | color-contrast, button-name, image-alt |

Click a module to see each rule, the failing HTML snippet, the axe help link, and the list of affected pages.

**Other views**

- **Page view:** the classic per-page list, for clients who expect it.
- **Image view:** every flagged image with thumbnail, current alt, and where it is used.
- **Forms view:** each form with its failing checks and the page it sits on.
- **Links view:** broken links, redirect chains, and old URLs with no redirect.
- **Rule view:** issues grouped by WCAG rule, for writing a conformance summary.
- **Security view:** every check with pass or fail, current value, recommended value, and where to fix it.

Every issue in every view has a **Suggested fix** panel with the snippet or setting, and a copy button.

**Exports**

- CSV of all issues (one row per module + rule, with the suggested fix), ready for Teamwork.com or Jira import.
- CSV of flagged images, for content editors.
- CSV of missing redirects, ready for HubSpot's bulk redirect import.
- CSV of security checks, for SecurityScorecard responses or client tickets.
- Shareable client report link (read-only, no login).

## Tech stack

The web app runs on Next.js and Vercel; the scanning runs in a separate worker, because headless browsers don't fit Vercel's function limits.

| Layer | Choice | Why |
| --- | --- | --- |
| Web app | Next.js + Tailwind | Fast to build dashboards and reports |
| Hosting (app) | Vercel | Simple deploys, preview URLs |
| Database + auth | Supabase (Postgres) | Stores sites, runs, issues, images; built-in auth |
| Scan worker | Node.js + Playwright + `@axe-core/playwright` | Real browser rendering, so JS-built modules and forms are scanned correctly |
| Link checks | HEAD request, then GET on failure; per-domain rate limit | Fast, and polite to external sites |
| Security checks | Node `tls` module, response headers, Retire.js for library versions | Passive checks, no attack traffic |
| Fix suggestions | Template per axe rule and check (v1); Claude API later | Predictable first, tailored later |
| Worker hosting | Railway or Fly.io | Long-running jobs, Chromium support |
| Job queue | Supabase table polled by the worker (v1) | No extra service to run |
| HubSpot access | Private app token, `files` scope | File Manager pass via the Files API |
| Exports | Server-side CSV generation | Opens in Excel, imports into task tools |

Concurrency: 3 to 5 pages at a time per scan, with a delay between requests, so client sites are not overloaded.

## Scope and phases

The MVP proves the one thing other scanners don't do: grouping issues by HubSpot module.

**Phase 1 — MVP**

- [ ] Sitemap crawl with page limit and path filters
- [ ] axe-core scan at desktop width
- [ ] Module mapping by wrapper and BEM class
- [ ] Alt-text checks on images found during the page scan
- [ ] Broken internal links and redirect chains
- [ ] Security check: HTTPS redirect, HSTS, TLS, security headers
- [ ] Template-based fix suggestions for axe and security issues
- [ ] Module view, page view, image view, links view, security view
- [ ] CSV export

**Phase 2 — Re-scans and File Manager**

- [ ] Run history and fixed / new / still-open comparison
- [ ] Won't fix and false positive marking
- [ ] File Manager pass through the HubSpot Files API
- [ ] Form check with keyboard and empty-submit tests
- [ ] Old-URL redirect check with bulk-import CSV
- [ ] External link checks
- [ ] Security check: mixed content, cookies, outdated JS libraries, third-party scripts
- [ ] Fix suggestions for forms, links, and alt text
- [ ] Mobile-width scan
- [ ] Sampling mode (one page per template)

**Phase 3 — Client-facing**

- [ ] Shareable read-only client report
- [ ] Scheduled monthly scans with email summary
- [ ] Direct push of issues to Teamwork.com
- [ ] Exact module paths from the HubSpot CMS Pages API, instead of guessing from class names
- [ ] Fix snippets tailored by the Claude API to the module's actual code

## Success metrics

The tool succeeds if a full-site audit that takes half a day by hand takes under 30 minutes.

| Metric | Target |
| --- | --- |
| Time from scan start to module list (200-page site) | Under 15 minutes |
| Issues mapped to a named module (not "unknown") | 90% or more |
| Alt-text false positives (checked by hand on a sample) | Under 10% |
| Security findings that match the site's SecurityScorecard report | 90% or more |
| Fix suggestions applied without a major rewrite | 70% or more |
| Old URLs left without a redirect after a migration | Zero at launch |
| Developer time to scope a remediation project | Under 30 minutes |
| Client sites scanned in the first 3 months | All active a11y clients |

## Risks and open questions

The biggest risk is module naming: if a theme doesn't use clear BEM root classes, issues fall back to wrapper IDs that mean little to a developer.

**Risks**

| Risk | Fallback |
| --- | --- |
| Theme has no consistent module root class | Show wrapper ID + a snippet; Phase 3 uses the CMS Pages API for exact paths |
| Bot protection (Cloudflare) blocks the scanner | Allow-list the worker IP, or use a real browser user agent with slow pacing |
| Large sites (1,000+ pages) take too long | Sampling mode; page limit per run |
| axe-core misses issues only a person can judge | State clearly in reports that this is an automated scan, not a full audit |
| Alt-text rules flag good alt as bad | Allow false-positive marking; tune the generic word list |
| Security check read as a full security audit | Reports state the checks are passive and cover headers, TLS, and page content only |
| External sites block or rate-limit the link checker | HEAD requests, per-domain limits, and a skip list for sites that block bots |
| Forms inside cross-origin iframes cannot be scanned | List them as "not checked" for manual testing |
| A fix suggestion is wrong for a custom theme | Label it a suggestion; the developer reviews before applying |

**Open questions**

- [ ] Does the HubSpot File Manager store alt text per file, or only per usage in a module field? This decides what the File Manager pass can check.
- [ ] How to tell a global module (header/footer) from a page-level module reliably across themes?
- [ ] Which security headers can be set in HubSpot's domain settings, and which need Cloudflare?
- [ ] Should password-protected or members-only pages be in scope for v1?
- [ ] Internal tool only, or something to offer clients as a paid service later?
