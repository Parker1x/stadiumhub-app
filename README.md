# StadiumHub — React edition

The original single-file app (`../groundhopper-hosted/`), converted to a proper
npm project: **React 19 + Vite**, split components, real CSS files, and four new
stadium-information features.

## Run it

```bash
npm install     # once
npm run dev     # development at http://localhost:5173
npm run build   # production bundle in dist/
```

## Configure (.env)

| Variable | Where it comes from | Needed for |
|---|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API (already filled in) | everything |
| `VITE_FOOTBALL_DATA_KEY` | free key at <https://www.football-data.org/client/register> | fixtures, live scores, automatic statistics |

After editing `.env`, restart the dev server.

## One-time database step

Run `supabase/migration_ground_info.sql` in the Supabase SQL editor (after the
original `schema.sql`). It adds three tables:

- `ground_cache` — shared cache for football-data.org and OpenStreetMap lookups
  (keeps the free API tiers comfortably inside their rate limits)
- `attended_matches` — matches you attended, found automatically by matching a
  visit's date to that club's home fixture
- `goal_events` — every goal you witnessed, with scorer, side and minute

## What's new vs the static version

- **Stadium page tabs**: Overview · Fixtures & Live · Pubs · Food · Hotels · Transport
- **Fixtures & Live** — next home fixtures, recent results, and a LIVE badge that
  polls every 60 s while a match is in play (free-tier competitions only)
- **Pubs / Food / Hotels** — OpenStreetMap data within ~1 mile of the ground;
  tap any name for Google Maps reviews/directions. No key, no cost.
- **Transport** — nearest stations with distance, estimated walk to the turnstile,
  live departures for London stations via TfL (keyless), plus National Rail /
  Citymapper / Google transit links everywhere else
- **Statistics tab** (in the nav) — matches attended, goals witnessed, your team's
  goals vs opposition goals, players seen scoring (with bars), match-by-match list.
  Fill it with "Re-check my visits", or per-ground via "Find the match I attended".

## Layout

```
src/
  App.jsx                  state + auth flow + view switching
  components/              one file per screen/dialog
  lib/
    supabase.js            client + config validation
    data.js                profiles/visits/posts queries
    football.js            football-data.org client, caching, attendance sync
    places.js              Overpass amenities, TfL departures, walk estimates
  styles/
    base.css               the matchday-programme design (ported unchanged)
    app.css                hosted-only chrome (auth card etc)
    extra.css              stadium tabs, live scores, places, stats
  data/                    the bundled 326 grounds, coordinates, map paths
supabase/migration_ground_info.sql   run this once
```
