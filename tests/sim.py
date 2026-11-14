import sys, random, json
from datetime import date, timedelta
from collections import Counter
import ref as R
START = date(2026,11,16)
HOR = START + timedelta(34)
EXTRA_TYPES = ['VOETBAL','EXTRAHARD','EXTRALEGS','EXTRAMED','EXTRALIGHT']

def sim(seed, p_done, weeks, record=None):
    rng = random.Random(seed); sched = R.build(START, weeks+3)
    st = Counter(); problems = []
    d = START; end = START + timedelta(7*weeks)
    mma0 = {s['id']: s['date'] for s in sched if s['type']=='MMA'}
    maxday = 0
    def rec(op, **kw):
        if record is not None: record.append(dict(op=op, **kw, hash=R.state_hash(sched)))
    while d < end:
        it = 0
        while True:
            pl = [s for s in sched if s['date']==d and s['status']=='planned']
            if not pl or it > 14:
                for s in pl: s['status']='done'
                if pl: rec('doneall', ids=[x['id'] for x in pl])
                break
            it += 1
            s = sorted(pl, key=lambda x: (-R.T[x['type']]['prio'], x['id']))[0]; i = s['id']; fixed = R.T[s['type']].get('fixed')
            r = rng.random(); wend = d + timedelta(6-d.weekday())
            partners = [x for x in sched if x['status']=='planned' and d < x['date'] <= wend
                        and not R.T[x['type']].get('fixed') and x['type']!=s['type'] and x['type']!='STRETCH']
            q = 1-p_done
            if r < p_done:
                s['status']='done'; st['gedaan']+=1; rec('done', today=d.isoformat(), id=i)
            elif r < p_done+q*0.6:
                o = R.options(sched, i, d, HOR); recm = R.recommend(s, o, sched, d)
                ch = recm if rng.random()<0.7 else rng.choice(sorted(o))
                ns = o[ch]['sched']
                new = R.viol(ns)[0]-R.viol(sched)[0]
                if new: problems.append(('kruis',seed,d,s['type'],ch,sorted(R.keystr(k) for k in new)))
                sched = ns; st['kruis_'+ch]+=1
                if ch=='light' and R.get(sched,i)['status']=='planned': R.get(sched,i)['status']='done'
                rec('miss', today=d.isoformat(), id=i, choice=ch, rec=recm)
            elif r < p_done+q*0.8 and not fixed and partners:
                p = rng.choice(sorted(partners, key=lambda x:x['id']))
                ns,H,S,log = R.swap(sched,i,p['id'],d,HOR); st['wissel']+=1
                for k in H:
                    pass
                sched = ns; rec('swap', today=d.isoformat(), a=i, b=p['id'], H=H, S=S, log=log)
            elif r < p_done+q*0.9:
                sched,log = R.reset_week(sched,d,HOR); st['terugzetten']+=1
                rec('reset', today=d.isoformat(), log=log)
            elif True:
                t = rng.choice(EXTRA_TYPES)
                day = d + timedelta(rng.randint(0,3))
                if not any(x['type']==t and x['date']==day and x['status'] in('planned','done') for x in sched):
                    sched,H,S,log = R.add_extra(sched,t,day,d,HOR); st['extra']+=1
                    rec('extra', today=d.isoformat(), type=t, date=day.isoformat(), H=H, S=S, log=log)
                else:
                    s['status']='done'; st['gedaan']+=1; rec('done', today=d.isoformat(), id=i)
            for x in sched:
                if x['status']=='planned' and x['date']<d: problems.append(('verleden',seed,d,x['type'])); x['status']='done'
            cnt = Counter(x['date'] for x in sched if x['status'] in ('planned','done'))
            maxday = max(maxday, max(cnt.values()))
        d += timedelta(1)
    for k,v in mma0.items():
        if R.get(sched,k)['date']!=v: problems.append(('MMA verplaatst',seed,k))
    st['maxday']=maxday
    return st, problems

if __name__=='__main__':
    for p_done, weeks, N in [(0.3,6,60),(0.55,6,60),(0.9,6,60)]:
        tot=Counter(); allp=[]; md=0
        for sd in range(N):
            st,pr = sim(sd,p_done,weeks); md=max(md,st['maxday']); st.pop('maxday'); tot.update(st); allp+=pr
        print(f"{p_done:.0%}: acties {dict(tot)} | max/dag {md} | problemen {len(allp)}", Counter(p[0] for p in allp) if allp else '')
        for p in allp[:4]: print('  ', p)
