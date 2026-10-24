import { NextResponse, type NextRequest } from "next/server";
import {
  EXPORT_KINDS,
  exportFilename,
  formsCsv,
  imagesCsv,
  issuesCsv,
  librariesCsv,
  linksCsv,
  mixedContentCsv,
  oldUrlRedirectsCsv,
  oldUrlsCsv,
  redirectsCsv,
  rulesCsv,
  scriptsCsv,
  securityCsv,
  type ExportKind,
} from "@/lib/exports";
import { selectAll } from "@/lib/scores-data";
import { createClient } from "@/lib/supabase/server";
import { summarizeModules } from "@/lib/summary";
import type { FormRow, ImageRow, IssueRow, JsLibraryRow, LinkRow, MixedContentRow, OldUrlRow, ScriptDomainRow, SecurityRow } from "@/lib/types";

/** GET /runs/:id/export/:kind — CSV download, read as the signed-in user (RLS applies). old-url-redirects takes ?part=N (500 rows each). */
export async function GET(request: NextRequest, ctx: RouteContext<"/runs/[id]/export/[kind]">) {
  const { id, kind } = await ctx.params;
  if (!EXPORT_KINDS.includes(kind as ExportKind)) {
    return NextResponse.json({ error: "Unknown export" }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data: run } = await supabase
    .from("runs")
    .select("created_at, status, site_id, sites(domain)")
    .eq("id", id)
    .maybeSingle<{ created_at: string; status: string; site_id: string; sites: { domain: string } }>();
  if (!run || run.status !== "done") return NextResponse.json({ error: "Scan not found" }, { status: 404 });

  let csv: string;
  let filename = exportFilename(run.sites.domain, run.created_at, kind as ExportKind);
  switch (kind as ExportKind) {
    case "issues":
    case "rules": {
      // Issues marked won't fix / false positive stay out of remediation tickets.
      const [{ data: issues }, { data: marks }] = await Promise.all([
        supabase.from("issues").select("*").eq("run_id", id).returns<IssueRow[]>(),
        supabase.from("issue_marks").select("fingerprint").eq("site_id", run.site_id),
      ]);
      const marked = new Set((marks ?? []).map((m) => m.fingerprint));
      const open = (issues ?? []).filter((i) => !marked.has(i.fingerprint));
      csv = kind === "rules" ? rulesCsv(open) : issuesCsv(open, summarizeModules(open, id));
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
    case "redirects": {
      const { data } = await supabase.from("links").select("*").eq("run_id", id).returns<LinkRow[]>();
      csv = redirectsCsv(data ?? []);
      break;
    }
    case "security": {
      const { data } = await supabase.from("security_checks").select("*").eq("run_id", id).returns<SecurityRow[]>();
      csv = securityCsv(data ?? []);
      break;
    }
    case "mixed-content": {
      const { data } = await supabase.from("mixed_content").select("*").eq("run_id", id).order("id").returns<MixedContentRow[]>();
      csv = mixedContentCsv(data ?? []);
      break;
    }
    case "scripts": {
      const { data } = await supabase.from("script_domains").select("*").eq("run_id", id).order("id").returns<ScriptDomainRow[]>();
      csv = scriptsCsv(data ?? []);
      break;
    }
    case "forms": {
      const { data } = await supabase.from("forms").select("*").eq("run_id", id).order("id").returns<FormRow[]>();
      csv = formsCsv(data ?? []);
      break;
    }
    case "old-urls":
    case "old-url-redirects": {
      const rows = await selectAll<OldUrlRow>((from, to) => supabase.from("old_urls").select("*").eq("run_id", id).order("id").range(from, to));
      if (kind === "old-urls") csv = oldUrlsCsv(rows);
      else {
        const part = Math.max(1, Math.floor(Number(request.nextUrl.searchParams.get("part")) || 1));
        csv = oldUrlRedirectsCsv(rows, part);
        if (part > 1) filename = filename.replace(/\.csv$/, `-part-${part}.csv`);
      }
      break;
    }
    case "libraries": {
      const { data } = await supabase.from("js_libraries").select("*").eq("run_id", id).order("id").returns<JsLibraryRow[]>();
      csv = librariesCsv(data ?? []);
      break;
    }
  }

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
