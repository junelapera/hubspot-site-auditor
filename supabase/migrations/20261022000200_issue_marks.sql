-- Phase 2: mark an issue "won't fix" or "false positive" with a note.
-- Marks belong to a site and match issues by fingerprint, so they carry over
-- to every later scan of that site until someone removes them.

create type issue_mark_kind as enum ('wont_fix', 'false_positive');

create table issue_marks (
  id bigint generated always as identity primary key,
  site_id uuid not null references sites (id) on delete cascade,
  fingerprint text not null,
  kind issue_mark_kind not null,
  note text not null default '' check (char_length(note) <= 1000),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, fingerprint)
);

alter table issue_marks enable row level security;

create policy "team read" on issue_marks for select to authenticated using (public.is_team_member());
create policy "team write" on issue_marks for insert to authenticated with check (public.is_team_member());
create policy "team update" on issue_marks for update to authenticated using (public.is_team_member());
create policy "team delete" on issue_marks for delete to authenticated using (public.is_team_member());
