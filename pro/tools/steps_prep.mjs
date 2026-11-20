// Long preps and arms pushed out in front (setup and bot as steps_audit.mjs, NETRUSH=1 sends the human to the net): logs
// every human stroke held in its wind-up over 0.8 s (phase, plan, ball) and frames with both arms straight out in front
// at chest height, by stroke kind and stage. env: P0 P1 SECS NETRUSH
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
    const V = g.fig[0].person.bones[Object.keys(g.fig[0].person.bones)[0]].position.constructor, P = g.fig[0].person, p0 = m.players[0];
    const J = {}; for (const nm of ['Neck', 'Pelvis', 'L_UpperArm', 'R_UpperArm', 'L_Forearm', 'R_Forearm', 'L_Hand', 'R_Hand']) J[nm] = new V();
    const longs = [], out = {}, seenLong = new Set(); let n = 0;
    const ang = (a, b, c) => { const u = a.clone().sub(b).normalize(), v = c.clone().sub(b).normalize(); return Math.acos(Math.max(-1, Math.min(1, u.dot(v)))) * 57.3; };
    g.fig[0].dbgOn = true; window.__farOld = ${!!E.FAROLD};
    for (let f = 0; f < ${+(E.SECS || 150)} * 60; f++) {
      if (${!!E.NETRUSH} && g.human && m.phase === 'live') { g.human.coach.goNet = true; p0.approach = true; }
      bot(); g.running = true; g.frame(1 / 60); g.running = false; n++;
      const st = p0.stroke;
      if (st && st.tc == null && m.t - st.t0 > 0.8 && !seenLong.has(st)) { seenLong.add(st); const b = m.ball;
        longs.push({ t: +m.t.toFixed(2), kind: st.kind, wing: st.wing, held: +(m.t - st.t0).toFixed(2), phase: m.phase, tcPlan: st.tcPlan != null ? +(st.tcPlan - m.t).toFixed(2) : null, cpPlan: st.cpPlan ? [+st.cpPlan.x.toFixed(1), +st.cpPlan.y.toFixed(1), +st.cpPlan.z.toFixed(1)] : null, ball: [+b.x.toFixed(1), +b.y.toFixed(1), +b.z.toFixed(1)], bvis: b.visible, lastHit: b.lastHit, p: [+p0.x.toFixed(1), +p0.z.toFixed(1)], tau: g.human && g.human.tau != null ? +g.human.tau.toFixed(2) : null }); }
      if (!st) continue;
      for (const nm in J) P.jointPos(nm, J[nm]);
      const up = J.Neck.clone().sub(J.Pelvis).normalize(), rt = J.R_UpperArm.clone().sub(J.L_UpperArm); rt.addScaledVector(up, -rt.dot(up)).normalize(); const fw = up.clone().cross(rt);
      const mid = J.L_UpperArm.clone().add(J.R_UpperArm).multiplyScalar(0.5);
      const fR = J.R_Hand.clone().sub(mid).dot(fw), fL = J.L_Hand.clone().sub(mid).dot(fw);
      const sR = ang(J.R_UpperArm, J.R_Forearm, J.R_Hand), sL = ang(J.L_UpperArm, J.L_Forearm, J.L_Hand);
      const stage = (st.__dk || st.kind) + '/' + st.wing + ' ' + (st.tc == null ? 'prep' : m.t < st.tc ? 'swing' : 'after');
      const o = out[stage] || (out[stage] = { n: 0, both: 0, ex: null }); o.n++;
      if (fR > 0.42 && fL > 0.42 && sR > 150 && sL > 150 && J.R_Hand.y > 0.95 && J.L_Hand.y > 0.95) { o.both++; if (!o.ex) o.ex = { t: +m.t.toFixed(2), phase: m.phase, fR: +fR.toFixed(2), fL: +fL.toFixed(2), gripW: +(g.fig[0].gripW || 0).toFixed(2) }; }
      if (/^volley/.test(stage)) { const sh = g.fig[0].shiftNow; (window.__vl || (window.__vl = [])).length < 400 && window.__vl.push([stage.split(' ')[0], stage.split(' ')[1], st.tc != null ? +(m.t - st.tc).toFixed(2) : null, +fR.toFixed(2), +fL.toFixed(2), Math.round(sR), Math.round(sL), +(g.fig[0].gripW || 0).toFixed(2), sh ? [sh.x, sh.y, sh.z, sh.gx, sh.gy, sh.gz] : null]); } }
    for (const k in out) out[k].pct = +(100 * out[k].both / out[k].n).toFixed(1);
    return JSON.stringify({ frames: n, longs, armsOut: out, vl: window.__vl || [] });
  })()`);
  console.log(r);
}
