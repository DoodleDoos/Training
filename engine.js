/* Planlogica voor de trainingsapp. Regelgebaseerd (geen AI).
   Wordt in tests vergeleken met de Python-referentie (tests/ref.py): zelfde uitkomst, stap voor stap.
   Datums zijn ISO-strings 'JJJJ-MM-DD'. Weekdag: ma=0 ... zo=6. */
(function (root) {
  'use strict';

  const T = {
    MMA:        { main: true,  hard: true,  lift: false, muscle: null,    prio: 100, fixed: true },
    VOETBAL:    { main: true,  hard: true,  lift: false, muscle: 'lower', prio: 95 },
    LOWER:      { main: true,  hard: true,  lift: true,  muscle: 'lower', prio: 90 },
    UPPER:      { main: true,  hard: true,  lift: true,  muscle: 'upper', prio: 70 },
    EXTRAHARD:  { main: true,  hard: true,  lift: false, muscle: null,    prio: 65 },
    TYSON:      { main: true,  hard: false, lift: false, muscle: null,    prio: 60 },
    EXTRALEGS:  { main: true,  hard: false, lift: false, muscle: 'lower', prio: 50 },
    EXTRAMED:   { main: true,  hard: false, lift: false, muscle: null,    prio: 45 },
    ARMS:       { main: true,  hard: false, lift: true,  muscle: 'arms',  prio: 40 },
    BAG:        { main: false, hard: false, lift: false, muscle: null,    prio: 30 },
    EXTRALIGHT: { main: false, hard: false, lift: false, muscle: null,    prio: 25 },
    STRETCH:    { main: false, hard: false, lift: false, muscle: null,    prio: 20, addon: true },
    SWIM:       { main: false, hard: false, lift: false, muscle: null,    prio: 15 },
  };
  const TEMPLATE = [[0, 'UPPER'], [0, 'STRETCH'], [1, 'MMA'], [2, 'BAG'], [2, 'STRETCH'], [3, 'MMA'],
                    [4, 'ARMS'], [4, 'SWIM'], [5, 'LOWER'], [6, 'TYSON'], [6, 'STRETCH']];
  const WEEK_TEMPLATE = [];           // [[type, aantal]] in volgorde van eerste voorkomen
  (function () {
    const idx = {};
    TEMPLATE.forEach(([, t]) => {
      if (idx[t] === undefined) { idx[t] = WEEK_TEMPLATE.length; WEEK_TEMPLATE.push([t, 0]); }
      WEEK_TEMPLATE[idx[t]][1] += 1;
    });
  })();

  // ---------- datums ----------
  const dnum = (s) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5);
  const fromNum = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
  const add = (s, k) => fromNum(dnum(s) + k);
  const diff = (a, b) => dnum(a) - dnum(b);
  const weekday = (s) => (((dnum(s) + 3) % 7) + 7) % 7;
  const mondayOf = (s) => add(s, -weekday(s));
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  function build(monday, weeks, first) {
    const out = [];
    for (let w = 0; w < weeks; w++) {
      for (const [off, t] of TEMPLATE) {
        const d = add(monday, 7 * w + off);
        if (first && d < first) continue;
        out.push({ id: t + '-' + d, type: t, date: d, orig: d, status: 'planned', light: false, moves: 0 });
      }
    }
    return out;
  }
  const get = (sched, id) => sched.find((s) => s.id === id);

  // ---------- sleutels voor schendingen ----------
  const kd = (code, d) => code + '|d|' + d;
  const ki = (code, i) => code + '|i|' + i;
  const kp = (code, a, b) => code + '|p|' + [a, b].sort().join(',');
  const keyCode = (k) => k.split('|')[0];

  function involved(sched, key) {
    const parts = key.split('|'); const code = parts[0], kind = parts[1], ref = parts[2];
    const act = sched.filter((s) => s.status === 'planned' || s.status === 'done');
    if (code === '3 krachtdagen op rij') {
      const ds = [ref, add(ref, 1), add(ref, 2)];
      return act.filter((s) => ds.includes(s.date) && T[s.type].lift);
    }
    if (kind === 'd') return act.filter((s) => s.date === ref);
    if (kind === 'p') { const ids = ref.split(','); return act.filter((s) => ids.includes(s.id)); }
    return act.filter((s) => s.id === ref);
  }

  // ---------- regels ----------
  function viol(sched) {
    const act = sched.filter((s) => s.status === 'planned' || s.status === 'done');
    const by = new Map();
    for (const s of act) { if (!by.has(s.date)) by.set(s.date, []); by.get(s.date).push(s); }
    const mma = act.filter((s) => s.type === 'MMA').map((s) => s.date);
    const H = new Set(); const S = new Map();
    for (const [d, ss] of by) {
      const mains = ss.filter((s) => T[s.type].main);
      const lights = ss.filter((s) => !T[s.type].main && !T[s.type].addon);
      if (mains.length > 1) H.add(kd('twee hoofdsessies op een dag', d));
      if (new Set(ss.map((x) => x.type)).size < ss.length) H.add(kd('dezelfde sessie 2x op een dag', d));
      if (ss.some((s) => s.type === 'MMA') && ss.length > 1) H.add(kd('extra sessie op MMA-dag', d));
      if (mains.length && lights.length > 1) H.add(kd('hoofdsessie + 2 lichte sessies', d));
      if (lights.length > 2) H.add(kd('te veel lichte sessies', d));
      if (ss.some((s) => s.type === 'LOWER') && ss.length > 1) H.add(kd('extra sessie op beendag', d));
      if (ss.some((s) => s.type === 'UPPER' || s.type === 'TYSON') && lights.length) H.add(kd('zware sessie + extra losse sessie', d));
      if (ss.filter((s) => s.type === 'STRETCH' && !s.light).length > 1) H.add(kd('2x stretch op een dag', d));
    }
    for (const s of act) {
      const t = s.type;
      if (t === 'LOWER' && mma.some((m) => Math.abs(diff(s.date, m)) <= 1)) H.add(ki('lower naast MMA', s.id));
      if (t === 'TYSON' && mma.some((m) => s.date === m)) H.add(ki('Tyson op MMA-dag', s.id));
      if (t === 'TYSON' && !s.light && mma.some((m) => Math.abs(diff(s.date, m)) === 1)) S.set(ki('Tyson naast MMA', s.id), 2);
      if (t === 'VOETBAL' && mma.some((m) => Math.abs(diff(s.date, m)) <= 1)) S.set(ki('voetbal naast MMA', s.id), 4);
      if (t === 'ARMS' && ![4, 5, 6].includes(weekday(s.date))) H.add(ki('armen alleen vr/za/zo', s.id));
      if (t === 'LOWER' && mma.some((m) => diff(m, s.date) === 2)) S.set(ki('lower 2 dagen voor MMA', s.id), 4);
    }
    for (let i = 0; i < act.length; i++) {
      for (let j = i + 1; j < act.length; j++) {
        const a = act[i], b = act[j];
        const ma = T[a.type].muscle, mb = T[b.type].muscle;
        if (ma && ma === mb) {
          const dd = Math.abs(diff(a.date, b.date));
          if (dd < 2) H.add(kp('zelfde spier binnen 48u', a.id, b.id));
          else if (dd === 2) S.set(kp('zelfde spier maar 2 dagen rust', a.id, b.id), 2);
        }
      }
    }
    const lift = new Set(act.filter((s) => T[s.type].lift).map((s) => s.date));
    for (const d of lift) if (lift.has(add(d, 1)) && lift.has(add(d, 2))) H.add(kd('3 krachtdagen op rij', d));
    const hard = new Set(act.filter((s) => T[s.type].hard && !s.light).map((s) => s.date));
    for (const d of hard) if (hard.has(add(d, 1))) S.set(kd('2 zware dagen op rij', d), 3);
    for (const a of act) {
      if (a.type === 'UPPER') {
        for (const b of act) if (b.type === 'ARMS' && Math.abs(diff(a.date, b.date)) === 1) S.set(ki('upper en armen naast elkaar', a.id), 2);
      }
    }
    return { H, S };
  }
  const softsum = (sched) => { let n = 0; for (const v of viol(sched).S.values()) n += v; return n; };
  const setMinus = (a, b) => { const r = new Set(); for (const x of a) if (!b.has(x)) r.add(x); return r; };

  // ---------- verschuiven ----------
  function rehome(base, xid, fromDate, window, horizon) {
    const vb = viol(base).H;
    for (let off = 1; off <= window; off++) {
      const c = add(fromDate, off);
      if (c > horizon) break;
      const n = clone(base); const x = get(n, xid); x.status = 'planned'; x.date = c; x.moves += 1;
      if (setMinus(viol(n).H, vb).size === 0) return { date: c, sched: n };
    }
    return { date: null, sched: base };
  }

  function combos2(arr) { const r = []; for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) r.push([arr[i], arr[j]]); return r; }

  function shiftOption(sched, sid, today, horizon, window) {
    window = window || 4;
    const s = get(sched, sid);
    if (s.moves >= 1 || T[s.type].fixed) return null;
    const prio = T[s.type].prio;
    const start = today > s.date ? today : s.date;
    const wend = add(s.date, 6 - weekday(s.date));
    const lim = horizon < wend ? horizon : wend;
    const skipn = clone(sched); get(skipn, sid).status = 'skipped';
    const baseSoft = softsum(skipn);
    const H0 = viol(sched).H;
    const hBefore = new Set();
    for (const k of H0) if (!involved(sched, k).some((x) => x.id === sid)) hBefore.add(k);
    let best = null;
    for (let off = 1; off <= window; off++) {
      const c = add(start, off);
      if (c > lim) break;
      const occ = sched.filter((x) => x.status === 'planned' && x.date === c && x.id !== sid
        && !T[x.type].fixed && T[x.type].prio < prio);
      const subsets = [[]].concat(occ.map((o) => [o]), combos2(occ));
      for (const sub of subsets) {
        let n = clone(sched);
        for (const o of sub) get(n, o.id).status = 'removed';
        const t = get(n, sid); t.date = c; t.moves += 1;
        if (setMinus(viol(n).H, hBefore).size) continue;
        const dropped = [], rehomed = [];
        for (const o of sub) {
          const r = rehome(n, o.id, c, window, lim);
          if (r.date) { n = r.sched; rehomed.push([o.type, r.date]); }
          else { get(n, o.id).status = 'dropped'; dropped.push(o.type); }
        }
        if (setMinus(viol(n).H, hBefore).size) continue;
        const soft = softsum(n) - baseSoft;
        const cost = soft * 2 + dropped.length * 3 + rehomed.length + off;
        const cand = { date: c, offset: off, sched: n, dropped, rehomed, soft, cost };
        if (best === null || cost < best.cost) best = cand;
        if (sub.length === 0) break;
      }
    }
    return best;
  }

  function nextSame(sched, s) {
    let best = null;
    for (const x of sched) {
      if (x.type === s.type && x.status === 'planned' && x.date > s.date && x.id !== s.id) {
        if (best === null || x.date < best.date) best = x;
      }
    }
    return best;
  }

  function options(sched, sid, today, horizon) {
    const s = get(sched, sid); const o = {};
    const sk = clone(sched); get(sk, sid).status = 'skipped';
    const nx = nextSame(sched, s);
    o.skip = { sched: sk, gap: nx ? diff(nx.date, s.date) : null, nxt: nx ? nx.date : null };
    if (T[s.type].fixed) return o;
    const sh = shiftOption(sched, sid, today, horizon);
    if (sh) o.shift = sh;
    if (!s.light && s.type !== 'SWIM' && s.date >= today) {
      const n = clone(sched); get(n, sid).light = true;
      o.light = { sched: n };
    }
    return o;
  }

  function streak(sched, today) {
    return sched.filter((x) => { const d = diff(today, x.orig);
      return d >= 0 && d <= 3 && x.type !== 'STRETCH' && (x.status === 'skipped' || x.moves > 0 || x.light); }).length;
  }

  function recommend(s, o, sched, today) {
    const p = T[s.type].prio; const sh = o.shift;
    const haveCtx = sched !== undefined && sched !== null;
    if (haveCtx && !T[s.type].fixed && streak(sched, today) >= 2 && s.type !== 'STRETCH' && o.skip) return 'skip';
    let r = 'skip';
    if (sh && sh.offset <= 3 && !sh.dropped.length && sh.soft <= 1) r = 'shift';
    else if (sh && sh.offset <= 2 && p >= 70 && sh.soft <= 3 && !sh.rehomed.length) r = 'shift';
    else if (o.light && p >= 40 && s.type !== 'STRETCH') r = 'light';
    if (r !== 'shift' && sh && p >= 90 && sh.offset <= 4 && sh.soft <= 3 && !sh.rehomed.length) {
      if (haveCtx && streak(sched, today) >= 2) return r;
      return 'shift';
    }
    return r;
  }

  // ---------- herstel na wissel / extra / terugzetten ----------
  function repair(sched, today, horizon, protect) {
    protect = protect || [];
    let n = clone(sched); const log = []; const ignored = new Set();
    for (let round = 0; round < 15; round++) {
      const H = Array.from(setMinus(viol(n).H, ignored)).sort(cmpStr);
      let fixedOne = false;
      for (const key of H) {
        const cands = involved(n, key).filter((s) => s.status === 'planned' && !T[s.type].fixed
          && !protect.includes(s.id) && s.date >= today);
        if (!cands.length) { ignored.add(key); continue; }
        let s = cands[0];
        for (const c of cands) if (T[c.type].prio < T[s.type].prio) s = c;
        const old = s.date;
        const sh = shiftOption(n, s.id, today, horizon);
        if (sh) {
          n = sh.sched; log.push(['shift', s.type, old, sh.date]);
          for (const [t, c] of sh.rehomed) log.push(['rehome', t, c]);
          for (const t of sh.dropped) log.push(['dropped', t]);
        } else {
          get(n, s.id).status = 'dropped'; log.push(['drop', s.type, old]);
        }
        fixedOne = true; break;
      }
      if (!fixedOne) break;
    }
    return { sched: n, log };
  }

  function newViolations(before, after) {
    const v0 = viol(before), v1 = viol(after);
    const H = Array.from(setMinus(v1.H, v0.H)).sort(cmpStr);
    const S = [];
    for (const [k, v] of v1.S) if (!v0.S.has(k)) S.push(k + '=' + v);
    S.sort(cmpStr);
    return { H, S };
  }

  function swap(sched, aid, bid, today, horizon) {
    const n = clone(sched); const a = get(n, aid), b = get(n, bid);
    const tmp = a.date; a.date = b.date; b.date = tmp;
    a.swapped = b.swapped = true;
    const r = repair(n, today, horizon, [aid, bid]);
    const nv = newViolations(sched, r.sched);
    return { sched: r.sched, H: nv.H, S: nv.S, log: r.log };
  }

  function addExtra(sched, type, date, today, horizon, extraInfo) {
    const n = clone(sched);
    let sid = 'X' + type + '-' + date; let k = 2;
    while (n.some((x) => x.id === sid)) { sid = 'X' + type + '-' + date + '.' + k; k++; }
    const row = { id: sid, type, date, orig: date, status: 'planned', light: false, moves: 0, extra: true };
    if (extraInfo) row.info = extraInfo;           // naam/duur etc. (niet meegeteld in de hash)
    n.push(row);
    const r = repair(n, today, horizon, [sid]);
    const nv = newViolations(sched, r.sched);
    return { sched: r.sched, H: nv.H, S: nv.S, log: r.log, id: sid };
  }

  function resetWeek(sched, today, horizon) {
    const n = clone(sched);
    const wk = mondayOf(today), wend = add(wk, 6);
    for (const s of n) {
      if (s.status === 'planned' && wk <= s.orig && s.orig <= wend && !s.extra && s.orig >= today && s.date >= today) {
        s.date = s.orig; s.light = false; s.swapped = false; s.moves = 0;
      }
    }
    for (const [t, cnt] of WEEK_TEMPLATE) {
      const wkS = n.filter((s) => wk <= s.date && s.date <= wend && s.type === t);
      const resolved = wkS.filter((s) => s.status === 'done').length;
      const planned = wkS.filter((s) => s.status === 'planned' && !s.extra).sort((x, y) => cmpStr(x.date, y.date));
      const need = Math.max(cnt - resolved, 0);
      for (const s of planned.slice(need)) s.status = 'dropped';
    }
    const r = repair(n, today, horizon, []);
    return { sched: r.sched, log: r.log };
  }

  // Uitgebreid met nieuwe weken (basisweek) tot en met 'horizon'; bestaande sessies blijven staan.
  function extendTo(sched, horizon) {
    const have = new Set(sched.map((s) => s.id));
    let last = sched.reduce((m, s) => (s.orig > m ? s.orig : m), '0000-00-00');
    if (last === '0000-00-00') return sched;
    let mon = add(mondayOf(last), 7);
    const out = sched.slice();
    while (mon <= horizon) {
      for (const s of build(mon, 1)) if (!have.has(s.id)) out.push(s);
      mon = add(mon, 7);
    }
    return out;
  }

  // Waarschuwing-tekst voor sessies in de toekomst (UI). Alleen schendingen waar minstens één geplande sessie bij zit.
  function activeWarnings(sched, today) {
    const v = viol(sched); const out = [];
    const rel = (k) => involved(sched, k).some((s) => s.status === 'planned' && s.date >= today);
    for (const k of v.H) if (rel(k)) out.push({ key: k, hard: true });
    for (const [k, w] of v.S) if (rel(k)) out.push({ key: k, hard: false, w });
    return out;
  }

  // Weekbalans: hoeveel upper/lower/... staan er (gedaan + gepland) in de week van 'date', en dagen sinds/tot lower.
  function weekBalance(sched, date) {
    const wk = mondayOf(date), we = add(wk, 6);
    const c = { UPPER: 0, LOWER: 0, MMA: 0, TYSON: 0, ARMS: 0 };
    for (const s of sched) {
      if ((s.status === 'planned' || s.status === 'done') && s.date >= wk && s.date <= we && !s.light && c[s.type] !== undefined) c[s.type]++;
    }
    const lowers = sched.filter((s) => (s.status === 'planned' || s.status === 'done') && T[s.type].muscle === 'lower')
      .map((s) => s.date).sort();
    const nextLower = lowers.find((d) => d >= date) || null;
    return { counts: c, nextLower, daysToNextLower: nextLower ? diff(nextLower, date) : null };
  }

  // Tekst-vorm van de toestand voor hash-vergelijking in tests
  function stateString(sched) {
    return sched.map((s) => [s.id, s.type, s.date, s.orig, s.status, s.light ? 1 : 0, s.moves, s.swapped ? 1 : 0, s.extra ? 1 : 0].join('|')).join('\n');
  }

  const api = { T, TEMPLATE, WEEK_TEMPLATE, dnum, fromNum, add, diff, weekday, mondayOf, build, get, viol, softsum, involved, keyCode,
    shiftOption, options, streak, recommend, repair, swap, addExtra, resetWeek, extendTo, activeWarnings, weekBalance, stateString, newViolations };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Engine = api;
})(typeof self !== 'undefined' ? self : this);
