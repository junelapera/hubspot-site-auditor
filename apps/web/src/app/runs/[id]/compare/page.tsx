import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/badge";
import { BackChevron, DisclosureChevron } from "@/components/chevron";
import { LocalTime } from "@/components/local-time";
import { ScanSelect } from "@/components/scan-select";
import type { ComparedIssue } from "@/lib/compare";
import { loadComparison, previousRun } from "@/lib/compare-data";
import { MARK_LABEL, moduleLabel } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import type { Run, Site } from "@/lib/types";

export const metadata = { title: "Compare scans · HubSpot Site Auditor" };

export default async function ComparePage({ params, searchParams }: PageProps<"/runs/[id]/compare">) {
  const { id } = await params;
  const { with: withParam } = await searchParams;
  const { supabase } = await requireUser();

  const { data: run } = await supabase.from("runs").select("*, sites(*)").eq("id", id).maybeSingle<Run & { sites: Site }>();
  if (!run || run.status !== "done") notFound();

  const { data: others } = await supabase
    .from("runs")
    .select("id, created_at, summary")
    .eq("site_id", run.site_id)
    .eq("status", "done")
    .neq("id", run.id)
    .order("created_at", { ascending: false })
    .returns<Pick<Run, "id" | "created_at" | "summary">[]>();

  // Default to the scan just before this one; only allow scans of the same site.
  const fallback = await previousRun(supabase, run);
  const base = others?.find((r) => r.id === withParam) ?? (fallback ? others?.find((r) => r.id === fallback.id) : undefined);

  const back = (
    <Link href={`/runs/${run.id}`} className="eyebrow inline-flex items-center gap-1 py-1 hover:underline hover:underline-offset-4">
      <BackChevron />
      Scan of <LocalTime iso={run.created_at} />
    </Link>
  );

  if (!base) {
    return (
      <main className="page space-y-6">
        {back}
        <h1 className="font-display text-4xl font-medium leading-tight tracking-tight break-words sm:text-5xl">Compare scans</h1>
        <p className="card p-6 text-sm text-ink/75">There&apos;s no other finished scan of {run.sites.domain} to compare with yet.</p>
      </main>
    );
  }

  // Always read older -> newer, whichever scan was picked, so "fixed" and "new" mean what they say.
  const [older, newer] = new Date(base.created_at) < new Date(run.created_at) ? [base, run] : [run, base];
  const c = await loadComparison(supabase, run.site_id, older.id, newer.id);
  const pageCounts = [older.summary?.pagesScanned, newer.summary?.pagesScanned];

  const tiles = [
    { label: "Fixed", value: c.fixed.length, tone: "bg-mint" },
    { label: "New", value: c.new.length, tone: "bg-pink" },
    { label: "Still open", value: c.open.length, tone: "bg-paper" },
    { label: "Not rechecked", value: c.notRechecked.length, tone: "bg-tan" },
    { label: "Marked", value: c.hidden.length, tone: "bg-yellow" },
  ];

  return (
    <main className="page space-y-6">
      <div>
        {back}
        <h1 className="mt-3 font-display text-4xl font-medium leading-tight tracking-tight break-words sm:text-5xl">Compare scans</h1>
        <p className="text-sm text-ink/75">
          {run.sites.domain}: from <LocalTime iso={older.created_at} /> to <LocalTime iso={newer.created_at} />. Issues are matched by rule, module, and element.
        </p>
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-64 flex-1">
          <label htmlFor="with" className="label">Compare this scan with</label>
          <ScanSelect
            id="with"
            name="with"
            defaultValue={base.id}
            options={(others ?? []).map((r) => ({
              value: r.id,
              label: <LocalTime iso={r.created_at} />,
              detail: `${r.summary?.pagesScanned ?? "?"} pages · ${r.summary?.issues ?? "?"} issues`,
            }))}
          />
        </div>
        <button type="submit" className="btn btn-secondary">Compare</button>
      </form>

      {pageCounts[0] !== pageCounts[1] && (
        <p role="note" className="rounded-xl border border-ink bg-yellow/40 p-3 text-sm">
          These scans covered different pages ({pageCounts[0]} vs {pageCounts[1]}). Issues on pages that weren&apos;t scanned again are listed as
          “not rechecked” rather than fixed.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className={`rounded-xl border border-ink p-4 ${t.tone}`}>
            <dt className="font-mono text-[10px] font-bold tracking-[0.08em] uppercase">{t.label}</dt>
            <dd className="mt-1 font-display text-4xl font-medium tabular-nums">{t.value}</dd>
          </div>
        ))}
      </dl>

      <IssueList title="New" description="In the newer scan, not in the older one." issues={c.new} open />
      <IssueList title="Fixed" description="In the older scan, gone from the same pages in the newer one." issues={c.fixed} open />
      <IssueList title="Still open" description="In both scans." issues={c.open} />
      <IssueList title="Not rechecked" description="In the older scan, but none of its pages were scanned in the newer one." issues={c.notRechecked} />
      <IssueList title="Marked" description="Won't fix or false positive; left out of the counts above." issues={c.hidden} />
    </main>
  );
}

function IssueList({ title, description, issues, open = false }: { title: string; description: string; issues: ComparedIssue[]; open?: boolean }) {
  return (
    <details className="group card" open={open && issues.length > 0}>
      <summary className="flex cursor-pointer select-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <DisclosureChevron />
        <h2 className="eyebrow">{title} ({issues.length})</h2>
        <span className="text-sm text-ink/75">{description}</span>
      </summary>
      {issues.length > 0 ? (
        <ul className="divide-y divide-ink/15 border-t border-ink/30">
          {issues.map((i) => (
            <li key={i.fingerprint} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
              <Badge tone={i.impact}>{i.impact}</Badge>
              <span className="min-w-0 flex-1">{i.help}</span>
              <span className="font-mono text-xs text-ink/75">{moduleLabel(i.scope, i.module)}</span>
              <span className="text-xs text-ink/75">
                {i.pages.length} {i.pages.length === 1 ? "page" : "pages"}
              </span>
              {i.mark && (
                <span className="chip bg-yellow" title={i.mark.note || undefined}>
                  {MARK_LABEL[i.mark.kind]}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-ink/30 px-4 py-3 text-sm text-ink/75">None.</p>
      )}
    </details>
  );
}
