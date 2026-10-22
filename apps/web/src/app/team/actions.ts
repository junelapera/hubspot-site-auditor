"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { ALLOWED_DOMAIN, isAgencyEmail } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";

export type InviteState = { error?: string; link?: string; email?: string };

/**
 * Creates a one-time invite link for a teammate to share by hand (no email sent).
 * Any signed-in team member can invite; only @saltedstone.com addresses.
 */
export async function inviteMember(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const { user } = await requireUser();
  if (!isAgencyEmail(user.email)) return { error: "Only Salted Stone accounts can invite people." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email) || !isAgencyEmail(email)) {
    return { error: `Invite an @${ALLOWED_DOMAIN} email address.`, email };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email });
  if (error) {
    const message =
      error.code === "email_exists"
        ? `${email} already has an account. They can sign in, or use “Forgot password?”.`
        : error.message;
    return { error: message, email };
  }

  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const params = new URLSearchParams({ token_hash: data.properties.hashed_token, type: "invite" });
  revalidatePath("/team");
  return { link: `${origin}/accept-invite?${params}`, email };
}
