-- ============================================================================
--  StadiumHub — migration 2026-08-25 (part 3): favourite team
--  Adds the favourite_team column the Edit Profile popup saves to.
--
--  Paste into the Supabase SQL editor and run. Safe to re-run.
-- ============================================================================

alter table public.profiles add column if not exists favourite_team text;
