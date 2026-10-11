/* Unit tests for the Gully Cricket rules engine. Run: node test/engine.test.js */
const assert = require('assert');
const E = require('../src/engine.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.log('  ✗ ' + name + '\n    ' + (e.stack || e).split('\n').slice(0, 4).join('\n    ')); }
}

function mk(cfg = {}, nA = 4, nB = 4, opts = {}) {
  const pl = (p, n) => Array.from({ length: n }, (_, i) => ({ id: p + i, name: p.toUpperCase() + i }));
  return {
    teams: { A: { name: 'Lions', players: pl('a', nA) }, B: { name: 'Tigers', players: pl('b', nB) } },
    joker: opts.joker || null,
    config: Object.assign({}, E.PRESETS.gully, cfg),
    toss: opts.toss || { winner: 'A', choice: 'bat' },
    events: []
  };
}
function go(m, ...evs) {
  let s;
  for (const e of evs) {
    const r = E.tryAppend(m, e);
    if (!r.ok) throw new Error('rejected ' + JSON.stringify(e) + ' -> ' + r.error);
    m.events.push(e); s = r.state;
  }
  return s || E.replay(m);
}
function rejects(m, e, code) {
  const r = E.tryAppend(m, e);
  assert.ok(!r.ok, 'expected rejection of ' + JSON.stringify(e));
  if (code) assert.ok(r.error.startsWith(code), 'expected ' + code + ', got ' + r.error);
}
const B = (bat = 0, x = {}) => Object.assign({ t: 'ball', kind: 'legal', bat }, x);
const W = (how, out = 'striker') => ({ t: 'ball', kind: 'legal', bat: 0, wicket: { how, out } });
const start = (st, ns, bw) => ({ t: 'start', striker: st, nonStriker: ns, bowler: bw });
const dots = (n) => Array.from({ length: n }, () => B(0));

console.log('Gully engine');

test('toss: winner chose bowl -> other side bats first', () => {
  assert.strictEqual(E.replay(mk({}, 3, 3, { toss: { winner: 'A', choice: 'bowl' } })).innings[0].bat, 'B');
  assert.strictEqual(E.replay(mk({}, 3, 3, { toss: { winner: 'B', choice: 'bat' } })).innings[0].bat, 'B');
});

test('start validation + nothing before openers', () => {
  const m = mk();
  assert.deepStrictEqual(E.replay(m).pending, { type: 'openers' });
  rejects(m, start('a0', 'a0', 'b0'), 'bad_non_striker');
  rejects(m, start('a0', 'a1', 'a2'), 'bad_bowler');
  rejects(m, start('b0', 'a1', 'b1'), 'bad_striker');
  rejects(m, B(1), 'not_expected');
});

test('over: runs, rotation, over-end swap, bowler pending, no back-to-back', () => {
  const m = mk({ overs: 2 });
  let s = go(m, start('a0', 'a1', 'b0'), B(1), B(0), B(4), B(2), B(0), B(3));
  const inn = s.innings[0];
  assert.strictEqual(inn.runs, 10);
  assert.strictEqual(inn.balls, 6);
  assert.strictEqual(inn.striker, 'a1');
  assert.strictEqual(inn.nonStriker, 'a0');
  assert.deepStrictEqual(s.pending, { type: 'bowler' });
  assert.strictEqual(inn.batters.a1.runs, 9);
  assert.strictEqual(inn.batters.a1.balls, 5);
  assert.strictEqual(inn.batters.a1.fours, 1);
  assert.ok(E.bowlerOptions(s, inn).find((o) => o.id === 'b0').disabled);
  rejects(m, { t: 'bowler', id: 'b0' }, 'bad_bowler');
  rejects(m, B(1), 'not_expected');
  s = go(m, { t: 'bowler', id: 'b1' });
  assert.strictEqual(s.pending, null);
});

test('wide: +1, re-bowl, runs on a wide rotate strike', () => {
  const m = mk();
  let s = go(m, start('a0', 'a1', 'b0'), { t: 'ball', kind: 'wide' });
  let inn = s.innings[0];
  assert.strictEqual(inn.runs, 1);
  assert.strictEqual(inn.balls, 0);
  assert.strictEqual(inn.extras.wd, 1);
  assert.strictEqual(inn.bowlers.b0.runs, 1);
  assert.strictEqual(inn.bowlers.b0.balls, 0);
  assert.strictEqual(inn.batters.a0.balls, 0);
  s = go(m, { t: 'ball', kind: 'wide', ext: 1 });
  inn = s.innings[0];
  assert.strictEqual(inn.runs, 3);
  assert.strictEqual(inn.extras.wd, 3);
  assert.strictEqual(inn.striker, 'a1');
  rejects(m, { t: 'ball', kind: 'wide', bat: 2 }, 'wide_has_bat_runs');
});

test('wide counts as a ball when re-bowl is off; 0-run wide', () => {
  const m = mk({ wideRebowl: false, wideRuns: 0 });
  const s = go(m, start('a0', 'a1', 'b0'), { t: 'ball', kind: 'wide' });
  assert.strictEqual(s.innings[0].balls, 1);
  assert.strictEqual(s.innings[0].runs, 0);
});

test('no-ball + free hit: only run out until a legal ball; carries over a wide', () => {
  const m = mk({ freeHit: true });
  let s = go(m, start('a0', 'a1', 'b0'), { t: 'ball', kind: 'noball', bat: 4 });
  const inn = s.innings[0];
  assert.strictEqual(inn.runs, 5);
  assert.strictEqual(inn.balls, 0);
  assert.strictEqual(inn.batters.a0.balls, 1);
  assert.strictEqual(inn.batters.a0.runs, 4);
  assert.strictEqual(inn.bowlers.b0.runs, 5);
  assert.strictEqual(inn.extras.nb, 1);
  assert.ok(inn.freeHit);
  assert.deepStrictEqual(E.allowedDismissals(s, 'legal'), ['runOut']);
  rejects(m, W('bowled'), 'dismissal_not_allowed');
  s = go(m, { t: 'ball', kind: 'wide' });
  assert.ok(s.innings[0].freeHit);
  s = go(m, B(0));
  assert.ok(!s.innings[0].freeHit);
});

test('byes and leg-byes: team runs, not batter or bowler', () => {
  const m = mk();
  let s = go(m, start('a0', 'a1', 'b0'), B(0, { ext: 2, extType: 'lb' }), B(0, { ext: 1, extType: 'b' }));
  const inn = s.innings[0];
  assert.strictEqual(inn.runs, 3);
  assert.strictEqual(inn.extras.lb, 2);
  assert.strictEqual(inn.extras.b, 1);
  assert.strictEqual(inn.batters.a0.runs, 0);
  assert.strictEqual(inn.bowlers.b0.runs, 0);
  assert.strictEqual(inn.striker, 'a1');
  rejects(mk({ byes: false }), B(0), 'not_expected');
  const m2 = mk({ byes: false });
  go(m2, start('a0', 'a1', 'b0'));
  rejects(m2, B(0, { ext: 1, extType: 'b' }), 'byes_off');
});

test('dismissal legality matrix', () => {
  const m = mk({ lbw: false });
  let s = go(m, start('a0', 'a1', 'b0'));
  assert.deepStrictEqual(E.allowedDismissals(s, 'wide'), ['stumped', 'runOut']);
  assert.deepStrictEqual(E.allowedDismissals(s, 'noball'), ['runOut']);
  assert.ok(E.allowedDismissals(s, 'legal').indexOf('lbw') < 0);
  assert.ok(E.allowedDismissals(E.replay(mk({ lbw: true })), 'legal').indexOf('lbw') >= 0);
  rejects(m, { t: 'ball', kind: 'noball', wicket: { how: 'caught' } }, 'dismissal_not_allowed');
  rejects(m, { t: 'ball', kind: 'wide', wicket: { how: 'bowled' } }, 'dismissal_not_allowed');
  rejects(m, { t: 'ball', kind: 'legal', bat: 2, wicket: { how: 'caught' } }, 'runs_on_dismissal');
  s = go(m, { t: 'ball', kind: 'wide', wicket: { how: 'stumped' } });
  assert.strictEqual(s.innings[0].wkts, 1);
  assert.strictEqual(s.innings[0].bowlers.b0.wkts, 1);
  assert.strictEqual(s.innings[0].runs, 1);
});

test('bowled -> next batter takes strike', () => {
  const m = mk();
  let s = go(m, start('a0', 'a1', 'b0'), W('bowled'));
  assert.deepStrictEqual(s.pending, { type: 'batter' });
  assert.deepStrictEqual(E.batterCandidates(s, s.innings[0]), ['a2', 'a3']);
  rejects(m, { t: 'batter', id: 'a1' }, 'bad_batter');
  s = go(m, { t: 'batter', id: 'a3' });
  assert.strictEqual(s.innings[0].striker, 'a3');
  assert.strictEqual(s.innings[0].batters.a0.how, 'bowled');
  assert.strictEqual(s.innings[0].batters.a0.bowler, 'b0');
  assert.strictEqual(s.innings[0].fow[0].runs, 0);
});

test('wicket on last ball: batter first, then bowler; survivor on strike', () => {
  const m = mk({ overs: 2 });
  let s = go(m, start('a0', 'a1', 'b0'), ...dots(5), W('bowled'));
  assert.deepStrictEqual(s.pending, { type: 'batter' });
  assert.strictEqual(s.innings[0].striker, 'a1');
  s = go(m, { t: 'batter', id: 'a2' });
  assert.deepStrictEqual(s.pending, { type: 'bowler' });
  assert.strictEqual(s.innings[0].nonStriker, 'a2');
  assert.strictEqual(s.innings[0].bowlers.b0.maidens, 1);
});

test('all out at n-1 without last-man-stands', () => {
  const m = mk({ lastManStands: false }, 3, 3);
  const s = go(m, start('a0', 'a1', 'b0'), W('bowled'), { t: 'batter', id: 'a2' }, W('caught'));
  assert.ok(s.innings[0].done);
  assert.strictEqual(s.innings[0].endReason, 'allout');
  assert.strictEqual(s.cur, 1);
  assert.strictEqual(s.innings[1].target, 1);
  assert.deepStrictEqual(s.pending, { type: 'openers' });
});

test('last man stands: bats alone, keeps strike, out = all out', () => {
  const m = mk({ lastManStands: true }, 3, 3);
  let s = go(m, start('a0', 'a1', 'b0'), W('bowled'), { t: 'batter', id: 'a2' }, W('caught'));
  let inn = s.innings[0];
  assert.ok(!inn.done);
  assert.ok(inn.solo);
  assert.strictEqual(inn.striker, 'a1');
  assert.strictEqual(inn.nonStriker, null);
  assert.strictEqual(s.pending, null);
  s = go(m, B(1));
  assert.strictEqual(s.innings[0].striker, 'a1');
  rejects(m, { t: 'swap' }, 'cannot_swap');
  s = go(m, W('bowled'));
  assert.ok(s.innings[0].done);
  assert.strictEqual(s.innings[0].wkts, 3);
});

test('run out of non-striker after 1 run: no bowler credit', () => {
  const m = mk();
  let s = go(m, start('a0', 'a1', 'b0'), { t: 'ball', kind: 'legal', bat: 1, wicket: { how: 'runOut', out: 'nonStriker' } });
  const inn = s.innings[0];
  assert.strictEqual(inn.batters.a1.status, 'out');
  assert.strictEqual(inn.batters.a1.bowler, null);
  assert.strictEqual(inn.bowlers.b0.wkts, 0);
  assert.strictEqual(inn.batters.a0.runs, 1);
  assert.strictEqual(inn.nonStriker, 'a0');
  assert.strictEqual(inn.striker, null);
  s = go(m, { t: 'batter', id: 'a2' });
  assert.strictEqual(s.innings[0].striker, 'a2');
});

test('chase: won by wickets with balls left', () => {
  const m = mk({ overs: 1 }, 3, 3);
  let s = go(m, start('a0', 'a1', 'b0'), B(1), B(1), B(1), B(1), B(1), B(0));
  assert.strictEqual(s.cur, 1);
  assert.strictEqual(s.innings[1].target, 6);
  s = go(m, start('b0', 'b1', 'a0'), B(6));
  assert.ok(s.result);
  assert.strictEqual(s.result.winner, 'B');
  assert.strictEqual(s.result.type, 'wickets');
  assert.strictEqual(s.result.margin, 3);
  assert.strictEqual(s.result.ballsLeft, 5);
  rejects(m, B(1), 'match_over');
});

test('defending: won by runs', () => {
  const m = mk({ overs: 1 }, 3, 3);
  go(m, start('a0', 'a1', 'b0'), B(4), B(4), ...dots(4));
  const s = go(m, start('b0', 'b1', 'a0'), B(1), B(1), ...dots(4));
  assert.strictEqual(s.result.type, 'runs');
  assert.strictEqual(s.result.winner, 'A');
  assert.strictEqual(s.result.margin, 6);
});

test('end innings early -> chase target', () => {
  const m = mk({ overs: 5 });
  const s = go(m, start('a0', 'a1', 'b0'), B(4), { t: 'end' });
  assert.strictEqual(s.innings[0].endReason, 'declared');
  assert.strictEqual(s.innings[1].target, 5);
});

test('tie -> super over (side batting 2nd bats first) -> result', () => {
  const m = mk({ overs: 1 }, 3, 3);
  go(m, start('a0', 'a1', 'b0'), B(2), ...dots(5));
  let s = go(m, start('b0', 'b1', 'a0'), B(2), ...dots(5));
  assert.deepStrictEqual(s.pending, { type: 'tie' });
  assert.strictEqual(s.result, null);
  s = go(m, { t: 'tiebreak', mode: 'super' });
  assert.strictEqual(s.innings[2].bat, 'B');
  assert.ok(s.innings[2].isSuper);
  assert.strictEqual(s.innings[2].maxBalls, 6);
  s = go(m, start('b0', 'b1', 'a0'), B(4), W('bowled'), { t: 'batter', id: 'b2' }, W('bowled'));
  assert.ok(s.innings[2].done);
  assert.strictEqual(s.innings[3].target, 5);
  assert.strictEqual(s.innings[3].bat, 'A');
  s = go(m, start('a0', 'a1', 'b0'), B(6));
  assert.strictEqual(s.result.type, 'super');
  assert.strictEqual(s.result.winner, 'A');
});

test('super over tie asks again; share ends tied', () => {
  const m = mk({ overs: 1 }, 3, 3);
  go(m, start('a0', 'a1', 'b0'), ...dots(6));
  go(m, start('b0', 'b1', 'a0'), ...dots(6), { t: 'tiebreak', mode: 'super' });
  go(m, start('b0', 'b1', 'a0'), B(1), ...dots(5));
  let s = go(m, start('a0', 'a1', 'b0'), B(1), ...dots(5));
  assert.deepStrictEqual(s.pending, { type: 'tie' });
  s = go(m, { t: 'tiebreak', mode: 'share' });
  assert.deepStrictEqual(s.result, { type: 'tie', winner: null });
});

test('bowl-out: regulation tie -> sudden death', () => {
  const m = mk({ overs: 1, bowloutBalls: 3 }, 3, 3);
  go(m, start('a0', 'a1', 'b0'), B(1), ...dots(5));
  let s = go(m, start('b0', 'b1', 'a0'), B(1), ...dots(5), { t: 'tiebreak', mode: 'bowlout' });
  assert.strictEqual(s.pending.type, 'bowlout');
  assert.strictEqual(s.pending.side, 'B');
  s = go(m, ...[true, true, false, false, true, true].map((h) => ({ t: 'bowl', hit: h })));
  assert.strictEqual(s.result, null);
  assert.strictEqual(s.pending.type, 'bowlout');
  s = go(m, { t: 'bowl', hit: true });
  assert.strictEqual(s.result, null);
  s = go(m, { t: 'bowl', hit: false });
  assert.deepStrictEqual(s.result, { type: 'bowlout', winner: 'B', a: 3, b: 2 });
});

test('bowl-out ends early when the trailing side cannot catch up', () => {
  const m = mk({ overs: 1, bowloutBalls: 3 }, 3, 3);
  go(m, start('a0', 'a1', 'b0'), ...dots(6));
  let s = go(m, start('b0', 'b1', 'a0'), ...dots(6), { t: 'tiebreak', mode: 'bowlout' });
  s = go(m, ...[true, false, true, false].map((h) => ({ t: 'bowl', hit: h })));
  assert.deepStrictEqual(s.result, { type: 'bowlout', winner: 'B', a: 2, b: 0 });
});

test('six = out (gully), but a free-hit six still counts', () => {
  const m = mk({ sixOut: true });
  const s = go(m, start('a0', 'a1', 'b0'), B(6));
  const inn = s.innings[0];
  assert.strictEqual(inn.runs, 0);
  assert.strictEqual(inn.wkts, 1);
  assert.strictEqual(inn.batters.a0.how, 'sixOut');
  assert.strictEqual(inn.bowlers.b0.wkts, 1);
  const m2 = mk({ sixOut: true, freeHit: true });
  const s2 = go(m2, start('a0', 'a1', 'b0'), { t: 'ball', kind: 'noball' }, B(6));
  assert.strictEqual(s2.innings[0].runs, 7);
  assert.strictEqual(s2.innings[0].wkts, 0);
});

test('six = out with "six still counts" on', () => {
  const m = mk({ sixOut: true, sixOutRuns: true });
  const s = go(m, start('a0', 'a1', 'b0'), B(6));
  const inn = s.innings[0];
  assert.strictEqual(inn.runs, 6);
  assert.strictEqual(inn.wkts, 1);
  assert.strictEqual(inn.batters.a0.runs, 6);
  assert.strictEqual(inn.batters.a0.sixes, 1);
  assert.strictEqual(inn.bowlers.b0.runs, 6);
  assert.deepStrictEqual(E.ballText(inn.overs[0][0]), { t: '6W', tone: 'w' });
});

test('mid-over bowler change ("baby over") keeps the over going', () => {
  const m = mk({ overs: 2 }, 3, 3);
  let s = go(m, start('a0', 'a1', 'b0'), ...dots(3));
  rejects(m, { t: 'changeBowler', id: 'b0' }, 'bad_bowler');
  s = go(m, { t: 'changeBowler', id: 'b1' }, ...dots(3));
  const inn = s.innings[0];
  assert.strictEqual(inn.bowlers.b0.balls, 3);
  assert.strictEqual(inn.bowlers.b1.balls, 3);
  assert.strictEqual(inn.lastOverBowler, 'b1');
  const o = E.bowlerOptions(s, inn);
  assert.ok(o.find((x) => x.id === 'b1').disabled);
  assert.ok(!o.find((x) => x.id === 'b0').disabled);
});

test('common player can be barred from bowling', () => {
  const m = mk({ jokerBowls: false }, 2, 2, { joker: { id: 'j', name: 'Joker' }, toss: { winner: 'B', choice: 'bat' } });
  rejects(m, start('b0', 'b1', 'j'), 'bad_bowler');
  const s = go(m, start('b0', 'b1', 'a0'), ...dots(6));
  assert.deepStrictEqual(E.bowlerOptions(s, s.innings[0]).map((o) => o.id), ['a0', 'a1']);
});

test('single-batter rule: one at the crease, keeps strike, everyone bats', () => {
  const m = mk({ singleBatter: true, lastManStands: false, overs: 2 }, 3, 3);
  rejects(m, start('a0', 'a1', 'b0'), 'bad_non_striker');
  let s = go(m, start('a0', null, 'b0'));
  let inn = s.innings[0];
  assert.ok(inn.solo && inn.soloStart);
  assert.strictEqual(inn.nonStriker, null);
  s = go(m, B(1), B(3));
  assert.strictEqual(s.innings[0].striker, 'a0');
  rejects(m, { t: 'swap' }, 'cannot_swap');
  rejects(m, { t: 'ball', kind: 'legal', bat: 1, wicket: { how: 'runOut', out: 'nonStriker' } }, 'no_non_striker');
  s = go(m, W('bowled'));
  assert.deepStrictEqual(s.pending, { type: 'batter' });
  s = go(m, { t: 'batter', id: 'a1' }, W('caught'), { t: 'batter', id: 'a2' }, B(2));
  inn = s.innings[0];
  assert.strictEqual(inn.striker, 'a2');
  assert.strictEqual(inn.wkts, 2);
  assert.ok(!inn.done);
  s = go(m, W('bowled'));
  assert.ok(s.innings[0].done);
  assert.strictEqual(s.innings[0].endReason, 'allout');
  assert.strictEqual(s.innings[0].wkts, 3);
});

test('single-batter chase: margin counts every batter', () => {
  const m = mk({ singleBatter: true, lastManStands: false, overs: 1 }, 3, 3);
  go(m, start('a0', null, 'b0'), B(2), ...dots(5));
  const s = go(m, start('b0', null, 'a0'), B(4));
  assert.strictEqual(s.result.type, 'wickets');
  assert.strictEqual(s.result.margin, 3);
});

test('two-batter rule, but this innings bats alone (no non-striker)', () => {
  const m = mk({ lastManStands: false, overs: 1 }, 3, 3);
  let s = go(m, start('a0', null, 'b0'));
  assert.ok(s.innings[0].solo && s.innings[0].soloStart);
  s = go(m, B(1));
  assert.strictEqual(s.innings[0].striker, 'a0');
  s = go(m, W('bowled'), { t: 'batter', id: 'a1' });
  assert.strictEqual(s.innings[0].striker, 'a1');
  assert.strictEqual(s.innings[0].nonStriker, null);
  s = go(m, ...dots(4));
  s = go(m, start('b0', 'b1', 'a0'), B(2));
  assert.strictEqual(s.result.winner, 'B');
  assert.strictEqual(s.result.margin, 2);
});

test('auto-retire, then return when batters run out', () => {
  const m = mk({ retireAt: 10, lastManStands: false, retiredReturn: true }, 3, 3);
  let s = go(m, start('a0', 'a1', 'b0'), B(6), B(4));
  const inn = s.innings[0];
  assert.strictEqual(inn.batters.a0.status, 'retired');
  assert.deepStrictEqual(s.pending, { type: 'batter' });
  assert.deepStrictEqual(E.batterCandidates(s, inn), ['a2']);
  s = go(m, { t: 'batter', id: 'a2' }, W('bowled'));
  assert.deepStrictEqual(E.batterCandidates(s, s.innings[0]), ['a0']);
  s = go(m, { t: 'batter', id: 'a0' });
  assert.strictEqual(s.innings[0].batters.a0.status, 'batting');
  assert.strictEqual(s.innings[0].batters.a0.runs, 10);
});

test('no retire when the chase is won on that ball', () => {
  const m = mk({ overs: 1, retireAt: 6 }, 3, 3);
  go(m, start('a0', 'a1', 'b0'), B(4), ...dots(5));
  const s = go(m, start('b0', 'b1', 'a0'), B(6));
  assert.strictEqual(s.result.winner, 'B');
  assert.strictEqual(s.innings[1].batters.b0.status, 'batting');
});

test('bowler cap + no back-to-back, auto-relax when impossible', () => {
  const m = mk({ overs: 3, maxOversPerBowler: 1 }, 2, 2);
  let s = go(m, start('a0', 'a1', 'b0'), ...dots(6));
  assert.ok(E.bowlerOptions(s, s.innings[0]).find((x) => x.id === 'b0').disabled);
  s = go(m, { t: 'bowler', id: 'b1' }, ...dots(6));
  const o = E.bowlerOptions(s, s.innings[0]);
  const b0 = o.find((x) => x.id === 'b0'), b1 = o.find((x) => x.id === 'b1');
  assert.ok(!b0.disabled);
  assert.strictEqual(b0.relaxed, 'cap');
  assert.ok(b1.disabled);
  assert.strictEqual(b1.reason, 'consecutive');
});

test('manual swap + retire', () => {
  const m = mk();
  let s = go(m, start('a0', 'a1', 'b0'), { t: 'swap' });
  assert.strictEqual(s.innings[0].striker, 'a1');
  s = go(m, { t: 'retire', slot: 'striker' });
  assert.deepStrictEqual(s.pending, { type: 'batter' });
  assert.strictEqual(s.innings[0].batters.a1.status, 'retired');
});

test('undo = drop last event; state replays exactly (also across innings)', () => {
  const m = mk({ overs: 1 }, 3, 3);
  go(m, start('a0', 'a1', 'b0'), B(1), B(2), B(3), B(4), B(6), B(1));
  assert.strictEqual(E.replay(m).cur, 1);
  m.events.pop();
  const s = E.replay(m);
  assert.strictEqual(s.cur, 0);
  assert.strictEqual(s.innings[0].balls, 5);
  assert.strictEqual(s.innings[0].runs, 16);
  assert.strictEqual(s.pending, null);
});

test('common player bats for both sides, never bowls while batting', () => {
  const m = mk({ overs: 2 }, 2, 2, { joker: { id: 'j', name: 'Joker' } });
  let s = go(m, start('a0', 'j', 'b0'));
  assert.deepStrictEqual(s.innings[0].squad, ['a0', 'a1', 'j']);
  s = go(m, ...dots(6));
  const ids = E.bowlerOptions(s, s.innings[0]).map((o) => o.id);
  assert.ok(ids.indexOf('j') < 0);
  assert.deepStrictEqual(ids, ['b0', 'b1']);
  assert.strictEqual(E.teamOf(m, 'j'), 'J');
});

test('performer of the match weighs bowling and batting', () => {
  const m = mk({ overs: 1 }, 3, 3);
  go(m, start('a0', 'a1', 'b0'), B(4), B(6), B(4), ...dots(3));
  const s = go(m, start('b0', 'b1', 'a2'), W('bowled'), { t: 'batter', id: 'b2' }, W('bowled'), B(1), ...dots(3));
  assert.strictEqual(s.result.winner, 'A');
  assert.strictEqual(s.result.margin, 13);
  const list = E.performers(s);
  assert.strictEqual(list[0].id, 'a2');
  assert.strictEqual(list[0].bowl, 51.5);
  const a0 = list.find((x) => x.id === 'a0');
  assert.strictEqual(a0.bat, 28);
});

test('ball text chips', () => {
  assert.deepStrictEqual(E.ballText({ kind: 'legal', bat: 0, ext: 0, runs: 0 }), { t: '•', tone: '0' });
  assert.deepStrictEqual(E.ballText({ kind: 'legal', bat: 4, ext: 0, runs: 4 }), { t: '4', tone: '4' });
  assert.deepStrictEqual(E.ballText({ kind: 'wide', bat: 0, ext: 0, runs: 1 }), { t: 'wd', tone: 'x' });
  assert.deepStrictEqual(E.ballText({ kind: 'wide', bat: 0, ext: 2, runs: 3 }), { t: '3wd', tone: 'x' });
  assert.deepStrictEqual(E.ballText({ kind: 'legal', bat: 0, ext: 0, runs: 0, w: 'bowled' }), { t: 'W', tone: 'w' });
  assert.strictEqual(E.formatOvers(14, 6), '2.2');
  assert.strictEqual(E.formatOvers(9, 4), '2.1');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
