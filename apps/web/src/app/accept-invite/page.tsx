import Image from "next/image";
import { acceptInvite } from "./actions";

export const metadata = { title: "Accept invitation · HubSpot Site Auditor" };

// Never consume the token on GET: Slack/Teams fetch links to build previews.
export default async function AcceptInvitePage({ searchParams }: PageProps<"/accept-invite">) {
  const { token_hash, type } = await searchParams;
  const valid = typeof token_hash === "string" && (type === "invite" || type === "recovery");

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="card w-full max-w-md p-8">
        <Image src="/brand/saltedstone.svg" alt="Salted Stone" width={124} height={36} priority />
        <p className="eyebrow mt-3">HubSpot Site Auditor</p>
        {valid ? (
          <>
            <h1 className="mt-6 font-display text-3xl font-medium leading-tight tracking-tight">
              {type === "invite" ? "You've been invited" : "Set your password"}
            </h1>
            <p className="mt-1 text-sm text-ink/75">
              {type === "invite"
                ? "Accept the invitation, then choose a password for your Salted Stone account."
                : "Continue to choose a new password for your account."}
            </p>
            <form action={acceptInvite} className="mt-6">
              <input type="hidden" name="token_hash" value={token_hash} />
              <input type="hidden" name="type" value={type} />
              <button
                type="submit"
                className="btn btn-primary w-full"
              >
                {type === "invite" ? "Accept invitation" : "Continue"}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="mt-6 font-display text-3xl font-medium leading-tight tracking-tight">Invite link not valid</h1>
            <p className="mt-1 text-sm text-ink/75">Ask a teammate to send you a new invite from the Team page.</p>
          </>
        )}
      </div>
    </main>
  );
}
