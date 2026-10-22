"use client";

import { useActionState } from "react";
import { updatePassword, type ResetState } from "./actions";

const input =
  "input mt-1";

export function ResetForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(updatePassword, {});
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      {/* Lets password managers save the new password against the right account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} aria-describedby="password-help" className={input} />
        <p id="password-help" className="mt-1 text-xs text-ink/70">At least 8 characters.</p>
      </div>
      <div>
        <label htmlFor="confirm" className="label">Confirm password</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={input} />
      </div>
      {state.error && <p className="text-sm text-rust" role="alert">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary w-full"
      >
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
