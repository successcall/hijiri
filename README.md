# Hijri Calendar API

A smart API that fetches Hijri month calendar data from ACJU website based on lunar calendar timing.

## API Endpoint

Get all dates for the current Hijri month:

```
https://successcall.github.io/hijiri/api/hijri-month.json
```

### Response Format for Month API

```json
{
  "hijriMonth": "Rabi' al-Awwal",
  "hijriYear": "1448",
  "monthNameArabic": "ربيع الأول",
  "startDate": "2026-08-15",
  "endDate": "2026-09-12",
  "currentDate": "Saturday, August 15, 2026",
  "currentHijriDay": 1,
  "totalDays": 29,
  "dates": [
    {
      "hijriDay": 1,
      "gregorianDate": "August 15, 2026",
      "gregorianMonth": "August",
      "gregorianDay": 15,
      "gregorianYear": 2026
    }
  ],
  "fetchedAt": "2026-08-15T..."
}
```

`provisional: true` is present only while ACJU has yet to publish a month that
has already begun (see below).

**Read `dates` / `startDate` / `endDate`, not `currentHijriDay`.** The two
`current*` fields are a snapshot from the last update and say nothing about
sunset — clients should look today's Gregorian date up in `dates` and apply
their own Maghrib rule.

## How it works

ACJU's calendar page ships the month's boundaries as a plain `<script>`
variable, which is what its own calendar is drawn from:

```js
var hijriCalendarData = {"startDate":"2026-08-15","endDate":"2026-09-12", ...}
```

`api/fetch-month.js` reads those two dates over a single HTTPS request — no
browser, no DOM scraping, and no guessing how many days the month has. The
month name comes from the same Hijri month table acju.lk labels its heading
with, looked up a week into the month so the couple of days that the
astronomical calendar drifts from the moon sighting cannot change the answer.

**Schedule:** GitHub Actions runs every 2 hours and commits only when the data
actually changes, so a new month appears in the API within two hours of ACJU
publishing it.

**Sighting corrections:** ACJU publishes an *estimated* `endDate` at the start
of a month and shortens it when the crescent is sighted a day early. Every run
re-reads both dates, so a 30-day month becoming 29 days is picked up
automatically.

**When ACJU is behind:** if the month on ACJU's page has already ended and the
new one is not published yet, the script rolls forward a *provisional* 29-day
month starting the day after the confirmed one ended, flagged with
`"provisional": true`. Each later run replaces it as soon as ACJU catches up.

**When ACJU's page can't be read** (network failure, layout change, or a month
length that isn't 29 or 30 days) the run fails loudly and leaves the stored
data untouched, rather than overwriting it with a guess.

## Manual Update

You can trigger the update manually:

1. Go to Actions tab in your repository
2. Select "Update Hijri Date" workflow
3. Click "Run workflow"

## Local Development

Run the fetch script: `npm run fetch-month`

It needs Node 18+ and no dependencies — `api/hijri-month.json` is rewritten
only if the data changed. (`npm install` is only needed for the legacy
single-date `api/index.js` script, which nothing consumes.)

## Deployment

This is automatically deployed via GitHub Pages. Make sure to enable GitHub Pages in your repository settings:

1. Go to Settings → Pages
2. Select "Deploy from a branch"
3. Choose "main" branch and "/ (root)" folder

Your repository: https://github.com/successcall/hijiri