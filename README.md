# Hijri Calendar API

A simple API that fetches the current Hijri date from ACJU website and serves it as JSON.

## API Endpoint

The API provides the current Hijri date at:

```
https://musabibnusiraj.github.io/hijiri/api/hijri.json
```

## Response Format

```json
{
  "hijriDay": "15",
  "hijriMonth": "Ramadan",
  "gregorianDate": "January 10, 2026",
  "fetchedAt": "2026-01-10T00:00:00.000Z"
}
```

## How it works

- GitHub Actions runs daily at midnight UTC
- Fetches the latest Hijri date from https://www.acju.lk/calenders-en/
- Updates the `api/hijri.json` file
- Commits and pushes the changes

## Manual Update

You can trigger the update manually:

1. Go to Actions tab in your repository
2. Select "Update Hijri Date" workflow
3. Click "Run workflow"

## Local Development

1. Install dependencies: `npm install`
2. Run the fetch script: `npm run fetch`
3. The `api/hijri.json` will be updated with the latest data

## Deployment

This is automatically deployed via GitHub Pages. Make sure to enable GitHub Pages in your repository settings:

1. Go to Settings → Pages
2. Select "Deploy from a branch"
3. Choose "main" branch and "/ (root)" folder