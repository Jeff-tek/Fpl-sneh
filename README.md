# FPL sneh

An explainable Fantasy Premier League assistant for squad selection, captaincy, transfers, fixtures, and live gameweek tracking.

## Run locally

```sh
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The Vite client proxies `/api/fpl` to the Express server on port 3001. Use **2432** or **1** for a bundled demo team, or enter an FPL team ID to load its most recent recorded picks (GW6 down to GW1).

## Production

```sh
npm run build
npm start
```

The Express server serves `dist` when `NODE_ENV=production`. Set `PORT` to change its listen port. `FPL_API_BASE_URL` can point the proxy at an alternate FPL-compatible endpoint; the default is the official FPL API.

## What is included

- A form, xG, xA, ICT, fixture-difficulty, and home/away expected-points model with adjustable weights.
- Legal formation optimization, captain and vice-captain selection, bench ranking, and one- or two-move transfer ideas.
- A pre-deadline squad editor that observes club limits, bank, and recorded selling prices.
- Fixture ticker, chip timing suggestions, player statistics, and a live points/BPS tracker.
- Express proxy with IPv4-first DNS, seven-minute in-memory caching, `/api/fpl/purge-cache`, and bundled bootstrap, fixture, and demo-entry snapshots for upstream outages.
- Shareable lineup summary and PNG card export.
