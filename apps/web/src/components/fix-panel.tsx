import type { Fix } from "@/lib/types";
import { CopyButton } from "./copy-button";

/** Suggested fix: summary, steps, and a copyable snippet. */
export function FixPanel({ fix, title = "Suggested fix" }: { fix: Fix; title?: string }) {
  const copyText = [fix.summary, ...fix.steps.map((s) => `- ${s}`), fix.snippet ? `\n${fix.snippet.code}` : ""].join("\n").trim();

  return (
    <section className="rounded-md border border-sky-200 bg-sky-50/60 p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-medium text-sky-950">{title}</h4>
        <CopyButton text={copyText} />
      </div>
      <p className="mt-1 text-slate-800">{fix.summary}</p>
      {fix.steps.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
          {fix.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
      {fix.snippet && (
        <div className="mt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{fix.snippet.lang}</span>
            <CopyButton text={fix.snippet.code} label="Copy snippet" />
          </div>
          <pre className="mt-1 overflow-x-auto rounded bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100">
            <code>{fix.snippet.code}</code>
          </pre>
        </div>
      )}
      {fix.reference && (
        <a href={fix.reference} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-sky-800 underline">
          Rule reference
        </a>
      )}
    </section>
  );
}
