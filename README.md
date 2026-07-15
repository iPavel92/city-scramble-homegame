# City Scramble

A multiplayer, mobile-first, web-based game inspired by *JetLag: The Game*. The
map is a real-world city divided into OpenStreetMap administrative areas. Teams
physically visit areas, complete an area-specific challenge, and claim them.
When the timer runs out, **the team with the largest single connected cluster of
adjacent claimed areas wins.**

## How it plays

- **Open deck** — a shared pool of areas. Only **X** are in play at once; claiming
  one reveals the next. Any team can race for these.
- **Private decks** — each team gets **Y** areas that only it can see and claim.
- **Claiming** is honor-based: tap an in-play area, complete the challenge shown
  (from a built-in pool), and mark it claimed.
- **Scoring** — your score is the size of your biggest cluster of claimed areas
  that share a border. Isolated areas count as a cluster of 1. Ties are broken by
  total areas claimed.

## Pages

- `/` — create or join a game
- `/create` — 4-step wizard: pick map areas → settings → team name → lobby
- `/join` — enter a 4-letter code + team name
- `/lobby/:code` and `/game/:code` — the live lobby, then the game map + HUD

## Tech stack

- **Frontend**: React 19 + Vite + React Router, Leaflet for maps. Mobile-first.
- **Backend**: a single Cloudflare Worker that serves the static SPA, the `/api`
  routes, the `/ws` WebSocket, and defines the `GameLobby` **Durable Object**
  (one instance per lobby code) holding authoritative game state.
- **Real-time**: WebSocket Hibernation API — the server broadcasts a
  visibility-filtered state snapshot to each team on every change.
- **Timer**: a Durable Object **Alarm** fires at the deadline to compute the winner.
- **Map data**: OpenStreetMap via **Nominatim** (city search) and **Overpass**
  (child admin boundaries), proxied and cached in **Workers KV**. Boundary
  adjacency is computed from full-resolution geometry (shared edges) at lobby
  creation; geometry is simplified only for rendering.

## Project structure

```
src/
  shared/     types, challenge pool, team colors, scoring (pure, unit-tested)
  worker/     index.ts (router), GameLobby.ts (Durable Object),
              osm.ts (Nominatim/Overpass + KV cache), adjacency.ts, decks.ts, geo.ts
  client/     React app: pages/, components/ (MapView, AreaSelector, GameView, …)
wrangler.jsonc   Worker config: static assets + DO binding + KV + SQLite migration
```

## Local development

```bash
npm install
npm run dev        # Vite + the Worker running in workerd (DO, WebSockets, KV all local)
```

Open the printed URL (default http://127.0.0.1:5173). KV and the Durable Object
are simulated locally, so no Cloudflare account is needed to develop.

```bash
npm run typecheck  # tsc for client + worker
npm run test       # vitest — scoring & adjacency logic
npm run build      # production build into dist/
```

## Deploying to Cloudflare (from GitHub)

This app runs on the **Cloudflare Workers Free plan** (SQLite-backed Durable
Objects, WebSockets, and Alarms are all included).

1. **Create a KV namespace** and copy its id into `wrangler.jsonc`, replacing
   `PLACEHOLDER_REPLACE_BEFORE_DEPLOY`:
   ```bash
   npx wrangler kv namespace create OSM_CACHE
   ```
2. **Connect the GitHub repo** in the Cloudflare dashboard under
   **Workers & Pages → Create → Workers → Connect to Git** (Workers Builds).
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   Every push to `main` then builds and deploys automatically.
3. Or deploy manually:
   ```bash
   npm run build && npx wrangler deploy
   ```

The Durable Object migration in `wrangler.jsonc` uses `new_sqlite_classes`, which
is required for the Free plan.

## Attribution

Map data © OpenStreetMap contributors, available under the
[Open Database License (ODbL)](https://www.openstreetmap.org/copyright).
Geocoding via Nominatim and boundaries via the Overpass API — please respect
their usage policies (the Worker sends a descriptive User-Agent and caches
results in KV).
