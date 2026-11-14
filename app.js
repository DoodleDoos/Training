(function () {
  'use strict';
  const E = window.Engine;
  const KEY = 'trainapp.v1';
  const VERSION = '1.0';
  const DAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
  const DAYSL = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
  const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const pad = (n) => String(n).padStart(2, '0');
  const isoToday = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const fmt = (iso) => DAYS[E.weekday(iso)] + ' ' + (+iso.slice(8)) + ' ' + MONTHS[+iso.slice(5, 7) - 1];
  const fmtL = (iso) => DAYSL[E.weekday(iso)] + ' ' + (+iso.slice(8)) + ' ' + MONTHS[+iso.slice(5, 7) - 1];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s) => document.querySelector(s);
  const clone = (x) => JSON.parse(JSON.stringify(x));

  // ---------- teksten per sessie ----------
  const LABEL = { UPPER: 'Gym upper', LOWER: 'Gym lower', MMA: 'MMA / grappling', BAG: 'Bokszak afstand + jab/teep',
    ARMS: 'Armen, schouders & buik', SWIM: 'Zwemmen', TYSON: 'Bokszak Tyson', STRETCH: 'Stretch',
    VOETBAL: 'Zware beenactiviteit', EXTRAHARD: 'Extra (zwaar)', EXTRALEGS: 'Extra (benen)', EXTRAMED: 'Extra', EXTRALIGHT: 'Extra (licht)' };
  const HEAVY = { UPPER: 'zwaar', LOWER: 'zwaar', MMA: 'zwaar', VOETBAL: 'zwaar', EXTRAHARD: 'zwaar',
    TYSON: 'gemiddeld', ARMS: 'gemiddeld', EXTRALEGS: 'gemiddeld', EXTRAMED: 'gemiddeld',
    BAG: 'licht', SWIM: 'licht', STRETCH: 'licht', EXTRALIGHT: 'licht' };
  const LIGHTTXT = { LOWER: 'lower 45 min, rustig', UPPER: 'upper 45 min', TYSON: 'bokszak techniek 20 min, geen power',
    ARMS: 'armen 25 min', BAG: 'bokszak 15 min', STRETCH: 'alleen de 15-min video', VOETBAL: 'rustig, korter', EXTRAHARD: 'rustig, korter',
    EXTRALEGS: 'rustig, korter', EXTRAMED: 'rustig, korter', EXTRALIGHT: 'korter' };
  function label(s) {
    if (s.extra && s.info && s.info.name) return s.info.name;
    if (s.type === 'STRETCH') {
      const w = E.weekday(s.orig);
      return w === 0 ? 'Trap-stretch (optioneel)' : w === 6 ? 'Lichte stretch' : 'Stretch 40 min';
    }
    return LABEL[s.type] || s.type;
  }
  function detail(s) {
    if (s.light) return 'Lichte versie: ' + (LIGHTTXT[s.type] || 'korter');
    const w = E.weekday(s.orig);
    switch (s.type) {
      case 'UPPER': return '~90 min · geen armen, schouders of buik · rugwerk: stop 1–2 herhalingen voor failure';
      case 'LOWER': return '~2 uur · daarna niets meer die dag';
      case 'MMA': return w === 3 ? 'Avond · zwaarste dag van de week' : 'Avond · techniek + sparren';
      case 'BAG': return '30 min · afstand houden, jab en teep';
      case 'ARMS': return '~45 min';
      case 'SWIM': return '1 uur, rustig';
      case 'TYSON': return '6 rondes van 3 min, 1 min rust';
      case 'STRETCH': return w === 0 ? '40 min voor de trapezius' : w === 6 ? '40 min, rustig' : '40 min na de bokszak';
      default: return s.info && s.info.mins ? s.info.mins + ' min' : '';
    }
  }
  const heavyOf = (s) => (s.light ? 'licht' : (s.extra && s.info && s.info.heavy) || HEAVY[s.type] || 'gemiddeld');
  const slotKey = (s) => (s.type === 'MMA' ? 'MMA-' + E.weekday(s.orig) : s.type);

  // ---------- opslag ----------
  let mem = null, storageOK = true;
  function rawGet() { try { return localStorage.getItem(KEY); } catch (e) { storageOK = false; return mem; } }
  function rawSet(s) { mem = s; try { localStorage.setItem(KEY, s); } catch (e) { storageOK = false; } }
  let S = null;
  const ui = { tab: 'today', day: null, weekStart: null, sheet: null, setupDate: null };

  function fresh(start) {
    const t = isoToday();
    const horizon = E.add(t > start ? t : start, 34);
    let sched = E.build(start, 1);
    sched = E.extendTo(sched, horizon);
    return { v: 1, start, sched, archive: [], morning: {}, ratings: {}, mobility: [], undo: [], swaps: [],
      settings: { times: {}, weekGoal: 6, hurk: 20, video: '' }, notified: {} };
  }
  function load() {
    const raw = rawGet();
    if (!raw) return null;
    try {
      const o = JSON.parse(raw);
      if (!o || o.v !== 1 || !Array.isArray(o.sched)) return null;
      o.archive = o.archive || []; o.morning = o.morning || {}; o.ratings = o.ratings || {}; o.mobility = o.mobility || [];
      o.undo = o.undo || []; o.swaps = o.swaps || []; o.notified = o.notified || {};
      o.settings = Object.assign({ times: {}, weekGoal: 6, hurk: 20, video: '' }, o.settings || {});
      return o;
    } catch (e) { return null; }
  }
  function save() { try { rawSet(JSON.stringify(S)); } catch (e) { storageOK = false; } }
  const horizon = () => E.add(isoToday(), 34);

  function housekeeping() {
    const t = isoToday();
    S.sched = E.extendTo(S.sched, E.add(t > S.start ? t : S.start, 34));
    for (const s of S.sched) {                      // oude, nooit afgevinkte sessies sluiten we stil af
      if (s.status === 'planned' && s.date < E.add(t, -3)) { s.status = 'skipped'; s.auto = true; }
    }
    const cut = E.add(t, -14);
    const keep = [], old = [];
    for (const s of S.sched) (s.date < cut && s.status !== 'planned' ? old : keep).push(s);
    if (old.length) { S.archive = S.archive.concat(old); S.sched = keep; }
    save();
  }
  function snap(text) {
    S.undo.push({ text, at: Date.now(), sched: clone(S.sched), ratings: clone(S.ratings), swaps: clone(S.swaps) });
    if (S.undo.length > 15) S.undo.shift();
  }
  function undo() {
    const u = S.undo.pop(); if (!u) return;
    S.sched = u.sched; S.ratings = u.ratings; S.swaps = u.swaps; save(); render(); toast('Ongedaan gemaakt: ' + u.text);
  }
  const all = () => S.sched.concat(S.archive);

  // ---------- helpers ----------
  const todayIso = () => isoToday();
  const dayItems = (d) => S.sched.filter((s) => s.date === d && (s.status === 'planned' || s.status === 'done' || s.status === 'skipped'));
  const order = (a, b) => (E.T[b.type].prio - E.T[a.type].prio);

  function toast(msg, undoBtn) {
    const el = $('#toast');
    el.innerHTML = '<div class="toast"><span>' + esc(msg) + '</span>' + (undoBtn ? '<button data-act="undo">Ongedaan maken</button>' : '') + '</div>';
    clearTimeout(toast.t); toast.t = setTimeout(() => { el.innerHTML = ''; }, undoBtn ? 7000 : 3200);
  }

  const WTEXT = {
    'twee hoofdsessies op een dag': 'Twee hoofdsessies op één dag',
    'dezelfde sessie 2x op een dag': 'Dezelfde sessie twee keer op één dag',
    'extra sessie op MMA-dag': 'Extra sessie op een MMA-dag',
    'hoofdsessie + 2 lichte sessies': 'Hoofdsessie plus meerdere lichte sessies',
    'te veel lichte sessies': 'Te veel lichte sessies op één dag',
    'extra sessie op beendag': 'Extra sessie op een beendag',
    'zware sessie + extra losse sessie': 'Zware sessie plus een extra losse sessie',
    '2x stretch op een dag': 'Twee keer stretch op één dag',
    'lower naast MMA': 'Lower vlak naast MMA',
    'Tyson op MMA-dag': 'Tyson op een MMA-dag',
    'Tyson naast MMA': 'Tyson vlak voor of na MMA',
    'voetbal naast MMA': 'Zware beenactiviteit vlak naast MMA',
    'armen alleen vr/za/zo': 'Armen buiten vrijdag/zaterdag/zondag',
    'lower 2 dagen voor MMA': 'Lower precies 2 dagen voor MMA (herstel is krap)',
    'zelfde spier binnen 48u': 'Dezelfde spiergroep binnen 48 uur',
    'zelfde spier maar 2 dagen rust': 'Dezelfde spiergroep maar 2 dagen rust',
    '3 krachtdagen op rij': '3 krachtdagen op rij',
    '2 zware dagen op rij': '2 zware dagen op rij',
    'upper en armen naast elkaar': 'Upper en armen op aangrenzende dagen',
  };
  function wtext(key, sched) {
    const p = key.split('|'); const code = p[0]; const kind = p[1]; const ref = p[2];
    let where = '';
    if (kind === 'd') where = fmt(ref);
    else { const inv = E.involved(sched, key); where = inv.map((s) => label(s) + ' ' + fmt(s.date)).join(' en '); }
    return (WTEXT[code] || code) + (where ? ' (' + where + ')' : '');
  }
  function describeLog(log) {
    return log.map((l) => {
      if (l[0] === 'shift') return LABEL[l[1]] + ' schuift van ' + fmt(l[2]) + ' naar ' + fmt(l[3]);
      if (l[0] === 'rehome') return LABEL[l[1]] + ' gaat naar ' + fmt(l[2]);
      if (l[0] === 'dropped') return LABEL[l[1]] + ' vervalt deze week';
      if (l[0] === 'drop') return LABEL[l[1]] + ' van ' + fmt(l[2]) + ' vervalt deze week';
      return l.join(' ');
    });
  }
  function balanceText(sched, date) {
    const b = E.weekBalance(sched, date);
    let t = 'Deze week: upper ' + b.counts.UPPER + '×, lower ' + b.counts.LOWER + '×. ';
    if (b.nextLower) t += 'Volgende lower: ' + fmt(b.nextLower) + (b.daysToNextLower > 0 ? ' (over ' + b.daysToNextLower + ' dagen)' : ' (vandaag)') + '.';
    else t += 'Er staat geen lower meer gepland.';
    return { text: t, warn: b.counts.LOWER === 0 || b.counts.UPPER === 0 };
  }

  // ---------- zicht op weken / doelen ----------
  function weekSessions(monday) {
    const end = E.add(monday, 6);
    return all().filter((s) => s.date >= monday && s.date <= end);
  }
  const countsForGoal = (s) => s.status === 'done' && s.type !== 'STRETCH';
  function weekDone(monday) { return weekSessions(monday).filter(countsForGoal).length; }
  function weekGoal() { return S.settings.weekGoal || 6; }

  // ---------- render ----------
  function render() {
    if (!S) return renderSetup();
    const t = todayIso();
    const tab = ui.tab;
    document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === tab ? 'true' : 'false'));
    let html = '';
    if (!storageOK) html += '<div class="note bad">Opslaan lukt niet in deze browser (privémodus of opslag geblokkeerd). Je gegevens verdwijnen als je de app sluit.</div>';
    if (tab === 'today') html += viewDay();
    else if (tab === 'week') html += viewWeek();
    else if (tab === 'progress') html += viewProgress();
    else html += viewMore();
    $('#view').innerHTML = html;
    renderSheet();
  }

  function renderSetup() {
    $('#h1').textContent = 'Training'; $('#hsub').textContent = 'Eerste keer opstarten';
    const t = todayIso();
    let mon = E.mondayOf(t); if (mon < t) mon = E.add(mon, 7);
    if (!ui.setupDate) ui.setupDate = mon;
    $('#view').innerHTML = '<div class="card"><h2>Welkom</h2><p>Je planning volgt de basisweek: elke maandag begin je weer vanaf die week. Vanaf welke maandag wil je starten?</p>' +
      '<div class="f"><span>Startdatum (een maandag)</span><input type="date" id="setupDate" value="' + ui.setupDate + '"></div>' +
      '<div class="btns"><button class="btn ok" data-act="setup">Start de planning</button></div>' +
      '<p class="sub">Je gegevens staan alleen op deze telefoon. Maak af en toe een back-up via Meer.</p></div>' +
      '<div class="card"><h3>Of: zet een eerdere back-up terug</h3><textarea id="setupImport" placeholder="Plak hier je back-up"></textarea><div class="btns"><button class="btn" data-act="import-setup">Terugzetten</button></div></div>';
    $('#sheet').innerHTML = '';
  }

  // ----- Vandaag / dagweergave -----
  function morningCard(d) {
    const m = S.morning[d] || {};
    const n = (m.warm ? 1 : 0) + (m.video ? 1 : 0) + (m.calf ? 1 : 0);
    const hs = S.settings.hurk;
    return '<div class="card"><div class="row"><div class="grow"><h2>Ochtendblok</h2><div class="sub">' + n + ' van 3 gedaan</div></div></div>' +
      '<div class="check"><input type="checkbox" id="m-warm" data-act="morning" data-k="warm" data-d="' + d + '"' + (m.warm ? ' checked' : '') + '><label for="m-warm">Opwarmen · 3 min</label><button class="btn small" data-act="timer" data-kind="warm">⏱</button></div>' +
      '<div class="check"><input type="checkbox" id="m-video" data-act="morning" data-k="video" data-d="' + d + '"' + (m.video ? ' checked' : '') + '><label for="m-video">Stretchvideo · 15 min</label>' +
      (S.settings.video ? '<a class="btn small" href="' + esc(S.settings.video) + '" target="_blank" rel="noopener">▶</a>' : '') + '</div>' +
      '<div class="check"><input type="checkbox" id="m-calf" data-act="morning" data-k="calf" data-d="' + d + '"' + (m.calf ? ' checked' : '') + '><label for="m-calf">Kuit- en enkelblok<div class="sub">Knee-to-wall 10–15 per been · kuitrek 30 s gestrekt + 30 s gebogen · diepe hurkzit-hold ' + hs + ' s</div></label></div>' +
      '<div class="btns"><button class="btn small" data-act="timer" data-kind="calf">⏱ Kuitrek</button><button class="btn small" data-act="timer" data-kind="hurk">⏱ Hurkzit ' + hs + ' s</button>' +
      '<button class="btn small ghost" data-act="hurk" data-v="-5">−5 s</button><button class="btn small ghost" data-act="hurk" data-v="5">+5 s</button></div></div>';
  }

  function sessionCard(s, t) {
    const past = s.date <= t;
    const hv = heavyOf(s);
    let h = '<div class="card s st-' + s.status + '"><div class="row"><div class="grow"><div class="title">' + esc(label(s)) + '</div><div class="tag">' + esc(detail(s)) + timeTxt(s) + '</div></div>' +
      '<span class="chip ' + hv + '">' + hv + '</span></div>';
    const notes = [];
    if (s.status === 'done') notes.push('<div class="note">Gedaan ✓</div>');
    if (s.status === 'skipped') notes.push('<div class="note warn">' + (s.auto ? 'Automatisch overgeslagen' : 'Overgeslagen') + '</div>');
    if (s.moves > 0 && s.orig !== s.date) notes.push('<div class="note">Verschoven van ' + fmt(s.orig) + '</div>');
    if (s.swapped) notes.push('<div class="note">Gewisseld</div>');
    if (s.extra) notes.push('<div class="note">Extra activiteit</div>');
    h += notes.join('');
    const warns = E.activeWarnings(S.sched, t).filter((w) => E.involved(S.sched, w.key).some((x) => x.id === s.id)
      && E.involved(S.sched, w.key).some((x) => x.swapped || x.moves > 0 || x.extra));
    if (s.status === 'planned') for (const w of warns) h += '<div class="note ' + (w.hard ? 'bad' : 'warn') + '">' + esc(wtext(w.key, S.sched)) + '</div>';
    if (s.status === 'done') {
      const r = S.ratings[s.id];
      h += '<div class="rate"><span class="sub">Hoe zwaar voelde het (inspanning)?</span>' +
        ['licht', 'normaal', 'zwaar'].map((x) => '<span class="chip' + (r === x ? ' on' : '') + '" data-act="rate" data-id="' + esc(s.id) + '" data-v="' + x + '">' + x + '</span>').join('') + '</div>';
      h += '<div class="btns"><button class="btn small ghost" data-act="undone" data-id="' + esc(s.id) + '">↺ Terug naar gepland</button></div>';
    } else {
      h += '<div class="btns">';
      if (past) h += '<button class="btn ok" data-act="done" data-id="' + esc(s.id) + '">✓ Gedaan</button>';
      if (s.status === 'planned') {
        h += '<button class="btn no" data-act="miss" data-id="' + esc(s.id) + '">✕ Gemist</button>';
        if (!E.T[s.type].fixed) h += '<button class="btn sw" data-act="swapopen" data-id="' + esc(s.id) + '">⇄ Wissel</button>';
      }
      if (s.status === 'planned' && (s.type === 'BAG' || s.type === 'TYSON')) h += '<button class="btn small" data-act="timer" data-kind="rounds" data-id="' + esc(s.id) + '">⏱ Rondetimer</button>';
      h += '</div>';
    }
    return h + '</div>';
  }
  function timeTxt(s) { const tm = S.settings.times[slotKey(s)]; return tm ? ' · ' + tm : ''; }

  function viewDay() {
    const t = todayIso();
    const d = ui.day || t;
    $('#h1').textContent = d === t ? 'Vandaag' : fmtL(d);
    $('#hsub').textContent = d === t ? fmtL(d) : (d < t ? 'Eerdere dag' : 'Komende dag');
    let h = '';
    if (d < S.start) return h + '<div class="card"><h2>Nog niet gestart</h2><p>Je planning begint op ' + fmtL(S.start) + '.</p></div>';
    if (ui.day && ui.day !== t) h += '<div class="btns" style="margin:0 0 10px"><button class="btn small" data-act="today">← Terug naar vandaag</button></div>';
    if (d <= t) h += morningCard(d);
    if (d === t) {
      const open = S.sched.filter((s) => s.status === 'planned' && s.date < t && s.date >= E.add(t, -3) && s.type !== 'STRETCH')
        .sort((a, b) => (a.date < b.date ? -1 : 1));
      if (open.length) {
        h += '<div class="card"><h2>Nog open uit eerdere dagen</h2><div class="sub">Vink af of geef aan wat er is gebeurd.</div>' +
          open.map((s) => '<div class="check"><div class="grow" style="flex:1"><b>' + esc(label(s)) + '</b><div class="sub">' + fmtL(s.date) + '</div></div>' +
            '<button class="btn small ok" data-act="done" data-id="' + esc(s.id) + '">✓</button><button class="btn small no" data-act="miss" data-id="' + esc(s.id) + '">✕</button></div>').join('') + '</div>';
      }
      const sug = swapSuggestion();
      if (sug) h += '<div class="note warn" style="margin-bottom:12px">' + esc(sug) + '</div>';
    }
    const items = dayItems(d).sort(order);
    if (!items.length) h += '<div class="card"><h2>Rustdag</h2><p class="sub">Geen sessies gepland. Herstel hoort er ook bij.</p></div>';
    for (const s of items) h += sessionCard(s, t);
    h += '<div class="btns"><button class="btn" data-act="extraopen" data-d="' + d + '">＋ Iets anders / extra</button></div>';
    if (d === t) h += weekGoalCard(E.mondayOf(t));
    return h;
  }

  function weekGoalCard(mon) {
    const n = weekDone(mon), g = weekGoal();
    const pct = Math.min(100, Math.round((n / g) * 100));
    return '<div class="card" style="margin-top:12px"><div class="row"><div class="grow"><h2>Weekdoel</h2><div class="sub">' + n + ' van ' + g + ' trainingen (lichte versie telt mee)</div></div></div><div class="bar" style="margin-top:8px"><i style="width:' + pct + '%"></i></div></div>';
  }

  function swapSuggestion() {
    const mon = E.mondayOf(todayIso());
    const pairs = new Set(S.swaps.map((x) => x.a + '|' + x.b));
    for (const p of pairs) {
      const [a, b] = p.split('|');
      const ok = [0, 1, 2].every((i) => S.swaps.some((x) => x.a === a && x.b === b && x.week === E.add(mon, -7 * i)));
      if (ok) return 'Je wisselt ' + LABEL[a] + ' en ' + LABEL[b] + ' nu 3 weken achter elkaar. Misschien past een andere basisweek beter: vraag het aan Claude.';
    }
    return null;
  }

  // ----- Week -----
  function viewWeek() {
    const t = todayIso();
    const mon = ui.weekStart || E.mondayOf(t);
    $('#h1').textContent = 'Week'; $('#hsub').textContent = fmt(mon) + ' – ' + fmt(E.add(mon, 6));
    let h = '<div class="row" style="justify-content:space-between;margin-bottom:10px"><button class="btn small" data-act="wk" data-v="-7">← Vorige</button>' +
      (mon !== E.mondayOf(t) ? '<button class="btn small" data-act="wk" data-v="0">Deze week</button>' : '') +
      '<button class="btn small" data-act="wk" data-v="7">Volgende →</button></div>';
    for (let i = 0; i < 7; i++) {
      const d = E.add(mon, i);
      const items = dayItems(d).sort(order);
      const m = S.morning[d] || {}; const mn = (m.warm ? 1 : 0) + (m.video ? 1 : 0) + (m.calf ? 1 : 0);
      h += '<button class="day' + (d === t ? ' today' : '') + '" data-act="openday" data-d="' + d + '"><span class="dn">' + DAYS[i] + '<small>' + (+d.slice(8)) + ' ' + MONTHS[+d.slice(5, 7) - 1] + '</small></span><span class="ss">' +
        (items.length ? items.map((s) => '<span class="si ' + (s.status === 'done' ? 'done' : s.status === 'skipped' ? 'skipped' : (s.moves > 0 || s.swapped ? 'moved' : '')) + '">' +
          (s.status === 'done' ? '✓ ' : s.status === 'skipped' ? '✕ ' : '') + esc(label(s)) + (s.light ? ' (licht)' : '') + ratingDot(s) + '</span>').join('') : '<span class="sub">rust</span>') +
        '</span>' + (d <= t && S.start <= d ? '<span class="sub" title="ochtendblok">☀' + mn + '/3</span>' : '') + '</button>';
    }
    const dropped = weekSessions(mon).filter((s) => s.status === 'dropped');
    if (dropped.length) h += '<div class="note warn">Vervallen deze week: ' + dropped.map((s) => esc(label(s))).join(', ') + '</div>';
    h += weekGoalCard(mon);
    h += '<div class="btns"><button class="btn" data-act="resetopen">↺ Zet terug naar basisweek</button><button class="btn" data-act="copyweek" data-w="' + mon + '">⧉ Kopieer weekoverzicht</button></div>';
    return h;
  }
  function ratingDot(s) {
    const r = S.ratings[s.id]; if (!r || s.status !== 'done') return '';
    return ' <span class="sub">(' + r + ')</span>';
  }

  // ----- Voortgang -----
  function sparkline(vals, color) {
    if (vals.length < 2) return '<div class="sub">Nog te weinig metingen voor een lijn.</div>';
    const w = 300, h = 56, mn = Math.min(...vals), mx = Math.max(...vals), rg = mx - mn || 1;
    const pts = vals.map((v, i) => [(i / (vals.length - 1)) * (w - 8) + 4, h - 6 - ((v - mn) / rg) * (h - 12)]);
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><polyline fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round" points="' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + '"/>' +
      pts.map((p) => '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="' + color + '"/>').join('') + '</svg>';
  }
  function weeklyText(mon) {
    const ss = weekSessions(mon).filter((s) => s.type !== 'STRETCH' || s.status === 'done');
    const lines = ['Week van ' + fmtL(mon) + ':'];
    for (let i = 0; i < 7; i++) {
      const d = E.add(mon, i);
      const it = ss.filter((s) => s.date === d && s.status !== 'dropped' && s.status !== 'removed');
      if (it.length) lines.push(DAYS[i] + ': ' + it.map((s) => (s.status === 'done' ? '✓ ' : s.status === 'skipped' ? '✕ ' : '· ') + label(s) + (s.light ? ' (licht)' : '') + (S.ratings[s.id] ? ' [' + S.ratings[s.id] + ']' : '')).join(', '));
    }
    lines.push('Trainingen gedaan: ' + weekDone(mon) + ' van ' + weekGoal());
    let m = 0; for (let i = 0; i < 7; i++) { const x = S.morning[E.add(mon, i)]; if (x && x.warm && x.video && x.calf) m++; }
    lines.push('Ochtendblokken helemaal gedaan: ' + m + ' van 7');
    return lines.join('\n');
  }
  function viewProgress() {
    const t = todayIso(); const mon = E.mondayOf(t);
    $('#h1').textContent = 'Voortgang'; $('#hsub').textContent = 'Wat je al hebt gedaan';
    const total = all().filter(countsForGoal).length;
    let weeksHit = 0; const seen = new Set();
    for (const s of all()) { const w = E.mondayOf(s.date); if (w < mon && !seen.has(w)) { seen.add(w); if (weekDone(w) >= weekGoal()) weeksHit++; } }
    const mornFull = Object.keys(S.morning).filter((d) => { const m = S.morning[d]; return m.warm && m.video && m.calf; }).length;
    let h = '<div class="grid2"><div class="stat"><b>' + total + '</b><span class="sub">trainingen gedaan</span></div><div class="stat"><b>' + weeksHit + '</b><span class="sub">weken weekdoel gehaald</span></div>' +
      '<div class="stat"><b>' + mornFull + '</b><span class="sub">complete ochtendblokken</span></div><div class="stat"><b>' + weekDone(mon) + '/' + weekGoal() + '</b><span class="sub">deze week</span></div></div>';
    // laatste 8 weken
    let bars = '';
    for (let i = 7; i >= 0; i--) {
      const w = E.add(mon, -7 * i); const n = weekDone(w); const g = weekGoal();
      bars += '<div style="flex:1;text-align:center"><div style="height:70px;display:flex;align-items:flex-end;justify-content:center"><div style="width:70%;height:' + Math.min(100, (n / (g + 2)) * 100) + '%;background:' + (n >= g ? 'var(--accent)' : 'var(--line)') + ';border-radius:5px 5px 0 0;min-height:' + (n ? 4 : 2) + 'px"></div></div><div class="sub" style="font-size:.65rem">' + (+w.slice(8)) + '/' + (+w.slice(5, 7)) + '</div><div class="sub" style="font-size:.7rem">' + n + '</div></div>';
    }
    h += '<div class="card" style="margin-top:12px"><h2>Laatste 8 weken</h2><div class="sub">Groen = weekdoel gehaald</div><div style="display:flex;gap:4px;margin-top:8px">' + bars + '</div></div>';
    // mobiliteit
    const mb = S.mobility.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    const last = mb[mb.length - 1];
    const due = !last || E.diff(t, last.date) >= 28;
    h += '<div class="card"><h2>Mobiliteit</h2>' + (due ? '<div class="note warn">Tijd voor een nieuwe meting' + (last ? ' (laatste: ' + fmt(last.date) + ')' : '') + '. Eén keer per maand is genoeg.</div>' : '<div class="sub">Laatste meting: ' + fmt(last.date) + '</div>');
    const series = [['knee', 'Knee-to-wall (cm)'], ['hurk', 'Hurkzit-hold (s)'], ['trap', 'Traphoogte (cm)']];
    for (const [k, nm] of series) {
      const vals = mb.filter((x) => x[k] != null).map((x) => x[k]);
      h += '<h3>' + nm + (vals.length ? ' · nu ' + vals[vals.length - 1] : '') + '</h3>' + sparkline(vals, 'var(--accent)');
    }
    h += '<div class="btns"><button class="btn" data-act="mobopen">＋ Nieuwe meting</button></div></div>';
    // overzicht
    h += '<div class="card"><h2>' + (E.weekday(t) === 6 ? 'Zondagavond-overzicht' : 'Weekoverzicht') + '</h2><div class="pre">' + esc(weeklyText(mon)) + '</div><div class="btns"><button class="btn" data-act="copyweek" data-w="' + mon + '">⧉ Kopieer om te delen</button></div></div>';
    return h;
  }

  // ----- Meer -----
  const TIME_SLOTS = [['UPPER', 'Gym upper'], ['MMA-1', 'MMA dinsdag'], ['BAG', 'Bokszak afstand'], ['MMA-3', 'MMA donderdag'], ['ARMS', 'Armen/schouders/buik'], ['SWIM', 'Zwemmen'], ['LOWER', 'Gym lower'], ['TYSON', 'Bokszak Tyson']];
  function viewMore() {
    $('#h1').textContent = 'Meer'; $('#hsub').textContent = 'Instellingen en back-up';
    const last = S.undo[S.undo.length - 1];
    let h = '<div class="card"><h2>Ongedaan maken</h2><div class="sub">' + (last ? 'Laatste actie: ' + esc(last.text) : 'Nog niets om ongedaan te maken.') + '</div><div class="btns"><button class="btn" data-act="undo"' + (last ? '' : ' disabled') + '>↶ Ongedaan maken</button></div></div>';
    h += '<div class="card"><h2>Vaste tijden</h2><div class="sub">Staan op de kaartjes. Als de app open is, krijg je een melding met geluid. Voor een echte wekker: maak de agenda-herinneringen hieronder.</div>' +
      TIME_SLOTS.map(([k, n]) => '<div class="check"><label style="flex:1">' + n + '</label><input type="time" data-act="time" data-k="' + k + '" value="' + esc(S.settings.times[k] || '') + '"></div>').join('') +
      '<div class="btns"><button class="btn" data-act="ics">📅 Agenda-herinneringen (.ics)</button></div><div class="sub" style="margin-top:6px">Open het bestand daarna met Samsung Calendar. Het zijn herhalende afspraken volgens de basisweek; ze schuiven niet mee als je iets verplaatst.</div></div>';
    h += '<div class="card"><h2>Instellingen</h2><div class="f"><span>Weekdoel: aantal trainingen per week (zonder stretch)</span><input type="number" min="1" max="12" data-act="goal" value="' + weekGoal() + '"></div>' +
      '<div class="f"><span>Link naar je stretchvideo (optioneel)</span><input type="text" data-act="video" value="' + esc(S.settings.video || '') + '" placeholder="https://…"></div></div>';
    h += '<div class="card"><h2>Back-up</h2><div class="sub">Je gegevens staan alleen op deze telefoon. Kopieer ze af en toe naar een veilige plek (bijvoorbeeld een notitie naar jezelf).</div><div class="btns"><button class="btn" data-act="export">⧉ Kopieer back-up</button><button class="btn" data-act="exportfile">⬇ Bestand opslaan</button></div>' +
      '<div class="f"><span>Terugzetten: plak hier je back-up</span><textarea id="importBox" placeholder="Plak je back-up"></textarea></div><div class="btns"><button class="btn" data-act="import">Terugzetten</button></div></div>';
    h += '<div class="card"><h2>De basisweek</h2><ul class="l"><li>ma: Gym upper (+ optionele trap-stretch)</li><li>di: MMA / grappling</li><li>wo: Bokszak afstand + 40 min stretch</li><li>do: MMA (zwaarst)</li><li>vr: Armen/schouders/buik + zwemmen</li><li>za: Gym lower</li><li>zo: Bokszak Tyson + lichte stretch</li></ul><div class="sub" style="margin-top:6px">Elke maandag begin je weer vanaf deze week. Wil je de basisweek zelf aanpassen? Vraag het aan Claude, dan krijg je een nieuwe versie van de app.</div></div>';
    h += '<div class="card"><h2>Installeren op je Samsung</h2><div class="sub"><b>Chrome:</b> ⋮ → Add to Home screen → Install. <b>Samsung Internet:</b> ☰ → Add page to → Home screen. Daarna werkt de app ook zonder internet.</div></div>';
    h += '<div class="card"><h2>Alles wissen</h2><div class="sub">Verwijdert planning en gegevens op deze telefoon. Maak eerst een back-up.</div><div class="btns"><button class="btn danger" data-act="wipeopen">Alles wissen</button></div></div>';
    h += '<div class="sub" style="text-align:center;margin:10px 0">Versie ' + VERSION + '</div>';
    return h;
  }

  // ---------- sheets ----------
  function openSheet(html, acts) { ui.sheet = { html, acts: acts || {} }; renderSheet(); }
  function closeSheet() { ui.sheet = null; renderSheet(); }
  function renderSheet() {
    const el = $('#sheet');
    if (!ui.sheet) { el.innerHTML = ''; return; }
    $('#toast').innerHTML = '';
    el.innerHTML = '<div class="sheet-bg" data-act="closebg"><div class="sheet" role="dialog" aria-modal="true">' + ui.sheet.html + '</div></div>';
  }

  // ✕ gemist
  function missSheet(id) {
    const s = E.get(S.sched, id); if (!s) return;
    const t = todayIso();
    const o = E.options(S.sched, id, t, horizon());
    const rec = E.recommend(s, o, S.sched, t);
    const st = E.streak(S.sched, t);
    let h = '<h2>' + esc(label(s)) + ' gemist</h2><div class="sub">Wat past het best? Jij beslist.</div>';
    if (st >= 2 && s.type !== 'STRETCH' && !E.T[s.type].fixed) h += '<div class="note warn">Je hebt de laatste dagen al meerdere sessies gemist of aangepast. Overslaan of een rustdag nemen is nu waarschijnlijk het verstandigst.</div>';
    const opts = [];
    if (o.shift) {
      const sh = o.shift; const lines = [];
      lines.push('Naar ' + fmtL(sh.date));
      for (const [ty, d] of sh.rehomed) lines.push(LABEL[ty] + ' gaat naar ' + fmt(d));
      for (const ty of sh.dropped) lines.push(LABEL[ty] + ' vervalt deze week');
      const nw = E.activeWarnings(sh.sched, t).filter((w) => !w.hard && !E.activeWarnings(S.sched, t).some((x) => x.key === w.key)).map((w) => wtext(w.key, sh.sched));
      opts.push({ k: 'shift', t: 'Verschuiven', lines, warns: nw, bal: balanceText(sh.sched, sh.date) });
    }
    if (o.light) opts.push({ k: 'light', t: 'Lichte versie', lines: [LIGHTTXT[s.type] || 'korter'] });
    const sk = [];
    if (o.skip.gap != null) sk.push('Volgende keer ' + fmt(o.skip.nxt) + ' (over ' + o.skip.gap + ' dagen)'); else sk.push('Geen volgende keer gepland in dit overzicht');
    opts.push({ k: 'skip', t: 'Overslaan', lines: sk, bal: balanceText(o.skip.sched, s.date) });
    for (const x of opts) {
      h += '<button class="opt' + (rec === x.k ? ' rec' : '') + '" data-act="applymiss" data-id="' + esc(id) + '" data-k="' + x.k + '"><div class="t">' + x.t + (rec === x.k ? '<span class="badge">Aanbevolen</span>' : '') + '</div><ul class="l">' +
        x.lines.map((l) => '<li>' + esc(l) + '</li>').join('') + '</ul>' + ((x.warns || []).map((w) => '<div class="note warn">' + esc(w) + '</div>').join('')) +
        (x.bal ? '<div class="note' + (x.bal.warn ? ' warn' : '') + '">' + esc(x.bal.text) + '</div>' : '') + '</button>';
    }
    if (E.T[s.type].fixed) h += '<div class="sub">MMA staat vast op dinsdag en donderdag, dus je kunt hem alleen overslaan.</div>';
    h += '<div class="btns"><button class="btn" data-act="closesheet">Annuleren</button></div>';
    openSheet(h);
  }
  function applyMiss(id, k) {
    const t = todayIso();
    const o = E.options(S.sched, id, t, horizon());
    if (!o[k]) return;
    const s = E.get(S.sched, id);
    snap(LABEL[s.type] + ': ' + (k === 'skip' ? 'overgeslagen' : k === 'shift' ? 'verschoven' : 'lichte versie'));
    S.sched = o[k].sched; save(); closeSheet(); render();
    toast(k === 'skip' ? 'Overgeslagen' : k === 'shift' ? 'Verschoven naar ' + fmt(o.shift.date) : 'Lichte versie ingesteld', true);
  }

  // ⇄ wissel
  function swapSheet(id) {
    const s = E.get(S.sched, id); if (!s) return;
    const t = todayIso(); const mon = E.mondayOf(s.date); const end = E.add(mon, 6);
    const cands = S.sched.filter((x) => x.status === 'planned' && x.date >= mon && x.date <= end && x.id !== id && !E.T[x.type].fixed && x.type !== s.type && x.type !== 'STRETCH' && !(x.date < t && s.date < t))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    let h = '<h2>' + esc(label(s)) + ' wisselen</h2><div class="sub">Kies met welke sessie van deze week je wisselt. Je ziet eerst wat het gevolg is.</div>';
    for (const x of cands) h += '<button class="opt" data-act="swapprev" data-a="' + esc(id) + '" data-b="' + esc(x.id) + '"><div class="t">Wissel met ' + esc(label(x)) + '</div><div class="sub">' + fmtL(x.date) + '</div></button>';
    if (!cands.length) h += '<div class="sub">Geen andere sessies om mee te wisselen deze week.</div>';
    h += '<button class="opt" data-act="extraopen" data-d="' + s.date + '"><div class="t">Iets anders / extra</div><div class="sub">Een andere activiteit toevoegen op ' + fmt(s.date) + '. Wil je deze sessie vervangen? Geef hem daarna een ✕.</div></button>';
    h += '<div class="btns"><button class="btn" data-act="closesheet">Annuleren</button></div>';
    openSheet(h);
  }
  function rawSwap(sched, aid, bid) {
    const n = clone(sched); const a = E.get(n, aid), b = E.get(n, bid);
    const d = a.date; a.date = b.date; b.date = d; a.swapped = b.swapped = true; return n;
  }
  function previewSheet(opts) {
    // opts: {title, intro, res:{sched,H,S,log}, raw, date, apply(sched, raw), confirmLabel}
    const t = todayIso();
    const lines = describeLog(opts.res.log);
    let h = '<h2>' + esc(opts.title) + '</h2>' + (opts.intro ? '<div class="sub">' + esc(opts.intro) + '</div>' : '');
    h += '<h3>Wat er verandert</h3><ul class="l">' + (opts.main || []).concat(lines).map((l) => '<li>' + esc(l) + '</li>').join('') + '</ul>';
    if (opts.res.H.length) h += opts.res.H.map((k) => '<div class="note bad">Regel overtreden: ' + esc(wtext(k, opts.res.sched)) + '</div>').join('');
    if (opts.res.S.length) h += opts.res.S.map((k) => '<div class="note warn">Let op: ' + esc(wtext(k.split('=')[0], opts.res.sched)) + '</div>').join('');
    const bal = balanceText(opts.res.sched, opts.date);
    h += '<div class="note' + (bal.warn ? ' warn' : '') + '">' + esc(bal.text) + '</div>';
    h += '<div class="btns"><button class="btn ok" data-act="previewgo" data-m="repaired">Bevestig</button>' +
      (lines.length || opts.res.H.length ? '<button class="btn" data-act="previewgo" data-m="raw">Toch allebei houden</button>' : '') +
      '<button class="btn" data-act="closesheet">Annuleren</button></div>' +
      (lines.length ? '<div class="sub" style="margin-top:6px">“Toch allebei houden” doet precies wat jij wilt en laat de rest van de week met rust.</div>' : '');
    ui.sheet = { html: h, acts: { preview: opts } }; renderSheet();
  }
  function swapPreview(aid, bid) {
    const t = todayIso();
    const a = E.get(S.sched, aid), b = E.get(S.sched, bid);
    const res = E.swap(S.sched, aid, bid, t, horizon());
    previewSheet({ title: LABEL[a.type] + ' ⇄ ' + LABEL[b.type], res, date: b.date, raw: rawSwap(S.sched, aid, bid),
      main: [label(a) + ' gaat naar ' + fmtL(b.date), label(b) + ' gaat naar ' + fmtL(a.date)],
      kind: 'swap', a: a.type, b: b.type, week: E.mondayOf(a.date), snapText: label(a) + ' ⇄ ' + label(b) });
  }

  // extra activiteit
  const extra = { name: '', mins: 45, heavy: 'normaal', legs: 'nee', date: null };
  function extraSheet(d) {
    extra.date = d; extra.name = ''; extra.mins = 45; extra.heavy = 'normaal'; extra.legs = 'nee';
    drawExtra();
  }
  function drawExtra() {
    const t = todayIso(); const mon = E.mondayOf(extra.date);
    const days = []; for (let i = 0; i < 7; i++) { const x = E.add(mon, i); if (x >= t || x === extra.date) days.push(x); }
    const seg = (key, opts) => '<div class="seg">' + opts.map(([v, n]) => '<button class="' + (extra[key] === v ? 'on' : '') + '" data-act="exset" data-k="' + key + '" data-v="' + v + '">' + n + '</button>').join('') + '</div>';
    let h = '<h2>Iets anders / extra</h2><div class="sub">Bijvoorbeeld voetbal, basketbal of een extra sessie. De app kijkt wat dit voor de rest van je week betekent.</div>' +
      '<div class="f"><span>Naam</span><input type="text" id="exName" value="' + esc(extra.name) + '" placeholder="bijv. voetbal"></div>' +
      '<div class="f"><span>Dag</span><select id="exDate">' + days.map((x) => '<option value="' + x + '"' + (x === extra.date ? ' selected' : '') + '>' + fmtL(x) + '</option>').join('') + '</select></div>' +
      '<div class="f"><span>Duur (minuten)</span><input type="number" id="exMins" min="5" max="300" value="' + extra.mins + '"></div>' +
      '<div class="f"><span>Zwaarte</span>' + seg('heavy', [['licht', 'Licht'], ['normaal', 'Normaal'], ['zwaar', 'Zwaar']]) + '</div>' +
      '<div class="f"><span>Zware beenbelasting?</span>' + seg('legs', [['ja', 'Ja'], ['nee', 'Nee']]) + '</div>' +
      '<div class="btns"><button class="btn ok" data-act="expreview">Bekijk gevolgen</button><button class="btn" data-act="closesheet">Annuleren</button></div>';
    ui.sheet = { html: h, acts: {} }; renderSheet();
  }
  function extraType() {
    if (extra.heavy === 'licht') return 'EXTRALIGHT';
    if (extra.heavy === 'zwaar') return extra.legs === 'ja' ? 'VOETBAL' : 'EXTRAHARD';
    return extra.legs === 'ja' ? 'EXTRALEGS' : 'EXTRAMED';
  }
  function extraPreview() {
    const t = todayIso();
    const type = extraType();
    const info = { name: extra.name.trim() || 'Extra activiteit', mins: extra.mins, heavy: extra.heavy, legs: extra.legs };
    const res = E.addExtra(S.sched, type, extra.date, t, horizon(), info);
    const raw = clone(S.sched); const row = clone(res.sched.find((x) => x.id === res.id));
    // 'raw': alleen de activiteit toevoegen, de rest niet aanpassen
    raw.push(Object.assign(row, { date: extra.date, orig: extra.date, status: 'planned', moves: 0 }));
    previewSheet({ title: info.name, res, date: extra.date, raw, main: [info.name + ' op ' + fmtL(extra.date) + ' (' + extra.heavy + (extra.legs === 'ja' ? ', benen' : '') + ')'],
      kind: 'extra', snapText: 'extra: ' + info.name });
  }

  // terugzetten naar basisweek
  function resetSheet() {
    const t = todayIso();
    const res = E.resetWeek(S.sched, t, horizon());
    const nv = E.newViolations(S.sched, res.sched);
    const lines = describeLog(res.log);
    const changed = res.sched.filter((s) => { const o = E.get(S.sched, s.id); return o && (o.date !== s.date || o.status !== s.status || o.light !== s.light); });
    let h = '<h2>Terug naar de basisweek</h2><div class="sub">Alleen dagen vanaf vandaag worden aangepast. Wat je al gedaan hebt blijft staan.</div>';
    h += '<h3>Wat er verandert</h3><ul class="l">' + (changed.length ? changed.map((s) => { const o = E.get(S.sched, s.id);
      return '<li>' + esc(label(s)) + ': ' + (s.status !== o.status ? (s.status === 'dropped' ? 'vervalt (zit al in je week)' : s.status) : fmt(o.date) + ' → ' + fmt(s.date)) + '</li>'; }).join('') : '<li>Niets, je week was al de basisweek.</li>') +
      lines.map((l) => '<li>' + esc(l) + '</li>').join('') + '</ul>';
    h += nv.H.map((k) => '<div class="note bad">Regel overtreden: ' + esc(wtext(k, res.sched)) + '</div>').join('');
    const bal = balanceText(res.sched, t); h += '<div class="note' + (bal.warn ? ' warn' : '') + '">' + esc(bal.text) + '</div>';
    h += '<div class="btns"><button class="btn ok" data-act="resetgo">Bevestig</button><button class="btn" data-act="closesheet">Annuleren</button></div>';
    ui.sheet = { html: h, acts: { reset: res } }; renderSheet();
  }

  // mobiliteit
  function mobSheet() {
    const h = '<h2>Nieuwe meting</h2><div class="sub">Vul in wat je gemeten hebt; leeg laten mag.</div>' +
      '<div class="f"><span>Knee-to-wall (cm, beste been)</span><input type="number" step="0.5" id="mbKnee" inputmode="decimal"></div>' +
      '<div class="f"><span>Diepe hurkzit-hold (seconden)</span><input type="number" id="mbHurk" inputmode="numeric"></div>' +
      '<div class="f"><span>Traphoogte (cm)</span><input type="number" step="0.5" id="mbTrap" inputmode="decimal"></div>' +
      '<div class="btns"><button class="btn ok" data-act="mobsave">Opslaan</button><button class="btn" data-act="closesheet">Annuleren</button></div>';
    openSheet(h);
  }

  // ---------- timer ----------
  let TM = null, tmTick = null, wake = null, ac = null;
  function audio() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
    if (ac && ac.state === 'suspended') { try { ac.resume(); } catch (e) { /* niets */ } }
    return ac;
  }
  function bell(kind) {
    const a = audio(); if (!a) return;
    const f0 = kind === 'end' ? 660 : 880; const now = a.currentTime;
    [1, 2.01, 2.97].forEach((m, i) => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine'; o.frequency.value = f0 * m;
      g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.35 / (i + 1), now + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
      o.connect(g); g.connect(a.destination); o.start(now); o.stop(now + 1.9);
    });
  }
  function beep() {
    const a = audio(); if (!a) return; const now = a.currentTime;
    const o = a.createOscillator(), g = a.createGain(); o.frequency.value = 1100; o.type = 'square';
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.12, now + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    o.connect(g); g.connect(a.destination); o.start(now); o.stop(now + 0.2);
  }
  const vib = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* niets */ } };
  async function getWake() { try { if ('wakeLock' in navigator) wake = await navigator.wakeLock.request('screen'); } catch (e) { wake = null; } }
  function relWake() { try { if (wake) wake.release(); } catch (e) { /* niets */ } wake = null; }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && TM && !TM.done) getWake(); });

  function roundSteps(rounds, work, rest) {
    const st = [];
    for (let r = 1; r <= rounds; r++) {
      st.push({ label: 'Ronde ' + r + ' van ' + rounds, secs: work, kind: 'work' });
      if (r < rounds && rest > 0) st.push({ label: 'Rust', secs: rest, kind: 'rest' });
    }
    return st;
  }
  function startTimer(title, steps, sid) {
    audio();
    TM = { title, steps, i: 0, t0: Date.now(), paused: false, pausedAt: 0, done: false, sid: sid || null, warned: -1 };
    getWake(); bell('start'); vib(200);
    ui.sheet = null; renderSheet();
    $('#timer').classList.remove('hidden'); drawTimer();
    clearInterval(tmTick); tmTick = setInterval(tickTimer, 200);
  }
  function stopTimer() {
    clearInterval(tmTick); tmTick = null; TM = null; relWake();
    $('#timer').classList.add('hidden'); $('#timer').innerHTML = '';
  }
  const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + pad(s % 60); };
  function tickTimer() {
    if (!TM || TM.done || TM.paused) return;
    const st = TM.steps[TM.i];
    const rem = st.secs - (Date.now() - TM.t0) / 1000;
    if (rem <= 10 && rem > 0 && st.kind === 'work' && st.secs > 20 && TM.warned !== TM.i) { TM.warned = TM.i; beep(); }
    if (rem <= 0) {
      TM.i++;
      if (TM.i >= TM.steps.length) { TM.done = true; bell('end'); vib([300, 150, 300]); clearInterval(tmTick); relWake(); drawTimer(); return; }
      TM.t0 = Date.now(); bell('start'); vib(150); drawTimer(); return;
    }
    const el = $('#tmBig'); if (el) el.textContent = mmss(rem);
    const bar = $('#tmBar'); if (bar) bar.style.width = Math.min(100, ((st.secs - rem) / st.secs) * 100) + '%';
  }
  function drawTimer() {
    const el = $('#timer'); if (!TM) return;
    el.className = TM.done ? 'fin' : (TM.steps[TM.i].kind === 'rest' ? 'rest' : '');
    if (TM.done) {
      el.innerHTML = '<div class="lab">' + esc(TM.title) + '</div><div class="big">Klaar ✓</div>' +
        '<div class="btns" style="justify-content:center">' + (TM.sid ? '<button class="btn ok" data-act="tmdone">✓ Sessie afvinken</button>' : '') + '<button class="btn" data-act="tmstop">Sluiten</button></div>';
      return;
    }
    const st = TM.steps[TM.i]; const rem = st.secs - (Date.now() - TM.t0) / 1000;
    el.innerHTML = '<div class="sub">' + esc(TM.title) + '</div><div class="lab">' + esc(st.label) + '</div><div class="big" id="tmBig">' + mmss(TM.paused ? st.secs - (TM.pausedAt - TM.t0) / 1000 : rem) + '</div>' +
      '<div class="bar" style="width:80%"><i id="tmBar" style="width:0%"></i></div>' +
      '<div class="sub">' + (TM.i + 1) + ' / ' + TM.steps.length + ' stappen · scherm blijft aan</div>' +
      '<div class="btns" style="justify-content:center"><button class="btn" data-act="tmpause">' + (TM.paused ? '▶ Hervat' : '⏸ Pauze') + '</button><button class="btn" data-act="tmskip">⏭ Volgende</button><button class="btn no" data-act="tmstop">■ Stop</button></div>';
  }
  function timerSheet(kind, sid) {
    if (kind === 'warm') return startTimer('Opwarmen', [{ label: 'Opwarmen', secs: 180, kind: 'work' }]);
    if (kind === 'hurk') return startTimer('Diepe hurkzit-hold', [{ label: 'Houd de hurkzit vast', secs: S.settings.hurk, kind: 'work' }]);
    if (kind === 'calf') {
      const st = [];
      for (const side of ['Links', 'Rechts']) { st.push({ label: side + ': kuit gestrekt', secs: 30, kind: 'work' }); st.push({ label: side + ': kuit gebogen', secs: 30, kind: 'work' }); }
      return startTimer('Kuitrek', st);
    }
    const s = E.get(S.sched, sid); const ty = s ? s.type : 'BAG';
    const def = ty === 'TYSON' ? { r: 6, w: 3, rest: 60 } : { r: 7, w: 3, rest: 60 };
    openSheet('<h2>Rondetimer</h2><div class="sub">Belletje aan het begin van elke ronde en elke rust. Het scherm blijft aan.</div>' +
      '<div class="f"><span>Aantal rondes</span><input type="number" id="trR" value="' + def.r + '" min="1" max="30"></div>' +
      '<div class="f"><span>Rondetijd (minuten)</span><input type="number" id="trW" value="' + def.w + '" min="0.5" step="0.5"></div>' +
      '<div class="f"><span>Rust (seconden)</span><input type="number" id="trS" value="' + def.rest + '" min="0" step="5"></div>' +
      '<div class="btns"><button class="btn ok" data-act="tmgo" data-id="' + esc(sid || '') + '">Start</button><button class="btn" data-act="closesheet">Annuleren</button></div>');
  }

  // ---------- agenda-bestand ----------
  function makeIcs() {
    const mon = E.mondayOf(todayIso());
    const byDay = { UPPER: 'MO', 'MMA-1': 'TU', BAG: 'WE', 'MMA-3': 'TH', ARMS: 'FR', SWIM: 'FR', LOWER: 'SA', TYSON: 'SU' };
    const names = Object.fromEntries(TIME_SLOTS);
    const dayIdx = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Training//NL//', 'CALSCALE:GREGORIAN'];
    for (const [k, tm] of Object.entries(S.settings.times)) {
      if (!tm || !byDay[k]) continue;
      const d = E.add(mon, dayIdx[byDay[k]]);
      const dt = d.replace(/-/g, '') + 'T' + tm.replace(':', '') + '00';
      L.push('BEGIN:VEVENT', 'UID:training-' + k + '@local', 'DTSTAMP:' + isoToday().replace(/-/g, '') + 'T000000Z', 'DTSTART:' + dt, 'DURATION:PT1H',
        'RRULE:FREQ=WEEKLY;BYDAY=' + byDay[k], 'SUMMARY:' + names[k], 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + names[k], 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
    }
    L.push('END:VCALENDAR'); return L.join('\r\n');
  }
  function download(name, text, type) {
    try {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' })); a.download = name;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); return true;
    } catch (e) { return false; }
  }
  async function copyText(txt) {
    try { await navigator.clipboard.writeText(txt); return true; } catch (e) { /* val terug */ }
    try { const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; }
  }
  function exportData() { return JSON.stringify({ app: 'training', exported: isoToday(), data: S }); }
  function importData(txt) {
    let o; try { o = JSON.parse(txt.trim()); } catch (e) { return 'Dit lijkt geen geldige back-up.'; }
    const d = o && o.data ? o.data : o;
    if (!d || d.v !== 1 || !Array.isArray(d.sched) || !d.start) return 'Dit lijkt geen geldige back-up.';
    S = d; ui.tab = 'today'; ui.day = null; housekeeping(); save(); return null;
  }

  // ---------- acties ----------
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]'); if (!el) return;
    const act = el.dataset.act;
    if (act === 'closebg') { if (ev.target === el) closeSheet(); return; }
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return;
    handle(act, el);
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target.closest('[data-act]'); if (!el) return;
    const act = el.dataset.act;
    if (act === 'morning') {
      const d = el.dataset.d; S.morning[d] = S.morning[d] || {}; S.morning[d][el.dataset.k] = el.checked ? 1 : 0; save(); render();
    } else if (act === 'time') { S.settings.times[el.dataset.k] = el.value; save(); }
    else if (act === 'goal') { const v = Math.max(1, Math.min(12, parseInt(el.value, 10) || 6)); S.settings.weekGoal = v; save(); }
    else if (act === 'video') { S.settings.video = el.value.trim(); save(); }
  });
  document.addEventListener('input', (ev) => {
    const id = ev.target.id;
    if (id === 'exName') extra.name = ev.target.value;
    else if (id === 'exMins') extra.mins = parseInt(ev.target.value, 10) || 45;
  });
  document.addEventListener('change', (ev) => {
    if (ev.target.id === 'exDate') { extra.date = ev.target.value; }
    if (ev.target.id === 'setupDate') ui.setupDate = ev.target.value;
  });

  function handle(act, el) {
    const t = todayIso(); const d = el.dataset;
    switch (act) {
      case 'tab': ui.tab = d.tab; if (d.tab === 'today') ui.day = null; ui.sheet = null; render(); window.scrollTo(0, 0); break;
      case 'today': ui.day = null; render(); break;
      case 'openday': ui.day = d.d; ui.tab = 'today'; render(); window.scrollTo(0, 0); break;
      case 'wk': { const cur = ui.weekStart || E.mondayOf(t); ui.weekStart = d.v === '0' ? null : E.add(cur, +d.v); render(); break; }
      case 'setup': {
        const v = ($('#setupDate') || {}).value || ui.setupDate; if (!v) return;
        const mon = E.mondayOf(v); S = fresh(mon); housekeeping(); save(); ui.setupDate = null; render(); break;
      }
      case 'import-setup': { const e = importData($('#setupImport').value); if (e) toast(e); else render(); break; }
      case 'done': { const s = E.get(S.sched, d.id); if (!s || s.date > t) return; snap(label(s) + ' afgevinkt'); s.status = 'done'; save(); render(); toast(label(s) + ' gedaan ✓', true); break; }
      case 'undone': { const s = E.get(S.sched, d.id); if (!s) return; snap(label(s) + ' terug naar gepland'); s.status = 'planned'; save(); render(); break; }
      case 'rate': { snap('beoordeling'); S.ratings[d.id] = S.ratings[d.id] === d.v ? undefined : d.v; if (!S.ratings[d.id]) delete S.ratings[d.id]; save(); render(); break; }
      case 'miss': missSheet(d.id); break;
      case 'applymiss': applyMiss(d.id, d.k); break;
      case 'closesheet': closeSheet(); break;
      case 'swapopen': swapSheet(d.id); break;
      case 'swapprev': swapPreview(d.a, d.b); break;
      case 'extraopen': extraSheet(d.d); break;
      case 'exset': extra[d.k] = d.v; extra.name = ($('#exName') || { value: extra.name }).value; extra.mins = parseInt(($('#exMins') || { value: extra.mins }).value, 10) || 45; if ($('#exDate')) extra.date = $('#exDate').value; drawExtra(); break;
      case 'expreview': extra.name = ($('#exName') || { value: '' }).value; extra.mins = parseInt(($('#exMins') || { value: 45 }).value, 10) || 45; if ($('#exDate')) extra.date = $('#exDate').value; extraPreview(); break;
      case 'previewgo': {
        const p = ui.sheet && ui.sheet.acts.preview; if (!p) return;
        snap(p.snapText || 'wijziging');
        S.sched = d.m === 'raw' ? p.raw : p.res.sched;
        if (p.kind === 'swap') {
          const sw = { week: p.week, a: p.a, b: p.b };
          if (!S.swaps.some((x) => x.week === sw.week && x.a === sw.a && x.b === sw.b)) S.swaps.push(sw);
        }
        save(); closeSheet(); render(); toast('Aangepast', true); break;
      }
      case 'resetopen': resetSheet(); break;
      case 'resetgo': { const r = ui.sheet && ui.sheet.acts.reset; if (!r) return; snap('terug naar basisweek'); S.sched = r.sched; save(); closeSheet(); render(); toast('Terug naar de basisweek', true); break; }
      case 'undo': undo(); break;
      case 'timer': timerSheet(d.kind, d.id); break;
      case 'tmgo': {
        const r = Math.max(1, parseInt($('#trR').value, 10) || 6), w = Math.max(0.5, parseFloat($('#trW').value) || 3) * 60, rs = Math.max(0, parseInt($('#trS').value, 10) || 0);
        startTimer('Rondetimer', roundSteps(r, w, rs), d.id || null); break;
      }
      case 'tmpause': if (TM) { if (TM.paused) { TM.t0 += Date.now() - TM.pausedAt; TM.paused = false; } else { TM.paused = true; TM.pausedAt = Date.now(); } drawTimer(); } break;
      case 'tmskip': if (TM) { TM.t0 = Date.now() - TM.steps[TM.i].secs * 1000 - 1; TM.paused = false; tickTimer(); } break;
      case 'tmstop': stopTimer(); break;
      case 'tmdone': { const sid = TM && TM.sid; stopTimer(); const s = sid && E.get(S.sched, sid); if (s && s.date <= t) { snap(label(s) + ' afgevinkt'); s.status = 'done'; save(); render(); toast(label(s) + ' gedaan ✓', true); } break; }
      case 'hurk': S.settings.hurk = Math.max(10, Math.min(180, S.settings.hurk + (+d.v))); save(); render(); break;
      case 'mobopen': mobSheet(); break;
      case 'mobsave': {
        const v = (id) => { const x = parseFloat($(id).value); return isNaN(x) ? null : x; };
        const m = { date: t, knee: v('#mbKnee'), hurk: v('#mbHurk'), trap: v('#mbTrap') };
        if (m.knee == null && m.hurk == null && m.trap == null) { toast('Vul minstens één waarde in'); return; }
        S.mobility = S.mobility.filter((x) => x.date !== t); S.mobility.push(m); save(); closeSheet(); render(); toast('Meting opgeslagen'); break;
      }
      case 'copyweek': copyText(weeklyText(d.w)).then((ok) => toast(ok ? 'Weekoverzicht gekopieerd' : 'Kopiëren lukt niet; selecteer de tekst zelf')); break;
      case 'ics': {
        if (!Object.values(S.settings.times).some(Boolean)) { toast('Vul eerst minstens één vaste tijd in'); return; }
        toast(download('training-herinneringen.ics', makeIcs(), 'text/calendar') ? 'Bestand opgeslagen. Open het met Samsung Calendar.' : 'Downloaden lukt niet in deze browser'); break;
      }
      case 'export': copyText(exportData()).then((ok) => toast(ok ? 'Back-up gekopieerd. Plak hem ergens veilig.' : 'Kopiëren lukt niet; gebruik “Bestand opslaan”')); break;
      case 'exportfile': toast(download('training-backup-' + t + '.json', exportData(), 'application/json') ? 'Back-up opgeslagen' : 'Downloaden lukt niet in deze browser'); break;
      case 'import': {
        const v = ($('#importBox') || {}).value || ''; if (!v.trim()) { toast('Plak eerst je back-up'); return; }
        openSheet('<h2>Back-up terugzetten?</h2><div class="sub">Dit vervangt alles wat nu in de app staat.</div><div class="btns"><button class="btn danger" data-act="importgo">Ja, terugzetten</button><button class="btn" data-act="closesheet">Annuleren</button></div>', { text: v });
        break;
      }
      case 'importgo': { const v = ui.sheet && ui.sheet.acts.text; const e = importData(v || ''); closeSheet(); if (e) toast(e); else { render(); toast('Back-up teruggezet'); } break; }
      case 'wipeopen': openSheet('<h2>Alles wissen?</h2><div class="sub">Dit kan niet ongedaan worden gemaakt.</div><div class="btns"><button class="btn danger" data-act="wipego">Ja, wis alles</button><button class="btn" data-act="closesheet">Annuleren</button></div>'); break;
      case 'wipego': try { localStorage.removeItem(KEY); } catch (e) { /* niets */ } mem = null; S = null; ui.sheet = null; ui.setupDate = null; render(); break;
      default: break;
    }
  }

  // ---------- startsein bij vaste tijd (alleen als de app open staat) ----------
  setInterval(() => {
    if (!S) return;
    const n = new Date(); const t = todayIso(); const hm = pad(n.getHours()) + ':' + pad(n.getMinutes());
    for (const s of dayItems(t)) {
      if (s.status !== 'planned') continue;
      const tm = S.settings.times[slotKey(s)];
      if (tm && tm === hm && S.notified[s.id + '@' + t] !== hm) {
        S.notified[s.id + '@' + t] = hm; save(); toast('Tijd voor: ' + label(s)); try { bell('start'); } catch (e) { /* niets */ } vib([200, 100, 200]);
      }
    }
  }, 20000);

  // ---------- start ----------
  function boot() {
    S = load();
    if (S) housekeeping();
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* niets */ }
    render();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* offline-modus niet beschikbaar */ });
  }
  window.__app = { get state() { return S; }, ui, render, handle, E };   // voor tests
  boot();
})();
