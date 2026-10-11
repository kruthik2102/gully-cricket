/*
 * Gully Cricket rules engine v2
 * Pure, deterministic, event-sourced. No DOM. Runs in the browser and in Node.
 *
 *   state = replay(match)            // fold every event through the rules
 *   tryAppend(match, event)          // validate one more event (undo = drop last event)
 *
 * Only rules that change numbers live here. Umpire-only gully rules
 * (one-tip-one-hand, tip-and-run, underarm...) are stored as house rules and shown, never computed.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GullyEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PRESETS = {
    gully:    { overs: 5,  ballsPerOver: 6, wideRuns: 1, wideRebowl: true, nbRuns: 1, nbRebowl: true, freeHit: false, byes: true,  sixOut: false, lbw: false, hitWicket: false, lastManStands: true,  retireAt: 0,  retiredReturn: true, maxOversPerBowler: 0, consecutiveOvers: false },
    tennis:   { overs: 6,  ballsPerOver: 6, wideRuns: 1, wideRebowl: true, nbRuns: 1, nbRebowl: true, freeHit: true,  byes: true,  sixOut: false, lbw: false, hitWicket: false, lastManStands: true,  retireAt: 30, retiredReturn: true, maxOversPerBowler: 2, consecutiveOvers: false },
    box:      { overs: 4,  ballsPerOver: 6, wideRuns: 1, wideRebowl: true, nbRuns: 1, nbRebowl: true, freeHit: false, byes: false, sixOut: true,  lbw: false, hitWicket: false, lastManStands: true,  retireAt: 0,  retiredReturn: true, maxOversPerBowler: 0, consecutiveOvers: false },
    official: { overs: 20, ballsPerOver: 6, wideRuns: 1, wideRebowl: true, nbRuns: 1, nbRebowl: true, freeHit: true,  byes: true,  sixOut: false, lbw: true,  hitWicket: true,  lastManStands: false, retireAt: 0,  retiredReturn: true, maxOversPerBowler: 4, consecutiveOvers: false }
  };
  const EXTRA_DEFAULTS = { singleBatter: false, sixOutRuns: false, jokerBowls: true, superOverWickets: 2, bowloutBalls: 5, houseRules: [] };
  const BOOL_KEYS = ['singleBatter', 'wideRebowl', 'nbRebowl', 'freeHit', 'byes', 'sixOut', 'sixOutRuns', 'lbw', 'hitWicket', 'lastManStands', 'retiredReturn', 'consecutiveOvers', 'jokerBowls'];
  const INT_KEYS = {
    overs: [1, 50, 5], ballsPerOver: [1, 10, 6], wideRuns: [0, 5, 1], nbRuns: [0, 5, 1],
    retireAt: [0, 500, 0], maxOversPerBowler: [0, 50, 0], superOverWickets: [1, 10, 2], bowloutBalls: [1, 10, 5]
  };
  const DISMISSALS = ['bowled', 'caught', 'stumped', 'runOut', 'lbw', 'hitWicket', 'sixOut'];

  function fail(code, detail) {
    const e = new Error(code + (detail ? ': ' + detail : ''));
    e.code = code;
    return e;
  }
  function toInt(v, lo, hi, dflt) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
  }
  function runsArg(v) {
    const n = v == null ? 0 : v;
    if (!Number.isInteger(n) || n < 0 || n > 7) throw fail('bad_runs');
    return n;
  }
  const other = (side) => (side === 'A' ? 'B' : 'A');

  /* ---------- config ---------- */
  function normalizeConfig(cfg) {
    const c = Object.assign({}, PRESETS.gully, EXTRA_DEFAULTS, cfg || {});
    for (const k in INT_KEYS) { const r = INT_KEYS[k]; c[k] = toInt(c[k], r[0], r[1], r[2]); }
    for (const k of BOOL_KEYS) c[k] = !!c[k];
    c.houseRules = Array.isArray(c.houseRules) ? c.houseRules.slice() : [];
    return c;
  }

  /* ---------- teams ---------- */
  function squad(match, side) {
    const t = match.teams && match.teams[side];
    const ids = t ? t.players.map((p) => p.id) : [];
    if (match.joker && match.joker.id && ids.indexOf(match.joker.id) < 0) ids.push(match.joker.id);
    return ids;
  }
  function isJoker(match, id) { return !!(match.joker && match.joker.id === id); }
  function teamOf(match, id) {
    if (match.joker && match.joker.id === id) return 'J';
    if (match.teams.A.players.some((p) => p.id === id)) return 'A';
    if (match.teams.B.players.some((p) => p.id === id)) return 'B';
    return null;
  }
  /* Everyone can get out when batting alone (single-batter rule) or when the last batter may bat alone. */
  function totalWickets(s, side) {
    const n = squad(s.match, side).length;
    return s.config.lastManStands || s.config.singleBatter ? n : Math.max(1, n - 1);
  }
  function wicketsInHand(s, inn) {
    const n = inn.squad.length;
    return inn.soloStart || s.config.lastManStands || s.config.singleBatter ? n : Math.max(1, n - 1);
  }
  function firstBatting(match) {
    const t = match.toss || {};
    const w = t.winner === 'B' ? 'B' : 'A';
    return t.choice === 'bowl' ? other(w) : w;
  }

  /* ---------- innings ---------- */
  function newInnings(s, bat, o) {
    const ids = squad(s.match, bat);
    const batters = {};
    ids.forEach((id) => {
      batters[id] = { id, runs: 0, balls: 0, fours: 0, sixes: 0, status: 'yet', how: null, bowler: null, retiredOnce: false };
    });
    return {
      idx: s.innings.length, bat, bowl: other(bat), isSuper: !!o.isSuper, superNo: o.superNo || 0,
      maxBalls: o.maxBalls, maxWkts: o.maxWkts == null ? Infinity : o.maxWkts,
      target: o.target == null ? null : o.target,
      started: false, done: false, endReason: null, solo: false, soloStart: false,
      runs: 0, wkts: 0, balls: 0, extras: { wd: 0, nb: 0, b: 0, lb: 0 },
      striker: null, nonStriker: null, bowler: null, lastOverBowler: null,
      squad: ids, batters, order: [], bowlers: {}, bowlerOrder: [],
      overs: [[]], overRuns: 0, overBalls: 0, fow: [], freeHit: false, part: { runs: 0, balls: 0 }
    };
  }
  function ensureBowler(inn, id) {
    if (!inn.bowlers[id]) {
      inn.bowlers[id] = { id, balls: 0, runs: 0, wkts: 0, dots: 0, maidens: 0, wd: 0, nb: 0 };
      inn.bowlerOrder.push(id);
    }
    return inn.bowlers[id];
  }
  function swapEnds(inn) {
    if (inn.solo) return;
    const t = inn.striker; inn.striker = inn.nonStriker; inn.nonStriker = t;
  }
  function vacancies(inn) {
    if (!inn || !inn.started || inn.done) return 0;
    let v = 0;
    if (!inn.striker) v++;
    if (!inn.solo && !inn.nonStriker) v++;
    return v;
  }
  function finish(inn, why) { inn.done = true; inn.endReason = why; inn.freeHit = false; }

  /* Who may walk in next: unused batters first, then retired ones (if allowed).
     A common player who is bowling right now is only used as a last resort. */
  function batterCandidates(s, inn) {
    if (!inn) return [];
    const busy = (id) => id === inn.striker || id === inn.nonStriker;
    const pick = (st) => inn.squad.filter((id) => inn.batters[id].status === st && !busy(id));
    let list = pick('yet');
    if (!list.length && s.config.retiredReturn) list = pick('retired');
    const free = list.filter((id) => id !== inn.bowler);
    return free.length ? free : list;
  }

  /* Legality matrix: which dismissals each delivery allows. */
  function allowedDismissals(s, kind) {
    const c = s.config;
    const inn = s.innings[s.cur];
    if ((inn && inn.freeHit) || kind === 'noball') return ['runOut'];
    if (kind === 'wide') return c.hitWicket ? ['stumped', 'runOut', 'hitWicket'] : ['stumped', 'runOut'];
    const a = ['bowled', 'caught', 'stumped', 'runOut'];
    if (c.lbw) a.push('lbw');
    if (c.hitWicket) a.push('hitWicket');
    if (c.sixOut) a.push('sixOut');
    return a;
  }

  /* Bowler picker with reasons. Impossible constraints relax: cap first, then back-to-back.
     forChange = mid-over replacement ("baby over" / injury): the current bowler is left out. */
  function bowlerOptions(s, inn, forChange) {
    const c = s.config;
    const ids = squad(s.match, inn.bowl).filter((id) => id !== inn.striker && id !== inn.nonStriker &&
      (c.jokerBowls || !isJoker(s.match, id)) && !(forChange && id === inn.bowler));
    const cap = c.maxOversPerBowler > 0 && !inn.isSuper ? c.maxOversPerBowler * c.ballsPerOver : Infinity;
    const midOver = inn.overBalls > 0;
    let list = ids.map((id) => {
      const b = inn.bowlers[id];
      const balls = b ? b.balls : 0;
      let reason = null;
      if (!c.consecutiveOvers && !inn.isSuper && !midOver && id === inn.lastOverBowler) reason = 'consecutive';
      else if (balls >= cap) reason = 'cap';
      return { id, balls, reason, relaxed: null };
    });
    if (list.length && list.every((x) => x.reason)) {
      list = list.map((x) => (x.reason === 'cap' ? Object.assign({}, x, { reason: null, relaxed: 'cap' }) : x));
      if (list.every((x) => x.reason)) list = list.map((x) => Object.assign({}, x, { reason: null, relaxed: x.relaxed || x.reason }));
    }
    return list.map((x) => ({ id: x.id, balls: x.balls, disabled: !!x.reason, reason: x.reason, relaxed: x.relaxed }));
  }

  function checkEnd(s, inn) {
    if (inn.done || !inn.started) return;
    if (inn.target != null && inn.runs >= inn.target) return finish(inn, 'target');
    if (inn.wkts >= inn.maxWkts) return finish(inn, 'allout');
    const at = [inn.striker, inn.nonStriker].filter(Boolean);
    if (at.length < (inn.solo ? 1 : 2) && batterCandidates(s, inn).length === 0) {
      if (at.length === 1 && s.config.lastManStands) {
        inn.striker = at[0]; inn.nonStriker = null; inn.solo = true;
      } else {
        return finish(inn, 'allout');
      }
    }
    if (inn.balls >= inn.maxBalls) return finish(inn, 'overs');
  }

  function dismiss(inn, id, how) {
    const b = inn.batters[id];
    const credit = how !== 'runOut';
    b.status = 'out'; b.how = how; b.bowler = credit ? inn.bowler : null;
    if (credit) inn.bowlers[inn.bowler].wkts += 1;
    inn.wkts += 1;
    inn.fow.push({ n: inn.wkts, runs: inn.runs, balls: inn.balls, id });
    if (inn.striker === id) inn.striker = null;
    else if (inn.nonStriker === id) inn.nonStriker = null;
    inn.part = { runs: 0, balls: 0 };
  }

  function closeOver(inn) {
    const bw = inn.bowlers[inn.bowler];
    if (bw && inn.overRuns === 0) bw.maidens += 1;
    inn.lastOverBowler = inn.bowler;
    inn.bowler = null;
    inn.overRuns = 0; inn.overBalls = 0;
    inn.overs.push([]);
    swapEnds(inn);
  }

  function autoRetire(s, inn) {
    const lim = s.config.retireAt;
    if (!lim || inn.isSuper || inn.done) return;
    ['striker', 'nonStriker'].forEach((slot) => {
      const id = inn[slot];
      if (!id) return;
      const b = inn.batters[id];
      if (b.runs < lim || b.retiredOnce) return;
      if (!inn.squad.some((x) => inn.batters[x].status === 'yet')) return;
      b.status = 'retired'; b.retiredOnce = true; inn[slot] = null;
      inn.part = { runs: 0, balls: 0 };
    });
  }

  /* ---------- event handlers ---------- */
  function applyStart(s, inn, e) {
    if (!s.pending || s.pending.type !== 'openers') throw fail('not_expected', 'start');
    const bowlSquad = squad(s.match, inn.bowl);
    const st = e.striker, ns = e.nonStriker || null, bw = e.bowler;
    if (inn.squad.indexOf(st) < 0) throw fail('bad_striker');
    // Single-batter rule: one batter at the crease. Otherwise a missing non-striker means "bat alone" this innings.
    if (ns && (s.config.singleBatter || inn.squad.indexOf(ns) < 0 || ns === st)) throw fail('bad_non_striker');
    if (bowlSquad.indexOf(bw) < 0 || bw === st || bw === ns || (!s.config.jokerBowls && isJoker(s.match, bw))) throw fail('bad_bowler');
    inn.striker = st; inn.nonStriker = ns; inn.solo = !ns; inn.soloStart = !ns;
    [st, ns].forEach((id) => { if (id) { inn.batters[id].status = 'batting'; inn.order.push(id); } });
    inn.bowler = bw; ensureBowler(inn, bw);
    inn.started = true;
  }

  function applyBall(s, inn, e) {
    if (s.pending) throw fail('not_expected', 'ball');
    const c = s.config;
    const kind = e.kind || 'legal';
    if (kind !== 'legal' && kind !== 'wide' && kind !== 'noball') throw fail('bad_kind');
    let bat = runsArg(e.bat);
    const ext = runsArg(e.ext);
    if (kind === 'wide' && bat) throw fail('wide_has_bat_runs');
    let extType = null;
    if (ext > 0 && kind !== 'wide') {
      if (!c.byes) throw fail('byes_off');
      if (bat) throw fail('bat_and_byes');
      extType = e.extType === 'lb' ? 'lb' : 'b';
    }
    let w = e.wicket ? { how: e.wicket.how, out: e.wicket.out === 'nonStriker' ? 'nonStriker' : 'striker' } : null;
    // Gully rule: a six off a legal, non-free-hit ball is out (lost ball / neighbour's window).
    // sixOutRuns decides whether the six still counts before the batter walks.
    if (!w && kind === 'legal' && bat === 6 && c.sixOut && !inn.freeHit) w = { how: 'sixOut', out: 'striker' };
    if (w) {
      if (DISMISSALS.indexOf(w.how) < 0 || allowedDismissals(s, kind).indexOf(w.how) < 0) throw fail('dismissal_not_allowed', w.how);
      if (w.how === 'sixOut') { if (ext) throw fail('runs_on_dismissal'); bat = c.sixOutRuns ? 6 : 0; w.out = 'striker'; }
      else if (w.how !== 'runOut') { if (bat || ext) throw fail('runs_on_dismissal'); w.out = 'striker'; }
      if (w.out === 'nonStriker' && !inn.nonStriker) throw fail('no_non_striker');
    }

    const penalty = kind === 'wide' ? c.wideRuns : kind === 'noball' ? c.nbRuns : 0;
    const legal = kind === 'legal' || (kind === 'wide' && !c.wideRebowl) || (kind === 'noball' && !c.nbRebowl);
    const total = penalty + bat + ext;
    const strikerId = inn.striker, nonId = inn.nonStriker;
    const sb = inn.batters[strikerId];
    const bw = ensureBowler(inn, inn.bowler);
    const wasFreeHit = inn.freeHit;

    inn.runs += total;
    if (kind === 'wide') inn.extras.wd += penalty + ext;
    else {
      if (kind === 'noball') inn.extras.nb += penalty;
      if (extType) inn.extras[extType] += ext;
    }
    if (kind !== 'wide') {
      sb.balls += 1; sb.runs += bat;
      if (bat === 4) sb.fours += 1;
      if (bat === 6) sb.sixes += 1;
    }
    const charged = penalty + bat + (kind === 'wide' ? ext : 0);
    bw.runs += charged;
    if (kind === 'wide') bw.wd += 1;
    else if (kind === 'noball') bw.nb += 1;
    if (legal) {
      bw.balls += 1;
      if (charged === 0) bw.dots += 1;
      inn.balls += 1; inn.overBalls += 1;
    }
    inn.overRuns += charged;
    inn.part.runs += total;
    if (legal) inn.part.balls += 1;

    if (kind === 'noball' && c.freeHit) inn.freeHit = true;
    else if (kind === 'legal') inn.freeHit = false;

    const ran = kind === 'wide' ? ext : bat + ext;
    if (w) {
      const outId = w.out === 'nonStriker' ? nonId : strikerId;
      if (w.how === 'runOut' && ran % 2 === 1) swapEnds(inn);
      dismiss(inn, outId, w.how);
    } else if (ran % 2 === 1) {
      swapEnds(inn);
    }

    inn.overs[inn.overs.length - 1].push({ kind, bat, ext, et: extType, w: w ? w.how : null, runs: total, legal, fh: wasFreeHit, bowler: bw.id });

    if (legal && inn.overBalls >= c.ballsPerOver) closeOver(inn);
    checkEnd(s, inn);
    if (!inn.done) { autoRetire(s, inn); checkEnd(s, inn); }
  }

  function applyBatter(s, inn, e) {
    if (!s.pending || s.pending.type !== 'batter') throw fail('not_expected', 'batter');
    if (batterCandidates(s, inn).indexOf(e.id) < 0) throw fail('bad_batter');
    const b = inn.batters[e.id];
    if (b.status === 'yet') inn.order.push(e.id);
    b.status = 'batting';
    if (!inn.striker) inn.striker = e.id; else inn.nonStriker = e.id;
    if (e.id === inn.bowler) inn.bowler = null; // common player leaves the bowling crease to bat
  }

  function applyBowler(s, inn, e) {
    if (!s.pending || s.pending.type !== 'bowler') throw fail('not_expected', 'bowler');
    const o = bowlerOptions(s, inn).find((x) => x.id === e.id);
    if (!o || o.disabled) throw fail('bad_bowler');
    inn.bowler = e.id;
    ensureBowler(inn, e.id);
  }

  function applyChangeBowler(s, inn, e) {
    if (s.pending) throw fail('not_expected', 'changeBowler');
    if (!inn.started || inn.done || !inn.bowler) throw fail('not_live');
    const o = bowlerOptions(s, inn, true).find((x) => x.id === e.id);
    if (!o || o.disabled) throw fail('bad_bowler');
    inn.bowler = e.id;
    ensureBowler(inn, e.id);
  }

  function applySwap(s, inn) {
    if (s.pending && s.pending.type !== 'bowler') throw fail('not_expected', 'swap');
    if (!inn.started || inn.done || inn.solo || !inn.striker || !inn.nonStriker) throw fail('cannot_swap');
    swapEnds(inn);
  }

  function applyRetire(s, inn, e) {
    if (s.pending && s.pending.type !== 'bowler') throw fail('not_expected', 'retire');
    if (!inn.started || inn.done) throw fail('not_live');
    const slot = e.slot === 'nonStriker' ? 'nonStriker' : 'striker';
    const id = inn[slot];
    if (!id) throw fail('no_batter');
    const replacement = inn.squad.some((x) => x !== id && (inn.batters[x].status === 'yet' ||
      (s.config.retiredReturn && inn.batters[x].status === 'retired')));
    if (!replacement) throw fail('no_replacement');
    const b = inn.batters[id];
    b.status = 'retired'; b.retiredOnce = true; inn[slot] = null;
    inn.part = { runs: 0, balls: 0 };
  }

  function applyEnd(s, inn) {
    if (!inn.started || inn.done) throw fail('not_live');
    if (s.pending && s.pending.type !== 'batter' && s.pending.type !== 'bowler') throw fail('not_expected', 'end');
    finish(inn, 'declared');
  }

  function applyTiebreak(s, e) {
    if (!s.pending || s.pending.type !== 'tie') throw fail('not_expected', 'tiebreak');
    if (e.mode === 'share') s.result = { type: 'tie', winner: null };
    else if (e.mode === 'super') createSuper(s);
    else if (e.mode === 'bowlout') s.bowlout = { first: s.innings[s.innings.length - 1].bat, n: s.config.bowloutBalls, A: [], B: [] };
    else throw fail('bad_mode');
    s.tiebreaks.push(e.mode);
  }

  function applyBowl(s, e) {
    if (!s.pending || s.pending.type !== 'bowlout') throw fail('not_expected', 'bowl');
    s.bowlout[bowloutTurn(s.bowlout)].push(!!e.hit);
  }

  /* ---------- super over + bowl-out ---------- */
  function createSuper(s) {
    const prev = s.innings[s.innings.length - 1];
    const bat = prev.bat; // the side that batted last bats first in the super over
    const superNo = s.innings.filter((i) => i.isSuper).length / 2 + 1;
    const inn = newInnings(s, bat, { isSuper: true, superNo, maxBalls: s.config.ballsPerOver, maxWkts: Math.min(s.config.superOverWickets, totalWickets(s, bat)) });
    s.innings.push(inn); s.cur = inn.idx;
  }
  function createSuperChase(s, first) {
    const bat = first.bowl;
    const inn = newInnings(s, bat, { isSuper: true, superNo: first.superNo, maxBalls: s.config.ballsPerOver, maxWkts: Math.min(s.config.superOverWickets, totalWickets(s, bat)), target: first.runs + 1 });
    s.innings.push(inn); s.cur = inn.idx;
  }
  function bowloutTurn(bo) {
    const f = bo.first, g = other(f);
    return bo[f].length <= bo[g].length ? f : g;
  }
  function bowloutResult(bo) {
    const f = bo.first, g = other(f), n = bo.n;
    const hits = (side) => bo[side].filter(Boolean).length;
    const lf = bo[f].length, lg = bo[g].length, hf = hits(f), hg = hits(g);
    const win = (side) => ({ type: 'bowlout', winner: side, a: hits(side), b: hits(other(side)) });
    if (lf <= n && lg <= n) {
      if (hf > hg + (n - lg)) return win(f);
      if (hg > hf + (n - lf)) return win(g);
      if (lf === n && lg === n && hf !== hg) return win(hf > hg ? f : g);
      return null;
    }
    if (lf === lg && hf !== hg) return win(hf > hg ? f : g); // sudden death, decided per full round
    return null;
  }

  function mainResult(s) {
    const i1 = s.innings[0], i2 = s.innings[1];
    if (i2.runs >= i2.target) return { type: 'wickets', winner: i2.bat, margin: wicketsInHand(s, i2) - i2.wkts, ballsLeft: i2.maxBalls - i2.balls };
    if (i2.runs === i2.target - 1) return null;
    return { type: 'runs', winner: i1.bat, margin: i2.target - 1 - i2.runs };
  }
  function superResult(s, b) {
    const a = s.innings[b.idx - 1];
    if (b.runs >= b.target) return { type: 'super', winner: b.bat, superNo: b.superNo };
    if (b.runs === a.runs) return null;
    return { type: 'super', winner: a.bat, superNo: b.superNo };
  }

  /* ---------- the state machine: what must happen next ---------- */
  function settle(s) {
    s.pending = null;
    if (s.result) return;
    if (s.bowlout) {
      const r = bowloutResult(s.bowlout);
      if (r) s.result = r; else s.pending = { type: 'bowlout', side: bowloutTurn(s.bowlout) };
      return;
    }
    let inn = s.innings[s.cur];
    if (inn.done) {
      if (!inn.isSuper && inn.idx === 0) {
        const chase = newInnings(s, inn.bowl, { maxBalls: s.config.overs * s.config.ballsPerOver, target: inn.runs + 1 });
        s.innings.push(chase); s.cur = chase.idx; inn = chase;
      } else if (!inn.isSuper) {
        const r = mainResult(s);
        if (r) s.result = r; else s.pending = { type: 'tie' };
        return;
      } else if (inn.target == null) {
        createSuperChase(s, inn); inn = s.innings[s.cur];
      } else {
        const r = superResult(s, inn);
        if (r) s.result = r; else s.pending = { type: 'tie' };
        return;
      }
    }
    if (!inn.started) { s.pending = { type: 'openers' }; return; }
    if (vacancies(inn) > 0) { s.pending = { type: 'batter' }; return; }
    if (!inn.bowler) { s.pending = { type: 'bowler' }; return; }
  }

  function init(match) {
    if (!match || !match.teams || !match.teams.A || !match.teams.B) throw fail('bad_match');
    const c = normalizeConfig(match.config);
    const s = { match, config: c, innings: [], cur: 0, pending: null, result: null, bowlout: null, tiebreaks: [], n: 0 };
    s.innings.push(newInnings(s, firstBatting(match), { maxBalls: c.overs * c.ballsPerOver }));
    settle(s);
    return s;
  }

  function apply(s, e) {
    if (!e || typeof e.t !== 'string') throw fail('bad_event');
    if (s.result) throw fail('match_over');
    const inn = s.innings[s.cur];
    switch (e.t) {
      case 'start': applyStart(s, inn, e); break;
      case 'ball': applyBall(s, inn, e); break;
      case 'batter': applyBatter(s, inn, e); break;
      case 'bowler': applyBowler(s, inn, e); break;
      case 'changeBowler': applyChangeBowler(s, inn, e); break;
      case 'swap': applySwap(s, inn); break;
      case 'retire': applyRetire(s, inn, e); break;
      case 'end': applyEnd(s, inn); break;
      case 'tiebreak': applyTiebreak(s, e); break;
      case 'bowl': applyBowl(s, e); break;
      default: throw fail('bad_event', e.t);
    }
    s.n += 1;
    settle(s);
    return s;
  }

  function replay(match) {
    const s = init(match);
    (match.events || []).forEach((e) => apply(s, e));
    return s;
  }

  function tryAppend(match, e) {
    try {
      const m = Object.assign({}, match, { events: (match.events || []).concat([e]) });
      return { ok: true, state: replay(m) };
    } catch (err) {
      return { ok: false, error: (err && err.code) || String((err && err.message) || err) };
    }
  }

  /* ---------- derived numbers ---------- */
  function formatOvers(balls, bpo) { return Math.floor(balls / bpo) + '.' + (balls % bpo); }
  function runRate(runs, balls, bpo) { return balls ? (runs * bpo) / balls : 0; }
  function chaseInfo(inn, bpo) {
    if (!inn || inn.target == null) return null;
    const need = Math.max(0, inn.target - inn.runs);
    const left = Math.max(0, inn.maxBalls - inn.balls);
    return { need, left, rrr: left ? (need * bpo) / left : 0 };
  }
  function ballText(b) {
    if (b.w) return { t: b.runs ? b.runs + 'W' : 'W', tone: 'w' };
    if (b.kind === 'wide') return { t: (b.runs > 1 ? b.runs : '') + 'wd', tone: 'x' };
    if (b.kind === 'noball') return { t: 'nb' + (b.bat ? b.bat : '') + (b.ext ? '+' + b.ext + b.et : ''), tone: 'x' };
    if (b.et) return { t: b.ext + b.et, tone: 'x' };
    if (b.bat === 4) return { t: '4', tone: '4' };
    if (b.bat === 6) return { t: '6', tone: '6' };
    return { t: b.bat ? String(b.bat) : '•', tone: b.bat ? 'r' : '0' };
  }
  function card(inn) {
    return {
      batting: inn.order.map((id) => inn.batters[id]),
      dnb: inn.squad.filter((id) => inn.batters[id].status === 'yet'),
      bowling: inn.bowlerOrder.map((id) => inn.bowlers[id]).filter((b) => b.balls > 0 || b.runs > 0 || b.wkts > 0),
      extras: inn.extras, runs: inn.runs, wkts: inn.wkts, balls: inn.balls, fow: inn.fow
    };
  }

  /* Performer of the match: batting impact + bowling impact vs. the day's run rate. */
  function performers(s) {
    const bpo = s.config.ballsPerOver;
    const main = s.innings.filter((i) => !i.isSuper && i.started);
    const P = {};
    const get = (id) => P[id] || (P[id] = { id, runs: 0, balls: 0, fours: 0, sixes: 0, outs: 0, ducks: 0, bBalls: 0, bRuns: 0, wkts: 0, dots: 0, batted: false });
    main.forEach((inn) => {
      inn.order.forEach((id) => {
        const b = inn.batters[id], p = get(id);
        p.batted = true; p.runs += b.runs; p.balls += b.balls; p.fours += b.fours; p.sixes += b.sixes;
        if (b.status === 'out') { p.outs += 1; if (b.runs === 0) p.ducks += 1; }
      });
      inn.bowlerOrder.forEach((id) => {
        const w = inn.bowlers[id];
        if (!w.balls && !w.runs) return;
        const p = get(id);
        p.bBalls += w.balls; p.bRuns += w.runs; p.wkts += w.wkts; p.dots += w.dots;
      });
    });
    const runs = main.reduce((a, i) => a + i.runs, 0);
    const balls = main.reduce((a, i) => a + i.balls, 0);
    const rpo = balls ? runs / (balls / bpo) : 0;
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const r1 = (v) => Math.round(v * 10) / 10;
    const list = Object.keys(P).map((id) => {
      const p = P[id];
      let bat = 0, bowl = 0;
      if (p.batted) {
        bat = p.runs + p.fours + 2 * p.sixes;
        if (p.balls >= 6) bat += clamp((p.runs / p.balls * 100 - 100) / 10, -5, 10);
        bat += p.runs >= 50 ? 15 : p.runs >= 25 ? 8 : 0;
        bat -= 3 * p.ducks;
      }
      if (p.bBalls > 0) {
        bowl = 20 * p.wkts + p.dots + ((p.bBalls / bpo) * rpo - p.bRuns) + (p.wkts >= 3 ? 10 : 0);
      }
      return { id, team: teamOf(s.match, id), bat: r1(bat), bowl: r1(bowl), pts: r1(bat + bowl), stats: p };
    });
    list.sort((a, b) => b.pts - a.pts);
    const winner = s.result && s.result.winner;
    if (winner && list.length > 1) {
      const onWin = (x) => x.team === winner || x.team === 'J';
      if (!onWin(list[0]) && onWin(list[1]) && list[0].pts - list[1].pts <= 2) {
        const t = list[0]; list[0] = list[1]; list[1] = t;
      }
    }
    return list;
  }

  return {
    VERSION: 2, PRESETS, DISMISSALS, normalizeConfig, squad, teamOf, isJoker, firstBatting, totalWickets, other,
    replay, tryAppend, allowedDismissals, batterCandidates, bowlerOptions, vacancies,
    performers, formatOvers, runRate, chaseInfo, ballText, card
  };
});
