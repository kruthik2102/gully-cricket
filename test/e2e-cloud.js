/* Exercises the cloud storage + downloads code paths against an in-memory mock of the
   claude.ai runtime (db / user / downloads), shaped after the 0.2.75 type definitions. */
const fs = require('fs');
const path = require('path');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/npm-tools/node_modules/playwright'); }
const { chromium } = pw;

const URL = 'file://' + path.join(__dirname, '..', 'dist', 'test.html');
const failures = [];
function check(cond, msg) { if (cond) console.log('  ✓ ' + msg); else { failures.push(msg); console.log('  ✗ ' + msg); } }

function installMock() {
  let store = new Map();
  const ready = window.__dbLoad().then((json) => { store = new Map(Object.entries(JSON.parse(json))); });
  const persist = () => window.__dbSave(JSON.stringify(Object.fromEntries(store)));
  const segs = (p) => p.split('/').length;
  const frozen = (o) => Object.freeze(o);
  const snap = (p) => { const d = store.get(p); return frozen({ id: p.split('/').pop(), exists: !!d, data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined), metadata: { fromCache: false, hasPendingWrites: false } }); };
  let inflight = 0;
  window.__mock = { writes: 0, maxInflight: 0, failNext: 0, saved: null };
  function docRef(p) {
    if (segs(p) % 2 !== 0) throw new TypeError('document path needs an even number of segments: ' + p);
    if (!/^[A-Za-z0-9_\-.~:@+/]+$/.test(p)) throw new TypeError('bad path chars: ' + p);
    return frozen({
      id: p.split('/').pop(), path: p,
      get: async () => snap(p),
      set: async (data) => {
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw { code: 'invalid_argument', message: 'body must be an object' };
        inflight++; window.__mock.maxInflight = Math.max(window.__mock.maxInflight, inflight);
        await new Promise((r) => setTimeout(r, 15));
        inflight--;
        if (window.__mock.failNext > 0) { window.__mock.failNext--; throw { code: 'unavailable', message: 'transient' }; }
        if (JSON.stringify(data).length > 256 * 1024) throw { code: 'invalid_argument', message: 'too big' };
        store.set(p, JSON.parse(JSON.stringify(data))); window.__mock.writes++; persist();
      },
      update: async () => { throw { code: 'invalid_argument', message: 'not used' }; },
      delete: async () => { store.delete(p); persist(); },
      collection: (sub) => colRef(p + '/' + sub),
      onSnapshot: () => () => {}
    });
  }
  function colRef(p) {
    if (segs(p) % 2 !== 1) throw new TypeError('collection path needs an odd number of segments: ' + p);
    const q = {
      path: p,
      doc: (id) => docRef(p + '/' + (id || Math.random().toString(36).slice(2))),
      limit: () => q, orderBy: () => q, where: () => q,
      get: async () => {
        const docs = [...store.keys()].filter((k) => k.startsWith(p + '/') && segs(k) === segs(p) + 1).map(snap);
        return frozen({ docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} });
      }
    };
    return frozen(q);
  }
  const db = frozen({ doc: docRef, collection: colRef });
  const user = frozen({ id: async () => 'u_mock42', isOwner: async () => true, canEdit: async () => true, can: async () => true });
  const downloads = frozen({ save: async ({ filename, data }) => { window.__mock.saved = { filename, size: data.size || data.length }; return { status: 'saved' }; } });
  const caps = { db, user, downloads };
  window.claude = { use: (name) => ready.then(() => new Promise((r) => setTimeout(() => r(caps[name] || null), 40))) };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const remote = {};
  await ctx.exposeFunction('__dbLoad', () => JSON.stringify(remote));
  await ctx.exposeFunction('__dbSave', (json) => { const o = JSON.parse(json); Object.keys(remote).forEach((k) => delete remote[k]); Object.assign(remote, o); });
  await ctx.addInitScript(installMock);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const act = (a, extra) => page.click('[data-act="' + a + '"]' + (extra || ''));
  const run = (n) => act('run', '[data-n="' + n + '"]');
  const mode = () => page.evaluate(() => window.GullyApp.store.mode);
  const keys = async () => Object.keys(remote);
  async function openers() {
    await page.locator('[data-act="opener"][data-k="striker"]:not([disabled])').first().click();
    await page.locator('[data-act="opener"][data-k="nonStriker"]:not([disabled]):not(.on)').first().click();
    await page.locator('[data-act="opener"][data-k="bowler"]:not([disabled])').first().click();
    await act('startInnings');
  }

  await page.goto(URL);
  await page.waitForTimeout(300);
  console.log('Connect');
  check((await mode()) === 'cloud', 'store switches to cloud mode with db + user');

  console.log('Writes');
  check((await page.textContent('#app')).includes('Who plays usually?'), 'first launch asks for regular players');
  await page.fill('#regAdd', 'Kiran, Rahul, Manju, Arjun, Pradeep, Vinay, Ravi, Darshan');
  await page.press('#regAdd', 'Enter');
  await act('regDone');
  await act('newMatch');
  await act('randOpen'); await act('randAll'); await act('randMake');
  await act('toRules');
  await act('setNum', '[data-k="overs"][data-v="2"]'); await act('oversStep', '[data-v="-1"]');
  await act('toToss');
  await act('call', '[data-v="H"]'); await act('caller', '[data-v="A"]'); await act('realCoin'); await act('landed', '[data-v="H"]');
  await act('choice', '[data-v="bat"]'); await act('startMatch');
  await openers();
  await page.evaluate(() => { window.__mock.failNext = 1; });
  await run(4); await run(1); await run(0);
  await page.waitForTimeout(2500);
  let k = await keys();
  check(k.includes('data/users/u_mock42/gully'), 'meta doc written under the private user path');
  const matchKey = k.find((x) => x.startsWith('data/users/u_mock42/gully/matches/'));
  check(!!matchKey, 'match doc written as data/users/<id>/gully/matches/<matchId>');
  const rm = remote[matchKey];
  check(rm && rm.events.length === 4, 'cloud copy has all 4 events after a transient failure retry (' + (rm && rm.events.length) + ')');
  check((await page.evaluate(() => window.__mock.maxInflight)) === 1, 'writes are serialised (one at a time)');

  console.log('New device restore');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(600);
  const home = await page.textContent('#app');
  check(home.includes('Live match') && home.includes('Resume scoring'), 'live match restored from the cloud on an empty browser');
  await act('resume');
  check((await page.textContent('.score')).replace(/\s/g, '') === '5/0', 'restored score is 5/0');

  console.log('Finish + poster save via downloads capability');
  await run(1); await run(1); await run(1);
  await openers();
  await run(6); await run(6);
  check(/won by/.test(await page.textContent('#app')), 'match finishes');
  await act('poster');
  await page.waitForSelector('.poster-img', { timeout: 10000 });
  await page.waitForSelector('[data-act="saveImage"]:not([disabled])', { timeout: 10000 });
  await act('saveImage');
  await page.waitForTimeout(300);
  const saved = await page.evaluate(() => window.__mock.saved);
  check(saved && saved.filename === 'gully-match-1.png' && saved.size > 10000, 'poster handed to downloads.save as PNG (' + (saved && saved.size) + ' bytes)');
  await page.waitForTimeout(800);
  k = await keys();
  const m2 = remote[matchKey];
  check(m2 && m2.status === 'done' && m2.result && m2.result.type, 'finished match + result summary synced');
  const meta = remote['data/users/u_mock42/gully'];
  check(meta && meta.live === null && meta.teams.length === 2, 'meta synced (no live match, 2 saved teams)');
  check(meta && meta.onboarded === true && Array.isArray(meta.regulars) && meta.regulars.length === 8, 'regular players synced to the cloud');

  console.log('Delete');
  await act('backToResult');
  await act('resultMenu'); await act('deleteAsk'); await act('confirmYes');
  await page.waitForTimeout(800);
  k = await keys();
  check(!k.includes(matchKey), 'deleting a match removes its cloud doc');

  check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log('\n' + (failures.length ? failures.length + ' FAILED' : 'ALL PASSED'));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
