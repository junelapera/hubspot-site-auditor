import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Badge } from "@/components/badge";
import { DisclosureChevron } from "@/components/chevron";
import { LocalTime } from "@/components/local-time";
import { ScoreCards } from "@/components/scores";
import { moduleLabel, pathOf, SCOPE_HINT, widthOnly } from "@/lib/format";
import { criteriaFromTags, WCAG_SC } from "@/lib/rules";
import { accessibilityScore, securityGrade } from "@/lib/scores";
import { createClient } from "@/lib/supabase/server";
import { moduleKey, summarizeModules } from "@/lib/summary";
import type { Impact, SharedReport, Viewport } from "@/lib/types";

// The token is in the URL: keep it out of search engines and out of the Referer sent to other sites.
export const metadata: Metadata = {
  title: "Site scan report",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const IMPACT_ORDER: Record<Impact, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };
const MAX_PAGES_LISTED = 10;

/** Read-only client report for one scan. No login: shared_report() checks the token and returns only what's shown here. */
export default async function SharedReportPage({ params }: PageProps<"/r/[token]">) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("shared_report", { p_token: token });
  if (error) throw error;
  if (!data) notFound();
  const report = data as SharedReport;

  const { site, summary, issues, pages, security } = report;
  const checked: Viewport[] = summary.viewports ?? ["desktop"];
  const scores = { accessibility: accessibilityScore(issues, summary.pagesScanned), security: securityGrade(security) };
  const modules = summarizeModules(issues);
  const byModule = new Map<string, SharedReport["issues"]>();
  for (const i of issues) byModule.set(moduleKey(i), [...(byModule.get(moduleKey(i)) ?? []), i]);

  const issuesOnPage = (url: string) => issues.filter((i) => i.pages.includes(url));
  const pageRows = pages
    .map((p) => ({ ...p, issues: issuesOnPage(p.url) }))
    .sort((a, b) => Number(a.failed) - Number(b.failed) || b.issues.length - a.issues.length);
  const failedChecks = security.filter((c) => !c.pass);

  return (
    <main className="page space-y-8">
      <div>
        <Image src="/brand/saltedstone.svg" alt="Salted Stone" width={110} height={32} className="mb-6" />
        <p className="eyebrow">Accessibility and security scan</p>
        <h1 className="mt-2 font-display text-4xl font-medium leading-tight tracking-tight break-words sm:text-5xl">{site.name ?? site.domain}</h1>
        <p className="text-sm text-ink/75">
          {site.domain} · Scanned <LocalTime iso={report.created_at} /> · {summary.pagesScanned} {summary.pagesScanned === 1 ? "page" : "pages"}
          {checked.includes("mobile") ? " at desktop and mobile widths" : " at desktop width"}
        </p>
      </div>

      <section aria-labelledby="about-heading" className="card space-y-2 bg-cream p-4 text-sm text-ink/85">
        <h2 id="about-heading" className="eyebrow">About this report</h2>
        <p>
          This is an automated, passive scan by Salted Stone. It is not a full accessibility audit, a security assessment or a
          certification of conformance. Automated tools find only some accessibility problems; a full audit adds manual testing with
          keyboards and screen readers. The security checks look only at what any browser can see (headers, certificates, cookies
          and the files pages load); nothing was attacked or logged into.
        </p>
        {summary.sample && (
          <p>
            {summary.pagesScanned} of {summary.sample.discovered} pages were scanned, chosen to cover {summary.sample.covered} of the{" "}
            {summary.sample.modules} modules used on the site. A module&apos;s issues usually appear on its other pages too.
          </p>
        )}
      </section>

      <ScoreCards scores={scores} forClient />

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Pages scanned", value: summary.pagesScanned },
          { label: "Accessibility issues", value: issues.length },
          { label: "Modules affected", value: modules.length },
          { label: "Security checks failed", value: `${failedChecks.length} of ${security.length}` },
        ].map((t) => (
          <div key={t.label} className="card p-4">
            <dt className="font-mono text-[10px] font-bold tracking-[0.08em] uppercase">{t.label}</dt>
            <dd className="mt-1 font-display text-4xl font-medium tabular-nums">{t.value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="modules-heading" className="space-y-2">
        <h2 id="modules-heading" className="font-display text-3xl font-medium">Accessibility issues by module</h2>
        {!modules.length ? (
          <p className="card p-6 text-sm text-ink/75">No accessibility issues were found on the scanned pages.</p>
        ) : (
          <>
            <p className="text-sm text-ink/75">
              Most HubSpot pages are built from shared modules, so fixing an issue once in a module fixes it on every page that uses it.
              Sorted by impact: the first module is the fix that clears the most.
            </p>
            {modules.map((m) => {
              const group = [...(byModule.get(moduleKey(m)) ?? [])].sort(
                (a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact] || b.pages.length - a.pages.length,
              );
              return (
                <details key={moduleKey(m)} className="group card">
                  <summary className="grid cursor-pointer select-none grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,2fr)_6rem_6rem_7rem]">
                    <span className="flex items-start gap-2">
                      <DisclosureChevron className="mt-0.5" />
                      <span>
                        <span className="font-mono text-sm font-medium text-ink">{moduleLabel(m.scope, m.module)}</span>
                        <span className="block text-xs text-ink/70">{SCOPE_HINT[m.scope]}</span>
                      </span>
                    </span>
                    <span className="text-sm text-ink/85">{m.issue_count} {m.issue_count === 1 ? "issue" : "issues"}</span>
                    <span><Badge tone={m.worst_impact}>{m.worst_impact}</Badge></span>
                    <span className="text-sm text-ink/85">{m.pages_affected} {m.pages_affected === 1 ? "page" : "pages"}</span>
                  </summary>
                  <ul className="space-y-3 border-t border-ink/30 p-4">
                    {group.map((issue) => {
                      const only = widthOnly(issue.viewports, checked);
                      const criteria = criteriaFromTags(issue.tags);
                      return (
                        <li key={issue.id} className="space-y-2 rounded-lg border border-ink/30 bg-paper p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={issue.impact}>{issue.impact}</Badge>
                            <h3 className="text-sm font-semibold text-ink">{issue.help}</h3>
                            {only && <span className="chip bg-paper">{only}</span>}
                          </div>
                          <p className="text-xs text-ink/75">
                            {criteria.length
                              ? criteria.map((c) => `WCAG ${c}${WCAG_SC[c] ? ` ${WCAG_SC[c].name} (${WCAG_SC[c].level})` : ""}`).join(" · ")
                              : "Best practice (not a WCAG requirement)"}{" "}
                            ·{" "}
                            <a href={issue.help_url} target="_blank" rel="noreferrer" className="link">
                              About this rule ({issue.rule_id})
                            </a>
                          </p>
                          <div>
                            <h4 className="text-xs font-medium text-ink/70">On {issue.pages.length} {issue.pages.length === 1 ? "page" : "pages"}</h4>
                            <ul className="text-xs">
                              {issue.pages.slice(0, MAX_PAGES_LISTED).map((p) => (
                                <li key={p}>
                                  <a href={p} target="_blank" rel="noreferrer" className="inline-block py-1 text-ink/85 underline-offset-2 hover:underline">
                                    {pathOf(p)}
                                  </a>
                                </li>
                              ))}
                              {issue.pages.length > MAX_PAGES_LISTED && <li className="text-ink/70">and {issue.pages.length - MAX_PAGES_LISTED} more</li>}
                            </ul>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              );
            })}
          </>
        )}
      </section>

      <section aria-labelledby="pages-heading" className="space-y-2">
        <h2 id="pages-heading" className="font-display text-3xl font-medium">Pages</h2>
        <div className="overflow-x-auto card">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="border-b border-ink bg-cream font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Page</th>
                <th scope="col" className="px-4 py-2 font-medium">Issues</th>
                <th scope="col" className="px-4 py-2 font-medium">Worst severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/15">
              {pageRows.map((p) => {
                const worst = p.issues.reduce<Impact | null>((w, i) => (w === null || IMPACT_ORDER[i.impact] < IMPACT_ORDER[w] ? i.impact : w), null);
                return (
                  <tr key={p.url}>
                    <th scope="row" className="max-w-md break-all px-4 py-2 font-mono text-xs font-normal">
                      <a href={p.url} target="_blank" rel="noreferrer" className="link text-ink">{pathOf(p.url)}</a>
                    </th>
                    <td className="px-4 py-2 tabular-nums text-ink/85">{p.failed ? "Couldn't be scanned" : p.issues.length}</td>
                    <td className="px-4 py-2">{worst ? <Badge tone={worst}>{worst}</Badge> : <span className="text-ink/70">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="security-heading" className="space-y-2">
        <h2 id="security-heading" className="font-display text-3xl font-medium">Security checks</h2>
        {!security.length ? (
          <p className="card p-6 text-sm text-ink/75">No security results for this scan.</p>
        ) : (
          <div className="overflow-x-auto card">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-ink bg-cream font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Check</th>
                  <th scope="col" className="px-4 py-2 font-medium">Result</th>
                  <th scope="col" className="px-4 py-2 font-medium">Current</th>
                  <th scope="col" className="px-4 py-2 font-medium">Recommended</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/15 align-top">
                {[...security].sort((a, b) => Number(a.pass) - Number(b.pass)).map((c) => (
                  <tr key={c.check_id}>
                    <th scope="row" className="px-4 py-3 font-medium text-ink">{c.name}</th>
                    <td className="px-4 py-3"><Badge tone={c.pass ? "pass" : "fail"}>{c.pass ? "Pass" : "Fail"}</Badge></td>
                    <td className="max-w-xs break-words px-4 py-3 font-mono text-xs text-ink/85">{c.current}</td>
                    <td className="max-w-xs break-words px-4 py-3 font-mono text-xs text-ink/85">{c.recommended}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {report.expires_at && (
        <p className="text-sm text-ink/75">
          This link expires <LocalTime iso={report.expires_at} />.
        </p>
      )}
    </main>
  );
}
