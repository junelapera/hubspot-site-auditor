// Local scan without Supabase: pnpm scan <domain> [--limit 20] [--include "/a/**"] [--exclude "/blog/page/**"] [--urls u1,u2]
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { moduleLabel } from "./aggregate.js";
import { runAudit } from "./pipeline.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    limit: { type: "string", default: "20" },
    include: { type: "string", multiple: true },
    exclude: { type: "string", multiple: true },
    urls: { type: "string" },
    concurrency: { type: "string", default: "3" },
  },
});

const domain = positionals[0];
if (!domain && !values.urls) {
  console.error("Usage: pnpm scan <domain> [--limit N] [--include glob] [--exclude glob] [--urls u1,u2]");
  process.exit(1);
}

const result = await runAudit(
  {
    domain,
    urls: values.urls?.split(",").map((u) => u.trim()),
    include: values.include,
    exclude: values.exclude,
    limit: Number(values.limit),
    concurrency: Number(values.concurrency),
  },
  {
    onUrls: (urls) => console.log(`Scanning ${urls.length} pages…`),
    onPage: (r, done, total) =>
      console.log(`  [${done}/${total}] ${r.error ? "ERROR " + r.error.split("\n")[0] : r.findings.length + " findings"}  ${r.url}`),
    onStage: (stage) => console.log(`Checking ${stage}…`),
  },
);

const { stats, modules, issues, images, links, security, mixedContent, scripts, libraries, forms } = result;
console.log(`\n${stats.rawFindings} page-level findings → ${issues.length} unique issues in ${modules.length} groups`);
const secs = (ms: number) => `${(ms / 1000).toFixed(0)}s`;
console.log(
  `Named module rate: ${(stats.namedModuleRate * 100).toFixed(0)}%  ·  ${secs(stats.durationMs)} ` +
    `(crawl ${secs(stats.stageMs.crawl)}, scan ${secs(stats.stageMs.scan)}, links ${secs(stats.stageMs.links)}, security ${secs(stats.stageMs.security)})\n`,
);
console.table(
  modules.map((m) => ({
    Module: m.label,
    Issues: m.issueCount,
    "Worst severity": m.worstImpact,
    "Pages affected": m.pagesAffected,
    Rules: m.rules.join(", "),
  })),
);

console.log(`\nImages flagged: ${images.length}`);
console.table(
  images.slice(0, 15).map((i) => ({
    Severity: i.worstSeverity,
    Checks: i.checks.join(", "),
    Alt: i.alt === null ? "(none)" : i.alt.slice(0, 40),
    Module: moduleLabel(i.location.scope, i.location.module),
    Pages: i.pages.length,
  })),
);

console.log(`\nLink issues: ${links.length}`);
console.table(
  links.slice(0, 15).map((l) => ({
    Check: l.check,
    URL: l.url.replace(/^https?:\/\/[^/]+/, ""),
    Hops: l.status.hops.map((h) => h.status).join(" → ") || l.status.error,
    Module: moduleLabel(l.location.scope, l.location.module),
    Pages: l.pages.length,
  })),
);

console.log(`\nSecurity: ${security.filter((s) => !s.pass).length} of ${security.length} checks failed`);
console.table(security.map((s) => ({ Check: s.name, Result: s.pass ? "pass" : "FAIL", Current: s.current.slice(0, 70), "Fix lives in": s.fixLocation })));

console.log(`\nMixed content: ${mixedContent.length}`);
console.table(
  mixedContent.slice(0, 15).map((m) => ({
    Kind: m.kind,
    Blocked: m.blocked ? "yes" : "",
    URL: m.url.slice(0, 70),
    Module: m.location ? moduleLabel(m.location.scope, m.location.module) : "(stylesheet or script)",
    Pages: m.pages.length,
  })),
);

console.log(`\nThird-party script domains: ${scripts.length}`);
console.table(scripts.map((s) => ({ Domain: s.domain, Pages: s.pages.length, Example: s.urls[0]?.slice(0, 70) })));

console.log(libraries ? `\nJavaScript libraries: ${libraries.length}` : "\nJavaScript libraries: not checked (Retire.js database unavailable)");
console.table(
  (libraries ?? []).map((l) => ({
    Library: `${l.component} ${l.version}`,
    Severity: l.severity ?? "",
    Vulnerabilities: l.vulnerabilities.length,
    Pages: l.pages.length,
    Example: l.urls[0]?.slice(0, 70),
  })),
);

console.log(`\nForms: ${forms.length}`);
for (const f of forms) {
  console.log(`  ${f.label ?? f.formId} · ${f.status}${f.submitted ? ", submitted empty" : ""}${f.note ? ` (${f.note})` : ""} · ${f.pages.length} pages`);
  for (const x of f.findings) console.log(`    - ${x.check}${x.field ? ` [${x.field}]` : ""}: ${x.detail}`);
}

mkdirSync("scans", { recursive: true });
const out = `scans/${result.siteHost}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(out, JSON.stringify(result, null, 2));
console.log(`\nFull results: apps/worker/${out}`);
