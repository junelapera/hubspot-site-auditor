"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm({ linkError }: { linkError?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    sendMagicLink,
    linkError ? { status: "error", message: `That sign-in link didn't work (${linkError}). Request a new one.` } : { status: "idle" },
  );

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-slate-900">HubSpot Site Auditor</h1>
        <p className="mt-1 text-sm text-slate-600">Sign in with your Salted Stone email. We&apos;ll send you a link.</p>

        {state.status === "sent" ? (
          <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
            Check <strong>{state.email}</strong> for a sign-in link. Open it in this browser.
          </div>
        ) : (
          <form action={action} className="mt-6 space-y-3">
            <label htmlFor="email" className="block text-sm font-medium text-slate-800">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              defaultValue={state.email}
              placeholder="you@saltedstone.com"
              aria-describedby={state.status === "error" ? "email-error" : undefined}
              aria-invalid={state.status === "error"}
              className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
            />
            {state.status === "error" && (
              <p id="email-error" className="text-sm text-red-700" role="alert">
                {state.message}
              </p>
            )}
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-60"
            >
              {pending ? "Sending…" : "Send sign-in link"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
