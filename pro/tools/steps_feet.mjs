// Raw foot traces (ankle and toe heights, both players, every frame) through a real match, for tuning the footstep detector in audio.js. env: SECS OUT (match setup and bot as steps_audit.mjs)
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
    if (${!!E.NOPLANT}) window.__noPlant = true; window.__noPrep = ${!!E.NOPREP}; window.__noRushBlock = ${!!E.NORUSH}; window.__noRegrip = ${!!E.NOREGRIP}; window.__noSegLim = ${!!E.NOSEGLIM}; window.__noCross = ${!!E.NOCROSS}; window.__lrOld = ${!!E.LROLD}; window.__stepOld = ${!!E.STEPOLD}; window.__skOld = ${!!E.SKOLD}; window.__floorOld = ${!!E.FLOOROLD}; window.__noHinge = ${!!E.NOHINGE}; window.__noReachCap = ${!!E.NOREACHCAP}; window.__noTwoReach = ${!!E.NOTWOREACH}; window.__noSync = ${!!E.NOSYNC}; window.__backLift = ${E.NOSYNC ? 1 : +(E.BACKLIFT || 0.7)}; if (${JSON.stringify(E.BACKLIFT || '')}) window.__backLift = +${JSON.stringify(E.BACKLIFT || '1')}; if (${!!E.NOPOST}) window.__noPost = true; if (${+(E.PUSHW || 0)}) window.__pushW = ${+(E.PUSHW || 0)}; if (${+(E.PUSHCAP || 0)}) window.__pushCap = ${+(E.PUSHCAP || 0)}; if (${!!E.NOROOM}) window.__noRoom = true; A.set.controls = 'classic'; A.set.assist = 1; A.set.replays = 'off';
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
    const tr = [[], []], old = [{ dec: 0, rnd: 0, decT: [] }, { dec: 0, rnd: 0, decT: [] }], pv = [0, 0];
    const J = {}; for (const nm of ['L_Foot', 'R_Foot', 'L_Toe0', 'R_Toe0']) J[nm] = new V();
    for (let f = 0; f < ${+(E.SECS || 40)} * 60; f++) {
      bot(); g.running = true; g.frame(1 / 60); g.running = false;
      for (let i = 0; i < 2; i++) { const p = m.players[i], P = g.fig[i].person, v = Math.hypot(p.vx, p.vz), dec = (pv[i] - v) * 60; pv[i] = v;
        if (dec > 9) { old[i].dec++; if (old[i].decT.length < 40) old[i].decT.push([+m.t.toFixed(2), +v.toFixed(2), +dec.toFixed(1), m.phase]); } if (v > 3) old[i].rnd += 1.2 / 60;
        for (const nm in J) P.jointPos(nm, J[nm]);
        tr[i].push([+m.t.toFixed(3), m.phase[0], +p.vx.toFixed(2), +p.vz.toFixed(2), +p.x.toFixed(3), +p.z.toFixed(3), ...['L', 'R'].flatMap(s => [+J[s + '_Foot'].x.toFixed(3), +J[s + '_Foot'].y.toFixed(3), +J[s + '_Foot'].z.toFixed(3), +J[s + '_Toe0'].y.toFixed(3)])]); } }
    return JSON.stringify({ old, tr });
  })()`);
  { const fs = await import('fs'); fs.writeFileSync(E.OUT || '/tmp/rally-work2/feet.json', r); console.log('wrote', r.length); }
}
