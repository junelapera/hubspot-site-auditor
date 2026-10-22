-- Phase 2: JavaScript libraries found in the scripts each scan loaded, with known
-- vulnerabilities from the Retire.js database. The pass/fail row goes in security_checks.

create table js_libraries (
  id bigint generated always as identity primary key,
  run_id uuid not null references runs (id) on delete cascade,
  component text not null,
  version text not null,
  -- Worst severity (low | medium | high | critical); null when this version has no known vulnerabilities
  severity text,
  -- [{ severity, summary, cves, info }]
  vulnerabilities jsonb not null default '[]',
  fix jsonb,
  -- Up to 5 script URLs it was found in
  urls text[] not null,
  pages text[] not null,
  unique (run_id, component, version)
);

alter table js_libraries enable row level security;

create policy "team read" on js_libraries for select to authenticated using (public.is_team_member());
