import { acceptInvite } from "./actions";

export const metadata = { title: "Accept invitation · HubSpot Site Auditor" };

// Never consume the token on GET: Slack/Teams fetch links to build previews.
export default async function AcceptInvitePage({ searchParams }: PageProps<"/accept-invite">) {
  const { token_hash, type } = await searchParams;
  const valid = typeof token_hash === "string" && (type === "invite" || type === "recovery");

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <p className="text-sm font-semibold text-slate-500">HubSpot Site Auditor</p>
        {valid ? (
          <>
            <h1 className="mt-1 text-xl font-semibold text-slate-900">
              {type === "invite" ? "You've been invited" : "Set your password"}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {type === "invite"
                ? "Accept the invitation, then choose a password for your Salted Stone account."
                : "Continue to choose a new password for your account."}
            </p>
            <form action={acceptInvite} className="mt-6">
              <input type="hidden" name="token_hash" value={token_hash} />
              <input type="hidden" name="type" value={type} />
              <button
                type="submit"
                className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
              >
                {type === "invite" ? "Accept invitation" : "Continue"}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="mt-1 text-xl font-semibold text-slate-900">Invite link not valid</h1>
            <p className="mt-1 text-sm text-slate-600">Ask a teammate to send you a new invite from the Team page.</p>
          </>
        )}
      </div>
    </main>
  );
}
