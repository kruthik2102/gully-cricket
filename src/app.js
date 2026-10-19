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
  const cleanName = (s) => String(s == null ? '' : s).trim().replace(/\s+/g, ' ').slice(0, 24);
  const norm = (s) => cleanName(s).toLowerCase();
  function randInt(n) {
    try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; } catch (e) { return Math.floor(Math.random() * n); }
  }
  function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = randInt(i + 1); const x = arr[i]; arr[i] = arr[j]; arr[j] = x; } return arr; }
  const pad2 = (n) => (n < 10 ? '0' : '') + n;
  function dayKey(ts) { const d = new Date(ts); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
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
    coin: ic('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/>'),
    list: ic('<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="M4 6l1 1 2-2"/><path d="M4 12l1 1 2-2"/><path d="M4 18l1 1 2-2"/>'),
    dice: ic('<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>'),
    shuffle: ic('<path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>'),
    chg: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 3h5v5"/><path d="M21 3l-7 7"/><path d="M8 21H3v-5"/><path d="M3 21l7-7"/></svg>',
  };
  ICON.tab_home = ic('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>');
  ICON.tab_board = ICON.trophy;
  ICON.tab_history = ic('<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>');
  const AS = window.GullyAssets || {};
  try { const cs = document.createElement('style'); cs.textContent = '.cap-o{background-image:url(' + AS.capO + ')}.cap-p{background-image:url(' + AS.capP + ')}'; document.head.appendChild(cs); } catch (e) { /* no head */ }
  const capImg = (k) => '<i class="cap-img cap-' + k + '" aria-hidden="true"></i>';
  const COIN_EMB = {
    H: '<svg class="emb" viewBox="0 0 64 64" aria-hidden="true"><g transform="rotate(-36 30 32)"><rect x="23" y="21" width="14" height="35" rx="5"/><rect x="27.5" y="5" width="5" height="18" rx="2.5"/></g><circle cx="48.5" cy="46.5" r="7.5"/><path d="M43.6 41.8a7.5 7.5 0 0 1 0 9.4M53.4 41.8a7.5 7.5 0 0 0 0 9.4" fill="none" class="seam"/></svg>',
    T: '<svg class="emb" viewBox="0 0 64 64" aria-hidden="true"><rect x="17" y="12" width="14" height="4" rx="2"/><rect x="33" y="12" width="14" height="4" rx="2"/><rect x="17.5" y="18" width="5.5" height="38" rx="2.4"/><rect x="29.25" y="18" width="5.5" height="38" rx="2.4"/><rect x="41" y="18" width="5.5" height="38" rx="2.4"/></svg>'
  };

  /* ---------- data ---------- */
  function emptyData() { return { v: 1, teams: [], regulars: [], onboarded: false, live: null, counter: 0, last: null, pairCfg: {}, savedAt: 0, matches: [] }; }
  function validMatch(m) { return !!(m && typeof m.id === 'string' && m.teams && m.teams.A && m.teams.B && Array.isArray(m.teams.A.players) && Array.isArray(m.teams.B.players) && Array.isArray(m.events) && m.toss); }
  /* Regular players: the people who usually play. Teams are picked from this list; a regular's id is reused as the player id. */
  function regularsFromTeams(teams) {
    const out = [];
    (Array.isArray(teams) ? teams : []).forEach((tm) => (tm && Array.isArray(tm.players) ? tm.players : []).forEach((p) => {
      const name = cleanName(p && p.name);
      if (name && !out.some((r) => norm(r.name) === norm(name))) out.push({ id: String(p.id || uid('p')), name });
    }));
    return out;
  }
  function unionRegulars(a, b) {
    const out = (Array.isArray(a) ? a : []).slice();
    (Array.isArray(b) ? b : []).forEach((r) => {
      const name = cleanName(r && r.name);
      if (name && !out.some((x) => norm(x.name) === norm(name))) out.push({ id: String((r && r.id) || uid('p')), name });
    });
    return out;
  }
  function loadLocal() {
    const meta = lsGet(META_KEY) || {};
    const d = emptyData();
    d.teams = Array.isArray(meta.teams) ? meta.teams : [];
    d.live = meta.live || null; d.counter = +meta.counter || 0; d.last = meta.last || null;
    d.pairCfg = meta.pairCfg && typeof meta.pairCfg === 'object' ? meta.pairCfg : {}; d.savedAt = +meta.savedAt || 0;
    (Array.isArray(meta.ids) ? meta.ids : []).forEach((id) => { const m = lsGet(MATCH_KEY + id); if (validMatch(m)) d.matches.push(m); });
    d.matches.sort((a, b) => a.createdAt - b.createdAt);
    if (d.live && !d.matches.some((m) => m.id === d.live && m.status === 'live')) d.live = null;
    // Older versions had no regulars list: build it from the saved teams so nobody retypes names.
    d.regulars = Array.isArray(meta.regulars) ? unionRegulars([], meta.regulars) : regularsFromTeams(d.teams);
    d.onboarded = !!meta.onboarded || d.teams.length > 0 || d.matches.length > 0;
    return d;
  }
  let D = loadLocal();
  function metaDoc() { return { v: 1, teams: D.teams, regulars: D.regulars, onboarded: !!D.onboarded, live: D.live, counter: D.counter, last: D.last, pairCfg: D.pairCfg, savedAt: D.savedAt }; }
  const findRegular = (name) => D.regulars.find((r) => norm(r.name) === norm(name)) || null;
  // "chethan" is saved as "Chethan"; names in other scripts are left as typed.
  const nameCase = (n) => n.replace(/(^|[\s.'-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  function addRegular(name) {
    const n = nameCase(cleanName(name));
    if (!n) return null;
    let r = findRegular(n);
    if (!r) { r = { id: uid('p'), name: n }; D.regulars.push(r); }
    return r;
  }
  /* Most-played first (from match history), then the order they were added. */
  function sortedRegulars() {
    const cnt = new Map();
    D.matches.forEach((m) => {
      const names = m.teams.A.players.concat(m.teams.B.players).map((p) => p.name);
      if (m.joker) names.push(m.joker.name);
      names.forEach((n) => { const k = norm(n); cnt.set(k, (cnt.get(k) || 0) + 1); });
    });
    return D.regulars.map((r, i) => ({ r, i, n: cnt.get(norm(r.name)) || 0 })).sort((a, b) => b.n - a.n || a.i - b.i).map((x) => x.r);
  }
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
      D.regulars = unionRegulars(D.regulars, Array.isArray(meta.regulars) ? meta.regulars : regularsFromTeams(meta.teams));
      D.onboarded = !!D.onboarded || !!meta.onboarded || (Array.isArray(meta.teams) && meta.teams.length > 0);
      if ((meta.savedAt || 0) > (D.savedAt || 0)) {
        D.last = meta.last || D.last; D.live = meta.live || null; D.savedAt = meta.savedAt;
        D.pairCfg = Object.assign({}, D.pairCfg, meta.pairCfg || {});
      } else {
        D.pairCfg = Object.assign({}, meta.pairCfg || {}, D.pairCfg);
      }
    }
    D.counter = Math.max(D.counter || 0, (meta && +meta.counter) || 0, ...D.matches.map((m) => +m.no || 0));
    if (D.matches.length) D.onboarded = true;
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
      D.live = null; S.viewId = m.id; S.cardTab = 0; S.resultFrom = 'live'; S.celebrate = m.id;
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
  const S = { screen: 'home', draft: null, mod: noMods(), sheet: null, openers: {}, viewId: null, cardTab: 0, teamErr: [], poster: null, toastT: 0, enterT: 0, fx: null, regMode: 'edit', regBack: 'home' };
  const emptyToss = () => ({ caller: null, call: null, real: false, result: null, winner: null, choice: null, flipping: false });
  function mkTeam(name, color) { return { id: uid('t'), name, color, players: [] }; }
  // Wides and no-balls are always bowled again (the toggles are gone); older matches keep whatever they were played with.
  function cfgBase(extra) { return Object.assign(clone(E.PRESETS.gully), { houseRules: [] }, extra || {}, { wideRebowl: true, nbRebowl: true }); }
  function newDraft() {
    return {
      A: mkTeam(t('team1'), COLORS[0].c), B: mkTeam(t('team2'), COLORS[1].c),
      joker: { on: false, id: uid('j'), name: '', bowls: true }, autoJoker: false, rand: null,
      config: cfgBase(), toss: emptyToss()
    };
  }
  function teamCopy(tm) { return { id: tm.id, name: tm.name, color: safeColor(tm.color), players: tm.players.map((p) => ({ id: p.id, name: p.name })) }; }
  function draftFromMatch(m) {
    const A = teamById(m.teams.A.id) || m.teams.A, B = teamById(m.teams.B.id) || m.teams.B;
    const cfg = Object.assign({}, D.pairCfg[pairKey(A.id, B.id)] || m.config);
    return {
      A: teamCopy(A), B: teamCopy(B), autoJoker: false, rand: null,
      joker: m.joker ? { on: true, id: m.joker.id, name: m.joker.name, bowls: cfg.jokerBowls !== false } : { on: false, id: uid('j'), name: '', bowls: true },
      config: cfgBase(cfg), toss: emptyToss()
    };
  }
  function draftFromLast() {
    const A = teamById(D.last.A), B = teamById(D.last.B);
    const cfg = D.pairCfg[pairKey(A.id, B.id)] || {};
    const j = D.last.joker || {};
    return {
      A: teamCopy(A), B: teamCopy(B), autoJoker: false, rand: null,
      joker: { on: !!j.on, id: j.id || uid('j'), name: j.name || '', bowls: j.bowls !== false },
      config: cfgBase(cfg), toss: emptyToss()
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
    const barHtml = out[1] ? '<div class="dock">' + out[1] + '</div>' : '';
    if (same) { patch(app, out[0]); patch($('#bar'), barHtml); } else { app.innerHTML = out[0]; $('#bar').innerHTML = barHtml; }
    app.classList.toggle('has-bar', !!out[1]);
    app.classList.toggle('has-tabs', TABS.indexOf(S.screen) >= 0);
    if (!same) {
      // Screens slide in from the side they logically come from: tabs left/right, deeper screens from the right.
      const a = TABS.indexOf(lastScreen), b = TABS.indexOf(S.screen);
      const dir = a >= 0 && b >= 0 ? (b > a ? 'right' : 'left') : (DEPTH[S.screen] || 0) >= (DEPTH[lastScreen] || 0) ? 'fwd' : 'back';
      app.classList.remove('enter', 'dir-right', 'dir-left', 'dir-fwd', 'dir-back');
      void app.offsetWidth;
      app.classList.add('enter', 'dir-' + dir);
      $('#bar').classList.add('enter-bar');
      clearTimeout(S.enterT);
      S.enterT = setTimeout(() => { app.classList.remove('enter'); $('#bar').classList.remove('enter-bar'); }, 700);
    }
    renderTabs();
    renderSheet();
    Coin3D.mountAll();
    if (!same && S.screen === 'home') countUp(app);
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
    let html = '', key = '';
    if (S.screen === 'match' && !(S.sheet && S.sheet.type === 'confirm')) {
      const m = liveMatch(), st = stateOf(m);
      const p = st && st.pending && st.pending.type;
      if (p === 'batter') { html = shNextBatter(m, st); key = 'p-batter'; }
      else if (p === 'bowler') { html = shNextBowler(m, st); key = 'p-bowler'; }
    }
    if (!html && S.sheet && SHEETS[S.sheet.type]) { html = SHEETS[S.sheet.type](); key = S.sheet.type + (S.sheet.side || ''); }
    const wasOpen = !root.hidden;
    // Re-rendering the same sheet (e.g. ticking names): keep its scroll position and skip the slide-in.
    const prev = root.querySelector('.sheet');
    const same = wasOpen && html && prev && root.dataset.k === key;
    const top = same ? prev.scrollTop : 0;
    if (same) patch(root, html); else root.innerHTML = html;
    root.hidden = !html;
    root.dataset.k = html ? key : '';
    root.classList.toggle('still', !!same);
    if (same) { const sh = root.querySelector('.sheet'); if (sh) { sh.classList.add('still'); sh.scrollTop = top; } }
    if (wasOpen && prev && !same) ghostOut(prev, root.querySelector('.scrim'));
    const bar = $('#bar');
    bar.hidden = !!html || !bar.innerHTML;
    const tabs = $('#tabs');
    if (tabs) tabs.hidden = !!html || TABS.indexOf(S.screen) < 0;
    document.body.style.overflow = html ? 'hidden' : '';
    if (html && !wasOpen) {
      const f = root.querySelector('.sheet [data-autofocus]') || root.querySelector('.sheet button:not([disabled])');
      if (f) f.focus({ preventScroll: true });
    }
  }
  function go(screen) { S.screen = screen; S.sheet = null; render({ top: true }); }
  /* A closing sheet leaves as a non-interactive copy that slides back down, so the real one is gone at once. */
  function ghostOut(sheet, nextScrim) {
    if (reducedMotion() || !sheet.animate) return;
    const g = document.createElement('div');
    g.className = 'ghost';
    g.setAttribute('aria-hidden', 'true');
    const sc = document.createElement('div');
    sc.className = 'scrim';
    const cp = sheet.cloneNode(true);
    cp.classList.add('still');
    if (!nextScrim) g.appendChild(sc);
    g.appendChild(cp);
    document.body.appendChild(g);
    const from = getComputedStyle(sheet).transform;
    cp.animate([{ transform: from === 'none' ? 'translateY(0)' : from }, { transform: 'translateY(100%)' }], { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' });
    sc.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-out', fill: 'forwards' });
    setTimeout(() => g.remove(), 240);
  }
  /* Today's numbers count up once when the dashboard opens (occasional moment; under a second). */
  function countUp(root) {
    if (reducedMotion()) return;
    const els = Array.from(root.querySelectorAll('[data-count]')).filter((el) => +el.dataset.count > 0);
    if (!els.length) return;
    const t0 = performance.now(), D = 700;
    const step = (now) => {
      const u = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - u, 3);
      els.forEach((el) => { if (el.isConnected) el.textContent = String(Math.round(+el.dataset.count * e)); });
      if (u < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  /* Morph `root`'s children into `html`: keep matching nodes, update attributes and text, replace what differs.
     Kept nodes let CSS transitions run (switches slide, the segmented thumb glides, ticks and colours fade).
     data-re="…" marks an element that must be rebuilt when its value changes, so its keyframe plays again;
     data-keep leaves an element's children alone (the 3D coin canvas lives there). */
  function patch(root, html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    morph(root, tpl.content);
  }
  function morph(from, to) {
    const a = from.childNodes, b = to.childNodes;
    for (let i = 0; i < b.length; i++) {
      const nb = b[i], na = a[i];
      if (!na) { from.appendChild(born(nb.cloneNode(true))); continue; }
      const keyed = nb.nodeType === 1 && nb.getAttribute('data-re') !== na.getAttribute('data-re');
      if (keyed || na.nodeType !== nb.nodeType || na.nodeName !== nb.nodeName || (nb.nodeType === 1 && nb.id !== na.id)) { const c = nb.cloneNode(true); from.replaceChild(keyed ? c : born(c), na); continue; }
      if (nb.nodeType !== 1) { if (na.nodeValue !== nb.nodeValue) na.nodeValue = nb.nodeValue; continue; }
      syncAttrs(na, nb);
      if (na.hasAttribute('data-keep')) continue;
      if (na.tagName === 'TEXTAREA') { if (na !== document.activeElement) na.value = nb.value; continue; }
      morph(na, nb);
    }
    while (a.length > b.length) from.removeChild(from.lastChild);
  }
  function born(n) { if (n.nodeType === 1 && !reducedMotion()) n.classList.add('born'); return n; }
  function syncAttrs(x, y) {
    Array.from(x.attributes).forEach((at) => { if (!y.hasAttribute(at.name)) x.removeAttribute(at.name); });
    Array.from(y.attributes).forEach((at) => { if (x.getAttribute(at.name) !== at.value) x.setAttribute(at.name, at.value); });
    if (x.tagName === 'INPUT' && x.type !== 'file' && x !== document.activeElement) { const v = y.getAttribute('value') || ''; if (x.value !== v) x.value = v; }
  }
  /* Bottom tab bar for the three top-level screens; built once so its highlight can glide between tabs. */
  const TABS = ['home', 'board', 'history'];
  const DEPTH = { home: 0, board: 0, history: 0, regulars: 1, teams: 1, rules: 2, toss: 3, match: 4, result: 5, poster: 6 };
  function renderTabs() {
    const el = $('#tabs');
    if (!el) return;
    const i = TABS.indexOf(S.screen);
    if (el.dataset.lang !== prefs.lang) {
      el.dataset.lang = prefs.lang;
      const lab = { home: t('tabHome'), board: t('tabBoard'), history: t('tabMatches') };
      el.innerHTML = '<div class="tabbar"><span class="tab-thumb" aria-hidden="true"></span>' + TABS.map((s) => '<button class="tab" data-act="tabGo" data-v="' + s + '">' + ICON['tab_' + s] + '<span>' + esc(lab[s]) + '</span></button>').join('') + '</div>';
    }
    const wasHidden = el.hidden;
    el.hidden = i < 0 || !!S.sheet;
    if (i < 0) return;
    if (wasHidden && !reducedMotion()) { el.classList.add('pop'); setTimeout(() => el.classList.remove('pop'), 400); }
    const bar = el.firstChild, th = bar.querySelector('.tab-thumb'), from = bar.dataset.i == null ? i : +bar.dataset.i;
    bar.dataset.i = i;
    if (from !== i && !wasHidden) liquid(th, 'translateX(' + (from * 100) + '%)', 'translateX(' + (i * 100) + '%)', 340, 'cubic-bezier(0.77, 0, 0.175, 1)');
    else th.style.transform = 'translateX(' + (i * 100) + '%)';
    el.querySelectorAll('.tab').forEach((b, k) => { if (k === i) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  }
  /* Liquid-glass move: the pill stretches along its path and settles with a small wobble.
     Starts from wherever it is right now, so a second tap mid-move retargets instead of jumping. */
  function liquid(el, fromT, toT, ms, ease) {
    if (!el.animate || reducedMotion()) { el.style.transform = toT; return; }
    const cur = el.getAnimations().length ? getComputedStyle(el).transform : fromT;
    el.getAnimations().forEach((an) => an.cancel());
    el.style.transform = toT;
    el.animate([{ transform: cur }, { transform: toT + ' scaleX(1.28) scaleY(.88)', offset: 0.42 }, { transform: toT + ' scaleX(.96) scaleY(1.04)', offset: 0.78 }, { transform: toT }], { duration: ms, easing: ease });
  }
  function liquidSwitch(sw) {
    const k = sw.querySelector('.switch i');
    if (!k || !k.animate || reducedMotion()) return;
    const on = sw.getAttribute('aria-checked') === 'true', b = on ? 20 : 0;
    liquid(k, 'translateX(' + (on ? 0 : 20) + 'px)', 'translateX(' + b + 'px)', 300, 'cubic-bezier(0.23, 1, 0.32, 1)');
    k.style.transform = '';
    k.animate([{ backgroundColor: 'rgba(255,255,255,.5)', boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.95), 0 6px 16px rgba(0,0,0,.35)' }, { backgroundColor: 'rgba(255,255,255,1)', boxShadow: 'inset 0 0 0 0 rgba(255,255,255,0), 0 2px 6px rgba(0,0,0,.3)' }], { duration: 300, easing: 'ease' });
  }
  function liquidSeg(seg, from) {
    const th = seg.querySelector('.seg-thumb'), to = +getComputedStyle(seg).getPropertyValue('--i');
    if (!th || !th.animate || reducedMotion() || from === to || isNaN(from)) return;
    th.getAnimations().forEach((an) => an.cancel());
    th.animate([{ transform: 'none' }, { transform: 'scaleX(1.22) scaleY(.9)', offset: 0.45 }, { transform: 'scaleX(.97) scaleY(1.03)', offset: 0.8 }, { transform: 'none' }], { duration: 300, easing: 'cubic-bezier(0.77, 0, 0.175, 1)' });
  }
  A.tabGo = (ds) => { if (S.screen === ds.v) { window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' }); return; } go(ds.v); };
  function closeSheet() { S.sheet = null; renderSheet(); }
  function toast(msg) {
    const root = $('#toast');
    if (!root) return;
    root.innerHTML = '<div class="toast" role="status">' + esc(msg) + '</div>';
    clearTimeout(S.toastT);
    S.toastT = setTimeout(() => {
      const el = root.firstChild;
      if (!el || reducedMotion()) { root.innerHTML = ''; return; }
      el.classList.add('out');
      S.toastT = setTimeout(() => { root.innerHTML = ''; }, 200);
    }, 2800);
  }
  function confirmAsk(msg, yes, danger) { S.sheet = { type: 'confirm', msg, yes, danger: danger !== false }; renderSheet(); }

  /* ---------- small components ---------- */
  function topbar(titleHtml, back, right) {
    return '<header class="top">' + (back ? '<button class="icon-btn" data-act="' + back + '" aria-label="' + h('back') + '">' + ICON.back + '</button>' : '<span class="icon-spacer" aria-hidden="true"></span>') +
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
  function ballChip(b, fx) {
    const x = E.ballText(b);
    const chipHtml = '<span class="tb tone-' + x.tone + (b.legal ? '' : ' mini') + '" title="' + esc(x.t) + '"><b>' + esc(x.t) + '</b></span>';
    // A boundary that was just hit gets a one-time pop: orange ripple for a four, purple burst with sparks for a six.
    if (fx && x.tone === 'w') return chipHtml.replace('class="tb ', 'class="tb drop ');
    if (fx && (x.tone === '4' || x.tone === '6')) return '<span class="fx fx' + x.tone + '">' + chipHtml + '<i class="ring" aria-hidden="true"></i>' + (x.tone === '6' ? '<i class="sparks" aria-hidden="true"></i><i class="sparks s2" aria-hidden="true"></i>' : '') + '</span>';
    return chipHtml;
  }

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
    x += todayCard(done);
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
  function rowItem(m, k) {
    const res = m.status === 'done' && m.result ? resultText(m) : t('liveNow');
    return '<button class="row-item" style="--k:' + (+k || 0) + '" data-act="openMatch" data-id="' + esc(m.id) + '"><span class="ri-no">#' + (+m.no || 0) + '</span>' +
      '<span class="ri-main"><b>' + esc(m.teams.A.name) + ' <span class="vs">v</span> ' + esc(m.teams.B.name) + '</b><small>' + esc(res) + '</small></span>' +
      '<span class="ri-date">' + esc(fmtDate(m.createdAt)) + '</span></button>';
  }
  function howItWorks() {
    const demo = [{ kind: 'legal', bat: 1, runs: 1, legal: true }, { kind: 'legal', bat: 4, runs: 4, legal: true }, { kind: 'legal', bat: 0, runs: 0, legal: true },
      { kind: 'wide', bat: 0, ext: 0, runs: 1, legal: false }, { kind: 'legal', bat: 0, runs: 0, w: 'bowled', legal: true }, { kind: 'legal', bat: 6, runs: 6, legal: true }, { kind: 'legal', bat: 2, runs: 2, legal: true }];
    return '<section class="pane"><h2 class="sec">' + h('howTitle') + '</h2><div class="balls" aria-hidden="true">' + demo.map((b) => ballChip(b)).join('') + '</div>' +
      '<ol class="steps"><li>' + h('how1') + '</li><li>' + h('how2') + '</li><li>' + h('how3') + '</li><li>' + h('how4') + '</li></ol></section>';
  }
  VIEWS.history = () => {
    const all = D.matches.slice().reverse();
    return [topbar(h('history'), null) + (all.length ? '<div class="list">' + all.map(rowItem).join('') + '</div>' : '<p class="meta">' + h('noHistory') + '</p>'), ''];
  };

  /* ---------- REGULARS (first launch + edit list) ---------- */
  function needsWelcome() { return !D.onboarded && !D.regulars.length && !D.matches.length && !D.teams.length; }
  function splitNames(v) { return String(v || '').split(/[,\n;]+/).map(cleanName).filter(Boolean); }
  VIEWS.regulars = () => {
    const welcome = S.regMode === 'welcome';
    if (welcome && D.onboarded) { S.screen = 'home'; return null; } // data arrived from the cloud: nothing to set up
    const regs = D.regulars;
    let x = welcome
      ? '<header class="hero"><div class="brand"><span class="tb tb-logo" aria-hidden="true"></span><div><h1 class="brand-name">' + h('app') + '</h1><p class="brand-sub">' + h('tagline') + '</p></div></div>' + iconBtn('settings', ICON.gear, t('settings')) + '</header>'
      : topbar(h('regulars'), 'regBack');
    x += '<section class="pane"><h2 class="sec">' + h('regTitle') + '</h2><p class="meta" style="margin:-6px 0 14px">' + h('regSub') + '</p>' +
      '<div class="add-row"><label class="sr" for="regAdd">' + h('addPlaceholder') + '</label><input id="regAdd" class="field" data-enter="regAdd" placeholder="' + h('addPlaceholder') + '" maxlength="400" autocomplete="off" enterkeyhint="done">' +
      '<button class="pill" data-act="regAdd">' + ICON.plus + '<span>' + h('addPlayer') + '</span></button></div>' +
      (regs.length ? '<ul class="roster">' + regs.map((r, i) => '<li><span class="num">' + (i + 1) + '</span><span class="pname">' + esc(r.name) + '</span><button class="icon-sm" data-act="regRm" data-id="' + esc(r.id) + '" aria-label="' + h('removePlayer', { name: r.name }) + '">' + ICON.x + '</button></li>').join('') + '</ul>'
        : '<p class="meta reg-empty">' + h('regEmpty') + '</p>') +
      '<p class="meta">' + h('players', { n: regs.length }) + '</p></section>';
    const btn = welcome && !regs.length ? '<button class="pill" data-act="regDone">' + h('regSkip') + '</button>' : '<button class="pill primary" data-act="regDone">' + h('regDone') + '</button>';
    return [x, btn];
  };
  function addTypedRegulars(input) {
    const names = splitNames(input && input.value);
    names.forEach(addRegular);
    if (input) input.value = '';
    return names.length;
  }
  A.regAdd = () => {
    const input = document.getElementById('regAdd');
    if (!input) return;
    if (!addTypedRegulars(input)) { input.focus(); return; }
    Store.touchMeta();
    render({ focus: 'regAdd' });
  };
  A.regRm = (ds) => { D.regulars = D.regulars.filter((r) => r.id !== ds.id); Store.touchMeta(); render(); };
  A.regDone = () => {
    addTypedRegulars(document.getElementById('regAdd')); // a name typed but not added yet still counts
    if (S.regMode === 'welcome') { D.onboarded = true; Store.touchMeta(); go('home'); return; }
    Store.touchMeta();
    A.regBack();
  };
  A.regBack = () => { const b = S.regBack; go(b && b !== 'regulars' && VIEWS[b] ? b : 'home'); };
  A.regEdit = () => { if (S.screen !== 'regulars') S.regBack = S.screen; S.regMode = 'edit'; S.sheet = null; go('regulars'); };

  /* ---------- TEAMS ---------- */
  const hasName = (tm, name) => tm.players.some((p) => norm(p.name) === norm(name));
  const isJokerName = (d, name) => !!(d.joker.on && cleanName(d.joker.name) && norm(d.joker.name) === norm(name));
  function freeId(d, id) {
    const used = d.A.players.concat(d.B.players).some((p) => p.id === id) || (d.joker.on && d.joker.id === id);
    return used ? uid('p') : id;
  }
  /* Adds a regular to a team. Returns false (with a toast) when they're already on the other side or are the common player. */
  function putInTeam(d, side, r) {
    const tm = d[side], oth = d[E.other(side)];
    if (hasName(tm, r.name)) return false;
    if (hasName(oth, r.name)) { toast(t('alreadyIn', { name: r.name, team: oth.name })); return false; }
    if (isJokerName(d, r.name)) { toast(t('isCommon', { name: r.name })); return false; }
    if (tm.players.length >= MAX_PLAYERS) { toast(t('maxPlayers')); return false; }
    tm.players.push({ id: freeId(d, r.id), name: r.name });
    return true;
  }
  function checkRow(act, r, on, disabled, tag) {
    return '<button class="pick check" data-act="' + act + '" data-id="' + esc(r.id) + '" aria-pressed="' + !!on + '"' + (disabled ? ' disabled' : '') + '>' +
      '<span class="ck" aria-hidden="true">' + ICON.check + '</span><span class="pn">' + esc(r.name) + '</span>' + (tag ? '<small class="tag">' + tag + '</small>' : '') + '</button>';
  }
  const sheetAddRow = () => '<div class="add-row sheet-add"><label class="sr" for="sheetAdd">' + h('newName') + '</label><input id="sheetAdd" class="field" data-enter="sheetAdd" placeholder="' + h('newName') + '" maxlength="400" autocomplete="off" enterkeyhint="done">' +
    '<button class="pill" data-act="sheetAdd">' + ICON.plus + '<span>' + h('addPlayer') + '</span></button></div>';
  VIEWS.teams = () => {
    const d = S.draft;
    if (!d) { S.screen = 'home'; return null; }
    let x = topbar(h('teams'), 'home');
    x += '<section class="pane rand"><div class="rand-text"><b>' + h('randTitle') + '</b><span>' + h('randSub') + '</span></div><div class="rand-acts">' +
      '<button class="pill" data-act="randOpen">' + ICON.dice + '<span>' + h('randBtn') + '</span></button>' +
      (d.rand ? '<button class="pill" data-act="randAgain">' + ICON.shuffle + '<span>' + h('randAgain') + '</span></button>' : '') + '</div></section>';
    if (d.autoJoker && d.joker.on) {
      x += '<div class="note note-wrap" role="status"><span>' + h('bothNote', { name: d.joker.name }) + '</span><span class="note-acts">' +
        '<button class="pill pill-sm" data-act="commonOpen">' + h('change') + '</button><button class="pill pill-sm" data-act="randMore">' + h('addOneMore') + '</button></span></div>';
    }
    x += teamCard('A') + teamCard('B') + jokerCard();
    if (S.teamErr.length) x += '<div class="errors" role="alert">' + S.teamErr.map((e) => '<span>' + esc(e) + '</span>').join('') + '</div>';
    return [x, '<button class="pill primary" data-act="toRules">' + h('nextRules') + '</button>'];
  };
  function teamCard(side) {
    const d = S.draft, tm = d[side];
    const c = safeColor(tm.color);
    return '<section class="pane team" style="--team:' + c + '">' +
      '<div class="team-head"><span class="team-dot" aria-hidden="true"></span><label class="sr" for="name' + side + '">' + h('teamName') + '</label>' +
      '<input id="name' + side + '" class="field field-name" data-in="name" data-side="' + side + '" value="' + esc(tm.name) + '" placeholder="' + h(side === 'A' ? 'team1' : 'team2') + '" maxlength="24" autocomplete="off"></div>' +
      '<div class="swatches" role="radiogroup" aria-label="' + h('color') + '">' + COLORS.map((o) => '<button class="swatch" style="--c:' + o.c + '" role="radio" aria-checked="' + (o.c === c) + '" aria-label="' + o.n + '" data-act="color" data-side="' + side + '" data-v="' + o.c + '"></button>').join('') + '</div>' +
      (tm.players.length ? '<ul class="roster">' + tm.players.map((p, i) => '<li><span class="num">' + (i + 1) + '</span><span class="pname">' + esc(p.name) + '</span><button class="icon-sm" data-act="rmPlayer" data-side="' + side + '" data-id="' + esc(p.id) + '" aria-label="' + h('removePlayer', { name: p.name }) + '">' + ICON.x + '</button></li>').join('') + '</ul>' : '') +
      '<button class="pill wide reg-btn" data-act="regPick" data-side="' + side + '">' + ICON.list + '<span>' + h('pickRegulars') + '</span></button>' +
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
  INPUT.jokerName = (el) => { S.draft.joker.name = el.value; S.draft.autoJoker = false; };
  A.addPlayer = (ds) => {
    const side = ds.side, input = document.getElementById('add' + side);
    if (!input) return;
    const names = splitNames(input.value);
    if (!names.length) { input.focus(); return; }
    names.forEach((n) => { const r = addRegular(n); if (r) putInTeam(S.draft, side, r); });
    input.value = '';
    S.teamErr = [];
    Store.touchMeta();
    render({ focus: 'add' + side });
  };
  A.rmPlayer = (ds) => { const tm = S.draft[ds.side]; tm.players = tm.players.filter((p) => p.id !== ds.id); render(); };
  A.color = (ds) => { S.draft[ds.side].color = safeColor(ds.v); render(); };
  A.jokerToggle = () => {
    const d = S.draft, j = d.joker;
    if (j.on && d.autoJoker && cleanName(j.name)) {
      // The odd-count common player is switched off: they join the smaller team instead.
      const side = d.A.players.length <= d.B.players.length ? 'A' : 'B', id = j.id, name = cleanName(j.name);
      j.on = false; d.autoJoker = false;
      if (!hasName(d[side], name)) d[side].players.push({ id: freeId(d, id), name });
      j.name = ''; j.id = uid('j');
      render();
      return;
    }
    j.on = !j.on; d.autoJoker = false;
    render(j.on ? { focus: 'jokerName' } : {});
  };
  A.jokerBowls = () => { S.draft.joker.bowls = !S.draft.joker.bowls; render(); };

  /* pick from regulars (per team) */
  A.regPick = (ds) => { S.sheet = { type: 'regPick', side: ds.side === 'B' ? 'B' : 'A' }; renderSheet(); };
  SHEETS.regPick = () => {
    const d = S.draft;
    if (!d) return '';
    const side = S.sheet.side, tm = d[side], oth = d[E.other(side)];
    const regs = sortedRegulars();
    const rows = regs.map((r) => {
      const mine = hasName(tm, r.name), theirs = !mine && hasName(oth, r.name), common = !mine && !theirs && isJokerName(d, r.name);
      return checkRow('regToggle', r, mine, theirs || common, theirs ? esc(oth.name) : common ? h('commonTag') : '');
    }).join('');
    return sheetWrap(t('pickFor', { team: tm.name || t(side === 'A' ? 'team1' : 'team2') }),
      '<p class="sheet-sub">' + h('pickedN', { n: tm.players.length }) + '</p>' +
      (regs.length ? '<div class="pick-list">' + rows + '</div>' : '<p class="meta">' + h('noRegulars') + '</p>') + sheetAddRow() +
      '<div class="sheet-foot"><button class="link" data-act="regEdit">' + h('editList') + '</button><button class="pill primary" data-act="sheetDone">' + h('regDone') + '</button></div>');
  };
  A.regToggle = (ds) => {
    const d = S.draft, sh = S.sheet;
    if (!d || !sh) return;
    const r = D.regulars.find((x) => x.id === ds.id);
    if (!r) return;
    const tm = d[sh.side];
    if (hasName(tm, r.name)) tm.players = tm.players.filter((p) => norm(p.name) !== norm(r.name));
    else if (!putInTeam(d, sh.side, r)) return;
    S.teamErr = [];
    render();
  };
  A.sheetAdd = () => {
    const input = document.getElementById('sheetAdd'), d = S.draft, sh = S.sheet;
    if (!input || !d || !sh) return;
    const names = splitNames(input.value);
    if (!names.length) { input.focus(); return; }
    names.forEach((n) => {
      const r = addRegular(n);
      if (!r) return;
      if (sh.type === 'regPick') putInTeam(d, sh.side, r);
      else if (sh.type === 'rand' && sh.sel.indexOf(r.id) < 0) sh.sel.push(r.id);
    });
    input.value = '';
    Store.touchMeta();
    render({ focus: 'sheetAdd' });
  };
  A.sheetDone = () => { S.sheet = null; render(); };

  /* randomise: tick who's playing, split evenly; the common player stays out of the shuffle */
  const manualJoker = (d) => (d.joker.on && !d.autoJoker && cleanName(d.joker.name) ? cleanName(d.joker.name) : null);
  function randPlan(d, sel) {
    const manual = manualJoker(d);
    const pool = sel.map((id) => D.regulars.find((r) => r.id === id)).filter((r) => r && !(manual && norm(r.name) === norm(manual)));
    const n = pool.length, odd = n % 2 === 1, k = Math.floor(n / 2);
    let msg = '', ok = false;
    if (n < 4) msg = t('randNeed');
    else if (odd && manual) msg = t('randOddFixed', { name: manual });
    else if (k > MAX_PLAYERS) msg = t('maxPlayers');
    else { ok = true; msg = t(odd ? 'randOdd' : 'randEven', { n, k }); }
    return { pool, manual, odd, ok, msg };
  }
  A.randOpen = () => {
    const d = S.draft;
    if (!d) return;
    let sel;
    if (d.rand) sel = d.rand.sel.filter((id) => D.regulars.some((r) => r.id === id));
    else {
      const names = d.A.players.concat(d.B.players).map((p) => p.name);
      if (d.autoJoker && d.joker.on) names.push(d.joker.name);
      sel = names.map(findRegular).filter(Boolean).map((r) => r.id);
    }
    S.sheet = { type: 'rand', sel: Array.from(new Set(sel)) };
    renderSheet();
  };
  SHEETS.rand = () => {
    const d = S.draft;
    if (!d) return '';
    const sel = S.sheet.sel, regs = sortedRegulars(), plan = randPlan(d, sel);
    const can = (r) => !(plan.manual && norm(r.name) === norm(plan.manual));
    const allOn = regs.filter(can).every((r) => sel.indexOf(r.id) >= 0);
    const rows = regs.map((r) => checkRow('randToggle', r, can(r) && sel.indexOf(r.id) >= 0, !can(r), can(r) ? '' : h('commonTag'))).join('');
    return sheetWrap(t('whoPlaying'),
      '<div class="sheet-row"><p class="sheet-sub">' + h('randSub') + '</p>' + (regs.length ? '<button class="link" data-act="randAll">' + h(allOn ? 'selectNone' : 'selectAll') + '</button>' : '') + '</div>' +
      (plan.manual ? '<p class="meta">' + h('randCommonNote', { name: plan.manual }) + '</p>' : '') +
      (regs.length ? '<div class="pick-list">' + rows + '</div>' : '<p class="meta">' + h('noRegulars') + '</p>') + sheetAddRow() +
      '<div class="sheet-foot col"><p class="rand-status' + (plan.ok ? '' : ' warn') + '" aria-live="polite">' + esc(plan.msg) + '</p>' +
      '<button class="pill primary wide" data-act="randMake"' + (plan.ok ? '' : ' disabled') + '>' + ICON.dice + '<span>' + h('randMake') + '</span></button></div>');
  };
  A.randToggle = (ds) => { const sel = S.sheet.sel, i = sel.indexOf(ds.id); if (i >= 0) sel.splice(i, 1); else sel.push(ds.id); renderSheet(); };
  A.randAll = () => {
    const d = S.draft, sh = S.sheet, manual = manualJoker(d);
    const ids = D.regulars.filter((r) => !(manual && norm(r.name) === norm(manual))).map((r) => r.id);
    sh.sel = ids.every((id) => sh.sel.indexOf(id) >= 0) ? [] : ids;
    renderSheet();
  };
  function makeTeams(d, sel) {
    const plan = randPlan(d, sel);
    if (!plan.ok) { toast(plan.msg); return false; }
    let pool = plan.pool.slice(), common = null;
    const pin = d.rand && d.rand.pin;
    if (plan.odd) {
      common = pool.find((r) => r.id === pin) || pool[randInt(pool.length)];
      pool = pool.filter((r) => r !== common);
    }
    shuffle(pool);
    const half = pool.length / 2;
    d.A.players = pool.slice(0, half).map((r) => ({ id: r.id, name: r.name }));
    d.B.players = pool.slice(half).map((r) => ({ id: r.id, name: r.name }));
    if (common) { d.joker.on = true; d.joker.id = common.id; d.joker.name = common.name; d.autoJoker = true; }
    else if (d.autoJoker) { d.joker = { on: false, id: uid('j'), name: '', bowls: d.joker.bowls }; d.autoJoker = false; }
    d.rand = { sel: sel.slice(), pin: common && common.id === pin ? pin : null };
    return true;
  }
  A.randMake = () => { const d = S.draft; if (!d || !S.sheet) return; if (makeTeams(d, S.sheet.sel)) { S.sheet = null; S.teamErr = []; haptic(20); render(); } };
  A.randAgain = () => { const d = S.draft; if (d && d.rand && makeTeams(d, d.rand.sel)) { S.teamErr = []; haptic(20); render(); } };
  A.randMore = () => { A.randOpen(); const el = document.getElementById('sheetAdd'); if (el) el.focus(); };
  A.commonOpen = () => { S.sheet = { type: 'common' }; renderSheet(); };
  SHEETS.common = () => {
    const d = S.draft;
    if (!d || !d.joker.on) return '';
    const rows = (side) => d[side].players.map((p) => '<button class="pick" data-act="commonPick" data-side="' + side + '" data-id="' + esc(p.id) + '"><span>' + esc(p.name) + '</span><small>' + esc(d[side].name) + '</small></button>').join('');
    return sheetWrap(t('pickCommon'), '<p class="sheet-sub">' + h('pickCommonSub', { name: d.joker.name }) + '</p><div class="pick-list">' + rows('A') + rows('B') + '</div>');
  };
  A.commonPick = (ds) => {
    const d = S.draft, tm = d && d[ds.side];
    if (!tm || !d.joker.on) return;
    const i = tm.players.findIndex((p) => p.id === ds.id);
    if (i < 0) return;
    const chosen = tm.players[i];
    tm.players[i] = { id: d.joker.id, name: cleanName(d.joker.name) };
    d.joker.id = chosen.id; d.joker.name = chosen.name; d.autoJoker = true;
    if (d.rand) d.rand.pin = chosen.id;
    S.sheet = null;
    render();
  };

  function validateTeams(d) {
    const errs = [];
    if (norm(d.A.name) === norm(d.B.name)) errs.push(t('errSame'));
    if (d.A.players.length < 2 || d.B.players.length < 2) errs.push(t('errPlayers'));
    const dup = d.A.players.find((p) => hasName(d.B, p.name));
    if (dup) errs.push(t('errDup', { name: dup.name }));
    if (d.joker.on && !cleanName(d.joker.name)) errs.push(t('errJoker'));
    else if (d.joker.on && (hasName(d.A, d.joker.name) || hasName(d.B, d.joker.name))) errs.push(t('errJokerInTeam', { name: cleanName(d.joker.name) }));
    return errs;
  }
  /* Teams are kept only so "play again", series counts and per-pair rules work; the newest ones are enough. */
  function upsertTeam(tm) {
    const x = { id: tm.id, name: cleanName(tm.name), color: safeColor(tm.color), players: tm.players.map((p) => ({ id: p.id, name: p.name })), updatedAt: Date.now() };
    const i = D.teams.findIndex((y) => y.id === tm.id);
    if (i >= 0) D.teams[i] = x; else D.teams.push(x);
    const keep = new Set(D.last ? [D.last.A, D.last.B] : []);
    D.teams = D.teams.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).filter((y, k) => k < 24 || keep.has(y.id));
  }
  A.toRules = () => {
    const d = S.draft;
    d.A.name = cleanName(d.A.name) || t('team1'); d.B.name = cleanName(d.B.name) || t('team2');
    S.teamErr = validateTeams(d);
    if (S.teamErr.length) { render(); const el = document.querySelector('.errors'); if (el) el.scrollIntoView({ block: 'center' }); return; }
    d.joker.name = cleanName(d.joker.name);
    // Everyone who plays lands in the regulars list, so next time they're one tap away.
    const all = d.A.players.concat(d.B.players);
    all.forEach((p) => addRegular(p.name));
    if (d.joker.on) { const r = addRegular(d.joker.name); if (r && r.id !== d.joker.id && !all.some((p) => p.id === r.id)) d.joker.id = r.id; }
    upsertTeam(d.A); upsertTeam(d.B);
    const saved = D.pairCfg[pairKey(d.A.id, d.B.id)];
    if (saved && !d.cfgTouched) d.config = cfgBase(saved);
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
    Coin3D.prefetch();
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
    x += '<section class="pane"><h2 class="sec">' + h('extras') + '</h2>' + sw('wideRuns', t('wideRun'), c.wideRuns > 0) +
      sw('nbRuns', t('nbRun'), c.nbRuns > 0) + sw('freeHit', t('freeHit'), c.freeHit) + sw('byes', t('byes'), c.byes) +
      '<p class="meta">' + h('rebowlNote') + '</p></section>';
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
  A.preset = (ds) => { const d = S.draft; if (!E.PRESETS[ds.v]) return; Object.assign(d.config, clone(E.PRESETS[ds.v]), { wideRebowl: true, nbRebowl: true }); d.cfgTouched = true; render(); };
  A.toggleRule = (ds) => {
    const c = S.draft.config, k = ds.k;
    if (k === 'wideRebowl' || k === 'nbRebowl') return;
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
        x += '<section class="pane toss-result">' + (ts.real ? '' : coinHtml(ts));
        if (!ts.result) x += '<button class="pill pill-xl primary wide" data-act="flip">' + h('flip') + '</button>';
        else if (ts.flipping) x += '<p class="big-line" aria-live="polite">' + h('flipping') + '</p>';
        else {
          const rv = S.reveal ? ' reveal' : '';
          S.reveal = false;
          x += '<p class="eyebrow' + rv + '" style="justify-content:center">' + h('itsX', { side: t(ts.result === 'H' ? 'heads' : 'tails') }) + '</p>' +
            '<h2 class="display' + rv + '" aria-live="polite">' + h('wonToss', { team: d[ts.winner].name }) + '</h2>' +
            '<p class="label">' + h('choose', { team: d[ts.winner].name }) + '</p><div class="duo">' +
            ['bat', 'bowl'].map((v) => '<button class="pill pill-lg" data-act="choice" data-v="' + v + '" aria-pressed="' + (ts.choice === v) + '">' + h(v) + '</button>').join('') + '</div>' +
            '<button class="link" data-act="resetToss" style="margin-top:6px">' + h('resetToss') + '</button>';
        }
        x += '</section>';
      }
    }
    return [x, ts.choice ? '<button class="pill primary" data-act="startMatch">' + h('startMatch') + '</button>' : ''];
  };
  /* Gold coin: two embossed faces, a ridged edge built from stacked layers, a sheen that sweeps across the metal,
     and a toss arc (up, spin, land, small bounce) with a shadow that shrinks as the coin rises. */
  const COIN_MS = 1850, COIN_LAND_MS = 1450;
  function coinHtml(ts) {
    const flying = ts.flipping && !reducedMotion();
    Coin3D.prefetch();
    if (Coin3D.usable()) return '<div class="coin-stage" aria-hidden="true"><div class="coin-shadow' + (flying ? ' go' : '') + '"></div><div class="coin-toss' + (flying ? ' go' : '') + '"><div class="coin3d-slot" data-keep></div></div></div>';
    const cls = flying ? ' flip-' + ts.result : (ts.result === 'T' ? ' show-T' : '');
    const edge = Array.from({ length: 9 }, (_, i) => '<i style="--z:' + (i * 1.1 - 4.4).toFixed(1) + 'px"></i>').join('');
    const face = (k, label) => '<div class="face ' + (k === 'H' ? 'heads' : 'tails') + '">' + COIN_EMB[k] + '<small>' + label + '</small><i class="sheen" aria-hidden="true"></i></div>';
    return '<div class="coin-stage" aria-hidden="true"><div class="coin-shadow' + (flying ? ' go' : '') + '"></div><div class="coin-toss' + (flying ? ' go' : '') + '"><div class="coin' + cls + '">' +
      '<div class="coin-edge">' + edge + '</div>' + face('H', h('heads')) + face('T', h('tails')) + '</div></div></div>';
  }
  /* Real 3D gold coin (three.js, loaded on demand): mirror-polished field, frosted raised emblems, reeded edge,
     studio reflections that slide over the metal as it spins. Falls back to the CSS coin when WebGL or the library is missing. */
  const Coin3D = (function () {
    const PX = 184;
    let st = null, loading = null, failed = false;
    const can = () => !failed && !(navigator.deviceMemory && navigator.deviceMemory < 2) && !!AS.three; // one small scene runs fine on 2 GB phones
    function prefetch() {
      if (!can() || window.THREE || loading) return;
      loading = new Promise((res) => {
        const sc = document.createElement('script');
        sc.src = AS.three; sc.async = true;
        sc.onload = () => res(!!window.THREE);
        sc.onerror = () => { failed = true; res(false); };
        document.head.appendChild(sc);
      }).then((ok) => { if (ok && S.screen === 'toss' && S.draft && !S.draft.toss.flipping) render(); return ok; });
    }
    const usable = () => can() && !!window.THREE && init();
    const mk = (w, hh) => { const c = document.createElement('canvas'); c.width = w; c.height = hh || w; return c; };
    function rrect(g, x, y, w, hh, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + hh, r); g.arcTo(x + w, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    function envCanvas() {
      const c = mk(1024, 512), g = c.getContext('2d');
      const sky = g.createLinearGradient(0, 0, 0, 512);
      sky.addColorStop(0, '#6a6f7c'); sky.addColorStop(0.48, '#3a3e48'); sky.addColorStop(0.52, '#2a2c33'); sky.addColorStop(1, '#4a3a22');
      g.fillStyle = sky; g.fillRect(0, 0, 1024, 512);
      g.filter = 'blur(10px)';
      // softboxes around the direction the coin face reflects (u≈0.75), so highlights slide across it as it sways
      [[690, 110, 160, 120, '#ffffff'], [600, 70, 36, 260, '#fff2d8'], [900, 80, 40, 250, '#ffe2ae'], [250, 120, 220, 110, '#ffffff'], [60, 330, 960, 40, '#6b5536']].forEach((b) => { g.fillStyle = b[4]; g.fillRect(b[0], b[1], b[2], b[3]); });
      g.filter = 'none';
      return c;
    }
    /* Face art: colour, height (raised relief) and roughness (frosted relief on a mirror field), drawn from the same shapes. */
    function faceMaps(k) {
      const N = 512, col = mk(N), hei = mk(N), rgh = mk(N);
      const gc = col.getContext('2d'), gh = hei.getContext('2d'), gr = rgh.getContext('2d');
      // the cylinder caps map the texture a quarter-turn off (opposite ways front and back), so the art is pre-rotated
      [gc, gh, gr].forEach((g) => { g.translate(256, 256); g.rotate((k === 'H' ? -1 : 1) * Math.PI / 2); g.translate(-256, -256); });
      const grd = gc.createRadialGradient(190, 160, 10, 256, 256, 330);
      grd.addColorStop(0, '#FFE7A1'); grd.addColorStop(0.5, '#F0BE4E'); grd.addColorStop(1, '#C7891F');
      gc.fillStyle = grd; gc.fillRect(0, 0, N, N);
      gh.fillStyle = '#7a7a7a'; gh.fillRect(0, 0, N, N);
      gr.fillStyle = '#4a4a4a'; gr.fillRect(0, 0, N, N);
      const all = (fn) => [[gc, '#D9A23B'], [gh, '#ffffff'], [gr, '#9a9a9a']].forEach((p) => { p[0].fillStyle = p[1]; p[0].strokeStyle = p[1]; fn(p[0]); });
      all((g) => { g.lineWidth = 22; g.beginPath(); g.arc(256, 256, 244, 0, Math.PI * 2); g.stroke(); });
      all((g) => { for (let i = 0; i < 72; i++) { const a = i * Math.PI / 36; g.beginPath(); g.arc(256 + Math.cos(a) * 212, 256 + Math.sin(a) * 212, 4.5, 0, Math.PI * 2); g.fill(); } });
      const S5 = 5, X = (x) => 256 + (x - 32) * S5, Y = (y) => 232 + (y - 32) * S5;
      all((g) => {
        if (k === 'H') {
          g.save(); g.translate(X(30), Y(32)); g.rotate(-36 * Math.PI / 180); g.translate(-X(30), -Y(32));
          rrect(g, X(23), Y(21), 14 * S5, 35 * S5, 5 * S5); g.fill(); rrect(g, X(27.5), Y(5), 5 * S5, 18 * S5, 2.5 * S5); g.fill();
          g.restore();
          g.beginPath(); g.arc(X(48.5), Y(46.5), 7.5 * S5, 0, Math.PI * 2); g.fill();
        } else {
          rrect(g, X(17), Y(12), 14 * S5, 4 * S5, 2 * S5); g.fill(); rrect(g, X(33), Y(12), 14 * S5, 4 * S5, 2 * S5); g.fill();
          [17.5, 29.25, 41].forEach((sx) => { rrect(g, X(sx), Y(18), 5.5 * S5, 38 * S5, 2.4 * S5); g.fill(); });
        }
        g.font = '700 46px "Barlow Condensed", "Noto Sans Kannada", sans-serif'; g.textAlign = 'center';
        if ('letterSpacing' in g) g.letterSpacing = prefs.lang === 'kn' ? '0px' : '8px';
        g.fillText(t(k === 'H' ? 'heads' : 'tails').toUpperCase(), 256, 418);
        g.font = '700 26px "Barlow Condensed", sans-serif';
        if ('letterSpacing' in g) g.letterSpacing = '0px';
        const word = 'GULLY CRICKET ★ ';
        for (let i = 0; i < word.length; i++) { const a = -Math.PI / 2 - 0.62 + i * 0.083; g.save(); g.translate(256 + Math.cos(a) * 180, 256 + Math.sin(a) * 180); g.rotate(a + Math.PI / 2); g.fillText(word[i], 0, 0); g.restore(); }
      });
      // seam on the ball (colour only)
      if (k === 'H') { gc.strokeStyle = '#FBE3A0'; gc.lineWidth = 5; [-1, 1].forEach((d) => { gc.beginPath(); gc.arc(X(48.5) + d * 7.5 * S5 * 1.15, Y(46.5), 7.5 * S5 * 0.85, Math.PI / 2 + (d > 0 ? 0.55 : -0.55 + Math.PI), Math.PI * 1.5 + (d > 0 ? -0.55 : 0.55 + Math.PI), d < 0); gc.stroke(); }); }
      return { col, hei, rgh };
    }
    function init() {
      if (st) return st.ok;
      st = { ok: false };
      try {
        const T = window.THREE;
        const canvas = mk(PX * 2);
        canvas.className = 'coin3d';
        const r = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
        r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        r.setSize(PX, PX, false);
        r.outputEncoding = T.sRGBEncoding;
        r.toneMapping = T.ACESFilmicToneMapping;
        r.toneMappingExposure = 1.25;
        const scene = new T.Scene();
        const cam = new T.PerspectiveCamera(30, 1, 0.1, 50);
        cam.position.set(0, 0, 5.3);
        const pm = new T.PMREMGenerator(r);
        const envT = new T.CanvasTexture(envCanvas());
        envT.mapping = T.EquirectangularReflectionMapping; envT.encoding = T.sRGBEncoding;
        scene.environment = pm.fromEquirectangular(envT).texture;
        envT.dispose(); pm.dispose();
        const faceMat = (k) => {
          const f = faceMaps(k), map = new T.CanvasTexture(f.col);
          map.encoding = T.sRGBEncoding; map.anisotropy = 4;
          return new T.MeshStandardMaterial({ map, bumpMap: new T.CanvasTexture(f.hei), bumpScale: 0.045, roughnessMap: new T.CanvasTexture(f.rgh), roughness: 1, metalness: 1, envMapIntensity: 1.35 });
        };
        const rid = mk(64, 8), rg = rid.getContext('2d');
        for (let i = 0; i < 64; i += 8) { rg.fillStyle = '#fff'; rg.fillRect(i, 0, 4, 8); rg.fillStyle = '#333'; rg.fillRect(i + 4, 0, 4, 8); }
        const ridT = new T.CanvasTexture(rid); ridT.wrapS = T.RepeatWrapping; ridT.repeat.set(14, 1);
        const edge = new T.MeshStandardMaterial({ color: 0xd8a03a, metalness: 1, roughness: 0.34, bumpMap: ridT, bumpScale: 0.025, envMapIntensity: 1.2 });
        const geo = new T.CylinderGeometry(1, 1, 0.13, 128, 1);
        geo.rotateX(Math.PI / 2);
        const fH = faceMat('H'), fT = faceMat('T');
        const mesh = new T.Mesh(geo, [edge, fH, fT]);
        const pivot = new T.Group(); pivot.add(mesh); scene.add(pivot);
        scene.add(new T.AmbientLight(0xffffff, 0.2));
        const key = new T.DirectionalLight(0xfff0d0, 1.6); key.position.set(-2.5, 3, 4); scene.add(key);
        const fill = new T.DirectionalLight(0xbfc8ff, 0.5); fill.position.set(3, -2, 2); scene.add(fill);
        Object.assign(st, { ok: true, T, r, scene, cam, pivot, canvas, mats: { H: fH, T: fT }, lang: prefs.lang, rest: 0, anim: null, raf: 0, flipFor: null });
      } catch (e) { failed = true; st.ok = false; }
      return st.ok;
    }
    function relabel() {
      if (st.lang === prefs.lang) return;
      st.lang = prefs.lang;
      ['H', 'T'].forEach((k) => { const f = faceMaps(k), m = st.mats[k]; m.map.image = f.col; m.map.needsUpdate = true; });
    }
    function frame(now) {
      st.raf = 0;
      if (!st.canvas.isConnected) return;
      const a = st.anim;
      let rx = st.rest, ry = 0, rz = 0;
      if (a) {
        const u = Math.min(1, (now - a.t0) / COIN_MS), L = COIN_LAND_MS / COIN_MS;
        if (u < L) { const v = u / L; rx = a.from + (a.to - a.from) * (1 - Math.pow(1 - v, 2.3)); ry = Math.sin(v * 9) * 0.25 * (1 - v); rz = 0.12 * (1 - v); }
        else { const v = (u - L) / (1 - L); rx = a.to + 0.22 * Math.sin(v * Math.PI * 2.4) * Math.pow(1 - v, 2); rz = 0.05 * Math.sin(v * Math.PI * 3) * (1 - v); }
        if (u >= 1) { st.anim = null; st.rest = a.to; rx = a.to; }
      } else if (!reducedMotion()) {
        // idle sway at ~30 fps: enough to keep reflections moving, half the battery of a full-rate loop
        if (now - (st.lastIdle || 0) < 32) { st.raf = requestAnimationFrame(frame); return; }
        st.lastIdle = now;
        ry = Math.sin(now / 1500) * 0.34; rz = Math.sin(now / 2300) * 0.06; rx = st.rest + Math.sin(now / 1900) * 0.1;
      }
      st.pivot.rotation.set(rx, ry, rz);
      st.r.render(st.scene, st.cam);
      if (st.anim || !reducedMotion()) st.raf = requestAnimationFrame(frame);
    }
    function mountAll() {
      const slot = document.querySelector('.coin3d-slot');
      if (!slot || !st || !st.ok || !S.draft) return;
      const ts = S.draft.toss;
      relabel();
      if (st.canvas.parentNode !== slot) slot.appendChild(st.canvas);
      const target = ts.result === 'T' ? Math.PI : 0;
      if (ts.flipping && st.flipFor !== ts && !reducedMotion()) {
        st.flipFor = ts;
        const from = st.rest % (Math.PI * 2);
        st.anim = { t0: performance.now(), from, to: Math.ceil((from + 12 * Math.PI - target) / (Math.PI * 2)) * Math.PI * 2 + target };
      } else if (!ts.flipping && !st.anim) { st.rest = ts.result ? target : 0; if (!ts.result) st.flipFor = null; }
      if (!st.raf) st.raf = requestAnimationFrame(frame);
    }
    return { prefetch, usable, mountAll };
  })();
  A.toRulesBack = () => go('rules');
  A.caller = (ds) => { const ts = S.draft.toss; if (ts.result) return; ts.caller = ds.v; render(); };
  A.call = (ds) => { const ts = S.draft.toss; if (ts.result) return; ts.call = ds.v; render(); };
  A.realCoin = () => { const ts = S.draft.toss; if (ts.result) return; ts.real = !ts.real; render(); };
  A.landed = (ds) => { const ts = S.draft.toss; if (!ts.call || !ts.caller) return; ts.result = ds.v; ts.winner = ts.call === ds.v ? ts.caller : E.other(ts.caller); S.reveal = true; render(); };
  A.flip = () => {
    const ts = S.draft.toss;
    if (ts.flipping || ts.result || !ts.call || !ts.caller) return;
    let bit = Math.random() < 0.5 ? 0 : 1;
    try { bit = crypto.getRandomValues(new Uint8Array(1))[0] & 1; } catch (e) { /* Math.random fallback */ }
    ts.result = bit ? 'H' : 'T';
    ts.flipping = true;
    render();
    const still = reducedMotion();
    if (!still) setTimeout(() => { if (ts.flipping) haptic(22); }, COIN_LAND_MS);
    setTimeout(() => {
      ts.flipping = false;
      ts.winner = ts.call === ts.result ? ts.caller : E.other(ts.caller);
      S.reveal = true;
      if (still) haptic(25);
      if (S.screen === 'toss' && S.draft && S.draft.toss === ts) render();
    }, still ? 60 : COIN_MS);
  };
  A.choice = (ds) => { S.draft.toss.choice = ds.v; render(); };
  A.resetToss = () => { S.draft.toss = emptyToss(); render(); };
  A.startMatch = () => {
    const d = S.draft, ts = d.toss;
    if (!ts.choice || !ts.winner) return;
    D.counter = Math.max(D.counter || 0, ...D.matches.map((m) => +m.no || 0)) + 1;
    const cfg = E.normalizeConfig(Object.assign({}, d.config, { jokerBowls: d.joker.bowls, wideRebowl: true, nbRebowl: true }));
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
    const lastB = justBall(m), roll = S.prevScore && S.prevScore.id === m.id && S.prevScore.inn === inn.idx && !reducedMotion();
    const runsCls = roll && S.prevScore.runs !== inn.runs ? ' class="roll"' : '', wktCls = roll && S.prevScore.wkts !== inn.wkts ? ' class="roll"' : '', ovCls = roll && S.prevScore.balls !== inn.balls ? ' class="roll"' : '';
    S.prevScore = { id: m.id, inn: inn.idx, runs: inn.runs, wkts: inn.wkts, balls: inn.balls };
    x += '<section class="pane board' + (lastB && lastB.w ? ' hit' : '') + '" data-re="' + (lastB && lastB.w ? 'w' + m.events.length : '') + '" style="--team:' + safeColor(bat.color) + '"><div class="board-top"><span class="team-tag"><i aria-hidden="true"></i><span>' + esc(bat.name) + '</span></span><span>' + esc(label) + '</span></div>' +
      '<div class="board-main"><div class="score" aria-label="' + inn.runs + ' / ' + inn.wkts + '"><b' + runsCls + ' data-re="' + inn.runs + '">' + inn.runs + '</b><span' + wktCls + ' data-re="' + inn.wkts + '">/' + inn.wkts + '</span></div>' +
      '<div class="overs"><b' + ovCls + ' data-re="' + inn.balls + '">' + E.formatOvers(inn.balls, bpo) + '</b><span>/ ' + (inn.maxBalls / bpo) + ' ' + h('ov') + '</span></div></div>' +
      '<div class="board-foot"><span>' + h('crr') + ' <b>' + E.runRate(inn.runs, inn.balls, bpo).toFixed(2) + '</b></span>' +
      (ch ? '<span class="need">' + h('needShort', { r: ch.need, b: ch.left }) + '</span><span>' + h('rrr') + ' <b>' + ch.rrr.toFixed(2) + '</b></span>' : '') +
      (inn.freeHit ? '<span class="badge hot">' + h('freeHitBadge') + '</span>' : '') + (inn.solo && !inn.soloStart ? '<span class="badge">' + h('lastManBadge') + '</span>' : '') + '</div>' +
      '<div class="crease">' + batterRow(m, inn, inn.striker, true) + (inn.solo ? '' : batterRow(m, inn, inn.nonStriker, false)) + '</div>' +
      '<div class="crease-foot">' + bowlerChip(m, st, inn, bw, bpo) +
      (inn.solo ? '' : '<span class="part">' + h('partnership') + ' <span class="fig">' + inn.part.runs + ' (' + inn.part.balls + ')</span></span>') +
      (!inn.solo && inn.striker && inn.nonStriker ? '<button class="icon-btn swap-btn" data-act="swap" aria-label="' + h('swap') + '" title="' + h('swap') + '">' + ICON.swap + '</button>' : '') + '</div></section>';
    x += overTracker(m, inn, bpo);
    x += pad(inn, c);
    return [x, ''];
  }
  /* Before the first ball of an over the bowler can still be swapped: the name becomes a button. */
  const canRepickBowler = (st, inn) => !st.pending && inn.started && !inn.done && !!inn.bowler && inn.overBalls === 0;
  function bowlerChip(m, st, inn, bw, bpo) {
    // A fresh bowler's 0.0-0-0-0 says nothing, so it is left out to give the name room.
    const inner = ICON.ball + '<b>' + esc(playerName(m, inn.bowler)) + '</b>' + (bw && (bw.balls || bw.runs || bw.wkts) ? '<span class="fig">' + figText(bw, bpo) + '</span>' : '');
    if (!canRepickBowler(st, inn)) return '<span class="bowler">' + inner + '</span>';
    return '<button class="bowler tap" data-act="repickOpen" aria-label="' + h('repickAria', { name: playerName(m, inn.bowler) }) + '">' + inner + '<span class="chg">' + ICON.chg + '</span></button>';
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
    // S.fx marks the ball that was just scored, so the 4/6 pop plays once (not on reload, undo or other re-renders).
    const fx = !!justBall(m);
    return '<section class="pane tracker" aria-label="' + h('thisOver') + '"><div class="tracker-top"><p class="tracker-head' + (hint ? ' hint' : '') + '" aria-live="polite">' +
      esc(hint || (done ? t('overN', { n: no }) : t('thisOver')) + ' · ' + t('runsUnit', { n: runs })) + '</p>' +
      undoBtn(m) + '</div><div class="balls' + (fx && !done && cur.length === 1 && no > 1 ? ' fresh' : '') + '" data-re="' + no + '">' + cur.map((b, i) => ballChip(b, fx && i === cur.length - 1)).join('') + empties + '</div></section>';
  }
  /* The ball that was just scored (S.fx is set only for the render that follows a tap), else null. */
  function justBall(m) {
    if (!(S.fx && S.fx.id === m.id && S.fx.len === m.events.length && m.events[m.events.length - 1].t === 'ball')) return null;
    const st = stateOf(m);
    return st ? lastBall(st) : null;
  }
  /* Undo always says what it will take back: a ball, a bowler pick, a new batter, the openers... */
  function lastBall(st) {
    for (let i = st.innings.length - 1; i >= 0; i--) {
      const ov = st.innings[i].overs;
      for (let j = ov.length - 1; j >= 0; j--) if (ov[j].length) return ov[j][ov[j].length - 1];
    }
    return null;
  }
  function undoText(m) {
    const e = m.events[m.events.length - 1];
    if (!e) return t('undo');
    const nm = (id) => { const n = playerName(m, id); return n.length > 12 ? n.slice(0, 11) + '…' : n; };
    let x = '';
    if (e.t === 'ball') { const st = stateOf(m), b = st && lastBall(st); x = b ? E.ballText(b).t : ''; }
    else if (e.t === 'bowler' || e.t === 'changeBowler') x = t('uBowler', { name: nm(e.id) });
    else if (e.t === 'batter') x = t('uBatter', { name: nm(e.id) });
    else if (e.t === 'start') x = t('uStart');
    else if (e.t === 'swap') x = t('uSwap');
    else if (e.t === 'retire') x = t('uRetire');
    else if (e.t === 'end') x = t('uEnd');
    else if (e.t === 'tiebreak') x = t('tb_' + e.mode);
    else if (e.t === 'bowl') x = t(e.hit ? 'hit' : 'miss');
    return x ? t('undoX', { x }) : t('undo');
  }
  const undoBtn = (m) => smallBtn('undo', ICON.undo, undoText(m), (m.events.length ? '' : 'disabled ') + 'title="' + esc(undoText(m)) + '"');
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
    const m = liveMatch();
    S.fx = m && !reducedMotion() ? { id: m.id, len: m.events.length + 1 } : null;
    const ok = dispatch(ev);
    S.fx = null;
    if (ok) haptic(n >= 4 ? 24 : 10);
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
    if (fxDispatch({ t: 'ball', kind: sh.kind, bat: 0, ext: 0, wicket: { how: ds.v, out: 'striker' } })) haptic(40);
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
    if (fxDispatch(ev)) haptic(40);
  };
  function fxDispatch(ev) { const m = liveMatch(); S.fx = m && !reducedMotion() ? { id: m.id, len: m.events.length + 1 } : null; const ok = dispatch(ev); S.fx = null; return ok; }
  function shNextBatter(m, st) {
    const inn = st.innings[st.cur];
    const cands = E.batterCandidates(st, inn);
    const lastBall = (inn.overs[inn.overs.length - 1].length ? inn.overs[inn.overs.length - 1] : (inn.overs[inn.overs.length - 2] || [])).slice(-1)[0];
    let sub = '';
    const f = inn.fow[inn.fow.length - 1];
    if (lastBall && lastBall.w && f) { const b = inn.batters[f.id]; sub = playerName(m, b.id) + ' · ' + howText(m, b) + ' · ' + b.runs + ' (' + b.balls + ')'; }
    return sheetWrap(t('nextBatter'), (sub ? '<p class="sheet-sub">' + esc(sub) + '</p>' : '') +
      '<div class="pick-list">' + cands.map((id) => { const b = inn.batters[id]; return '<button class="pick" data-act="batter" data-id="' + esc(id) + '"><span>' + esc(playerName(m, id)) + '</span>' + (b.status === 'retired' ? '<small>' + h('retiredTag') + ' · ' + b.runs + ' (' + b.balls + ')</small>' : '') + '</button>'; }).join('') + '</div>' +
      '<div class="sheet-actions">' + undoBtn(m) + smallBtn('endInningsAsk', '', t('endInnings')) + '</div>', true);
  }
  function shNextBowler(m, st) {
    const inn = st.innings[st.cur], bpo = st.config.ballsPerOver;
    const opts = E.bowlerOptions(st, inn);
    const prev = inn.overs[inn.overs.length - 2] || [];
    const overRuns = prev.reduce((a, b) => a + b.runs, 0);
    return sheetWrap(t('nextBowler'), (inn.overs.length > 1 ? '<p class="sheet-sub">' + h('overDone', { n: inn.overs.length - 1, r: overRuns }) + '</p>' : '') +
      '<div class="pick-list">' + opts.map((o) => { const b = inn.bowlers[o.id]; return '<button class="pick" data-act="bowler" data-id="' + esc(o.id) + '"' + (o.disabled ? ' disabled' : '') + '><span>' + esc(playerName(m, o.id)) + '</span><small>' + (o.disabled ? h('r_' + o.reason) : (b ? figText(b, bpo) : '0-0-0-0')) + '</small></button>'; }).join('') + '</div>' +
      (opts.some((o) => o.relaxed) ? '<p class="meta">' + h('relaxed') + '</p>' : '') +
      '<div class="sheet-actions">' + undoBtn(m) + (!inn.solo && inn.striker && inn.nonStriker ? smallBtn('swap', ICON.swap, t('swap')) : '') + smallBtn('endInningsAsk', '', t('endInnings')) + '</div>', true);
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
  /* Re-pick the bowler before the over's first ball. The pick (or the openers' bowler) is replaced, so no trace is left. */
  A.repickOpen = () => { S.sheet = { type: 'repick' }; renderSheet(); };
  SHEETS.repick = () => {
    const m = liveMatch(), st = stateOf(m);
    if (!st) return '';
    const inn = st.innings[st.cur], bpo = st.config.ballsPerOver;
    if (!canRepickBowler(st, inn)) return '';
    const opts = E.bowlerOptions(st, inn);
    return sheetWrap(t('repick'), '<p class="sheet-sub">' + h('repickSub') + '</p><div class="pick-list">' + opts.map((o) => {
      const b = inn.bowlers[o.id], cur = o.id === inn.bowler;
      return '<button class="pick' + (cur ? ' current' : '') + '" data-act="repick" data-id="' + esc(o.id) + '"' + (o.disabled && !cur ? ' disabled' : '') + ' aria-pressed="' + cur + '"><span>' + esc(playerName(m, o.id)) + '</span><small>' +
        (cur ? h('bowlingNow') : o.disabled ? h('r_' + o.reason) : (b ? figText(b, bpo) : '0-0-0-0')) + '</small></button>';
    }).join('') + '</div>');
  };
  A.repick = (ds) => {
    const m = liveMatch(), st = stateOf(m);
    if (!st) return;
    const inn = st.innings[st.cur];
    if (!canRepickBowler(st, inn) || ds.id === inn.bowler) { closeSheet(); return; }
    const last = m.events[m.events.length - 1];
    let ev = null;
    if (last && last.t === 'bowler') ev = { t: 'bowler', id: ds.id };
    else if (last && last.t === 'start') ev = Object.assign({}, last, { bowler: ds.id });
    if (!ev) { dispatch({ t: 'changeBowler', id: ds.id }); return; }
    const r = E.tryAppend(Object.assign({}, m, { events: m.events.slice(0, -1) }), ev);
    if (!r.ok) { toast(t('errGeneric', { e: r.error })); return; }
    m.events[m.events.length - 1] = ev;
    S.sheet = null;
    Store.touchMatch(m);
    haptic(10);
    render();
  };
  A.rulesView = () => { S.sheet = { type: 'rules' }; renderSheet(); };
  SHEETS.rules = () => {
    const m = S.screen === 'result' || S.screen === 'poster' ? findMatch(S.viewId) : liveMatch();
    if (!m) return '';
    const c = E.normalizeConfig(m.config);
    const yn = (v) => t(v ? 'on' : 'off');
    // Re-bowl rows only appear for older matches that were played without re-bowling.
    const rows = [[t('overs'), c.overs], [t('bpo'), c.ballsPerOver], [t('wideRun'), yn(c.wideRuns > 0)]].concat(c.wideRebowl ? [] : [[t('wideRebowl'), yn(false)]],
      [[t('nbRun'), yn(c.nbRuns > 0)]], c.nbRebowl ? [] : [[t('nbRebowl'), yn(false)]],
      [[t('freeHit'), yn(c.freeHit)], [t('byes'), yn(c.byes)], [t('sixOut'), c.sixOut ? (c.sixOutRuns ? t('sixOutRuns') : t('on')) : t('off')],
      [t('creaseQ'), t(c.singleBatter ? 'crease1' : 'crease2')], [t('lastMan'), c.singleBatter ? '—' : yn(c.lastManStands)], [t('lbw'), yn(c.lbw)], [t('hitWicket'), yn(c.hitWicket)], [t('retireAt'), c.retireAt ? t('runsUnit', { n: c.retireAt }) : t('off')],
      [t('maxOvers'), c.maxOversPerBowler || t('off')], [t('consecutive'), yn(c.consecutiveOvers)]]);
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
    wipe: () => { Store.wipe(); S.draft = null; toast(t('wiped')); S.regMode = 'welcome'; go('regulars'); }
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
    if (st.innings.length > 1 || m.events.length) x += '<div>' + undoBtn(m) + '</div>';
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
      opt('bowlout', t('tb_bowlout'), t('tb_bowloutSub', { n: st.config.bowloutBalls })) + '</div><div>' + undoBtn(m) + '</div>';
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
      '<div style="margin-top:12px">' + undoBtn(m) + '</div></section>';
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
    const fresh = S.resultFrom === 'live', party = S.celebrate === m.id && !reducedMotion();
    S.celebrate = null;
    let x = topbar(h('result'), 'resultBack', iconBtn('resultMenu', ICON.more, t('menu')));
    x += '<section class="pane result-hero' + (party ? ' party' : '') + '" style="--team:' + winColor + '">' + (party ? confetti() : '') + '<div class="trophy">' + ICON.trophy + '</div><p class="eyebrow">' + h('matchNo', { n: m.no }) + ' · ' + esc(fmtDate(m.createdAt)) + '</p>' +
      '<h2 class="display">' + esc(resultText(m, r)) + '</h2>' + (r.type === 'wickets' && r.ballsLeft > 0 ? '<p class="meta">' + h('ballsLeft', { n: r.ballsLeft }) + '</p>' : '') +
      '<div class="score-lines">' + main.map((i) => '<p><span>' + esc(T[i.bat].name) + '</span><b>' + i.runs + '/' + i.wkts + '</b><span class="vs">(' + E.formatOvers(i.balls, bpo) + ')</span></p>').join('') +
      sup.map((i, k) => (k % 2 === 0 ? '<p class="eyebrow so-label">' + h('superLine', { n: i.superNo }) + '</p>' : '') + '<p><span>' + esc(T[i.bat].name) + '</span><b>' + i.runs + '/' + i.wkts + '</b><span class="vs">(' + E.formatOvers(i.balls, bpo) + ')</span></p>').join('') + '</div></section>';
    if (top) {
      x += '<section class="pane potm" style="--team:' + teamColorOf(m, top.id) + '"><p class="eyebrow">' + h('potm') + '</p><div class="potm-row"><div><p class="potm-name">' + esc(playerName(m, top.id)) + '</p>' +
        '<p class="meta">' + esc(teamNameOf(m, top.id)) + '</p></div><div class="potm-pts"><b>' + Math.round(top.pts) + '</b><small>' + h('ptsLabel') + '</small></div></div><p class="potm-line">' + esc(potmLine(st, top)) + '</p></section>';
    }
    if (fresh) x += '<section class="pane rematch"><h2 class="sec">' + h('continueQ') + '</h2><button class="pill pill-lg primary wide" data-act="rematch" data-v="same">' + ICON.coin + '<span>' + h('yesToss') + '</span></button>' +
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
  A.resultBack = () => go(S.resultFrom && S.resultFrom !== 'live' && VIEWS[S.resultFrom] ? S.resultFrom : 'home');
  /* A short burst of team-coloured paper for a match that just ended (rare moment, so it gets the delight). */
  function confetti() {
    const cols = ['var(--team)', 'var(--ball)', '#FFB13B', '#A193FF', '#FFFFFF'];
    let x = '<div class="confetti" aria-hidden="true">';
    for (let i = 0; i < 26; i++) x += '<i style="--x:' + randInt(100) + '%;--d:' + (randInt(500) + 900) + 'ms;--w:' + (randInt(160) - 80) + 'px;--r:' + (randInt(720) - 360) + 'deg;--c:' + cols[i % cols.length] + ';animation-delay:' + randInt(250) + 'ms"></i>';
    return x + '</div>';
  }
  A.resultMenu = () => { S.sheet = { type: 'resultMenu' }; renderSheet(); };
  SHEETS.resultMenu = () => sheetWrap(t('menu'), '<div class="menu-list">' + (D.live || S.resultFrom !== 'live' ? '' : '<button class="menu-item" data-act="reopen">' + h('reopen') + '</button>') +
    '<button class="menu-item" data-act="rulesView">' + h('viewRules') + '</button><button class="menu-item" data-act="settings">' + h('settings') + '</button><button class="menu-item danger" data-act="deleteAsk">' + h('deleteMatch') + '</button></div>');
  A.reopen = () => {
    const m = findMatch(S.viewId);
    if (!m || D.live || !m.events.length) return;
    m.events.pop(); m.status = 'live'; m.result = null; D.live = m.id;
    Store.touchMatch(m); Store.touchMeta();
    go('match');
  };
  A.deleteAsk = () => confirmAsk(t('deleteQ'), 'deleteMatch');

  /* ---------- LEADERBOARD (today) ---------- */
  /* Players are matched by name across the day's finished matches, so someone who switches teams still adds up. */
  function dayBoard(ts) {
    const key = dayKey(ts);
    const ms = D.matches.filter((m) => m.status === 'done' && m.result && dayKey(m.createdAt) === key);
    const P = new Map();
    let bpo = 6;
    const get = (m, id) => {
      const name = playerName(m, id), k = norm(name);
      let p = P.get(k);
      if (!p) { p = { name, runs: 0, balls: 0, fours: 0, sixes: 0, wkts: 0, bRuns: 0, bBalls: 0, matches: new Set() }; P.set(k, p); }
      p.matches.add(m.id);
      return p;
    };
    ms.forEach((m, i) => {
      const st = stateOf(m);
      if (!st) return;
      if (i === 0) bpo = st.config.ballsPerOver;
      st.innings.filter((inn) => !inn.isSuper && inn.started).forEach((inn) => {
        inn.order.forEach((id) => { const b = inn.batters[id], p = get(m, id); p.runs += b.runs; p.balls += b.balls; p.fours += b.fours; p.sixes += b.sixes; });
        inn.bowlerOrder.forEach((id) => { const w = inn.bowlers[id]; if (!w.balls && !w.runs && !w.wkts) return; const p = get(m, id); p.wkts += w.wkts; p.bRuns += w.runs; p.bBalls += w.balls; });
      });
    });
    const all = Array.from(P.values());
    const bat = all.filter((p) => p.runs > 0).sort((a, b) => b.runs - a.runs || a.balls - b.balls || a.name.localeCompare(b.name)).slice(0, 5);
    const bowl = all.filter((p) => p.wkts > 0).sort((a, b) => b.wkts - a.wkts || a.bRuns - b.bRuns || b.bBalls - a.bBalls || a.name.localeCompare(b.name)).slice(0, 5);
    // Player of the day: most performer-of-the-match awards today; a tie goes to the most performer points.
    const aw = new Map();
    let runs = 0, fours = 0, sixes = 0;
    ms.forEach((m) => {
      const st = stateOf(m);
      if (!st) return;
      st.innings.filter((inn) => !inn.isSuper && inn.started).forEach((inn) => { runs += inn.runs; inn.order.forEach((id) => { fours += inn.batters[id].fours; sixes += inn.batters[id].sixes; }); });
      const perf = E.performers(st);
      perf.forEach((p, i) => {
        const name = playerName(m, p.id), k = norm(name);
        const a = aw.get(k) || { name, k, n: 0, pts: 0 };
        a.pts += p.pts; if (i === 0) a.n += 1;
        aw.set(k, a);
      });
    });
    const potd = Array.from(aw.values()).filter((a) => a.n > 0).sort((a, b) => b.n - a.n || b.pts - a.pts || a.name.localeCompare(b.name))[0] || null;
    if (potd) potd.stats = P.get(potd.k) || null;
    const nos = ms.map((m) => +m.no || 0).sort((a, b) => a - b);
    return { ts, n: ms.length, first: nos[0], last: nos[nos.length - 1], bat, bowl, bpo, potd, runs, fours, sixes, ms };
  }
  const batLine = (p) => t('lbBat', { r: p.runs, b: p.balls });
  const bowlLine = (p) => t(p.wkts === 1 ? 'lbBowl1' : 'lbBowl', { w: p.wkts, r: p.bRuns });
  const dayLine = (B) => t(B.n === 1 ? 'dayMatch1' : 'dayMatches', { n: B.n, a: B.first, b: B.last });
  const potdLine = (p) => t(p.n === 1 ? 'potdAward1' : 'potdAwards', { n: p.n, p: Math.round(p.pts) });
  function potdStats(p, bpo) {
    const s2 = p.stats, parts = [];
    if (s2 && (s2.runs || s2.balls)) parts.push(t('potdBat', { r: s2.runs, b: s2.balls }));
    if (s2 && s2.bBalls) parts.push(t('potdBowl', { w: s2.wkts, r: s2.bRuns, o: E.formatOvers(s2.bBalls, bpo) }));
    return parts.join(' · ');
  }
  /* Home dashboard: today's numbers, the three awards and the last result. */
  function todayCard(done) {
    const B = dayBoard(Date.now());
    if (!B.n) return done.length ? '<section class="pane today"><div class="lb-head"><h2 class="sec">' + h('lastMatch') + '</h2></div><div class="list">' + rowItem(done[0], 0) + '</div><p class="meta">' + h('noMatchesToday') + '</p></section>' : '';
    const stat = (v, k) => '<div class="stat"><b data-count="' + v + '">' + v + '</b><small>' + h(k) + '</small></div>';
    const tile = (cls, cap, label, p, line, empty) => '<button class="cap-tile ' + cls + '" data-act="board"><div class="cap-top">' + capImg(cap) + '<span class="eyebrow">' + label + '</span></div>' +
      (p ? '<b>' + esc(p.name) + '</b><span class="stat-line">' + esc(line) + '</span>' : '<span class="stat-line dim">' + empty + '</span>') + '</button>';
    return '<section class="pane today"><div class="lb-head"><h2 class="sec">' + h('today') + '</h2><span class="meta">' + esc(fmtDate(B.ts)) + '</span></div>' +
      '<div class="stats4">' + stat(B.n, 'stMatches') + stat(B.runs, 'stRuns') + stat(B.fours, 'stFours') + stat(B.sixes, 'stSixes') + '</div>' +
      (B.potd ? '<button class="potd-mini" data-act="board"><span class="potd-badge" aria-hidden="true">' + ICON.trophy + '</span><span class="potd-text"><span class="eyebrow">' + h('potd') + '</span><b>' + esc(B.potd.name) + '</b></span><small>' + esc(potdLine(B.potd)) + '</small></button>' : '') +
      '<div class="caps">' + tile('orange', 'o', h('orangeCap'), B.bat[0], B.bat[0] && batLine(B.bat[0]), h('lbNoRuns')) +
      tile('purple', 'p', h('purpleCap'), B.bowl[0], B.bowl[0] && bowlLine(B.bowl[0]), h('lbNoWkts')) + '</div>' +
      '<p class="label">' + h('lastMatch') + '</p><div class="list">' + rowItem(done[0], 0) + '</div></section>';
  }
  VIEWS.board = () => {
    const B = dayBoard(Date.now());
    let x = topbar(h('lbToday'), null);
    x += '<section class="pane lb-hero"><p class="eyebrow">' + esc(fmtDate(B.ts)) + '</p><p class="big-line">' + (B.n ? esc(dayLine(B)) : h('lbNone')) + '</p></section>';
    if (B.potd) {
      x += '<section class="pane potm lb-potd"><p class="eyebrow"><span class="potd-badge sm" aria-hidden="true">' + ICON.trophy + '</span>' + h('potd') + '</p><div class="potm-row"><div><p class="potm-name">' + esc(B.potd.name) + '</p>' +
        '<p class="meta">' + h('potdSub') + '</p></div><div class="potm-pts"><b>' + B.potd.n + '</b><small>' + h(B.potd.n === 1 ? 'award1' : 'awards') + '</small></div></div><p class="potm-line">' + esc(potdLine(B.potd)) + (potdStats(B.potd, B.bpo) ? ' · ' + esc(potdStats(B.potd, B.bpo)) : '') + '</p></section>';
    }
    const list = (cls, title, sub, rows, line, empty) => '<section class="pane lb-sec ' + cls + '"><div class="lb-title">' + capImg(cls === 'orange' ? 'o' : 'p') + '<div><h2 class="sec">' + title + '</h2><p class="meta">' + sub + '</p></div></div>' +
      (rows.length ? '<ol class="lb-list">' + rows.map((p, i) => '<li style="--k:' + i + '"' + (i === 0 ? ' class="lead"' : '') + '><span class="rk">' + (i + 1) + '</span><span class="nm"><b>' + esc(p.name) + '</b><small>' + h(p.matches.size === 1 ? 'lbPlayed1' : 'lbPlayed', { n: p.matches.size }) + '</small></span><span class="val">' + line(p) + '</span></li>').join('') + '</ol>'
        : '<p class="meta">' + empty + '</p>') + '</section>';
    x += list('orange', h('orangeCap'), h('mostRuns'), B.bat, (p) => '<b>' + p.runs + '</b><small>(' + p.balls + ')</small>', h('lbNoRuns'));
    x += list('purple', h('purpleCap'), h('mostWkts'), B.bowl, (p) => '<b>' + p.wkts + '/' + p.bRuns + '</b><small>(' + E.formatOvers(p.bBalls, B.bpo) + ')</small>', h('lbNoWkts'));
    if (B.bat.length || B.bowl.length) x += '<button class="pill pill-lg primary wide" data-act="dayPoster">' + ICON.trophy + '<span>' + h('makeDayPoster') + '</span></button>';
    if (B.n) x += NATIVE ? '<button class="pill wide" data-act="shareText">' + ICON.share + '<span>' + h('shareDayText') + '</span></button>' : '<button class="pill wide" data-act="copyText">' + ICON.copy + '<span>' + h('copyDayText') + '</span></button>';
    return [x, ''];
  };
  A.board = () => go('board');
  function dayShareText(ts) {
    const B = dayBoard(ts);
    const lines = ['🏏 ' + t('shareDayHead', { date: fmtDate(ts) })];
    if (B.bat[0]) lines.push('🟠 ' + t('shareOrange', { name: B.bat[0].name, line: batLine(B.bat[0]) }));
    if (B.bowl[0]) lines.push('🟣 ' + t('sharePurple', { name: B.bowl[0].name, line: bowlLine(B.bowl[0]) }));
    if (B.potd) lines.push('⭐ ' + t('sharePotd', { name: B.potd.name, line: potdLine(B.potd) }));
    if (B.n) lines.push(dayLine(B));
    return lines.join('\n');
  }

  /* ---------- POSTER (match result or the day's awards) ---------- */
  const isDayPoster = () => !!(S.poster && S.poster.kind === 'day');
  VIEWS.poster = () => {
    const P = S.poster, day = isDayPoster();
    const m = day ? null : findMatch(S.viewId);
    if (!P || (!day && !m)) { S.screen = day ? 'board' : 'result'; return null; }
    const alt = day ? t('dayTitle') : resultText(m);
    let x = topbar(h(day ? 'dayPoster' : 'poster'), 'backToResult');
    x += '<div class="poster-frame">' + (P.url ? '<img class="poster-img' + (P.shown ? '' : ' appear') + '" src="' + P.url + '" alt="' + esc(alt) + '">' : '<p class="poster-loading">' + h('making') + '</p>') + '</div>';
    if (P.url) P.shown = true;
    if (NATIVE) {
      x += '<div class="duo"><button class="pill pill-lg primary" data-act="shareImage"' + (P.url ? '' : ' disabled') + '>' + ICON.share + '<span>' + h('share') + '</span></button>' +
        '<button class="pill pill-lg" data-act="saveImage"' + (P.blob ? '' : ' disabled') + '>' + ICON.download + '<span>' + h('saveImage') + '</span></button></div>' +
        '<button class="pill wide" data-act="shareText">' + ICON.share + '<span>' + h(day ? 'shareDayText' : 'shareTextBtn') + '</span></button>';
      return [x, ''];
    }
    x += '<div class="duo"><button class="pill pill-lg primary" data-act="saveImage"' + (P.blob ? '' : ' disabled') + '>' + ICON.download + '<span>' + h('saveImage') + '</span></button>' +
      '<button class="pill pill-lg" data-act="copyImage"' + (P.blob ? '' : ' disabled') + '>' + ICON.copy + '<span>' + h('copyImage') + '</span></button></div>' +
      '<button class="pill wide" data-act="copyText">' + ICON.copy + '<span>' + h(day ? 'copyDayText' : 'copyText') + '</span></button><p class="meta center">' + h('longPress') + '</p>';
    return [x, ''];
  };
  A.backToResult = () => go(isDayPoster() ? 'board' : 'result');
  function openPoster(P, make) {
    S.poster = P;
    go('poster');
    make().then((cv) => {
      P.url = cv.toDataURL('image/png');
      cv.toBlob((blob) => { P.blob = blob; if (S.poster === P && S.screen === 'poster') render(); }, 'image/png');
      if (S.poster === P && S.screen === 'poster') render();
    }).catch((e) => { console.error(e); toast(t('errGeneric', { e: (e && e.message) || e })); });
  }
  A.poster = () => { const m = findMatch(S.viewId); if (m) openPoster({ kind: 'match', id: m.id, url: null, blob: null }, () => makePoster(m)); };
  A.dayPoster = () => { const ts = Date.now(); openPoster({ kind: 'day', ts, url: null, blob: null }, () => makeDayPoster(dayBoard(ts))); };
  function posterFile() {
    if (isDayPoster()) return 'gully-day-' + dayKey(S.poster.ts) + '.png';
    const m = findMatch(S.viewId);
    return m ? 'gully-match-' + m.no + '.png' : null;
  }
  /* Text that goes with whatever is on screen: the day's awards (leaderboard / day poster) or the match result. */
  function currentText() {
    if (S.screen === 'board') return dayShareText(Date.now());
    if (S.screen === 'poster' && isDayPoster()) return dayShareText(S.poster.ts);
    const m = findMatch(S.viewId);
    return m ? shareText(m) : '';
  }
  A.saveImage = () => { const f = posterFile(); if (S.poster && S.poster.blob && f) saveFile(f, S.poster.blob, 'image/png'); };
  A.copyImage = () => {
    const P = S.poster;
    if (!P || !P.blob) return;
    try {
      navigator.clipboard.write([new ClipboardItem({ 'image/png': P.blob })]).then(() => toast(t('copied'))).catch(() => toast(t('copyFailed')));
    } catch (e) { toast(t('copyFailed')); }
  };
  A.copyText = () => { const s = currentText(); if (s) copyString(s); };
  A.shareImage = () => {
    const P = S.poster, f = posterFile();
    if (!NATIVE || !P || !P.url || !f) return;
    let r = 'error';
    try { r = NATIVE.shareFile(P.url.split(',')[1], f, 'image/png', currentText()); } catch (e) { r = 'error'; }
    if (r !== 'ok') toast(t('saveUnavailable'));
  };
  A.shareText = () => { const s = currentText(); if (!s) return; if (NATIVE) { try { NATIVE.shareText(s); } catch (e) { copyString(s); } } else copyString(s); };
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

  /* Day awards poster: orange cap (most runs) and purple cap (most wickets), each with a drawn cap and a medal. */
  const imgCache = {};
  function loadImg(src) {
    if (!src) return Promise.resolve(null);
    if (!imgCache[src]) imgCache[src] = new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
    return imgCache[src];
  }
  /* The cap photo, fitted to width w with its base at y, on a soft floor shadow. */
  function drawCapImg(g, im, cx, y, w) {
    if (!im) return;
    const hgt = w * im.height / im.width;
    const gr = g.createRadialGradient(cx, y - 6, 0, cx, y - 6, w * 0.55);
    gr.addColorStop(0, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.fillStyle = gr; g.translate(cx, y - 6); g.scale(1, 0.16); g.beginPath(); g.arc(0, 0, w * 0.55, 0, Math.PI * 2); g.fill(); g.restore();
    g.drawImage(im, cx - w / 2, y - hgt, w, hgt);
  }
  function drawMedal(g, cx, cy, r, ribbon, ribbonDark) {
    g.save();
    const tail = (dir) => {
      g.fillStyle = dir < 0 ? ribbon : ribbonDark;
      g.beginPath();
      g.moveTo(cx + dir * r * 0.15, cy); g.lineTo(cx + dir * r * 0.75, cy);
      g.lineTo(cx + dir * r * 0.95, cy + r * 1.9); g.lineTo(cx + dir * r * 0.6, cy + r * 1.62); g.lineTo(cx + dir * r * 0.32, cy + r * 1.95);
      g.closePath(); g.fill();
    };
    tail(-1); tail(1);
    let gr = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    gr.addColorStop(0, '#FFF6CC'); gr.addColorStop(0.35, '#F7D46A'); gr.addColorStop(0.75, '#D49A2A'); gr.addColorStop(1, '#9C6812');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(120,75,5,.55)'; g.lineWidth = r * 0.08; g.beginPath(); g.arc(cx, cy, r * 0.78, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#B07A16';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.25 : r * 0.55;
      g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath(); g.fill();
    gr = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(0.45, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  async function makeDayPoster(B) {
    await fontsReady();
    const W = 1080, H = 1350;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const FP = '"Anton", "Noto Sans Kannada", Impact, "Arial Black", sans-serif';
    const FC = '"Barlow Condensed", "Noto Sans Kannada", "Arial Narrow", sans-serif';
    const up = (s) => (prefs.lang === 'kn' ? String(s) : String(s).toUpperCase());
    const ink = '#F3F6FB', ink2 = 'rgba(243,246,251,.74)';
    const OR = { base: '#FF8A1F', dark: '#C2530A', light: '#FFC27A', text: '#FFAE5C', rib: '#FF8A1F', ribD: '#C2530A' };
    const PU = { base: '#8B5CF6', dark: '#5B2FC4', light: '#C4ABFF', text: '#B9A2FF', rib: '#8B5CF6', ribD: '#5B2FC4' };
    g.fillStyle = '#0A0D13'; g.fillRect(0, 0, W, H);
    glow(g, 150, 420, 760, OR.base, 0.48);
    glow(g, 960, 960, 760, PU.base, 0.5);
    glow(g, 540, 1460, 700, '#D4F03C', 0.14);
    g.save(); g.globalAlpha = 0.05; g.strokeStyle = '#FFFFFF'; g.lineWidth = 2;
    for (let x = -H; x < W; x += 26) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + H, H); g.stroke(); }
    g.restore();
    g.textBaseline = 'alphabetic';
    drawBall(g, 100, 104, 30);
    g.textAlign = 'left'; g.fillStyle = ink; g.font = '700 40px ' + FC; spacing(g, 4);
    g.fillText(up(t('app')), 146, 118);
    g.textAlign = 'right'; g.fillStyle = ink2; spacing(g, 2);
    fitFont(g, up(fmtDate(B.ts)), 420, 30, '600 {s}px ' + FC); g.fillText(up(fmtDate(B.ts)), W - 70, 116);
    spacing(g, 0);
    g.textAlign = 'center'; g.fillStyle = ink;
    fitFont(g, up(t('dayTitle')), 940, 112, '{s}px ' + FP); g.fillText(up(t('dayTitle')), W / 2, 236);
    g.fillStyle = ink2; spacing(g, 3); fitFont(g, up(dayLine(B)), 900, 32, '600 {s}px ' + FC); g.fillText(up(dayLine(B)), W / 2, 284); spacing(g, 0);
    const [capO, capP] = await Promise.all([loadImg(AS.capO), loadImg(AS.capP)]);
    const box = (y0, hgt, C) => {
      g.save(); g.fillStyle = hexA(C.base, 0.11); g.strokeStyle = hexA(C.base, 0.5); g.lineWidth = 3;
      g.beginPath(); if (g.roundRect) g.roundRect(60, y0, 960, hgt, 40); else g.rect(60, y0, 960, hgt); g.fill(); g.stroke(); g.restore();
    };
    const GD = { base: '#F5B70A', text: '#FFD45C', rib: '#F5B70A', ribD: '#B07A06' };
    // Player of the day
    const pd = B.potd, y1 = 318;
    box(y1, 236, GD);
    drawMedal(g, 200, y1 + 104, 64, GD.rib, GD.ribD);
    g.textAlign = 'left'; g.fillStyle = GD.text; spacing(g, 5);
    fitFont(g, up(t('potd')), 640, 32, '700 {s}px ' + FC); g.fillText(up(t('potd')), 330, y1 + 70); spacing(g, 0);
    g.fillStyle = ink; const pn = up(pd ? pd.name : '—'); fitFont(g, pn, 640, 84, '{s}px ' + FP); g.fillText(pn, 330, y1 + 152);
    g.fillStyle = ink2; const pl = pd ? potdLine(pd) : ''; fitFont(g, pl, 640, 32, '600 {s}px ' + FC); g.fillText(pl, 330, y1 + 190);
    const ps = pd ? potdStats(pd, B.bpo) : ''; if (ps) { g.fillStyle = 'rgba(243,246,251,.6)'; fitFont(g, ps, 640, 26, '600 {s}px ' + FC); g.fillText(ps, 330, y1 + 222); }
    const panel = (y0, C, im, label, p, main, detail, rest) => {
      const hgt = 332;
      box(y0, hgt, C);
      drawCapImg(g, im, 222, y0 + 252, 290);
      drawMedal(g, 352, y0 + 70, 34, C.rib, C.ribD);
      const tx = 440, tw = 540;
      g.textAlign = 'left'; g.fillStyle = C.text; spacing(g, 5);
      fitFont(g, up(label), tw, 30, '700 {s}px ' + FC); g.fillText(up(label), tx, y0 + 74); spacing(g, 0);
      g.fillStyle = ink; const nm = up(p ? p.name : '—');
      fitFont(g, nm, tw, 80, '{s}px ' + FP); g.fillText(nm, tx, y0 + 152);
      g.fillStyle = C.text; fitFont(g, up(main), tw, 64, '{s}px ' + FP); g.fillText(up(main), tx, y0 + 222);
      g.fillStyle = ink2; fitFont(g, detail, tw, 30, '600 {s}px ' + FC); g.fillText(detail, tx, y0 + 262);
      if (rest) {
        g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(100, y0 + 280, 880, 2);
        g.fillStyle = 'rgba(243,246,251,.82)'; fitFont(g, rest, 880, 28, '600 {s}px ' + FC); g.fillText(rest, 100, y0 + 316);
      }
    };
    const runnersUp = (rows, line) => rows.slice(1, 4).map((p, i) => (i + 2) + '. ' + p.name + ' ' + line(p)).join('    ');
    const b0 = B.bat[0], w0 = B.bowl[0];
    panel(574, OR, capO, t('orangeCap') + ' · ' + t('mostRuns'), b0, b0 ? t('runsUnit', { n: b0.runs }) : '—',
      b0 ? t('lbDetailBat', { b: b0.balls, f: b0.fours, s: b0.sixes }) : t('lbNoRuns'), runnersUp(B.bat, (p) => String(p.runs)));
    panel(926, PU, capP, t('purpleCap') + ' · ' + t('mostWkts'), w0, w0 ? t(w0.wkts === 1 ? 'lbWkt1' : 'lbWkts', { n: w0.wkts }) : '—',
      w0 ? t('lbDetailBowl', { r: w0.bRuns, o: E.formatOvers(w0.bBalls, B.bpo) }) : t('lbNoWkts'), runnersUp(B.bowl, (p) => p.wkts + '/' + p.bRuns));
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
      (S.screen === 'regulars' ? '' : '<p class="label">' + h('regulars') + '</p><button class="pill wide" data-act="regEdit">' + ICON.list + '<span>' + h('regEditBtn', { n: D.regulars.length }) + '</span></button>') +
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
  function exportText() { return JSON.stringify({ app: 'gully-cricket', v: 1, exportedAt: new Date().toISOString(), data: { teams: D.teams, regulars: D.regulars, matches: D.matches, counter: D.counter, last: D.last, pairCfg: D.pairCfg } }); }
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
    D.regulars = unionRegulars(D.regulars, Array.isArray(data.regulars) ? data.regulars : regularsFromTeams(data.teams));
    D.onboarded = true;
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
    S.viewId = m.id; S.cardTab = 0; S.resultFrom = TABS.indexOf(S.screen) >= 0 ? S.screen : 'history'; go('result');
  };

  /* ---------- events ---------- */
  /* Drag the tab pill sideways like a glass lens, or swipe the page left/right, to change tabs. */
  let swallow = false;
  document.addEventListener('click', (e) => { if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); } }, true);
  const swallowNext = () => { swallow = true; setTimeout(() => { swallow = false; }, 60); };
  function activate(el) {
    const fn = A[el.dataset.act];
    if (!fn || el.disabled) return;
    const seg = el.closest('.seg'), segFrom = seg ? +getComputedStyle(seg).getPropertyValue('--i') : NaN;
    try { fn(el.dataset, el); } catch (err) { console.error(err); toast(t('errGeneric', { e: (err && err.message) || err })); }
    if (el.isConnected && el.getAttribute('role') === 'switch') liquidSwitch(el);
    if (seg && seg.isConnected) liquidSeg(seg, segFrom);
  }
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled || !A[el.dataset.act]) return;
    e.preventDefault();
    activate(el);
  });
  /* Scrub: press any choice row (segments, chips, Heads/Tails, team pills, colours…) and slide.
     A glass lens follows the finger over the options and the one under it is chosen on release.
     Switches can be dragged the same way. A plain tap still works as before. */
  const isOpt = (b) => b && b.tagName === 'BUTTON' && !b.disabled && (b.hasAttribute('aria-pressed') || b.getAttribute('role') === 'radio');
  let sc = null, lens = null;
  function lensEl() {
    if (!lens) { lens = document.createElement('div'); lens.id = 'lens'; lens.setAttribute('aria-hidden', 'true'); document.body.appendChild(lens); }
    return lens;
  }
  function optionAt(x, y) {
    let best = null, bd = Infinity;
    sc.opts.forEach((o) => {
      const r = o.getBoundingClientRect(), dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0, dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0, d = dx * dx + dy * dy * 2;
      if (d < bd) { bd = d; best = o; }
    });
    return best;
  }
  function lensFrame() {
    if (!sc || !sc.moved) return;
    const L = sc.lens, r = sc.hover.getBoundingClientRect(), k = 0.32;
    const tx = r.left + (sc.x - (r.left + r.width / 2)) * 0.12, ty = r.top;
    sc.cx += (tx - sc.cx) * k; sc.cy += (ty - sc.cy) * k; sc.cw += (r.width - sc.cw) * k; sc.ch += (r.height - sc.ch) * k;
    const st = 1 + Math.min(0.25, Math.abs(sc.v) * 0.15);
    L.style.width = sc.cw.toFixed(1) + 'px'; L.style.height = sc.ch.toFixed(1) + 'px';
    L.style.transform = 'translate(' + sc.cx.toFixed(1) + 'px,' + sc.cy.toFixed(1) + 'px) scale(' + st.toFixed(3) + ',' + (1 / Math.sqrt(st)).toFixed(3) + ')';
    sc.v *= 0.85;
    sc.raf = requestAnimationFrame(lensFrame);
  }
  document.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || reducedMotion()) return;
    const sw = e.target.closest && e.target.closest('.row-switch');
    if (sw && !sw.disabled) { sc = { sw, knob: sw.querySelector('.switch i'), x0: e.clientX, y0: e.clientY, id: e.pointerId, moved: false, on: sw.getAttribute('aria-checked') === 'true', pos: 0 }; return; }
    const b = e.target.closest && e.target.closest('button');
    if (!isOpt(b) || !b.parentElement) return;
    const opts = Array.from(b.parentElement.children).filter(isOpt);
    if (opts.length < 2) return;
    sc = { start: b, hover: b, opts, x0: e.clientX, y0: e.clientY, x: e.clientX, lx: e.clientX, lt: e.timeStamp, v: 0, id: e.pointerId, moved: false };
  });
  document.addEventListener('pointermove', (e) => {
    if (!sc || e.pointerId !== sc.id) return;
    const dx = e.clientX - sc.x0, dy = e.clientY - sc.y0;
    if (!sc.moved) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy)) { if (Math.abs(dy) > 12) sc = null; return; }
      sc.moved = true;
      if (sc.sw) { sc.sw.classList.add('dragging'); sc.knob.getAnimations().forEach((an) => an.cancel()); }
      else {
        const r = sc.start.getBoundingClientRect();
        sc.lens = lensEl(); Object.assign(sc, { cx: r.left, cy: r.top, cw: r.width, ch: r.height });
        sc.lens.classList.add('on');
        sc.raf = requestAnimationFrame(lensFrame);
      }
    }
    if (sc.sw) {
      sc.pos = Math.max(0, Math.min(20, (sc.on ? 20 : 0) + dx));
      sc.knob.style.transform = 'translateX(' + sc.pos + 'px)';
      return;
    }
    const dt = Math.max(1, e.timeStamp - sc.lt);
    sc.v = (e.clientX - sc.lx) / dt; sc.lx = e.clientX; sc.lt = e.timeStamp; sc.x = e.clientX;
    const o = optionAt(e.clientX, e.clientY);
    if (o && o !== sc.hover) { sc.hover = o; haptic(4); }
  });
  const endScrub = (e) => {
    if (!sc || e.pointerId !== sc.id) return;
    const d = sc;
    sc = null;
    if (!d.moved) return;
    swallowNext();
    if (d.sw) {
      d.sw.classList.remove('dragging');
      d.knob.style.transform = '';
      if ((d.pos > 10) !== d.on && e.type === 'pointerup') activate(d.sw);
      return;
    }
    cancelAnimationFrame(d.raf);
    const L = d.lens;
    if (L.animate) {
      const r = d.hover.getBoundingClientRect();
      L.animate([{ transform: L.style.transform, width: L.style.width, height: L.style.height, opacity: 1 }, { transform: 'translate(' + r.left + 'px,' + r.top + 'px)', width: r.width + 'px', height: r.height + 'px', opacity: 0 }], { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    }
    L.classList.remove('on');
    if (e.type === 'pointerup' && d.hover.getAttribute('aria-pressed') !== 'true' && d.hover.getAttribute('aria-checked') !== 'true' && d.hover.isConnected) activate(d.hover);
  };
  document.addEventListener('pointerup', endScrub);
  document.addEventListener('pointercancel', endScrub);
  /* Glass glint: a soft light blooms where a finger presses a glass control (Glass look only). */
  document.addEventListener('pointerdown', (e) => {
    if (prefs.glass === 'off' || reducedMotion()) return;
    const b = e.target.closest && e.target.closest('.pill, .key, .mod, .chip, .pick, .menu-item, .row-item, .tab, .cap-tile, .potd-mini, .icon-btn, .seg button');
    if (!b) return;
    const r = b.getBoundingClientRect();
    b.style.setProperty('--gx', (e.clientX - r.left).toFixed(0) + 'px');
    b.style.setProperty('--gy', (e.clientY - r.top).toFixed(0) + 'px');
    b.classList.add('glint');
    const off = () => { b.classList.remove('glint'); window.removeEventListener('pointerup', off); window.removeEventListener('pointercancel', off); };
    window.addEventListener('pointerup', off);
    window.addEventListener('pointercancel', off);
  }, true);
  /* Glare that slides across glass panes as the page scrolls, like light on moving glass. */
  let glareRaf = 0;
  const glare = () => {
    glareRaf = 0;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    document.documentElement.style.setProperty('--sp', (window.scrollY / max).toFixed(3));
  };
  window.addEventListener('scroll', () => { if (!glareRaf && prefs.glass !== 'off') glareRaf = requestAnimationFrame(glare); }, { passive: true });
  let td = null, ps = null;
  document.addEventListener('pointerdown', (e) => {
    const bar = e.target.closest && e.target.closest('#tabs .tabbar');
    if (bar && e.button === 0) {
      const r = bar.getBoundingClientRect();
      td = { bar, th: bar.querySelector('.tab-thumb'), w: (r.width - 12) / 3, x0: e.clientX, id: e.pointerId, moved: false, start: TABS.indexOf(S.screen), lx: e.clientX, lt: e.timeStamp, v: 0, pos: 0 };
      return;
    }
    if (TABS.indexOf(S.screen) >= 0 && !S.sheet && e.pointerType !== 'mouse' && e.target.closest && e.target.closest('#app')) ps = { x0: e.clientX, y0: e.clientY, t0: e.timeStamp, id: e.pointerId };
  });
  document.addEventListener('pointermove', (e) => {
    if (!td || e.pointerId !== td.id || td.start < 0) return;
    const dx = e.clientX - td.x0;
    if (!td.moved) {
      if (Math.abs(dx) < 8) return;
      td.moved = true;
      td.bar.classList.add('dragging');
      try { td.bar.setPointerCapture(td.id); } catch (er) { /* old WebView */ }
      td.th.getAnimations().forEach((an) => an.cancel());
    }
    const dt = Math.max(1, e.timeStamp - td.lt);
    td.v = (e.clientX - td.lx) / dt; td.lx = e.clientX; td.lt = e.timeStamp;
    td.pos = Math.max(0, Math.min(2 * td.w, td.start * td.w + dx));
    const st = reducedMotion() ? 1 : 1 + Math.min(0.3, Math.abs(td.v) * 0.18);
    td.th.style.transform = 'translateX(' + td.pos + 'px) scaleX(' + st.toFixed(3) + ') scaleY(' + (1 / Math.sqrt(st)).toFixed(3) + ')';
  });
  const endTab = (e) => {
    if (!td || e.pointerId !== td.id) return;
    const d = td;
    td = null;
    if (!d.moved) return;
    swallowNext();
    d.bar.classList.remove('dragging');
    const idx = Math.max(0, Math.min(2, Math.round((d.pos + d.v * 90) / d.w)));
    const cur = d.th.style.transform, toT = 'translateX(' + (idx * 100) + '%)';
    d.th.style.transform = toT;
    if (d.th.animate && !reducedMotion()) d.th.animate([{ transform: cur }, { transform: toT + ' scaleX(1.05) scaleY(.97)', offset: 0.7 }, { transform: toT }], { duration: 300, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    d.bar.dataset.i = idx;
    if (TABS[idx] !== S.screen) { haptic(8); go(TABS[idx]); }
  };
  document.addEventListener('pointerup', endTab);
  document.addEventListener('pointercancel', endTab);
  document.addEventListener('pointerup', (e) => {
    if (!ps || e.pointerId !== ps.id) return;
    const dx = e.clientX - ps.x0, dy = e.clientY - ps.y0, dt = e.timeStamp - ps.t0;
    ps = null;
    if (Math.abs(dx) < 70 || Math.abs(dx) < 1.8 * Math.abs(dy) || dt > 700 || S.sheet) return;
    const idx = TABS.indexOf(S.screen) + (dx < 0 ? 1 : -1);
    if (idx < 0 || idx >= TABS.length) return;
    swallowNext();
    haptic(8);
    go(TABS[idx]);
  });
  document.addEventListener('pointercancel', () => { ps = null; });
  document.addEventListener('input', (e) => { const el = e.target, k = el && el.dataset && el.dataset.in; if (k && INPUT[k]) INPUT[k](el); });
  document.addEventListener('change', (e) => { const el = e.target, k = el && el.dataset && el.dataset.change; if (k && A[k]) A[k](el.dataset, el); });
  document.addEventListener('keydown', (e) => {
    const el = e.target;
    if (e.key === 'Enter' && el && el.dataset && el.dataset.enter && A[el.dataset.enter]) { e.preventDefault(); A[el.dataset.enter](el.dataset, el); }
    else if (e.key === 'Escape' && S.sheet) closeSheet();
  });
  let drag = null;
  document.addEventListener('pointerdown', (e) => {
    const sh = e.target.closest && e.target.closest('#sheet .sheet');
    if (!sh || e.button > 0 || !e.target.closest('.grip, .sheet-head') || e.target.closest('button')) return;
    if (!document.querySelector('#sheet button.scrim')) return; // next batter / bowler can't be swiped away
    drag = { sh, y0: e.clientY, t0: e.timeStamp, dy: 0, id: e.pointerId };
    sh.style.transition = 'none';
    try { sh.setPointerCapture(e.pointerId); } catch (er) { /* old WebView */ }
  });
  document.addEventListener('pointermove', (e) => { if (!drag || e.pointerId !== drag.id) return; drag.dy = Math.max(0, e.clientY - drag.y0); drag.sh.style.transform = drag.dy ? 'translateY(' + drag.dy + 'px)' : ''; });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    const v = d.dy / Math.max(1, e.timeStamp - d.t0);
    if (d.dy > 90 || (v > 0.5 && d.dy > 24)) { closeSheet(); return; }
    d.sh.style.transition = 'transform .3s cubic-bezier(0.32, 0.72, 0, 1)';
    d.sh.style.transform = '';
  };
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);
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
    else if (needsWelcome()) { S.screen = 'regulars'; S.regMode = 'welcome'; }
    render({ top: true });
    setTimeout(() => { Store.connect(); capDownloads(); }, 0);
  }
  /* Hardware back button (Android shell): close a sheet, else step back a screen. false = let the app close. */
  const BACK = { teams: 'home', rules: 'toTeams', toss: 'toRulesBack', match: 'home', result: 'resultBack', poster: 'backToResult', history: 'home', board: 'home', regulars: 'regBack' };
  function goBack() {
    if (S.sheet) { closeSheet(); return true; }
    if (S.screen === 'regulars' && S.regMode === 'welcome') return false;
    const a = BACK[S.screen];
    if (!a || !A[a]) return false;
    A[a]();
    return true;
  }
  window.GullyApp = { state: () => S, data: () => D, store: Store, back: goBack, native: !!NATIVE };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
