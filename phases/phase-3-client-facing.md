# Phase 3 — Client-facing

Source: [HubSpot Site Auditor — PRD](../HubSpot%20Site%20Auditor%20—%20PRD.md) · Status: Not started · Depends on: [Phase 2](phase-2-rescans-and-file-manager.md)

## Goal

Turn the internal tool into something clients and project managers use directly, and close the two biggest accuracy gaps from v1: module naming guessed from class names, and generic fix snippets.

## In scope

- Shareable read-only client report
- Scheduled monthly scans with email summary
- Direct push of issues to Teamwork.com
- Exact module paths from the HubSpot CMS Pages API, instead of guessing from class names
- Fix snippets tailored by the Claude API to the module's actual code

## Work breakdown

### 1. Shareable client report

- [ ] Read-only report link per run, no login required
- [ ] Unguessable token in the URL; revoke and regenerate from the app
- [ ] Optional expiry date per link
- [ ] Client-friendly layout: summary, accessibility score, security grade, module list, page view
- [ ] Hide internal notes and won't-fix / false-positive reasons by default
- [ ] Clear statement that the scan is automated and passive — not a full audit or certification

### 2. Scheduled scans

- [ ] Per-site schedule (monthly by default) with the same settings as the last manual run
- [ ] Scheduler enqueues runs into the existing Supabase job queue
- [ ] Email summary after each scheduled run: new, fixed, still open, security grade change
- [ ] Recipient list per site
- [ ] Alert when a scheduled run fails (blocked, sitemap missing, token expired)

### 3. Teamwork.com push

- [ ] Connect a Teamwork.com account per workspace
- [ ] Map a site to a Teamwork project and task list
- [ ] Push one task per module + rule, with suggested fix, affected pages, and severity
- [ ] Store the Teamwork task ID on the issue so re-pushes update instead of duplicating
- [ ] When a re-scan marks an issue fixed, comment on (or close) the linked task

### 4. Exact module paths (CMS Pages API)

- [ ] Use the private app token to read page content from the CMS Pages API
- [ ] Map each module wrapper on the page to its module path in the theme (e.g. `theme/modules/hero-banner.module`)
- [ ] Show module path alongside the class-based name; fall back to Phase 1 naming when unavailable
- [ ] Reliably separate global (header/footer) modules from page-level modules

### 5. Claude API fix snippets

- [ ] Fetch the module's source (HTML / HubL / CSS) from the theme
- [ ] Send the failing HTML, axe rule, and module source to the Claude API; return a tailored snippet
- [ ] Cache suggestions per module + rule + module version so re-scans don't re-call the API
- [ ] Keep the template suggestion as a fallback and show which one was used
- [ ] Label every snippet as a suggestion for developer review

## Acceptance criteria

- [ ] A client can open a report link with no account and see only that run's report
- [ ] Revoking a link stops it working immediately
- [ ] Monthly scans run unattended for all active a11y clients for one full cycle
- [ ] Teamwork push re-run on the same scan creates **no** duplicate tasks
- [ ] Module path resolved for **95%+** of module issues on sites where the token has access
- [ ] **70% or more** of fix suggestions applied without a major rewrite (tracked on a sample)
- [ ] All active a11y clients scanned at least once in the first 3 months

## Risks to watch

| Risk | Mitigation in this phase |
| --- | --- |
| Shared link exposes more than intended | Token links, revoke, expiry, internal notes hidden |
| Claude snippet is wrong for a custom theme | Template fallback; always labelled as a suggestion |
| Module source sent to an external API | Confirm with clients / agency policy before enabling; per-site opt-in |
| Teamwork API limits during large pushes | Batch and rate-limit pushes |

## Open questions to resolve before starting

- [ ] Internal tool only, or something to offer clients as a paid service later? This decides whether the client report needs branding, multi-tenant accounts, and billing.
