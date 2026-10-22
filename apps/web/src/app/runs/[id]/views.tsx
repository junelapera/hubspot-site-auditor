import Link from "next/link";
import { Badge } from "@/components/badge";
import { DisclosureChevron, NextChevron } from "@/components/chevron";
import { FixPanel } from "@/components/fix-panel";
import { MarkControl } from "@/components/mark-control";
import { ALT_CHECK_LABEL, LINK_CHECK_LABEL, moduleLabel, pathOf, SCOPE_HINT } from "@/lib/format";
import { previousRun } from "@/lib/compare-data";
import { createClient } from "@/lib/supabase/server";
import { moduleKey, summarizeModules } from "@/lib/summary";
import type { Impact, ImageRow, IssueMark, IssueRow, LinkRow, MixedContentRow, PageRow, Run, ScriptDomainRow, SecurityRow } from "@/lib/types";

const IMPACT_ORDER: Record<Impact, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="card p-6 text-sm text-ink/75">{children}</p>;
}

function PageList({ pages, max = 10 }: { pages: string[]; max?: number }) {
  return (
    <ul className="text-xs">
      {pages.slice(0, max).map((p) => (
        <li key={p}>
          <a href={p} target="_blank" rel="noreferrer" className="inline-block py-1 text-ink/85 underline-offset-2 hover:underline">
            {pathOf(p)}
          </a>
        </li>
      ))}
      {pages.length > max && <li className="text-ink/70">and {pages.length - max} more</li>}
    </ul>
  );
}

// ---------- Modules (default) ----------

export interface ViewProps {
  runId: string;
  siteId: string;
  /** Include issues marked won't fix / false positive. */
  showHidden: boolean;
}

async function issuesWithMarks(runId: string, siteId: string) {
  const supabase = await createClient();
  const [{ data: issues }, { data: marks }] = await Promise.all([
    supabase.from("issues").select("*").eq("run_id", runId).returns<IssueRow[]>(),
    supabase.from("issue_marks").select("*").eq("site_id", siteId).returns<IssueMark[]>(),
  ]);
  const markByFp = new Map((marks ?? []).map((m) => [m.fingerprint, m]));
  return { issues: issues ?? [], markByFp };
}

export async function ModulesView({ runId, siteId, showHidden }: ViewProps) {
  const { issues, markByFp } = await issuesWithMarks(runId, siteId);
  if (!issues.length) return <Empty>No accessibility issues found on the scanned pages.</Empty>;

  const hiddenCount = issues.filter((i) => markByFp.has(i.fingerprint)).length;
  const visible = showHidden ? issues : issues.filter((i) => !markByFp.has(i.fingerprint));
  const modules = summarizeModules(visible, runId);

  const byGroup = new Map<string, IssueRow[]>();
  for (const issue of visible) byGroup.set(moduleKey(issue), [...(byGroup.get(moduleKey(issue)) ?? []), issue]);

  return (
    <section aria-label="Issues by module" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink/75">Sorted by impact: the first row is the fix that clears the most issues.</p>
        {hiddenCount > 0 && (
          <Link
            href={`/runs/${runId}?view=modules${showHidden ? "" : "&hidden=1"}`}
            className="btn btn-secondary btn-sm"
          >
            {showHidden ? "Hide" : "Show"} {hiddenCount} marked {hiddenCount === 1 ? "issue" : "issues"}
          </Link>
        )}
      </div>
      {!modules.length && <Empty>Every issue in this scan is marked won&apos;t fix or false positive.</Empty>}
      {modules.map((m) => {
        const group = (byGroup.get(moduleKey(m)) ?? []).sort(
          (a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact] || b.pages.length - a.pages.length,
        );
        return (
          <details key={moduleKey(m)} className="group card">
            <summary className="grid cursor-pointer select-none grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,2fr)_6rem_6rem_7rem_minmax(0,2fr)]">
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
              <span className="truncate text-xs text-ink/70 sm:text-sm" title={m.rules.join(", ")}>{m.rules.join(", ")}</span>
            </summary>
            <div className="space-y-4 border-t border-ink/30 p-4">
              {group.map((issue) => (
                <IssueDetail key={issue.id} issue={issue} siteId={siteId} mark={markByFp.get(issue.fingerprint)} />
              ))}
            </div>
          </details>
        );
      })}
    </section>
  );
}

function IssueDetail({ issue, siteId, mark }: { issue: IssueRow; siteId: string; mark?: IssueMark }) {
  return (
    <article className="space-y-3 rounded-lg border border-ink/30 bg-paper p-3">
      <header className="flex flex-wrap items-center gap-2">
        <Badge tone={issue.impact}>{issue.impact}</Badge>
        <h3 className="text-sm font-semibold text-ink">{issue.help}</h3>
        <a href={issue.help_url} target="_blank" rel="noreferrer" className="font-mono text-xs text-ink/70 underline">
          {issue.rule_id}
        </a>
      </header>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          {issue.path && <p className="font-mono text-xs text-ink/75">{issue.path}</p>}
          <pre tabIndex={0} aria-label="Failing HTML" className="overflow-x-auto rounded-lg border border-ink/30 bg-cream p-2 font-mono text-xs text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"><code>{issue.html}</code></pre>
          <div>
            <h4 className="mb-1 text-xs font-medium text-ink/70">Affected pages ({issue.pages.length})</h4>
            <PageList pages={issue.pages} />
          </div>
        </div>
        <FixPanel fix={issue.fix} />
      </div>
      <MarkControl siteId={siteId} fingerprint={issue.fingerprint} mark={mark} />
    </article>
  );
}

// ---------- Pages ----------

export async function PagesView({ runId, siteId }: ViewProps) {
  const supabase = await createClient();
  const [{ data: pages }, { issues: allIssues, markByFp }] = await Promise.all([
    supabase.from("pages").select("*").eq("run_id", runId).order("url").returns<PageRow[]>(),
    issuesWithMarks(runId, siteId),
  ]);
  const issues = allIssues.filter((i) => !markByFp.has(i.fingerprint));
  if (!pages?.length) return <Empty>No pages in this scan.</Empty>;

  const issuesByPage = new Map<string, IssueRow[]>();
  for (const issue of issues) {
    for (const url of issue.pages) issuesByPage.set(url, [...(issuesByPage.get(url) ?? []), issue]);
  }
  const rows = pages
    .map((p) => ({ page: p, issues: (issuesByPage.get(p.url) ?? []).sort((a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact]) }))
    .sort((a, b) => b.issues.length - a.issues.length);

  return (
    <section aria-label="Issues by page" className="space-y-2">
      {rows.map(({ page, issues }) => (
        <details key={page.id} className="group card">
          <summary className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <span className="flex items-center gap-2 font-mono text-ink">
              <DisclosureChevron />
              {pathOf(page.url)}
            </span>
            <span className="flex items-center gap-2 text-ink/85">
              {page.error ? <Badge tone="fail">{page.error}</Badge> : `${issues.length} ${issues.length === 1 ? "issue" : "issues"}`}
              {issues[0] && <Badge tone={issues[0].impact}>{issues[0].impact}</Badge>}
            </span>
          </summary>
          {issues.length > 0 && (
            <ul className="divide-y divide-ink/15 border-t border-ink/30 text-sm">
              {issues.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                  <Badge tone={i.impact}>{i.impact}</Badge>
                  <span className="text-ink">{i.help}</span>
                  <span className="font-mono text-xs text-ink/70">in {moduleLabel(i.scope, i.module)}</span>
                </li>
              ))}
            </ul>
          )}
        </details>
      ))}
    </section>
  );
}

// ---------- Images ----------

export async function ImagesView({ runId }: ViewProps) {
  const supabase = await createClient();
  const { data: images } = await supabase.from("images").select("*").eq("run_id", runId).returns<ImageRow[]>();
  if (!images?.length) return <Empty>No alt-text problems found.</Empty>;

  const order = { critical: 0, serious: 1, minor: 2 };
  const sorted = images.sort((a, b) => order[a.severity] - order[b.severity] || b.pages.length - a.pages.length);

  return (
    <section aria-label="Flagged images" className="space-y-2">
      {sorted.map((img) => (
        <details key={img.id} className="group card">
          <summary className="flex cursor-pointer select-none items-center gap-3 px-4 py-3">
            <DisclosureChevron />
            {/* eslint-disable-next-line @next/next/no-img-element -- thumbnails of client images; alt is shown beside it */}
            <img src={img.src} alt="" loading="lazy" className="h-12 w-16 shrink-0 rounded-lg border border-ink bg-cream object-contain" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink">
                {img.alt === null ? <em className="text-ink/70">No alt attribute</em> : `“${img.alt}”`}
              </span>
              <span className="block truncate font-mono text-xs text-ink/70">
                {moduleLabel(img.scope, img.module)} · {img.pages.length} {img.pages.length === 1 ? "page" : "pages"}
              </span>
            </span>
            <span className="flex shrink-0 flex-wrap justify-end gap-1">
              {img.checks.map((c) => (
                <Badge key={c} tone={img.severity}>{ALT_CHECK_LABEL[c] ?? c}</Badge>
              ))}
            </span>
          </summary>
          <div className="grid gap-3 border-t border-ink/30 p-4 lg:grid-cols-2">
            <div className="space-y-2">
              <a href={img.src} target="_blank" rel="noreferrer" className="block break-all font-mono text-xs text-ink/75 underline">
                {img.src}
              </a>
              <PageList pages={img.pages} />
            </div>
            <div className="space-y-2">
              {img.fixes.map((f) => (
                <FixPanel key={f.summary} fix={f} />
              ))}
            </div>
          </div>
        </details>
      ))}
    </section>
  );
}

// ---------- Links ----------

export async function LinksView({ runId }: ViewProps) {
  const supabase = await createClient();
  const { data: links } = await supabase.from("links").select("*").eq("run_id", runId).returns<LinkRow[]>();
  if (!links?.length) return <Empty>No broken internal links or redirect chains found.</Empty>;

  return (
    <section aria-label="Link issues" className="space-y-2">
      {links.map((l) => (
        <details key={l.id} className="group card">
          <summary className="flex cursor-pointer select-none flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <DisclosureChevron />
            <Badge tone={l.check === "broken" || l.check === "redirect-to-dead" ? "critical" : "moderate"}>
              {LINK_CHECK_LABEL[l.check] ?? l.check}
            </Badge>
            <span className="min-w-0 flex-1 truncate font-mono text-ink">{pathOf(l.url)}</span>
            <span className="flex items-center gap-1 font-mono text-xs text-ink/70">
              {l.hops.length
                ? l.hops.map((h, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <NextChevron />}
                      {h.status}
                    </span>
                  ))
                : l.error}
            </span>
            <span className="text-xs text-ink/70">{moduleLabel(l.scope, l.module)} · {l.pages.length} {l.pages.length === 1 ? "page" : "pages"}</span>
          </summary>
          <div className="grid gap-3 border-t border-ink/30 p-4 lg:grid-cols-2">
            <div className="space-y-2 text-xs">
              {l.text && <p className="text-ink/85">Link text: “{l.text}”</p>}
              <ol className="space-y-0.5 font-mono text-ink/75">
                {l.hops.map((h, i) => (
                  <li key={i}>{h.status} {pathOf(h.url)}</li>
                ))}
              </ol>
              <h4 className="pt-2 font-medium text-ink/70">Found on</h4>
              <PageList pages={l.pages} />
            </div>
            <FixPanel fix={l.fix} />
          </div>
        </details>
      ))}
    </section>
  );
}

// ---------- Security ----------

export async function SecurityView({ runId }: ViewProps) {
  const supabase = await createClient();
  const [{ data: checks }, { data: mixed }, { data: scripts }, { data: run }] = await Promise.all([
    supabase.from("security_checks").select("*").eq("run_id", runId).order("id").returns<SecurityRow[]>(),
    supabase.from("mixed_content").select("*").eq("run_id", runId).order("id").returns<MixedContentRow[]>(),
    supabase.from("script_domains").select("*").eq("run_id", runId).order("id").returns<ScriptDomainRow[]>(),
    supabase.from("runs").select("site_id, created_at, summary").eq("id", runId).maybeSingle<Pick<Run, "site_id" | "created_at" | "summary">>(),
  ]);
  if (!checks?.length) return <Empty>No security results for this scan.</Empty>;

  // Script domains this scan loaded that the previous scan didn't. Only when the previous
  // scan recorded scripts at all; older scans predate the check.
  const previous = run ? await previousRun(supabase, run) : null;
  let newDomains: Set<string> | null = null;
  if (previous?.summary?.scriptDomains !== undefined) {
    const { data: before } = await supabase.from("script_domains").select("domain").eq("run_id", previous.id);
    const known = new Set((before ?? []).map((d) => d.domain));
    newDomains = new Set((scripts ?? []).map((d) => d.domain).filter((d) => !known.has(d)));
  }
  const pageChecksRan = run?.summary?.mixedContent !== undefined;

  const sorted = checks.sort((a, b) => Number(a.pass) - Number(b.pass));
  return (
    <div className="space-y-8">
      <section aria-label="Security checks" className="space-y-3">
        <p className="text-sm text-ink/75">Passive checks only: headers, TLS, redirects, cookies and page resources as any browser sees them.</p>
        <div className="overflow-x-auto card">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-ink bg-cream font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Check</th>
                <th scope="col" className="px-4 py-2 font-medium">Result</th>
                <th scope="col" className="px-4 py-2 font-medium">Current</th>
                <th scope="col" className="px-4 py-2 font-medium">Recommended</th>
                <th scope="col" className="px-4 py-2 font-medium">Where to fix</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/15 align-top">
              {sorted.map((c) => (
                <tr key={c.id}>
                  <th scope="row" className="px-4 py-3 font-medium text-ink">{c.name}</th>
                  <td className="px-4 py-3"><Badge tone={c.pass ? "pass" : "fail"}>{c.pass ? "Pass" : "Fail"}</Badge></td>
                  <td className="max-w-xs break-words px-4 py-3 font-mono text-xs text-ink/85">{c.current}</td>
                  <td className="max-w-xs break-words px-4 py-3 font-mono text-xs text-ink/85">{c.recommended}</td>
                  <td className="px-4 py-3 text-ink/85">{c.fix_location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sorted.filter((c) => c.fix).map((c) => (
          <FixPanel key={c.id} fix={c.fix!} title={`Fix: ${c.name}`} />
        ))}
      </section>

      {pageChecksRan && (
        <section aria-labelledby="mixed-heading" className="space-y-2">
          <h2 id="mixed-heading" className="font-display text-2xl font-medium">Mixed content</h2>
          {!mixed?.length ? (
            <Empty>No http:// resources on the scanned HTTPS pages.</Empty>
          ) : (
            <>
              <p className="text-sm text-ink/75">http:// resources on HTTPS pages. Browsers block scripts, stylesheets, fonts and iframes, and upgrade or warn about images and media.</p>
              {mixed.map((m) => (
                <details key={m.id} className="group card">
                  <summary className="flex cursor-pointer select-none flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    <DisclosureChevron />
                    <Badge tone={m.blocked ? "critical" : "moderate"}>{m.blocked ? `${m.kind}, blocked` : m.kind}</Badge>
                    <span className="min-w-0 flex-1 truncate font-mono text-ink">{m.url}</span>
                    <span className="text-xs text-ink/70">
                      {m.module || m.scope !== "unknown" ? moduleLabel(m.scope, m.module) : "Stylesheet or script"} · {m.pages.length}{" "}
                      {m.pages.length === 1 ? "page" : "pages"}
                    </span>
                  </summary>
                  <div className="grid gap-3 border-t border-ink/30 p-4 lg:grid-cols-2">
                    <div className="space-y-2 text-xs">
                      <p className="break-all font-mono text-ink/85">{m.url}</p>
                      {m.path && <p className="break-all font-mono text-ink/70">{m.path}</p>}
                      <h4 className="pt-2 font-medium text-ink/70">Found on</h4>
                      <PageList pages={m.pages} />
                    </div>
                    <FixPanel fix={m.fix} />
                  </div>
                </details>
              ))}
            </>
          )}
        </section>
      )}

      {pageChecksRan && (
        <section aria-labelledby="scripts-heading" className="space-y-2">
          <h2 id="scripts-heading" className="font-display text-2xl font-medium">Third-party scripts</h2>
          {!scripts?.length ? (
            <Empty>The scanned pages loaded no scripts from other domains.</Empty>
          ) : (
            <>
              <p className="text-sm text-ink/75">
                Every outside domain the scanned pages loaded scripts from.
                {newDomains
                  ? newDomains.size
                    ? ` ${newDomains.size} ${newDomains.size === 1 ? "is" : "are"} new since the previous scan.`
                    : " None are new since the previous scan."
                  : ""}
              </p>
              <div className="overflow-x-auto card">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead className="border-b border-ink bg-cream font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-medium">Domain</th>
                      <th scope="col" className="px-4 py-2 font-medium">Pages</th>
                      <th scope="col" className="px-4 py-2 font-medium">Example scripts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/15 align-top">
                    {scripts.map((d) => (
                      <tr key={d.id}>
                        <th scope="row" className="px-4 py-3 font-medium text-ink">
                          <span className="mr-2 break-all font-mono text-xs">{d.domain}</span>
                          {newDomains?.has(d.domain) && <span className="chip bg-pink">New</span>}
                        </th>
                        <td className="px-4 py-3 tabular-nums text-ink/85">{d.pages.length}</td>
                        <td className="px-4 py-3">
                          <ul className="space-y-0.5 font-mono text-xs text-ink/85">
                            {d.urls.map((u) => (
                              <li key={u} className="break-all">{u}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
