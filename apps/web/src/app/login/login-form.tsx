"use client";

import Image from "next/image";
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
  "input mt-1";

export function AuthForm({ mode, notice }: { mode: AuthMode; notice?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    ACTIONS[mode],
    notice ? { status: "error", message: notice } : { status: "idle" },
  );
  const copy = COPY[mode];
  const hasError = state.status === "error";

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="card w-full max-w-md p-8">
        <Image src="/brand/saltedstone.svg" alt="Salted Stone" width={124} height={36} priority />
        <p className="eyebrow mt-3">HubSpot Site Auditor</p>
        <h1 className="mt-6 font-display text-3xl font-medium leading-tight tracking-tight">{copy.title}</h1>
        <p className="mt-1 text-sm text-ink/75">{copy.intro}</p>

        {state.status === "check-email" ? (
          <div className="mt-6 rounded-xl border border-ink bg-mint/50 p-4 text-sm text-ink" role="status">
            If an account exists for <strong>{state.email}</strong>, we&apos;ve sent a link to reset the password.
          </div>
        ) : (
          <form action={action} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="label">Email</label>
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
                  <label htmlFor="password" className="label">Password</label>
                  {mode === "signin" && (
                    <Link href="/login?mode=forgot" className="text-xs text-ink/75 underline-offset-2 hover:underline">
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
              <p id="auth-error" className="text-sm text-rust" role="alert">{state.message}</p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="btn btn-primary w-full"
            >
              {pending ? copy.pending : copy.submit}
            </button>
          </form>
        )}

        <p className="mt-6 text-sm text-ink/75">
          {mode === "signin" ? (
            <>No account yet? Ask a teammate to invite you from the Team page.</>
          ) : (
            <>Have an account? <Link href="/login" className="font-medium text-ink underline-offset-2 hover:underline">Sign in</Link></>
          )}
        </p>
      </div>
    </main>
  );
}
