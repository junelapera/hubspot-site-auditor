# Status

Last updated: Oct 22, 2026 · Current phase: **Phase 1 acceptance runs pending; Phase 2 in progress (comparison, scores, all security checks, external links, anchors, WCAG view, form check, URL lists done)**

The full checklist is in [phases/phase-1-mvp.md](phases/phase-1-mvp.md). This file is the short version: what works, what's next, and what's blocking.

## Working

| Area | State |
| --- | --- |
| Scanner (worker) | Crawl, axe scan, module mapping, dedupe, alt / link / security checks, fix suggestions. Runs locally (CLI) and from the Supabase queue. |
| Database | Schema, queue (`claim_run`), and `module_summary` view applied to Supabase. Accounts and reads limited to @saltedstone.com, tested on the live project. |
| Accounts | Invite-only. Public sign-up is off in Supabase Auth (verified: the API returns `signup_disabled`); invites still work through the admin API. Email confirmation stays on. First account (june.lapera@saltedstone.com) is set up with a password. |
| Web app | Invite-only accounts (@saltedstone.com): members create one-time invite links on the Team page, no email needed; email + password sign-in; sites, run a scan with live progress, report with Modules / Pages / Images / Links / Security tabs and copyable fixes. Deployed to Vercel; pushes to `main` deploy production. "Run scan" in production verified: the worker started 47s after the click. |
| Worker hosting | GitHub Actions workflow (`scan.yml`): on dispatch, by hand, and every 15 min. Verified from the app's "Run scan" button: a 5-page scan started 42s after the click (Chromium cached) and finished 15s later. Public log shows run IDs only. |
| CSV exports | Issues (one row per module + rule, Teamwork / Jira columns), images, links, security. Download buttons on every report. Formula-injection safe, UTF-8 BOM for Excel. |
| Run comparison (Phase 2) | Compare any two scans of a site by issue fingerprint: fixed / new / still open / not rechecked. Report page shows the change since the previous scan; full comparison at `/runs/:id/compare`. Issues can be marked won't fix or false positive with a note; marks are per site, hide the issue in every scan (toggle to show), and keep it out of the issues CSV. Verified: two identical scans show 0 fixed, 0 new. |
| Scores (Phase 2) | Accessibility score (0–100) and security grade (A–F) per scan, on the report (with change since the previous scan and how they're worked out) and next to every scan in the site's history. Computed when shown, not stored, so marks count and older scans have scores too. Logic in `apps/web/src/lib/scores.ts`. saltedstone.com: 91 and C. |
| Page security checks (Phase 2) | Mixed content (http:// resources on HTTPS pages, from the markup and Chrome's console, mapped to modules; blocked vs upgraded), first-party cookie flags (Set-Cookie headers only; names, never values), and third-party script domains with "New" since the previous scan. Mixed content and cookies are security-check rows, so they count toward the grade. Shown on the Security tab; CSVs for both lists. Verified on saltedstone.com (14 script domains, 2 cookies OK, no mixed content) and badssl.com's mixed-content test pages. |
| JS library check (Phase 2) | Every script the pages loaded is matched against the Retire.js database (URL, file name, content, hash; bodies come from the page load, so no extra requests). Vulnerable versions fail the "JavaScript libraries" check (10 points of the grade) and are listed on the Security tab with CVEs and a fix; CSV too. Scripts HubSpot serves itself get a "nothing to change in the theme" fix. saltedstone.com: moment.js 2.30.1 (medium CVE) inside HubSpot's forms script, so the grade dropped from C to D. |
| External links and anchors (Phase 2) | External links: one request at a time per domain, 1s apart, HEAD then GET (also on 404), up to 500 URLs per scan; a built-in skip list (LinkedIn, Facebook, Instagram, X, TikTok, etc.). Only certain deaths are reported (404, 410, 5xx, unknown domain, refused connection); 401 / 403 / 429 / 999 and timeouts aren't. Broken anchors: `#id` links whose target isn't on the page (same page, or another scanned page). Both appear on the Links tab and links CSV; the tab says how many external links were checked or skipped. saltedstone.com: 20 external links on 3 blog posts checked in 5s, none dead. |
| WCAG view (Phase 2) | "WCAG" report tab: one row per axe rule, in success-criterion order with names and levels (best-practice rules last), worst severity, issues, pages, and which modules it's in. Respects marks (toggle to show). "WCAG summary" CSV for conformance write-ups. |
| Form check (Phase 2) | Each HubSpot form (by form ID) is tested once per scan, on the first page it's on: labels (missing, placeholder-only, consent), required fields marked * but not announced, Tab reachability and visible focus (on the field, its wrapper or label; transitions disabled first), placeholder contrast; then, if it has required fields and an empty submit button, it's submitted **empty** with every non-GET request blocked, and the error messages are checked (shown, tied to the field, announced) along with error text contrast (axe). Cross-origin form iframes are listed as not checked. Forms tab with one fix per kind of problem, and a forms CSV. saltedstone.com: the contact form has no visible focus on 6 fields (confirmed by screenshot); the blog subscribe form's error isn't tied to its field and its error text is 2.58:1. |
| Scan specific pages (Phase 2) | "Scan specific pages" on the site page: paste URLs or paths (one per line, up to 200, site's own domain only), and scan only those or the sitemap plus those. The list is kept if it's rejected. Scans show a "N listed pages" / "Sitemap + N listed" chip. URL-list scans still read the sitemap (without scanning it) so the link check skips known-live pages: the same 3 pages went from 66s to 13s. CLI: `--urls` and `--extra-urls`. |
| Look and feel | Salted Stone brand from saltedstone.com: cream / ink palette, logo and S² favicon, serif headings, mono uppercase labels, orange pill buttons, brand-colored severity chips, chevron icons, brand-styled dropdowns (Radix Select). Every color pair contrast-checked. |
| Accessibility of the app itself | axe (WCAG 2.2 AA) passes on all 12 screens. No sideways scrolling down to 320px wide. |
| Tests | 46 worker + 24 web unit tests (`pnpm test`); both apps typecheck; web app lints and builds. |

## Results so far (saltedstone.com)

| Measure | Result | Target |
| --- | --- | --- |
| Page findings → unique issues (40 pages) | 99 → 35, in 12 groups | — |
| Issues mapped to a named module | 100% | 90% |
| Full run, 10 pages (scan + links + security) | 27s | 200 pages in under 15 min |
| Page scan speed | ~1.4s per page at concurrency 3–4 | — |

Only one site has been scanned so far. The acceptance criteria call for 3 real client sites.

## Pick up here (end of Oct 22)

- Production is current: https://hubspot-site-auditor.vercel.app (latest: dates in the viewer's time zone; brand dropdown on the compare page; scan comparison and won't-fix marking).
- Local: `pnpm dev` (web on :3000) and, optionally, `pnpm worker`. If CSS looks stale after a `pnpm build`, stop the dev server, delete `apps/web/.next`, and start it again.
- Waiting on: 3 client domains (and SecurityScorecard reports if available) for the Phase 1 acceptance runs.
- Ready to start without input: the rest of Phase 2 (sampling mode, mobile-width scan, alt-text fix templates).

## Next

1. **Acceptance runs** on 3 client sites (ideally different themes): named-module rate (90%+), alt-text false positives (under 10%), a SecurityScorecard comparison (90%+ match), a 200-page timing (under 15 min), and a test import of the issues CSV into Teamwork. Needs: the 3 domains, and SecurityScorecard reports if available.
2. **Custom SMTP** in Supabase Auth (optional): only needed for "Forgot password?" emails. Invites don't use email.
3. **Confirm the form check creates no contacts:** after a scan of a site with forms, check its HubSpot CRM for new contacts. The network side is already verified.
4. **Phase 2, next items:** sampling mode, mobile-width scan, File Manager pass, and the rest of [phases/phase-2-rescans-and-file-manager.md](phases/phase-2-rescans-and-file-manager.md).

## Known issues and decisions

- **Rate limiting:** saltedstone.com returned HTTP 429 after a few back-to-back test scans. The scanner now backs off and retries, and reports rate-limited links as "not checked", never "broken". Test with small `--limit` values.
- **Link check skips exact sitemap URLs.** HubSpot builds the sitemap from published pages, so those are treated as live. This cut the link stage from 191s to 6s on a 10-page run. Near-matches (trailing slash, `http`) are still requested.
- **Fix suggestions are stored at scan time.** Changing a template in `apps/worker/src/fixes.ts` only affects new scans.
- **Worker runs on GitHub Actions, not Railway** (the PRD's choice). It's free on a public repo, at the cost of ~1–2 min startup per scan. Logs are public, so the worker runs with `REDACT_LOGS=1`.
- **"Not rechecked" instead of "fixed".** An issue missing from the newer scan only counts as fixed if the newer scan covered at least one of the pages it was on. Otherwise a smaller page limit would look like a wave of fixes.
- **Marks are per site, by fingerprint.** If a module's markup changes enough to change the element path, the issue gets a new fingerprint and shows up again (as new), unmarked.
- **Known axe flag while a dropdown is open:** Radix Select hides the page behind the open list from screen readers (`aria-hidden`), and axe reports `aria-hidden-focus` because the page has focusable elements. Focus is trapped in the list while it's open (tested: Tab and Shift+Tab stay inside), so they can't be reached; this is a known false positive with modal popups. Closed, the page passes.
- **Dates are formatted in the browser.** Vercel's servers run in UTC, so server-formatted times showed UTC to everyone (fixed: `components/local-time.tsx`). Before hydration the server HTML shows UTC, labelled "UTC".
- **Cache Components is off** in the web app on purpose: every page is per-user live data.
- **Heading font is a stand-in.** saltedstone.com uses New Spirit Condensed from Salted Stone's Adobe Fonts kit, which only serves allowed domains. The app uses Fraunces until `hubspot-site-auditor.vercel.app` is added to the kit; the CSS already lists New Spirit first.
- **Brand colors as text:** the brand orange and red fail contrast as text on cream (2.5 / 3.6:1), so chips and buttons always use ink text, and error text uses a darker rust. Tokens and the checked ratios are in `apps/web/src/app/globals.css`.
- **GitHub dispatch token expires 2027-01-20.** After that, "Run scan" falls back to the 15-minute schedule until a new token is set in `apps/web/.env.local` and Vercel.
- **Invite links are shared by hand.** Whoever holds an unused link can claim that account, so send them directly, not in shared channels. They expire after 24 hours.
- **Only "Forgot password?" sends email**, through Supabase's built-in sender (a few per hour, org members only) until custom SMTP is set up. Admin-generated recovery links also start the per-account reset cooldown.
- **Local password-reset links fall back to production.** The Supabase redirect allow list has `http://localhost:3000/auth/callback` as an exact URL, which doesn't match the `?next=` query. Change it to `http://localhost:3000/**` if reset needs testing locally. Production is unaffected.

- **Score formulas are our own.** Accessibility: each page starts at 100 and loses 15 / 8 / 3 / 1 per critical / serious / moderate / minor axe issue (floor 0), averaged over scanned pages; alt-text heuristics are left out. Security: 100 minus 20 (old TLS, certificate expiry), 10 (HTTPS redirect, HSTS, CSP, X-Frame-Options) or 5 (others) per failed check; A 90+, B 80+, C 70+, D 60+. Not a SecurityScorecard grade; tune the weights after the acceptance runs. Changing them changes every past scan's score too.

- **Cookie check covers Set-Cookie headers only.** Cookies set by JavaScript (HubSpot analytics, consent banners) can't be HttpOnly, so they aren't checked. Values are never stored.
- **Implicit favicons aren't checked for mixed content.** A `/favicon.ico` that redirects to http:// (no `<link rel=icon>`) isn't reported.
- **"New" third-party scripts** only show when the previous scan also recorded scripts (scans from Oct 22, 8:40 pm on).

- **Retire.js database is downloaded each scan** from raw.githubusercontent.com (~600 KB). If that fails, the scan carries on and the library check shows "not checked" (no security row, so the grade isn't affected). Retire.js "func" detectors (code run in the page) aren't used, so a library only defined in inline code isn't found.
- **HubSpot's own scripts count toward the grade.** A vulnerable library inside HubSpot's forms/chat scripts can't be fixed by the client but is still flagged, as external scanners would. Revisit if this makes grades unhelpful.

- **WCAG names are a hand-kept list** (`apps/web/src/lib/rules.ts`, WCAG 2.2 A/AA). A criterion axe tags that isn't in it shows its number only.
- **External link skip list is built in** (`EXTERNAL_SKIP` in `apps/worker/src/checks/links.ts`), not a per-site setting yet. Anchors on pages that weren't scanned can't be checked, and links starting `#hs-` (HubSpot chat/meeting triggers), `#top`, `#/` and `#!` are ignored.

- **Form tests are a page's last step.** The test presses Tab, submits empty and leaves every non-GET request blocked, so nothing else runs on that page afterwards. Forms without required fields, without a visible submit button, or with pre-filled fields aren't submitted (the reason is shown). Label contrast comes from the main axe pass (Modules tab), not the form check.
- **Listed pages added to the sitemap are outside the page limit and path filters**: "sitemap plus these pages" scans the limited, filtered sitemap and then every listed page.

## Open questions

- Which security headers can be set in HubSpot domain settings, and which need Cloudflare? The HubSpot KB article returned 404, so fix text says "HubSpot domain settings or Cloudflare".
- How to tell a global module (header/footer) from a page-level one reliably across themes? Currently: `data-global-resource-path` or inside `header` / `footer` / landmark roles.
- Are password-protected or members-only pages in scope for v1?

## Environment

| Thing | Where |
| --- | --- |
| Supabase project | `tikwmidmueieicuyqsem` ("HubSpot Site Auditor") |
| Repo | https://github.com/junelapera/hubspot-site-auditor (public) |
| Worker hosting | GitHub Actions (`.github/workflows/scan.yml`) |
| Web hosting | Vercel, scope S2, project `hubspot-site-auditor`: https://hubspot-site-auditor.vercel.app (root `apps/web`) |
| Auth | Supabase Auth: invite-only (sign-up off), email confirmation on, Site URL = production URL |
