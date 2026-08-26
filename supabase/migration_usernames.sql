-- ============================================================================
--  Groundhopper — migration 2026-08-25 (part 2): usernames
--  Adds: username availability checks and username-based sign-in support.
--
--  Paste into the Supabase SQL editor and run. Safe to re-run.
--  Run AFTER schema.sql and migration_ground_info.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  username_available — is this username free to claim?
--  Used live on the sign-up screen. SECURITY DEFINER because an anonymous
--  visitor must be able to ask before they have an account. Normalises the
--  same way the profiles check constraint expects (lowercase).
-- ---------------------------------------------------------------------------
create or replace function public.username_available(p_username text)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select not exists (
    select 1 from public.profiles
     where username = lower(trim(p_username))
  );
$$;

-- ---------------------------------------------------------------------------
--  username_to_email — resolve a username to its account email so sign-in can
--  go through Supabase's email+password auth.
--
--  Unknown usernames return a sentinel address instead of NULL: the client
--  then attempts sign-in with a address that cannot exist and GoTrue answers
--  "Invalid login credentials" — exactly the same response a real username
--  with a wrong password produces. That keeps this endpoint from being used
--  to discover which usernames have accounts (the username itself is already
--  public — it IS the profile link — but account existence need not be).
-- ---------------------------------------------------------------------------
create or replace function public.username_to_email(p_username text)
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select u.email
       from public.profiles p
       join auth.users u on u.id = p.id
      where p.username = lower(trim(p_username))),
    'no-such-hopper@groundhopper.invalid'
  );
$$;

-- Both are needed by signed-out visitors on the auth screen.
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.username_to_email(text)  to anon, authenticated;
