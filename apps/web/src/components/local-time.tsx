"use client";

import { useSyncExternalStore } from "react";

// Servers (Vercel) run in UTC, so dates are formatted in the browser, in the
// viewer's time zone. The server render shows UTC, labelled, until hydration.
const subscribe = () => () => {};
function useInBrowser() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

const FORMAT: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

export function formatDateTime(iso: string, timeZone?: string) {
  return new Date(iso).toLocaleString("en-AU", { ...FORMAT, timeZone });
}

/** "22 Oct 2026, 3:20 pm" in the viewer's time zone. */
export function LocalTime({ iso }: { iso: string }) {
  const inBrowser = useInBrowser();
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {inBrowser ? formatDateTime(iso) : `${formatDateTime(iso, "UTC")} UTC`}
    </time>
  );
}

// The current minute as an external store: re-renders "x min ago" as time passes
// and keeps Date.now() out of render. Null on the server.
const subscribeMinute = (onChange: () => void) => {
  const timer = setInterval(onChange, 30_000);
  return () => clearInterval(timer);
};
const currentMinute = () => Math.floor(Date.now() / 60_000);
const serverMinute = () => null;

/** "3 min ago", falling back to a date after a day. Worked out in the browser so it isn't stale. */
export function TimeAgo({ iso }: { iso: string }) {
  const minute = useSyncExternalStore(subscribeMinute, currentMinute, serverMinute);
  if (minute === null) return <time dateTime={iso}>{formatDateTime(iso, "UTC")} UTC</time>;

  const secs = Math.round((minute * 60_000 - new Date(iso).getTime()) / 1000);
  let text: string;
  if (secs < 60) text = "just now";
  else if (secs < 3600) text = `${Math.round(secs / 60)} min ago`;
  else if (secs < 86_400) text = `${Math.round(secs / 3600)} h ago`;
  else text = new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  return (
    <time dateTime={iso} title={formatDateTime(iso)}>
      {text}
    </time>
  );
}
