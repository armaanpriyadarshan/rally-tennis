// Watch a real human-v-computer match the way he sees it from the broadcast (CAM=tv) or chase (CAM=chase) camera: the
// human side is driven through the real controls (Space as the ball arrives, random arrows, toss and serve), frames are
// rendered every STEP sim frames (FPS 60/STEP) in play and every SLOW frames between points, and each capture is saved
// with both players' screen boxes so close-ups can be cut from it. env: P0 P1 CAM POINTS STEP SLOW OUT W H VEN DIFF
import fs from 'node:fs';
export default async function ({ ev, shot }) {
  const E = process.env, OUT = E.OUT || '/tmp/rally-work2/watch', POINTS = +(E.POINTS || 6), STEP = +(E.STEP || 6), SLOW = +(E.SLOW || 30);
  fs.mkdirSync(OUT, { recursive: true });
  console.log(await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js');
    const T = D.TOURNAMENTS.find(t => t.key === ${JSON.stringify(E.VEN || 'ao')}) || D.TOURNAMENTS[0];
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    document.querySelectorAll('#ui,#shade,#overlay,#wipe').forEach(e => e.style.display = 'none');
    A.set.controls = 'classic'; A.set.assist = 1; A.set.replays = 'off'; window.__noDodge = ${!!E.NODODGE}; window.__camOld = ${!!E.CAMOLD}; window.__noPrep = ${!!E.NOPREP}; window.__noRushBlock = ${!!E.NORUSH};
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Federer')}), p1: ix(${JSON.stringify(E.P1 || 'Nadal')}), format: 'atp3', difficulty: ${+(E.DIFF ?? 1)}, cam: ${JSON.stringify(E.CAM || 'tv')}, intro: false });
    A.mode = 'match'; A.paused = false; A.input.enabled = true; A.input.locked = true; A.covered = false;
    const g = A.game; g.running = false; g._r = g.gfx.render.bind(g.gfx); g.gfx.render = () => {};
    // the human-like bot (as tools/classicbot.mjs): presses through A.input
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
    const S = { srvAt: null, lastInc: null, plan: null, points: 0 };
    const TIMING = (await import('./js/sim.js')).TIMING;
    if (${!!E.OCC}) window.__T3 = await import('three'); window.__IC = (await import('./js/staff.js')).insideCourt;
    window.__watch = { g, S, step(n) {
      const m = g.match, inp = A.input, i = 0;
      for (let k = 0; k < n; k++) {
        const ph = m.phase, serving = m.score.server === i;
        if (ph === 'ready' && serving) { if (m.phaseT > 0.9 && !S.tossed) { inp.pressed.add('Space'); S.tossed = true; } S.srvAt = null; }
        else if (ph === 'toss' && serving) { S.tossed = false;
          if (S.srvAt == null && m.ball.held < 0) { S.srvAt = m.tossIdeal - TIMING.serveSwing + gauss() * 0.02; inp.keys.clear(); const r = rnd(); if (r < 0.33) inp.keys.add('ArrowLeft'); else if (r < 0.66) inp.keys.add('ArrowRight'); }
          if (S.srvAt != null && m.t >= S.srvAt) { inp.pressed.add('Space'); S.srvAt = 1e9; } }
        else if (ph === 'live') { S.tossed = false; const inc = m.incoming;
          if (inc && inc !== S.lastInc && m.ball.lastHit !== i) { S.lastInc = inc; S.plan = { off: gauss() * 0.03, done: false }; inp.keys.clear(); const r = rnd(); if (r < 0.3) inp.keys.add('ArrowLeft'); else if (r < 0.6) inp.keys.add('ArrowRight'); const q = rnd(); if (q < 0.2) inp.keys.add('ArrowUp'); else if (q < 0.26) inp.keys.add('ArrowDown'); }
          const H = g.human; if (S.plan && !S.plan.done && H && H.tau != null && H.tau <= 0.10 + S.plan.off) { inp.pressed.add('Space'); S.plan.done = true; } }
        else { inp.keys.clear(); S.tossed = false; }
        const before = m.history ? m.history.length : 0;
        if (${JSON.stringify(E.NETRUSH || '')} && g.human && g.match.phase === 'live') { g.human.coach.goNet = true; g.match.players[0].approach = true; }
        g.running = true; g.frame(1 / 60); g.running = false;
        // KIDS (printed with NOSHOT): players within 0.7 m of a ball kid, the closest, kids' dodges; chase camera outside the arena or its line to him crossing it
        { const SC = g.arena.staffCtl, KM = window.__KM || (window.__KM = { near: 0, minD: 9, at: null, camOut: 0, dodges: 0 });
          if (SC) for (const k of SC.kids) { if (k.state === 'dodge' && !k._dc) { KM.dodges++; k._dc = 1; } if (k.state === 'home') k._dc = 0;
            for (const p of SC.players) { const d = Math.hypot(k.x - p.x, k.z - p.z); if (d < KM.minD) { KM.minD = +d.toFixed(2); KM.at = [+m.t.toFixed(2), m.phase, k.state]; } if (d < 0.7) KM.near++; } }
          if (window.__IC && g.camMode === 'chase') { const c = g.gfx.camera.position, p0 = m.players[0]; let bad = !window.__IC(g.arena, c.x, c.z, 0);
            for (let q = 1; q <= 10 && !bad; q++) { const u = q / 10; bad = !window.__IC(g.arena, c.x + (p0.x - c.x) * u, c.z + (p0.z - c.z) * u, 0); } if (bad) { KM.camOut++; if (!KM.camAt) KM.camAt = +m.t.toFixed(2); } } }
        if (m.history && m.history.length > before) S.points++;
      }
      g._r(1 / 60);
      // where each player is on screen (head to feet), for close-ups
      const cam = g.gfx.camera, V = cam.position.constructor, W = innerWidth, Hh = innerHeight, boxes = [];
      for (let j = 0; j < 2; j++) { const P = g.fig[j].person, pts = ['Head', 'L_Foot', 'R_Foot', 'L_Hand', 'R_Hand', 'Pelvis'].map(nm => { const v = new V(); P.jointPos(nm, v); v.project(cam); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * Hh, v.z]; });
        const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]); boxes.push({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), vis: pts.every(q => q[2] < 1) }); }
      const st = j => { const p = m.players[j], s = p.stroke; return s ? s.kind + '/' + (s.wing || '') + (s.tc != null ? ' u ' + (m.t - s.tc).toFixed(2) : ' prep') : (Math.hypot(p.vx, p.vz) > 0.5 ? 'move ' + Math.hypot(p.vx, p.vz).toFixed(1) : '-'); };
      // OCC: what the camera's line to the human player's chest and hips passes through first, if it is not himself
      let occ = null;
      if (${!!E.OCC}) { const T3 = window.__T3, rc = window.__rc || (window.__rc = new T3.Raycaster()), P0 = g.fig[0].person, own = g.fig[0].root || P0.root;
        for (const jn of ['Spine2', 'Pelvis', 'L_Calf', 'R_Calf', 'L_Foot', 'R_Foot']) { const v = new V(); P0.jointPos(jn, v); const o = cam.position.clone(), d = v.clone().sub(o), L = d.length(); rc.set(o, d.normalize()); rc.far = L - 0.3;
          const hits = rc.intersectObjects(g.gfx.scene.children, true).filter(h => { let q = h.object; while (q) { if (q === own || q === P0.root || q === g.fig[0].racket) return false; q = q.parent; } return h.object.visible && !h.object.isPoints && !h.object.isSprite && h.object.material && !h.object.material.transparent; });
          if (hits.length) { const h = hits[0]; let q = h.object, chain = []; while (q && chain.length < 5) { chain.push((q.name || q.type) + (q.geometry && q.geometry.parameters ? JSON.stringify(Object.fromEntries(Object.entries(q.geometry.parameters).slice(0, 3).map(([a, b]) => [a, typeof b === 'number' ? +b.toFixed(2) : b]))) : '')); q = q.parent; }
            occ = { j: jn, d: +h.distance.toFixed(2), at: [h.point.x, h.point.y, h.point.z].map(x => +x.toFixed(2)), cam: [cam.position.x, cam.position.y, cam.position.z].map(x => +x.toFixed(2)), chain: chain.join(' < ') }; break; } } }
      return { occ, z0: +Math.abs(m.players[0].z).toFixed(2), x0: +m.players[0].x.toFixed(2), spd0: +Math.hypot(m.players[0].vx, m.players[0].vz).toFixed(1), hip0: +(g.fig[0].pelvisY / g.fig[0].D.hipY).toFixed(2), t: +m.t.toFixed(3), phase: m.phase, pts: S.points, boxes, s0: st(0), s1: st(1), score: m.score.p.join('-') + ' g ' + m.score.g.join('-') };
    } };
    return 'ok ' + g.camMode;
  })()`));
  const meta = []; let k = 0; const FC = { n: 0, out: 0, occ: 0, ex: [] };
  for (let guard = 0; guard < 20000; guard++) {
    const ph = await ev(`window.__watch.g.match.phase`);
    const r = await ev(`window.__watch.step(${ph === 'live' || ph === 'toss' ? STEP : SLOW})`);
    if (typeof r === 'string') { console.log(r); break; }
    if (E.NOSHOT) { if (r.occ) console.log('OCC', r.t, r.phase, r.s0, JSON.stringify(r.occ));
      if ((E.FPH || 'live,toss').split(',').includes(r.phase)) { const b = r.boxes[0], b1 = r.boxes[1], Wd = 1600, Hd = 900; FC.n++; if (E.CAM === 'tv') { const o1 = !b1.vis || b1.x0 < 0 || b1.x1 > Wd || b1.y0 < 0 || b1.y1 > Hd; if (o1) FC.out1 = (FC.out1 || 0) + 1; } const out = !b.vis || b.x0 < 0 || b.x1 > Wd || b.y0 < 0 || b.y1 > Hd; if (out) { FC.out++; if (FC.ex.length < 6) FC.ex.push(r.t + ' ' + r.s0 + ' box ' + [b.x0, b.y0, b.x1, b.y1].map(x => Math.round(x)).join(',')); } if (r.occ) FC.occ++; }
      k++; } else { const f = `${OUT}/f${String(k).padStart(5, '0')}.jpg`; await shot(f); meta.push({ f, ...r }); k++; }
    if (r.pts >= POINTS) break;
  }
  if (E.NOSHOT) console.log('FRAMING', JSON.stringify(FC));
  if (E.NOSHOT) console.log('KIDS', await ev('JSON.stringify(window.__KM || null)'));
  fs.writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta));
  console.log('captured', k, 'frames over', meta.length ? meta[meta.length - 1].t.toFixed(1) : 0, 's of play');
}
