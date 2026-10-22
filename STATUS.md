# Status

Last updated: Oct 22, 2026 · Current phase: **Phase 1 — MVP (in progress)**

The full checklist is in [phases/phase-1-mvp.md](phases/phase-1-mvp.md). This file is the short version: what works, what's next, and what's blocking.

## Working

| Area | State |
| --- | --- |
| Scanner (worker) | Crawl, axe scan, module mapping, dedupe, alt / link / security checks, fix suggestions. Runs locally (CLI) and from the Supabase queue. |
| Database | Schema, queue (`claim_run`), and `module_summary` view applied to Supabase. Sign-up and reads limited to @saltedstone.com, tested on the live project. |
| Web app | Magic-link login, sites, run a scan with live progress, report with Modules / Pages / Images / Links / Security tabs and copyable fixes. Runs locally. "Run scan" triggers the GitHub Actions worker when `GITHUB_DISPATCH_TOKEN` is set. |
| Worker hosting | GitHub Actions workflow (`scan.yml`): on dispatch, by hand, and every 15 min. Verified from the app's "Run scan" button: a 5-page scan started 42s after the click (Chromium cached) and finished 15s later. Public log shows run IDs only. |
| Tests | 28 worker unit tests; both apps typecheck; web app lints and builds. |

## Results so far (saltedstone.com)

| Measure | Result | Target |
| --- | --- | --- |
| Page findings → unique issues (40 pages) | 99 → 35, in 12 groups | — |
| Issues mapped to a named module | 100% | 90% |
| Full run, 10 pages (scan + links + security) | 27s | 200 pages in under 15 min |
| Page scan speed | ~1.4s per page at concurrency 3–4 | — |

Only one site has been scanned so far. The acceptance criteria call for 3 real client sites.

## Next

1. **CSV exports:** issues (Teamwork / Jira import), flagged images, security checks.
2. **Deploy the web app** to Vercel: Root Directory `apps/web`, the Supabase env vars, `GITHUB_DISPATCH_TOKEN`, and `GITHUB_REPOSITORY`. Add the production URL to Supabase Auth redirect URLs.
3. **Custom SMTP** in Supabase Auth, so teammates can receive sign-in emails.
4. **Acceptance runs** on 3 client sites: named-module rate, alt-text false positives, a SecurityScorecard comparison, and a 200-page timing.

## Known issues and decisions

- **Rate limiting:** saltedstone.com returned HTTP 429 after a few back-to-back test scans. The scanner now backs off and retries, and reports rate-limited links as "not checked", never "broken". Test with small `--limit` values.
- **Link check skips exact sitemap URLs.** HubSpot builds the sitemap from published pages, so those are treated as live. This cut the link stage from 191s to 6s on a 10-page run. Near-matches (trailing slash, `http`) are still requested.
- **Fix suggestions are stored at scan time.** Changing a template in `apps/worker/src/fixes.ts` only affects new scans.
- **Supabase default email** sends only a few emails per hour, and only to members of the Supabase organization. Teammates need custom SMTP before they can sign in.
- **Worker runs on GitHub Actions, not Railway** (the PRD's choice). It's free on a public repo, at the cost of ~1–2 min startup per scan. Logs are public, so the worker runs with `REDACT_LOGS=1`.
- **Cache Components is off** in the web app on purpose: every page is per-user live data.
- **GitHub dispatch token expires 2027-01-20.** After that, "Run scan" falls back to the 15-minute schedule until a new token is set in `apps/web/.env.local` and Vercel.
- **Test user:** `june.lapera@saltedstone.com` was created through the admin API to test the login flow.

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
| Web hosting | Not deployed (local only) |
