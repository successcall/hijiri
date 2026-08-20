/**
 * Fetch the current Hijri month from acju.lk into api/hijri-month.json.
 *
 * ACJU's calendar page ships the month's boundaries as a plain <script> var:
 *
 *   var hijriCalendarData = {"startDate":"2026-08-15","endDate":"2026-09-12", ...}
 *
 * Those two dates are what the site's own calendar is drawn from, so the month
 * length and every Gregorian↔Hijri pairing follow from them exactly — no
 * browser, no DOM scraping, no guessing how many days the month has.
 *
 * ACJU publishes an *estimated* endDate at the start of a month and corrects it
 * once the crescent is sighted (a 30-day estimate can become 29 days). Each run
 * simply re-reads both dates, so a correction is picked up on the next run.
 *
 * Two sources are tried, because that 233 KB page is the fragile part. It is
 * served through LiteSpeed with `Vary: accept, User-Agent`, and the var lives
 * in an inline footer script, so a cache variant that drops or rewrites that
 * script — or a WAF interstitial returned as HTTP 200 — leaves the var missing
 * even while the site is perfectly healthy. The calendar plugin's own
 * month-navigation endpoints return the same two dates as small JSON responses
 * with no page cache in the way, so they serve as the fallback.
 *
 * Failure policy: inside a month nothing needs the network — every date pairing
 * follows from startDate/endDate, which are already on disk. An unreachable
 * ACJU is therefore only a real problem at a month boundary, and the run stays
 * green while the stored month still covers today.
 */

const fs = require('fs');
const path = require('path');

const ACJU_URL = 'https://www.acju.lk/calenders-en/';
const ACJU_NEXT_MONTH_URL = 'https://www.acju.lk/wp-content/plugins/hijri-calendar-plugin/fetch_next_month.php';
const ACJU_PREV_MONTH_URL = 'https://www.acju.lk/wp-content/plugins/hijri-calendar-plugin/fetch_previous_month.php';
const API_PATH = path.join(__dirname, 'hijri-month.json');
// Dropped beside the repo (gitignored) and uploaded as a CI artifact whenever
// the page will not parse, so the next failure can be diagnosed from what the
// runner actually received rather than from what a browser shows locally.
const DEBUG_DUMP_PATH = path.join(__dirname, '..', 'acju-debug.html');
const SL_TIMEZONE = 'Asia/Colombo';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30000;

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9'
};

// Hijri month names exactly as acju.lk displays them
const HIJRI_MONTHS = [
  "Muharram", "Safar", "Rabi' al-Awwal", "Rabi' al-Thani",
  "Jumada al-Awwal", "Jumada al-Thani", "Rajab", "Sha'ban",
  "Ramadan", "Shawwal", "Dhu al-Qi'dah", "Dhu al-Hijjah"
];

const HIJRI_MONTHS_ARABIC = [
  'محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني',
  'جمادى الأولى', 'جمادى الثانية', 'رجب', 'شعبان',
  'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'
];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ── CI annotations ─────────────────────────────────────────────────────────
// Emitted so a degraded run still shows up in the Actions summary even when the
// job is deliberately left green.

const IN_ACTIONS = Boolean(process.env.GITHUB_ACTIONS);

function warn(message) {
  console.warn(IN_ACTIONS ? `::warning::${message}` : `⚠️  ${message}`);
}

function fail(message) {
  console.error(IN_ACTIONS ? `::error::${message}` : `❌ ${message}`);
}

// ── Date helpers ───────────────────────────────────────────────────────────
// Every Date here is a date-only value held at local midnight.

function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toISODate(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

// Whole days from `from` to `to` (negative if `to` is earlier). Compared via
// UTC components so a DST shift on the runner cannot skew the count.
function daysBetween(from, to) {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / MS_PER_DAY);
}

function formatLongDate(date) {
  return `${DAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** Today's calendar date in Sri Lanka, whatever timezone this runs in. */
function getSLToday() {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: SL_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  return parseISODate(iso);
}

/**
 * Name the Hijri month that starts on `startDate`.
 *
 * The astronomical calendar exposed through Intl can sit a couple of days away
 * from ACJU's moon sighting, so the lookup is anchored a week into the month —
 * far enough from either boundary that the drift cannot change the answer.
 * (This is the same table acju.lk uses to label its own heading.)
 */
function identifyHijriMonth(startDate) {
  const anchor = addDays(startDate, 7);
  const parts = new Intl.DateTimeFormat('en-US-u-ca-islamic', {
    day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC'
  }).formatToParts(new Date(Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 12)));

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const monthIndex = parseInt(get('month'), 10) - 1;
  const year = get('year');

  if (!(monthIndex >= 0 && monthIndex < 12) || !year) {
    throw new Error(`Could not identify the Hijri month starting ${toISODate(startDate)}`);
  }
  return { monthIndex, year: String(parseInt(year, 10)) };
}

// ── ACJU page ──────────────────────────────────────────────────────────────

async function fetchAcjuPage(attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(ACJU_URL, {
        headers: { ...BROWSER_HEADERS, 'Accept': 'text/html,application/xhtml+xml' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastError = err;
      console.warn(`⚠️  Attempt ${attempt}/${attempts} failed: ${err.message}`);
      if (attempt < attempts) await new Promise((r) => setTimeout(r, attempt * 3000));
    }
  }
  throw new Error(`Could not load ${ACJU_URL}: ${lastError.message}`);
}

/**
 * Check a pair of ISO dates from either source and derive the month length.
 *
 * A Hijri month is always 29 or 30 days. Anything else means the source is
 * mid-update or broken — better to fail loudly than to store nonsense.
 */
function toMonthBoundaries(startISO, endISO, source) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startISO || '') || !/^\d{4}-\d{2}-\d{2}$/.test(endISO || '')) {
    throw new Error(`Unusable dates from ${source}: ${JSON.stringify({ startISO, endISO })}`);
  }

  const startDate = parseISODate(startISO);
  const endDate = parseISODate(endISO);
  const totalDays = daysBetween(startDate, endDate) + 1;

  if (totalDays !== 29 && totalDays !== 30) {
    throw new Error(`${source} reported a ${totalDays}-day month (${startISO} → ${endISO})`);
  }

  return { startDate, endDate, totalDays };
}

/**
 * Pull the month boundaries out of the page, loosest pattern last.
 *
 * WordPress emits the var through `wp_localize_script`, but an optimisation
 * layer can rewrite the declaration or inline it as an object property, so the
 * final pattern gives up on the variable entirely and just looks for the two
 * dates sitting next to each other anywhere in the markup.
 */
function extractCalendarData(html) {
  const patterns = [
    /(?:var|let|const)\s+hijriCalendarData\s*=\s*(\{[\s\S]*?\})\s*;/,
    /hijriCalendarData\s*[:=]\s*(\{[\s\S]*?\})/
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) continue;
    let raw;
    try {
      raw = JSON.parse(match[1]);
    } catch (err) {
      continue;  // not valid JSON — try the next, looser pattern
    }
    return toMonthBoundaries(raw.startDate, raw.endDate, 'the ACJU page');
  }

  const bare = html.match(
    /"startDate"\s*:\s*"(\d{4}-\d{2}-\d{2})"[\s\S]{0,200}?"endDate"\s*:\s*"(\d{4}-\d{2}-\d{2})"/
  );
  if (bare) return toMonthBoundaries(bare[1], bare[2], 'the ACJU page');

  throw new Error('hijriCalendarData not found — the ACJU page layout changed');
}

// ── ACJU calendar plugin API (fallback) ────────────────────────────────────
// The page's own prev/next buttons POST to these endpoints and get back
// {success, gregorian_month_year, start_date, end_date, is_first_month}.

async function postMonthQuery(url, monthYear, startISO) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...BROWSER_HEADERS,
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': ACJU_URL
    },
    body: new URLSearchParams({ current_month_year: monthYear, current_start_date: startISO }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${path.basename(url)}`);
  return res.json();
}

/**
 * Walk forward from a month we already know about until ACJU says there is
 * nothing newer — that last month is the one the page would have shown.
 *
 * When the seed is already the newest month, its own boundaries are re-read by
 * stepping back one month and forward again. That extra hop is what lets a
 * corrected endDate (30 days estimated → 29 days once sighted) still land.
 */
async function fetchMonthViaApi(seedStartISO) {
  let monthYear = seedStartISO.slice(0, 7);
  let startISO = seedStartISO;
  let latest = null;

  // Bounded so a misbehaving endpoint cannot loop forever; two years is far
  // more than any plausible outage could leave us behind by.
  for (let hop = 0; hop < 24; hop++) {
    const res = await postMonthQuery(ACJU_NEXT_MONTH_URL, monthYear, startISO);
    if (!res?.success) break;
    latest = { startISO: res.start_date, endISO: res.end_date };
    monthYear = res.gregorian_month_year || res.start_date.slice(0, 7);
    startISO = res.start_date;
  }

  if (!latest) {
    const prev = await postMonthQuery(ACJU_PREV_MONTH_URL, seedStartISO.slice(0, 7), seedStartISO);
    if (!prev?.success) {
      throw new Error(`Calendar API would not step back from ${seedStartISO}`);
    }
    const back = await postMonthQuery(
      ACJU_NEXT_MONTH_URL,
      prev.gregorian_month_year || prev.start_date.slice(0, 7),
      prev.start_date
    );
    if (!back?.success) {
      throw new Error(`Calendar API would not return the month starting ${seedStartISO}`);
    }
    latest = { startISO: back.start_date, endISO: back.end_date };
  }

  return toMonthBoundaries(latest.startISO, latest.endISO, 'the ACJU calendar API');
}

/**
 * The newest month ACJU has published — from the page when it parses, and from
 * the calendar API when it does not.
 */
async function loadLatestAcjuMonth(existing) {
  const problems = [];

  try {
    const html = await fetchAcjuPage();
    try {
      return { ...extractCalendarData(html), source: 'page' };
    } catch (err) {
      problems.push(err.message);
      warn(`ACJU page did not parse (${html.length} bytes received): ${err.message}`);
      try {
        fs.writeFileSync(DEBUG_DUMP_PATH, html);
        console.log(`   Saved the response to ${path.basename(DEBUG_DUMP_PATH)} for inspection`);
      } catch (dumpErr) {
        console.warn(`⚠️  Could not save the debug dump: ${dumpErr.message}`);
      }
    }
  } catch (err) {
    problems.push(err.message);
    warn(err.message);
  }

  const seed = existing?.startDate;
  if (!seed) {
    problems.push('no stored month to seed the calendar API fallback');
  } else {
    console.log(`   Falling back to the calendar API, seeded from ${seed}`);
    try {
      return { ...(await fetchMonthViaApi(seed)), source: 'api' };
    } catch (err) {
      problems.push(err.message);
    }
  }

  throw new Error(problems.join('; '));
}

// ── Building the stored record ─────────────────────────────────────────────

function buildMonth(startDate, endDate, { provisional = false } = {}) {
  const totalDays = daysBetween(startDate, endDate) + 1;
  const { monthIndex, year } = identifyHijriMonth(startDate);
  const today = getSLToday();

  const dates = [];
  for (let day = 1; day <= totalDays; day++) {
    const g = addDays(startDate, day - 1);
    dates.push({
      hijriDay: day,
      gregorianDate: `${MONTH_NAMES[g.getMonth()]} ${g.getDate()}, ${g.getFullYear()}`,
      gregorianMonth: MONTH_NAMES[g.getMonth()],
      gregorianDay: g.getDate(),
      gregorianYear: g.getFullYear()
    });
  }

  // 0 when today falls outside this month (consumers treat that as "no data")
  const offset = daysBetween(startDate, today);
  const currentHijriDay = offset >= 0 && offset < totalDays ? offset + 1 : 0;

  const record = {
    hijriMonth: HIJRI_MONTHS[monthIndex],
    hijriYear: year,
    monthNameArabic: HIJRI_MONTHS_ARABIC[monthIndex],
    startDate: toISODate(startDate),
    endDate: toISODate(endDate),
    currentDate: formatLongDate(today),
    currentHijriDay,
    totalDays,
    dates,
    fetchedAt: new Date().toISOString()
  };

  if (provisional) record.provisional = true;
  return record;
}

/**
 * ACJU has not published the new month yet, but the old one has ended. Roll
 * forward from the day after it ended with a provisional 29-day month, which
 * the next run replaces as soon as ACJU catches up.
 */
function buildProvisionalMonth(lastConfirmedEnd, today) {
  let start = addDays(lastConfirmedEnd, 1);
  // Guard against a long outage: keep stepping until the month covers today.
  while (daysBetween(start, today) >= 29) start = addDays(start, 29);
  return buildMonth(start, addDays(start, 28), { provisional: true });
}

function readExisting() {
  try {
    if (fs.existsSync(API_PATH)) return JSON.parse(fs.readFileSync(API_PATH, 'utf8'));
  } catch (err) {
    console.warn(`⚠️  Could not read existing data: ${err.message}`);
  }
  return null;
}

function coversDate(record, date) {
  const target = `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  return Array.isArray(record?.dates) && record.dates.some((d) => d.gregorianDate === target);
}

/** Everything except the timestamp — used to avoid no-op commits. */
function contentOf(record) {
  if (!record) return null;
  const { fetchedAt, ...rest } = record;
  return JSON.stringify(rest);
}

function save(record, existing) {
  if (contentOf(record) === contentOf(existing)) {
    console.log(`✅ Already up to date: ${record.hijriMonth} ${record.hijriYear} ` +
                `(${record.startDate} → ${record.endDate})`);
    return false;
  }
  fs.writeFileSync(API_PATH, JSON.stringify(record, null, 2));
  console.log(`✅ Updated: ${record.hijriMonth} ${record.hijriYear}, ${record.totalDays} days ` +
              `(${record.startDate} → ${record.endDate})${record.provisional ? ' [provisional]' : ''}`);
  return true;
}

// ── Main ───────────────────────────────────────────────────────────────────

(async () => {
  const existing = readExisting();
  const today = getSLToday();
  console.log(`🌙 Checking ACJU — today in Sri Lanka is ${formatLongDate(today)}`);

  let acju;
  try {
    acju = await loadLatestAcjuMonth(existing);
  } catch (err) {
    // Neither source answered. Everything within a month is already derivable
    // from what is on disk, so this only bites at a month boundary.
    if (existing && coversDate(existing, today)) {
      warn(`Could not read ACJU (${err.message}) — the stored month still covers today, leaving it unchanged`);
      return;
    }
    if (existing?.endDate) {
      fail(`Could not read ACJU (${err.message}) and the stored month does not cover today`);
      console.log('🌙 Rolling forward provisionally so consumers keep working');
      save(buildProvisionalMonth(parseISODate(existing.endDate), today), existing);
      process.exitCode = 1;
      return;
    }
    fail(`Could not read ACJU and there is no stored month to fall back on: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  try {
    console.log(`   ACJU is showing ${toISODate(acju.startDate)} → ${toISODate(acju.endDate)} ` +
                `(${acju.totalDays} days, via ${acju.source === 'api' ? 'calendar API' : 'page'})`);

    if (daysBetween(acju.startDate, today) < 0) {
      // ACJU published next month ahead of time — today still belongs to the
      // month we already have, so keep it rather than storing a future month.
      if (existing && coversDate(existing, today)) {
        console.log('⏭️  ACJU is already showing next month; keeping current data');
        return;
      }
      warn('ACJU is showing a future month and stored data does not cover today');
      save(buildMonth(acju.startDate, acju.endDate), existing);
      return;
    }

    if (daysBetween(acju.endDate, today) > 0) {
      // The month ACJU shows has ended and the new one is not published yet.
      console.log('🌙 ACJU has not published the new month yet — rolling forward provisionally');
      save(buildProvisionalMonth(acju.endDate, today), existing);
      return;
    }

    save(buildMonth(acju.startDate, acju.endDate), existing);
  } catch (error) {
    fail(error.message);
    process.exitCode = 1;
  }
})();
