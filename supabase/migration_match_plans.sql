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
