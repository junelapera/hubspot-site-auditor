"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ALLOWED_DOMAIN, isAgencyEmail } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { status: "idle" | "error" | "check-email"; message?: string; email?: string };

function readEmail(formData: FormData): string {
  return String(formData.get("email") ?? "").trim().toLowerCase();
}

function domainError(email: string): string | null {
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) return "Enter a valid email address.";
  if (!isAgencyEmail(email)) return `Use your @${ALLOWED_DOMAIN} email address.`;
  return null;
}

async function origin() {
  return (await headers()).get("origin") ?? "http://localhost:3000";
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = readEmail(formData);
  const password = String(formData.get("password") ?? "");
  const invalid = domainError(email);
  if (invalid) return { status: "error", message: invalid, email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const message =
      error.code === "email_not_confirmed"
        ? "Confirm your email first. Check your inbox for the confirmation link."
        : "Email or password is incorrect.";
    return { status: "error", message, email };
  }
  redirect("/");
}

export async function requestPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = readEmail(formData);
  const invalid = domainError(email);
  if (invalid) return { status: "error", message: invalid, email };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origin()}/auth/callback?next=/set-password`,
  });
  if (error?.code === "over_email_send_rate_limit") {
    return { status: "error", message: "Too many emails sent. Try again in a few minutes.", email };
  }
  // Same answer whether or not the account exists.
  return { status: "check-email", message: "reset", email };
}
