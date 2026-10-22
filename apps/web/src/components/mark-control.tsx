"use client";

import { useActionState, useTransition } from "react";
import { MARK_LABEL } from "@/lib/format";
import { markIssue, unmarkIssue, type MarkState } from "@/lib/marks";
import type { IssueMark } from "@/lib/types";

/** Mark an issue won't fix / false positive (hidden in this and later scans), or remove the mark. */
export function MarkControl({ siteId, fingerprint, mark }: { siteId: string; fingerprint: string; mark?: IssueMark }) {
  const [state, action, pending] = useActionState<MarkState, FormData>(markIssue.bind(null, siteId, fingerprint), {});
  const [unmarking, startUnmark] = useTransition();
  const id = `mark-${fingerprint}`;

  if (mark) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-ink bg-yellow/40 px-3 py-2 text-sm">
        <span className="chip bg-yellow">{MARK_LABEL[mark.kind]}</span>
        {mark.note && <span className="text-ink/85">{mark.note}</span>}
        <button
          type="button"
          disabled={unmarking}
          onClick={() => startUnmark(async () => void (await unmarkIssue(siteId, fingerprint)))}
          className="btn btn-secondary btn-sm ml-auto"
        >
          {unmarking ? "Removing…" : "Unmark"}
        </button>
      </div>
    );
  }

  return (
    <details className="group">
      <summary className="btn btn-secondary btn-sm cursor-pointer">Mark as won&apos;t fix / false positive</summary>
      <form action={action} className="mt-3 space-y-3 rounded-lg border border-ink bg-cream p-3">
        <fieldset>
          <legend className="label">Mark as</legend>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            {(Object.keys(MARK_LABEL) as (keyof typeof MARK_LABEL)[]).map((kind) => (
              <label key={kind} className="flex items-center gap-2">
                <input type="radio" name="kind" value={kind} required defaultChecked={kind === "wont_fix"} className="size-4 accent-ink" />
                {MARK_LABEL[kind]}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor={`${id}-note`} className="label">
            Note <span className="font-normal normal-case tracking-normal text-ink/70">(why)</span>
          </label>
          <textarea id={`${id}-note`} name="note" rows={2} maxLength={1000} className="input mt-1" />
        </div>
        <p className="text-xs text-ink/70">Hidden from this and later scans of this site until someone unmarks it.</p>
        {state.error && <p role="alert" className="text-sm text-rust">{state.error}</p>}
        <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
          {pending ? "Saving…" : "Save mark"}
        </button>
      </form>
    </details>
  );
}
