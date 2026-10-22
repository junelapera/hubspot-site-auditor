# CLAUDE.md

Guidance for working in this repo. Read [STATUS.md](STATUS.md) first for current state, and the relevant `phases/*.md` file for scope. The PRD is the source of truth for product decisions.

## Commands

```bash
pnpm test        # worker unit tests (node:test via tsx)
pnpm typecheck   # both apps
pnpm lint        # web
pnpm build       # web production build
pnpm dev         # web on :3000
pnpm worker      # queue worker (loads apps/worker/.env)
pnpm scan <domain> --limit 10   # local scan, no Supabase; JSON goes to apps/worker/scans/
```

Run `pnpm test` and `pnpm typecheck` before saying a change is done. For web changes, also run `pnpm build`.

## Repo map

- `apps/worker/src/pipeline.ts` — `runAudit()`, the whole scan; shared by the CLI and the queue worker.
- `apps/worker/src/browser/inspect.js` — runs inside scanned pages; maps elements to modules.
- `apps/worker/src/aggregate.ts` — fingerprints, dedupe, module summary.
- `apps/worker/src/fixes.ts` — template fix suggestions.
- `apps/worker/src/http.ts` — `politeFetch`, used for every outbound request.
- `apps/worker/src/worker.ts` — queue worker; `--once` drains the queue and exits (GitHub Actions).
- `.github/workflows/scan.yml` — the production worker.
- `apps/web/src/lib/dispatch.ts` — starts the workflow when a scan is queued.
- `apps/web/src/app/runs/[id]/views.tsx` — report tabs.
- `supabase/migrations/` — schema, `claim_run`, RLS.

## Rules that aren't obvious from the code

### Scanner

- **Keep `browser/inspect.js` plain JavaScript.** It's read as a string and passed to `page.evaluate`. If it were TypeScript, tsx would inject a `__name` helper that doesn't exist in the page.
- **Don't change the fingerprint inputs** (`ruleId | scope | module | path` in `aggregate.ts`, or how `stablePath` builds paths) without planning for it. Phase 2's fixed / new / still-open comparison matches issues across runs by fingerprint, so a change makes every old issue look "fixed" and every current one "new".
- **Every outbound HTTP request goes through `politeFetch`.** HubSpot's Cloudflare edge rate-limits quickly. A 429 must never become a "broken link" or an axe scan of an error page.
- **Worker logs must stay redacted.** In production the worker runs on GitHub Actions, and logs on this public repo are public. With `REDACT_LOGS=1`, log run IDs only: never domains, URLs, page paths, or raw error messages. Save details on the run row instead. Apply this to any new `console.*` call in worker code.
- **Be gentle with real sites.** Use `--limit 10` or less while developing, and don't run repeated full scans of client sites.
- **Fix suggestions are computed at scan time and stored** in `issues.fix`, `images.fixes`, etc. Template changes only show on new scans.
- `moduleLabel()` exists in both `apps/worker/src/aggregate.ts` and `apps/web/src/lib/format.ts`. Keep them in sync.
- The worker uses TypeScript 7, which needs `"types": ["node"]` in its tsconfig.

### Web (Next.js 16)

- **This Next.js version differs from older docs.** Before writing Next code, read the relevant guide in `apps/web/node_modules/next/dist/docs/` (see `apps/web/AGENTS.md`).
- Middleware is called **Proxy** here: `src/proxy.ts`.
- `params` and `searchParams` are Promises. Use the global `PageProps<"/route">` / `LayoutProps<"/">` types.
- **Cache Components is off on purpose** (`next.config.ts`): every page is per-user live data. Don't turn it on without adding Suspense boundaries around every session read.
- A `"use server"` file may only export async functions. Exporting a constant breaks the build with "module has no exports".
- Server code reads data through `createClient()` / `requireUser()` from `@/lib/supabase/server`, as the signed-in user. Never use the service role key in the web app.
- `apps/web/src/lib/types.ts` mirrors the database by hand. Update it when a migration changes a table.
- UI is a light theme with Tailwind. Keep it accessible (labels, focus styles, `role="status"` / `role="alert"`); this is an accessibility tool.

### Database

- Change the schema only with a new file in `supabase/migrations/`, applied with `npx supabase db push` (the repo is linked; no Docker needed). Never edit an applied migration.
- Access is limited to @saltedstone.com in two layers: a trigger on `auth.users` and `is_team_member()` in every RLS policy. New tables need RLS enabled and `is_team_member()` policies.
- The worker writes with the service role, which bypasses RLS. Users can only insert sites and queued runs. Run status changes come from the worker.
- To test SQL without a live database, use PGlite (`@electric-sql/pglite`) with small stubs: an `auth` schema, an `auth.users` table, `auth.uid()`, `auth.jwt()`, and the `anon` / `authenticated` roles.

## Secrets

`apps/worker/.env` (service role key) and `apps/web/.env.local` are gitignored. Never print their values. Read variable names only, e.g. `grep -E '^[A-Z_]+=' file | sed 's/=.*//'`. The repo is **public**.

## Keeping docs current

When finishing a piece of work, tick it off in `phases/phase-N-*.md` and update STATUS.md (Working / Next / Known issues). Keep README.md about setup and usage, not progress.
