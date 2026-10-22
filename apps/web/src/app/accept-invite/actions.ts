"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_TYPES: EmailOtpType[] = ["invite", "recovery"];

/** Uses the one-time token only when the person presses the button (not when a chat app previews the link). */
export async function acceptInvite(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "") as EmailOtpType;
  if (!tokenHash || !ALLOWED_TYPES.includes(type)) redirect("/login?error=Invalid%20invite%20link");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) {
    redirect(`/login?error=${encodeURIComponent("expired or already used — ask a teammate for a new invite")}`);
  }
  redirect("/set-password");
}
