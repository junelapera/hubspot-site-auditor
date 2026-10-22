import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/** Supabase client acting as the signed-in user, so RLS applies. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components can't set cookies; proxy.ts refreshes the session instead.
        }
      },
    },
  });
}

/** Verified user (checked with Supabase Auth, not just the cookie). Redirects to /login if signed out. */
export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");
  return { supabase, user: data.user };
}
