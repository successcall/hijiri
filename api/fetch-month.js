const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

// Helper: Get current date in Sri Lanka timezone
function getSLDate() {
  const now = new Date();
  const slTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Colombo' }));
  return slTime;
}

// Fetch today's Maghrib time for Colombo from aladhan.com
async function getMaghribSL() {
  try {
    const res = await fetch(
      'https://api.aladhan.com/v1/timingsByCity?city=Colombo&country=Sri+Lanka&method=1'
    );
    const json = await res.json();
    const t = json.data?.timings?.Maghrib || '18:10';
    console.log(`Maghrib time (Colombo): ${t}`);
    return t;
  } catch (e) {
    console.warn('Could not fetch Maghrib time, using fallback 18:10');
    return '18:10';
  }
}

// Returns true if SL local time has passed the given HH:MM string
function isPastMaghrib(maghribStr) {
  const [h, m] = maghribStr.split(':').map(Number);
  const sl = getSLDate();
  return (sl.getHours() * 60 + sl.getMinutes()) >= (h * 60 + m);
}

// Hijri month sequence using ACJU transliterations
const HIJRI_MONTH_SEQUENCE = [
  "Muharram", "Safar", "Rabi'ul Awwal", "Rabi'uth-Thani",
  "Jumaadal Oola", "Jumaadal Aakhirah", "Rajab", "Sha'baan",
  "Ramadaan", "Shawwaal", "Dhu al-Qi'dah", "Dhul Hijjah"
];

function getNextHijriMonth(monthName, yearStr) {
  const idx = HIJRI_MONTH_SEQUENCE.indexOf(monthName);
  const nextIdx = idx === -1 ? 0 : (idx + 1) % 12;
  const nextYear = (idx === HIJRI_MONTH_SEQUENCE.length - 1)
    ? String(parseInt(yearStr) + 1)
    : yearStr;
  return { month: HIJRI_MONTH_SEQUENCE[nextIdx], year: nextYear };
}

// Generate next month data locally (ACJU still shows old month after Maghrib)
function generateNextMonthData(existingData) {
  const sl = getSLDate();
  const tomorrow = new Date(sl);
  tomorrow.setDate(sl.getDate() + 1);

  const { month: nextMonth, year: nextYear } = getNextHijriMonth(
    existingData.hijriMonth, existingData.hijriYear
  );

  const monthNames = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
  const dayNames   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  const totalDays = 29; // provisional; ACJU confirms 29 or 30 next morning
  const dates = [];
  for (let day = 1; day <= totalDays; day++) {
    const d = new Date(tomorrow);
    d.setDate(tomorrow.getDate() + (day - 1));
    dates.push({
      hijriDay: day,
      gregorianDate:  `${monthNames[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`,
      gregorianMonth: monthNames[d.getMonth()],
      gregorianDay:   d.getDate(),
      gregorianYear:  d.getFullYear()
    });
  }

  return {
    hijriMonth:      nextMonth,
    hijriYear:       nextYear,
    monthNameArabic: nextMonth,
    currentDate:     `${dayNames[tomorrow.getDay()]}, ${monthNames[tomorrow.getMonth()]} ${tomorrow.getDate()}, ${tomorrow.getFullYear()}`,
    currentHijriDay: 1,
    totalDays:       totalDays,
    provisional:     true,       // will be replaced by confirmed ACJU fetch
    previousMonth:   existingData.hijriMonth, // old month — used to detect ACJU update
    dates:           dates,
    fetchedAt:       new Date().toISOString()
  };
}

// Check if we should fetch based on Hijri calendar schedule
async function shouldFetch(currentHijriDay, totalDaysInMonth, currentMonthName) {
  const slNow = getSLDate();
  const hour = slNow.getHours();
  const minute = slNow.getMinutes();
  
  console.log(`Current Hijri Day: ${currentHijriDay}, Month: ${currentMonthName}, Total Days: ${totalDaysInMonth}, SL Time: ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  
  // Read existing data to check if we already fetched for this month
  const apiPath = path.join(__dirname, 'hijri-month.json');
  let existingData = null;
  try {
    if (fs.existsSync(apiPath)) {
      existingData = JSON.parse(fs.readFileSync(apiPath, 'utf8'));
    }
  } catch (e) {
    console.log('No existing data or error reading:', e.message);
  }
  
  // Initial condition: If no file exists, fetch immediately
  if (!existingData) {
    console.log('✅ No existing data file - fetching initial data');
    return true;
  }
  
  const storedMonth = existingData.hijriMonth;
  const storedDay = existingData.currentHijriDay;
  const fetchedAt = existingData.fetchedAt ? new Date(existingData.fetchedAt) : null;
  const hoursSinceFetch = fetchedAt ? (new Date() - fetchedAt) / (1000 * 60 * 60) : 999;
  
  console.log(`Stored data: ${storedMonth} day ${storedDay}, fetched ${hoursSinceFetch.toFixed(1)}h ago`);
  
  // If we're in the middle of the month (days 2-28), skip
  if (storedMonth === currentMonthName && currentHijriDay >= 2 && currentHijriDay <= 28) {
    console.log('⏭️  Middle of month (days 2-28) - no fetch needed');
    return false;
  }
  
  // Month transition detection - fetch when new month appears
  if (storedMonth !== currentMonthName) {
    console.log(`✅ New month detected (stored: ${storedMonth}, current: ${currentMonthName}) - fetching`);
    return true;
  }
  
  // On days 29, 30, or 1 of SAME month - check for new month data
  if (currentHijriDay === 29 || currentHijriDay === 30 || currentHijriDay === 1) {
    // Prevent duplicate fetches within 20 hours
    if (hoursSinceFetch < 20) {
      console.log(`⏭️  Transition period day ${currentHijriDay}, but fetched ${hoursSinceFetch.toFixed(1)}h ago - waiting`);
      return false;
    }

    console.log(`✅ Transition period - day ${currentHijriDay}, checking for month update (last fetch ${hoursSinceFetch.toFixed(1)}h ago)`);
    return true;
  }
  
  console.log('⏭️  No fetch condition met');
  return false;
}

async function getCurrentHijriDay() {
  // Quick check to get current Hijri day without full scrape
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);
    
    await page.goto('https://www.acju.lk/calenders-en/', {
      waitUntil: 'networkidle2',
    });
    
    await page.waitForTimeout(2000);
    
    const hijriInfo = await page.evaluate(() => {
      const todayElement = document.querySelector('#today');
      let hijriDay = 1;
      let totalDays = 29;
      
      // Get month name
      const h1Text = document.getElementById('hijri-month-name')?.innerText?.trim() || 
                     document.querySelector('h1')?.innerText?.trim() || 'Unknown';
      const hijriMonth = h1Text.replace(/ \d{4}/g, '').trim();
      
      if (todayElement) {
        const hijriDateElement = todayElement.querySelector('.hijri-date');
        if (hijriDateElement) {
          hijriDay = parseInt(hijriDateElement.textContent.trim()) || 1;
        }
      }
      
      // Count actual day elements in the calendar to determine month length
      const dayElements = document.querySelectorAll('#days .day');
      // Hijri months are always 29 or 30 days — clamp to avoid stray DOM elements
      const rawCount = dayElements.length;
      totalDays = rawCount >= 30 ? 30 : 29;
      
      return { hijriDay, totalDays, hijriMonth };
    });
    
    await browser.close();
    return hijriInfo;
  } catch (error) {
    console.error('Error getting current Hijri day:', error);
    if (browser) await browser.close();
    return { hijriDay: 1, totalDays: 29, hijriMonth: 'Unknown' };
  }
}

async function fetchHijriMonth() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);

    await page.goto('https://www.acju.lk/calenders-en/', {
      waitUntil: 'networkidle2',
    });

    // Wait for calendar to load
    await page.waitForSelector('#calendar', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000); // Extra wait for dynamic content

    const monthData = await page.evaluate(() => {
      // Helper: Get current date in Sri Lanka timezone
      function getSLDate() {
        const now = new Date();
        // Convert to Sri Lanka time (UTC+5:30)
        const slTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Colombo' }));
        return slTime;
      }

      // Get month and year from the specific ID
      const h1Text = document.getElementById('hijri-month-name')?.innerText?.trim() || 'Unknown';
      const hijriMonth = h1Text.replace(/ \d{4}/g, '').trim();
      const yearMatch = h1Text.match(/\d{4}/);
      const hijriYear = yearMatch ? yearMatch[0] : '1447';
      
      // Get today's date from the specific ID (use SL time)
      const slNow = getSLDate();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const fullMonthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const currentDate = `${dayNames[slNow.getDay()]}, ${fullMonthNames[slNow.getMonth()]} ${slNow.getDate()}, ${slNow.getFullYear()}`;

      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];
      
      // Count actual day elements in the calendar to determine month length
      // (regex on bodyText is unreliable because hijri day number and gregorian month
      //  are in separate DOM elements and never appear concatenated in text)
      const dayElements = document.querySelectorAll('#days .day');
      // Hijri months are always 29 or 30 days — clamp to avoid stray DOM elements
      const rawCount = dayElements.length;
      let totalDays = rawCount >= 30 ? 30 : 29;
      
      // Find current Hijri day - try from page first, fallback to calculation
      const today = getSLDate();
      let currentHijriDay = 1;
      const todayElement = document.querySelector('#today');
      if (todayElement) {
        const hijriDateElement = todayElement.querySelector('.hijri-date');
        if (hijriDateElement) {
          currentHijriDay = parseInt(hijriDateElement.textContent.trim());
        }
      } else {
        // Fallback: Calculate based on known month start dates
        const monthStartDates = {
          'Rajab': new Date(2025, 11, 23), // Dec 23, 2025
          'Sha\'baan': new Date(2026, 0, 21), // Updated: Jan 21, 2026 (since Jan 22 is day 2)
          'Shabaan': new Date(2026, 0, 21),
          'Ramadaan': new Date(2026, 1, 20),
          'Ramadan': new Date(2026, 1, 20),
        };
        const startDate = monthStartDates[hijriMonth];
        if (startDate) {
          const diffDays = Math.floor((today - startDate) / (1000 * 60 * 60 * 24)) + 1;
          currentHijriDay = diffDays > 0 ? diffDays : 1;
        }
      }
      
      // Calculate the start date of the current Hijri month
      const monthStartDate = new Date(today);
      monthStartDate.setDate(today.getDate() - (currentHijriDay - 1));

      // Generate dates from day 1 to totalDays (29 or 30 based on ACJU calendar)
      const dates = [];
      for (let day = 1; day <= totalDays; day++) {
        const gregorianDate = new Date(monthStartDate);
        gregorianDate.setDate(monthStartDate.getDate() + (day - 1));
        
        const gMonth = monthNames[gregorianDate.getMonth()];
        const gDay = gregorianDate.getDate();
        const gYear = gregorianDate.getFullYear();
        
        dates.push({
          hijriDay: day,
          gregorianDate: `${gMonth} ${gDay}, ${gYear}`,
          gregorianMonth: gMonth,
          gregorianDay: gDay,
          gregorianYear: gYear
        });
      }
      
      // Sort by Hijri day
      dates.sort((a, b) => a.hijriDay - b.hijriDay);

      function getArabicName(month) {
        const arabicNames = {
          'Muharram': 'المحرم', 'Safar': 'صفر', 'Rabi\'ul Awwal': 'ربيع الأول',
          'Rabeeul Awwal': 'ربيع الأول', 'Rabee`unith Thaani': 'ربيع الثاني',
          'Jumaadal Oola': 'جمادى الأولى', 'Jumaadal Aakhirah': 'جمادى الآخرة',
          'Rajab': 'رجب', 'Sha\'baan': 'شعبان', 'Shabaan': 'شعبان',
          'Ramadaan': 'رمضان', 'Ramadan': 'رمضان', 'Shawwaal': 'شوال',
          'Shawwal': 'شوال', 'Dhul Qa\'dah': 'ذو القعدة', 'Dhul Qadah': 'ذو القعدة',
          'Dhul Hijjah': 'ذو الحجة'
        };
        return arabicNames[month] || month;
      }

      return {
        hijriMonth: hijriMonth,
        hijriYear: hijriYear,
        monthNameArabic: getArabicName(hijriMonth),
        currentDate: currentDate,
        currentHijriDay: currentHijriDay,
        totalDays: totalDays,
        dates: dates,
        fetchedAt: new Date().toISOString(),
      };
    });

    await browser.close();

    // Save to JSON file
    const apiPath = path.join(__dirname, 'hijri-month.json');
    fs.writeFileSync(apiPath, JSON.stringify(monthData, null, 2));

    console.log('✅ Hijri month calendar updated:', {
      month: monthData.hijriMonth,
      year: monthData.hijriYear,
      totalDays: monthData.totalDays,
      fetchedAt: monthData.fetchedAt
    });
    return monthData;
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

// Main execution with scheduling logic
(async () => {
  try {
    console.log('🌙 Checking if fetch is needed...');

    const apiPath = path.join(__dirname, 'hijri-month.json');

    // ── Read existing stored data ─────────────────────────────────────────────
    let existingData = null;
    try {
      if (fs.existsSync(apiPath)) existingData = JSON.parse(fs.readFileSync(apiPath, 'utf8'));
    } catch (e) { /* ignore */ }

    if (existingData) {
      const isDay30       = existingData.currentHijriDay === 30 && existingData.totalDays === 30;
      const isProvisional = existingData.provisional === true;

      // ── Case 1: Provisional data already written ──────────────────────────
      // Bypass shouldFetch's 20-hour guard and ask ACJU directly.
      // As soon as ACJU agrees with our provisional month, fetch the full
      // confirmed calendar to replace provisional.
      if (isProvisional) {
        console.log(`🌙 Provisional data for ${existingData.hijriMonth} — checking ACJU for confirmation...`);
        const { hijriMonth: acjuMonth } = await getCurrentHijriDay();
        // Compare against the OLD month name (stored as previousMonth) so that
        // ACJU spelling differences (e.g. 'Dhu al-Hijjah' vs 'Dhul Hijjah')
        // don't falsely block confirmation.
        const oldMonth = existingData.previousMonth || '';
        const acjuMovedOn = oldMonth
          ? acjuMonth !== oldMonth          // ACJU is no longer on old month
          : acjuMonth === existingData.hijriMonth; // fallback: exact match
        if (acjuMovedOn) {
          console.log(`✅ ACJU confirmed new month (${acjuMonth}) — fetching full calendar`);
          await fetchHijriMonth();
        } else {
          console.log(`⏭️  ACJU still on old month (${acjuMonth}), keeping provisional`);
        }
        process.exit(0);
      }

      // ── Case 2: Hijri day 30 (confirmed 30-day month) + past Maghrib ──────
      // Islamic day begins at Maghrib. On day 30 only, once sunset passes the
      // new Hijri month has started. Day 29 is left to normal ACJU fetch logic.
      if (isDay30) {
        const maghrib = await getMaghribSL();
        if (isPastMaghrib(maghrib)) {
          // First: check if ACJU already published the new month
          const { hijriMonth: acjuMonth } = await getCurrentHijriDay();
          if (acjuMonth !== existingData.hijriMonth) {
            console.log(`✅ ACJU already shows new month: ${acjuMonth} — fetching full calendar`);
            await fetchHijriMonth();
            process.exit(0);
          }
          // ACJU still on old month → write provisional; next cron replaces it
          console.log(`🌙 Past Maghrib on day 30/${existingData.totalDays}, ACJU still old — generating provisional`);
          const nextData = generateNextMonthData(existingData);
          fs.writeFileSync(apiPath, JSON.stringify(nextData, null, 2));
          console.log(`✅ Generated: ${nextData.hijriMonth} ${nextData.hijriYear} (provisional — confirmed on next cron)`);
          process.exit(0);
        }
      }
    }

    // ── Normal ACJU fetch logic ───────────────────────────────────────────────
    const { hijriDay, totalDays, hijriMonth } = await getCurrentHijriDay();
    const shouldFetchNow = await shouldFetch(hijriDay, totalDays, hijriMonth);

    if (shouldFetchNow) {
      console.log('📅 Fetching Hijri month calendar from ACJU...');
      await fetchHijriMonth();
    } else {
      console.log('✅ No fetch needed at this time');
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Error in main execution:', error);
    process.exit(1);
  }
})();
