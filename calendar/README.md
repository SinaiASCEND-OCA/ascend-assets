# Class calendar data

Builds the scheduled contact-hours data the ASCEND dashboards show (Navigator, Phase 1, Phase 2, Integration).

- `calendars.json` lists the public class Google Calendars (one per class year).
- `fetch-calendar.mjs` reads them into `data/events.json`.
- `build-hours.mjs` turns those events into `data/contact-hours.json`.

The workflow `.github/workflows/pages.yml` runs both every 30 minutes and publishes them with the rest of this repo at
`https://sinaiascend-oca.github.io/ascend-assets/calendar/data/contact-hours.json` (pages read `/ascend-assets/calendar/data/contact-hours.json`).
The `data/` folder is generated and not committed.

When a new class starts, add its public calendar ID to `calendars.json`.
