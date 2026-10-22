-- Phase 2 form check: one row per form found in a scan (by HubSpot form ID), with
-- the checks that failed. Forms are tested once per scan, on the first page they're on.

create table forms (
  id bigint generated always as identity primary key,
  run_id uuid not null references runs (id) on delete cascade,
  form_id text not null,
  -- Nearest heading, or the iframe's title
  label text,
  -- hubspot (rendered in the page) | iframe (cross-origin, can't be tested)
  kind text not null,
  -- checked | not-checked
  status text not null,
  -- Why it wasn't checked or submitted
  note text,
  -- Submitted empty, with every non-GET request blocked, to see its error messages
  submitted boolean not null default false,
  field_count int not null default 0,
  -- [{ check, field, detail }]
  findings jsonb not null default '[]',
  -- { [check]: fix }
  fixes jsonb not null default '{}',
  scope scope not null,
  module text,
  path text not null,
  pages text[] not null,
  unique (run_id, form_id)
);

alter table forms enable row level security;

create policy "team read" on forms for select to authenticated using (public.is_team_member());
