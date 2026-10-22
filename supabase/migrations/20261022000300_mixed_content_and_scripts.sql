-- Phase 2 security checks from the scanned pages:
-- mixed content (http:// resources on HTTPS pages, mapped to modules like issues)
-- and the third-party domains each scan loaded scripts from.
-- The pass/fail rows for mixed content and cookie flags go in security_checks.

create table mixed_content (
  id bigint generated always as identity primary key,
  run_id uuid not null references runs (id) on delete cascade,
  url text not null,
  -- script | stylesheet | font | image | media | iframe | form | plugin | other
  kind text not null,
  -- Browsers block it (script, stylesheet, iframe, font, ...) rather than upgrading it (images, media)
  blocked boolean not null,
  scope scope not null,
  module text,
  path text not null,
  fix jsonb not null,
  pages text[] not null
);
create index mixed_content_run on mixed_content (run_id);

create table script_domains (
  id bigint generated always as identity primary key,
  run_id uuid not null references runs (id) on delete cascade,
  domain text not null,
  -- Up to 5 example script URLs, without query strings
  urls text[] not null,
  pages text[] not null,
  unique (run_id, domain)
);

alter table mixed_content enable row level security;
alter table script_domains enable row level security;

create policy "team read" on mixed_content for select to authenticated using (public.is_team_member());
create policy "team read" on script_domains for select to authenticated using (public.is_team_member());
