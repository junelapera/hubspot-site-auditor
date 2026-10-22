# Phase 1 — MVP

Source: [HubSpot Site Auditor — PRD](../HubSpot%20Site%20Auditor%20—%20PRD.md) · Status: In progress — worker and web app working locally; CSV export and deploys next

## Goal

Prove the one thing other scanners don't do: **group accessibility issues by HubSpot module**, so one fix in one module clears the issue on every page that uses it.

By the end of this phase, a developer can enter a domain, run a scan, and get a module list sorted by impact, with a suggested fix for each issue and a CSV to drop into a ticket.

## In scope

- Sitemap crawl with page limit and path filters
- axe-core scan at desktop width
- Module mapping by wrapper and BEM class
- Alt-text checks on images found during the page scan
- Broken internal links and redirect chains
- Security check: HTTPS redirect, HSTS, TLS, security headers
- Template-based fix suggestions for axe and security issues
- Module view, page view, image view, links view, security view
- CSV export

## Out of scope (later phases)

- Run history, comparison, won't fix / false positive marking → Phase 2
- File Manager pass, form check, external links, old-URL redirects → Phase 2
- Mixed content, cookies, outdated JS libraries, third-party scripts → Phase 2
- Mobile-width scan, sampling mode → Phase 2
- Shareable client report, scheduled scans, Teamwork push, Claude API fixes → Phase 3

## Work breakdown

### 0. Foundation

- [~] Next.js + Tailwind app built (magic-link login limited to @saltedstone.com, sites, queue a scan with live progress, report views); not yet deployed to Vercel
- [x] Supabase project: auth, and tables for `sites`, `runs`, `pages`, `issues` (affected pages stored on each issue), `images`, `links`, `security_checks` — applied to project `tikwmidmueieicuyqsem`; sign-up and data access limited to @saltedstone.com
- [x] Job queue: `runs` table with a status column (`queued` → `running` → `done` / `failed`), polled by the worker
- [x] Worker: Node.js + Playwright + `@axe-core/playwright`, processing runs from the live queue; hosted on GitHub Actions (`.github/workflows/scan.yml`) instead of Railway/Fly.io, so it's free on the public repo
- [x] Concurrency of 3–5 pages per scan, with a delay between requests
- [x] Progress written back to the run (pages done / total) so the app can show it
- [x] **Stable issue fingerprint** (rule + selector + module) stored on every issue — Phase 2 run comparison depends on this, so design it now

### 1. Site crawl

- [x] Fetch `/sitemap.xml`, follow nested sitemaps, dedupe URLs
- [x] Include / exclude path filters (glob, e.g. `/blog/page/*`)
- [x] Page limit per run
- [x] Clear error when no sitemap is found

### 2. Module-aware axe scan

- [x] Run axe-core on each page at desktop width
- [x] WCAG 2.1 and 2.2 Level A and AA rule tags by default
- [x] For each failing node, walk up to the nearest `.hs_cos_wrapper_type_module`
- [x] Name the module by its root BEM class (e.g. `.hero-banner`), fall back to wrapper ID
- [x] Issues outside any module labelled **Template** or **Global (header/footer)**
- [x] Deduplicate: same rule + same selector + same module = one issue with a list of affected pages
- [x] Store failing HTML snippet and axe help URL per issue

### 3. Alt-text audit (page images only)

- [x] Missing alt → Critical
- [x] Filename as alt (e.g. `IMG_4021.jpg`) → Serious
- [x] Generic alt from a configurable word list ("image", "photo", "banner", "logo") → Serious
- [x] Empty alt on an image that is the only content of a link → Serious
- [x] Alt over 150 characters → Minor
- [x] Alt repeats the caption or nearby heading word for word → Minor
- [x] Store thumbnail URL, current alt, pages, and module per image

### 4. Links and redirects (internal only)

- [x] Collect every link on every scanned page, mapped to its module
- [x] HEAD request, GET on failure; per-domain rate limit
- [x] Broken internal link (404 / 410)
- [x] Redirect chain (more than one hop)
- [x] Redirect to a dead page (target returns 404) *
- [x] Internal link uses `http://` on an HTTPS site *

### 5. Security check (site-wide)

- [x] HTTPS redirect: HTTP → HTTPS, and in one hop
- [x] HSTS present with `max-age` of at least one year
- [x] TLS: TLS 1.0 / 1.1 rejected; certificate expiry more than 30 days out (Node `tls`)
- [x] Headers: `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`
- [x] Version leaks in `Server` / `X-Powered-By` *
- [x] Each result stores pass/fail, current value, recommended value, and where the fix lives

### 6. Fix suggestions (templates)

- [x] Template per axe rule: failing HTML, corrected snippet (HTML / HubL / CSS), axe rule link
- [x] Template per security check: header or setting, recommended value, where to set it
- [x] Fallback text for axe rules without a template yet
- [x] Every suggestion labelled as a suggestion for developer review

### 7. Views

- [x] Run summary: pages scanned, issues by severity, images flagged, security checks failed *
- [x] **Module view** (default): module, issue count, worst severity, pages affected, rules — sorted by impact
- [x] Module detail: each rule, failing HTML, axe help link, affected pages
- [x] Page view
- [x] Image view
- [x] Links view
- [x] Security view
- [x] **Suggested fix** panel with copy button on every issue

### 8. CSV export

- [ ] All issues: one row per module + rule, with suggested fix (Teamwork.com / Jira importable)
- [ ] Flagged images, for content editors
- [ ] Security checks, for SecurityScorecard responses

\* Not assigned to a phase in the PRD. Placed here because it's cheap once the surrounding check exists.

## Acceptance criteria

- [ ] A 200-page HubSpot site goes from scan start to module list in **under 15 minutes**
- [ ] **90% or more** of issues map to a named module (not wrapper ID / unknown) on at least 3 real client sites
- [ ] Alt-text false positives **under 10%** on a hand-checked sample
- [ ] Security findings match the site's SecurityScorecard report **90% or more** of the time
- [ ] Issue CSV imports cleanly into Teamwork.com
- [x] Reports state clearly that this is an automated, passive scan — not a full audit (shown on every report page)

## Risks to watch

| Risk | Mitigation in this phase |
| --- | --- |
| Theme has no consistent BEM root class | Wrapper ID + snippet fallback; measure the "named module" rate on real sites |
| Cloudflare bot protection blocks the worker | Real browser user agent, slow pacing; document IP allow-listing |
| Large sites take too long | Page limit and path filters |

## Open questions to resolve during this phase

- [ ] How to tell a global module (header/footer) from a page-level module reliably across themes?
- [ ] Which security headers can be set in HubSpot domain settings, and which need Cloudflare? (Drives the "where the fix lives" copy.)
- [ ] Are password-protected or members-only pages in scope for v1?

## Findings from the first real scans (saltedstone.com, Oct 22)

- 99 page-level axe findings collapsed to 35 issues across 12 groups; 100% of module issues got a named module.
- Two groups added beyond the PRD: **content** (blog post body, CTAs, which are fixed in the editor, not the theme) and **embed** (third-party iframes such as YouTube, which can't be fixed in the theme).
- Filename-as-alt is the most common alt issue, because HubSpot fills alt with the file name by default. Only machine-looking alts are flagged, so readable names like "Customer Success" pass.
- The site started returning **HTTP 429** after a few test scans. The crawl, page scan, and link checks now back off on 429/503, and rate-limited links are reported as "not checked", never "broken". The bot-protection risk in the PRD is real.
- Open question still open: the HubSpot KB article on domain security settings couldn't be fetched, so which headers are settable in HubSpot vs Cloudflare is still unconfirmed.
- The link check skips exact sitemap URLs, since HubSpot generates the sitemap from published pages. On a 10-page run that cut the link stage from 191s to 6s (265 → 5 requests), and a full run went from 214s to 27s.
