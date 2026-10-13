# Logic history

A running record of *why* the month-selection logic in `api/fetch-month.js`
behaves the way it does. Add a new entry at the top whenever the logic changes.

Entry format: date · what changed · why · files.

---

## 2026-10-12 — Self-repair of a stored month that contradicts its own dates

**Trigger:** a git merge of the workflow's provisional commit with a local
correction produced a record labelled "Jumada al-Awwal" whose dates were still
Sept 13 → Oct 12 (and day 29 pointed at Nov 9). Clients showed
"1 Jumada al-Awwal" on Oct 12.

**Change:** `isConsistent` / `repairStored` run at the start of every run. The
month name, year, Arabic name, length and `dates` are re-derived from the stored
`startDate`/`endDate`; if anything disagrees the record is rebuilt and saved.

**Why:** `startDate`/`endDate` are the source of truth. The workflow runs every
2 hours, so a bad merge now heals itself within one cycle instead of being
served until the next month.

**Working rule:** `git pull` before touching `api/hijri-month.json` — the bot
commits to it every few hours.

**Files:** `api/fetch-month.js`

## 2026-10-12 — Self-repair of a stored month that contradicts its own dates

**Trigger:** a git merge of the workflow's provisional commit with a local
correction produced a record labelled "Jumada al-Awwal" whose dates were still
Sept 13 → Oct 12 (and day 29 pointed at Nov 9). Clients showed
"1 Jumada al-Awwal" on Oct 12.

**Change:** `isConsistent` / `repairStored` run at the start of every run. The
month name, year, Arabic name, length and `dates` are re-derived from the stored
`startDate`/`endDate`; if anything disagrees the record is rebuilt and saved.

**Why:** `startDate`/`endDate` are the source of truth. The workflow runs every
2 hours, so a bad merge now heals itself within one cycle instead of being
served until the next month.

**Working rule:** `git pull` before touching `api/hijri-month.json`; the bot
commits to it every few hours.

**Files:** `api/fetch-month.js`


## 2026-10-12 — Provisional month defaults to 30 days

**Change:** `buildProvisionalMonth` now rolls forward a 30-day month (was 29).
The long-outage guard steps by 30 days to match.

**Why:** when ACJU's page has not published the new month yet, the stored month
is only a placeholder. 30 days is the safer default, and the next run replaces
it with ACJU's real dates (29 or 30) as soon as they are published.

**Files:** `api/fetch-month.js`, `README.md`

## 2026-10-12 — Never roll forward from an end date older than the stored one

**Trigger:** ACJU's hilaal announcement for Jumaadal Oola 1448 (hilaal *not*
sighted on 2026-10-11) said Rabi' al-Thani completes 30 days, so it ends on
2026-10-12 and Jumaadal Oola starts on 2026-10-13. ACJU's page still showed the
old 29-day estimate (end 2026-10-11), and the script rolled forward to a month
starting 2026-10-12, a day early.

**Change:**
- In the "ACJU's month has ended" branch, the roll-forward base is the later of
  ACJU's `endDate` and the stored `endDate`.
- If the stored month is the later one and still covers today, keep it and exit.

**Why:** ACJU's page can lag behind an announcement. A corrected end date that
we already hold must not be overwritten by ACJU's stale estimate.

**Data fix:** `api/hijri-month.json` set to Rabi' al-Thani 1448,
2026-09-13 → 2026-10-12, 30 days (`currentHijriDay` 30).

**Files:** `api/fetch-month.js`, `api/hijri-month.json`
