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
      const hijriMonth = document.querySelector('h1')?.innerText?.trim() || 'Unknown';
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
      
      // Calculate approximate Hijri day based on month start
      // Rajab 1447 started around Dec 23, 2025
      const now = new Date();
      const rajabStart = new Date(2025, 11, 23); // Dec 23, 2025
      const diffDays = Math.floor((now - rajabStart) / (1000 * 60 * 60 * 24)) + 1;
      const hijriDay = diffDays.toString();

      return {
        hijriDay: hijriDay,
        hijriMonth: hijriMonth.replace(' 1447', '').replace('1447', ''), // Remove year
        gregorianDate: gregorianDate,
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