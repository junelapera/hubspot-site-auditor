"use client";

import { useActionState } from "react";
import { updatePassword, type ResetState } from "./actions";

const input =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20";

export function ResetForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(updatePassword, {});
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      {/* Lets password managers save the new password against the right account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-800">New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} aria-describedby="password-help" className={input} />
        <p id="password-help" className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
      </div>
      <div>
        <label htmlFor="confirm" className="block text-sm font-medium text-slate-800">Confirm new password</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={input} />
      </div>
      {state.error && <p className="text-sm text-red-700" role="alert">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
