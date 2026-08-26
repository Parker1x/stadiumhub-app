-- ===========================================================================
--  StadiumHub — ONE-TIME DATABASE SETUP
--  Run this single file in the Supabase SQL editor. Safe to re-run.
--  (Concatenation of all four migrations; nothing else is needed.)
-- ===========================================================================

-- --------------------------------------------------------------------------
-- ============================================================================
--  Groundhopper — migration 2026-08-25
--  Adds: ground_cache, attended_matches, goal_events.
--
--  Paste into the Supabase SQL editor and run. Safe to re-run.
--  Run AFTER the original schema.sql. Nothing existing is dropped or altered.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  ground_cache — shared read-through cache for football-data.org and
--  OpenStreetMap lookups (fixtures, teams, pubs, stations, walk routes).
--  Every signed-in user can read and write it: entries are keyed by their
--  query, contain only public reference data, and rows are interchangeable.
-- ---------------------------------------------------------------------------
create table if not exists public.ground_cache (
  cache_key  text primary key,
  payload    jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists ground_cache_expiry_idx on public.ground_cache (fetched_at);

alter table public.ground_cache enable row level security;
drop policy if exists ground_cache_read   on public.ground_cache;
drop policy if exists ground_cache_write  on public.ground_cache;
drop policy if exists ground_cache_update on public.ground_cache;
drop policy if exists ground_cache_delete on public.ground_cache;
create policy ground_cache_read   on public.ground_cache for select using (auth.uid() is not null);
create policy ground_cache_write  on public.ground_cache for insert with check (auth.uid() is not null);
create policy ground_cache_update on public.ground_cache for update using (true) with check (true);
create policy ground_cache_delete on public.ground_cache for delete using (
  fetched_at < now() - interval '30 days'
);

-- ---------------------------------------------------------------------------
--  attended_matches — one row per (user, match) the user was present for.
--  Populated automatically by matching a visit's date to that club's home
--  fixture in football-data.org data; scorers are filled from match details.
-- ---------------------------------------------------------------------------
create table if not exists public.attended_matches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  ground_id   text not null references public.grounds(id) on delete cascade,
  match_id    text not null,
  match_date  timestamptz,
  home_team   text,
  away_team   text,
  home_goals  integer,
  away_goals  integer,
  competition text,
  scorers_json jsonb,
  created_at  timestamptz not null default now(),
  unique (user_id, match_id)
);
create index if not exists attended_user_idx on public.attended_matches (user_id);
create index if not exists attended_ground_idx on public.attended_matches (ground_id);

alter table public.attended_matches enable row level security;
drop policy if exists attended_read   on public.attended_matches;
drop policy if exists attended_insert on public.attended_matches;
drop policy if exists attended_update on public.attended_matches;
drop policy if exists attended_delete on public.attended_matches;
create policy attended_read   on public.attended_matches for select using (public.can_see_visits(user_id));
create policy attended_insert on public.attended_matches for insert with check (user_id = auth.uid());
create policy attended_update on public.attended_matches for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy attended_delete on public.attended_matches for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
--  goal_events — one row per goal witnessed: who scored, for which side, in
--  which match. Powers "players you've seen score" on the statistics page.
--  Written only by sync code from football-data.org match details.
-- ---------------------------------------------------------------------------
create table if not exists public.goal_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  match_row_id uuid not null references public.attended_matches(id) on delete cascade,
  player       text not null,
  team_side    text not null check (team_side in ('home','away')),
  minute       integer,
  penalty      boolean not null default false,
  own_goal     boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (match_row_id, player, minute)
);
create index if not exists goal_events_user_idx on public.goal_events (user_id);

alter table public.goal_events enable row level security;
drop policy if exists goal_events_read   on public.goal_events;
drop policy if exists goal_events_insert on public.goal_events;
drop policy if exists goal_events_delete on public.goal_events;
create policy goal_events_read   on public.goal_events for select using (public.can_see_visits(user_id));
create policy goal_events_insert on public.goal_events for insert with check (user_id = auth.uid());
create policy goal_events_delete on public.goal_events for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
--  Passport counters view gains attendance stats. security_invoker keeps the
--  visibility rules applying through it, exactly like passport_stats does.
-- ---------------------------------------------------------------------------
drop view if exists public.passport_stats_v2;
create view public.passport_stats_v2 with (security_invoker = on) as
  select p.id                        as user_id,
         p.username,
         count(distinct v.ground_id) as grounds_visited,
         count(am.id)                as matches_attended,
         coalesce(sum(coalesce(am.home_goals,0) + coalesce(am.away_goals,0)), 0) as goals_seen
    from public.profiles p
    left join public.visits v on v.user_id = p.id
    left join public.attended_matches am on am.user_id = p.id
   group by p.id, p.username;

-- --------------------------------------------------------------------------
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

-- --------------------------------------------------------------------------
-- ============================================================================
--  StadiumHub — migration 2026-08-25 (part 3): favourite team
--  Adds the favourite_team column the Edit Profile popup saves to.
--
--  Paste into the Supabase SQL editor and run. Safe to re-run.
-- ============================================================================

alter table public.profiles add column if not exists favourite_team text;

-- --------------------------------------------------------------------------
-- ============================================================================
--  StadiumHub — migration 2026-08-25 (part 4): match plans
--  Stores "I'm attending this match" selections from the Fixtures tab.
--  When a planned match finishes, the sync converts it into
--  attended_matches + goal_events so the statistics update automatically.
--
--  Paste into the Supabase SQL editor and run. Safe to re-run.
-- ============================================================================

create table if not exists public.match_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  match_id    text not null,
  match_date  timestamptz,
  home_team   text,
  away_team   text,
  competition text,
  home_goals  integer,
  away_goals  integer,
  status      text,
  synced      boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (user_id, match_id)
);
create index if not exists match_plans_user_idx on public.match_plans (user_id);

alter table public.match_plans enable row level security;
drop policy if exists plans_read   on public.match_plans;
drop policy if exists plans_insert on public.match_plans;
drop policy if exists plans_update on public.match_plans;
drop policy if exists plans_delete on public.match_plans;
create policy plans_read   on public.match_plans for select using (user_id = auth.uid());
create policy plans_insert on public.match_plans for insert with check (user_id = auth.uid());
create policy plans_update on public.match_plans for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy plans_delete on public.match_plans for delete using (user_id = auth.uid());

-- Attending via the Fixtures tab can record matches with no ground of ours
alter table public.attended_matches alter column ground_id drop not null;

-- ---------------------------------------------------------------------------
--  Final safety net: ensure favourite_team exists even if part 3 was skipped
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists favourite_team text;
