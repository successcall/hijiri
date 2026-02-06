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
      
      // Check if calendar has day 30
      const bodyText = document.body.textContent || '';
      const has30 = /\b30(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\d{1,2}\b/i.test(bodyText);
      totalDays = has30 ? 30 : 29;
      
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

      // Try to determine actual month length from the calendar
      const bodyText = document.body.textContent || '';
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];
      
      // Check if calendar has day 30 or stops at day 29
      const has30 = /\b30(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\d{1,2}\b/i.test(bodyText);
      const has29 = /\b29(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\d{1,2}\b/i.test(bodyText);
      
      // Determine total days based on what's shown on the ACJU calendar
      let totalDays = 29; // Default
      if (has30) {
        totalDays = 30;
      } else if (has29) {
        totalDays = 29;
      }
      
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
    
    // Get current Hijri day and month
    const { hijriDay, totalDays, hijriMonth } = await getCurrentHijriDay();
    
    // Check if we should fetch
    const shouldFetchNow = await shouldFetch(hijriDay, totalDays, hijriMonth);
    
    if (shouldFetchNow) {
      console.log('📅 Fetching Hijri month calendar...');
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
