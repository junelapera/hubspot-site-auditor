"use client";

import { useActionState } from "react";
import { createReportLink, revokeReportLink, type FormState } from "@/lib/actions";
import { CopyButton } from "./copy-button";
import { LocalTime, TimeAgo } from "./local-time";

const EXPIRY = [
  { value: "never", label: "Never" },
  { value: "7", label: "In 7 days" },
  { value: "30", label: "In 30 days" },
  { value: "90", label: "In 90 days" },
];

export interface ActiveLink {
  url: string;
  created_at: string;
  expires_at: string | null;
}

/** Create, copy, replace or turn off the read-only client link for a scan. */
export function ReportLinkPanel({ runId, link }: { runId: string; link: ActiveLink | null }) {
  const [state, action, pending] = useActionState(createReportLink.bind(null, runId), {});
  const [revokeState, revokeAction, revoking] = useActionState<FormState>(() => revokeReportLink(runId), {});

  return (
    <section aria-labelledby="client-link-heading" className="card space-y-3 p-4 text-sm">
      <h2 id="client-link-heading" className="eyebrow">Client link</h2>
      {link ? (
        <>
          <p className="text-ink/85">
            Anyone with this link can see this scan&apos;s report without signing in: scores, issues by module, pages and security
            checks. Issues marked won&apos;t fix or false positive, notes and fix suggestions aren&apos;t shown.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="client-link-url" className="sr-only">Client link</label>
            <input id="client-link-url" readOnly value={link.url} className="input max-w-xl flex-1 font-mono text-xs" onFocus={(e) => e.target.select()} />
            <CopyButton text={link.url} label="Copy link" />
          </div>
          <p className="text-ink/75">
            Created <TimeAgo iso={link.created_at} /> ·{" "}
            {link.expires_at ? (
              <>Expires <LocalTime iso={link.expires_at} /></>
            ) : (
              "Never expires"
            )}
          </p>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-t border-ink/30 pt-3">
            <ExpiryForm action={action} pending={pending} submitLabel="Replace link" note="The current link stops working." />
            <form action={revokeAction}>
              <button type="submit" disabled={revoking} className="btn btn-danger btn-sm">
                {revoking ? "Turning off…" : "Turn off link"}
              </button>
            </form>
          </div>
        </>
      ) : (
        <>
          <p className="text-ink/85">
            Share this report with the client as a read-only link, no account needed. It shows the scores, issues by module, pages
            and security checks; issues marked won&apos;t fix or false positive, notes and fix suggestions are left out.
          </p>
          <ExpiryForm action={action} pending={pending} submitLabel="Create link" />
        </>
      )}
      <ErrorText state={state} />
      <ErrorText state={revokeState} />
    </section>
  );
}

function ExpiryForm({ action, pending, submitLabel, note }: { action: (formData: FormData) => void; pending: boolean; submitLabel: string; note?: string }) {
  return (
    <form action={action} className="flex flex-wrap items-end gap-x-4 gap-y-2">
      <fieldset>
        <legend className="label">Expires</legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {EXPIRY.map((e) => (
            <label key={e.value} className="inline-flex min-h-6 items-center gap-2">
              <input type="radio" name="expiry" value={e.value} defaultChecked={e.value === "never"} className="size-4 accent-ink" />
              {e.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
          {pending ? "Saving…" : submitLabel}
        </button>
        {note && <span className="text-xs text-ink/70">{note}</span>}
      </div>
    </form>
  );
}

function ErrorText({ state }: { state: FormState }) {
  return state.error ? <p role="alert" className="text-rust">{state.error}</p> : null;
}
