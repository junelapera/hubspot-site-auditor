import { requireUser } from "@/lib/supabase/server";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Set your password · HubSpot Site Auditor" };

/** Reached after accepting an invite or opening a password-reset link; already signed in. */
export default async function ResetPasswordPage() {
  const { user } = await requireUser();
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-slate-900">Set your password</h1>
        <p className="mt-1 text-sm text-slate-600">For {user.email}</p>
        <ResetForm email={user.email ?? ""} />
      </div>
    </main>
  );
}
