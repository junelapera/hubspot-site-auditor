import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client for user administration only (invites, team list).
 * Bypasses RLS: call it from server actions/pages after requireUser() and an
 * agency-email check, and never pass it table queries a user could steer.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
