// End-to-end smoke test in headless Chromium at iPhone size.
// Usage: npm run build && npx vite preview --port 4173 &  then  node scripts/smoke.mjs
// Fails (exit 1) on any page error or failed step. Screenshots go to ./smoke-shots/.
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const SHOTS = 'smoke-shots';
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
page.on('dialog', (d) => d.accept());

let n = 0;
const shot = (name) => page.screenshot({ path: `${SHOTS}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: true });
const step = async (name, fn) => {
  try { await fn(); console.log('✓', name); } catch (e) { console.log('✗', name, '\n   ', e.message.split('\n')[0]); errors.push(`${name}: ${e.message.split('\n')[0]}`); await shot(`FAIL-${name.replace(/\W+/g, '_')}`); }
};

await page.goto(BASE);

await step('setup screen', async () => {
  await page.getByText('Quick setup').waitFor();
  const inputs = page.locator('input[inputmode="decimal"]');
  await inputs.nth(0).fill('90');          // bodyweight
  await inputs.nth(1).fill('140');         // squat
  await inputs.nth(2).fill('100');         // bench
  await inputs.nth(3).fill('60');          // ohp
  await inputs.nth(4).fill('180');         // deadlift
  await page.getByText('Cut: 2340').waitFor();
  await shot('setup');
  await page.getByRole('button', { name: 'Start my program' }).click();
});

await step('today shows Week 1 Upper A with target load', async () => {
  await page.getByText('Week 1 of 20').waitFor();
  await page.getByRole('heading', { name: 'Upper A' }).waitFor();
  await page.getByText('75 kg', { exact: true }).first().waitFor();
  await shot('today');
});

await step('tick a set starts rest timer and saves session', async () => {
  await page.getByRole('button', { name: 'Set 1 done' }).first().click();
  await page.locator('.timer').waitFor();
  await page.getByText(/in progress · 1\//).waitFor();
  await shot('timer');
});

await step('swap remembers substitution', async () => {
  await page.getByRole('button', { name: '⇄ Substitutions' }).nth(1).click();
  await page.getByRole('button', { name: 'Wide-grip pull-up' }).click();
  await page.getByRole('heading', { name: 'Wide-grip pull-up' }).waitFor();
});

await step('finish workout → next is Lower A', async () => {
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByRole('heading', { name: 'Lower A' }).waitFor();
});

await step('food: search koshary (variant spelling) and log a plate', async () => {
  await page.goto(BASE + '#/food');
  await page.getByRole('button', { name: '+ Add' }).nth(1).click(); // lunch
  await page.locator('input[type="search"]').fill('koshari');
  await page.getByText('Koshary').first().click();
  await page.getByRole('button', { name: /medium plate/ }).click();
  await shot('log-modal');
  await page.getByRole('button', { name: 'Add to log' }).click();
  await page.getByRole('link', { name: 'Done' }).click();
  await page.getByText('765').first().waitFor(); // 450 g × 170 kcal/100 g
  await shot('food-day');
});

await step('arabic search', async () => {
  await page.goto(BASE + '#/food/search?meal=breakfast');
  await page.locator('input[type="search"]').fill('طعميه');
  await page.getByText("Ta'meya (Egyptian falafel)").first().waitFor();
  await shot('arabic-search');
});

await step('recipe builder', async () => {
  await page.goto(BASE + '#/food/recipe');
  await page.getByPlaceholder("e.g. Mum's koshary").fill('Test lentil rice');
  await page.locator('input[type="search"]').fill('lentils');
  await page.getByText('Lentils (cooked)').first().click();
  await page.locator('input[type="search"]').fill('rice');
  await page.getByText('White rice (cooked, Egyptian style)').first().click();
  await page.getByText(/Per 100 g:/).waitFor();
  await shot('recipe');
  await page.getByRole('button', { name: 'Save recipe' }).click();
});

for (const [name, path] of [['calendar', '#/calendar'], ['progress', '#/progress'], ['cardio', '#/cardio'], ['body', '#/body'], ['backup', '#/backup'], ['settings', '#/settings'], ['more', '#/more']]) {
  await step(`open ${name}`, async () => {
    await page.goto(BASE + path);
    await page.waitForTimeout(400);
    await shot(name);
  });
}

await step('log weight, steps and cardio', async () => {
  await page.goto(BASE + '#/body');
  await page.locator('input[inputmode="decimal"]').first().fill('89.4');
  await page.getByRole('button', { name: '✓' }).first().click();
  await page.goto(BASE + '#/cardio');
  await page.locator('input[inputmode="numeric"]').first().fill('9100');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Intervals' }).click();
  await page.getByText(/Intervals the day before a Lower day/).waitFor();
  await page.getByRole('button', { name: 'Incline walk' }).click();
  await page.getByRole('button', { name: 'Add session' }).click();
  await page.getByText(/1<\/b> \/ 2 sessions|LISS/).first().waitFor();
  await shot('cardio-logged');
});

await step('calendar shows ticks and day detail opens', async () => {
  await page.goto(BASE + '#/calendar');
  await page.locator('.cal .day.today .dot.on').first().waitFor();
  await page.locator('.cal .day.today').click();
  await page.getByRole('heading', { name: 'Workout' }).waitFor();
  await shot('day-detail');
});

await step('progress charts render', async () => {
  await page.goto(BASE + '#/progress');
  await page.locator('canvas').first().waitFor();
  await page.waitForTimeout(500);
  await shot('progress-charts');
});

await step('export backup downloads JSON', async () => {
  await page.goto(BASE + '#/backup');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export backup/ }).click()]);
  const path = await dl.path();
  const { readFileSync } = await import('node:fs');
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (data.app !== 'cut-tracker' || !data.tables.sessions.length) throw new Error('bad backup content');
  await page.getByText('Last backup').locator('..').getByText('today').waitFor();
});

if (process.env.SYNC_URL) {
  await step('sync with laptop server', async () => {
    await page.goto(BASE + '#/backup');
    await page.locator('input[type="url"]').fill(process.env.SYNC_URL);
    await page.locator('input[autocomplete="off"]').last().fill(process.env.SYNC_TOKEN ?? '');
    await page.getByRole('button', { name: /Save & sync now/ }).click();
    await page.getByText(/Synced: sent \d+/).waitFor();
    await shot('synced');
  });
}

await step('no horizontal scroll at 390px', async () => {
  for (const path of ['#/today', '#/food', '#/calendar', '#/progress']) {
    await page.goto(BASE + path);
    await page.waitForTimeout(300);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 1) throw new Error(`${path} overflows by ${over}px`);
  }
});

await browser.close();
if (errors.length) { console.log('\nERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('\nAll smoke steps passed.');
