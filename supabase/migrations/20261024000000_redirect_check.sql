-- Old-URL redirect check: a second kind of run. Instead of scanning the site, the worker requests
-- every URL from an old sitemap (options.oldUrls) on the new site and records which ones are left
-- without a working redirect, with a likely new page for each.

alter table runs add column kind text not null default 'audit' check (kind in ('audit', 'redirects'));

create table old_urls (
  id bigint generated always as identity primary key,
  run_id uuid not null references runs (id) on delete cascade,
  -- As listed in the old sitemap
  url text not null,
  -- Its path and query on the new site: what was requested
  checked_url text not null,
  -- live | redirected | missing | redirect-to-dead | redirect-home | redirect-chain | not-checked | error
  status text not null,
  -- [{ url, status }]: every response, including the final one
  hops jsonb not null default '[]',
  final_status int,
  error text,
  -- { url, reason }: likely new page, for missing URLs and redirects to a dead page or the home page
  replacement jsonb
);

create index old_urls_run on old_urls (run_id, id);

alter table old_urls enable row level security;

create policy "team read" on old_urls for select to authenticated using (public.is_team_member());
