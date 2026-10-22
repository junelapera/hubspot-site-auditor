// Mirrors public.is_agency_email() in supabase/migrations; the database is the real gate.
export const ALLOWED_DOMAIN = "saltedstone.com";

export function isAgencyEmail(email: string | null | undefined): boolean {
  return Boolean(email) && email!.trim().toLowerCase().split("@")[1] === ALLOWED_DOMAIN;
}
