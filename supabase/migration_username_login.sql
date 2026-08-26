-- ============================================================================
--  Groundhopper — migration 2026-08-25 (part 2): usernames
--  1. Usernames are strictly first-come-first-served: asking for a taken
--     username now FAILS sign-up instead of silently renaming you "joshua2".
--  2. Adds username_lookup(), which lets the sign-in form accept a username
--     and resolve it to the account's email for Supabase Auth.
--
--  Paste into the Supabase SQL editor and run. Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  Strict sign-up trigger. If the caller requested a specific username
--  (the app always does), a taken or invalid username aborts the sign-up.
--  The old suffix fallback only remains for accounts created with no
--  requested username at all (legacy path).
--  NOTE: this deliberately RAISES on conflict rather than renaming. Supabase
--  surfaces that as a generic error, so the app checks availability in the
--  form first — this is the race-condition backstop, not the UX.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  requested text;
  base text;
  candidate text;
  n int := 0;
begin
  requested := lower(nullif(new.raw_user_meta_data->>'username', ''));

  if requested is not null then
    if requested !~ '^[a-z0-9_]{3,20}$' then
      raise exception 'INVALID_USERNAME';
    end if;
    if exists (select 1 from public.profiles where username = requested) then
      raise exception 'USERNAME_TAKEN';
    end if;
    insert into public.profiles (id, username, display_name)
    values (new.id, requested,
            coalesce(nullif(new.raw_user_meta_data->>'display_name',''), requested));
    return new;
  end if;

  -- No username requested: derive one from the email, suffixing if needed.
  base := lower(regexp_replace(
            split_part(new.email,'@',1),
            '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(base) < 3 then
    base := 'hopper' || base;
  end if;
  base := left(base, 16);
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1;
    candidate := left(base, 16) || n::text;
  end loop;

  insert into public.profiles (id, username, display_name)
  values (new.id, candidate, candidate);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
--  username_lookup: resolve a username to its account email so the sign-in
--  form can accept either. SECURITY DEFINER because auth.users is not
--  exposed through the API.
--
--  Honest trade-off: anyone who knows a username can learn its login email.
--  Usernames here are already public by design (shareable ?u= profile links),
--  and the function only leaks the email of the exact username provided —
--  it cannot be used to enumerate the user base. Acceptable at this app's
--  scale; revisit if it ever grows a stranger-facing audience.
-- ---------------------------------------------------------------------------
create or replace function public.username_lookup(p_username text)
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select u.email::text
    from auth.users u
    join public.profiles p on p.id = u.id
   where p.username = lower(trim(p_username))
   limit 1
$$;

-- Explicit grants so signed-out visitors can log in by username.
grant execute on function public.username_lookup(text) to anon, authenticated;
