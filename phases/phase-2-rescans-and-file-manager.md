# Phase 2 — Re-scans and File Manager

Source: [HubSpot Site Auditor — PRD](../HubSpot%20Site%20Auditor%20—%20PRD.md) · Status: In progress — run history, comparison, scores, and most security checks done · Depends on: [Phase 1](phase-1-mvp.md)

## Goal

Make the tool usable across a whole remediation sprint and a migration launch, not just a one-off audit:

- Re-scan and see what was **fixed**, what is **new**, and what is **still open**.
- Cover the rest of the checks in the PRD: forms, File Manager images, external links, old-URL redirects, and the remaining security checks.

## In scope

- Run history and fixed / new / still-open comparison
- Won't fix and false positive marking
- File Manager pass through the HubSpot Files API
- Form check with keyboard and empty-submit tests
- Old-URL redirect check with bulk-import CSV
- External link checks
- Security check: mixed content, cookies, outdated JS libraries, third-party scripts
- Fix suggestions for forms, links, and alt text
- Mobile-width scan
- Sampling mode (one page per template)

## Out of scope (later phases)

- Shareable client report, scheduled scans, Teamwork push → Phase 3
- Exact module paths via CMS Pages API → Phase 3
- Claude API-tailored fix snippets → Phase 3

## Work breakdown

### 1. Run history and comparison

- [x] Every run saved per site (already stored in Phase 1; add the run list UI)
- [x] Compare any two runs by issue fingerprint: **fixed**, **new**, **still open**, plus **not rechecked** when the newer scan didn't cover an issue's pages
- [x] Mark an issue **won't fix** or **false positive** with a note
- [x] Marked issues stay hidden in later runs (matched by fingerprint), with a toggle to show them; also left out of the issues CSV
- [x] Accessibility score and security grade (A–F) per run, shown over time *

### 2. File Manager pass

- [ ] Site settings: store a HubSpot private app token (`files` scope), encrypted
- [ ] Pull File Manager images through the Files API
- [ ] Run the alt-text checks that the API data supports (see open question below)
- [ ] Unused File Manager image (not found on any scanned page) → Info *
- [ ] File Manager images appear in the image view and image CSV

### 3. Form check

- [ ] Detect HubSpot forms on each page
- [ ] Missing label (placeholder only, or no programmatic label) → form editor
- [ ] Required state not announced → theme JS or form editor
- [ ] Errors not tied to their field or not announced → theme JS
- [ ] No visible focus outline on fields or submit → theme CSS
- [ ] Label, placeholder, or error text contrast below 4.5:1 → theme CSS
- [ ] Consent checkbox has no label → form editor
- [ ] Field or submit unreachable with Tab → theme or form editor
- [ ] Tab through each form and **submit empty only** — never a filled form, so no test contacts are created
- [ ] Forms in a cross-origin iframe listed as "not checked" for manual testing
- [ ] **Forms view**: each form with failing checks and the page it sits on *

### 4. Links and redirects (remaining checks)

- [ ] External links: 4xx / 5xx flagged; HEAD then GET; per-domain rate limit
- [ ] Skip list for external sites that block bots
- [ ] Broken anchor: `#section` points to an ID not on the page *
- [ ] Upload an old sitemap (e.g. WordPress); flag old URLs that return 404
- [ ] Suggest a new URL by slug match
- [ ] CSV of missing redirects in HubSpot's bulk redirect import format

### 5. Security check (remaining checks)

- [x] Mixed content: `http://` image, script, or font on an HTTPS page, mapped to module like a11y issues
- [x] Cookies: first-party cookie missing `Secure`, `HttpOnly`, or `SameSite`
- [ ] Outdated JS libraries with known CVEs (Retire.js)
- [x] Third-party scripts: list every external script domain; flag new ones since the last run (needs run history)

### 6. Fix suggestions (new templates)

- [ ] Forms: the form editor setting to change, or a theme CSS/JS snippet
- [ ] Links: likely replacement URL, or a ready-made redirect row
- [ ] Alt text: why the current alt fails, plus an example of good alt for that kind of image

### 7. Scan options

- [ ] Mobile-width scan alongside desktop; issues tagged by viewport, deduped across both
- [ ] Sampling mode: one page per template for a fast first pass on large sites
- [ ] Paste a URL list instead of the sitemap, or add URLs the sitemap misses *

### 8. Views

- [ ] **Rule view**: issues grouped by WCAG rule, for conformance summaries *
- [ ] Comparison view for two runs

\* Not assigned to a phase in the PRD. Placed here because it depends on something built in this phase.

## Acceptance criteria

- [x] Re-scanning an unchanged site shows **zero** new and zero fixed issues (fingerprints are stable) — verified on two identical 10-page saltedstone.com scans
- [ ] After fixing one module, a re-scan shows its issues as fixed on every affected page
- [ ] Form check creates **no** contacts in the HubSpot portal (verify in CRM after a test run)
- [ ] Missing-redirect CSV imports into HubSpot's bulk redirect tool without edits
- [ ] After a test migration, **zero** old URLs are left without a redirect at launch
- [ ] External link checker stays within the per-domain rate limit (no bans from common sites)
- [ ] Sampling mode returns a module list for a 1,000+ page site in under 15 minutes

## Risks to watch

| Risk | Mitigation in this phase |
| --- | --- |
| Alt-text rules flag good alt as bad | False positive marking; tune the generic word list |
| External sites block or rate-limit the link checker | HEAD requests, per-domain limits, skip list |
| Forms inside cross-origin iframes can't be scanned | Listed as "not checked" |
| Viewport differences double-count issues | Dedupe across viewports by fingerprint |

## Open questions to resolve before starting

- [ ] Does HubSpot File Manager store alt text per file, or only per usage in a module field? This decides what the File Manager pass can check.
