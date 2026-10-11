/* Gully Cricket app shell: storage, screens, scoring pad, poster. Needs GullyEngine + GullyI18n. */
(function () {
  'use strict';
  const E = window.GullyEngine;
  const L = window.GullyI18n;

  /* ---------- utilities ---------- */
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = (p) => (p || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  // The Android app shell (WebView) exposes GullyNative for save / share / copy. It is absent in the browser artifact.
  const NATIVE = window.GullyNative && typeof window.GullyNative.saveFile === 'function' ? window.GullyNative : null;
  const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(String(c)) ? c : '#8A93A6');
  function reducedMotion() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function haptic(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* not allowed here */ } }
  function lum(hex) {
    const n = parseInt(safeColor(hex).slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }
  function inkOn(hex) { const l = lum(hex); return 1.05 / (l + 0.05) >= (l + 0.05) / 0.056 ? '#FFFFFF' : '#0B0E14'; }

  /* ---------- prefs + strings ---------- */
  const PREF_KEY = 'gully.prefs.v1', META_KEY = 'gully.meta.v1', MATCH_KEY = 'gully.m.';
  function lsGet(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } }
  // Low-memory phones start on the Solid look (no blur); anyone can switch in Settings.
  const lowEnd = (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
  const prefs = Object.assign({ lang: 'en', theme: 'auto', glass: lowEnd ? 'off' : 'on' }, lsGet(PREF_KEY) || {});
  function savePrefs() { lsSet(PREF_KEY, prefs); }
  function t(key, vars) {
    const d = L[prefs.lang] || L.en;
    let s = d[key];
    if (s == null) s = L.en[key];
    if (s == null) s = key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? '' : String(vars[k])));
    return s;
  }
  const h = (key, vars) => esc(t(key, vars));
  const initialTheme = document.documentElement.getAttribute('data-theme');
  function applyPrefs() {
    const r = document.documentElement;
    r.setAttribute('lang', prefs.lang === 'kn' ? 'kn' : 'en');
    if (prefs.theme === 'light' || prefs.theme === 'dark') r.setAttribute('data-theme', prefs.theme);
    else if (initialTheme) r.setAttribute('data-theme', initialTheme);
    else r.removeAttribute('data-theme');
    r.setAttribute('data-glass', prefs.glass === 'off' ? 'off' : 'on');
    if (NATIVE && typeof NATIVE.setDark === 'function') {
      let dark = prefs.theme === 'dark';
      if (prefs.theme === 'auto') { try { dark = initialTheme ? initialTheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { dark = true; } }
      try { NATIVE.setDark(dark); } catch (e) { /* older shell */ }
    }
  }

  /* ---------- constants ---------- */
  const COLORS = [
    { c: '#2F7BFF', n: 'Blue' }, { c: '#FF6A2B', n: 'Orange' }, { c: '#1FBF75', n: 'Green' }, { c: '#E93D82', n: 'Pink' },
    { c: '#8B5CF6', n: 'Violet' }, { c: '#F5B70A', n: 'Gold' }, { c: '#14B8C4', n: 'Teal' }, { c: '#EF4444', n: 'Red' }
  ];
  const HOUSE = ['oneTip', 'tipRun', 'underarm', 'wallCatch', 'trial'];
  const PRESET_KEYS = Object.keys(E.PRESETS.gully);
  const MAX_PLAYERS = 15;
  const NONE = '__none__'; // openers: "no non-striker" (bat alone this innings)
  const ic = (d) => '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const ICON = {
    back: ic('<path d="M15 18l-6-6 6-6"/>'),
    more: ic('<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>'),
    gear: ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    undo: ic('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
    swap: ic('<path d="M16 3l4 4-4 4"/><path d="M20 7H4"/><path d="M8 21l-4-4 4-4"/><path d="M4 17h16"/>'),
    share: ic('<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>'),
    trophy: ic('<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3"/><path d="M7 5H4v2a3 3 0 0 0 3 3"/>'),
    copy: ic('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
    download: ic('<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>'),
    x: ic('<path d="M18 6L6 18"/><path d="M6 6l12 12"/>'),
    plus: ic('<path d="M12 5v14"/><path d="M5 12h14"/>'),
    minus: ic('<path d="M5 12h14"/>'),
    check: ic('<path d="M20 6L9 17l-5-5"/>'),
    bat: ic('<path d="M14.5 3.5l6 6-9.2 9.2a2 2 0 0 1-2.8 0l-3.2-3.2a2 2 0 0 1 0-2.8z"/><path d="M6.5 17.5L3 21"/>'),
    ball: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="var(--ball)"/><path d="M5 6.5a9 9 0 0 1 0 11M19 6.5a9 9 0 0 0 0 11" fill="none" stroke="#fff" stroke-width="1.6"/></svg>',
    coin: ic('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/>')
  };

  /* ---------- data ---------- */
  function emptyData() { return { v: 1, teams: [], live: null, counter: 0, last: null, pairCfg: {}, savedAt: 0, matches: [] }; }
  function validMatch(m) { return !!(m && typeof m.id === 'string' && m.teams && m.teams.A && m.teams.B && Array.isArray(m.teams.A.players) && Array.isArray(m.teams.B.players) && Array.isArray(m.events) && m.toss); }
  function loadLocal() {
    const meta = lsGet(META_KEY) || {};
    const d = emptyData();
    d.teams = Array.isArray(meta.teams) ? meta.teams : [];
    d.live = meta.live || null; d.counter = +meta.counter || 0; d.last = meta.last || null;
    d.pairCfg = meta.pairCfg && typeof meta.pairCfg === 'object' ? meta.pairCfg : {}; d.savedAt = +meta.savedAt || 0;
    (Array.isArray(meta.ids) ? meta.ids : []).forEach((id) => { const m = lsGet(MATCH_KEY + id); if (validMatch(m)) d.matches.push(m); });
    d.matches.sort((a, b) => a.createdAt - b.createdAt);
    if (d.live && !d.matches.some((m) => m.id === d.live && m.status === 'live')) d.live = null;
    return d;
  }
  let D = loadLocal();
  function metaDoc() { return { v: 1, teams: D.teams, live: D.live, counter: D.counter, last: D.last, pairCfg: D.pairCfg, savedAt: D.savedAt }; }
  const findMatch = (id) => D.matches.find((m) => m.id === id) || null;
  const liveMatch = () => (D.live ? findMatch(D.live) : null);
  const teamById = (id) => D.teams.find((x) => x.id === id) || null;
  const pairKey = (a, b) => [a, b].sort().join('|');

  /* ---------- storage: localStorage cache + per-user cloud docs (db capability) ---------- */
  const DEL = { __delete: true };
  const FATAL = new Set(['invalid_argument', 'revoked', 'not_granted', 'capability_disabled', 'capability_removed', 'transform_error']);
  const Store = {
    mode: 'local', db: null, uid: null,
    q: { order: [], data: new Map(), busy: false, timer: 0, fails: 0 },
    metaPath() { return 'data/users/' + this.uid + '/gully'; },
    matchPath(id) { return 'data/users/' + this.uid + '/gully/matches/' + id; },
    saveMetaLocal() { lsSet(META_KEY, Object.assign(metaDoc(), { ids: D.matches.map((m) => m.id) })); },
    touchMeta() { D.savedAt = Date.now(); this.saveMetaLocal(); if (this.mode === 'cloud') this.queue(this.metaPath(), clone(metaDoc())); },
    touchMatch(m) { m.updatedAt = Date.now(); lsSet(MATCH_KEY + m.id, m); this.saveMetaLocal(); if (this.mode === 'cloud') this.queue(this.matchPath(m.id), clone(m)); },
    dropMatch(id) { lsDel(MATCH_KEY + id); this.saveMetaLocal(); if (this.mode === 'cloud') this.queue(this.matchPath(id), DEL); },
    setMode(m) { this.mode = m; if (S.sheet && S.sheet.type === 'settings') renderSheet(); },
    queue(path, data) {
      const q = this.q;
      if (!q.data.has(path)) q.order.push(path);
      q.data.set(path, data);
      clearTimeout(q.timer);
      q.timer = setTimeout(() => this.pump(), 350);
    },
    flushNow() { clearTimeout(this.q.timer); this.pump(); },
    async pump() {
      const q = this.q;
      if (q.busy || this.mode !== 'cloud') return;
      q.busy = true;
      let retryIn = 0;
      while (q.order.length && this.mode === 'cloud') {
        const path = q.order.shift();
        const data = q.data.get(path);
        q.data.delete(path);
        try {
          if (data === DEL) await this.db.doc(path).delete();
          else await this.db.doc(path).set(data);
          q.fails = 0;
        } catch (e) {
          const code = (e && e.code) || 'unavailable';
          if (code === 'quota_exceeded') { toast(t('quotaFull')); continue; }
          if (FATAL.has(code)) { this.setMode('local'); break; }
          if (!q.data.has(path)) { q.order.unshift(path); q.data.set(path, data); }
          q.fails += 1;
          if (q.fails > 6) { this.setMode('local'); break; }
          retryIn = Math.min(15000, 800 * q.fails) + Math.random() * 600;
          break;
        }
      }
      q.busy = false;
      if (this.mode === 'cloud' && q.order.length) { clearTimeout(q.timer); q.timer = setTimeout(() => this.pump(), retryIn || 350); }
    },
    async connect() {
      const cl = window.claude;
      if (!cl || typeof cl.use !== 'function') return;
      this.setMode('checking');
      let db = null, user = null, id = null;
      try { const r = await Promise.all([cl.use('db'), cl.use('user')]); db = r[0]; user = r[1]; } catch (e) { db = null; }
      try { id = user ? await user.id() : null; } catch (e) { id = null; }
      if (!db || !id) { this.setMode('local'); return; }
      this.db = db; this.uid = id;
      try {
        const metaRef = db.doc(this.metaPath());
        const res = await Promise.all([metaRef.get(), metaRef.collection('matches').limit(1000).get()]);
        const remoteMeta = res[0].exists ? clone(res[0].data()) : null;
        const remote = res[1].docs.filter((d) => d.exists).map((d) => clone(d.data())).filter(validMatch);
        const push = mergeRemote(remoteMeta, remote);
        D.matches.forEach((m) => lsSet(MATCH_KEY + m.id, m));
        this.saveMetaLocal();
        this.mode = 'cloud';
        push.forEach((m) => this.queue(this.matchPath(m.id), clone(m)));
        if (!remoteMeta || JSON.stringify(remoteMeta) !== JSON.stringify(metaDoc())) this.queue(this.metaPath(), clone(metaDoc()));
        this.setMode('cloud');
        rerenderSafe();
      } catch (e) {
        this.db = null; this.setMode('local');
      }
    },
    wipe() {
      const ids = D.matches.map((m) => m.id);
      ids.forEach((id) => lsDel(MATCH_KEY + id));
      D = emptyData(); D.savedAt = Date.now();
      this.saveMetaLocal();
      if (this.mode === 'cloud') { ids.forEach((id) => this.queue(this.matchPath(id), DEL)); this.queue(this.metaPath(), clone(metaDoc())); }
    }
  };
  function mergeRemote(meta, remote) {
    const byId = new Map(D.matches.map((m) => [m.id, m]));
    const remoteIds = new Set();
    const push = [];
    remote.forEach((rm) => {
      remoteIds.add(rm.id);
      const lm = byId.get(rm.id);
      if (!lm || (rm.updatedAt || 0) >= (lm.updatedAt || 0)) byId.set(rm.id, rm);
      else push.push(lm);
    });
    D.matches.forEach((lm) => { if (!remoteIds.has(lm.id)) push.push(lm); });
    D.matches = Array.from(byId.values()).sort((a, b) => a.createdAt - b.createdAt);
    if (meta) {
      const tm = new Map(D.teams.map((x) => [x.id, x]));
      (Array.isArray(meta.teams) ? meta.teams : []).forEach((rt) => { const lt = tm.get(rt.id); if (!lt || (rt.updatedAt || 0) >= (lt.updatedAt || 0)) tm.set(rt.id, rt); });
      D.teams = Array.from(tm.values());
      if ((meta.savedAt || 0) > (D.savedAt || 0)) {
        D.last = meta.last || D.last; D.live = meta.live || null; D.savedAt = meta.savedAt;
        D.pairCfg = Object.assign({}, D.pairCfg, meta.pairCfg || {});
      } else {
        D.pairCfg = Object.assign({}, meta.pairCfg || {}, D.pairCfg);
      }
    }
    D.counter = Math.max(D.counter || 0, (meta && +meta.counter) || 0, ...D.matches.map((m) => +m.no || 0));
    if (D.live && !D.matches.some((m) => m.id === D.live && m.status === 'live')) D.live = null;
    if (!D.live) { const lv = D.matches.filter((m) => m.status === 'live'); if (lv.length) D.live = lv[lv.length - 1].id; }
    return push;
  }

  /* ---------- engine bridge ---------- */
  const stCache = new WeakMap();
  function stateOf(m) {
    if (!m) return null;
    const last = m.events[m.events.length - 1];
    const c = stCache.get(m);
    if (c && c.len === m.events.length && c.last === last) return c.st;
    let st = null;
    try { st = E.replay(m); } catch (e) { st = null; }
    stCache.set(m, { len: m.events.length, last, st });
    return st;
  }
  function playerName(m, id) {
    if (!id) return '—';
    if (m.joker && m.joker.id === id) return m.joker.name;
    const p = m.teams.A.players.find((x) => x.id === id) || m.teams.B.players.find((x) => x.id === id);
    return p ? p.name : '?';
  }
  function teamColorOf(m, id) { const s = E.teamOf(m, id); return s === 'A' || s === 'B' ? safeColor(m.teams[s].color) : 'var(--ball)'; }
  function teamNameOf(m, id) { const s = E.teamOf(m, id); return s === 'A' || s === 'B' ? m.teams[s].name : t('joker'); }
  const ERRS = { no_replacement: 'errNoReplacement', cannot_swap: 'errCannotSwap' };
  function dispatch(ev) {
    const m = liveMatch();
    if (!m) return false;
    const r = E.tryAppend(m, ev);
    if (!r.ok) { const code = String(r.error).split(':')[0]; toast(ERRS[code] ? t(ERRS[code]) : t('errGeneric', { e: r.error })); return false; }
    m.events.push(ev);
    S.mod = noMods();
    S.sheet = null;
    if (r.state.result) {
      m.status = 'done'; m.result = summarize(m, r.state); m.finishedAt = Date.now();
      D.live = null; S.viewId = m.id; S.cardTab = 0;
      Store.touchMatch(m); Store.touchMeta();
      haptic(40);
      go('result');
      return true;
    }
    m.status = 'live';
    Store.touchMatch(m);
    render();
    return true;
  }
  function summarize(m, st) {
    const r = st.result;
    const top = E.performers(st)[0] || null;
    return {
      type: r.type, winner: r.winner || null, margin: r.margin == null ? null : r.margin, ballsLeft: r.ballsLeft == null ? null : r.ballsLeft,
      a: r.a == null ? null : r.a, b: r.b == null ? null : r.b, superNo: r.superNo || null,
      scores: st.innings.filter((i) => i.started).map((i) => ({ side: i.bat, runs: i.runs, wkts: i.wkts, balls: i.balls, sup: i.isSuper ? i.superNo : 0 })),
      potm: top ? { id: top.id, pts: top.pts } : null
    };
  }
  function resultText(m, res) {
    const r = res || m.result;
    if (!r) return '';
    if (r.type === 'tie' || !r.winner) return t('sharedRes');
    const team = m.teams[r.winner].name;
    if (r.type === 'runs') return t(r.margin === 1 ? 'wonRun1' : 'wonRuns', { team, n: r.margin });
    if (r.type === 'wickets') return t(r.margin === 1 ? 'wonWkt1' : 'wonWkts', { team, n: r.margin });
    if (r.type === 'super') return t('wonSuper', { team });
    if (r.type === 'bowlout') return t('wonBowlout', { team, a: r.a, b: r.b });
    return '';
  }
  function potmLine(st, p) {
    const s = p.stats, bpo = st.config.ballsPerOver, parts = [];
    if (s.batted) parts.push(s.runs + ' (' + s.balls + ')');
    if (s.bBalls > 0) parts.push(s.wkts + '/' + s.bRuns + ' (' + E.formatOvers(s.bBalls, bpo) + ')');
    return parts.join(' · ');
  }
  function howText(m, b) {
    if (b.status === 'batting') return t('notOut');
    if (b.status === 'retired') return t('how_retired');
    if (b.status === 'out') return t('how_' + b.how, { b: b.bowler ? playerName(m, b.bowler) : '' });
    return '';
  }
  function fmtDate(ts) {
    try { return new Intl.DateTimeFormat(prefs.lang === 'kn' ? 'kn-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ts)); }
    catch (e) { return new Date(ts).toDateString(); }
  }
  const figText = (b, bpo) => E.formatOvers(b.balls, bpo) + '-' + b.maidens + '-' + b.runs + '-' + b.wkts;
  function seriesFor(aId, bId) {
    let a = 0, b = 0, tie = 0;
    D.matches.forEach((m) => {
      if (m.status !== 'done' || !m.result) return;
      const ids = [m.teams.A.id, m.teams.B.id];
      if (ids.indexOf(aId) < 0 || ids.indexOf(bId) < 0) return;
      const w = m.result.winner;
      if (!w) { tie += 1; return; }
      const wid = m.teams[w].id;
      if (wid === aId) a += 1; else if (wid === bId) b += 1;
    });
    return { a, b, tie, n: a + b + tie };
  }
  function tossLine(m) {
    const ts = m.toss;
    return t(ts.mode === 'winner' ? 'prevWinnerLine' : 'tossLine', { team: m.teams[ts.winner].name, choice: t(ts.choice === 'bat' ? 'choiceBat' : 'choiceBowl') });
  }

  /* ---------- UI state ---------- */
  const noMods = () => ({ wide: false, nb: false, bye: false, lb: false });
  const S = { screen: 'home', draft: null, mod: noMods(), sheet: null, openers: {}, viewId: null, cardTab: 0, teamErr: [], poster: null, toastT: 0, enterT: 0 };
  const emptyToss = () => ({ caller: null, call: null, real: false, result: null, winner: null, choice: null, flipping: false });
  function mkTeam(name, color, names) { return { id: uid('t'), name, color, players: names.map((n) => ({ id: uid('p'), name: n })) }; }
  function newDraft(blank) {
    const example = !blank && !D.teams.length;
    return {
      example,
      A: example ? mkTeam('Basavanagudi Bulls', COLORS[0].c, ['Kiran', 'Rahul', 'Manju', 'Arjun', 'Pradeep']) : mkTeam('', COLORS[0].c, []),
      B: example ? mkTeam('Malleshwaram Mavericks', COLORS[1].c, ['Vinay', 'Ravi', 'Darshan', 'Naveen', 'Chethan']) : mkTeam('', COLORS[1].c, []),
      joker: { on: false, id: uid('j'), name: '', bowls: true },
      config: Object.assign(clone(E.PRESETS.gully), { houseRules: [] }),
      toss: emptyToss()
    };
  }
  function teamCopy(tm) { return { id: tm.id, name: tm.name, color: safeColor(tm.color), players: tm.players.map((p) => ({ id: p.id, name: p.name })) }; }
  function draftFromMatch(m) {
    const A = teamById(m.teams.A.id) || m.teams.A, B = teamById(m.teams.B.id) || m.teams.B;
    const cfg = Object.assign({}, D.pairCfg[pairKey(A.id, B.id)] || m.config);
    return {
      example: false, A: teamCopy(A), B: teamCopy(B),
      joker: m.joker ? { on: true, id: m.joker.id, name: m.joker.name, bowls: cfg.jokerBowls !== false } : { on: false, id: uid('j'), name: '', bowls: true },
      config: Object.assign(clone(E.PRESETS.gully), { houseRules: [] }, cfg), toss: emptyToss()
    };
  }
  function draftFromLast() {
    const A = teamById(D.last.A), B = teamById(D.last.B);
    const cfg = D.pairCfg[pairKey(A.id, B.id)] || {};
    const j = D.last.joker || {};
    return {
      example: false, A: teamCopy(A), B: teamCopy(B),
      joker: { on: !!j.on, id: j.id || uid('j'), name: j.name || '', bowls: j.bowls !== false },
      config: Object.assign(clone(E.PRESETS.gully), { houseRules: [] }, cfg), toss: emptyToss()
    };
  }

  /* ---------- render ---------- */
  const VIEWS = {}, SHEETS = {}, A = {}, INPUT = {};
  let lastScreen = null;
  function render(opts) {
    opts = opts || {};
    const app = $('#app');
    if (!app) return;
    let out = null, guard = 0;
    while (!out && guard++ < 4) {
      try { out = VIEWS[S.screen](); } catch (e) { console.error(e); S.screen = 'home'; S.sheet = null; }
    }
    if (!out) out = ['', ''];
    const same = lastScreen === S.screen;
    const y = window.scrollY;
    app.innerHTML = out[0];
    app.classList.toggle('has-bar', !!out[1]);
    $('#bar').innerHTML = out[1] ? '<div class="dock">' + out[1] + '</div>' : '';
    if (!same && !reducedMotion()) {
      app.classList.add('enter');
      clearTimeout(S.enterT);
      S.enterT = setTimeout(() => app.classList.remove('enter'), 520);
    }
    renderSheet();
    if (same && !opts.top) window.scrollTo(0, y); else window.scrollTo(0, 0);
    lastScreen = S.screen;
    if (opts.focus) { const el = document.getElementById(opts.focus); if (el) el.focus({ preventScroll: true }); }
    syncWakeLock();
  }
  function rerenderSafe() {
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
    render();
  }
  function renderSheet() {
    const root = $('#sheet');
    let html = '';
    if (S.screen === 'match' && !(S.sheet && S.sheet.type === 'confirm')) {
      const m = liveMatch(), st = stateOf(m);
      const p = st && st.pending && st.pending.type;
      if (p === 'batter') html = shNextBatter(m, st);
      else if (p === 'bowler') html = shNextBowler(m, st);
    }
    if (!html && S.sheet && SHEETS[S.sheet.type]) html = SHEETS[S.sheet.type]();
    const wasOpen = !root.hidden;
    root.innerHTML = html;
    root.hidden = !html;
    const bar = $('#bar');
    bar.hidden = !!html || !bar.innerHTML;
    document.body.style.overflow = html ? 'hidden' : '';
    if (html && !wasOpen) {
      const f = root.querySelector('.sheet [data-autofocus]') || root.querySelector('.sheet button:not([disabled])');
      if (f) f.focus({ preventScroll: true });
    }
  }
  function go(screen) { S.screen = screen; S.sheet = null; render({ top: true }); }
  function closeSheet() { S.sheet = null; renderSheet(); }
  function toast(msg) {
    const root = $('#toast');
    if (!root) return;
    root.innerHTML = '<div class="toast" role="status">' + esc(msg) + '</div>';
    clearTimeout(S.toastT);
    S.toastT = setTimeout(() => { root.innerHTML = ''; }, 2800);
  }
  function confirmAsk(msg, yes, danger) { S.sheet = { type: 'confirm', msg, yes, danger: danger !== false }; renderSheet(); }

  /* ---------- small components ---------- */
  function topbar(titleHtml, back, right) {
    return '<header class="top"><button class="icon-btn" data-act="' + back + '" aria-label="' + h('back') + '">' + ICON.back + '</button>' +
      '<h1 class="top-title">' + titleHtml + '</h1>' + (right || '<span class="icon-spacer" aria-hidden="true"></span>') + '</header>';
  }
  const iconBtn = (act, icon, label) => '<button class="icon-btn" data-act="' + act + '" aria-label="' + esc(label) + '">' + icon + '</button>';
  function seg(act, opts, val, key) {
    const idx = opts.findIndex((o) => String(o[0]) === String(val));
    return '<div class="seg" role="radiogroup" style="--n:' + opts.length + ';--i:' + Math.max(0, idx) + '">' +
      (idx >= 0 ? '<span class="seg-thumb" aria-hidden="true"></span>' : '') +
      opts.map((o) => '<button role="radio" aria-checked="' + (String(o[0]) === String(val)) + '" data-act="' + act + '" data-v="' + esc(o[0]) + '"' + (key ? ' data-k="' + key + '"' : '') + '>' + esc(o[1]) + '</button>').join('') + '</div>';
  }
  function switchRow(act, label, on, sub, extra) {
    return '<button class="row-switch" data-act="' + act + '" role="switch" aria-checked="' + !!on + '" ' + (extra || '') + '>' +
      '<span class="rs-text"><span class="rs-label">' + esc(label) + '</span>' + (sub ? '<span class="rs-sub">' + esc(sub) + '</span>' : '') + '</span>' +
      '<span class="switch" aria-hidden="true"><i></i></span></button>';
  }
  const chip = (label, on, act, extra, disabled) => '<button class="chip' + (on ? ' on' : '') + '" data-act="' + act + '" aria-pressed="' + !!on + '" ' + (extra || '') + (disabled ? ' disabled' : '') + '>' + label + '</button>';
  function teamPillHtml(team, side, on, act, disabled) {
    const c = safeColor(team.color);
    return '<button class="pill team-pill" style="--team:' + c + ';--team-ink:' + inkOn(c) + '" data-act="' + act + '" data-v="' + side + '" aria-pressed="' + !!on + '"' + (disabled ? ' disabled' : '') + '>' + esc(team.name) + '</button>';
  }
  function sheetWrap(title, body, forced) {
    return (forced ? '<div class="scrim" aria-hidden="true"></div>' : '<button class="scrim" data-act="closeSheet" aria-label="' + h('close') + '" tabindex="-1"></button>') +
      '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="grip" aria-hidden="true"></div>' +
      '<div class="sheet-head"><h2>' + esc(title) + '</h2>' + (forced ? '' : '<button class="icon-btn" data-act="closeSheet" aria-label="' + h('close') + '">' + ICON.x + '</button>') + '</div>' +
      body + '</div>';
  }
  const smallBtn = (act, icon, label, extra) => '<button class="pill pill-sm" data-act="' + act + '" ' + (extra || '') + '>' + (icon || '') + '<span>' + esc(label) + '</span></button>';
  function ballChip(b) { const x = E.ballText(b); return '<span class="tb tone-' + x.tone + (b.legal ? '' : ' mini') + '" title="' + esc(x.t) + '"><b>' + esc(x.t) + '</b></span>'; }

  /* ---------- HOME ---------- */
  VIEWS.home = () => {
    const live = liveMatch();
    const done = D.matches.filter((m) => m.status === 'done' && m.result).slice().reverse();
    const lastOk = D.last && teamById(D.last.A) && teamById(D.last.B);
    let x = '<header class="hero"><div class="brand"><span class="tb tb-logo" aria-hidden="true"></span><div><h1 class="brand-name">' + h('app') + '</h1><p class="brand-sub">' + h('tagline') + '</p></div></div>' +
      iconBtn('settings', ICON.gear, t('settings')) + '</header>';
    if (live) x += liveCard(live);
    x += '<button class="pill pill-xl primary wide" data-act="newMatch">' + ICON.plus + '<span>' + h('newMatch') + '</span></button>';
    if (lastOk && !live) {
      const a = teamById(D.last.A), b = teamById(D.last.B);
      const wid = lastPairWinner(a.id, b.id), wt = wid ? teamById(wid) : null;
      x += '<section class="pane"><p class="big-line">' + h('againTitle', { a: a.name, b: b.name }) + '</p><p class="meta">' + h('againSub') + '</p>' +
        '<div style="margin-top:14px"><button class="pill wide" data-act="again">' + ICON.coin + '<span>' + h('yesToss') + '</span></button>' +
        (wt ? '<button class="pill pill-lg wide pick-pill" data-act="againWinner"><span>' + h('winnerPick') + '</span><small>' + h('winnerPickSub', { team: wt.name }) + '</small></button>' : '') +
        '</div></section>';
    }
    x += '<div class="sec-row"><h2 class="sec">' + h('history') + '</h2>' + (done.length > 4 ? '<button class="link" data-act="history">' + h('seeAll') + '</button>' : '') + '</div>';
    x += done.length ? '<div class="list">' + done.slice(0, 4).map(rowItem).join('') + '</div>' : '<p class="meta" style="padding:0 4px">' + h('noHistory') + '</p>';
    if (!D.matches.length) x += howItWorks();
    return [x, ''];
  };
  function liveCard(m) {
    const st = stateOf(m);
    if (!st) return '';
    const inn = st.innings[st.cur], bpo = st.config.ballsPerOver, bat = m.teams[inn.bat];
    const line = inn.started ? esc(bat.name) + ' &nbsp;' + inn.runs + '/' + inn.wkts + ' <span class="vs">(' + E.formatOvers(inn.balls, bpo) + ')</span>' : esc(tossLine(m));
    return '<section class="pane live" style="--team:' + safeColor(bat.color) + '"><p class="eyebrow"><span class="live-dot" aria-hidden="true"></span>' + h('liveNow') + ' · ' + h('matchNo', { n: m.no }) + '</p>' +
      '<p class="big-line">' + esc(m.teams.A.name) + ' <span class="vs">vs</span> ' + esc(m.teams.B.name) + '</p><p class="score-line">' + line + '</p>' +
      '<button class="pill primary wide" data-act="resume">' + h('resume') + '</button></section>';
  }
  function rowItem(m) {
    const res = m.status === 'done' && m.result ? resultText(m) : t('liveNow');
    return '<button class="row-item" data-act="openMatch" data-id="' + esc(m.id) + '"><span class="ri-no">#' + (+m.no || 0) + '</span>' +
      '<span class="ri-main"><b>' + esc(m.teams.A.name) + ' <span class="vs">v</span> ' + esc(m.teams.B.name) + '</b><small>' + esc(res) + '</small></span>' +
      '<span class="ri-date">' + esc(fmtDate(m.createdAt)) + '</span></button>';
  }
  function howItWorks() {
    const demo = [{ kind: 'legal', bat: 1, runs: 1, legal: true }, { kind: 'legal', bat: 4, runs: 4, legal: true }, { kind: 'legal', bat: 0, runs: 0, legal: true },
      { kind: 'wide', bat: 0, ext: 0, runs: 1, legal: false }, { kind: 'legal', bat: 0, runs: 0, w: 'bowled', legal: true }, { kind: 'legal', bat: 6, runs: 6, legal: true }, { kind: 'legal', bat: 2, runs: 2, legal: true }];
    return '<section class="pane"><h2 class="sec">' + h('howTitle') + '</h2><div class="balls" aria-hidden="true">' + demo.map(ballChip).join('') + '</div>' +
      '<ol class="steps"><li>' + h('how1') + '</li><li>' + h('how2') + '</li><li>' + h('how3') + '</li><li>' + h('how4') + '</li></ol></section>';
  }
  VIEWS.history = () => {
    const all = D.matches.slice().reverse();
    return [topbar(h('history'), 'home') + (all.length ? '<div class="list">' + all.map(rowItem).join('') + '</div>' : '<p class="meta">' + h('noHistory') + '</p>'), ''];
  };

  /* ---------- TEAMS ---------- */
  VIEWS.teams = () => {
    const d = S.draft;
    if (!d) { S.screen = 'home'; return null; }
    let x = topbar(h('teams'), 'home');
    if (d.example) x += '<div class="note"><span>' + h('exampleNote') + '</span><button class="pill pill-sm" data-act="clearExample">' + h('clear') + '</button></div>';
    x += teamCard('A') + teamCard('B') + jokerCard();
    if (S.teamErr.length) x += '<div class="errors" role="alert">' + S.teamErr.map((e) => '<span>' + esc(e) + '</span>').join('') + '</div>';
    return [x, '<button class="pill primary" data-act="toRules">' + h('nextRules') + '</button>'];
  };
  function teamCard(side) {
    const d = S.draft, tm = d[side], oth = d[E.other(side)];
    const saved = D.teams.filter((s) => s.id !== oth.id);
    const c = safeColor(tm.color);
    return '<section class="pane team" style="--team:' + c + '">' +
      '<div class="team-head"><span class="team-dot" aria-hidden="true"></span><label class="sr" for="name' + side + '">' + h('teamName') + '</label>' +
      '<input id="name' + side + '" class="field field-name" data-in="name" data-side="' + side + '" value="' + esc(tm.name) + '" placeholder="' + h(side === 'A' ? 'teamA' : 'teamB') + '" maxlength="24" autocomplete="off"></div>' +
      (saved.length ? '<div class="chip-row saved-row" role="group" aria-label="' + h('pickSaved') + '">' + saved.map((s) => chip('<i style="--c:' + safeColor(s.color) + '"></i>' + esc(s.name) + ' <small>' + s.players.length + '</small>', s.id === tm.id, 'loadSaved', 'data-side="' + side + '" data-id="' + esc(s.id) + '"')).join('') + '</div>' : '') +
      '<div class="swatches" role="radiogroup" aria-label="' + h('color') + '">' + COLORS.map((o) => '<button class="swatch" style="--c:' + o.c + '" role="radio" aria-checked="' + (o.c === c) + '" aria-label="' + o.n + '" data-act="color" data-side="' + side + '" data-v="' + o.c + '"></button>').join('') + '</div>' +
      '<ul class="roster">' + tm.players.map((p, i) => '<li><span class="num">' + (i + 1) + '</span><span class="pname">' + esc(p.name) + '</span><button class="icon-sm" data-act="rmPlayer" data-side="' + side + '" data-id="' + esc(p.id) + '" aria-label="' + h('removePlayer', { name: p.name }) + '">' + ICON.x + '</button></li>').join('') + '</ul>' +
      '<div class="add-row"><label class="sr" for="add' + side + '">' + h('addPlaceholder') + '</label><input id="add' + side + '" class="field" data-enter="addPlayer" data-side="' + side + '" placeholder="' + h('addPlaceholder') + '" maxlength="300" autocomplete="off" enterkeyhint="done">' +
      '<button class="pill" data-act="addPlayer" data-side="' + side + '">' + ICON.plus + '<span>' + h('addPlayer') + '</span></button></div>' +
      '<p class="meta">' + h('players', { n: tm.players.length }) + '</p></section>';
  }
  function jokerCard() {
    const j = S.draft.joker;
    return '<section class="pane">' + switchRow('jokerToggle', t('joker'), j.on, t('jokerSub')) +
      (j.on ? '<label class="sr" for="jokerName">' + h('jokerName') + '</label><input id="jokerName" class="field" data-in="jokerName" value="' + esc(j.name) + '" placeholder="' + h('jokerName') + '" maxlength="24" autocomplete="off">' +
        switchRow('jokerBowls', t('jokerBowls'), j.bowls) : '') + '</section>';
  }
  INPUT.name = (el) => { S.draft[el.dataset.side].name = el.value; };
  INPUT.jokerName = (el) => { S.draft.joker.name = el.value; };
  A.addPlayer = (ds) => {
    const side = ds.side, input = document.getElementById('add' + side);
    if (!input) return;
    const tm = S.draft[side];
    const names = input.value.split(/[,\n;]+/).map((s) => s.trim().slice(0, 24)).filter(Boolean);
    if (!names.length) { input.focus(); return; }
    for (const n of names) {
      if (tm.players.length >= MAX_PLAYERS) { toast(t('maxPlayers')); break; }
      tm.players.push({ id: uid('p'), name: n });
    }
    input.value = '';
    S.teamErr = [];
    render({ focus: 'add' + side });
  };
  A.rmPlayer = (ds) => { const tm = S.draft[ds.side]; tm.players = tm.players.filter((p) => p.id !== ds.id); render(); };
  A.color = (ds) => { S.draft[ds.side].color = safeColor(ds.v); render(); };
  A.loadSaved = (ds) => {
    const s = teamById(ds.id);
    if (!s) return;
    const oth = S.draft[E.other(ds.side)];
    if (oth.id === s.id) { toast(t('inOtherSlot', { name: s.name })); return; }
    S.draft[ds.side] = teamCopy(s);
    S.draft.example = false;
    S.teamErr = [];
    render();
  };
  A.clearExample = () => { const d = newDraft(true); d.joker = S.draft.joker; S.draft = d; render(); };
  A.jokerToggle = () => { S.draft.joker.on = !S.draft.joker.on; render(S.draft.joker.on ? { focus: 'jokerName' } : {}); };
  A.jokerBowls = () => { S.draft.joker.bowls = !S.draft.joker.bowls; render(); };
  function validateTeams(d) {
    const errs = [];
    const an = d.A.name.trim(), bn = d.B.name.trim();
    if (!an || !bn) errs.push(t('errName'));
    else if (an.toLowerCase() === bn.toLowerCase()) errs.push(t('errSame'));
    if (d.A.players.length < 2 || d.B.players.length < 2) errs.push(t('errPlayers'));
    if (d.joker.on && !d.joker.name.trim()) errs.push(t('errJoker'));
    return errs;
  }
  function upsertTeam(tm) {
    const x = { id: tm.id, name: tm.name.trim(), color: safeColor(tm.color), players: tm.players.map((p) => ({ id: p.id, name: p.name })), updatedAt: Date.now() };
    const i = D.teams.findIndex((y) => y.id === tm.id);
    if (i >= 0) D.teams[i] = x; else D.teams.push(x);
  }
  A.toRules = () => {
    const d = S.draft;
    S.teamErr = validateTeams(d);
    if (S.teamErr.length) { render(); const el = document.querySelector('.errors'); if (el) el.scrollIntoView({ block: 'center' }); return; }
    d.A.name = d.A.name.trim(); d.B.name = d.B.name.trim(); d.joker.name = d.joker.name.trim();
    upsertTeam(d.A); upsertTeam(d.B); d.example = false;
    const saved = D.pairCfg[pairKey(d.A.id, d.B.id)];
    if (saved && !d.cfgTouched) d.config = Object.assign(clone(E.PRESETS.gully), { houseRules: [] }, saved);
    Store.touchMeta();
    go('rules');
  };

  /* ---------- RULES ---------- */
  function detectPreset(c) {
    for (const k of Object.keys(E.PRESETS)) {
      const p = E.PRESETS[k];
      if (PRESET_KEYS.every((key) => p[key] === c[key])) return k;
    }
    return 'custom';
  }
  VIEWS.rules = () => {
    const d = S.draft;
    if (!d) { S.screen = 'home'; return null; }
    const c = d.config, preset = detectPreset(c);
    const sw = (key, label, on) => switchRow('toggleRule', label, on, '', 'data-k="' + key + '"');
    let x = topbar(h('rules'), 'toTeams');
    x += '<section class="pane"><h2 class="sec">' + h('preset') + '</h2>' + seg('preset', ['gully', 'tennis', 'box', 'official'].map((k) => [k, t('p_' + k)]), preset) +
      (preset === 'custom' ? '<p class="meta">' + h('p_custom') + '</p>' : '') + '</section>';
    x += '<section class="pane"><h2 class="sec">' + h('format') + '</h2>' +
      '<div class="stepper-row"><span>' + h('overs') + '</span><div class="stepper">' +
      '<button class="icon-btn" data-act="oversStep" data-v="-1" aria-label="−">' + ICON.minus + '</button><output class="num-big" aria-live="polite">' + c.overs + '</output>' +
      '<button class="icon-btn" data-act="oversStep" data-v="1" aria-label="+">' + ICON.plus + '</button></div></div>' +
      '<div class="chip-row">' + [2, 3, 4, 5, 6, 8, 10, 20].map((n) => chip(String(n), c.overs === n, 'setNum', 'data-k="overs" data-v="' + n + '"')).join('') + '</div>' +
      '<div class="stepper-row" style="margin-top:16px"><span>' + h('bpo') + '</span>' + seg('setNum', [[4, '4'], [5, '5'], [6, '6']], c.ballsPerOver, 'ballsPerOver') + '</div></section>';
    x += '<section class="pane"><h2 class="sec">' + h('extras') + '</h2>' + sw('wideRuns', t('wideRun'), c.wideRuns > 0) + sw('wideRebowl', t('wideRebowl'), c.wideRebowl) +
      sw('nbRuns', t('nbRun'), c.nbRuns > 0) + sw('nbRebowl', t('nbRebowl'), c.nbRebowl) + sw('freeHit', t('freeHit'), c.freeHit) + sw('byes', t('byes'), c.byes) + '</section>';
    x += '<section class="pane"><h2 class="sec">' + h('outs') + '</h2>' + sw('sixOut', t('sixOut'), c.sixOut) + (c.sixOut ? sw('sixOutRuns', t('sixOutRuns'), c.sixOutRuns) : '') +
      (c.singleBatter ? '' : sw('lastManStands', t('lastMan'), c.lastManStands)) + sw('lbw', t('lbw'), c.lbw) + sw('hitWicket', t('hitWicket'), c.hitWicket) + '</section>';
    x += '<section class="pane"><h2 class="sec">' + h('batting') + '</h2><div class="stepper-row"><span>' + h('creaseQ') + '</span>' +
      seg('setBool', [['0', t('crease2')], ['1', t('crease1')]], c.singleBatter ? '1' : '0', 'singleBatter') + '</div>' +
      (c.singleBatter ? '<p class="meta" style="margin:-4px 0 4px">' + h('singleHint') + '</p>' : '') + '<p class="label">' + h('retireAt') + '</p><div class="chip-row">' +
      [0, 20, 25, 30, 50].map((n) => chip(n ? esc(t('runsUnit', { n })) : h('off'), c.retireAt === n, 'setNum', 'data-k="retireAt" data-v="' + n + '"')).join('') + '</div>' +
      (c.retireAt ? '<div style="margin-top:8px">' + sw('retiredReturn', t('retiredReturn'), c.retiredReturn) + '</div>' : '') + '</section>';
    x += '<section class="pane"><h2 class="sec">' + h('bowling') + '</h2><p class="label">' + h('maxOvers') + '</p><div class="chip-row">' +
      [0, 1, 2, 3, 4].map((n) => chip(n ? String(n) : h('off'), c.maxOversPerBowler === n, 'setNum', 'data-k="maxOversPerBowler" data-v="' + n + '"')).join('') + '</div>' +
      '<div style="margin-top:8px">' + sw('consecutiveOvers', t('consecutive'), c.consecutiveOvers) + '</div></section>';
    x += '<section class="pane"><h2 class="sec">' + h('house') + '</h2><p class="meta" style="margin:-6px 0 12px">' + h('houseSub') + '</p><div class="chip-row">' +
      HOUSE.map((k) => chip(h('h_' + k), (c.houseRules || []).indexOf(k) >= 0, 'house', 'data-k="' + k + '"')).join('') + '</div></section>';
    return [x, '<button class="pill primary" data-act="toToss">' + h('nextToss') + '</button>'];
  };
  A.preset = (ds) => { const d = S.draft; Object.assign(d.config, clone(E.PRESETS[ds.v])); d.cfgTouched = true; render(); };
  A.toggleRule = (ds) => {
    const c = S.draft.config, k = ds.k;
    if (k === 'wideRuns' || k === 'nbRuns') c[k] = c[k] > 0 ? 0 : 1; else c[k] = !c[k];
    S.draft.cfgTouched = true; render();
  };
  A.setNum = (ds) => { S.draft.config[ds.k] = +ds.v; S.draft.cfgTouched = true; render(); };
  A.setBool = (ds) => { S.draft.config[ds.k] = ds.v === '1'; S.draft.cfgTouched = true; render(); };
  A.oversStep = (ds) => { const c = S.draft.config; c.overs = Math.min(50, Math.max(1, c.overs + (+ds.v))); S.draft.cfgTouched = true; render(); };
  A.house = (ds) => {
    const c = S.draft.config; c.houseRules = c.houseRules || [];
    const i = c.houseRules.indexOf(ds.k);
    if (i >= 0) c.houseRules.splice(i, 1); else c.houseRules.push(ds.k);
    render();
  };
  A.toTeams = () => go('teams');
  A.toToss = () => { S.draft.toss = emptyToss(); go('toss'); };

  /* ---------- TOSS ---------- */
  VIEWS.toss = () => {
    const d = S.draft;
    if (!d) { S.screen = 'home'; return null; }
    const ts = d.toss, locked = !!ts.result;
    const ser = seriesFor(d.A.id, d.B.id);
    let x = topbar(h('toss'), 'toRulesBack');
    x += '<section class="pane toss-head"><div class="vs-line"><span class="tname" style="--team:' + safeColor(d.A.color) + '">' + esc(d.A.name) + '</span><span class="vs">vs</span><span class="tname" style="--team:' + safeColor(d.B.color) + '">' + esc(d.B.name) + '</span></div>' +
      (ser.n ? '<p class="meta">' + h('series') + ': ' + esc(d.A.name) + ' ' + ser.a + ' – ' + ser.b + ' ' + esc(d.B.name) + '</p>' : '') + '</section>';
    if (ts.mode === 'winner' && d[ts.winner]) {
      // Rematch without a toss: last match's winner picks bat or bowl.
      const wt = d[ts.winner];
      x += '<section class="pane toss-result"><p class="eyebrow" style="justify-content:center">' + h('noToss') + '</p>' +
        '<h2 class="display">' + h('wonLast', { team: wt.name }) + '</h2><p class="label">' + h('choose', { team: wt.name }) + '</p><div class="duo">' +
        ['bat', 'bowl'].map((v) => '<button class="pill pill-lg" data-act="choice" data-v="' + v + '" aria-pressed="' + (ts.choice === v) + '">' + h(v) + '</button>').join('') + '</div>' +
        '<button class="link" data-act="resetToss" style="margin-top:6px">' + h('doTossInstead') + '</button></section>';
      return [x, ts.choice ? '<button class="pill primary" data-act="startMatch">' + h('startMatch') + '</button>' : ''];
    }
    x += '<section class="pane"><h2 class="sec">' + h('callQ') + '</h2><div class="duo">' +
      ['H', 'T'].map((v) => '<button class="pill pill-lg" data-act="call" data-v="' + v + '" aria-pressed="' + (ts.call === v) + '"' + (locked ? ' disabled' : '') + '>' + h(v === 'H' ? 'heads' : 'tails') + '</button>').join('') + '</div>';
    if (ts.call) {
      x += '<p class="label">' + h('whoCalled', { side: t(ts.call === 'H' ? 'heads' : 'tails') }) + '</p><div class="duo">' + teamPillHtml(d.A, 'A', ts.caller === 'A', 'caller', locked) + teamPillHtml(d.B, 'B', ts.caller === 'B', 'caller', locked) + '</div>';
      if (!locked) x += '<div style="margin-top:8px">' + switchRow('realCoin', t('realCoin'), ts.real) + '</div>';
    }
    x += '</section>';
    if (ts.call && ts.caller) {
      if (ts.real && !ts.result) {
        x += '<section class="pane"><h2 class="sec">' + h('whatLanded') + '</h2><div class="duo">' + ['H', 'T'].map((v) => '<button class="pill pill-lg" data-act="landed" data-v="' + v + '">' + h(v === 'H' ? 'heads' : 'tails') + '</button>').join('') + '</div></section>';
      } else if (!ts.real || ts.result) {
        const cls = ts.flipping ? ' flip-' + ts.result : (ts.result === 'T' ? ' show-T' : '');
        x += '<section class="pane toss-result">' + (ts.real ? '' : '<div class="coin-stage"><div class="coin' + cls + '"><div class="face heads">H<small>' + h('heads') + '</small></div><div class="face tails">T<small>' + h('tails') + '</small></div></div></div>');
        if (!ts.result) x += '<button class="pill pill-xl primary wide" data-act="flip">' + h('flip') + '</button>';
        else if (ts.flipping) x += '<p class="big-line" aria-live="polite">' + h('flipping') + '</p>';
        else {
          x += '<p class="eyebrow" style="justify-content:center">' + h('itsX', { side: t(ts.result === 'H' ? 'heads' : 'tails') }) + '</p>' +
            '<h2 class="display" aria-live="polite">' + h('wonToss', { team: d[ts.winner].name }) + '</h2>' +
            '<p class="label">' + h('choose', { team: d[ts.winner].name }) + '</p><div class="duo">' +
            ['bat', 'bowl'].map((v) => '<button class="pill pill-lg" data-act="choice" data-v="' + v + '" aria-pressed="' + (ts.choice === v) + '">' + h(v) + '</button>').join('') + '</div>' +
            '<button class="link" data-act="resetToss" style="margin-top:6px">' + h('resetToss') + '</button>';
        }
        x += '</section>';
      }
    }
    return [x, ts.choice ? '<button class="pill primary" data-act="startMatch">' + h('startMatch') + '</button>' : ''];
  };
  A.toRulesBack = () => go('rules');
  A.caller = (ds) => { const ts = S.draft.toss; if (ts.result) return; ts.caller = ds.v; render(); };
  A.call = (ds) => { const ts = S.draft.toss; if (ts.result) return; ts.call = ds.v; render(); };
  A.realCoin = () => { const ts = S.draft.toss; if (ts.result) return; ts.real = !ts.real; render(); };
  A.landed = (ds) => { const ts = S.draft.toss; if (!ts.call || !ts.caller) return; ts.result = ds.v; ts.winner = ts.call === ds.v ? ts.caller : E.other(ts.caller); render(); };
  A.flip = () => {
    const ts = S.draft.toss;
    if (ts.flipping || ts.result || !ts.call || !ts.caller) return;
    let bit = Math.random() < 0.5 ? 0 : 1;
    try { bit = crypto.getRandomValues(new Uint8Array(1))[0] & 1; } catch (e) { /* Math.random fallback */ }
    ts.result = bit ? 'H' : 'T';
    ts.flipping = true;
    render();
    setTimeout(() => {
      ts.flipping = false;
      ts.winner = ts.call === ts.result ? ts.caller : E.other(ts.caller);
      haptic(25);
      if (S.screen === 'toss' && S.draft && S.draft.toss === ts) render();
    }, reducedMotion() ? 60 : 1650);
  };
  A.choice = (ds) => { S.draft.toss.choice = ds.v; render(); };
  A.resetToss = () => { S.draft.toss = emptyToss(); render(); };
  A.startMatch = () => {
    const d = S.draft, ts = d.toss;
    if (!ts.choice || !ts.winner) return;
    D.counter = Math.max(D.counter || 0, ...D.matches.map((m) => +m.no || 0)) + 1;
    const cfg = E.normalizeConfig(Object.assign({}, d.config, { jokerBowls: d.joker.bowls }));
    const m = {
      id: uid('m'), no: D.counter, createdAt: Date.now(), updatedAt: Date.now(), status: 'live',
      teams: { A: teamCopy(d.A), B: teamCopy(d.B) },
      joker: d.joker.on && d.joker.name.trim() ? { id: d.joker.id, name: d.joker.name.trim() } : null,
      config: cfg,
      toss: { caller: ts.caller, call: ts.call, result: ts.result, winner: ts.winner, choice: ts.choice, real: !!ts.real, mode: ts.mode === 'winner' ? 'winner' : 'toss' },
      events: [], result: null
    };
    D.matches.push(m);
    D.live = m.id;
    D.last = { A: d.A.id, B: d.B.id, joker: { on: d.joker.on, id: d.joker.id, name: d.joker.name, bowls: d.joker.bowls } };
    D.pairCfg[pairKey(d.A.id, d.B.id)] = clone(cfg);
    Store.touchMatch(m); Store.touchMeta();
    S.openers = {}; S.mod = noMods();
    go('match');
  };

  /* ---------- MATCH ---------- */
  VIEWS.match = () => {
    const m = liveMatch();
    if (!m) { S.screen = 'home'; return null; }
    const st = stateOf(m);
    if (!st) { toast(t('errBroken')); D.live = null; Store.touchMeta(); S.screen = 'home'; return null; }
    const p = st.pending && st.pending.type;
    if (p === 'openers') return vOpeners(m, st);
    if (p === 'tie') return vTie(m, st);
    if (p === 'bowlout') return vBowlout(m, st);
    return vScoring(m, st);
  };
  function matchTitle(m) { return h('matchNo', { n: m.no }) + '<small>' + esc(m.teams.A.name) + ' v ' + esc(m.teams.B.name) + '</small>'; }
  function vScoring(m, st) {
    const c = st.config, inn = st.innings[st.cur], bpo = c.ballsPerOver, T = m.teams, bat = T[inn.bat];
    const ch = E.chaseInfo(inn, bpo);
    const label = inn.isSuper ? t('superOverN', { n: inn.superNo }) : t(inn.idx === 0 ? 'inn1' : 'inn2');
    const bw = inn.bowler && inn.bowlers[inn.bowler];
    let x = topbar(matchTitle(m), 'home', iconBtn('menu', ICON.more, t('menu')));
    x += '<section class="pane board" style="--team:' + safeColor(bat.color) + '"><div class="board-top"><span class="team-tag"><i aria-hidden="true"></i><span>' + esc(bat.name) + '</span></span><span>' + esc(label) + '</span></div>' +
      '<div class="board-main"><div class="score" aria-label="' + inn.runs + ' / ' + inn.wkts + '"><b>' + inn.runs + '</b><span>/' + inn.wkts + '</span></div>' +
      '<div class="overs"><b>' + E.formatOvers(inn.balls, bpo) + '</b><span>/ ' + (inn.maxBalls / bpo) + ' ' + h('ov') + '</span></div></div>' +
      '<div class="board-foot"><span>' + h('crr') + ' <b>' + E.runRate(inn.runs, inn.balls, bpo).toFixed(2) + '</b></span>' +
      (ch ? '<span class="need">' + h('needShort', { r: ch.need, b: ch.left }) + '</span><span>' + h('rrr') + ' <b>' + ch.rrr.toFixed(2) + '</b></span>' : '') +
      (inn.freeHit ? '<span class="badge hot">' + h('freeHitBadge') + '</span>' : '') + (inn.solo && !inn.soloStart ? '<span class="badge">' + h('lastManBadge') + '</span>' : '') + '</div>' +
      '<div class="crease">' + batterRow(m, inn, inn.striker, true) + (inn.solo ? '' : batterRow(m, inn, inn.nonStriker, false)) + '</div>' +
      '<div class="crease-foot"><span class="bowler">' + ICON.ball + '<b>' + esc(playerName(m, inn.bowler)) + '</b>' + (bw ? '<span class="fig">' + figText(bw, bpo) + '</span>' : '') + '</span>' +
      (inn.solo ? '' : '<span class="part">' + h('partnership') + ' <span class="fig">' + inn.part.runs + ' (' + inn.part.balls + ')</span></span>') +
      (!inn.solo && inn.striker && inn.nonStriker ? '<button class="icon-btn swap-btn" data-act="swap" aria-label="' + h('swap') + '" title="' + h('swap') + '">' + ICON.swap + '</button>' : '') + '</div></section>';
    x += overTracker(m, inn, bpo);
    x += pad(inn, c);
    return [x, ''];
  }
  function batterRow(m, inn, id, strike) {
    if (!id) return '<div class="bat"><span class="strike"></span><b class="bname">—</b></div>';
    const b = inn.batters[id];
    return '<div class="bat' + (strike ? ' on' : '') + '"><span class="strike"' + (strike ? ' title="' + h('striker') + '"' : '') + '>' + (strike ? ICON.bat : '') + '</span>' +
      '<span class="bname"><b>' + esc(playerName(m, id)) + '</b>' + (b.fours || b.sixes ? '<small>' + b.fours + '×4 · ' + b.sixes + '×6</small>' : '') + '</span>' +
      '<span class="br">' + b.runs + '</span><span class="bb">(' + b.balls + ')</span></div>';
  }
  function modHint() {
    const M = S.mod;
    return M.wide ? t('hintWide') : M.nb ? (M.bye || M.lb ? t('hintNbBye') : t('hintNb')) : M.bye ? t('hintBye') : M.lb ? t('hintLb') : '';
  }
  function overTracker(m, inn, bpo) {
    let cur = inn.overs[inn.overs.length - 1], no = inn.overs.length, done = false;
    if (!cur.length && inn.overs.length > 1) { cur = inn.overs[inn.overs.length - 2]; no -= 1; done = true; }
    const legal = cur.filter((b) => b.legal).length;
    const runs = cur.reduce((a, b) => a + b.runs, 0);
    const empties = done ? '' : Array.from({ length: Math.max(0, bpo - legal) }, () => '<span class="tb empty" aria-hidden="true"></span>').join('');
    const hint = modHint();
    return '<section class="pane tracker" aria-label="' + h('thisOver') + '"><div class="tracker-top"><p class="tracker-head' + (hint ? ' hint' : '') + '" aria-live="polite">' +
      esc(hint || (done ? t('overN', { n: no }) : t('thisOver')) + ' · ' + t('runsUnit', { n: runs })) + '</p>' +
      smallBtn('undo', ICON.undo, t('undo'), m.events.length ? '' : 'disabled') + '</div><div class="balls">' + cur.map(ballChip).join('') + empties + '</div></section>';
  }
  function pad(inn, c) {
    const M = S.mod;
    const kind = M.wide ? 'wide' : M.nb ? 'noball' : 'legal';
    const sixOutNow = c.sixOut && kind === 'legal' && !M.bye && !M.lb && !inn.freeHit;
    const mod = (k, label) => '<button class="mod" data-act="mod" data-k="' + k + '" aria-pressed="' + !!M[k] + '">' + esc(label) + '</button>';
    const keys = [0, 1, 2, 3, 4, 5, 6].map((n) => '<button class="key' + (n === 4 ? ' four' : n === 6 ? ' six' : '') + '" data-act="run" data-n="' + n + '"' +
      (n === 6 && sixOutNow ? ' aria-label="6, ' + h('out') + '"' : '') + '><b>' + n + '</b>' + (n === 6 && sixOutNow ? '<small>' + h('out') + '</small>' : '') + '</button>').join('');
    return '<section class="pad"><div class="mods" role="group">' + mod('wide', t('wide')) + mod('nb', t('noBall')) + (c.byes ? mod('bye', t('bye')) + mod('lb', t('legBye')) : '') + '</div>' +
      '<div class="keys">' + keys + '<button class="key out" data-act="out">' + h('out') + '</button></div></section>';
  }
  A.mod = (ds) => {
    const M = S.mod, k = ds.k, on = !M[k];
    if (k === 'wide') Object.assign(M, { wide: on, nb: false, bye: false, lb: false });
    else if (k === 'nb') { M.nb = on; if (on) M.wide = false; }
    else if (k === 'bye') { M.bye = on; if (on) { M.lb = false; M.wide = false; } }
    else if (k === 'lb') { M.lb = on; if (on) { M.bye = false; M.wide = false; } }
    render();
  };
  A.run = (ds) => {
    const n = +ds.n, M = S.mod;
    let ev;
    if (M.wide) ev = { t: 'ball', kind: 'wide', ext: n };
    else {
      const kind = M.nb ? 'noball' : 'legal';
      if ((M.bye || M.lb) && n > 0) ev = { t: 'ball', kind, bat: 0, ext: n, extType: M.lb ? 'lb' : 'b' };
      else ev = { t: 'ball', kind, bat: n };
    }
    if (dispatch(ev)) haptic(n >= 4 ? 24 : 10);
  };
  A.out = () => {
    const M = S.mod;
    S.sheet = { type: 'wicket', kind: M.wide ? 'wide' : M.nb ? 'noball' : 'legal', mods: Object.assign({}, M) };
    renderSheet();
  };
  SHEETS.wicket = () => {
    const m = liveMatch(), st = stateOf(m);
    if (!st) return '';
    const list = E.allowedDismissals(st, S.sheet.kind).filter((d) => d !== 'sixOut');
    return sheetWrap(t('howOut'), '<div class="grid2" style="margin-top:12px">' + list.map((d) => '<button class="pill pill-lg' + (d === 'runOut' ? '' : ' danger-soft') + '" data-act="how" data-v="' + d + '">' + h('d_' + d) + '</button>').join('') + '</div>');
  };
  A.how = (ds) => {
    const sh = S.sheet;
    if (!sh) return;
    if (ds.v === 'runOut') { S.sheet = { type: 'runout', kind: sh.kind, mods: sh.mods, who: 'striker', runs: 0 }; renderSheet(); return; }
    if (dispatch({ t: 'ball', kind: sh.kind, bat: 0, ext: 0, wicket: { how: ds.v, out: 'striker' } })) haptic(40);
  };
  SHEETS.runout = () => {
    const m = liveMatch(), st = stateOf(m);
    if (!st) return '';
    const inn = st.innings[st.cur], sh = S.sheet;
    const who = [['striker', inn.striker]];
    if (!inn.solo && inn.nonStriker) who.push(['nonStriker', inn.nonStriker]);
    return sheetWrap(t('d_runOut'), '<p class="label">' + h('whoOut') + '</p><div class="grid2">' +
      who.map((w) => '<button class="pill pill-lg" data-act="roWho" data-v="' + w[0] + '" aria-pressed="' + (sh.who === w[0]) + '">' + esc(playerName(m, w[1])) + '</button>').join('') + '</div>' +
      '<p class="label">' + h('runsDone') + '</p><div class="grid4">' + [0, 1, 2, 3].map((n) => '<button class="pill pill-lg" data-act="roRuns" data-v="' + n + '" aria-pressed="' + (sh.runs === n) + '">' + n + '</button>').join('') + '</div>' +
      '<button class="pill pill-lg danger wide" data-act="roConfirm">' + h('confirmRunOut') + '</button>');
  };
  A.roWho = (ds) => { S.sheet.who = ds.v; renderSheet(); };
  A.roRuns = (ds) => { S.sheet.runs = +ds.v; renderSheet(); };
  A.roConfirm = () => {
    const sh = S.sheet, n = sh.runs, w = { how: 'runOut', out: sh.who };
    let ev;
    if (sh.kind === 'wide') ev = { t: 'ball', kind: 'wide', ext: n, wicket: w };
    else if ((sh.mods.bye || sh.mods.lb) && n > 0) ev = { t: 'ball', kind: sh.kind, bat: 0, ext: n, extType: sh.mods.lb ? 'lb' : 'b', wicket: w };
    else ev = { t: 'ball', kind: sh.kind, bat: n, wicket: w };
    if (dispatch(ev)) haptic(40);
  };
  function shNextBatter(m, st) {
    const inn = st.innings[st.cur];
    const cands = E.batterCandidates(st, inn);
    const lastBall = (inn.overs[inn.overs.length - 1].length ? inn.overs[inn.overs.length - 1] : (inn.overs[inn.overs.length - 2] || [])).slice(-1)[0];
    let sub = '';
    const f = inn.fow[inn.fow.length - 1];
    if (lastBall && lastBall.w && f) { const b = inn.batters[f.id]; sub = playerName(m, b.id) + ' · ' + howText(m, b) + ' · ' + b.runs + ' (' + b.balls + ')'; }
    return sheetWrap(t('nextBatter'), (sub ? '<p class="sheet-sub">' + esc(sub) + '</p>' : '') +
      '<div class="pick-list">' + cands.map((id) => { const b = inn.batters[id]; return '<button class="pick" data-act="batter" data-id="' + esc(id) + '"><span>' + esc(playerName(m, id)) + '</span>' + (b.status === 'retired' ? '<small>' + h('retiredTag') + ' · ' + b.runs + ' (' + b.balls + ')</small>' : '') + '</button>'; }).join('') + '</div>' +
      '<div class="sheet-actions">' + smallBtn('undo', ICON.undo, t('undoLast')) + smallBtn('endInningsAsk', '', t('endInnings')) + '</div>', true);
  }
  function shNextBowler(m, st) {
    const inn = st.innings[st.cur], bpo = st.config.ballsPerOver;
    const opts = E.bowlerOptions(st, inn);
    const prev = inn.overs[inn.overs.length - 2] || [];
    const overRuns = prev.reduce((a, b) => a + b.runs, 0);
    return sheetWrap(t('nextBowler'), (inn.overs.length > 1 ? '<p class="sheet-sub">' + h('overDone', { n: inn.overs.length - 1, r: overRuns }) + '</p>' : '') +
      '<div class="pick-list">' + opts.map((o) => { const b = inn.bowlers[o.id]; return '<button class="pick" data-act="bowler" data-id="' + esc(o.id) + '"' + (o.disabled ? ' disabled' : '') + '><span>' + esc(playerName(m, o.id)) + '</span><small>' + (o.disabled ? h('r_' + o.reason) : (b ? figText(b, bpo) : '0-0-0-0')) + '</small></button>'; }).join('') + '</div>' +
      (opts.some((o) => o.relaxed) ? '<p class="meta">' + h('relaxed') + '</p>' : '') +
      '<div class="sheet-actions">' + smallBtn('undo', ICON.undo, t('undoLast')) + (!inn.solo && inn.striker && inn.nonStriker ? smallBtn('swap', ICON.swap, t('swap')) : '') + smallBtn('endInningsAsk', '', t('endInnings')) + '</div>', true);
  }
  A.batter = (ds) => dispatch({ t: 'batter', id: ds.id });
  A.bowler = (ds) => dispatch({ t: 'bowler', id: ds.id });
  A.swap = () => { if (dispatch({ t: 'swap' })) haptic(10); };
  A.undo = () => {
    const m = liveMatch();
    if (!m || !m.events.length) return;
    m.events.pop();
    S.mod = noMods(); S.sheet = null;
    Store.touchMatch(m);
    haptic(15);
    render();
  };
  A.menu = () => { S.sheet = { type: 'menu' }; renderSheet(); };
  SHEETS.menu = () => {
    const m = liveMatch(), st = stateOf(m);
    if (!st) return '';
    const inn = st.innings[st.cur], live = inn.started && !inn.done && !st.pending;
    const canRetire = (id) => id && inn.squad.some((x) => x !== id && (inn.batters[x].status === 'yet' || (st.config.retiredReturn && inn.batters[x].status === 'retired')));
    const items = [];
    if (live && inn.striker && inn.nonStriker && !inn.solo) items.push(['swap', t('swap')]);
    if (live && canRetire(inn.striker)) items.push(['retire', t('retireStriker', { name: playerName(m, inn.striker) }), 'data-v="striker"']);
    if (live && canRetire(inn.nonStriker)) items.push(['retire', t('retireStriker', { name: playerName(m, inn.nonStriker) }), 'data-v="nonStriker"']);
    if (live && inn.bowler) items.push(['changeBowlerOpen', t('changeBowler')]);
    items.push(['rulesView', t('viewRules')]);
    items.push(['settings', t('settings')]);
    if (inn.started && !inn.done) items.push(['endInningsAsk', t('endInnings')]);
    items.push(['abandonAsk', t('abandon'), '', 'danger']);
    return sheetWrap(t('menu'), '<div class="menu-list">' + items.map((it) => '<button class="menu-item ' + (it[3] || '') + '" data-act="' + it[0] + '" ' + (it[2] || '') + '>' + esc(it[1]) + '</button>').join('') + '</div>');
  };
  A.retire = (ds) => dispatch({ t: 'retire', slot: ds.v });
  A.changeBowlerOpen = () => { S.sheet = { type: 'changeBowler' }; renderSheet(); };
  SHEETS.changeBowler = () => {
    const m = liveMatch(), st = stateOf(m);
    if (!st) return '';
    const inn = st.innings[st.cur], bpo = st.config.ballsPerOver;
    const opts = E.bowlerOptions(st, inn, true);
    return sheetWrap(t('changeBowler'), '<div class="pick-list">' + opts.map((o) => { const b = inn.bowlers[o.id]; return '<button class="pick" data-act="changeBowler" data-id="' + esc(o.id) + '"' + (o.disabled ? ' disabled' : '') + '><span>' + esc(playerName(m, o.id)) + '</span><small>' + (o.disabled ? h('r_' + o.reason) : (b ? figText(b, bpo) : '0-0-0-0')) + '</small></button>'; }).join('') + '</div>');
  };
  A.changeBowler = (ds) => dispatch({ t: 'changeBowler', id: ds.id });
  A.rulesView = () => { S.sheet = { type: 'rules' }; renderSheet(); };
  SHEETS.rules = () => {
    const m = S.screen === 'result' || S.screen === 'poster' ? findMatch(S.viewId) : liveMatch();
    if (!m) return '';
    const c = E.normalizeConfig(m.config);
    const yn = (v) => t(v ? 'on' : 'off');
    const rows = [[t('overs'), c.overs], [t('bpo'), c.ballsPerOver], [t('wideRun'), yn(c.wideRuns > 0)], [t('wideRebowl'), yn(c.wideRebowl)], [t('nbRun'), yn(c.nbRuns > 0)],
      [t('nbRebowl'), yn(c.nbRebowl)], [t('freeHit'), yn(c.freeHit)], [t('byes'), yn(c.byes)], [t('sixOut'), c.sixOut ? (c.sixOutRuns ? t('sixOutRuns') : t('on')) : t('off')],
      [t('creaseQ'), t(c.singleBatter ? 'crease1' : 'crease2')], [t('lastMan'), c.singleBatter ? '—' : yn(c.lastManStands)], [t('lbw'), yn(c.lbw)], [t('hitWicket'), yn(c.hitWicket)], [t('retireAt'), c.retireAt ? t('runsUnit', { n: c.retireAt }) : t('off')],
      [t('maxOvers'), c.maxOversPerBowler || t('off')], [t('consecutive'), yn(c.consecutiveOvers)]];
    if (m.joker) rows.push([t('joker'), m.joker.name + (c.jokerBowls ? '' : ' · ' + t('bat'))]);
    const house = (c.houseRules || []).filter((k) => HOUSE.indexOf(k) >= 0);
    return sheetWrap(t('viewRules'), '<ul class="rules-list">' + rows.map((r) => '<li><span>' + esc(r[0]) + '</span><span>' + esc(r[1]) + '</span></li>').join('') + '</ul>' +
      (house.length ? '<p class="label">' + h('house') + '</p><div class="chip-row">' + house.map((k) => '<span class="chip">' + h('h_' + k) + '</span>').join('') + '</div>' : ''));
  };
  A.endInningsAsk = () => confirmAsk(t('endInningsQ'), 'endInnings');
  A.abandonAsk = () => confirmAsk(t('abandonQ'), 'abandon');
  SHEETS.confirm = () => sheetWrap(S.sheet.msg, '<div class="duo" style="margin-top:14px"><button class="pill pill-lg" data-act="closeSheet" data-autofocus>' + h('cancel') + '</button>' +
    '<button class="pill pill-lg ' + (S.sheet.danger ? 'danger' : 'primary') + '" data-act="confirmYes">' + h('confirm') + '</button></div>');
  const CONFIRM = {
    endInnings: () => { S.sheet = null; dispatch({ t: 'end' }); },
    abandon: () => { const m = liveMatch(); if (m) removeMatch(m.id); go('home'); },
    abandonAndNew: () => { const m = liveMatch(); if (m) removeMatch(m.id); S.draft = newDraft(); S.teamErr = []; go('teams'); },
    deleteMatch: () => { if (S.viewId) removeMatch(S.viewId); S.viewId = null; go('home'); },
    wipe: () => { Store.wipe(); S.draft = null; toast(t('wiped')); go('home'); }
  };
  A.confirmYes = () => { const k = S.sheet && S.sheet.yes; S.sheet = null; if (k && CONFIRM[k]) CONFIRM[k](); else renderSheet(); };
  function removeMatch(id) {
    D.matches = D.matches.filter((m) => m.id !== id);
    if (D.live === id) D.live = null;
    Store.dropMatch(id); Store.touchMeta();
  }

  /* openers */
  function vOpeners(m, st) {
    const inn = st.innings[st.cur], T = m.teams, bat = T[inn.bat], bowl = T[inn.bowl], bpo = st.config.ballsPerOver;
    if (S.openers.inn !== inn.idx || S.openers.mid !== m.id) S.openers = { inn: inn.idx, mid: m.id };
    const O = S.openers;
    const batIds = inn.squad;
    const bowlIds = E.squad(m, inn.bowl).filter((id) => st.config.jokerBowls || !E.isJoker(m, id));
    let x = topbar(matchTitle(m), 'home', iconBtn('menu', ICON.more, t('menu')));
    if (inn.idx === 0) x += '<section class="pane"><p class="toss-line">' + esc(tossLine(m)) + '</p></section>';
    else if (!inn.isSuper) {
      const i1 = st.innings[0];
      x += '<section class="pane break" style="--team:' + safeColor(T[i1.bat].color) + '"><p class="eyebrow">' + h('inningsBreak') + '</p>' +
        '<p class="big-line">' + esc(T[i1.bat].name) + ' &nbsp;' + i1.runs + '/' + i1.wkts + ' <span class="vs">(' + E.formatOvers(i1.balls, bpo) + ')</span></p>' +
        '<p class="meta">' + h('needFrom', { team: bat.name, r: inn.target, b: inn.maxBalls }) + '</p></section>';
    } else {
      x += '<section class="pane break" style="--team:' + safeColor(bat.color) + '"><p class="eyebrow">' + h('superOverN', { n: inn.superNo }) + '</p><p class="big-line">' +
        (inn.target == null ? h('superFirst', { team: bat.name }) : h('superChase', { team: bat.name, r: inn.target, b: inn.maxBalls })) + '</p></section>';
    }
    const single = !!st.config.singleBatter;
    const picks = (ids, role, others, tail) => '<div class="chip-row">' + ids.map((id) => chip(esc(playerName(m, id)), O[role] === id, 'opener', 'data-k="' + role + '" data-id="' + esc(id) + '"', others.indexOf(id) >= 0)).join('') + (tail || '') + '</div>';
    const noneChip = chip(h('noNonStriker'), O.nonStriker === NONE, 'opener', 'data-k="nonStriker" data-id="' + NONE + '"');
    x += '<section class="pane"><h2 class="sec">' + h('battingSide', { team: bat.name }) + '</h2><p class="label">' + h(single ? 'batterOne' : 'striker') + '</p>' + picks(batIds, 'striker', [O.nonStriker, O.bowler]) +
      (single ? '<p class="meta">' + h('singleHint') + '</p>'
        : batIds.length > 1 ? '<p class="label">' + h('nonStriker') + '</p>' + picks(batIds, 'nonStriker', [O.striker, O.bowler], noneChip) + (O.nonStriker === NONE ? '<p class="meta">' + h('aloneHint') + '</p>' : '') : '') + '</section>';
    x += '<section class="pane"><h2 class="sec">' + h('bowlingSide', { team: bowl.name }) + '</h2><p class="label">' + h('openingBowler') + '</p>' + picks(bowlIds, 'bowler', [O.striker, O.nonStriker]) + '</section>';
    if (st.innings.length > 1 || m.events.length) x += '<div>' + smallBtn('undo', ICON.undo, t('undoLast'), m.events.length ? '' : 'disabled') + '</div>';
    const ready = O.striker && O.bowler && (single || batIds.length < 2 || O.nonStriker);
    return [x, '<button class="pill primary" data-act="startInnings"' + (ready ? '' : ' disabled') + '>' + h('startInnings') + '</button>'];
  }
  A.opener = (ds) => { const O = S.openers; O[ds.k] = O[ds.k] === ds.id ? null : ds.id; render(); };
  A.startInnings = () => {
    const O = S.openers, st = stateOf(liveMatch());
    if (!O.striker || !O.bowler || !st) return;
    const ns = st.config.singleBatter || O.nonStriker === NONE ? null : (O.nonStriker || null);
    if (dispatch({ t: 'start', striker: O.striker, nonStriker: ns, bowler: O.bowler })) S.openers = {};
  };

  /* tie + bowl-out */
  function scoreText(m, inn, bpo) { return m.teams[inn.bat].name + ' ' + inn.runs + '/' + inn.wkts + ' (' + E.formatOvers(inn.balls, bpo) + ')'; }
  function vTie(m, st) {
    const bpo = st.config.ballsPerOver, last = st.innings[st.innings.length - 1], prev = st.innings[st.innings.length - 2];
    const opt = (k, title, sub) => '<button class="pane option" data-act="tiebreak" data-v="' + k + '"><b>' + esc(title) + '</b><span>' + esc(sub) + '</span></button>';
    let x = topbar(matchTitle(m), 'home', iconBtn('menu', ICON.more, t('menu')));
    x += '<section class="pane tie-hero"><p class="eyebrow" style="justify-content:center">' + esc(last.isSuper ? t('superOverN', { n: last.superNo }) : t('result')) + '</p><h2 class="display">' + h('tied') + '</h2>' +
      '<p class="meta">' + esc(scoreText(m, prev, bpo)) + ' · ' + esc(scoreText(m, last, bpo)) + '</p></section>';
    x += '<h2 class="sec" style="margin:4px 4px 0">' + h('pickTiebreak') + '</h2><div class="options">' + opt('super', t('tb_super'), t('tb_superSub')) + opt('share', t('tb_share'), t('tb_shareSub')) +
      opt('bowlout', t('tb_bowlout'), t('tb_bowloutSub', { n: st.config.bowloutBalls })) + '</div><div>' + smallBtn('undo', ICON.undo, t('undoLast')) + '</div>';
    return [x, ''];
  }
  A.tiebreak = (ds) => dispatch({ t: 'tiebreak', mode: ds.v });
  function vBowlout(m, st) {
    const bo = st.bowlout, side = st.pending.side, n = bo.n;
    const slotsN = Math.max(n, bo.A.length, bo.B.length + (side === 'B' ? 1 : 0), bo.A.length + (side === 'A' ? 1 : 0));
    const row = (s) => {
      const arr = bo[s], c = safeColor(m.teams[s].color);
      const slots = Array.from({ length: slotsN }, (_, i) => arr[i] === undefined ? '<span class="slot" aria-hidden="true"></span>' : arr[i] ? '<span class="slot hit">' + ICON.check + '</span>' : '<span class="slot miss">' + ICON.x + '</span>').join('');
      return '<div class="bo-row' + (side === s ? ' turn' : '') + '" style="--team:' + c + '"><span class="bo-team"><span class="team-dot" aria-hidden="true"></span><span>' + esc(m.teams[s].name) + '</span></span><span class="bo-hits">' + arr.filter(Boolean).length + '</span><div class="slots">' + slots + '</div></div>';
    };
    const sudden = bo.A.length >= n && bo.B.length >= n;
    let x = topbar(matchTitle(m), 'home', iconBtn('menu', ICON.more, t('menu')));
    x += '<section class="pane"><p class="eyebrow">' + h('tb_bowlout') + (sudden ? ' · ' + h('suddenDeath') : '') + '</p>' + row(bo.first) + row(E.other(bo.first)) + '</section>';
    x += '<section class="pane"><p class="big-line">' + h('bowloutTurn', { team: m.teams[side].name, n: bo[side].length + 1 }) + '</p><div class="duo" style="margin-top:12px">' +
      '<button class="pill pill-xl ok" data-act="bowl" data-v="1">' + ICON.check + '<span>' + h('hit') + '</span></button><button class="pill pill-xl danger" data-act="bowl" data-v="0">' + ICON.x + '<span>' + h('miss') + '</span></button></div>' +
      '<div style="margin-top:12px">' + smallBtn('undo', ICON.undo, t('undo')) + '</div></section>';
    return [x, ''];
  }
  A.bowl = (ds) => { if (dispatch({ t: 'bowl', hit: ds.v === '1' })) haptic(15); };

  /* ---------- RESULT ---------- */
  VIEWS.result = () => {
    const m = findMatch(S.viewId);
    const st = stateOf(m);
    if (!m || !st || !st.result) { S.screen = 'home'; return null; }
    const T = m.teams, r = st.result, bpo = st.config.ballsPerOver;
    const winColor = r.winner ? safeColor(T[r.winner].color) : 'var(--ball)';
    const main = st.innings.filter((i) => !i.isSuper && i.started), sup = st.innings.filter((i) => i.isSuper && i.started);
    const top = E.performers(st)[0];
    let x = topbar(h('result'), 'home', iconBtn('resultMenu', ICON.more, t('menu')));
    x += '<section class="pane result-hero" style="--team:' + winColor + '"><div class="trophy">' + ICON.trophy + '</div><p class="eyebrow">' + h('matchNo', { n: m.no }) + ' · ' + esc(fmtDate(m.createdAt)) + '</p>' +
      '<h2 class="display">' + esc(resultText(m, r)) + '</h2>' + (r.type === 'wickets' && r.ballsLeft > 0 ? '<p class="meta">' + h('ballsLeft', { n: r.ballsLeft }) + '</p>' : '') +
      '<div class="score-lines">' + main.map((i) => '<p><span>' + esc(T[i.bat].name) + '</span><b>' + i.runs + '/' + i.wkts + '</b><span class="vs">(' + E.formatOvers(i.balls, bpo) + ')</span></p>').join('') +
      sup.map((i, k) => (k % 2 === 0 ? '<p class="eyebrow so-label">' + h('superLine', { n: i.superNo }) + '</p>' : '') + '<p><span>' + esc(T[i.bat].name) + '</span><b>' + i.runs + '/' + i.wkts + '</b><span class="vs">(' + E.formatOvers(i.balls, bpo) + ')</span></p>').join('') + '</div></section>';
    if (top) {
      x += '<section class="pane potm" style="--team:' + teamColorOf(m, top.id) + '"><p class="eyebrow">' + h('potm') + '</p><div class="potm-row"><div><p class="potm-name">' + esc(playerName(m, top.id)) + '</p>' +
        '<p class="meta">' + esc(teamNameOf(m, top.id)) + '</p></div><div class="potm-pts"><b>' + Math.round(top.pts) + '</b><small>' + h('ptsLabel') + '</small></div></div><p class="potm-line">' + esc(potmLine(st, top)) + '</p></section>';
    }
    x += '<section class="pane rematch"><h2 class="sec">' + h('continueQ') + '</h2><button class="pill pill-lg primary wide" data-act="rematch" data-v="same">' + ICON.coin + '<span>' + h('yesToss') + '</span></button>' +
      (r.winner ? '<button class="pill pill-lg wide pick-pill" data-act="rematch" data-v="winner"><span>' + h('winnerPick') + '</span><small>' + h('winnerPickSub', { team: T[r.winner].name }) + '</small></button>' : '') +
      '<div class="grid3"><button class="pill" data-act="rematch" data-v="edit">' + h('editTeams') + '</button><button class="pill" data-act="rematch" data-v="rules">' + h('changeRules') + '</button>' +
      '<button class="pill" data-act="rematch" data-v="new">' + h('newTeams') + '</button></div></section>';
    x += '<div class="duo"><button class="pill pill-lg" data-act="poster">' + ICON.share + '<span>' + h('sharePoster') + '</span></button>' +
      (NATIVE ? '<button class="pill pill-lg" data-act="shareText">' + ICON.share + '<span>' + h('shareTextBtn') + '</span></button>' : '<button class="pill pill-lg" data-act="copyText">' + ICON.copy + '<span>' + h('copyText') + '</span></button>') + '</div>';
    x += scorecard(m, st);
    return [x, ''];
  };
  function scorecard(m, st) {
    const inns = st.innings.filter((i) => i.started);
    if (!inns.length) return '';
    const tab = inns[S.cardTab] ? S.cardTab : 0;
    const bpo = st.config.ballsPerOver;
    const tabs = inns.map((inn, i) => [i, (inn.isSuper ? 'SO' + inn.superNo + ' · ' : '') + m.teams[inn.bat].name]);
    const inn = inns[tab], cd = E.card(inn), ex = cd.extras;
    const ext = ex.wd + ex.nb + ex.b + ex.lb;
    return '<section class="pane"><h2 class="sec">' + h('scorecard') + '</h2>' + (tabs.length > 1 ? '<div class="chip-row" role="group">' + tabs.map((tb) => chip(esc(tb[1]), tb[0] === tab, 'tab', 'data-v="' + tb[0] + '"')).join('') + '</div>' : '') +
      '<div class="table-wrap"><table class="sc"><thead><tr><th scope="col">' + h('batter') + '</th><th scope="col">R</th><th scope="col">B</th><th scope="col">4s</th><th scope="col">6s</th><th scope="col">SR</th></tr></thead><tbody>' +
      cd.batting.map((b) => '<tr><td>' + esc(playerName(m, b.id)) + '<small>' + esc(howText(m, b)) + '</small></td><td>' + b.runs + '</td><td>' + b.balls + '</td><td>' + b.fours + '</td><td>' + b.sixes + '</td><td>' + (b.balls ? Math.round(b.runs * 100 / b.balls) : '–') + '</td></tr>').join('') +
      '</tbody></table></div><p class="sc-line"><span>' + h('extrasLine') + '</span><b>' + ext + '</b><small>wd ' + ex.wd + ' · nb ' + ex.nb + ' · b ' + ex.b + ' · lb ' + ex.lb + '</small></p>' +
      '<p class="sc-line total"><span>' + h('total') + '</span><b>' + cd.runs + '/' + cd.wkts + '</b><small>(' + E.formatOvers(cd.balls, bpo) + ' ' + h('ov') + ')</small></p>' +
      (cd.dnb.length ? '<p class="meta">' + h('dnb') + ': ' + cd.dnb.map((id) => esc(playerName(m, id))).join(', ') + '</p>' : '') +
      '<div class="table-wrap"><table class="sc"><thead><tr><th scope="col">' + h('bowler') + '</th><th scope="col">O</th><th scope="col">M</th><th scope="col">R</th><th scope="col">W</th><th scope="col">Econ</th></tr></thead><tbody>' +
      cd.bowling.map((b) => '<tr><td>' + esc(playerName(m, b.id)) + '</td><td>' + E.formatOvers(b.balls, bpo) + '</td><td>' + b.maidens + '</td><td>' + b.runs + '</td><td>' + b.wkts + '</td><td>' + (b.balls ? E.runRate(b.runs, b.balls, bpo).toFixed(1) : '–') + '</td></tr>').join('') +
      '</tbody></table></div>' + (cd.fow.length ? '<p class="label">' + h('fow') + '</p><p class="fow">' + cd.fow.map((f) => f.runs + '-' + f.n + ' <small>' + esc(playerName(m, f.id)) + ', ' + E.formatOvers(f.balls, bpo) + '</small>').join(' · ') + '</p>' : '') + '</section>';
  }
  A.tab = (ds) => { S.cardTab = +ds.v; render(); };
  A.rematch = (ds) => {
    const m = findMatch(S.viewId);
    if (!m) return;
    if (D.live) { toast(t('otherLive')); return; }
    if (ds.v === 'new') { S.draft = newDraft(true); S.teamErr = []; go('teams'); return; }
    S.draft = draftFromMatch(m);
    S.teamErr = [];
    if (ds.v === 'same') go('toss');
    else if (ds.v === 'winner') {
      const w = m.result && m.result.winner;
      if (w) S.draft.toss = Object.assign(emptyToss(), { mode: 'winner', winner: w });
      go('toss');
    }
    else if (ds.v === 'edit') go('teams');
    else { S.draft.cfgTouched = true; go('rules'); }
  };
  A.resultMenu = () => { S.sheet = { type: 'resultMenu' }; renderSheet(); };
  SHEETS.resultMenu = () => sheetWrap(t('menu'), '<div class="menu-list">' + (D.live ? '' : '<button class="menu-item" data-act="reopen">' + h('reopen') + '</button>') +
    '<button class="menu-item" data-act="rulesView">' + h('viewRules') + '</button><button class="menu-item" data-act="settings">' + h('settings') + '</button><button class="menu-item danger" data-act="deleteAsk">' + h('deleteMatch') + '</button></div>');
  A.reopen = () => {
    const m = findMatch(S.viewId);
    if (!m || D.live || !m.events.length) return;
    m.events.pop(); m.status = 'live'; m.result = null; D.live = m.id;
    Store.touchMatch(m); Store.touchMeta();
    go('match');
  };
  A.deleteAsk = () => confirmAsk(t('deleteQ'), 'deleteMatch');

  /* ---------- POSTER ---------- */
  VIEWS.poster = () => {
    const m = findMatch(S.viewId);
    if (!m || !S.poster) { S.screen = 'result'; return null; }
    const P = S.poster;
    let x = topbar(h('poster'), 'backToResult');
    x += '<div class="poster-frame">' + (P.url ? '<img class="poster-img" src="' + P.url + '" alt="' + esc(resultText(m)) + '">' : '<p class="poster-loading">' + h('making') + '</p>') + '</div>';
    if (NATIVE) {
      x += '<div class="duo"><button class="pill pill-lg primary" data-act="shareImage"' + (P.url ? '' : ' disabled') + '>' + ICON.share + '<span>' + h('share') + '</span></button>' +
        '<button class="pill pill-lg" data-act="saveImage"' + (P.blob ? '' : ' disabled') + '>' + ICON.download + '<span>' + h('saveImage') + '</span></button></div>' +
        '<button class="pill wide" data-act="shareText">' + ICON.share + '<span>' + h('shareTextBtn') + '</span></button>';
      return [x, ''];
    }
    x += '<div class="duo"><button class="pill pill-lg primary" data-act="saveImage"' + (P.blob ? '' : ' disabled') + '>' + ICON.download + '<span>' + h('saveImage') + '</span></button>' +
      '<button class="pill pill-lg" data-act="copyImage"' + (P.blob ? '' : ' disabled') + '>' + ICON.copy + '<span>' + h('copyImage') + '</span></button></div>' +
      '<button class="pill wide" data-act="copyText">' + ICON.copy + '<span>' + h('copyText') + '</span></button><p class="meta center">' + h('longPress') + '</p>';
    return [x, ''];
  };
  A.backToResult = () => go('result');
  A.poster = () => {
    const m = findMatch(S.viewId);
    if (!m) return;
    const P = { id: m.id, url: null, blob: null };
    S.poster = P;
    go('poster');
    makePoster(m).then((cv) => {
      P.url = cv.toDataURL('image/png');
      cv.toBlob((blob) => { P.blob = blob; if (S.poster === P && S.screen === 'poster') render(); }, 'image/png');
      if (S.poster === P && S.screen === 'poster') render();
    }).catch((e) => { console.error(e); toast(t('errGeneric', { e: (e && e.message) || e })); });
  };
  A.saveImage = () => { const m = findMatch(S.viewId); if (S.poster && S.poster.blob && m) saveFile('gully-match-' + m.no + '.png', S.poster.blob, 'image/png'); };
  A.copyImage = () => {
    const P = S.poster;
    if (!P || !P.blob) return;
    try {
      navigator.clipboard.write([new ClipboardItem({ 'image/png': P.blob })]).then(() => toast(t('copied'))).catch(() => toast(t('copyFailed')));
    } catch (e) { toast(t('copyFailed')); }
  };
  A.copyText = () => { const m = findMatch(S.viewId); if (m) copyString(shareText(m)); };
  A.shareImage = () => {
    const P = S.poster, m = findMatch(S.viewId);
    if (!NATIVE || !P || !P.url || !m) return;
    let r = 'error';
    try { r = NATIVE.shareFile(P.url.split(',')[1], 'gully-match-' + m.no + '.png', 'image/png', shareText(m)); } catch (e) { r = 'error'; }
    if (r !== 'ok') toast(t('saveUnavailable'));
  };
  A.shareText = () => { const m = findMatch(S.viewId); if (!m) return; if (NATIVE) { try { NATIVE.shareText(shareText(m)); } catch (e) { copyString(shareText(m)); } } else copyString(shareText(m)); };
  function shareText(m) {
    const st = stateOf(m), bpo = st.config.ballsPerOver;
    const lines = ['🏏 ' + t('shareHead', { n: m.no, date: fmtDate(m.createdAt) })];
    st.innings.filter((i) => i.started).forEach((i) => lines.push((i.isSuper ? t('superLine', { n: i.superNo }) + ' · ' : '') + scoreText(m, i, bpo)));
    lines.push('🏆 ' + resultText(m));
    const top = E.performers(st)[0];
    if (top) lines.push('⭐ ' + t('sharePotm', { name: playerName(m, top.id), line: potmLine(st, top) }));
    return lines.join('\n');
  }
  function copyString(text) {
    if (NATIVE) { try { NATIVE.copyText(text); toast(t('copied')); return; } catch (e) { /* fall back to the copy sheet */ } }
    let p = null;
    try { p = navigator.clipboard && navigator.clipboard.writeText(text); } catch (e) { p = null; }
    if (p && typeof p.then === 'function') p.then(() => toast(t('copied'))).catch(() => openCopySheet(text));
    else openCopySheet(text);
  }
  function openCopySheet(text) {
    S.sheet = { type: 'copy', text };
    renderSheet();
    const ta = document.getElementById('copyArea');
    if (ta) { ta.focus(); ta.select(); }
  }
  SHEETS.copy = () => sheetWrap(t('copyText'), '<p class="label">' + h('copyHint') + '</p><textarea id="copyArea" class="field" rows="7" readonly>' + esc(S.sheet.text) + '</textarea>');
  let dlP = null;
  function capDownloads() {
    if (!dlP) dlP = window.claude && typeof window.claude.use === 'function' ? Promise.resolve().then(() => window.claude.use('downloads')).catch(() => null) : Promise.resolve(null);
    return dlP;
  }
  function blobToB64(blob) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
  }
  function utf8ToB64(str) {
    const b = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  async function saveFile(filename, data, mime) {
    if (NATIVE) {
      try {
        const b64 = data instanceof Blob ? await blobToB64(data) : utf8ToB64(String(data));
        const r = NATIVE.saveFile(b64, filename, mime);
        toast(r === 'saved' ? t('savedPhone') : r === 'shared' ? t('sharedOk') : t('saveUnavailable'));
      } catch (e) { toast(t('saveUnavailable')); }
      return;
    }
    const dl = await capDownloads();
    if (dl) {
      try { await dl.save({ filename, data }); toast(t('saved')); }
      catch (e) { const c = e && e.code; toast(c === 'declined' ? t('declined') : c === 'rate_limited' ? t('busy') : t('saveUnavailable')); }
      return;
    }
    if (!window.claude) {
      try {
        const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = filename;
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
        toast(t('saved'));
        return;
      } catch (e) { /* fall through */ }
    }
    toast(t('saveUnavailable'));
  }

  /* poster drawing (1080x1350, WhatsApp/Instagram friendly) */
  function fontsReady() {
    try {
      if (!document.fonts || !document.fonts.load) return Promise.resolve();
      const specs = [['64px "Anton"', 'AB12'], ['700 40px "Barlow Condensed"', 'AB12'], ['600 40px "Barlow Condensed"', 'AB12'], ['500 40px "Barlow Condensed"', 'AB'], ['700 40px "Noto Sans Kannada"', 'ಕನ್ನಡ']];
      const all = Promise.all(specs.map((s) => document.fonts.load(s[0], s[1]).catch(() => null)));
      return Promise.race([all, new Promise((r) => setTimeout(r, 2500))]);
    } catch (e) { return Promise.resolve(); }
  }
  const hexA = (hex, a) => { const n = parseInt(safeColor(hex).slice(1), 16); return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; };
  function spacing(g, px) { if ('letterSpacing' in g) g.letterSpacing = (prefs.lang === 'kn' ? 0 : px) + 'px'; }
  function fitFont(g, text, maxW, size, tpl) {
    let s = size;
    g.font = tpl.replace('{s}', s);
    while (s > 18 && g.measureText(text).width > maxW) { s -= 2; g.font = tpl.replace('{s}', s); }
    return s;
  }
  function glow(g, x, y, r, color, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, hexA(color, a)); gr.addColorStop(1, hexA(color, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 1080, 1350);
  }
  function drawBall(g, x, y, r) {
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    gr.addColorStop(0, '#F7FFB8'); gr.addColorStop(0.45, '#D4F03C'); gr.addColorStop(1, '#A3BF14');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.save(); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = r * 0.12;
    g.beginPath(); g.arc(x - r * 1.36, y, r, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(x + r * 1.36, y, r, 0, Math.PI * 2); g.stroke();
    g.restore();
  }
  function wrapText(g, text, x, y, maxW, lh, maxLines) {
    const words = text.split(' ');
    let line = '', n = 0;
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + ' ' + words[i] : words[i];
      if (g.measureText(test).width > maxW && line) {
        g.fillText(line, x, y + n * lh); n++; line = words[i];
        if (n >= maxLines - 1) {
          const full = words.slice(i).join(' ');
          let rest = full;
          while (g.measureText(rest + '…').width > maxW && rest.length > 1) rest = rest.slice(0, -1);
          g.fillText(rest === full ? rest : rest.trim() + '…', x, y + n * lh);
          return;
        }
      } else line = test;
    }
    if (line) g.fillText(line, x, y + n * lh);
  }
  async function makePoster(m) {
    const st = stateOf(m);
    if (!st || !st.result) throw new Error('no result');
    await fontsReady();
    const W = 1080, H = 1350;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const T = m.teams, bpo = st.config.ballsPerOver;
    const FP = '"Anton", "Noto Sans Kannada", Impact, "Arial Black", sans-serif';
    const FC = '"Barlow Condensed", "Noto Sans Kannada", "Arial Narrow", sans-serif';
    const up = (s) => (prefs.lang === 'kn' ? s : String(s).toUpperCase());
    const ink = '#F3F6FB', ink2 = 'rgba(243,246,251,.74)', lime = '#D4F03C';
    g.fillStyle = '#0A0D13'; g.fillRect(0, 0, W, H);
    glow(g, 120, 160, 720, T.A.color, 0.55);
    glow(g, 1000, 430, 720, T.B.color, 0.5);
    glow(g, 520, 1400, 780, '#FFA62B', 0.26);
    g.save(); g.globalAlpha = 0.05; g.strokeStyle = '#FFFFFF'; g.lineWidth = 2;
    for (let x = -H; x < W; x += 26) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + H, H); g.stroke(); }
    g.restore();
    g.textBaseline = 'alphabetic';
    drawBall(g, 100, 104, 30);
    g.textAlign = 'left'; g.fillStyle = ink; g.font = '700 40px ' + FC; spacing(g, 4);
    g.fillText(up(t('app')), 146, 118);
    g.textAlign = 'right'; g.fillStyle = ink2; spacing(g, 2);
    fitFont(g, up(t('matchNo', { n: m.no }) + ' · ' + fmtDate(m.createdAt)), 470, 30, '600 {s}px ' + FC);
    g.fillText(up(t('matchNo', { n: m.no }) + ' · ' + fmtDate(m.createdAt)), W - 70, 116);
    spacing(g, 0);
    const main = st.innings.filter((i) => !i.isSuper && i.started);
    [270, 810].forEach((cx, k) => {
      const inn = main[k];
      if (!inn) return;
      const team = T[inn.bat];
      g.textAlign = 'center';
      g.fillStyle = safeColor(team.color); g.beginPath(); g.roundRect ? g.roundRect(cx - 60, 200, 120, 10, 5) : g.rect(cx - 60, 200, 120, 10); g.fill();
      g.fillStyle = ink; fitFont(g, up(team.name), 440, 62, '{s}px ' + FP); g.fillText(up(team.name), cx, 300);
      const sc = inn.runs + '/' + inn.wkts;
      fitFont(g, sc, 440, 170, '{s}px ' + FP); g.fillText(sc, cx, 482);
      g.fillStyle = ink2; g.font = '600 38px ' + FC; spacing(g, 2);
      g.fillText(up('(' + E.formatOvers(inn.balls, bpo) + ' ' + t('ov') + ')'), cx, 542); spacing(g, 0);
    });
    g.fillStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.arc(540, 392, 52, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2; g.stroke();
    g.fillStyle = lime; g.textAlign = 'center'; g.font = '42px ' + FP; g.fillText(t('p_vs'), 540, 408);
    const sup = st.innings.filter((i) => i.isSuper && i.started);
    if (sup.length) {
      const s = up(t('superLine', { n: sup[sup.length - 1].superNo }) + ': ' + sup.slice(-2).map((i) => T[i.bat].name + ' ' + i.runs + '/' + i.wkts).join('  ·  '));
      g.fillStyle = ink2; fitFont(g, s, 940, 32, '600 {s}px ' + FC); g.fillText(s, 540, 606);
    }
    g.save(); g.translate(540, 706); g.rotate(-0.035);
    g.fillStyle = lime; g.fillRect(-640, -66, 1280, 132);
    g.fillStyle = '#172000'; g.textAlign = 'center';
    const rt = up(resultText(m));
    fitFont(g, rt, 960, 66, '{s}px ' + FP); g.fillText(rt, 0, 24);
    g.restore();
    const top = E.performers(st)[0];
    if (top) {
      g.textAlign = 'left'; g.fillStyle = lime; g.font = '700 30px ' + FC; spacing(g, 5);
      g.fillText(up(t('potm')), 80, 846); spacing(g, 0);
      const nm = up(playerName(m, top.id));
      g.fillStyle = ink; fitFont(g, nm, 700, 92, '{s}px ' + FP); g.fillText(nm, 80, 944);
      g.fillStyle = ink2; g.font = '600 40px ' + FC; g.fillText(potmLine(st, top), 80, 998);
      g.textAlign = 'right'; g.fillStyle = ink; g.font = '84px ' + FP; g.fillText(String(Math.round(top.pts)), W - 80, 944);
      g.fillStyle = 'rgba(243,246,251,.6)'; g.font = '600 28px ' + FC; spacing(g, 3); g.fillText(up(t('ptsLabel')), W - 80, 986); spacing(g, 0);
    }
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(80, 1044, W - 160, 2);
    ['A', 'B'].forEach((side, k) => {
      const team = T[side], x = k ? 572 : 80, wMax = 428;
      g.textAlign = 'left'; g.fillStyle = safeColor(team.color);
      fitFont(g, up(team.name), wMax, 34, '700 {s}px ' + FC); g.fillText(up(team.name), x, 1096);
      const names = team.players.map((p) => p.name);
      if (m.joker) names.push(m.joker.name + ' (' + t('p_common') + ')');
      g.fillStyle = 'rgba(243,246,251,.88)'; g.font = '500 30px ' + FC;
      wrapText(g, names.join(' · '), x, 1142, wMax, 38, 4);
    });
    g.textAlign = 'center'; g.fillStyle = 'rgba(243,246,251,.5)'; g.font = '600 26px ' + FC; spacing(g, 3);
    g.fillText(up(t('p_footer')), 540, 1314); spacing(g, 0);
    return cv;
  }

  /* ---------- SETTINGS ---------- */
  A.settings = () => { S.sheet = { type: 'settings' }; renderSheet(); };
  SHEETS.settings = () => {
    const st = NATIVE ? 'st_device' : Store.mode === 'cloud' ? 'st_cloud' : Store.mode === 'checking' ? 'st_checking' : 'st_local';
    return sheetWrap(t('settings'),
      '<p class="label">' + h('language') + '</p>' + seg('lang', [['en', 'English'], ['kn', 'ಕನ್ನಡ']], prefs.lang) +
      '<p class="label">' + h('theme') + '</p>' + seg('theme', [['auto', t('th_auto')], ['light', t('th_light')], ['dark', t('th_dark')]], prefs.theme) +
      '<p class="label">' + h('glass') + '</p>' + seg('glass', [['on', t('gl_on')], ['off', t('gl_off')]], prefs.glass) + '<p class="meta">' + h('glassSub') + '</p>' +
      '<p class="label">' + h('storage') + '</p><p class="status ' + (Store.mode === 'cloud' ? 'cloud' : '') + '">' + h(st) + '</p>' +
      '<p class="label">' + h('backup') + '</p><div class="duo"><button class="pill" data-act="exportFile">' + ICON.download + '<span>' + h(NATIVE ? 'exportPhone' : 'exportFile') + '</span></button>' +
      '<button class="pill" data-act="exportCopy">' + ICON.copy + '<span>' + h('exportCopy') + '</span></button></div>' +
      '<div style="margin-top:10px;display:grid;gap:10px"><label class="pill file-pill" for="importFile">' + h('importFile') + '</label>' +
      '<input id="importFile" class="sr" type="file" accept="application/json,.json,text/plain" data-change="importFile">' +
      '<label class="sr" for="importText">' + h('importPaste') + '</label><textarea id="importText" class="field" rows="3" placeholder="' + h('importPaste') + '"></textarea>' +
      '<button class="pill" data-act="importPaste">' + h('importBtn') + '</button>' +
      '<button class="pill danger-soft" data-act="wipeAsk">' + h('wipe') + '</button></div>');
  };
  A.lang = (ds) => { prefs.lang = ds.v === 'kn' ? 'kn' : 'en'; savePrefs(); applyPrefs(); render(); };
  A.theme = (ds) => { prefs.theme = ['auto', 'light', 'dark'].indexOf(ds.v) >= 0 ? ds.v : 'auto'; savePrefs(); applyPrefs(); render(); };
  A.glass = (ds) => { prefs.glass = ds.v === 'off' ? 'off' : 'on'; savePrefs(); applyPrefs(); render(); };
  function exportText() { return JSON.stringify({ app: 'gully-cricket', v: 1, exportedAt: new Date().toISOString(), data: { teams: D.teams, matches: D.matches, counter: D.counter, last: D.last, pairCfg: D.pairCfg } }); }
  A.exportFile = () => saveFile('gully-cricket-backup-' + new Date().toISOString().slice(0, 10) + '.json', exportText(), 'application/json');
  A.exportCopy = () => copyString(exportText());
  A.importFile = (ds, el) => {
    const f = el.files && el.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => importData(String(r.result || ''));
    r.readAsText(f);
    el.value = '';
  };
  A.importPaste = () => { const ta = document.getElementById('importText'); if (ta && ta.value.trim()) importData(ta.value.trim()); };
  function sanitizeTeam(tm) {
    return { id: String(tm.id), name: String(tm.name || '').slice(0, 40), color: safeColor(tm.color), updatedAt: +tm.updatedAt || Date.now(),
      players: tm.players.filter((p) => p && p.id).map((p) => ({ id: String(p.id), name: String(p.name || '').slice(0, 40) })) };
  }
  function importData(text) {
    let obj = null;
    try { obj = JSON.parse(text); } catch (e) { obj = null; }
    const data = obj && obj.app === 'gully-cricket' && obj.data;
    if (!data || !Array.isArray(data.matches) || !Array.isArray(data.teams)) { toast(t('importBad')); return; }
    let added = 0;
    data.teams.forEach((tm) => { if (tm && tm.id && Array.isArray(tm.players) && !D.teams.some((x) => x.id === String(tm.id))) D.teams.push(sanitizeTeam(tm)); });
    data.matches.forEach((m) => {
      if (!validMatch(m) || D.matches.some((x) => x.id === m.id)) return;
      if (m.status !== 'live') m.status = 'done';
      D.matches.push(m); Store.touchMatch(m); added += 1;
    });
    D.matches.sort((a, b) => a.createdAt - b.createdAt);
    D.counter = Math.max(D.counter || 0, ...D.matches.map((m) => +m.no || 0));
    if (!D.live) { const lv = D.matches.filter((m) => m.status === 'live'); if (lv.length) D.live = lv[lv.length - 1].id; }
    Store.touchMeta();
    S.sheet = null;
    toast(t('imported', { n: added }));
    render();
  }
  A.wipeAsk = () => confirmAsk(t('wipeQ'), 'wipe');

  /* ---------- navigation ---------- */
  A.home = () => go('home');
  A.closeSheet = () => closeSheet();
  A.history = () => go('history');
  A.resume = () => go('match');
  A.newMatch = () => {
    if (liveMatch()) { confirmAsk(t('abandonForNew'), 'abandonAndNew'); return; }
    S.draft = newDraft(); S.teamErr = []; go('teams');
  };
  /* Team id that won the most recent finished match between these two teams (null after a shared tie). */
  function lastPairWinner(aId, bId) {
    const done = D.matches.filter((m) => m.status === 'done' && m.result && [m.teams.A.id, m.teams.B.id].indexOf(aId) >= 0 && [m.teams.A.id, m.teams.B.id].indexOf(bId) >= 0);
    const m = done[done.length - 1];
    return m && m.result.winner ? m.teams[m.result.winner].id : null;
  }
  A.againWinner = () => {
    if (!D.last || !teamById(D.last.A) || !teamById(D.last.B)) return;
    const wid = lastPairWinner(D.last.A, D.last.B);
    S.draft = draftFromLast();
    const side = S.draft.A.id === wid ? 'A' : S.draft.B.id === wid ? 'B' : null;
    if (side) S.draft.toss = Object.assign(emptyToss(), { mode: 'winner', winner: side });
    go('toss');
  };
  A.again = () => { if (!D.last || !teamById(D.last.A) || !teamById(D.last.B)) return; S.draft = draftFromLast(); go('toss'); };
  A.openMatch = (ds) => {
    const m = findMatch(ds.id);
    if (!m) return;
    if (!stateOf(m)) { toast(t('errBroken')); return; }
    if (m.status === 'live') {
      if (D.live && D.live !== m.id) { toast(t('otherLive')); return; }
      D.live = m.id; go('match'); return;
    }
    S.viewId = m.id; S.cardTab = 0; go('result');
  };

  /* ---------- events ---------- */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = A[el.dataset.act];
    if (!fn) return;
    e.preventDefault();
    try { fn(el.dataset, el); } catch (err) { console.error(err); toast(t('errGeneric', { e: (err && err.message) || err })); }
  });
  document.addEventListener('input', (e) => { const el = e.target, k = el && el.dataset && el.dataset.in; if (k && INPUT[k]) INPUT[k](el); });
  document.addEventListener('change', (e) => { const el = e.target, k = el && el.dataset && el.dataset.change; if (k && A[k]) A[k](el.dataset, el); });
  document.addEventListener('keydown', (e) => {
    const el = e.target;
    if (e.key === 'Enter' && el && el.dataset && el.dataset.enter && A[el.dataset.enter]) { e.preventDefault(); A[el.dataset.enter](el.dataset, el); }
    else if (e.key === 'Escape' && S.sheet) closeSheet();
  });
  let wake = null, wakeBusy = false;
  async function syncWakeLock() {
    const want = S.screen === 'match' && document.visibilityState === 'visible';
    if (wakeBusy) return;
    wakeBusy = true;
    try {
      if (want && !wake && navigator.wakeLock) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
      else if (!want && wake) { const w = wake; wake = null; await w.release(); }
    } catch (e) { wake = null; }
    wakeBusy = false;
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Store.flushNow(); else syncWakeLock(); });
  window.addEventListener('pagehide', () => Store.flushNow());

  /* ---------- boot ---------- */
  function boot() {
    applyPrefs();
    if (liveMatch()) S.screen = 'match';
    render({ top: true });
    setTimeout(() => { Store.connect(); capDownloads(); }, 0);
  }
  /* Hardware back button (Android shell): close a sheet, else step back a screen. false = let the app close. */
  const BACK = { teams: 'home', rules: 'toTeams', toss: 'toRulesBack', match: 'home', result: 'home', poster: 'backToResult', history: 'home' };
  function goBack() {
    if (S.sheet) { closeSheet(); return true; }
    const a = BACK[S.screen];
    if (!a || !A[a]) return false;
    A[a]();
    return true;
  }
  window.GullyApp = { state: () => S, data: () => D, store: Store, back: goBack, native: !!NATIVE };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
