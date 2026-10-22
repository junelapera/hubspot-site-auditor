import { GRADE_STYLE } from "@/lib/format";
import { IMPACT_PENALTY, SECURITY_PENALTY } from "@/lib/scores";
import type { RunScores } from "@/lib/scores-data";
import { DisclosureChevron } from "./chevron";

export function GradeChip({ grade }: { grade: keyof typeof GRADE_STYLE }) {
  return <span className={`chip ${GRADE_STYLE[grade]}`}>{grade}</span>;
}

/** Change since the previous scan, in words (never color or an arrow alone). */
function Change({ now, before, unit }: { now: number; before: number | null | undefined; unit: string }) {
  if (before == null) return null;
  const diff = now - before;
  if (diff === 0) return <>No change since the previous scan</>;
  return <>{diff > 0 ? "Up" : "Down"} {Math.abs(diff)} {unit} from {before}</>;
}

/** Score and grade cards for a scan report, with how each is worked out. */
export function ScoreCards({ scores, previous }: { scores: RunScores; previous?: RunScores }) {
  const { accessibility, security } = scores;
  return (
    <section aria-label="Scores" className="space-y-2">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="card p-4">
          <dt className="font-mono text-[10px] font-bold tracking-[0.08em] uppercase">Accessibility score</dt>
          <dd className="mt-1 font-display text-4xl font-medium tabular-nums">
            {accessibility ?? "—"}
            {accessibility != null && <span className="font-sans text-base text-ink/70"> / 100</span>}
          </dd>
          {accessibility != null && (
            <dd className="text-xs text-ink/70">
              <Change now={accessibility} before={previous?.accessibility} unit="points" />
            </dd>
          )}
        </div>
        <div className="card p-4">
          <dt className="font-mono text-[10px] font-bold tracking-[0.08em] uppercase">Security grade</dt>
          <dd className="mt-1 flex items-baseline gap-2 font-display text-4xl font-medium">
            {security ? (
              <>
                {security.grade}
                <span className="font-sans text-base text-ink/70 tabular-nums">{security.points} / 100</span>
              </>
            ) : (
              "—"
            )}
          </dd>
          {security && (
            <dd className="text-xs text-ink/70">
              <Change now={security.points} before={previous?.security?.points} unit="points" />
            </dd>
          )}
        </div>
      </dl>
      <details className="group text-sm">
        <summary className="inline-flex cursor-pointer select-none items-center gap-1 py-1 text-ink/85">
          <DisclosureChevron />
          How these are worked out
        </summary>
        <div className="mt-2 space-y-2 text-ink/85">
          <p>
            <strong>Accessibility score:</strong> each scanned page starts at 100 and loses {IMPACT_PENALTY.critical} points per
            critical issue on it, {IMPACT_PENALTY.serious} per serious, {IMPACT_PENALTY.moderate} per moderate and {IMPACT_PENALTY.minor} per
            minor (never below 0). The score is the average over all scanned pages, so it stays comparable when the page limit changes.
            It counts automated (axe) issues only and leaves out issues marked won&apos;t fix or false positive.
          </p>
          <p>
            {/* Keep in step with SECURITY_PENALTY in lib/scores.ts. */}
            <strong>Security grade:</strong> 100 minus points for each failed check: {SECURITY_PENALTY["tls-legacy"]} each for old TLS
            versions and certificate expiry; {SECURITY_PENALTY.hsts} each for the HTTPS redirect, HSTS, Content-Security-Policy,
            X-Frame-Options and mixed content; {SECURITY_PENALTY["version-leak"]} for each other check. A is 90 or more, B 80+, C 70+, D 60+, otherwise F.
            It&apos;s our own measure from passive checks, not a SecurityScorecard grade.
          </p>
        </div>
      </details>
    </section>
  );
}

