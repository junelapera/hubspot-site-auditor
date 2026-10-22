import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { notFound } from "next/navigation";
import { BackChevron, NextChevron } from "@/components/chevron";
import { loadComparison, previousRun } from "@/lib/compare-data";
import { ScoreCards } from "@/components/scores";
import { duration } from "@/lib/format";
import { loadRunScores } from "@/lib/scores-data";
import { requireUser } from "@/lib/supabase/server";
import type { Run, Site } from "@/lib/types";
import { FormsView, ImagesView, LinksView, ModulesView, PagesView, RulesView, SecurityView } from "./views";

const VIEWS = {
  modules: { label: "Modules", component: ModulesView },
  rules: { label: "WCAG", component: RulesView },
  pages: { label: "Pages", component: PagesView },
  images: { label: "Images", component: ImagesView },
  links: { label: "Links", component: LinksView },
  forms: { label: "Forms", component: FormsView },
  security: { label: "Security", component: SecurityView },
} as const;
type ViewKey = keyof typeof VIEWS;

export default async function RunPage({ params, searchParams }: PageProps<"/runs/[id]">) {
  const { id } = await params;
  const { view: viewParam, hidden } = await searchParams;
  const showHidden = hidden === "1";
  const view: ViewKey = typeof viewParam === "string" && viewParam in VIEWS ? (viewParam as ViewKey) : "modules";

  const { supabase } = await requireUser();
  const { data: run } = await supabase
    .from("runs")
    .select("*, sites(*)")
    .eq("id", id)
    .maybeSingle<Run & { sites: Site }>();
  if (!run) notFound();

  // Marked issues are left out of the counts; the comparison is with the previous scan of this site.
  const [{ data: fingerprints }, { data: marks }, previous] = await Promise.all([
    supabase.from("issues").select("fingerprint").eq("run_id", run.id),
    supabase.from("issue_marks").select("fingerprint").eq("site_id", run.site_id),
    run.status === "done" ? previousRun(supabase, run) : Promise.resolve(null),
  ]);
  const marked = new Set((marks ?? []).map((m) => m.fingerprint));
  const hiddenCount = (fingerprints ?? []).filter((f) => marked.has(f.fingerprint)).length;
  const [comparison, scores] = await Promise.all([
    previous ? loadComparison(supabase, run.site_id, previous.id, run.id) : null,
    loadRunScores(supabase, run.site_id, previous ? [run, previous] : [run]),
  ]);
  const runScores = scores.get(run.id);

  const s = run.summary;
  const tiles = s
    ? [
        { label: "Pages scanned", value: s.pagesScanned, note: s.pagesFailed ? `${s.pagesFailed} failed` : undefined },
        {
          label: "Issues",
          value: s.issues - hiddenCount,
          note: `from ${s.rawFindings} page-level findings${hiddenCount ? ` · ${hiddenCount} marked` : ""}`,
        },
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
          <LocalTime iso={run.created_at} />
          {s && ` · took ${duration(s.durationMs)}`} · Automated, passive scan — not a full accessibility or security audit.
        </p>
        {s?.sample && (
          <p className="mt-2 text-sm text-ink/85">
            <span className="chip mr-2 bg-paper">Sampled</span>
            {s.pagesScanned + s.pagesFailed} of {s.sample.discovered} pages scanned, chosen to cover {s.sample.covered} of the{" "}
            {s.sample.modules} modules found on the site
            {s.sample.covered < s.sample.modules && " (raise the page limit to cover the rest)"}. Issues are listed for the scanned
            pages only; the same module usually has them on other pages too.
          </p>
        )}
      </div>

      {run.status !== "done" ? (
        <p className="card p-4 text-sm text-ink/85">
          This scan is {run.status}.{" "}
          <Link href={`/sites/${run.site_id}`} className="underline">Back to the site</Link>
        </p>
      ) : (
        <>
          {runScores && <ScoreCards scores={runScores} previous={previous ? scores.get(previous.id) : undefined} />}

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {tiles.map((t) => (
              <div key={t.label} className="card p-4">
                <dt className="font-mono text-[10px] font-bold tracking-[0.08em] uppercase">{t.label}</dt>
                <dd className="mt-1 font-display text-4xl font-medium tabular-nums">{t.value}</dd>
                {t.note && <dd className="text-xs text-ink/70">{t.note}</dd>}
              </div>
            ))}
          </dl>

          {comparison && previous && (
            <section aria-labelledby="compare-heading" className="card flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
              <h2 id="compare-heading" className="eyebrow">
                Since <LocalTime iso={previous.created_at} />
              </h2>
              <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <li><span className="chip mr-1.5 bg-mint">{comparison.fixed.length}</span>fixed</li>
                <li><span className="chip mr-1.5 bg-pink">{comparison.new.length}</span>new</li>
                <li><span className="chip mr-1.5 bg-paper">{comparison.open.length}</span>still open</li>
                {comparison.notRechecked.length > 0 && (
                  <li><span className="chip mr-1.5 bg-tan">{comparison.notRechecked.length}</span>not rechecked</li>
                )}
              </ul>
              <Link href={`/runs/${run.id}/compare?with=${previous.id}`} className="btn btn-secondary btn-sm sm:ml-auto">
                View comparison
                <NextChevron />
              </Link>
            </section>
          )}

          <section aria-labelledby="exports-heading" className="flex flex-wrap items-center gap-2 text-sm">
            <h2 id="exports-heading" className="eyebrow mr-1">Download CSV</h2>
            {[
              { kind: "issues", label: "Issues (Teamwork / Jira)" },
              { kind: "rules", label: "WCAG summary" },
              { kind: "images", label: "Images" },
              { kind: "links", label: "Links" },
              { kind: "security", label: "Security" },
              ...(s?.mixedContent !== undefined
                ? [
                    { kind: "mixed-content", label: "Mixed content" },
                    { kind: "scripts", label: "Third-party scripts" },
                  ]
                : []),
              ...(s?.jsLibraries != null ? [{ kind: "libraries", label: "JS libraries" }] : []),
              ...(s?.forms !== undefined ? [{ kind: "forms", label: "Forms" }] : []),
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

          <View runId={run.id} siteId={run.site_id} showHidden={showHidden} />
        </>
      )}
    </main>
  );
}
