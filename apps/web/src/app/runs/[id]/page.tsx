import Link from "next/link";
import { notFound } from "next/navigation";
import { BackChevron } from "@/components/chevron";
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
    <main className="page space-y-6">
      <div>
        <Link href={`/sites/${run.site_id}`} className="eyebrow inline-flex items-center gap-1 py-1 hover:underline hover:underline-offset-4">
          <BackChevron />
          {run.sites.name ?? run.sites.domain}
        </Link>
        <h1 className="mt-3 font-display text-4xl font-medium leading-tight tracking-tight break-words sm:text-5xl">
          Scan of {run.sites.domain}
        </h1>
        <p className="text-sm text-ink/75">
          {new Date(run.created_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}
          {s && ` · took ${duration(s.durationMs)}`} · Automated, passive scan — not a full accessibility or security audit.
        </p>
      </div>

      {run.status !== "done" ? (
        <p className="card p-4 text-sm text-ink/85">
          This scan is {run.status}.{" "}
          <Link href={`/sites/${run.site_id}`} className="underline">Back to the site</Link>
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {tiles.map((t) => (
              <div key={t.label} className="card p-4">
                <dt className="font-mono text-[10px] font-bold tracking-[0.08em] uppercase">{t.label}</dt>
                <dd className="mt-1 font-display text-4xl font-medium tabular-nums">{t.value}</dd>
                {t.note && <dd className="text-xs text-ink/70">{t.note}</dd>}
              </div>
            ))}
          </dl>

          <section aria-labelledby="exports-heading" className="flex flex-wrap items-center gap-2 text-sm">
            <h2 id="exports-heading" className="eyebrow mr-1">Download CSV</h2>
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
                className="btn btn-secondary btn-sm"
              >
                {e.label}
              </a>
            ))}
          </section>

          <nav aria-label="Report views" className="flex flex-wrap gap-x-1 border-b border-ink">
            {(Object.keys(VIEWS) as ViewKey[]).map((key) => (
              <Link
                key={key}
                href={`/runs/${run.id}?view=${key}`}
                aria-current={key === view ? "page" : undefined}
                className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.08em] ${
                  key === view ? "border-ink text-ink" : "border-transparent text-ink/75 hover:text-ink"
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
