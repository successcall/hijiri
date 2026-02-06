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
  "hijriMonth": "Rajab",
  "hijriYear": "1447",
  "monthNameArabic": "رجب",
  "currentDate": "Saturday, January 10, 2026",
  "totalDays": 30,
  "dates": [
    {
      "hijriDay": 1,
      "gregorianDate": "December 23, 2025",
      "gregorianMonth": "December",
      "gregorianDay": 23,
      "gregorianYear": 2025
    }
  ],
  "fetchedAt": "2026-01-10T..."
}
```

## How it works

**Smart Hijri Calendar Fetching Logic:**

- GitHub Actions runs **once daily** at 01:00 Sri Lanka time (30 runs/month)
- Intelligent scheduling based on the **Hijri (lunar) calendar**:

**Initial condition:**
- Fetches immediately if no data file exists

**Month transition period (Hijri days 29, 30, or 1):**
- Checks daily for new month data on ACJU website
- Automatically detects when new month calendar appears
- Retries once per day until successful (with 20-hour cooldown)
- Handles both 29-day and 30-day months

**After successful fetch:**
- Waits quietly during the month (days 2-28)
- No fetches until next month's day 29
- Automatically resumes checking at next transition

- Scrapes latest data from https://www.acju.lk/calenders-en/
- Updates `api/hijri-month.json` with the month's calendar
- Commits and pushes changes automatically

## Manual Update

You can trigger the update manually:

1. Go to Actions tab in your repository
2. Select "Update Hijri Date" workflow
3. Click "Run workflow"

Note: Manual triggers will check the Hijri schedule and only fetch if appropriate.

## Local Development

1. Install dependencies: `npm install`
2. Run the fetch script: `npm run fetch-month`
3. The `api/hijri-month.json` will be updated if the Hijri schedule conditions are met

## Deployment

This is automatically deployed via GitHub Pages. Make sure to enable GitHub Pages in your repository settings:

1. Go to Settings → Pages
2. Select "Deploy from a branch"
3. Choose "main" branch and "/ (root)" folder

Your repository: https://github.com/successcall/hijiri