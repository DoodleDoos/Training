"""Python-referentie van de planlogica. De JavaScript-versie (engine.js) moet hier exact hetzelfde uitkomen."""
import copy, hashlib
from datetime import date, timedelta
from itertools import combinations
from collections import defaultdict

T = {
 'MMA':       dict(main=True,  hard=True,  lift=False, muscle=None,    prio=100, fixed=True),
 'VOETBAL':   dict(main=True,  hard=True,  lift=False, muscle='lower', prio=95),
 'LOWER':     dict(main=True,  hard=True,  lift=True,  muscle='lower', prio=90),
 'UPPER':     dict(main=True,  hard=True,  lift=True,  muscle='upper', prio=70),
 'EXTRAHARD': dict(main=True,  hard=True,  lift=False, muscle=None,    prio=65),
 'TYSON':     dict(main=True,  hard=False, lift=False, muscle=None,    prio=60),
 'EXTRALEGS': dict(main=True,  hard=False, lift=False, muscle='lower', prio=50),
 'EXTRAMED':  dict(main=True,  hard=False, lift=False, muscle=None,    prio=45),
 'ARMS':      dict(main=True,  hard=False, lift=True,  muscle='arms',  prio=40),
 'BAG':       dict(main=False, hard=False, lift=False, muscle=None,    prio=30),
 'EXTRALIGHT':dict(main=False, hard=False, lift=False, muscle=None,    prio=25),
 'STRETCH':   dict(main=False, hard=False, lift=False, muscle=None,    prio=20, addon=True),
 'SWIM':      dict(main=False, hard=False, lift=False, muscle=None,    prio=15),
}
TEMPLATE = [(0,'UPPER'),(0,'STRETCH'),(1,'MMA'),(2,'BAG'),(2,'STRETCH'),(3,'MMA'),
            (4,'ARMS'),(4,'SWIM'),(5,'LOWER'),(6,'TYSON'),(6,'STRETCH')]
WEEK_TEMPLATE = {}
for _, _t in TEMPLATE: WEEK_TEMPLATE[_t] = WEEK_TEMPLATE.get(_t, 0) + 1

def build(monday, weeks, first=None):
    out = []
    for w in range(weeks):
        for off, t in TEMPLATE:
            d = monday + timedelta(7*w + off)
            if first and d < first: continue
            out.append(dict(id=f"{t}-{d.isoformat()}", type=t, date=d, orig=d, status='planned', light=False, moves=0))
    return out

def get(sched, sid): return next(s for s in sched if s['id'] == sid)
def keystr(k): return '|'.join(k)
def kd(code, d): return (code, 'd', d.isoformat())
def ki(code, i): return (code, 'i', i)
def kp(code, a, b): return (code, 'p', ','.join(sorted((a, b))))

def involved(sched, key):
    code, kind, ref = key
    act = [s for s in sched if s['status'] in ('planned', 'done')]
    if code == '3 krachtdagen op rij':
        d0 = date.fromisoformat(ref); ds = {d0, d0+timedelta(1), d0+timedelta(2)}
        return [s for s in act if s['date'] in ds and T[s['type']]['lift']]
    if kind == 'd':
        d0 = date.fromisoformat(ref); return [s for s in act if s['date'] == d0]
    if kind == 'p':
        ids = ref.split(','); return [s for s in act if s['id'] in ids]
    return [s for s in act if s['id'] == ref]

def viol(sched):
    act = [s for s in sched if s['status'] in ('planned', 'done')]
    by = defaultdict(list)
    for s in act: by[s['date']].append(s)
    mma = [s['date'] for s in act if s['type'] == 'MMA']
    H = set(); S = {}
    for d, ss in by.items():
        mains = [s for s in ss if T[s['type']]['main']]
        lights = [s for s in ss if not T[s['type']]['main'] and not T[s['type']].get('addon')]
        if len(mains) > 1: H.add(kd('twee hoofdsessies op een dag', d))
        if len({x['type'] for x in ss}) < len(ss): H.add(kd('dezelfde sessie 2x op een dag', d))
        if any(s['type'] == 'MMA' for s in ss) and len(ss) > 1: H.add(kd('extra sessie op MMA-dag', d))
        if mains and len(lights) > 1: H.add(kd('hoofdsessie + 2 lichte sessies', d))
        if len(lights) > 2: H.add(kd('te veel lichte sessies', d))
        if any(s['type'] == 'LOWER' for s in ss) and len(ss) > 1: H.add(kd('extra sessie op beendag', d))
        if any(s['type'] in ('UPPER', 'TYSON') for s in ss) and lights: H.add(kd('zware sessie + extra losse sessie', d))
        if len([s for s in ss if s['type'] == 'STRETCH' and not s['light']]) > 1: H.add(kd('2x stretch op een dag', d))
    for s in act:
        t = s['type']
        if t == 'LOWER' and any(abs((s['date']-m).days) <= 1 for m in mma): H.add(ki('lower naast MMA', s['id']))
        if t == 'TYSON' and any(s['date'] == m for m in mma): H.add(ki('Tyson op MMA-dag', s['id']))
        if t == 'TYSON' and not s['light'] and any(abs((s['date']-m).days) == 1 for m in mma): S[ki('Tyson naast MMA', s['id'])] = 2
        if t == 'VOETBAL' and any(abs((s['date']-m).days) <= 1 for m in mma): S[ki('voetbal naast MMA', s['id'])] = 4
        if t == 'ARMS' and s['date'].weekday() not in (4, 5, 6): H.add(ki('armen alleen vr/za/zo', s['id']))
        if t == 'LOWER' and any((m - s['date']).days == 2 for m in mma): S[ki('lower 2 dagen voor MMA', s['id'])] = 4
    for a, b in combinations(act, 2):
        ma, mb = T[a['type']]['muscle'], T[b['type']]['muscle']
        if ma and ma == mb:
            dd = abs((a['date']-b['date']).days)
            if dd < 2: H.add(kp('zelfde spier binnen 48u', a['id'], b['id']))
            elif dd == 2: S[kp('zelfde spier maar 2 dagen rust', a['id'], b['id'])] = 2
    lift = {s['date'] for s in act if T[s['type']]['lift']}
    for d in lift:
        if d+timedelta(1) in lift and d+timedelta(2) in lift: H.add(kd('3 krachtdagen op rij', d))
    hard = {s['date'] for s in act if T[s['type']]['hard'] and not s['light']}
    for d in hard:
        if d+timedelta(1) in hard: S[kd('2 zware dagen op rij', d)] = 3
    for a in act:
        if a['type'] == 'UPPER':
            for b in act:
                if b['type'] == 'ARMS' and abs((a['date']-b['date']).days) == 1:
                    S[ki('upper en armen naast elkaar', a['id'])] = 2
    return H, S

def softsum(sched): return sum(viol(sched)[1].values())

def rehome(base, xid, from_date, window, horizon):
    for off in range(1, window+1):
        c = from_date + timedelta(off)
        if c > horizon: break
        n = copy.deepcopy(base); x = get(n, xid); x['status'] = 'planned'; x['date'] = c; x['moves'] += 1
        if not (viol(n)[0] - viol(base)[0]): return c, n
    return None, base

def shift_option(sched, sid, today, horizon, window=4):
    s = get(sched, sid)
    if s['moves'] >= 1 or T[s['type']].get('fixed'): return None
    prio = T[s['type']]['prio']
    start = max(today, s['date'])
    wend = s['date'] + timedelta(6 - s['date'].weekday())
    lim = min(horizon, wend)
    skipn = copy.deepcopy(sched); get(skipn, sid)['status'] = 'skipped'
    base_soft = softsum(skipn)
    H0 = viol(sched)[0]
    h_before = {k for k in H0 if sid not in {x['id'] for x in involved(sched, k)}}
    best = None
    for off in range(1, window+1):
        c = start + timedelta(off)
        if c > lim: break
        occ = [x for x in sched if x['status'] == 'planned' and x['date'] == c and x['id'] != sid
               and not T[x['type']].get('fixed') and T[x['type']]['prio'] < prio]
        subsets = [()] + [(o,) for o in occ] + list(combinations(occ, 2))
        for sub in subsets:
            n = copy.deepcopy(sched)
            for o in sub: get(n, o['id'])['status'] = 'removed'
            t = get(n, sid); t['date'] = c; t['moves'] += 1
            if viol(n)[0] - h_before: continue
            dropped = []; rehomed = []
            for o in sub:
                cc, n2 = rehome(n, o['id'], c, window, lim)
                if cc: n = n2; rehomed.append((o['type'], cc))
                else: get(n, o['id'])['status'] = 'dropped'; dropped.append(o['type'])
            if viol(n)[0] - h_before: continue
            soft = softsum(n) - base_soft
            cost = soft*2 + len(dropped)*3 + len(rehomed) + off
            cand = dict(date=c, offset=off, sched=n, dropped=dropped, rehomed=rehomed, soft=soft, cost=cost)
            if best is None or cost < best['cost']: best = cand
            if not sub: break
    return best

def next_same(sched, s):
    c = [x for x in sched if x['type'] == s['type'] and x['status'] == 'planned' and x['date'] > s['date'] and x['id'] != s['id']]
    return min(c, key=lambda x: x['date']) if c else None

def options(sched, sid, today, horizon):
    s = get(sched, sid); o = {}
    sk = copy.deepcopy(sched); get(sk, sid)['status'] = 'skipped'
    nx = next_same(sched, s)
    o['skip'] = dict(sched=sk, gap=(nx['date'] - s['date']).days if nx else None, nxt=nx['date'] if nx else None)
    if T[s['type']].get('fixed'): return o
    sh = shift_option(sched, sid, today, horizon)
    if sh: o['shift'] = sh
    if not s['light'] and s['type'] != 'SWIM' and s['date'] >= today:
        n = copy.deepcopy(sched); get(n, sid)['light'] = True
        o['light'] = dict(sched=n)
    return o

def streak(sched, today):
    return len([x for x in sched if 0 <= (today - x['orig']).days <= 3 and x['type'] != 'STRETCH'
                and (x['status'] == 'skipped' or x['moves'] > 0 or x['light'])])

def recommend(s, o, sched=None, today=None):
    p = T[s['type']]['prio']; sh = o.get('shift')
    if sched is not None and not T[s['type']].get('fixed') and streak(sched, today) >= 2 and s['type'] != 'STRETCH' and o.get('skip'):
        return 'skip'
    r = 'skip'
    if sh and sh['offset'] <= 3 and not sh['dropped'] and sh['soft'] <= 1: r = 'shift'
    elif sh and sh['offset'] <= 2 and p >= 70 and sh['soft'] <= 3 and not sh['rehomed']: r = 'shift'
    elif 'light' in o and p >= 40 and s['type'] != 'STRETCH': r = 'light'
    if r != 'shift' and sh and p >= 90 and sh['offset'] <= 4 and sh['soft'] <= 3 and not sh['rehomed']:
        if sched is not None and streak(sched, today) >= 2: return r
        return 'shift'
    return r

def repair(sched, today, horizon, protect=()):
    n = copy.deepcopy(sched); log = []; ignored = set()
    for _ in range(15):
        H = viol(n)[0] - ignored
        fixed_one = False
        for key in sorted(H, key=keystr):
            cands = [s for s in involved(n, key) if s['status'] == 'planned' and not T[s['type']].get('fixed')
                     and s['id'] not in protect and s['date'] >= today]
            if not cands:
                ignored.add(key); continue
            s = min(cands, key=lambda x: T[x['type']]['prio'])
            old = s['date']
            sh = shift_option(n, s['id'], today, horizon)
            if sh:
                n = sh['sched']; log.append(['shift', s['type'], old.isoformat(), sh['date'].isoformat()])
                for t, c in sh['rehomed']: log.append(['rehome', t, c.isoformat()])
                for t in sh['dropped']: log.append(['dropped', t])
            else:
                get(n, s['id'])['status'] = 'dropped'; log.append(['drop', s['type'], old.isoformat()])
            fixed_one = True; break
        if not fixed_one: break
    return n, log

def swap(sched, aid, bid, today, horizon):
    n = copy.deepcopy(sched); a = get(n, aid); b = get(n, bid)
    H0, S0 = viol(sched)
    a['date'], b['date'] = b['date'], a['date']
    a['swapped'] = b['swapped'] = True
    n, log = repair(n, today, horizon, protect={aid, bid})
    H, S = viol(n)
    return n, sorted(keystr(k) for k in H - H0), sorted(f"{keystr(k)}={v}" for k, v in S.items() if k not in S0), log

def add_extra(sched, t, d, today, horizon, name=None):
    n = copy.deepcopy(sched)
    sid = f"X{t}-{d.isoformat()}"; k = 2
    while any(x['id'] == sid for x in n): sid = f"X{t}-{d.isoformat()}.{k}"; k += 1
    n.append(dict(id=sid, type=t, date=d, orig=d, status='planned', light=False, moves=0, extra=True))
    H0, S0 = viol(sched)
    n, log = repair(n, today, horizon, protect={sid})
    H, S = viol(n)
    return n, sorted(keystr(k) for k in H - H0), sorted(f"{keystr(k)}={v}" for k, v in S.items() if k not in S0), log

def reset_week(sched, today, horizon):
    n = copy.deepcopy(sched)
    wk = today - timedelta(today.weekday()); wend = wk + timedelta(6)
    for s in n:
        if (s['status'] == 'planned' and wk <= s['orig'] <= wend and not s.get('extra')
                and s['orig'] >= today and s['date'] >= today):
            s['date'] = s['orig']; s['light'] = False; s['swapped'] = False; s['moves'] = 0
    for t, cnt in WEEK_TEMPLATE.items():
        wk_s = [s for s in n if wk <= s['date'] <= wend and s['type'] == t]
        resolved = len([s for s in wk_s if s['status'] == 'done'])
        planned = sorted([s for s in wk_s if s['status'] == 'planned' and not s.get('extra')], key=lambda x: x['date'])
        need = max(cnt - resolved, 0)
        for s in planned[need:]: s['status'] = 'dropped'
    n, log = repair(n, today, horizon)
    return n, log

def state_hash(sched):
    lines = [f"{s['id']}|{s['type']}|{s['date'].isoformat()}|{s['orig'].isoformat()}|{s['status']}|{int(bool(s['light']))}|{s['moves']}|{int(bool(s.get('swapped')))}|{int(bool(s.get('extra')))}" for s in sched]
    return hashlib.sha1('\n'.join(lines).encode()).hexdigest()
