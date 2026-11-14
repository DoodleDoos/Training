import json, sys
from datetime import timedelta
import sim as S, ref as R
out = []
for p_done, weeks, N, off in [(0.3,6,14,1000),(0.55,6,14,2000),(0.9,6,10,3000)]:
    for sd in range(N):
        rec = []
        st, pr = S.sim(off+sd, p_done, weeks, record=rec)
        assert not pr, pr
        out.append(dict(seed=off+sd, weeks=weeks+3, start=S.START.isoformat(), hor=S.HOR.isoformat(), ops=rec))
json.dump(out, open('vectors.json','w'))
print(len(out), 'reeksen,', sum(len(o['ops']) for o in out), 'acties')
