import Link from "next/link";
import { notFound } from "next/navigation";
import { duration } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import type { Run, Site } from "@/lib/types";
import { ImagesView, LinksView, ModulesView, PagesView, SecurityView } from "./views";

const VIEWS = {
  modules: { label: "Modules", component: ModulesView },
  pages: { label: "Pages", component: PagesView },
  images: { label: "Images", component: ImagesView },
  links: { label: "Links", component: LinksView },
  security: { label: "Security", component: SecurityView },
} as const;
type ViewKey = keyof typeof VIEWS;

export default async function RunPage({ params, searchParams }: PageProps<"/runs/[id]">) {
  const { id } = await params;
  const { view: viewParam } = await searchParams;
  const view: ViewKey = typeof viewParam === "string" && viewParam in VIEWS ? (viewParam as ViewKey) : "modules";

  const { supabase } = await requireUser();
  const { data: run } = await supabase
    .from("runs")
    .select("*, sites(*)")
    .eq("id", id)
    .maybeSingle<Run & { sites: Site }>();
  if (!run) notFound();

  const s = run.summary;
  const tiles = s
    ? [
        { label: "Pages scanned", value: s.pagesScanned, note: s.pagesFailed ? `${s.pagesFailed} failed` : undefined },
        { label: "Issues", value: s.issues, note: `from ${s.rawFindings} page-level findings` },
        { label: "Groups", value: s.modules, note: `${Math.round(s.namedModuleRate * 100)}% named modules` },
        { label: "Images flagged", value: s.imagesFlagged },
        { label: "Link issues", value: s.linkIssues },
        { label: "Security checks failed", value: s.securityFailed },
      ]
    : [];
  const View = VIEWS[view].component;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div>
        <Link href={`/sites/${run.site_id}`} className="text-sm text-slate-600 hover:text-slate-900">
          ← {run.sites.name ?? run.sites.domain}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          Scan of {run.sites.domain}
        </h1>
        <p className="text-sm text-slate-600">
          {new Date(run.created_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}
          {s && ` · took ${duration(s.durationMs)}`} · Automated, passive scan — not a full accessibility or security audit.
        </p>
      </div>

      {run.status !== "done" ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
          This scan is {run.status}.{" "}
          <Link href={`/sites/${run.site_id}`} className="underline">Back to the site</Link>
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-lg border border-slate-200 bg-white p-3">
                <dt className="text-xs text-slate-500">{t.label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{t.value}</dd>
                {t.note && <dd className="text-xs text-slate-500">{t.note}</dd>}
              </div>
            ))}
          </dl>

          <section aria-labelledby="exports-heading" className="flex flex-wrap items-center gap-2 text-sm">
            <h2 id="exports-heading" className="mr-1 font-medium text-slate-700">Download CSV:</h2>
            {[
              { kind: "issues", label: "Issues (Teamwork / Jira)" },
              { kind: "images", label: "Images" },
              { kind: "links", label: "Links" },
              { kind: "security", label: "Security" },
            ].map((e) => (
              <a
                key={e.kind}
                href={`/runs/${run.id}/export/${e.kind}`}
                download
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
              >
                {e.label}
              </a>
            ))}
          </section>

          <nav aria-label="Report views" className="flex gap-1 overflow-x-auto border-b border-slate-200">
            {(Object.keys(VIEWS) as ViewKey[]).map((key) => (
              <Link
                key={key}
                href={`/runs/${run.id}?view=${key}`}
                aria-current={key === view ? "page" : undefined}
                className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
                  key === view ? "border-slate-900 text-slate-900" : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                {VIEWS[key].label}
              </Link>
            ))}
          </nav>

          <View runId={run.id} />
        </>
      )}
    </main>
  );
}
