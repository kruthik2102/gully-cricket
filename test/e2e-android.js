/* Runs the offline Android build (assets/www/index.html) in Chromium with a mocked GullyNative bridge.
   Checks: no network requests, embedded fonts load, native share/save/copy/back wiring. */
const fs = require('fs');
const path = require('path');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/npm-tools/node_modules/playwright'); }
const { chromium } = pw;

const PAGE = 'file://' + path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'www', 'index.html');
const SHOTS = path.join(__dirname, '..', 'shots', 'android');
fs.mkdirSync(SHOTS, { recursive: true });
const failures = [];
function check(cond, msg) { if (cond) console.log('  ✓ ' + msg); else { failures.push(msg); console.log('  ✗ ' + msg); } }

function mockBridge() {
  window.__calls = [];
  const log = (...a) => window.__calls.push(a);
  window.GullyNative = {
    saveFile: (b64, name, mime) => { log('saveFile', name, mime, b64.length, mime === 'application/json' ? atob(b64).slice(0, 30) : ''); return 'saved'; },
    shareFile: (b64, name, mime, text) => { log('shareFile', name, mime, b64.length, text); return 'ok'; },
    shareText: (text) => { log('shareText', text); return 'ok'; },
    copyText: (text) => { log('copyText', text.slice(0, 40)); return 'ok'; },
    setDark: (dark) => { log('setDark', dark); }
  };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2, colorScheme: 'dark', hasTouch: true, isMobile: true });
  const net = [];
  await ctx.route(/^https?:/, (route) => { net.push(route.request().url()); route.abort(); });
  await ctx.addInitScript(mockBridge);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const act = (a, extra) => (a === 'closeSheet' && !extra ? page.click('.sheet-head [data-act="closeSheet"]') : page.click('[data-act="' + a + '"]' + (extra || '')));
  const run = (n) => act('run', '[data-n="' + n + '"]');
  const calls = () => page.evaluate(() => window.__calls);
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') });
  async function openers() {
    await page.locator('[data-act="opener"][data-k="striker"]:not([disabled])').first().click();
    await page.locator('[data-act="opener"][data-k="nonStriker"]:not([disabled]):not(.on)').first().click();
    await page.locator('[data-act="opener"][data-k="bowler"]:not([disabled])').first().click();
    await act('startInnings');
  }

  await page.goto(PAGE);
  console.log('Shell');
  check(await page.evaluate(() => window.GullyApp.native === true), 'page detects the Android bridge');
  const fonts = await page.evaluate(async () => {
    await Promise.all([document.fonts.load('700 30px "Barlow Condensed"'), document.fonts.load('64px "Anton"'), document.fonts.load('700 20px "Noto Sans Kannada"', 'ಕನ್ನಡ')]);
    return [document.fonts.check('700 30px "Barlow Condensed"'), document.fonts.check('64px "Anton"'), document.fonts.check('700 20px "Noto Sans Kannada"', 'ಕನ್ನಡ')];
  });
  check(fonts.every(Boolean), 'embedded fonts load offline (Barlow Condensed, Anton, Noto Sans Kannada): ' + fonts.join(','));
  check((await calls()).some((c) => c[0] === 'setDark'), 'status bar colour synced with the theme');
  await shot('home');

  console.log('Back button');
  check((await page.evaluate(() => window.GullyApp.back())) === false, 'back on home lets Android close the app');
  await act('newMatch');
  check((await page.evaluate(() => window.GullyApp.back())) === true && (await page.evaluate(() => window.GullyApp.state().screen)) === 'home', 'back from teams returns home');

  console.log('Match');
  await act('newMatch'); await act('toRules');
  await act('setNum', '[data-k="overs"][data-v="2"]'); await act('oversStep', '[data-v="-1"]');
  await act('toToss');
  await act('call', '[data-v="H"]'); await act('caller', '[data-v="A"]'); await act('realCoin'); await act('landed', '[data-v="H"]');
  await act('choice', '[data-v="bat"]'); await act('startMatch');
  await openers();
  await run(1); await run(4); await act('mod', '[data-k="wide"]'); await run(0); await run(6);
  await shot('scoring');
  await act('settings').catch(() => {});
  await act('menu'); await act('settings'); await act('lang', '[data-v="kn"]'); await act('closeSheet');
  await shot('scoring-kn');
  await act('menu'); await act('settings'); await act('lang', '[data-v="en"]'); await act('closeSheet');
  await run(0); await run(2); await run(1);
  await openers();
  await run(6); await run(6); await run(4);
  check(/won by/.test(await page.textContent('#app')), 'match finishes');
  await shot('result');

  console.log('Share + save');
  check(await page.isVisible('[data-act="shareText"]'), 'result shows "Share result text" (not copy)');
  await act('shareText');
  let c = await calls();
  check(c.some((x) => x[0] === 'shareText' && /Match #1/.test(x[1])), 'result text goes to the Android share sheet');
  await act('poster');
  await page.waitForSelector('.poster-img', { timeout: 15000 });
  await page.waitForSelector('[data-act="saveImage"]:not([disabled])', { timeout: 15000 });
  const src = await page.getAttribute('.poster-img', 'src');
  fs.writeFileSync(path.join(SHOTS, 'poster-image.png'), Buffer.from(src.split(',')[1], 'base64'));
  await shot('poster');
  await act('shareImage');
  await act('saveImage');
  await page.waitForTimeout(300);
  c = await calls();
  const sh = c.find((x) => x[0] === 'shareFile');
  check(sh && sh[2] === 'image/png' && sh[3] > 50000 && /Match #1/.test(sh[4]), 'poster shared as PNG with caption text');
  check(c.some((x) => x[0] === 'saveFile' && x[2] === 'image/png' && x[1] === 'gully-match-1.png'), 'poster saved to Gallery via saveFile');
  check((await page.evaluate(() => window.GullyApp.back())) === true && (await page.evaluate(() => window.GullyApp.state().screen)) === 'result', 'back from poster returns to the result');

  console.log('Settings');
  await act('resultMenu'); await act('settings');
  check((await page.textContent('#sheet')).includes('Saved on this phone'), 'storage reads "Saved on this phone"');
  check((await page.textContent('#sheet')).includes('Save backup to phone'), 'backup button says "Save backup to phone"');
  await act('exportFile');
  await act('exportCopy');
  await page.waitForTimeout(300);
  c = await calls();
  check(c.some((x) => x[0] === 'saveFile' && x[2] === 'application/json' && x[4].startsWith('{"app":"gully-cricket"')), 'backup JSON saved through the bridge');
  check(c.some((x) => x[0] === 'copyText' && x[1].startsWith('{"app":"gully-cricket"')), 'backup text copied through the bridge');
  check((await page.evaluate(() => window.GullyApp.back())) === true && (await page.isHidden('#sheet')), 'back closes an open sheet first');

  check(net.length === 0, 'no network requests' + (net.length ? ': ' + net.join(', ') : ''));
  check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log('\n' + (failures.length ? failures.length + ' FAILED' : 'ALL PASSED'));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
