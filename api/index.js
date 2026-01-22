const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

async function fetchHijriDate() {
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

    await page.waitForTimeout(2000); // Wait for dynamic content

    const hijriData = await page.evaluate(() => {
      // Helper: Get current date in Sri Lanka timezone
      function getSLDate() {
        const now = new Date();
        // Convert to Sri Lanka time (UTC+5:30)
        const slTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Colombo' }));
        return slTime;
      }

      // Get Hijri month from h1
      const hijriMonth = document.querySelector('h1')?.innerText?.trim() || 'Unknown';

      // Get today's Gregorian date from h2
      const h2s = document.querySelectorAll('h2');
      let todayHeading = 'Unknown';
      for (const h2 of h2s) {
        if (h2.textContent.includes('Today:')) {
          todayHeading = h2.textContent.trim();
          break;
        }
      }
      const gregorianMatch = todayHeading.match(/Today:\s*(.+)/);
      const gregorianDate = gregorianMatch ? gregorianMatch[1] : todayHeading;

      // Extract Hijri day from the today's element
      const todayElement = document.querySelector('#today');
      let hijriDay = 'Unknown';
      if (todayElement) {
        const hijriDateElement = todayElement.querySelector('.hijri-date');
        if (hijriDateElement) {
          hijriDay = hijriDateElement.textContent.trim();
        }
      }

      console.log('Extracted Hijri Day:', hijriDay);
      // Fallback: Calculate from month start if scraping fails
      if (hijriDay === 'Unknown') {
        // Define Hijri month start dates
        // These are approximate and should be updated based on moon sighting
        const monthStarts = {
          'Rajab': new Date(2025, 11, 23), // Dec 23, 2025
          "Sha'ban": new Date(2026, 0, 21), // Jan 21, 2026 (since Jan 22 is day 2)
          'Sha\'baan': new Date(2026, 0, 21), // Jan 21, 2026
          'Shabaan': new Date(2026, 0, 21), // Alternative spelling
          'Ramadaan': new Date(2026, 1, 20), // Feb 20, 2026
          'Ramadan': new Date(2026, 1, 20), // Alternative spelling
          'Shawwaal': new Date(2026, 2, 22), // Mar 22, 2026
          'Shawwal': new Date(2026, 2, 22), // Alternative spelling
          'Dhul Qa\'dah': new Date(2026, 3, 21), // Apr 21, 2026
          'Dhul Qadah': new Date(2026, 3, 21), // Alternative spelling
          'Dhul Hijjah': new Date(2026, 4, 20), // May 20, 2026
          'Muharram': new Date(2026, 5, 19), // Jun 19, 2026
          'Safar': new Date(2026, 6, 18), // Jul 18, 2026
          'Rabi\'ul Awwal': new Date(2026, 7, 17), // Aug 17, 2026
          'Rabeeul Awwal': new Date(2026, 7, 17), // Alternative spelling
          'Rabee`unith Thaani': new Date(2026, 8, 15), // Sep 15, 2026
          'Jumaadal Oola': new Date(2026, 9, 15), // Oct 15, 2026
          'Jumaadal Aakhirah': new Date(2026, 10, 13), // Nov 13, 2026
        };

        // Normalize month name for lookup
        let cleanMonth = hijriMonth.replace(/ \d{4}/g, '').trim();
        // Map alternative spellings to canonical keys
        const monthAliases = {
          "Sha'ban": "Sha'ban",
          "Sha'baan": "Sha'baan",
          "Shabaan": "Shabaan"
        };
        if (monthAliases[cleanMonth]) {
          cleanMonth = monthAliases[cleanMonth];
        }
        const monthStart = monthStarts[cleanMonth];

        if (monthStart) {
          const now = getSLDate();
          const diffDays = Math.floor((now - monthStart) / (1000 * 60 * 60 * 24)) + 1;
          hijriDay = diffDays > 0 ? diffDays.toString() : '1';
        }
      }

      // Format current SL date for display
      const slNow = getSLDate();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const fullMonthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const formattedSLDate = `${dayNames[slNow.getDay()]}, ${fullMonthNames[slNow.getMonth()]} ${slNow.getDate()}, ${slNow.getFullYear()}`;

      // If hijriDay is 'Unknown', set it to empty string
      if (hijriDay === 'Unknown') {
        hijriDay = '';
      }

      return {
        hijriDay: hijriDay,
        hijriMonth: hijriMonth.replace(' 1447', '').replace(' 1446', '').replace('1447', '').replace('1446', '').trim(),
        gregorianDate: formattedSLDate,
        fetchedAt: new Date().toISOString(),
      };
    });

    await browser.close();

    // Save to JSON file
    const apiPath = path.join(__dirname, 'hijri.json');
    fs.writeFileSync(apiPath, JSON.stringify(hijriData, null, 2));

    console.log('✅ Hijri date updated:', hijriData);
    return hijriData;
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

fetchHijriDate();