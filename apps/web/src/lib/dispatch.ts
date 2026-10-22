import "server-only";

/**
 * Starts the GitHub Actions scan worker (.github/workflows/scan.yml) right away
 * instead of waiting for its 15-minute schedule.
 *
 * Best effort: without a token (local dev, where `pnpm worker` runs instead) or
 * if GitHub is unreachable, the run stays queued and the schedule picks it up.
 * Token: fine-grained PAT for this repo only, with "Actions: read and write".
 */
export async function triggerScanWorker(): Promise<void> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) return;

  const workflow = process.env.GITHUB_WORKFLOW_FILE || "scan.yml";
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({ ref: process.env.GITHUB_WORKFLOW_REF || "main" }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`Scan worker dispatch failed: HTTP ${res.status}`);
  } catch (err) {
    console.error("Scan worker dispatch failed:", (err as Error).message);
  }
}
