/* Upgrading from 1.0.0: saved data has teams but no regulars list. The app must skip the first-launch
   screen, build the regulars from the saved teams, and keep old matches playing by their own rules. */
const path = require('path');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/npm-tools/node_modules/playwright'); }
const URL = 'file://' + path.join(__dirname, '..', 'dist', 'test.html');
const failures = [];
function check(cond, msg) { if (cond) console.log('  ✓ ' + msg); else { failures.push(msg); console.log('  ✗ ' + msg); } }

function seed() {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  const A = { id: 'tA', name: 'Bulls', color: '#2F7BFF', players: [{ id: 'p1', name: 'Kiran' }, { id: 'p2', name: 'Rahul' }, { id: 'p3', name: 'Manju' }] };
  const B = { id: 'tB', name: 'Mavericks', color: '#FF6A2B', players: [{ id: 'p4', name: 'Vinay' }, { id: 'p5', name: 'Ravi' }, { id: 'p6', name: 'kiran ' }] };
  const cfg = { overs: 1, ballsPerOver: 6, wideRuns: 1, wideRebowl: false, nbRuns: 1, nbRebowl: true };
  const m = { id: 'm1', no: 1, createdAt: Date.now() - 86400000 * 3, updatedAt: Date.now(), status: 'live', teams: { A, B }, joker: null, config: cfg,
    toss: { caller: 'A', call: 'H', result: 'H', winner: 'A', choice: 'bat', real: true, mode: 'toss' },
    events: [{ t: 'start', striker: 'p1', nonStriker: 'p2', bowler: 'p4' }, { t: 'ball', kind: 'wide', ext: 0 }], result: null };
  localStorage.setItem('gully.m.m1', JSON.stringify(m));
  localStorage.setItem('gully.meta.v1', JSON.stringify({ v: 1, teams: [A, B], live: 'm1', counter: 1, last: { A: 'tA', B: 'tB' }, pairCfg: {}, savedAt: Date.now(), ids: ['m1'] }));
}

(async () => {
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  await ctx.addInitScript(seed);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(URL);
  await page.waitForTimeout(300);
  console.log('Upgrade from 1.0.0');
  check(!(await page.textContent('#app')).includes('Who plays usually?'), 'existing users skip the first-launch screen');
  check(await page.isVisible('.score'), 'live match resumes straight away');
  const regs = await page.evaluate(() => window.GullyApp.data().regulars.map((r) => r.name));
  check(regs.length === 5 && regs.join(',') === 'Kiran,Rahul,Manju,Vinay,Ravi', 'regulars built from saved teams, duplicates merged (' + regs.join(',') + ')');
  check((await page.textContent('.overs b')).trim() === '0.1', 'old match without re-bowl keeps counting the wide as a ball');
  await page.click('[data-act="menu"]'); await page.click('[data-act="rulesView"]');
  check((await page.textContent('#sheet')).includes('Re-bowl a wide'), 'old match rules still show "Re-bowl a wide: Off"');
  check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log('\n' + (failures.length ? failures.length + ' FAILED' : 'ALL PASSED'));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
