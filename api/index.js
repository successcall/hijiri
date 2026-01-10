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

    const hijriData = await page.evaluate(() => {
      const hijriMonth = 
        document.getElementById('hijri-month-name')?.innerText || 'Unknown';
      const todayDiv = document.getElementById('today');
      const hijriDay = 
        todayDiv?.querySelector('generic')?.innerText || 'Unknown';
      const gregorianDate = 
        document.getElementById('gregorian-month-name')?.innerText || 'Unknown';

      return {
        hijriDay: hijriDay.trim(),
        hijriMonth: hijriMonth.trim(),
        gregorianDate: gregorianDate.trim(),
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