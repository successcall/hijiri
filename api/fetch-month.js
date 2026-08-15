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
 */

const fs = require('fs');
const path = require('path');

const ACJU_URL = 'https://www.acju.lk/calenders-en/';
const API_PATH = path.join(__dirname, 'hijri-month.json');
const SL_TIMEZONE = 'Asia/Colombo';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        signal: AbortSignal.timeout(30000)
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

/** Pull `hijriCalendarData` out of the page and sanity check it. */
function extractCalendarData(html) {
  const match = html.match(/var\s+hijriCalendarData\s*=\s*(\{[\s\S]*?\})\s*;/);
  if (!match) {
    throw new Error('hijriCalendarData not found — the ACJU page layout changed');
  }

  const raw = JSON.parse(match[1]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.startDate || '') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(raw.endDate || '')) {
    throw new Error(`Unusable dates from ACJU: ${JSON.stringify(raw)}`);
  }

  const startDate = parseISODate(raw.startDate);
  const endDate = parseISODate(raw.endDate);
  const totalDays = daysBetween(startDate, endDate) + 1;

  // A Hijri month is always 29 or 30 days. Anything else means the page is
  // mid-update or broken — better to fail loudly than to store nonsense.
  if (totalDays !== 29 && totalDays !== 30) {
    throw new Error(`ACJU reported a ${totalDays}-day month (${raw.startDate} → ${raw.endDate})`);
  }

  return { startDate, endDate, totalDays };
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
  try {
    const existing = readExisting();
    const today = getSLToday();
    console.log(`🌙 Checking ACJU — today in Sri Lanka is ${formatLongDate(today)}`);

    const acju = extractCalendarData(await fetchAcjuPage());
    console.log(`   ACJU is showing ${toISODate(acju.startDate)} → ${toISODate(acju.endDate)} ` +
                `(${acju.totalDays} days)`);

    if (daysBetween(acju.startDate, today) < 0) {
      // ACJU published next month ahead of time — today still belongs to the
      // month we already have, so keep it rather than storing a future month.
      if (existing && coversDate(existing, today)) {
        console.log('⏭️  ACJU is already showing next month; keeping current data');
        return;
      }
      console.warn('⚠️  ACJU is showing a future month and stored data does not cover today');
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
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
})();
