// Queue worker: polls Supabase for queued runs, runs the audit, writes results back.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, optional WORKER_ID, POLL_INTERVAL_MS.
import { hostname } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { runAudit, type AuditResult } from "./pipeline.js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const WORKER_ID = process.env.WORKER_ID ?? `${hostname()}-${process.pid}`;
const POLL_MS = Number(process.env.POLL_INTERVAL_MS ?? 5_000);
const INSERT_BATCH = 500;

interface Run {
  id: string;
  site_id: string;
  options: { include?: string[]; exclude?: string[]; limit?: number; urls?: string[] };
}

let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));

console.log(`Worker ${WORKER_ID} polling every ${POLL_MS}ms`);
while (!stopping) {
  const { data, error } = await db.rpc("claim_run", { p_worker_id: WORKER_ID });
  if (error) {
    console.error("claim_run failed:", error.message);
  } else if (data?.length) {
    await processRun(data[0] as Run);
    continue; // check for more work straight away
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}
console.log("Worker stopped");

async function processRun(run: Run) {
  console.log(`Run ${run.id}: starting`);
  const { data: site, error } = await db
    .from("sites")
    .select("domain, include_paths, exclude_paths, page_limit")
    .eq("id", run.site_id)
    .single();
  if (error || !site) return fail(run.id, `Site not found: ${error?.message}`);

  try {
    const result = await runAudit(
      {
        domain: site.domain,
        urls: run.options.urls,
        include: run.options.include ?? site.include_paths,
        exclude: run.options.exclude ?? site.exclude_paths,
        limit: run.options.limit ?? site.page_limit,
      },
      {
        onUrls: (urls) => update(run.id, { stage: "scan", pages_total: urls.length }),
        onPage: (_, done) => update(run.id, { pages_done: done }),
        onStage: (stage) => update(run.id, { stage }),
      },
    );
    await update(run.id, { stage: "save" });
    await saveResults(run.id, result);
    await update(run.id, {
      status: "done",
      stage: null,
      finished_at: new Date().toISOString(),
      summary: {
        ...result.stats,
        issues: result.issues.length,
        modules: result.modules.length,
        imagesFlagged: result.images.length,
        linkIssues: result.links.length,
        securityFailed: result.security.filter((s) => !s.pass).length,
      },
    });
    console.log(`Run ${run.id}: done (${result.issues.length} issues, ${(result.stats.durationMs / 1000).toFixed(0)}s)`);
  } catch (err) {
    await fail(run.id, (err as Error).message);
  }
}

/** Every progress write doubles as a heartbeat, so claim_run won't re-queue a live scan. */
async function update(runId: string, fields: Record<string, unknown>) {
  const { error } = await db
    .from("runs")
    .update({ ...fields, heartbeat_at: new Date().toISOString() })
    .eq("id", runId);
  if (error) console.error(`Run ${runId}: update failed:`, error.message);
}

async function fail(runId: string, message: string) {
  console.error(`Run ${runId}: failed — ${message}`);
  await update(runId, { status: "failed", stage: null, error: message, finished_at: new Date().toISOString() });
}

async function saveResults(runId: string, r: AuditResult) {
  await insert("pages", r.pages.map((p) => ({
    run_id: runId,
    url: p.url,
    status: p.status,
    redirected: p.redirected,
    error: p.error ?? null,
    finding_count: p.findings.length,
  })));

  await insert("issues", r.issues.map((i) => ({
    run_id: runId,
    fingerprint: i.fingerprint,
    rule_id: i.ruleId,
    impact: i.impact,
    help: i.help,
    help_url: i.helpUrl,
    tags: i.tags,
    scope: i.scope,
    module: i.module,
    named: i.named,
    partial: i.partial,
    path: i.path,
    html: i.html,
    failure_summary: i.failureSummary,
    fix: i.fix,
    pages: i.pages,
  })));

  await insert("images", r.images.map((i) => ({
    run_id: runId,
    src: i.src,
    alt: i.alt,
    checks: i.checks,
    severity: i.worstSeverity,
    scope: i.location.scope,
    module: i.location.module,
    path: i.location.path,
    fixes: i.fixes,
    pages: i.pages,
  })));

  await insert("links", r.links.map((l) => ({
    run_id: runId,
    check: l.check,
    url: l.url,
    href: l.href,
    text: l.text,
    hops: l.status.hops,
    final_status: l.status.finalStatus,
    error: l.status.error ?? null,
    scope: l.location.scope,
    module: l.location.module,
    path: l.location.path,
    fix: l.fix,
    pages: l.pages,
  })));

  await insert("security_checks", r.security.map((s) => ({
    run_id: runId,
    check_id: s.id,
    name: s.name,
    pass: s.pass,
    current: s.current,
    recommended: s.recommended,
    fix_location: s.fixLocation,
    fix: s.fix,
  })));
}

async function insert(table: string, rows: object[]) {
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const { error } = await db.from(table).insert(rows.slice(i, i + INSERT_BATCH));
    if (error) throw new Error(`Insert into ${table} failed: ${error.message}`);
  }
}
