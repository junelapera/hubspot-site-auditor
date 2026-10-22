import { notFound } from "next/navigation";
import { TimeAgo } from "@/components/local-time";
import { isAgencyEmail } from "@/lib/auth";
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
    <main className="page space-y-6">
      <div>
        <h1 className="font-display text-4xl font-medium leading-tight tracking-tight break-words sm:text-5xl">Team</h1>
        <p className="mt-1 text-sm text-ink/75">Accounts are invite-only. Anyone on the team can invite a Salted Stone colleague.</p>
      </div>

      <section className="card p-4">
        <h2 className="eyebrow mb-3">Invite a teammate</h2>
        <InviteForm />
      </section>

      <section className="overflow-hidden card">
        <h2 className="eyebrow border-b border-ink px-4 py-3">Members ({members.length})</h2>
        <ul className="divide-y divide-ink/15">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="text-ink">
                {m.email}
                {m.id === user.id && <span className="ml-2 text-xs text-ink/70">(you)</span>}
              </span>
              <span className="text-ink/75">
                {m.status === "Active" ? (
                  <>Last signed in <TimeAgo iso={m.lastSignIn!} /></>
                ) : (
                  <span className="chip bg-yellow">
                    Invited <TimeAgo iso={m.invitedAt} /> · not accepted yet
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
