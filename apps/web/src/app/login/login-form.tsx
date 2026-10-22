"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, signIn, type AuthState } from "./actions";

export type AuthMode = "signin" | "forgot";

const COPY: Record<AuthMode, { title: string; intro: string; submit: string; pending: string }> = {
  signin: { title: "Sign in", intro: "Use your Salted Stone email and password.", submit: "Sign in", pending: "Signing in…" },
  forgot: { title: "Reset your password", intro: "We'll email you a link to set a new password.", submit: "Send reset link", pending: "Sending…" },
};

const ACTIONS = { signin: signIn, forgot: requestPasswordReset };

const input =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20";

export function AuthForm({ mode, notice }: { mode: AuthMode; notice?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    ACTIONS[mode],
    notice ? { status: "error", message: notice } : { status: "idle" },
  );
  const copy = COPY[mode];
  const hasError = state.status === "error";

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <p className="text-sm font-semibold text-slate-500">HubSpot Site Auditor</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">{copy.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{copy.intro}</p>

        {state.status === "check-email" ? (
          <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
            If an account exists for <strong>{state.email}</strong>, we&apos;ve sent a link to reset the password.
          </div>
        ) : (
          <form action={action} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-800">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                defaultValue={state.email}
                placeholder="you@saltedstone.com"
                aria-invalid={hasError}
                aria-describedby={hasError ? "auth-error" : undefined}
                className={input}
              />
            </div>

            {mode !== "forgot" && (
              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="password" className="block text-sm font-medium text-slate-800">Password</label>
                  {mode === "signin" && (
                    <Link href="/login?mode=forgot" className="text-xs text-slate-600 underline-offset-2 hover:underline">
                      Forgot password?
                    </Link>
                  )}
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className={input}
                />
              </div>
            )}


            {hasError && (
              <p id="auth-error" className="text-sm text-red-700" role="alert">{state.message}</p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-60"
            >
              {pending ? copy.pending : copy.submit}
            </button>
          </form>
        )}

        <p className="mt-6 text-sm text-slate-600">
          {mode === "signin" ? (
            <>No account yet? Ask a teammate to invite you from the Team page.</>
          ) : (
            <>Have an account? <Link href="/login" className="font-medium text-slate-900 underline-offset-2 hover:underline">Sign in</Link></>
          )}
        </p>
      </div>
    </main>
  );
}
