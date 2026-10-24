import Link from "next/link";
import { LocalTime, TimeAgo } from "@/components/local-time";
import { notFound } from "next/navigation";
import { Badge } from "@/components/badge";
import { DeleteSiteForm, OldUrlsForm, QueueRunButton, ScanUrlsForm, SiteSettingsForm } from "@/components/forms";
import { RunProgress } from "@/components/run-progress";
import { BackChevron, DisclosureChevron } from "@/components/chevron";
import { GradeChip } from "@/components/scores";
import { duration } from "@/lib/format";
import { OLD_URL_PROBLEMS, redirectSummary } from "@/lib/old-urls";
import { loadRunScores } from "@/lib/scores-data";
import { requireUser } from "@/lib/supabase/server";
import type { Run, Site } from "@/lib/types";

const RUN_LIST_FIELDS = "id, site_id, kind, status, stage, pages_total, pages_done, error, summary, created_at, started_at, finished_at";
type RunListRow = Omit<Run, "options"> & { urls: string[] | null; extraUrls: string[] | null; sample: boolean | null };

export default async function SitePage({ params }: PageProps<"/sites/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();

  const [{ data: site }, { data: runRows }, { count: scanCount }] = await Promise.all([
    supabase.from("sites").select("*").eq("id", id).maybeSingle<Site>(),
    // Not options itself: a redirect check keeps up to 5,000 old URLs there.
    supabase
      .from("runs")
      .select(`${RUN_LIST_FIELDS}, urls:options->urls, extraUrls:options->extraUrls, sample:options->sample`)
      .eq("site_id", id)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<RunListRow[]>(),
    // The list shows the latest 50; the delete warning needs them all.
    supabase.from("runs").select("id", { count: "exact", head: true }).eq("site_id", id),
  ]);
  if (!site) notFound();
  const runs = runRows?.map(({ urls, extraUrls, sample, ...run }): Run => ({
    ...run,
    options: { urls: urls ?? undefined, extraUrls: extraUrls ?? undefined, sample: sample ?? undefined },
  }));

  const scores = await loadRunScores(supabase, site.id, runs ?? []);
  const active = runs?.find((r) => r.status === "queued" || r.status === "running");

  return (
    <main className="page space-y-6">
      <div>
        <Link href="/" className="eyebrow inline-flex items-center gap-1 py-1 hover:underline hover:underline-offset-4">
          <BackChevron />
          Sites
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-medium leading-tight tracking-tight break-words sm:text-5xl">{site.name ?? site.domain}</h1>
            <a href={`https://${site.domain}`} target="_blank" rel="noreferrer" className="link text-sm text-ink/75">
              {site.domain}
            </a>
          </div>
          <QueueRunButton siteId={site.id} disabled={Boolean(active)} />
        </div>
      </div>

      {active && (
        <section className="card p-4">
          <RunProgress key={active.id} initial={active} />
        </section>
      )}

      <details className="group card">
        <summary className="flex cursor-pointer select-none flex-wrap items-center gap-x-2 px-4 py-3">
          <DisclosureChevron />
          <span className="eyebrow">Scan settings</span>
          <span className="text-sm text-ink/75">
            up to {site.page_limit} pages
            {site.include_paths.length > 0 && ` · include ${site.include_paths.join(", ")}`}
            {site.exclude_paths.length > 0 && ` · exclude ${site.exclude_paths.join(", ")}`}
          </span>
        </summary>
        <div className="border-t border-ink/30 p-4">
          <SiteSettingsForm site={site} />
        </div>
      </details>

      <details className="group card">
        <summary className="flex cursor-pointer select-none flex-wrap items-center gap-x-2 px-4 py-3">
          <DisclosureChevron />
          <span className="eyebrow">Scan specific pages</span>
          <span className="text-sm text-ink/75">paste a list instead of, or as well as, the sitemap</span>
        </summary>
        <div className="border-t border-ink/30 p-4">
          <ScanUrlsForm site={site} disabled={Boolean(active)} />
        </div>
      </details>

      <details className="group card">
        <summary className="flex cursor-pointer select-none flex-wrap items-center gap-x-2 px-4 py-3">
          <DisclosureChevron />
          <span className="eyebrow">Check old URLs</span>
          <span className="text-sm text-ink/75">find old-site URLs left without a redirect after a migration</span>
        </summary>
        <div className="border-t border-ink/30 p-4">
          <OldUrlsForm site={site} disabled={Boolean(active)} />
        </div>
      </details>

      <section className="overflow-hidden card">
        <h2 className="eyebrow border-b border-ink px-4 py-3">Scans</h2>
        {!runs?.length ? (
          <p className="p-4 text-sm text-ink/75">No scans yet. Click “Run scan” to start one.</p>
        ) : (
          <ul className="divide-y divide-ink/15">
            {runs.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {run.status === "done" ? (
                    <Link href={`/runs/${run.id}`} className="font-medium text-ink underline-offset-2 hover:underline">
                      <LocalTime iso={run.created_at} />
                    </Link>
                  ) : (
                    <span className="font-medium text-ink">
                      <LocalTime iso={run.created_at} />
                    </span>
                  )}
                  <span className="text-ink/70"><TimeAgo iso={run.created_at} /></span>
                  {run.kind === "redirects" ? (
                    <span className="chip bg-teal">
                      Redirect check{run.pages_total ? ` · ${run.pages_total.toLocaleString("en-US")} old URLs` : ""}
                    </span>
                  ) : run.options?.urls?.length ? (
                    <span className="chip bg-paper">{run.options.urls.length} listed {run.options.urls.length === 1 ? "page" : "pages"}</span>
                  ) : run.options?.extraUrls?.length ? (
                    <span className="chip bg-paper">Sitemap + {run.options.extraUrls.length} listed</span>
                  ) : run.options?.sample ? (
                    <span className="chip bg-paper">
                      Sampled{run.summary?.sample ? ` · ${run.summary.sample.covered} of ${run.summary.sample.modules} modules` : ""}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink/85">
                  {run.status === "done" && run.kind === "audit" && runs.slice(runs.indexOf(run) + 1).some((r) => r.status === "done" && r.kind === "audit") && (
                    <Link href={`/runs/${run.id}/compare`} className="link font-mono text-[11px] font-bold tracking-[0.06em] uppercase">
                      Compare
                    </Link>
                  )}
                  {run.status === "done" && redirectSummary(run) && <RedirectCounts summary={redirectSummary(run)!} />}
                  {run.status === "done" && run.kind === "audit" && run.summary && (
                    <>
                      {scores.get(run.id)?.accessibility != null && (
                        <span>Accessibility <span className="font-medium tabular-nums">{scores.get(run.id)!.accessibility}</span></span>
                      )}
                      {scores.get(run.id)?.security && (
                        <span className="inline-flex items-center gap-1.5">
                          Security <GradeChip grade={scores.get(run.id)!.security!.grade} />
                        </span>
                      )}
                      <span>{run.summary.pagesScanned} pages</span>
                      <span>{run.summary.issues} issues</span>
                      <span>{run.summary.imagesFlagged} images</span>
                      <span className="text-ink/70">{duration(run.summary.durationMs)}</span>
                    </>
                  )}
                  {run.status === "failed" && <Badge tone="fail">Failed</Badge>}
                  {run.status === "failed" && run.error && <span className="max-w-md truncate text-rust" title={run.error}>{run.error}</span>}
                  {(run.status === "queued" || run.status === "running") && <Badge tone="minor">{run.status}</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="group card">
        <summary className="flex cursor-pointer select-none flex-wrap items-center gap-x-2 px-4 py-3">
          <DisclosureChevron />
          <span className="eyebrow">Delete site</span>
          <span className="text-sm text-ink/75">remove this site and all its scans</span>
        </summary>
        <div className="border-t border-ink/30 p-4">
          <DeleteSiteForm site={site} scanCount={scanCount ?? 0} disabled={Boolean(active)} />
        </div>
      </details>
    </main>
  );
}

function RedirectCounts({ summary }: { summary: NonNullable<ReturnType<typeof redirectSummary>> }) {
  const problems = OLD_URL_PROBLEMS.reduce((n, k) => n + (summary.counts[k] ?? 0), 0);
  return (
    <>
      <span>
        <span className="font-medium tabular-nums">{summary.counts.missing ?? 0}</span> without a redirect
      </span>
      {problems > (summary.counts.missing ?? 0) && (
        <span>
          {problems - (summary.counts.missing ?? 0)} other redirect {problems - (summary.counts.missing ?? 0) === 1 ? "problem" : "problems"}
        </span>
      )}
      <span>{(summary.counts.redirected ?? 0) + (summary.counts.live ?? 0)} OK</span>
      <span className="text-ink/70">{duration(summary.durationMs)}</span>
    </>
  );
}
