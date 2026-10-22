-- HubSpot Site Auditor — Phase 1 schema
-- Sites → runs (also the job queue) → pages, issues, images, links, security checks.

create type run_status as enum ('queued', 'running', 'done', 'failed');
create type scope as enum ('module', 'global', 'template', 'content', 'embed', 'unknown');
create type impact as enum ('critical', 'serious', 'moderate', 'minor');

create table sites (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  name text,
  include_paths text[] not null default '{}',
  exclude_paths text[] not null default '{}',
  page_limit int not null default 200,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- A run is both the scan record and the queue entry the worker polls.
create table runs (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  status run_status not null default 'queued',
  -- Snapshot of crawl settings at queue time: { include, exclude, limit, urls? }
  options jsonb not null default '{}',
  stage text,
  pages_total int,
  pages_done int not null default 0,
  error text,
  -- { rawFindings, issues, modules, imagesFlagged, linkIssues, securityFailed, namedModuleRate, durationMs }
  summary jsonb,
  worker_id text,
  heartbeat_at timestamptz,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index runs_site_created on runs (site_id, created_at desc);
create index runs_queue on runs (created_at) where status = 'queued';

create table pages (
  id bigint generated always as identity primary key,
  run_id uuid not null references runs (id) on delete cascade,
  url text not null,
  status int,
  redirected boolean not null default false,
  error text,
  finding_count int not null default 0,
  unique (run_id, url)
);

-- Deduplicated axe issues. fingerprint is stable across runs (Phase 2 comparison).
create table issues (
  id bigint generated always as identity primary key,
  run_id uuid not null references runs (id) on delete cascade,
  fingerprint text not null,
  rule_id text not null,
  impact impact not null,
  help text not null,
  help_url text not null,
  tags text[] not null default '{}',
  scope scope not null,
  module text,
  named boolean not null,
  partial text,
  path text not null,
  html text not null,
  failure_summary text not null,
  fix jsonb not null,
  pages text[] not null,
  unique (run_id, fingerprint)
);
create index issues_run_module on issues (run_id, scope, module);
create index issues_pages on issues using gin (pages);

create table images (
  id bigint generated always as identity primary key,
  run_id uuid not null references runs (id) on delete cascade,
  src text not null,
  alt text,
  checks text[] not null,
  severity text not null,
  scope scope not null,
  module text,
  path text not null,
  fixes jsonb not null,
  pages text[] not null
);
create index images_run on images (run_id);

create table links (
  id bigint generated always as identity primary key,
  run_id uuid not null references runs (id) on delete cascade,
  "check" text not null,
  url text not null,
  href text not null,
  text text not null,
  hops jsonb not null,
  final_status int,
  error text,
  scope scope not null,
  module text,
  path text not null,
  fix jsonb not null,
  pages text[] not null
);
create index links_run on links (run_id);

create table security_checks (
  id bigint generated always as identity primary key,
  run_id uuid not null references runs (id) on delete cascade,
  check_id text not null,
  name text not null,
  pass boolean not null,
  current text not null,
  recommended text not null,
  fix_location text not null,
  fix jsonb,
  unique (run_id, check_id)
);

-- Module view, computed from issues so it never drifts from them.
create view module_summary with (security_invoker = true) as
with page_counts as (
  select run_id, scope, module, count(distinct url) as pages_affected
  from issues, unnest(pages) as url
  group by run_id, scope, module
)
select
  i.run_id,
  i.scope,
  i.module,
  bool_and(i.named) as named,
  count(*) as issue_count,
  min(i.impact) as worst_impact, -- enum order: critical < serious < moderate < minor
  max(pc.pages_affected) as pages_affected,
  array_agg(distinct i.rule_id) as rules,
  sum(cardinality(i.pages) * case i.impact when 'critical' then 4 when 'serious' then 3 when 'moderate' then 2 else 1 end) as weight
from issues i
join page_counts pc
  on pc.run_id = i.run_id and pc.scope = i.scope and pc.module is not distinct from i.module
group by i.run_id, i.scope, i.module;

-- Worker: atomically claim the oldest queued run. Also re-queues runs whose
-- worker stopped sending heartbeats (crashed or redeployed mid-scan).
create function claim_run(p_worker_id text, p_stale_after interval default interval '10 minutes')
returns setof runs
language plpgsql
security definer
set search_path = public
as $$
begin
  update runs
     set status = 'queued', worker_id = null, stage = null
   where status = 'running' and heartbeat_at < now() - p_stale_after;

  return query
  update runs
     set status = 'running', worker_id = p_worker_id, started_at = now(), heartbeat_at = now(), stage = 'crawl'
   where id = (
     select id from runs
      where status = 'queued'
      order by created_at
      for update skip locked
      limit 1
   )
  returning *;
end;
$$;
revoke all on function claim_run from public, anon, authenticated;

-- Row level security: internal tool, so any signed-in team member can see and
-- queue scans. Restrict sign-ups to the agency domain in Supabase Auth settings.
-- The worker uses the service role key and bypasses RLS.
alter table sites enable row level security;
alter table runs enable row level security;
alter table pages enable row level security;
alter table issues enable row level security;
alter table images enable row level security;
alter table links enable row level security;
alter table security_checks enable row level security;

create policy "team read" on sites for select to authenticated using (true);
create policy "team write" on sites for insert to authenticated with check (true);
create policy "team update" on sites for update to authenticated using (true);

create policy "team read" on runs for select to authenticated using (true);
-- Users may only queue runs; status changes come from the worker.
create policy "team queue" on runs for insert to authenticated with check (status = 'queued');

create policy "team read" on pages for select to authenticated using (true);
create policy "team read" on issues for select to authenticated using (true);
create policy "team read" on images for select to authenticated using (true);
create policy "team read" on links for select to authenticated using (true);
create policy "team read" on security_checks for select to authenticated using (true);
