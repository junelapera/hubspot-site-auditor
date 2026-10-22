import type { Fix } from "@/lib/types";
import { NextChevron } from "./chevron";
import { CopyButton } from "./copy-button";

/** Suggested fix: summary, steps, and a copyable snippet. */
export function FixPanel({ fix, title = "Suggested fix" }: { fix: Fix; title?: string }) {
  const copyText = [fix.summary, ...fix.steps.map((s) => `- ${s}`), fix.snippet ? `\n${fix.snippet.code}` : ""].join("\n").trim();

  return (
    <section className="rounded-xl border border-ink bg-teal/30 p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <h4 className="eyebrow">{title}</h4>
        <CopyButton text={copyText} />
      </div>
      <p className="mt-2 font-medium">{fix.summary}</p>
      {fix.steps.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink/85">
          {fix.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
      {fix.snippet && (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="chip bg-paper">{fix.snippet.lang}</span>
            <CopyButton text={fix.snippet.code} label="Copy snippet" />
          </div>
          <pre tabIndex={0} aria-label={`${fix.snippet.lang} snippet`} className="mt-2 overflow-x-auto rounded-lg bg-ink p-3 font-mono text-xs leading-relaxed text-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
            <code>{fix.snippet.code}</code>
          </pre>
        </div>
      )}
      {fix.reference && (
        <a href={fix.reference} target="_blank" rel="noreferrer" className="link mt-3 inline-flex items-center gap-1 py-1 font-mono text-[11px] font-bold tracking-[0.06em] uppercase">
          Rule reference
          <NextChevron />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
    </section>
  );
}
