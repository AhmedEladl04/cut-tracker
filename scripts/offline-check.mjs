// Verifies the installed app works with no network: load once (service worker caches
// everything), go offline, reload, and use the app.  Usage: node scripts/offline-check.mjs <url>
import { chromium, devices } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4174/cut-tracker/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload(); // now controlled by the service worker
await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
await ctx.setOffline(true);
await page.reload();
await page.getByText('Quick setup').waitFor({ timeout: 10000 });
const inputs = page.locator('input[inputmode="decimal"]');
for (const [i, v] of ['90', '140', '100', '60', '180'].entries()) await inputs.nth(i).fill(v);
await page.getByRole('button', { name: 'Start my program' }).click();
await page.getByText('Week 1 of 20').waitFor();
await page.goto(url + '#/food/search?meal=lunch');
await page.locator('input[type="search"]').fill('كشري');
await page.getByText('Koshary').first().waitFor();
console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : 'Offline check passed: app loads, sets up and searches foods with no network.');
await browser.close();
process.exit(errors.length ? 1 : 0);
