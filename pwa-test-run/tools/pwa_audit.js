#!/usr/bin/env node
/**
 * PWA baseline audit (Playwright, Chromium).
 *
 * Usage: node pwa_audit.js --url http://localhost:8080/ --out pwa-test-run/audit.json
 *
 * Checks: secure context, viewport + theme-color meta, manifest presence and key fields,
 * icons 192/512 reachable, service worker registers and controls the page,
 * offline reload of start_url, uncaught errors / console errors on load.
 * Each check: { id, title, status: pass|fail|warn, detail }.
 */
const fs = require('fs');
const path = require('path');
let playwright;
try { playwright = require('playwright'); } catch (e) {
  try { playwright = require(require.resolve('playwright', { paths: [process.cwd()] })); }
  catch (e2) { console.error('Playwright not found. Install: npm i -D playwright && npx playwright install chromium'); process.exit(2); }
}

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--url') args.url = process.argv[++i];
  else if (process.argv[i] === '--out') args.out = process.argv[++i];
}
if (!args.url) { console.error('Required: --url <app url>'); process.exit(2); }
args.out = args.out || 'audit.json';

const checks = [];
const add = (id, title, status, detail) => checks.push({ id, title, status, detail: detail || '' });

(async () => {
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [], consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  let loaded = true;
  try { await page.goto(args.url, { waitUntil: 'load', timeout: 20000 }); }
  catch (e) { loaded = false; add('load', 'Trang tải được', 'fail', e.message.split('\n')[0]); }
  if (!loaded) return finish(browser);
  add('load', 'Trang tải được', 'pass', args.url);
  await page.waitForTimeout(500);
  const loadPageErrors = pageErrors.slice(), loadConsoleErrors = consoleErrors.slice();

  const u = new URL(page.url());
  const secure = u.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  add('secure-context', 'HTTPS / secure context', secure ? 'pass' : 'fail',
    secure ? u.protocol + '//' + u.host : 'Service Worker chỉ chạy trên HTTPS hoặc localhost');

  const meta = await page.evaluate(() => ({
    viewport: document.querySelector('meta[name="viewport"]')?.content || null,
    themeColor: document.querySelector('meta[name="theme-color"]')?.content || null,
    manifestHref: document.querySelector('link[rel="manifest"]')?.href || null,
    appleIcon: !!document.querySelector('link[rel="apple-touch-icon"]'),
  }));
  add('viewport', 'Có meta viewport', meta.viewport ? 'pass' : 'fail', meta.viewport || 'thiếu <meta name="viewport">');
  add('theme-color', 'Có meta theme-color', meta.themeColor ? 'pass' : 'warn', meta.themeColor || 'thiếu');
  add('apple-touch-icon', 'Có apple-touch-icon (iOS)', meta.appleIcon ? 'pass' : 'warn', meta.appleIcon ? '' : 'thiếu');

  // Manifest
  let manifest = null, manifestUrl = meta.manifestHref;
  if (!manifestUrl) add('manifest', 'Có web app manifest', 'fail', 'không có <link rel="manifest">');
  else {
    const resp = await context.request.get(manifestUrl).catch((e) => null);
    if (!resp || !resp.ok()) add('manifest', 'Có web app manifest', 'fail', `không tải được ${manifestUrl} (${resp ? resp.status() : 'network error'})`);
    else {
      try { manifest = JSON.parse(await resp.text()); add('manifest', 'Có web app manifest', 'pass', manifestUrl); }
      catch (e) { add('manifest', 'Có web app manifest', 'fail', 'manifest không phải JSON hợp lệ: ' + e.message); }
    }
  }
  if (manifest) {
    add('manifest-name', 'Manifest có name/short_name', (manifest.name || manifest.short_name) ? 'pass' : 'fail',
      `name=${manifest.name || '-'} short_name=${manifest.short_name || '-'}`);
    add('manifest-start-url', 'Manifest có start_url', manifest.start_url ? 'pass' : 'fail', manifest.start_url || 'thiếu');
    const okDisplay = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'].includes(manifest.display);
    add('manifest-display', 'display là standalone/fullscreen/minimal-ui', okDisplay ? 'pass' : 'fail', `display=${manifest.display || '-'}`);
    add('manifest-colors', 'Có theme_color và background_color',
      (manifest.theme_color && manifest.background_color) ? 'pass' : 'warn',
      `theme_color=${manifest.theme_color || '-'} background_color=${manifest.background_color || '-'}`);
    const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
    const sizes = new Set();
    icons.forEach((i) => String(i.sizes || '').split(/\s+/).forEach((s) => s && sizes.add(s)));
    for (const s of ['192x192', '512x512']) {
      add(`icon-${s}`, `Icon ${s}`, (sizes.has(s) || sizes.has('any')) ? 'pass' : 'fail',
        (sizes.has(s) || sizes.has('any')) ? '' : `manifest.icons không có ${s} (cần cho cài đặt)`);
    }
    const broken = [];
    for (const ic of icons) {
      const iu = new URL(ic.src, manifestUrl).href;
      const r = await context.request.get(iu).catch(() => null);
      if (!r || !r.ok()) broken.push(`${ic.src} (${r ? r.status() : 'err'})`);
    }
    add('icons-reachable', 'Tất cả icon tải được', broken.length ? 'fail' : (icons.length ? 'pass' : 'fail'),
      broken.length ? broken.join(', ') : (icons.length ? `${icons.length} icon` : 'không có icon'));
    if (manifest.start_url) manifest.__startAbs = new URL(manifest.start_url, manifestUrl).href;
  }

  // Service worker
  const sw = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const t = new Promise((r) => setTimeout(() => r(null), 10000));
    const reg = await Promise.race([navigator.serviceWorker.ready, t]);
    if (!reg) return { supported: true, registered: false };
    return { supported: true, registered: true, scope: reg.scope, script: reg.active && reg.active.scriptURL };
  });
  if (!sw.registered) add('sw-register', 'Service Worker đăng ký và active', 'fail', sw.supported ? 'không có SW active sau 10s' : 'trình duyệt không hỗ trợ');
  else add('sw-register', 'Service Worker đăng ký và active', 'pass', `${sw.script} (scope ${sw.scope})`);

  if (sw.registered) {
    await page.reload({ waitUntil: 'load' });
    const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
    add('sw-control', 'SW điều khiển trang sau reload', controlled ? 'pass' : 'fail', controlled ? '' : 'navigator.serviceWorker.controller = null');

    // Precache completeness: every same-origin file the page loaded should be in Cache Storage,
    // otherwise offline only works by luck (browser HTTP cache).
    const cacheCheck = await page.evaluate(async () => {
      const origin = location.origin;
      const urls = [location.href.split('#')[0]].concat(
        performance.getEntriesByType('resource').map((e) => e.name)
      ).filter((u) => u.startsWith(origin) && !u.includes('/sw.js') && !u.includes('service-worker'));
      const missing = [];
      for (const u of [...new Set(urls)]) {
        const hit = await caches.match(u, { ignoreSearch: true });
        if (!hit) missing.push(u.replace(origin, ''));
      }
      return { checked: urls.length, missing, cacheNames: await caches.keys() };
    });
    add('precache', 'Mọi file trang cần đều có trong Cache Storage',
      cacheCheck.missing.length ? 'fail' : 'pass',
      cacheCheck.missing.length ? 'thiếu trong cache: ' + cacheCheck.missing.join(', ')
        : `${cacheCheck.checked} file, cache: ${cacheCheck.cacheNames.join(', ')}`);

    // Offline: clear the HTTP cache first so only the service worker can serve files
    try { const cdp = await context.newCDPSession(page); await cdp.send('Network.clearBrowserCache'); } catch (_) {}
    await context.setOffline(true);
    const target = (manifest && manifest.__startAbs) || args.url;
    const offErrors = [], offFailed = [];
    const onErr = (e) => offErrors.push(String(e.message || e));
    const onReqFail = (r) => {
      if (['script', 'stylesheet', 'document', 'fetch', 'xhr'].includes(r.resourceType()) &&
          new URL(r.url()).origin === new URL(target).origin) offFailed.push(r.url());
    };
    page.on('pageerror', onErr);
    page.on('requestfailed', onReqFail);
    let offOk = true, offDetail = '';
    try {
      const resp = await page.goto(target, { waitUntil: 'load', timeout: 10000 });
      const text = (await page.evaluate(() => document.body ? document.body.innerText : '')).trim();
      if (!resp || !text) { offOk = false; offDetail = 'trang trống khi offline'; }
      else offDetail = `tải được offline (${text.length} ký tự)`;
    } catch (e) { offOk = false; offDetail = e.message.split('\n')[0]; }
    await page.waitForTimeout(800);
    if (offFailed.length) { offOk = false; offDetail += ' | file không có trong cache khi offline: ' + offFailed.slice(0, 5).join(', '); }
    if (offErrors.length) { offOk = false; offDetail += ' | lỗi JS khi offline: ' + offErrors[0]; }
    add('offline-reload', 'Mở lại start_url khi offline', offOk ? 'pass' : 'fail', offDetail);
    page.off('pageerror', onErr);
    page.off('requestfailed', onReqFail);
    await context.setOffline(false);
  }

  add('load-errors', 'Không có lỗi JS khi tải trang', loadPageErrors.length ? 'fail' : 'pass', loadPageErrors.slice(0, 3).join(' | '));
  add('console-errors', 'Không có console error khi tải trang', loadConsoleErrors.length ? 'warn' : 'pass', loadConsoleErrors.slice(0, 3).join(' | '));
  finish(browser, manifest);
})().catch((e) => { console.error(e); process.exit(1); });

async function finish(browser, manifest) {
  await browser.close();
  if (manifest) delete manifest.__startAbs;
  const summary = {
    pass: checks.filter((c) => c.status === 'pass').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    fail: checks.filter((c) => c.status === 'fail').length,
  };
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify({ url: args.url, checkedAt: new Date().toISOString(), summary, checks, manifest }, null, 2));
  for (const c of checks) console.log(`${c.status === 'pass' ? '✓' : c.status === 'warn' ? '!' : '✗'} ${c.title}${c.detail ? ' — ' + c.detail : ''}`);
  console.log(`\npass ${summary.pass} / warn ${summary.warn} / fail ${summary.fail} → ${args.out}`);
}
