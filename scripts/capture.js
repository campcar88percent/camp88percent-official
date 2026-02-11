const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

async function capture() {
  const outDir = path.resolve(__dirname, '..', 'screenshots');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();

  // Desktop
  const contextDesktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageDesktop = await contextDesktop.newPage();
  await pageDesktop.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  try { await pageDesktop.waitForSelector('#map', { timeout: 10000 }); } catch(e) {}
  try { await pageDesktop.waitForSelector('.leaflet-marker-icon', { timeout: 8000 }); } catch(e) {}
  await pageDesktop.screenshot({ path: path.join(outDir, 'desktop.png'), fullPage: true });
  await contextDesktop.close();

  // Mobile (iPhone 12 emulation)
  const iPhone = devices['iPhone 12'];
  const contextMobile = await browser.newContext({ ...iPhone });
  const pageMobile = await contextMobile.newPage();
  await pageMobile.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  try { await pageMobile.waitForSelector('#map', { timeout: 10000 }); } catch(e) {}
  try { await pageMobile.waitForSelector('.leaflet-marker-icon', { timeout: 8000 }); } catch(e) {}
  await pageMobile.screenshot({ path: path.join(outDir, 'mobile.png'), fullPage: true });
  await contextMobile.close();

  await browser.close();
  console.log('Screenshots saved to', outDir);
}

capture().catch(err => {
  console.error(err);
  process.exit(1);
});
