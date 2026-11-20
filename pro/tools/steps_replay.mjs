// Replay jitter: plays a match with the audit's bot, and after each point won outright forces the replay of it, measuring
// every joint's frame-to-frame acceleration (second difference) through the replay against the same in live play. env: P0 P1
// SECS NREP FILM (saves replay frames to OUT)
// Animation audit of a whole human-v-computer match (the human side played through the real controls), per player:
// arms (segment swing per frame against the chest outside the contact instants, arm inside the trunk, chicken wing) and
// feet (a planted foot sliding, a foot into the court, a knee bending backwards, legs through each other, a foot lifted
// high while not running). Prints rates and the worst moments (time, phase) to film. env: P0 P1 SECS
export default async function ({ ev }) {
  const E = process.env;
  const r = await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js');
    const T = D.TOURNAMENTS.find(t => t.key === 'ao');
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    if (${!!E.NOPLANT}) window.__noPlant = true; window.__repOld = ${!!E.REPOLD}; window.__flashOld = ${!!E.FLASHOLD}; window.__noPrep = ${!!E.NOPREP}; window.__noOwnTb = ${!!E.NOOWNTB}; window.__farOld = ${!!E.FAROLD}; window.__noRushBlock = ${!!E.NORUSH}; window.__noRegrip = ${!!E.NOREGRIP}; window.__noSegLim = ${!!E.NOSEGLIM}; window.__noCross = ${!!E.NOCROSS}; window.__lrOld = ${!!E.LROLD}; window.__stepOld = ${!!E.STEPOLD}; window.__skOld = ${!!E.SKOLD}; window.__floorOld = ${!!E.FLOOROLD}; window.__noHinge = ${!!E.NOHINGE}; window.__noReachCap = ${!!E.NOREACHCAP}; window.__noTwoReach = ${!!E.NOTWOREACH}; window.__noSync = ${!!E.NOSYNC}; window.__backLift = ${E.NOSYNC ? 1 : +(E.BACKLIFT || 0.7)}; if (${JSON.stringify(E.BACKLIFT || '')}) window.__backLift = +${JSON.stringify(E.BACKLIFT || '1')}; if (${!!E.NOPOST}) window.__noPost = true; if (${+(E.PUSHW || 0)}) window.__pushW = ${+(E.PUSHW || 0)}; if (${+(E.PUSHCAP || 0)}) window.__pushCap = ${+(E.PUSHCAP || 0)}; if (${!!E.NOROOM}) window.__noRoom = true; A.set.controls = 'classic'; A.set.assist = 1; A.set.replays = 'off';
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Federer')}), p1: ix(${JSON.stringify(E.P1 || 'Nadal')}), format: 'atp3', difficulty: 1, cam: 'tv', intro: false });
    A.mode = 'match'; A.input.enabled = true; A.input.locked = true;
    const g = A.game, m = g.match; g.running = false; g.__R = g.gfx.render.bind(g.gfx); g.gfx.render = () => {};
    const TIMING = (await import('./js/sim.js')).TIMING;
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
    const S = {};
    const bot = () => { const inp = A.input, ph = m.phase, sv = m.score.server === 0;
      if (ph === 'ready' && sv) { if (m.phaseT > 0.9 && !S.t) { inp.pressed.add('Space'); S.t = 1; } S.srv = null; }
      else if (ph === 'toss' && sv) { S.t = 0; if (S.srv == null && m.ball.held < 0) { S.srv = m.tossIdeal - TIMING.serveSwing + gauss() * 0.02; inp.keys.clear(); const q = rnd(); if (q < 0.33) inp.keys.add('ArrowLeft'); else if (q < 0.66) inp.keys.add('ArrowRight'); } if (S.srv != null && m.t >= S.srv) { inp.pressed.add('Space'); S.srv = 1e9; } }
      else if (ph === 'live') { S.t = 0; const inc = m.incoming; if (inc && inc !== S.inc && m.ball.lastHit !== 0) { S.inc = inc; S.plan = { off: gauss() * 0.03, done: false }; inp.keys.clear(); const q = rnd(); if (q < 0.3) inp.keys.add('ArrowLeft'); else if (q < 0.6) inp.keys.add('ArrowRight'); const w = rnd(); if (w < 0.15) inp.keys.add('ArrowUp'); else if (w < 0.2) inp.keys.add('ArrowDown'); }
        const H = g.human; if (!${JSON.stringify(E.NOPRESS || '')} && S.plan && !S.plan.done && H && H.tau != null && H.tau <= 0.10 + S.plan.off) { inp.pressed.add('Space'); S.plan.done = true; } }
      else { inp.keys.clear(); S.t = 0; } };
    const V = g.fig[0].person.bones[Object.keys(g.fig[0].person.bones)[0]].position.constructor;
    const JN = ['Pelvis', 'Head', 'L_Forearm', 'R_Forearm', 'L_Hand', 'R_Hand', 'L_Foot', 'R_Foot', 'L_Calf', 'R_Calf'];
    const hist = [[], []], stats = { live: {}, rep: {} }, spikes = [], reps = []; let nRep = 0, lastHist = 0;
    const meas = (mode, tag) => { for (let i = 0; i < 2; i++) { const P = g.fig[i].person, cur = {}; for (const n of JN) { cur[n] = new V(); P.jointPos(n, cur[n]); } cur.rk = g.fig[i].racketHead.clone();
        const H = hist[i]; H.push(cur); if (H.length > 3) H.shift(); if (H.length < 3) continue;
        for (const n of [...JN, 'rk']) { const a = H[0][n], b = H[1][n], c = H[2][n], d2 = Math.hypot(c.x - 2 * b.x + a.x, c.y - 2 * b.y + a.y, c.z - 2 * b.z + a.z), d1 = b.distanceTo(c);
          const S = stats[mode][n] || (stats[mode][n] = { n: 0, big: 0, sum: 0 }); S.n++; S.sum += d2; if (d2 > 0.02) { S.big++; if (mode === 'rep' && spikes.length < 600) { const fg = g.fig[i], rp = g.replay; spikes.push([tag, i, n, +d2.toFixed(3), +d1.toFixed(3), rp ? rp.k : null, rp ? (rp.k !== g._lastK) : null, fg.uLast != null ? +fg.uLast.toFixed(3) : null, +(fg.swNow || 0).toFixed(2), +(fg.clipW || 0).toFixed(2), (fg.ecAng || []).map(x => +x.toFixed(2)), fg.lastSelSt ? fg.lastSelSt.kind + '/' + fg.lastSelSt.wing : '-', /Foot|Calf/.test(n) ? (fg.lockF || []).map(L => (L.on ? 'on' : 'off') + (L.step ? 's' + (+L.step.t.toFixed(2)) : '') + (L.toe ? 't' : '')).join(',') + ' pl' + (fg.pl ? (+(fg.plW || 0).toFixed(2)) : '-') + ' sl' + (+(fg.slideT || 0).toFixed(2)) + ' sp' + (+Math.hypot(g.replay ? 0 : 0, 0).toFixed(1)) : '']); } } } } };
    for (let f = 0; f < ${+(E.SECS || 240)} * 60 && nRep < ${+(E.NREP || 4)}; f++) {
      bot(); g.running = true; g.frame(1 / 60); g.running = false;
      if (g.replay) { meas('rep', 'rp' + nRep + ' t' + g.replay.t.toFixed(3)); g._lastK = g.replay.k; continue; }
      if (!g.replay && hist[0].length && g._wasRep) { hist[0].length = hist[1].length = 0; } g._wasRep = false;
      meas('live', '');
      // a point just won outright: show it again
      if (m.phase === 'over' && m.history && m.history.length > lastHist) { lastHist = m.history.length; const h = m.history[m.history.length - 1];
        const w = h.w != null ? h.w : h.winner != null ? h.winner : null;
        if (w != null && !g.pendingReplay && !g.replay) { g.pendingReplay = null; hist[0].length = hist[1].length = 0; g.startReplay({ winner: w, why: 'winner' }); if (g.replay) { nRep++; g._wasRep = true; reps.push({ w, frames: g.replay.frames.length }); } } } }
    const fmt = S => Object.fromEntries(Object.entries(S).map(([k, v]) => [k, { pctOver2cm: +(100 * v.big / v.n).toFixed(2), meanMm: +(1000 * v.sum / v.n).toFixed(2), n: v.n }]));
    return JSON.stringify({ reps, live: fmt(stats.live), rep: fmt(stats.rep), spikes });
  })()`);
  console.log(r);
}
