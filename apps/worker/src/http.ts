// Polite fetch for crawl, link and security checks: backs off when the site
// (usually HubSpot's Cloudflare edge) says we're going too fast.

export const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const RETRY_STATUSES = new Set([429, 503]);
const MAX_RETRIES = 3;
const MAX_WAIT_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 15_000;

export function isRateLimited(status: number | null): boolean {
  return status !== null && RETRY_STATUSES.has(status);
}

export async function politeFetch(url: string | URL, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: { "user-agent": USER_AGENT, ...init.headers },
      signal: init.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    if (!RETRY_STATUSES.has(res.status) || attempt === MAX_RETRIES) return res;

    await res.body?.cancel();
    await sleep(retryDelay(res.headers.get("retry-after"), attempt));
  }
}

/** Retry-After in seconds or as a date; otherwise exponential backoff from 2s. */
export function retryDelay(retryAfter: string | null, attempt: number): number {
  let ms = 2_000 * 2 ** attempt;
  if (retryAfter) {
    const secs = Number(retryAfter);
    ms = Number.isFinite(secs) ? secs * 1000 : new Date(retryAfter).getTime() - Date.now();
  }
  return Math.min(Math.max(ms, 1_000), MAX_WAIT_MS);
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
