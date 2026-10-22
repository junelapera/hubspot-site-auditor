"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Run } from "@/lib/types";

const POLL_MS = 3000;
const STAGE_LABEL: Record<string, string> = {
  crawl: "Reading sitemap",
  scan: "Scanning pages",
  links: "Checking links",
  security: "Checking security",
  save: "Saving results",
};

type Progress = Pick<Run, "id" | "status" | "stage" | "pages_total" | "pages_done" | "error">;

/** Polls a queued/running run and refreshes the page once it finishes. */
export function RunProgress({ initial }: { initial: Progress }) {
  const router = useRouter();
  const [run, setRun] = useState(initial);

  useEffect(() => {
    if (run.status === "done" || run.status === "failed") return;
    const supabase = createClient();
    const timer = setInterval(async () => {
      const { data } = await supabase
        .from("runs")
        .select("id, status, stage, pages_total, pages_done, error")
        .eq("id", run.id)
        .single();
      if (!data) return;
      setRun(data);
      if (data.status === "done" || data.status === "failed") router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [run.id, run.status, router]);

  if (run.status === "queued") {
    return (
      <p className="text-sm text-slate-600" role="status">
        Queued — waiting for the scanner to start. This usually takes 1–2 minutes.
      </p>
    );
  }
  // Shown briefly between the poll seeing the end and the page refresh arriving.
  if (run.status === "done") {
    return <p className="text-sm text-slate-700" role="status">Scan finished — loading results…</p>;
  }
  if (run.status === "failed") {
    return <p className="text-sm text-red-700" role="alert">Scan failed: {run.error ?? "unknown error"}</p>;
  }

  const pct = run.pages_total ? Math.round((run.pages_done / run.pages_total) * 100) : 0;
  return (
    <div role="status" aria-live="polite" className="space-y-1">
      <div className="flex justify-between text-sm text-slate-700">
        <span>{STAGE_LABEL[run.stage ?? ""] ?? "Working"}…</span>
        {run.pages_total ? (
          <span>
            {run.pages_done} / {run.pages_total} pages
          </span>
        ) : null}
      </div>
      <div className="h-2 overflow-hidden rounded bg-slate-200" aria-hidden="true">
        <div className="h-full bg-slate-900 transition-all" style={{ width: `${run.stage === "scan" ? pct : run.stage === "crawl" ? 2 : 100}%` }} />
      </div>
    </div>
  );
}
