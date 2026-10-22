import { NextResponse, type NextRequest } from "next/server";
import { EXPORT_KINDS, exportFilename, imagesCsv, issuesCsv, linksCsv, securityCsv, type ExportKind } from "@/lib/exports";
import { createClient } from "@/lib/supabase/server";
import type { ImageRow, IssueRow, LinkRow, ModuleSummaryRow, SecurityRow } from "@/lib/types";

/** GET /runs/:id/export/:kind — CSV download, read as the signed-in user (RLS applies). */
export async function GET(_request: NextRequest, ctx: RouteContext<"/runs/[id]/export/[kind]">) {
  const { id, kind } = await ctx.params;
  if (!EXPORT_KINDS.includes(kind as ExportKind)) {
    return NextResponse.json({ error: "Unknown export" }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data: run } = await supabase
    .from("runs")
    .select("created_at, status, sites(domain)")
    .eq("id", id)
    .maybeSingle<{ created_at: string; status: string; sites: { domain: string } }>();
  if (!run || run.status !== "done") return NextResponse.json({ error: "Scan not found" }, { status: 404 });

  let csv: string;
  switch (kind as ExportKind) {
    case "issues": {
      const [{ data: issues }, { data: modules }] = await Promise.all([
        supabase.from("issues").select("*").eq("run_id", id).returns<IssueRow[]>(),
        supabase.from("module_summary").select("*").eq("run_id", id).order("weight", { ascending: false }).returns<ModuleSummaryRow[]>(),
      ]);
      csv = issuesCsv(issues ?? [], modules ?? []);
      break;
    }
    case "images": {
      const { data } = await supabase.from("images").select("*").eq("run_id", id).returns<ImageRow[]>();
      csv = imagesCsv(data ?? []);
      break;
    }
    case "links": {
      const { data } = await supabase.from("links").select("*").eq("run_id", id).returns<LinkRow[]>();
      csv = linksCsv(data ?? []);
      break;
    }
    case "security": {
      const { data } = await supabase.from("security_checks").select("*").eq("run_id", id).returns<SecurityRow[]>();
      csv = securityCsv(data ?? []);
      break;
    }
  }

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${exportFilename(run.sites.domain, run.created_at, kind as ExportKind)}"`,
      "cache-control": "private, no-store",
    },
  });
}
