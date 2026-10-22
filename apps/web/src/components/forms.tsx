"use client";

import { useActionState } from "react";
import { addSite, queueRun, updateSiteSettings, type FormState } from "@/lib/actions";
import type { Site } from "@/lib/types";

const input =
  "block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20";
const primary =
  "rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-60";

function ErrorText({ state, id }: { state: FormState; id: string }) {
  return state.error ? (
    <p id={id} role="alert" className="text-sm text-red-700">
      {state.error}
    </p>
  ) : null;
}

export function AddSiteForm() {
  const [state, action, pending] = useActionState(addSite, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div>
        <label htmlFor="domain" className="block text-sm font-medium text-slate-800">Domain</label>
        <input id="domain" name="domain" required placeholder="www.example.com" className={`mt-1 ${input}`} aria-describedby="add-site-error" />
      </div>
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-slate-800">Client name <span className="font-normal text-slate-500">(optional)</span></label>
        <input id="name" name="name" placeholder="Acme Health" className={`mt-1 ${input}`} />
      </div>
      <button type="submit" disabled={pending} className={primary}>{pending ? "Adding…" : "Add site"}</button>
      <div className="sm:col-span-3"><ErrorText state={state} id="add-site-error" /></div>
    </form>
  );
}

export function QueueRunButton({ siteId, disabled }: { siteId: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(() => queueRun(siteId), {});
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <button type="submit" disabled={pending || disabled} className={primary}>
        {pending ? "Queuing…" : "Run scan"}
      </button>
      <ErrorText state={state} id="queue-error" />
    </form>
  );
}

export function SiteSettingsForm({ site }: { site: Site }) {
  const [state, action, pending] = useActionState(updateSiteSettings.bind(null, site.id), {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <div>
        <label htmlFor="page_limit" className="block text-sm font-medium text-slate-800">Page limit</label>
        <input id="page_limit" name="page_limit" type="number" min={1} max={5000} defaultValue={site.page_limit} className={`mt-1 ${input}`} />
      </div>
      <div>
        <label htmlFor="include_paths" className="block text-sm font-medium text-slate-800">Include paths</label>
        <textarea id="include_paths" name="include_paths" rows={2} defaultValue={site.include_paths.join("\n")} placeholder="/services/**" className={`mt-1 font-mono ${input}`} aria-describedby="paths-help" />
      </div>
      <div>
        <label htmlFor="exclude_paths" className="block text-sm font-medium text-slate-800">Exclude paths</label>
        <textarea id="exclude_paths" name="exclude_paths" rows={2} defaultValue={site.exclude_paths.join("\n")} placeholder="/blog/page/**" className={`mt-1 font-mono ${input}`} aria-describedby="paths-help" />
      </div>
      <p id="paths-help" className="text-xs text-slate-500 sm:col-span-3">One glob per line. Leave include empty to scan the whole sitemap.</p>
      <div className="flex items-center gap-3 sm:col-span-3">
        <button type="submit" disabled={pending} className={primary}>{pending ? "Saving…" : "Save settings"}</button>
        <ErrorText state={state} id="settings-error" />
      </div>
    </form>
  );
}
