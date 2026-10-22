-- Only @saltedstone.com accounts can sign up or read data.
-- Two layers: block the account at creation, and check the email claim in RLS
-- so any account created another way (dashboard invite, old user) still can't read.
-- Email confirmation must stay on in Auth settings, or anyone could claim an address.

create function public.is_agency_email(email text)
returns boolean
language sql
immutable
as $$
  select lower(split_part(coalesce(email, ''), '@', 2)) = 'saltedstone.com'
$$;

create function public.enforce_agency_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_agency_email(new.email) then
    raise exception 'Sign-up is limited to @saltedstone.com email addresses';
  end if;
  return new;
end;
$$;

create trigger enforce_agency_email
  before insert or update of email on auth.users
  for each row execute function public.enforce_agency_email();

-- True for a signed-in user with a confirmed agency email.
create function public.is_team_member()
returns boolean
language sql
stable
as $$
  select public.is_agency_email(auth.jwt() ->> 'email')
$$;

-- Replace the open "authenticated" policies from the init migration.
drop policy "team read" on sites;
drop policy "team write" on sites;
drop policy "team update" on sites;
drop policy "team read" on runs;
drop policy "team queue" on runs;
drop policy "team read" on pages;
drop policy "team read" on issues;
drop policy "team read" on images;
drop policy "team read" on links;
drop policy "team read" on security_checks;

create policy "team read" on sites for select to authenticated using (public.is_team_member());
create policy "team write" on sites for insert to authenticated with check (public.is_team_member());
create policy "team update" on sites for update to authenticated using (public.is_team_member());

create policy "team read" on runs for select to authenticated using (public.is_team_member());
-- Users may only queue runs; status changes come from the worker.
create policy "team queue" on runs for insert to authenticated
  with check (public.is_team_member() and status = 'queued');

create policy "team read" on pages for select to authenticated using (public.is_team_member());
create policy "team read" on issues for select to authenticated using (public.is_team_member());
create policy "team read" on images for select to authenticated using (public.is_team_member());
create policy "team read" on links for select to authenticated using (public.is_team_member());
create policy "team read" on security_checks for select to authenticated using (public.is_team_member());
