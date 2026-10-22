import Image from "next/image";
import { requireUser } from "@/lib/supabase/server";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Set your password · HubSpot Site Auditor" };

/** Reached after accepting an invite or opening a password-reset link; already signed in. */
export default async function ResetPasswordPage() {
  const { user } = await requireUser();
  return (
    <main className="page flex flex-1 items-center justify-center py-16">
      <div className="card w-full max-w-md p-8">
        <Image src="/brand/saltedstone.svg" alt="Salted Stone" width={124} height={36} priority />
        <h1 className="mt-6 font-display text-3xl font-medium leading-tight tracking-tight">Set your password</h1>
        <p className="mt-1 text-sm text-ink/75">For {user.email}</p>
        <ResetForm email={user.email ?? ""} />
      </div>
    </main>
  );
}
