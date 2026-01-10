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

    await page.waitForTimeout(2000);

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

      // Extract calendar dates - if calendar extraction fails, use calculation
      const dates = [];
      
      // Month start dates and total days (based on ACJU calendar)
      const monthInfo = {
        'Rajab': { start: new Date(2025, 11, 23), days: 30 },
        'Sha\'baan': { start: new Date(2026, 0, 22), days: 30 },
        'Shabaan': { start: new Date(2026, 0, 22), days: 30 },
        'Ramadaan': { start: new Date(2026, 1, 20), days: 30 },
        'Ramadan': { start: new Date(2026, 1, 20), days: 30 },
        'Shawwaal': { start: new Date(2026, 2, 22), days: 29 },
        'Shawwal': { start: new Date(2026, 2, 22), days: 29 },
        'Dhul Qa\'dah': { start: new Date(2026, 3, 21), days: 30 },
        'Dhul Qadah': { start: new Date(2026, 3, 21), days: 30 },
        'Dhul Hijjah': { start: new Date(2026, 4, 20), days: 29 },
        'Muharram': { start: new Date(2026, 5, 19), days: 30 },
        'Safar': { start: new Date(2026, 6, 18), days: 30 },
        'Rabi\'ul Awwal': { start: new Date(2026, 7, 17), days: 30 },
        'Rabeeul Awwal': { start: new Date(2026, 7, 17), days: 30 },
        'Rabee`unith Thaani': { start: new Date(2026, 8, 15), days: 29 },
        'Jumaadal Oola': { start: new Date(2026, 9, 15), days: 30 },
        'Jumaadal Aakhirah': { start: new Date(2026, 10, 13), days: 29 },
      };
      
      const info = monthInfo[hijriMonth] || { start: new Date(), days: 29 };
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];
      
      // Generate all dates for the month
      for (let day = 1; day <= info.days; day++) {
        const gregorianDate = new Date(info.start);
        gregorianDate.setDate(info.start.getDate() + (day - 1));
        
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
          'Muharram': 'المحرم',
          'Safar': 'صفر',
          'Rabi\'ul Awwal': 'ربيع الأول',
          'Rabeeul Awwal': 'ربيع الأول',
          'Rabee`unith Thaani': 'ربيع الثاني',
          'Jumaadal Oola': 'جمادى الأولى',
          'Jumaadal Aakhirah': 'جمادى الآخرة',
          'Rajab': 'رجب',
          'Sha\'baan': 'شعبان',
          'Shabaan': 'شعبان',
          'Ramadaan': 'رمضان',
          'Ramadan': 'رمضان',
          'Shawwaal': 'شوال',
          'Shawwal': 'شوال',
          'Dhul Qa\'dah': 'ذو القعدة',
          'Dhul Qadah': 'ذو القعدة',
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
