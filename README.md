# HubSpot Site Auditor

Scans a whole HubSpot site for accessibility and security issues and **groups them by the HubSpot module that causes them**, so one fix in one module clears the issue on every page that uses it.

Per-page scanners (WAVE, Lighthouse, Siteimprove) report the same broken hero module 40 times. This tool reports it once, with the 40 pages it affects and a suggested fix.

See the [PRD](HubSpot%20Site%20Auditor%20—%20PRD.md) for the full spec and [STATUS.md](STATUS.md) for what works today.

## What it checks

| Check | What it does |
| --- | --- |
| Accessibility | axe-core (WCAG 2.1 / 2.2 A and AA) on every sitemap page, each failing element mapped to its module |
| Alt text | Missing, file-name, generic, empty-on-link, too-long, and redundant alt on page images |
| Links | Broken internal and external links, broken `#anchor` links, redirect chains, redirects to dead pages, internal `http://` links |
| Security | HTTPS redirect, HSTS, TLS versions, certificate expiry, security headers, version leaks, mixed content (mapped to modules), cookie flags, third-party script domains (new ones flagged), JavaScript libraries with known vulnerabilities (Retire.js) |

Every issue comes with a suggested fix: a corrected HTML / HubL / CSS snippet, an editor setting, a redirect row, or a header value.

Issues are grouped by where the fix lives:

| Group | Meaning |
| --- | --- |
| Module (e.g. `.hero-banner`) | Fix once in the module's code |
| Global | Header / footer — fix once, applies site-wide |
| Template | Fix in the page or blog template |
| Content | Fix in the page/post editor or CTA tool |
| Embed | Inside a third-party iframe (e.g. YouTube) — not fixable in the theme |

The security checks are **passive**: they read what any browser sees and never send attack traffic. Reports state that this is an automated scan, not a full audit.

## Comparing scans

Re-scan a site after fixes and the report shows what changed since its previous scan. The full comparison (`/runs/:id/compare`) works between any two scans of a site, matching issues by fingerprint (rule + module + element path):

| Bucket | Meaning |
| --- | --- |
| Fixed | In the older scan, gone from the same pages in the newer one |
| New | In the newer scan only |
| Still open | In both |
| Not rechecked | In the older scan, but the newer scan didn't cover any of its pages (smaller page limit or different path filters) |

Any issue can be marked **won't fix** or **false positive** with a note. Marks belong to the site, so the issue stays hidden in every scan of that site until someone unmarks it; a toggle on the report shows marked issues. Marked issues are left out of the counts and the issues CSV.

## Scores

Each scan gets an **accessibility score** (0–100) and a **security grade** (A–F), shown on the report with the change since the previous scan, and next to every scan in the site's history.

- **Accessibility score:** each scanned page starts at 100 and loses 15 / 8 / 3 / 1 points per critical / serious / moderate / minor issue on it (never below 0); the score is the average over scanned pages. Automated (axe) issues only; marked issues don't count.
- **Security grade:** 100 minus points per failed check (20 for old TLS or certificate expiry; 10 for the HTTPS redirect, HSTS, CSP, X-Frame-Options, mixed content, vulnerable JS libraries; 5 for the rest). A is 90+, B 80+, C 70+, D 60+, otherwise F. It's the tool's own measure, not a SecurityScorecard grade.

Scores are worked out when a page is shown (`apps/web/src/lib/scores.ts`), so changing a weight changes every past scan's score too.

## How it works

```
Web app (Next.js) ──queues a run──▶ Supabase (runs table) ◀──polls── Worker (Node + Playwright)
        ▲                                   │                              │
        └──────── reads results ────────────┘◀──── writes results ─────────┘
```

The worker claims a queued run, then:

1. **Crawl:** reads `sitemap.xml` (and nested sitemaps), applies path filters and the page limit.
2. **Scan:** loads each page in headless Chromium and runs axe-core.
3. **Map source:** walks from each failing element up to its HubSpot module wrapper and names the module by its root BEM class. This is the step other scanners don't have.
4. **Check:** alt text, internal links, security headers / TLS, and what the browser loaded (mixed content, cookies, third-party scripts, JS library versions).
5. **Suggest and save:** attaches a template fix to every issue and writes everything back to Supabase.

The worker runs separately from the web app because headless browsers don't fit serverless function limits. In production it runs on GitHub Actions; see [Deploying](#deploying).

## Repo layout

```
apps/
  worker/            Scanner: crawl, axe scan, module mapping, checks, queue worker, local CLI
    src/browser/     Script injected into scanned pages (plain JS on purpose)
    src/checks/      Alt text, links, security
    test/            node:test unit tests
  web/               Next.js 16 app: login, sites, scan queue, report views
supabase/
  migrations/        Schema, queue function, RLS
phases/              Phase 1–3 plans and checklists
```

## Setup

Requirements: Node 22+, pnpm, and a Supabase project. Docker is not needed.

```bash
pnpm install
pnpm --filter worker exec playwright install chromium   # add --with-deps on a fresh Linux box
```

### Database

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Accounts are **invite-only** and limited to one email domain, set in
`supabase/migrations/20261022000100_restrict_to_agency_domain.sql` and `apps/web/src/lib/auth.ts`. Change both to use your own domain. In Supabase Auth, turn off **Allow new users to sign up**; members invite teammates from the app's Team page, which makes a one-time link to share (no email needed).

The first account has to be created by hand: use **Authentication → Users → Add user** in the Supabase dashboard (with a password and "Auto confirm").

In the Supabase dashboard under **Authentication → URL Configuration**, set the Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` to the redirect URLs.

### Environment

```bash
cp apps/worker/.env.example apps/worker/.env      # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
cp apps/web/.env.example apps/web/.env.local      # NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
```

The web app reads data with the public anon key and each user's session, so row-level security applies. It also needs the service role key, server-side only, to create invites and list the team.

## Running

```bash
pnpm dev        # web app on http://localhost:3000
pnpm worker     # queue worker: picks up scans queued from the web app
```

Scan without Supabase, printing the module list to the terminal and saving JSON to `apps/worker/scans/`:

```bash
pnpm scan www.example.com --limit 20
pnpm scan www.example.com --include "/services/**" --exclude "/blog/page/**"
```

Keep `--limit` small while developing. HubSpot's Cloudflare edge rate-limits quickly; the scanner backs off on HTTP 429, but repeated full scans will still get throttled.

## Deploying

| Part | Where | How |
| --- | --- | --- |
| Web app | Vercel | Import the repo, set Root Directory to `apps/web`, add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (sensitive), `GITHUB_DISPATCH_TOKEN` (sensitive), and `GITHUB_REPOSITORY` |
| Worker | GitHub Actions | [`.github/workflows/scan.yml`](.github/workflows/scan.yml) drains the queue and exits |
| Database + auth | Supabase | `npx supabase db push` |

**Worker on GitHub Actions.** The workflow starts when someone clicks **Run scan** (the web app calls the GitHub API), when started by hand from the Actions tab, and every 15 minutes as a fallback. A first job checks the queue in a few seconds; the scan job installs Chromium and runs `pnpm --filter worker start:once` only when there is work. On a public repo, Actions minutes are free.

Set up:

1. Repo secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (**Settings → Secrets and variables → Actions**).
2. A fine-grained personal access token for this repo only, with **Actions: read and write**. Add it to the web app as `GITHUB_DISPATCH_TOKEN`, along with `GITHUB_REPOSITORY=owner/repo`. Without it, scans still run, but only on the 15-minute schedule.

**Logs are public on a public repo.** The workflow sets `REDACT_LOGS=1`, so the worker prints run IDs only, never domains, URLs, or error text. Full errors are saved on the run and shown in the app.

GitHub disables scheduled workflows after 60 days without repo activity. Dispatched scans keep working; re-enable the schedule from the Actions tab if needed.

For local development, run `pnpm worker` instead. It polls every 5 seconds.

## Design

The web app follows the Salted Stone look from saltedstone.com. Brand tokens (colors, fonts) and shared component classes (`page`, `btn`, `card`, `input`, `label`, `chip`, `eyebrow`) live in [`apps/web/src/app/globals.css`](apps/web/src/app/globals.css), with contrast ratios noted. Rules:

- Text on any brand color is ink; brand orange and red are never used as text on cream.
- Focus rings are ink.
- Icons come from `lucide-react` (chevrons in `apps/web/src/components/chevron.tsx`), not text arrows.
- Dropdowns use Radix Select styled with the brand (`apps/web/src/components/scan-select.tsx`), not native `<select>`, so the open list matches the app. Radix handles keyboard, type-ahead and screen-reader roles.
- Headings use New Spirit Condensed when the Adobe Fonts kit allows the domain, otherwise Fraunces.

### Checks

```bash
pnpm test        # unit tests (worker + web)
pnpm typecheck   # both apps
pnpm lint        # web app
pnpm build       # web app production build
```

## Roadmap

- **Phase 1 — MVP:** module-aware scan, alt text, internal links, security headers, fix suggestions, report views, CSV export. [phases/phase-1-mvp.md](phases/phase-1-mvp.md)
- **Phase 2 — Re-scans and File Manager** (in progress; run comparison, won't-fix marking, scores, security checks, external links, anchors, and the WCAG view done): forms, File Manager, external links, old-URL redirects, mobile scan. [phases/phase-2-rescans-and-file-manager.md](phases/phase-2-rescans-and-file-manager.md)
- **Phase 3 — Client-facing:** shareable reports, scheduled scans, Teamwork push, CMS API module paths, Claude API fixes. [phases/phase-3-client-facing.md](phases/phase-3-client-facing.md)
