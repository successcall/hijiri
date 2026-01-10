const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

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
      // Get month and year from the specific ID
      const h1Text = document.getElementById('hijri-month-name')?.innerText?.trim() || 'Unknown';
      const hijriMonth = h1Text.replace(/ \d{4}/g, '').trim();
      const yearMatch = h1Text.match(/\d{4}/);
      const hijriYear = yearMatch ? yearMatch[0] : '1447';
      
      // Get today's date from the specific ID
      const todayHeading = document.getElementById('gregorian-month-name')?.innerText?.trim() || 'Unknown';
      const gregorianMatch = todayHeading.match(/Today:\s*(.+)/);
      const currentDate = gregorianMatch ? gregorianMatch[1] : todayHeading;

      // Try to determine actual month length from the calendar
      const bodyText = document.body.textContent || '';
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];
      
      // Check if calendar has day 30 or stops at day 29
      const has30 = /\b30(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\d{1,2}\b/i.test(bodyText);
      const totalDays = has30 ? 30 : 29;
      
      // Find current Hijri day to calculate start date
      const today = new Date();
      const monthAbbr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const todayMonth = monthAbbr[today.getMonth()];
      const todayDay = today.getDate();
      const searchPattern = `${todayMonth}${todayDay}`;
      
      let currentHijriDay = 1;
      const hijriDayMatch = bodyText.match(new RegExp(`(\\d{1,2})${searchPattern}`, 'i'));
      if (hijriDayMatch) {
        currentHijriDay = parseInt(hijriDayMatch[1]);
      }
      
      // Calculate the start date of the current Hijri month
      const monthStartDate = new Date(today);
      monthStartDate.setDate(today.getDate() - (currentHijriDay - 1));

      // Generate all dates for the month based on actual length (29 or 30)
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
        totalDays: dates.length,
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

fetchHijriMonth();
