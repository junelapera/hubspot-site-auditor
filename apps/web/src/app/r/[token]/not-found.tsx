export const metadata = { title: "Report link not available", robots: { index: false, follow: false } };

/** Wrong, revoked or expired client link. Says the same for all three, so it gives nothing away. */
export default function ReportLinkNotFound() {
  return (
    <main className="page space-y-4">
      <h1 className="font-display text-4xl font-medium leading-tight tracking-tight sm:text-5xl">This report link isn&apos;t available</h1>
      <p className="max-w-2xl text-sm text-ink/85">
        The link may have expired or been turned off, or it may be incomplete (check that the whole address was copied). Ask your
        Salted Stone contact for a new link.
      </p>
    </main>
  );
}
