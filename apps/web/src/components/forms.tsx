"use client";

import { useActionState, useState } from "react";
import {
  addSite,
  deleteSite,
  queueListedRun,
  queueOldUrlCheck,
  queueRun,
  queueSampledRun,
  updateSiteSettings,
  type FormState,
  type ListedRunState,
  type OldUrlCheckState,
} from "@/lib/actions";
import { MAX_OLD_URLS, parseOldUrls } from "@/lib/old-urls";
import { MAX_LISTED_URLS } from "@/lib/url-list";
import type { Site } from "@/lib/types";


function ErrorText({ state, id }: { state: FormState; id: string }) {
  return state.error ? (
    <p id={id} role="alert" className="text-sm text-rust">
      {state.error}
    </p>
  ) : null;
}

export function AddSiteForm() {
  const [state, action, pending] = useActionState(addSite, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div>
        <label htmlFor="domain" className="label">Domain</label>
        <input id="domain" name="domain" required placeholder="www.example.com" className="input mt-1" aria-describedby="add-site-error" />
      </div>
      <div>
        <label htmlFor="name" className="label">Client name <span className="font-normal normal-case tracking-normal text-ink/70">(optional)</span></label>
        <input id="name" name="name" placeholder="Acme Health" className="input mt-1" />
      </div>
      <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "Adding…" : "Add site"}</button>
      <div className="sm:col-span-3"><ErrorText state={state} id="add-site-error" /></div>
    </form>
  );
}

export function QueueRunButton({ siteId, disabled }: { siteId: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(() => queueRun(siteId), {});
  const [sampleState, sampleAction, samplePending] = useActionState(() => queueSampledRun(siteId), {});
  const busy = pending || samplePending || disabled;
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div className="flex flex-wrap gap-2">
        <form action={sampleAction}>
          <button type="submit" disabled={busy} aria-describedby="sample-help" className="btn btn-secondary">
            {samplePending ? "Queuing…" : "Sampled scan"}
          </button>
        </form>
        <form action={action}>
          <button type="submit" disabled={busy} className="btn btn-primary">
            {pending ? "Queuing…" : "Run scan"}
          </button>
        </form>
      </div>
      <p id="sample-help" className="max-w-xs text-xs text-ink/70 sm:text-right">
        Sampled: reads every page, then scans only enough to cover every module.
      </p>
      <ErrorText state={state} id="queue-error" />
      <ErrorText state={sampleState} id="sample-error" />
    </div>
  );
}

export function SiteSettingsForm({ site }: { site: Site }) {
  const [state, action, pending] = useActionState(updateSiteSettings.bind(null, site.id), {});
  return (
    <form action={action} className="space-y-5">
      <div className="max-w-48">
        <label htmlFor="page_limit" className="label">Page limit</label>
        <input
          id="page_limit"
          name="page_limit"
          type="number"
          min={1}
          max={5000}
          defaultValue={site.page_limit}
          aria-describedby="page-limit-help"
          className="input mt-1"
        />
        <p id="page-limit-help" className="mt-1 text-xs text-ink/70">Pages per scan, 1–5000.</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="include_paths" className="label">Include paths</label>
          <textarea
            id="include_paths"
            name="include_paths"
            rows={3}
            defaultValue={site.include_paths.join("\n")}
            placeholder={"/services/**\n/industries/**"}
            aria-describedby="include-help"
            className="input mt-1 resize-y font-mono"
          />
          <p id="include-help" className="mt-1 text-xs text-ink/70">One glob per line. Leave empty to scan the whole sitemap.</p>
        </div>
        <div>
          <label htmlFor="exclude_paths" className="label">Exclude paths</label>
          <textarea
            id="exclude_paths"
            name="exclude_paths"
            rows={3}
            defaultValue={site.exclude_paths.join("\n")}
            placeholder={"/blog/page/**\n/thank-you*"}
            aria-describedby="exclude-help"
            className="input mt-1 resize-y font-mono"
          />
          <p id="exclude-help" className="mt-1 text-xs text-ink/70">One glob per line. Matching pages are skipped.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-ink/30 pt-4">
        <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "Saving…" : "Save settings"}</button>
        <ErrorText state={state} id="settings-error" />
      </div>
    </form>
  );
}

export function ScanUrlsForm({ site, disabled }: { site: Site; disabled?: boolean }) {
  const [state, action, pending] = useActionState<ListedRunState, FormData>(queueListedRun.bind(null, site.id), {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="urls" className="label">Pages</label>
        <textarea
          id="urls"
          name="urls"
          rows={5}
          required
          defaultValue={state.text}
          placeholder={`/pricing\nhttps://${site.domain}/contact`}
          aria-describedby="urls-help urls-error"
          className="input mt-1 font-mono"
        />
        <p id="urls-help" className="mt-1 text-xs text-ink/70">
          URLs or paths on {site.domain}, one per line. Up to {MAX_LISTED_URLS}.
        </p>
      </div>
      <fieldset>
        <legend className="label">Scan</legend>
        <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <label className="inline-flex min-h-6 items-center gap-2">
            <input type="radio" name="mode" value="only" defaultChecked={state.mode !== "add"} className="size-4 accent-ink" />
            Only these pages
          </label>
          <label className="inline-flex min-h-6 items-center gap-2">
            <input type="radio" name="mode" value="add" defaultChecked={state.mode === "add"} className="size-4 accent-ink" />
            The sitemap plus these pages
          </label>
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || disabled} className="btn btn-primary">
          {pending ? "Queuing…" : "Scan these pages"}
        </button>
        {disabled && <p className="text-sm text-ink/75">A scan is already queued or running.</p>}
      </div>
      <ErrorText state={state} id="urls-error" />
    </form>
  );
}

/** A sitemap file's text; .gz files are unzipped in the browser. */
async function readSitemapFile(file: File): Promise<string> {
  if (!/\.gz$/i.test(file.name)) return file.text();
  return new Response(file.stream().pipeThrough(new DecompressionStream("gzip"))).text();
}

export function OldUrlsForm({ site, disabled }: { site: Site; disabled?: boolean }) {
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState<{ message: string; error?: boolean } | null>(null);
  const [state, action, pending] = useActionState<OldUrlCheckState, FormData>(async (prev, formData) => {
    const result = await queueOldUrlCheck(site.id, prev, formData);
    if (!result.error) {
      setText("");
      setLoaded(null);
    }
    return result;
  }, {});
  const count = text.split("\n").filter((l) => l.trim()).length;

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const added: string[] = [];
    const notes: string[] = [];
    let error = false;
    for (const file of files) {
      try {
        const { urls, sitemapIndex } = parseOldUrls(await readSitemapFile(file));
        if (sitemapIndex.length) {
          error = true;
          notes.push(`${file.name} is a sitemap index: it lists ${sitemapIndex.length} sitemaps (${sitemapIndex.slice(0, 3).join(", ")}${sitemapIndex.length > 3 ? ", …" : ""}). Save those and add them instead.`);
        } else if (!urls.length) {
          error = true;
          notes.push(`No URLs found in ${file.name}.`);
        } else {
          added.push(...urls);
          notes.push(`${urls.length.toLocaleString("en-US")} URLs from ${file.name}.`);
        }
      } catch {
        error = true;
        notes.push(`Couldn't read ${file.name}.`);
      }
    }
    if (added.length) {
      const current = text.split("\n").map((l) => l.trim()).filter(Boolean);
      setText([...new Set([...current, ...added])].join("\n"));
    }
    setLoaded({ message: `${added.length ? "Added " : ""}${notes.join(" ")}`, error });
  }

  return (
    <form action={action} className="space-y-4">
      <p className="max-w-3xl text-sm text-ink/85">
        After a migration, every old URL should land on a live page. Add the old site&apos;s sitemap (save it before the domain moves to
        HubSpot, e.g. WordPress&apos;s <span className="font-mono">/sitemap_index.xml</span> and each sitemap it lists). Each old path is
        requested on {site.domain}; old URLs with no redirect, or one to a dead page or the home page, get a likely new page and a row in
        a HubSpot redirects CSV.
      </p>
      <div>
        <label htmlFor="old-url-files" className="label">Old sitemap files</label>
        <input
          id="old-url-files"
          type="file"
          multiple
          accept=".xml,.gz,.txt,text/xml,application/xml,text/plain,application/gzip"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
          aria-describedby="old-url-files-help old-url-files-status"
          className="mt-1 block w-full max-w-md rounded-lg text-sm text-ink file:mr-3 file:cursor-pointer file:rounded-full file:border-2 file:border-ink file:bg-paper file:px-3 file:py-1.5 file:font-mono file:text-[11px] file:font-bold file:tracking-[0.08em] file:text-ink file:uppercase hover:file:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        />
        <p id="old-url-files-help" className="mt-1 text-xs text-ink/70">
          Sitemap XML (or .xml.gz), or a text file with one URL per line. Their URLs are added to the list below.
        </p>
        <p id="old-url-files-status" role="status" className={`mt-1 text-sm ${loaded?.error ? "text-rust" : "text-ink/85"}`}>
          {loaded?.message}
        </p>
      </div>
      <div>
        <label htmlFor="old_urls" className="label">Old URLs</label>
        <textarea
          id="old_urls"
          name="old_urls"
          rows={6}
          required
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"https://old-site.com/about-us/\n/blog/2021/04/our-news/\n/?p=123"}
          spellCheck={false}
          aria-describedby="old-urls-help old-urls-error"
          className="input mt-1 font-mono"
        />
        <p id="old-urls-help" className="mt-1 text-xs text-ink/70">
          One URL or path per line, on any domain: only the path and query are checked, on {site.domain}. Up to{" "}
          {MAX_OLD_URLS.toLocaleString("en-US")}.{count > 0 && ` ${count.toLocaleString("en-US")} ${count === 1 ? "line" : "lines"}.`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || disabled} className="btn btn-primary">
          {pending ? "Queuing…" : "Check old URLs"}
        </button>
        {disabled && <p className="text-sm text-ink/75">A scan is already queued or running.</p>}
      </div>
      <ErrorText state={state} id="old-urls-error" />
    </form>
  );
}

export function DeleteSiteForm({ site, scanCount, disabled }: { site: Site; scanCount: number; disabled?: boolean }) {
  const [state, action, pending] = useActionState(deleteSite.bind(null, site.id), {});
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === site.domain;
  return (
    <form action={action} className="space-y-3">
      <p id="delete-site-help" className="text-sm text-ink/85">
        {scanCount > 0
          ? `Deletes ${site.domain}, its ${scanCount} ${scanCount === 1 ? "scan" : "scans"} with every report and CSV, and its won't fix / false positive marks, for everyone on the team.`
          : `Deletes ${site.domain} for everyone on the team. It has no scans yet.`}{" "}
        This can&apos;t be undone.
        {disabled && " A scan is queued or running: wait for it to finish first."}
      </p>
      <div className="max-w-sm">
        <label htmlFor="confirm-delete" className="label">Type {site.domain} to confirm</label>
        <input
          id="confirm-delete"
          name="confirm"
          autoComplete="off"
          spellCheck={false}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          aria-describedby="delete-site-help delete-site-error"
          className="input mt-1"
        />
      </div>
      <button type="submit" disabled={!matches || pending || disabled} className="btn btn-danger">
        {pending ? "Deleting…" : "Delete site"}
      </button>
      <ErrorText state={state} id="delete-site-error" />
    </form>
  );
}
