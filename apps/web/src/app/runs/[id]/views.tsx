import { Badge } from "@/components/badge";
import { FixPanel } from "@/components/fix-panel";
import { ALT_CHECK_LABEL, LINK_CHECK_LABEL, moduleLabel, pathOf, SCOPE_HINT } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Impact, ImageRow, IssueRow, LinkRow, ModuleSummaryRow, PageRow, SecurityRow } from "@/lib/types";

const IMPACT_ORDER: Record<Impact, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

function groupKey(i: { scope: string; module: string | null }) {
  return `${i.scope}:${i.module ?? ""}`;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">{children}</p>;
}

function PageList({ pages, max = 10 }: { pages: string[]; max?: number }) {
  return (
    <ul className="space-y-0.5 text-xs">
      {pages.slice(0, max).map((p) => (
        <li key={p}>
          <a href={p} target="_blank" rel="noreferrer" className="text-slate-700 underline-offset-2 hover:underline">
            {pathOf(p)}
          </a>
        </li>
      ))}
      {pages.length > max && <li className="text-slate-500">and {pages.length - max} more</li>}
    </ul>
  );
}

// ---------- Modules (default) ----------

export async function ModulesView({ runId }: { runId: string }) {
  const supabase = await createClient();
  const [{ data: modules }, { data: issues }] = await Promise.all([
    supabase.from("module_summary").select("*").eq("run_id", runId).order("weight", { ascending: false }).returns<ModuleSummaryRow[]>(),
    supabase.from("issues").select("*").eq("run_id", runId).returns<IssueRow[]>(),
  ]);
  if (!modules?.length) return <Empty>No accessibility issues found on the scanned pages.</Empty>;

  const byGroup = new Map<string, IssueRow[]>();
  for (const issue of issues ?? []) {
    const key = groupKey(issue);
    byGroup.set(key, [...(byGroup.get(key) ?? []), issue]);
  }

  return (
    <section aria-label="Issues by module" className="space-y-2">
      <p className="text-sm text-slate-600">Sorted by impact: the first row is the fix that clears the most issues.</p>
      {modules.map((m) => {
        const group = (byGroup.get(groupKey(m)) ?? []).sort(
          (a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact] || b.pages.length - a.pages.length,
        );
        return (
          <details key={groupKey(m)} className="group rounded-lg border border-slate-200 bg-white">
            <summary className="grid cursor-pointer select-none grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,2fr)_6rem_6rem_7rem_minmax(0,2fr)]">
              <span>
                <span className="font-mono text-sm font-medium text-slate-900">{moduleLabel(m.scope, m.module)}</span>
                <span className="block text-xs text-slate-500">{SCOPE_HINT[m.scope]}</span>
              </span>
              <span className="text-sm text-slate-700">{m.issue_count} {m.issue_count === 1 ? "issue" : "issues"}</span>
              <span><Badge tone={m.worst_impact}>{m.worst_impact}</Badge></span>
              <span className="text-sm text-slate-700">{m.pages_affected} {m.pages_affected === 1 ? "page" : "pages"}</span>
              <span className="truncate text-xs text-slate-500 sm:text-sm" title={m.rules.join(", ")}>{m.rules.join(", ")}</span>
            </summary>
            <div className="space-y-4 border-t border-slate-200 p-4">
              {group.map((issue) => (
                <IssueDetail key={issue.id} issue={issue} />
              ))}
            </div>
          </details>
        );
      })}
    </section>
  );
}

function IssueDetail({ issue }: { issue: IssueRow }) {
  return (
    <article className="space-y-3 rounded-md border border-slate-200 p-3">
      <header className="flex flex-wrap items-center gap-2">
        <Badge tone={issue.impact}>{issue.impact}</Badge>
        <h3 className="text-sm font-semibold text-slate-900">{issue.help}</h3>
        <a href={issue.help_url} target="_blank" rel="noreferrer" className="font-mono text-xs text-slate-500 underline">
          {issue.rule_id}
        </a>
      </header>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          {issue.path && <p className="font-mono text-xs text-slate-600">{issue.path}</p>}
          <pre className="overflow-x-auto rounded bg-slate-100 p-2 font-mono text-xs text-slate-800"><code>{issue.html}</code></pre>
          <div>
            <h4 className="mb-1 text-xs font-medium text-slate-500">Affected pages ({issue.pages.length})</h4>
            <PageList pages={issue.pages} />
          </div>
        </div>
        <FixPanel fix={issue.fix} />
      </div>
    </article>
  );
}

// ---------- Pages ----------

export async function PagesView({ runId }: { runId: string }) {
  const supabase = await createClient();
  const [{ data: pages }, { data: issues }] = await Promise.all([
    supabase.from("pages").select("*").eq("run_id", runId).order("url").returns<PageRow[]>(),
    supabase.from("issues").select("id, rule_id, impact, help, scope, module, pages").eq("run_id", runId).returns<IssueRow[]>(),
  ]);
  if (!pages?.length) return <Empty>No pages in this scan.</Empty>;

  const issuesByPage = new Map<string, IssueRow[]>();
  for (const issue of issues ?? []) {
    for (const url of issue.pages) issuesByPage.set(url, [...(issuesByPage.get(url) ?? []), issue]);
  }
  const rows = pages
    .map((p) => ({ page: p, issues: (issuesByPage.get(p.url) ?? []).sort((a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact]) }))
    .sort((a, b) => b.issues.length - a.issues.length);

  return (
    <section aria-label="Issues by page" className="space-y-2">
      {rows.map(({ page, issues }) => (
        <details key={page.id} className="rounded-lg border border-slate-200 bg-white">
          <summary className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <span className="font-mono text-slate-900">{pathOf(page.url)}</span>
            <span className="flex items-center gap-2 text-slate-700">
              {page.error ? <Badge tone="fail">{page.error}</Badge> : `${issues.length} ${issues.length === 1 ? "issue" : "issues"}`}
              {issues[0] && <Badge tone={issues[0].impact}>{issues[0].impact}</Badge>}
            </span>
          </summary>
          {issues.length > 0 && (
            <ul className="divide-y divide-slate-100 border-t border-slate-200 text-sm">
              {issues.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                  <Badge tone={i.impact}>{i.impact}</Badge>
                  <span className="text-slate-900">{i.help}</span>
                  <span className="font-mono text-xs text-slate-500">in {moduleLabel(i.scope, i.module)}</span>
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

export async function ImagesView({ runId }: { runId: string }) {
  const supabase = await createClient();
  const { data: images } = await supabase.from("images").select("*").eq("run_id", runId).returns<ImageRow[]>();
  if (!images?.length) return <Empty>No alt-text problems found.</Empty>;

  const order = { critical: 0, serious: 1, minor: 2 };
  const sorted = images.sort((a, b) => order[a.severity] - order[b.severity] || b.pages.length - a.pages.length);

  return (
    <section aria-label="Flagged images" className="space-y-2">
      {sorted.map((img) => (
        <details key={img.id} className="rounded-lg border border-slate-200 bg-white">
          <summary className="flex cursor-pointer select-none items-center gap-3 px-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- thumbnails of client images; alt is shown beside it */}
            <img src={img.src} alt="" loading="lazy" className="h-12 w-16 shrink-0 rounded border border-slate-200 bg-slate-50 object-contain" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-slate-900">
                {img.alt === null ? <em className="text-slate-500">No alt attribute</em> : `“${img.alt}”`}
              </span>
              <span className="block truncate font-mono text-xs text-slate-500">
                {moduleLabel(img.scope, img.module)} · {img.pages.length} {img.pages.length === 1 ? "page" : "pages"}
              </span>
            </span>
            <span className="flex shrink-0 flex-wrap justify-end gap-1">
              {img.checks.map((c) => (
                <Badge key={c} tone={img.severity}>{ALT_CHECK_LABEL[c] ?? c}</Badge>
              ))}
            </span>
          </summary>
          <div className="grid gap-3 border-t border-slate-200 p-4 lg:grid-cols-2">
            <div className="space-y-2">
              <a href={img.src} target="_blank" rel="noreferrer" className="block break-all font-mono text-xs text-slate-600 underline">
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

export async function LinksView({ runId }: { runId: string }) {
  const supabase = await createClient();
  const { data: links } = await supabase.from("links").select("*").eq("run_id", runId).returns<LinkRow[]>();
  if (!links?.length) return <Empty>No broken internal links or redirect chains found.</Empty>;

  return (
    <section aria-label="Link issues" className="space-y-2">
      {links.map((l) => (
        <details key={l.id} className="rounded-lg border border-slate-200 bg-white">
          <summary className="flex cursor-pointer select-none flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <Badge tone={l.check === "broken" || l.check === "redirect-to-dead" ? "critical" : "moderate"}>
              {LINK_CHECK_LABEL[l.check] ?? l.check}
            </Badge>
            <span className="min-w-0 flex-1 truncate font-mono text-slate-900">{pathOf(l.url)}</span>
            <span className="font-mono text-xs text-slate-500">
              {l.hops.map((h) => h.status).join(" → ") || l.error}
            </span>
            <span className="text-xs text-slate-500">{moduleLabel(l.scope, l.module)} · {l.pages.length} {l.pages.length === 1 ? "page" : "pages"}</span>
          </summary>
          <div className="grid gap-3 border-t border-slate-200 p-4 lg:grid-cols-2">
            <div className="space-y-2 text-xs">
              {l.text && <p className="text-slate-700">Link text: “{l.text}”</p>}
              <ol className="space-y-0.5 font-mono text-slate-600">
                {l.hops.map((h, i) => (
                  <li key={i}>{h.status} {pathOf(h.url)}</li>
                ))}
              </ol>
              <h4 className="pt-2 font-medium text-slate-500">Found on</h4>
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

export async function SecurityView({ runId }: { runId: string }) {
  const supabase = await createClient();
  const { data: checks } = await supabase.from("security_checks").select("*").eq("run_id", runId).order("id").returns<SecurityRow[]>();
  if (!checks?.length) return <Empty>No security results for this scan.</Empty>;

  const sorted = checks.sort((a, b) => Number(a.pass) - Number(b.pass));
  return (
    <section aria-label="Security checks" className="space-y-3">
      <p className="text-sm text-slate-600">Passive checks only: headers, TLS, and redirects as any browser sees them.</p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Check</th>
              <th scope="col" className="px-4 py-2 font-medium">Result</th>
              <th scope="col" className="px-4 py-2 font-medium">Current</th>
              <th scope="col" className="px-4 py-2 font-medium">Recommended</th>
              <th scope="col" className="px-4 py-2 font-medium">Where to fix</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {sorted.map((c) => (
              <tr key={c.id}>
                <th scope="row" className="px-4 py-3 font-medium text-slate-900">{c.name}</th>
                <td className="px-4 py-3"><Badge tone={c.pass ? "pass" : "fail"}>{c.pass ? "Pass" : "Fail"}</Badge></td>
                <td className="max-w-xs break-words px-4 py-3 font-mono text-xs text-slate-700">{c.current}</td>
                <td className="max-w-xs break-words px-4 py-3 font-mono text-xs text-slate-700">{c.recommended}</td>
                <td className="px-4 py-3 text-slate-700">{c.fix_location}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.filter((c) => c.fix).map((c) => (
        <FixPanel key={c.id} fix={c.fix!} title={`Fix: ${c.name}`} />
      ))}
    </section>
  );
}
