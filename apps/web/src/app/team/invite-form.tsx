"use client";

import { useActionState } from "react";
import { CopyButton } from "@/components/copy-button";
import { inviteMember, type InviteState } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteMember, {});
  return (
    <div className="space-y-4">
      <form action={action} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label htmlFor="invite-email" className="block text-sm font-medium text-slate-800">Teammate&apos;s email</label>
          <input
            id="invite-email"
            name="email"
            type="email"
            required
            placeholder="name@saltedstone.com"
            defaultValue={state.link ? "" : state.email}
            key={state.link ?? "form"}
            aria-describedby={state.error ? "invite-error" : undefined}
            aria-invalid={Boolean(state.error)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-60"
        >
          {pending ? "Creating link…" : "Create invite link"}
        </button>
      </form>

      {state.error && (
        <p id="invite-error" role="alert" className="text-sm text-red-700">{state.error}</p>
      )}

      {state.link && (
        <div role="status" className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
          <p>
            Invite link for <strong>{state.email}</strong>. Send it to them directly (Slack, Teams). It works once and
            expires in 24 hours. Anyone with the link can claim this account, so don&apos;t post it in a shared channel.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={state.link}
              aria-label="Invite link"
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded border border-emerald-300 bg-white px-2 py-1 font-mono text-xs text-slate-800"
            />
            <CopyButton text={state.link} label="Copy link" />
          </div>
        </div>
      )}
    </div>
  );
}
