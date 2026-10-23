-- Team members can delete a site. Its runs, and every row under them, go with it (on delete cascade),
-- as do its issue marks. Not while a scan is queued or running: the worker would be writing
-- results for a site that's gone. Checked here so the web app's check can't race a new scan.
create policy "team delete" on sites for delete to authenticated
  using (
    public.is_team_member()
    and not exists (select 1 from runs r where r.site_id = sites.id and r.status in ('queued', 'running'))
  );
