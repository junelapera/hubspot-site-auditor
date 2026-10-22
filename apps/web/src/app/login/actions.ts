"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_DOMAIN = "saltedstone.com";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string; email?: string };

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  // The database trigger is the real gate; this just gives a friendlier message.
  if (!/^[^@\s]+@[^@\s]+$/.test(email) || email.split("@")[1] !== ALLOWED_DOMAIN) {
    return { status: "error", message: `Use your @${ALLOWED_DOMAIN} email address.`, email };
  }

  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) return { status: "error", message: error.message, email };
  return { status: "sent", email };
}
