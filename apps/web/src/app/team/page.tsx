import { notFound } from "next/navigation";
import { isAgencyEmail } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import { InviteForm } from "./invite-form";

export const metadata = { title: "Team · HubSpot Site Auditor" };

export default async function TeamPage() {
  const { user } = await requireUser();
  // The admin client bypasses RLS, so check the viewer here too.
  if (!isAgencyEmail(user.email)) notFound();
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;

  const members = data.users
    .filter((u) => isAgencyEmail(u.email))
    .map((u) => ({
      id: u.id,
      email: u.email!,
      // An invite isn't accepted until the token is used and a session exists.
      status: u.last_sign_in_at ? "Active" : "Invited",
      lastSignIn: u.last_sign_in_at,
      invitedAt: u.invited_at ?? u.created_at,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Team</h1>
        <p className="mt-1 text-sm text-slate-600">Accounts are invite-only. Anyone on the team can invite a Salted Stone colleague.</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Invite a teammate</h2>
        <InviteForm />
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Members ({members.length})</h2>
        <ul className="divide-y divide-slate-100">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="text-slate-900">
                {m.email}
                {m.id === user.id && <span className="ml-2 text-xs text-slate-500">(you)</span>}
              </span>
              <span className="text-slate-600">
                {m.status === "Active" ? (
                  <>Last signed in {timeAgo(m.lastSignIn!)}</>
                ) : (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900">
                    Invited {timeAgo(m.invitedAt)} · not accepted yet
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
