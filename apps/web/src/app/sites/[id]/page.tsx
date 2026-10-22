import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/badge";
import { QueueRunButton, SiteSettingsForm } from "@/components/forms";
import { RunProgress } from "@/components/run-progress";
import { duration, timeAgo } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import type { Run, Site } from "@/lib/types";

export default async function SitePage({ params }: PageProps<"/sites/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();

  const [{ data: site }, { data: runs }] = await Promise.all([
    supabase.from("sites").select("*").eq("id", id).maybeSingle<Site>(),
    supabase.from("runs").select("*").eq("site_id", id).order("created_at", { ascending: false }).limit(50).returns<Run[]>(),
  ]);
  if (!site) notFound();

  const active = runs?.find((r) => r.status === "queued" || r.status === "running");

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div>
        <Link href="/" className="text-sm text-slate-600 hover:text-slate-900">← Sites</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{site.name ?? site.domain}</h1>
            <a href={`https://${site.domain}`} target="_blank" rel="noreferrer" className="text-sm text-slate-600 underline-offset-2 hover:underline">
              {site.domain}
            </a>
          </div>
          <QueueRunButton siteId={site.id} disabled={Boolean(active)} />
        </div>
      </div>

      {active && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <RunProgress key={active.id} initial={active} />
        </section>
      )}

      <details className="group rounded-lg border border-slate-200 bg-white">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-900">
          Scan settings
          <span className="ml-2 font-normal text-slate-500">
            up to {site.page_limit} pages
            {site.include_paths.length > 0 && ` · include ${site.include_paths.join(", ")}`}
            {site.exclude_paths.length > 0 && ` · exclude ${site.exclude_paths.join(", ")}`}
          </span>
        </summary>
        <div className="border-t border-slate-200 p-4">
          <SiteSettingsForm site={site} />
        </div>
      </details>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Scans</h2>
        {!runs?.length ? (
          <p className="p-4 text-sm text-slate-600">No scans yet. Click “Run scan” to start one.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {runs.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="flex items-center gap-3">
                  {run.status === "done" ? (
                    <Link href={`/runs/${run.id}`} className="font-medium text-slate-900 underline-offset-2 hover:underline">
                      {new Date(run.created_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-900">
                      {new Date(run.created_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  )}
                  <span className="text-slate-500">{timeAgo(run.created_at)}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-700">
                  {run.status === "done" && run.summary && (
                    <>
                      <span>{run.summary.pagesScanned} pages</span>
                      <span>{run.summary.issues} issues</span>
                      <span>{run.summary.imagesFlagged} images</span>
                      <span className="text-slate-500">{duration(run.summary.durationMs)}</span>
                    </>
                  )}
                  {run.status === "failed" && <Badge tone="fail">Failed</Badge>}
                  {run.status === "failed" && run.error && <span className="max-w-md truncate text-red-700" title={run.error}>{run.error}</span>}
                  {(run.status === "queued" || run.status === "running") && <Badge tone="minor">{run.status}</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
