// Ball kids and the chase camera through a whole match (setup and bot as steps_audit.mjs): frames a player is within 0.7 m
// of a ball kid (and the closest), frames the chase camera is outside the arena or its line to the player crosses the outline.
// env: P0 P1 SECS NODODGE CAMOLD
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
    if (${!!E.NOPLANT}) window.__noPlant = true; window.__noPrep = ${!!E.NOPREP}; window.__noDodge = ${!!E.NODODGE}; window.__camOld = ${!!E.CAMOLD}; window.__noRushBlock = ${!!E.NORUSH}; window.__noRegrip = ${!!E.NOREGRIP}; window.__noSegLim = ${!!E.NOSEGLIM}; window.__noCross = ${!!E.NOCROSS}; window.__lrOld = ${!!E.LROLD}; window.__stepOld = ${!!E.STEPOLD}; window.__skOld = ${!!E.SKOLD}; window.__floorOld = ${!!E.FLOOROLD}; window.__noHinge = ${!!E.NOHINGE}; window.__noReachCap = ${!!E.NOREACHCAP}; window.__noTwoReach = ${!!E.NOTWOREACH}; window.__noSync = ${!!E.NOSYNC}; window.__backLift = ${E.NOSYNC ? 1 : +(E.BACKLIFT || 0.7)}; if (${JSON.stringify(E.BACKLIFT || '')}) window.__backLift = +${JSON.stringify(E.BACKLIFT || '1')}; if (${!!E.NOPOST}) window.__noPost = true; if (${+(E.PUSHW || 0)}) window.__pushW = ${+(E.PUSHW || 0)}; if (${+(E.PUSHCAP || 0)}) window.__pushCap = ${+(E.PUSHCAP || 0)}; if (${!!E.NOROOM}) window.__noRoom = true; A.set.controls = 'classic'; A.set.assist = 1; A.set.replays = 'off';
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Federer')}), p1: ix(${JSON.stringify(E.P1 || 'Nadal')}), format: 'atp3', difficulty: 1, cam: ${JSON.stringify(E.CAM || 'chase')}, intro: false });
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
    const { insideCourt } = await import('./js/staff.js'); const AR = g.arena, SC = AR.staffCtl, cam = g.gfx.camera;
    let near = 0, minD = 9, minAt = null, camOut = 0, camLine = 0, n = 0, dodges = 0; const nearAt = [];
    for (let f = 0; f < ${+(E.SECS || 150)} * 60; f++) {
      bot(); g.running = true; g.frame(1 / 60); g.running = false; n++;
      if (SC) { for (const k of SC.kids) { if (k.state === 'dodge' && !k._dc) { dodges++; k._dc = 1; } if (k.state === 'home') k._dc = 0;
        for (const p of SC.players) { const d = Math.hypot(k.x - p.x, k.z - p.z); if (d < minD) { minD = d; minAt = [+m.t.toFixed(2), m.phase, k.state]; } if (d < 0.7) { near++; if (nearAt.length < 12) nearAt.push([+m.t.toFixed(2), +d.toFixed(2), k.state]); } } } }
      if (g.camMode === 'chase' && (m.phase === 'live' || m.phase === 'over' || m.phase === 'between')) { const p = m.players[0], cx = cam.position.x, cz = cam.position.z;
        if (!insideCourt(AR, cx, cz, 0)) camOut++;
        else { for (let q = 1; q <= 10; q++) { const u = q / 10; if (!insideCourt(AR, cx + (p.x - cx) * u, cz + (p.z - cz) * u, 0)) { camLine++; break; } } } } }
    return JSON.stringify({ frames: n, kidNear07: near, minD: +minD.toFixed(2), minAt, nearAt, dodges, camOut, camLine, cam: g.camMode });
  })()`);
  console.log(r);
}
