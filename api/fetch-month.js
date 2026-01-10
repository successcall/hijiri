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
      // Get month and year
      const h1Text = document.querySelector('h1')?.innerText?.trim() || 'Unknown';
      const hijriMonth = h1Text.replace(/ \d{4}/g, '').trim();
      
      // Get today's date
      const h2s = document.querySelectorAll('h2');
      let todayHeading = 'Unknown';
      for (const h2 of h2s) {
        if (h2.textContent.includes('Today:')) {
          todayHeading = h2.textContent.trim();
          break;
        }
      }
      const gregorianMatch = todayHeading.match(/Today:\s*(.+)/);
      const currentDate = gregorianMatch ? gregorianMatch[1] : todayHeading;

      // Hijri month information with approximate days
      const monthInfo = {
        'Muharram': 29,
        'Safar': 30,
        'Rabi\'ul Awwal': 30,
        'Rabeeul Awwal': 30,
        'Rabee`unith Thaani': 29,
        'Jumaadal Oola': 30,
        'Jumaadal Aakhirah': 29,
        'Rajab': 30,
        'Sha\'baan': 30,
        'Shabaan': 30,
        'Ramadaan': 30,
        'Ramadan': 30,
        'Shawwaal': 29,
        'Shawwal': 29,
        'Dhul Qa\'dah': 30,
        'Dhul Qadah': 30,
        'Dhul Hijjah': 29
      };

      const totalDays = monthInfo[hijriMonth] || 30;

      return {
        hijriMonth: hijriMonth,
        hijriYear: h1Text.match(/\d{4}/) ? h1Text.match(/\d{4}/)[0] : '1447',
        currentDate: currentDate,
        totalDays: totalDays,
        monthNameArabic: getArabicName(hijriMonth),
        fetchedAt: new Date().toISOString(),
      };

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
