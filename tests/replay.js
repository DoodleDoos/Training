const E = require('../engine.js');
const crypto = require('crypto');
const fs = require('fs');
const vec = JSON.parse(fs.readFileSync(__dirname + '/vectors.json'));
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
let n = 0, bad = 0; const fails = [];
const j = JSON.stringify;
for (const run of vec) {
  let sched = E.build(run.start, run.weeks);
  for (const op of run.ops) {
    n++;
    let err = null;
    if (op.op === 'done') E.get(sched, op.id).status = 'done';
    else if (op.op === 'doneall') op.ids.forEach((i) => { E.get(sched, i).status = 'done'; });
    else if (op.op === 'miss') {
      const o = E.options(sched, op.id, op.today, run.hor);
      const s = E.get(sched, op.id);
      const rec = E.recommend(s, o, sched, op.today);
      if (rec !== op.rec) err = 'rec ' + rec + ' != ' + op.rec;
      sched = o[op.choice].sched;
      if (op.choice === 'light' && E.get(sched, op.id).status === 'planned') E.get(sched, op.id).status = 'done';
    } else if (op.op === 'swap') {
      const r = E.swap(sched, op.a, op.b, op.today, run.hor); sched = r.sched;
      if (j(r.H) !== j(op.H) || j(r.S) !== j(op.S) || j(r.log) !== j(op.log)) err = 'swap uitvoer';
    } else if (op.op === 'reset') {
      const r = E.resetWeek(sched, op.today, run.hor); sched = r.sched;
      if (j(r.log) !== j(op.log)) err = 'reset log';
    } else if (op.op === 'extra') {
      const r = E.addExtra(sched, op.type, op.date, op.today, run.hor); sched = r.sched;
      if (j(r.H) !== j(op.H) || j(r.S) !== j(op.S) || j(r.log) !== j(op.log)) err = 'extra uitvoer';
    }
    if (!err && sha(E.stateString(sched)) !== op.hash) err = 'hash';
    if (err) { bad++; if (fails.length < 5) fails.push({ seed: run.seed, op, err }); break; }
  }
}
console.log(`${vec.length} reeksen, ${n} acties vergeleken, ${bad} afwijkende reeksen`);
if (bad) { console.log(j(fails.slice(0, 3), null, 1)); process.exit(1); }
