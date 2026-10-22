"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_DOMAIN = "saltedstone.com";
const MIN_PASSWORD_LENGTH = 8;

export type AuthState = { status: "idle" | "error" | "check-email"; message?: string; email?: string };

function readEmail(formData: FormData): string {
  return String(formData.get("email") ?? "").trim().toLowerCase();
}

// The database trigger on auth.users is the real gate; this gives a friendly message first.
function domainError(email: string): string | null {
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) return "Enter a valid email address.";
  if (email.split("@")[1] !== ALLOWED_DOMAIN) return `Use your @${ALLOWED_DOMAIN} email address.`;
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

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = readEmail(formData);
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const invalid = domainError(email);
  if (invalid) return { status: "error", message: invalid, email };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { status: "error", message: `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`, email };
  }
  if (password !== confirm) return { status: "error", message: "Passwords don't match.", email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${await origin()}/auth/callback` },
  });
  if (error) {
    const message =
      error.code === "user_already_exists"
        ? "An account with this email already exists. Sign in, or reset your password."
        : error.code === "weak_password"
          ? "That password is too weak. Try a longer one."
          : error.code === "over_email_send_rate_limit"
            ? "Too many sign-up emails sent. Try again in a few minutes."
            : error.message;
    return { status: "error", message, email };
  }

  // Email confirmation off: Supabase signs the user in straight away.
  if (data.session) redirect("/");

  // With confirmation on, an already-registered email comes back as a user with
  // no identities (Supabase hides whether the account exists).
  if (data.user?.identities?.length === 0) {
    return { status: "error", message: "An account with this email already exists. Sign in, or reset your password.", email };
  }
  return { status: "check-email", message: "confirm", email };
}

export async function requestPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = readEmail(formData);
  const invalid = domainError(email);
  if (invalid) return { status: "error", message: invalid, email };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origin()}/auth/callback?next=/reset-password`,
  });
  if (error?.code === "over_email_send_rate_limit") {
    return { status: "error", message: "Too many emails sent. Try again in a few minutes.", email };
  }
  // Same answer whether or not the account exists.
  return { status: "check-email", message: "reset", email };
}
