"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";

export type ResetState = { error?: string };

export async function updatePassword(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const { supabase } = await requireUser();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters for your password." };
  if (password !== confirm) return { error: "Passwords don't match." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: error.code === "same_password" ? "Choose a password you haven't used before." : error.message };
  }
  redirect("/");
}
