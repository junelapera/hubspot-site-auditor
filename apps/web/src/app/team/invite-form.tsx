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
          <label htmlFor="invite-email" className="label">Teammate&apos;s email</label>
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
            className="input mt-1"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary"
        >
          {pending ? "Creating link…" : "Create invite link"}
        </button>
      </form>

      {state.error && (
        <p id="invite-error" role="alert" className="text-sm text-rust">{state.error}</p>
      )}

      {state.link && (
        <div role="status" className="space-y-2 rounded-xl border border-ink bg-mint/50 p-3 text-sm text-ink">
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
              className="min-w-0 flex-1 rounded-lg border border-ink bg-paper px-2 py-1 font-mono text-xs text-ink"
            />
            <CopyButton text={state.link} label="Copy link" />
          </div>
        </div>
      )}
    </div>
  );
}
