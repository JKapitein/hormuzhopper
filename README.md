# Hormuz Hopper

Small satirical browser game: steer an oil tanker through a lane-based Strait of Hormuz crossing while the oil price climbs.

## Run

```bash
npm install
npm run dev
```

## Analytics

Cloudflare Pages support:

- GA4 works fine on Cloudflare Pages.
- The GA4 measurement ID is currently hardcoded in `src/analytics.js` for this deploy path.
- Cloudflare Web Analytics can still be enabled separately in the dashboard if you want basic visitor/pageview reporting, but the gameplay event tracking here is GA4-only.

The app sends custom events through `gtag` using the hardcoded GA4 measurement ID in `src/analytics.js`.

Tracked events:

- `page_loaded`
- `run_started`
- `restart_clicked`
- `level_started`
- `lane_advanced`
- `hazard_hit`
- `oil_limit_hit`
- `level_completed`
- `run_completed`
- `page_session_summary`
