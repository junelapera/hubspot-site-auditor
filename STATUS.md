# Status

Last updated: Oct 22, 2026 · Current phase: **Phase 1 — MVP (in progress)**

The full checklist is in [phases/phase-1-mvp.md](phases/phase-1-mvp.md). This file is the short version: what works, what's next, and what's blocking.

## Working

| Area | State |
| --- | --- |
| Scanner (worker) | Crawl, axe scan, module mapping, dedupe, alt / link / security checks, fix suggestions. Runs locally (CLI) and from the Supabase queue. |
| Database | Schema, queue (`claim_run`), and `module_summary` view applied to Supabase. Sign-up and reads limited to @saltedstone.com, tested on the live project. |
| Web app | Email + password sign-up and sign-in (@saltedstone.com only) with password reset; sites, run a scan with live progress, report with Modules / Pages / Images / Links / Security tabs and copyable fixes. Deployed to Vercel; pushes to `main` deploy production. "Run scan" in production verified: the worker started 47s after the click. |
| Worker hosting | GitHub Actions workflow (`scan.yml`): on dispatch, by hand, and every 15 min. Verified from the app's "Run scan" button: a 5-page scan started 42s after the click (Chromium cached) and finished 15s later. Public log shows run IDs only. |
| CSV exports | Issues (one row per module + rule, Teamwork / Jira columns), images, links, security. Download buttons on every report. Formula-injection safe, UTF-8 BOM for Excel. |
| Tests | 28 worker + 9 web unit tests (`pnpm test`); both apps typecheck; web app lints and builds. |

## Results so far (saltedstone.com)

| Measure | Result | Target |
| --- | --- | --- |
| Page findings → unique issues (40 pages) | 99 → 35, in 12 groups | — |
| Issues mapped to a named module | 100% | 90% |
| Full run, 10 pages (scan + links + security) | 27s | 200 pages in under 15 min |
| Page scan speed | ~1.4s per page at concurrency 3–4 | — |

Only one site has been scanned so far. The acceptance criteria call for 3 real client sites.

## Next

1. **Supabase Auth URLs:** set Site URL to the production URL and add the redirect URLs (production, localhost, previews) so sign-up confirmation and password-reset links land on the right app.
2. **Custom SMTP** in Supabase Auth, so teammates can receive sign-in emails.
3. **Acceptance runs** on 3 client sites: named-module rate, alt-text false positives, a SecurityScorecard comparison, a 200-page timing, and a test import of the issues CSV into Teamwork.

## Known issues and decisions

- **Rate limiting:** saltedstone.com returned HTTP 429 after a few back-to-back test scans. The scanner now backs off and retries, and reports rate-limited links as "not checked", never "broken". Test with small `--limit` values.
- **Link check skips exact sitemap URLs.** HubSpot builds the sitemap from published pages, so those are treated as live. This cut the link stage from 191s to 6s on a 10-page run. Near-matches (trailing slash, `http`) are still requested.
- **Fix suggestions are stored at scan time.** Changing a template in `apps/worker/src/fixes.ts` only affects new scans.
- **Supabase default email** sends only a few emails per hour, and only to members of the Supabase organization. Teammates need custom SMTP before they can sign in.
- **Worker runs on GitHub Actions, not Railway** (the PRD's choice). It's free on a public repo, at the cost of ~1–2 min startup per scan. Logs are public, so the worker runs with `REDACT_LOGS=1`.
- **Cache Components is off** in the web app on purpose: every page is per-user live data.
- **GitHub dispatch token expires 2027-01-20.** After that, "Run scan" falls back to the 15-minute schedule until a new token is set in `apps/web/.env.local` and Vercel.
- **Sign-up still sends one email** (confirmation) while "Confirm email" is on in Supabase Auth, and password reset sends one. Sign-in sends none.
- **`june.lapera@saltedstone.com` has no password yet:** it was created through the admin API for magic-link testing. Use "Forgot password?" once to set one.

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
