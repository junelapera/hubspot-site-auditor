import Link from "next/link";
import { Badge } from "@/components/badge";
import { AddSiteForm } from "@/components/forms";
import { timeAgo } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import type { Run, Site } from "@/lib/types";

type SiteWithRun = Site & { runs: Pick<Run, "id" | "status" | "created_at" | "summary">[] };

export default async function HomePage() {
  const { supabase } = await requireUser();
  const { data: sites, error } = await supabase
    .from("sites")
    .select("*, runs(id, status, created_at, summary)")
    .order("created_at", { ascending: false })
    .order("created_at", { referencedTable: "runs", ascending: false })
    .limit(1, { referencedTable: "runs" })
    .returns<SiteWithRun[]>();
  if (error) throw error;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
      <section>
        <h1 className="text-2xl font-semibold text-slate-900">Sites</h1>
        <p className="mt-1 text-sm text-slate-600">Scan a HubSpot site to get its issues grouped by module.</p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Add a site</h2>
        <AddSiteForm />
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {sites.length === 0 ? (
          <p className="p-6 text-sm text-slate-600">No sites yet. Add one above.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Site</th>
                <th scope="col" className="px-4 py-2 font-medium">Last scan</th>
                <th scope="col" className="px-4 py-2 font-medium">Issues</th>
                <th scope="col" className="px-4 py-2 font-medium">Security</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sites.map((site) => {
                const run = site.runs[0];
                return (
                  <tr key={site.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/sites/${site.id}`} className="font-medium text-slate-900 underline-offset-2 hover:underline">
                        {site.name ?? site.domain}
                      </Link>
                      {site.name && <div className="text-xs text-slate-500">{site.domain}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {run ? (
                        <>
                          {timeAgo(run.created_at)}
                          {run.status !== "done" && <span className="ml-2 text-xs text-slate-500">({run.status})</span>}
                        </>
                      ) : (
                        "Never"
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {run?.summary ? `${run.summary.issues} in ${run.summary.modules} groups` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {run?.summary ? (
                        run.summary.securityFailed ? (
                          <Badge tone="fail">{run.summary.securityFailed} failed</Badge>
                        ) : (
                          <Badge tone="pass">All passed</Badge>
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
