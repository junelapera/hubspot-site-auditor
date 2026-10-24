-- Phase 3 shareable client report: a read-only link to one scan's report, no login needed.
-- One active link per scan. Revoking it (or its expiry) stops it working at once.
-- Signed-out visitors never read tables: shared_report() checks the token and returns only
-- what the client report shows (no marked issues, notes, fixes or failing HTML).

create table report_links (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs (id) on delete cascade,
  -- 64 hex characters (two random UUIDs, 244 random bits), made by the database: users can't choose it
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

create unique index report_links_one_active on report_links (run_id) where revoked_at is null;

alter table report_links enable row level security;

create policy "team read" on report_links for select to authenticated using (public.is_team_member());
-- Links only for finished full scans (not redirect checks), and never already expired.
create policy "team create" on report_links for insert to authenticated
  with check (
    public.is_team_member()
    and (expires_at is null or expires_at > now())
    and exists (select 1 from runs r where r.id = run_id and r.status = 'done' and r.kind = 'audit')
  );
create policy "team revoke" on report_links for update to authenticated
  using (public.is_team_member() and revoked_at is null)
  with check (public.is_team_member() and revoked_at is not null);

-- Users set the scan and expiry when creating a link, and only revoked_at afterwards.
revoke insert, update on report_links from anon, authenticated;
grant insert (run_id, expires_at) on report_links to authenticated;
grant update (revoked_at) on report_links to authenticated;

-- The client report for a token, or null if the link doesn't exist, is revoked or has expired.
create function public.shared_report(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with link as (
    select l.run_id, l.expires_at, r.site_id, r.created_at, r.summary, s.domain, s.name
      from report_links l
      join runs r on r.id = l.run_id
      join sites s on s.id = r.site_id
     where l.token = p_token
       and l.revoked_at is null
       and (l.expires_at is null or l.expires_at > now())
       and r.status = 'done'
       and r.kind = 'audit'
  )
  select jsonb_build_object(
    'site', jsonb_build_object('domain', link.domain, 'name', link.name),
    'created_at', link.created_at,
    'expires_at', link.expires_at,
    'summary', jsonb_build_object(
      'pagesScanned', link.summary -> 'pagesScanned',
      'pagesFailed', link.summary -> 'pagesFailed',
      'viewports', link.summary -> 'viewports',
      'sample', link.summary -> 'sample'
    ),
    -- Issues marked won't fix / false positive are left out, as in the team's own report.
    'issues', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'rule_id', i.rule_id, 'impact', i.impact, 'help', i.help, 'help_url', i.help_url, 'tags', i.tags,
        'scope', i.scope, 'module', i.module, 'named', i.named, 'pages', i.pages, 'viewports', i.viewports
      ) order by i.id), '[]'::jsonb)
        from issues i
       where i.run_id = link.run_id
         and not exists (select 1 from issue_marks m where m.site_id = link.site_id and m.fingerprint = i.fingerprint)
    ),
    'pages', (
      select coalesce(jsonb_agg(jsonb_build_object('url', p.url, 'status', p.status, 'failed', p.error is not null) order by p.id), '[]'::jsonb)
        from pages p
       where p.run_id = link.run_id
    ),
    'security', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'check_id', c.check_id, 'name', c.name, 'pass', c.pass, 'current', c.current, 'recommended', c.recommended
      ) order by c.id), '[]'::jsonb)
        from security_checks c
       where c.run_id = link.run_id
    )
  )
  from link
$$;

revoke all on function public.shared_report(text) from public;
grant execute on function public.shared_report(text) to anon, authenticated;
