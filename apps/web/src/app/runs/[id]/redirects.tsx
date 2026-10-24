import Link from "next/link";
import { Badge } from "@/components/badge";
import { BackChevron, DisclosureChevron, NextChevron } from "@/components/chevron";
import { LocalTime } from "@/components/local-time";
import { importableRedirects, MAX_REDIRECT_ROWS, oldUrlRedirectRows } from "@/lib/exports";
import { duration, IMPACT_STYLE, pathOf } from "@/lib/format";
import { OLD_URL_LABEL, OLD_URL_ORDER, OLD_URL_PROBLEMS, redirectSummary } from "@/lib/old-urls";
import { selectAll } from "@/lib/scores-data";
import { createClient } from "@/lib/supabase/server";
import type { OldUrlRow, OldUrlStatus, Run, Site } from "@/lib/types";

/** Rows shown per group; the CSV has them all. */
const MAX_ROWS = 500;

const TONE: Record<OldUrlStatus, keyof typeof IMPACT_STYLE> = {
  missing: "critical",
  "redirect-to-dead": "critical",
  "redirect-home": "serious",
  "redirect-chain": "moderate",
  "not-checked": "minor",
  error: "minor",
  redirected: "pass",
  live: "pass",
};

const GROUP_NOTE: Record<OldUrlStatus, string> = {
  missing: "These return 404 (or 410) on the new site: add a redirect for each.",
  "redirect-to-dead": "A redirect exists, but the page it points to is gone. Change it to point at a live page.",
  "redirect-home":
    "These end up on the home page: redirected there, or (for “/?p=123” style URLs) served it because HubSpot ignores the query. Search engines treat that as a missing page, and visitors lose what they were after. Point them at the closest matching page.",
  "redirect-chain": "These reach a live page through more than one redirect. Point the first redirect straight at the final page.",
  "not-checked": "The site kept answering “too many requests”, so these weren't checked. Run the check again later.",
  error: "Server errors or timeouts: these may be fine. Run the check again to recheck them.",
  redirected: "These redirect, in one hop, to a live page.",
  live: "These still exist at the same address on the new site.",
};

/** Report for an old-URL redirect check (runs.kind = "redirects"). */
export async function RedirectCheckReport({ run }: { run: Run & { sites: Site } }) {
  const supabase = await createClient();
  const s = redirectSummary(run);
  const rows =
    run.status === "done"
      ? await selectAll<OldUrlRow>((from, to) => supabase.from("old_urls").select("*").eq("run_id", run.id).order("id").range(from, to))
      : [];

  const byStatus = new Map<OldUrlStatus, OldUrlRow[]>(OLD_URL_ORDER.map((k) => [k, rows.filter((r) => r.status === k)]));
  const count = (...keys: OldUrlStatus[]) => keys.reduce((n, k) => n + (byStatus.get(k)?.length ?? 0), 0);
  const redirects = importableRedirects(oldUrlRedirectRows(rows));
  const parts = Math.ceil(redirects.length / MAX_REDIRECT_ROWS);
  const noSuggestion = rows.filter((r) => ["missing", "redirect-to-dead", "redirect-home"].includes(r.status) && !r.replacement).length;

  const tiles = [
    { label: "Old URLs checked", value: rows.length },
    { label: "Without a redirect", value: count("missing") },
    { label: "Other redirect problems", value: count("redirect-to-dead", "redirect-home", "redirect-chain"), note: "dead end, home page or chain" },
    { label: "OK", value: count("redirected", "live"), note: `${count("redirected")} redirected, ${count("live")} still live` },
    ...(count("not-checked", "error") ? [{ label: "Not checked", value: count("not-checked", "error"), note: "check again later" }] : []),
  ];

  return (
    <main className="page space-y-6">
      <div>
        <Link href={`/sites/${run.site_id}`} className="eyebrow inline-flex items-center gap-1 py-1 hover:underline hover:underline-offset-4">
          <BackChevron />
          {run.sites.name ?? run.sites.domain}
        </Link>
        <h1 className="mt-3 font-display text-4xl font-medium leading-tight tracking-tight break-words sm:text-5xl">
          Redirect check of {run.sites.domain}
        </h1>
        <p className="text-sm text-ink/75">
          <LocalTime iso={run.created_at} />
          {s && ` · took ${duration(s.durationMs)}`} · Each old URL&apos;s path was requested on {run.sites.domain}.
        </p>
      </div>

      {run.status !== "done" ? (
        <p className="card p-4 text-sm text-ink/85">
          This check is {run.status}.{" "}
          <Link href={`/sites/${run.site_id}`} className="underline">Back to the site</Link>
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {tiles.map((t) => (
              <div key={t.label} className="card p-4">
                <dt className="font-mono text-[10px] font-bold tracking-[0.08em] uppercase">{t.label}</dt>
                <dd className="mt-1 font-display text-4xl font-medium tabular-nums">{t.value.toLocaleString("en-US")}</dd>
                {t.note && <dd className="text-xs text-ink/70">{t.note}</dd>}
              </div>
            ))}
          </dl>

          {(s?.invalid || s?.sitemapRead === false) && (
            <p className="text-sm text-ink/85">
              {s.invalid > 0 && `${s.invalid} ${s.invalid === 1 ? "line wasn't" : "lines weren't"} a URL or path and ${s.invalid === 1 ? "was" : "were"} skipped. `}
              {s.sitemapRead === false && `${run.sites.domain}'s sitemap couldn't be read, so there are no suggested pages.`}
            </p>
          )}

          <section aria-labelledby="redirect-files-heading" className="card space-y-3 p-4 text-sm">
            <h2 id="redirect-files-heading" className="eyebrow">Download CSV</h2>
            {redirects.length > 0 ? (
              <p className="max-w-3xl text-ink/85">
                {redirects.length.toLocaleString("en-US")} {redirects.length === 1 ? "redirect" : "redirects"} ready for HubSpot&apos;s bulk
                import (in HubSpot settings, Domains &amp; URLs, then URL redirects, then Import). Each old URL goes to its likely new page,
                and each redirect chain goes straight to its final page. Suggestions are guesses from page names, so review the file
                first. Tick &ldquo;Overwrite existing redirects&rdquo; so redirects to dead pages and the home page are replaced.
                {parts > 1 && ` HubSpot takes ${MAX_REDIRECT_ROWS} rows per import, so the redirects come in ${parts} files.`}
              </p>
            ) : (
              <p className="text-ink/85">No redirects to add{noSuggestion ? " that have a suggested page" : ""}.</p>
            )}
            {noSuggestion > 0 && (
              <p className="max-w-3xl text-ink/85">
                {noSuggestion.toLocaleString("en-US")} old {noSuggestion === 1 ? "URL has" : "URLs have"} no likely new page (nothing with a
                similar name), so {noSuggestion === 1 ? "it isn't" : "they aren't"} in the redirects file. Pick a page for{" "}
                {noSuggestion === 1 ? "it" : "each"} by hand: they&apos;re in the full results CSV.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: parts }, (_, i) => (
                <a
                  key={i}
                  href={`/runs/${run.id}/export/old-url-redirects${i ? `?part=${i + 1}` : ""}`}
                  download
                  className="btn btn-primary btn-sm"
                >
                  {parts > 1
                    ? `Redirects ${(i * MAX_REDIRECT_ROWS + 1).toLocaleString("en-US")}–${Math.min((i + 1) * MAX_REDIRECT_ROWS, redirects.length).toLocaleString("en-US")}`
                    : "Redirects for HubSpot import"}
                </a>
              ))}
              <a href={`/runs/${run.id}/export/old-urls`} download className="btn btn-secondary btn-sm">
                All results
              </a>
            </div>
          </section>

          <div className="space-y-2">
            {OLD_URL_ORDER.filter((k) => byStatus.get(k)?.length).map((k) => (
              <StatusGroup key={k} status={k} rows={byStatus.get(k)!} open={OLD_URL_PROBLEMS.includes(k)} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function StatusGroup({ status, rows, open }: { status: OldUrlStatus; rows: OldUrlRow[]; open: boolean }) {
  const suggests = rows.some((r) => r.replacement);
  const final = status === "redirect-chain" || status === "redirected" || status === "redirect-home" || status === "redirect-to-dead";
  return (
    <details className="group card" open={open}>
      <summary className="flex cursor-pointer select-none flex-wrap items-center gap-3 px-4 py-3 text-sm">
        <DisclosureChevron />
        <Badge tone={TONE[status]}>{OLD_URL_LABEL[status]}</Badge>
        <span className="font-medium tabular-nums">{rows.length.toLocaleString("en-US")}</span>
      </summary>
      <div className="space-y-3 border-t border-ink/30 p-4">
        <p className="text-sm text-ink/85">{GROUP_NOTE[status]}</p>
        <div className="overflow-x-auto rounded-lg border border-ink/30">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-ink/30 bg-cream font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink">
              <tr>
                <th scope="col" className="px-3 py-2">Old URL</th>
                <th scope="col" className="px-3 py-2">{final ? "Now goes to" : "Response"}</th>
                {suggests && <th scope="col" className="px-3 py-2">Likely new page</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/15 align-top">
              {rows.slice(0, MAX_ROWS).map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="max-w-xs break-all px-3 py-2 font-mono text-xs font-normal">
                    <a href={r.checked_url} target="_blank" rel="noreferrer" className="link text-ink">
                      {pathOf(r.checked_url)}
                    </a>
                  </th>
                  <td className="max-w-xs break-all px-3 py-2 font-mono text-xs text-ink/85">
                    <span className="inline-flex flex-wrap items-center gap-1">
                      {r.hops.length
                        ? r.hops.map((h, i) => (
                            <span key={i} className="inline-flex items-center gap-1">
                              {i > 0 && <NextChevron />}
                              {h.status}
                            </span>
                          ))
                        : r.error}
                    </span>
                    {r.hops.length > 1 && <span className="block">{pathOf(r.hops.at(-1)!.url)}</span>}
                  </td>
                  {suggests && (
                    <td className="max-w-xs px-3 py-2 text-xs">
                      {r.replacement ? (
                        <>
                          <a href={r.replacement.url} target="_blank" rel="noreferrer" className="link break-all font-mono text-ink">
                            {pathOf(r.replacement.url)}
                          </a>
                          <span className="block text-ink/75">{r.replacement.reason}</span>
                        </>
                      ) : (
                        <span className="text-ink/75">None found: pick one by hand</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > MAX_ROWS && (
          <p className="text-sm text-ink/75">
            Showing {MAX_ROWS} of {rows.length.toLocaleString("en-US")}. The full list is in the &ldquo;All results&rdquo; CSV.
          </p>
        )}
      </div>
    </details>
  );
}
