// Visual spot-check of the confirmed failures (stage 4c), screenshots into spotcheck/.
const { chromium } = require('playwright');
const OUT = __dirname + '/spotcheck/';
const M = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
async function open(b, storage = {}, route) {
  const c = await b.newContext(M);
  await c.addInitScript((s) => { if (sessionStorage.getItem('x')) return; sessionStorage.setItem('x', '1'); localStorage.setItem('app_last_seen_version', 'v2.15.0'); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, storage);
  const p = await c.newPage(); if (route) await route(p);
  await p.goto('http://127.0.0.1:3000/'); await p.getByPlaceholder('Type or tap the paste icon to enter text...').waitFor({ timeout: 20000 }); await p.waitForTimeout(1200);
  return { c, p };
}
(async () => {
  const b = await chromium.launch();
  // 1. Summary after full translation returns the cached full translation
  let { c, p } = await open(b);
  await p.getByPlaceholder('Type or tap the paste icon to enter text...').fill('shift report');
  const btn = p.getByRole('main').getByRole('button', { name: 'Translate', exact: true });
  await btn.click(); await p.getByText('TR|FULL|shift report').filter({ visible: true }).waitFor(); await p.waitForTimeout(600);
  await p.getByRole('switch', { name: 'Summary Mode' }).click(); await btn.click(); await p.waitForTimeout(1500);
  await p.screenshot({ path: OUT + '1-summary-cached.png' }); console.log('1 output:', (await p.getByText(/TR\|/).filter({ visible: true }).allInnerTexts()).join(' / '), '| toast cache:', await p.getByText('Instant translation from cache').isVisible().catch(() => false)); await c.close();
  // 2. Compose: change format, same request -> cached reply, no new request
  ({ c, p } = await open(b)); let n = 0; p.on('request', (r) => { if (r.url().includes('/api/compose')) n++; });
  await p.locator('nav').getByRole('button', { name: 'Smart Compose' }).click(); await p.waitForTimeout(500);
  await p.getByPlaceholder(/Enter what you want/).fill('format test'); await p.getByRole('button', { name: 'Generate Reply' }).click(); await p.getByText('CMP|').filter({ visible: true }).waitFor();
  const custom = p.getByRole('button', { name: 'Tùy chỉnh (Custom)' }); const bb = await custom.boundingBox(); await p.mouse.move(bb.x + 5, bb.y + 5); await p.mouse.down(); await p.waitForTimeout(650); await p.mouse.up();
  const modal = p.locator('.fixed.inset-0.z-50'); await modal.locator('select').nth(3).selectOption('formal_email'); await modal.getByRole('button').last().click(); await p.waitForTimeout(400);
  await p.getByRole('button', { name: 'Generate Reply' }).click(); await p.waitForTimeout(2000);
  await p.screenshot({ path: OUT + '2-compose-cached.png' }); console.log('2 compose requests after format change:', n); await c.close();
  // 3. Vocab tab opened before sync finishes stays at 0 terms
  ({ c, p } = await open(b, {}, (pg) => pg.route('**/api/import-vocab', async (r) => { await new Promise((s) => setTimeout(s, 5000)); r.continue(); })));
  await p.locator('nav').getByRole('button', { name: 'Vocabulary' }).click(); await p.waitForTimeout(6500);
  await p.screenshot({ path: OUT + '3-vocab-stale.png' }); console.log('3 vocab text:', (await p.getByRole('main').innerText()).replace(/\s+/g, ' ').slice(0, 120), '| in storage:', (await p.evaluate(() => JSON.parse(localStorage.getItem('sra_vocab') || '[]').length))); await c.close();
  // 4. Corrupt history -> white screen
  ({ c, p } = await open(b, { smart_reply_history: '{bad' })); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.locator('nav').getByRole('button', { name: 'History' }).click(); await p.waitForTimeout(1500);
  await p.screenshot({ path: OUT + '4-history-crash.png' }); console.log('4 body text length:', (await p.locator('body').innerText()).length, errs); await c.close();
  // 5. Passing core flow for comparison
  ({ c, p } = await open(b)); await p.getByPlaceholder('Type or tap the paste icon to enter text...').fill('Kiểm tra máy may'); await p.getByRole('main').getByRole('button', { name: 'Translate', exact: true }).click();
  await p.getByText('TR|FULL|Kiểm tra máy may').filter({ visible: true }).waitFor(); await p.screenshot({ path: OUT + '5-translate-ok.png' }); console.log('5 ok'); await c.close();
  await b.close();
})();
