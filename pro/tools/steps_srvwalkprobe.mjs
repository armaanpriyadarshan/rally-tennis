// The server's walk along the baseline before his serve, measured every frame (no pictures): the human holds the arrows in a
// fixed script of long walks, short taps and stops, both ways, and for each player we count the legs passing through each other,
// the legs crossing, a planted toe's drift (per stance: count, median, 90th pct, max m), the steps in the 1.5 s after each
// stop (lifts@last, c: frames with the ankles under 10 cm apart), the lower toe's speed while walking (frames, median, 90th pct m/s, share over 0.3 m/s), steps taken after standing still 0.35 s, and the stance knee's bend while walking.
// env: NAMES (players, comma separated; each serves against Alcaraz or Sinner), RSEED, FLAGS (a,b=1 → globalThis.__a ...)
// TRACE=1 (per frame: yaw against the way he goes, gait weights, strollK, lower toe and its speed, phase), TRACE2=1 (both feet
// drawn and aimed at, world), TRACE3=1 (plants and steps of play's footwork round the start and first stop), TRACE4=1 (phase,
// the walk's foot pitch, ankle and toe heights, the walk's plants and play's) — for the first player, printed in the result
export default async function ({ ev }) {
  const E = process.env, names = (E.NAMES || 'Sinner,Agassi,Becker,Djokovic,Kyrgios,Nadal').split(',');
  // [key, seconds]: '' = nothing held
  const script = [['', 0.5], ['ArrowLeft', 1.2], ['', 0.6], ['ArrowRight', 0.4], ['', 0.5], ['ArrowRight', 1.6], ['', 0.8], ['ArrowLeft', 0.25], ['', 0.6], ['ArrowLeft', 2.0], ['', 0.4], ['ArrowRight', 0.8], ['ArrowLeft', 0.8], ['', 1.0]];
  for (const nm of names) {
    const r = await ev(`(async () => {
      const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === 'ao');
      const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
      let rs = ${+(E.RSEED || 11)}; Math.random = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
      Object.assign(globalThis, ${JSON.stringify(Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; })))});
      const opp = ${JSON.stringify(nm)} === 'Sinner' ? 'Alcaraz' : 'Sinner';
      await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(nm)}), p1: ix(opp), format: 'atp3', difficulty: 1, cam: 'tv', intro: false, seed: ${+(E.RSEED || 11)}, firstServer: 0 });
      A.mode = 'match'; A.input.enabled = true; A.input.locked = true;
      const g = A.game, m = g.match; g.running = false; g.audio = null; g.gfx.render = () => {};
      for (let f = 0; f < 600 && m.phase !== 'ready'; f++) { g.running = true; g.frame(1 / 60); g.running = false; }
      for (let f = 0; f < 60; f++) { g.running = true; g.frame(1 / 60); g.running = false; }
      const fg = g.fig[0], P = fg.person, V = P.bones['Bip01_Pelvis'].position.constructor, v = () => new V();
      const J = {}, NM = ['Pelvis', 'L_Thigh', 'R_Thigh', 'L_Calf', 'R_Calf', 'L_Foot', 'R_Foot', 'L_Toe0', 'R_Toe0'];
      const segD = (a0, a1, b0, b1) => { let best = 9; for (let k = 0; k <= 8; k++) { const p = v().lerpVectors(a0, a1, k / 8); const ab = v().subVectors(b1, b0), tt = Math.max(0, Math.min(1, v().subVectors(p, b0).dot(ab) / Math.max(1e-6, ab.lengthSq()))); best = Math.min(best, p.distanceTo(v().copy(b0).addScaledVector(ab, tt))); } return best; };
      const ang = (a, k, c) => 180 - v().subVectors(a, k).angleTo(v().subVectors(c, k)) * 57.3;
      const o = { frames: 0, through: 0, crossed: 0, pops: 0, stepsStill: 0, kneeWalk: [], worst: [], phases: {} };
      let prev = null, still = 0, upPrev = [false, false], prevSpd = 0, lastMove = null; const run = [null, null], stops = []; o.stances = []; o.skate = []; o.trace = []; o.trace2 = []; o.trace3 = []; o.trace4 = []; let prevLo = -1, prevToe = null;
      const script = ${JSON.stringify(script)};
      for (const [key, secs] of script) for (let f = 0; f < Math.round(secs * 60); f++) {
        A.input.keys.clear(); if (key) A.input.keys.add(key);
        g.running = true; g.frame(1 / 60); g.running = false;
        o.phases[m.phase] = (o.phases[m.phase] || 0) + 1; if (m.phase !== 'ready') continue;
        for (const n of NM) { J[n] = v(); P.bones['Bip01_' + n].getWorldPosition(J[n]); }
        const p = m.players[0], spd = Math.hypot(p.vx, p.vz); o.frames++;
        still = spd < 0.02 ? still + 1 / 60 : 0;
        const shin = segD(J.L_Calf, J.L_Foot, J.R_Calf, J.R_Foot), knee = segD(v().lerpVectors(J.L_Thigh, J.L_Calf, 0.5), J.L_Calf, v().lerpVectors(J.R_Thigh, J.R_Calf, 0.5), J.R_Calf), dmin = Math.min(shin, knee);
        const hr = v().subVectors(J.R_Thigh, J.L_Thigh); hr.y = 0; hr.normalize(); const cross = v().subVectors(J.R_Foot, J.L_Foot).dot(hr);
        const tag = { t: +m.t.toFixed(2), key, spd: +spd.toFixed(2), wk: +(fg.srvWalkK || 0).toFixed(2), stK: +(fg.strollK || 0).toFixed(2), d: +dmin.toFixed(3), x: +cross.toFixed(3) };
        if (dmin < 0.09) { o.through++; o.worst.push(['through', 0.09 - dmin, tag]); }
        if (cross < -0.08) { o.crossed++; o.worst.push(['crossed', -cross, tag]); }
        if (spd > 0.3) lastMove = m.t; if (spd < 0.02 && lastMove != null && m.t - lastMove < 0.25 && (!stops.length || stops[stops.length - 1].t < lastMove)) stops.push({ t: m.t, lifts: 0, last: 0, close: 0 });
        { const sp = stops[stops.length - 1]; if (sp && m.t - sp.t < 1.5 && Math.hypot(J.L_Foot.x - J.R_Foot.x, J.L_Foot.z - J.R_Foot.z) < 0.1) { sp.close++; o.worst.push(['feetClose', 0.1 - Math.hypot(J.L_Foot.x - J.R_Foot.x, J.L_Foot.z - J.R_Foot.z), tag]); } }
        for (const [k, S] of [[0, 'L'], [1, 'R']]) { const a = J[S + '_Foot'], toe = J[S + '_Toe0'], tDown = toe.y < 0.045, up = a.y > 0.15;
          // a planted toe (the ball of the foot) should not move: its drift over each run of frames on the court
          if (tDown) { if (!run[k]) run[k] = { p0: toe.clone(), n: 0, max: 0, t: m.t }; run[k].n++; run[k].max = Math.max(run[k].max, Math.hypot(toe.x - run[k].p0.x, toe.z - run[k].p0.z)); }
          else if (run[k]) { if (run[k].n >= 6) { o.stances.push(run[k].max); if (run[k].max > 0.04) o.worst.push(['toeDrift', run[k].max, { ...tag, t0: +run[k].t.toFixed(2), n: run[k].n, foot: S }]); } run[k] = null; }
          if (up && !upPrev[k]) { const sp = stops[stops.length - 1]; if (sp && spd < 0.02 && m.t - sp.t < 1.5) { sp.lifts++; sp.last = +(m.t - sp.t).toFixed(2); } }
          if (up && !upPrev[k] && still > 0.35) { o.stepsStill++; o.worst.push(['stepStill', still, { ...tag, foot: S }]); }
          upPrev[k] = up; }
        // the lower toe (the ball of the foot) is always a planted contact in a walk: its speed over the court is the feet's skating
        { const lo = J.L_Toe0.y <= J.R_Toe0.y ? 0 : 1, tp = lo ? J.R_Toe0 : J.L_Toe0; if (spd > 0.3 && prevLo === lo && prevToe) o.skate.push(Math.hypot(tp.x - prevToe.x, tp.z - prevToe.z) * 60); prevLo = lo; prevToe = tp.clone(); }
        if (${JSON.stringify(!!E.TRACE)} && spd > 0.05 || (${JSON.stringify(!!E.TRACE)} && still < 0.5 && m.t > 3.6)) { const lw = fg.loco.w, vy = Math.atan2(p.vx * p.sgn, -p.vz * p.sgn), ye = ((fg.yaw - vy) * 57.3 + 540) % 360 - 180, lo = J.L_Toe0.y <= J.R_Toe0.y ? 'L' : 'R';
          o.trace.push([+m.t.toFixed(3), key.slice(5, 6) || '-', +spd.toFixed(2), Math.round(ye), +lw.f.toFixed(2), +(lw.r + lw.l).toFixed(2), +(fg.strollK || 0).toFixed(2), lo, o.skate.length ? +o.skate[o.skate.length - 1].toFixed(2) : 0, +(fg.loco.phF || 0).toFixed(2)].join(' ')); }
        if (${JSON.stringify(!!E.TRACE2)}) o.trace2.push([+m.t.toFixed(3), +spd.toFixed(2), +(fg.strollK || 0).toFixed(2), ...[0, 1].flatMap(k => { const S = k ? 'R' : 'L', a = J[S + '_Foot'], tt = J[S + '_Toe0'], f = fg.feet[k]; return [+a.x.toFixed(4), +a.z.toFixed(4), +a.y.toFixed(4), +tt.x.toFixed(4), +tt.z.toFixed(4), +tt.y.toFixed(4), +f.p.x.toFixed(4), +f.p.z.toFixed(4), +(f.lift || 0).toFixed(4)]; }), +p.x.toFixed(4), +p.z.toFixed(4), +(fg.yaw || 0).toFixed(4)]);
        if (${JSON.stringify(!!E.TRACE3)}) { fg.dbgOn = true; if (m.t > 3.95 && m.t < 4.45 || m.t > 4.95 && m.t < 5.7) o.trace3.push(JSON.stringify({ t: +m.t.toFixed(3), spd: +spd.toFixed(2), go: +fg.loco.w.go.toFixed(2), wk: +(fg.srvWalkK || 0).toFixed(2), clipW: +(fg.clipW || 0).toFixed(2), addrW: +(fg.addrW || 0).toFixed(2), lk: fg.lockF.map(L => (L.on ? 'D' : '.') + (L.step ? 's' + L.step.t.toFixed(2) : '')), lift: fg.feet.map(f => +(f.lift || 0).toFixed(3)), k: fg.dbgFt && [fg.dbgFt.k0, fg.dbgFt.k1], v: [0, 1].map(k => { const f = fg.feet[k].p, q = o.__pf && o.__pf[k]; return q ? +(Math.hypot(f.x - q.x, f.z - q.z) * 60).toFixed(2) : 0; }), plW: +(fg.plW || 0).toFixed(2) })); o.__pf = fg.feet.map(f => f.p.clone()); }
        { const av = o.__av || (o.__av = [[], []]); for (let k = 0; k < 2; k++) { const a = k ? J.R_Foot : J.L_Foot, q = o.__ap && o.__ap[k]; av[k].push(q ? Math.hypot(a.x - q.x, a.z - q.z, a.y - q.y) * 60 : 0); const n = av[k].length; if (n >= 3) { const v0 = av[k][n - 3], v1 = av[k][n - 2], v2 = av[k][n - 1]; if (v1 > 3 && v1 > 2 * v0 && v1 > 2 * v2) { o.pops++; o.worst.push(['pop', v1, { ...tag, foot: k ? 'R' : 'L' }]); } } } o.__ap = [J.L_Foot.clone(), J.R_Foot.clone()]; }
        if (${JSON.stringify(!!E.TRACE4)} && (m.t > 3.98 && m.t < 4.6 || m.t > 4.95 && m.t < 5.8)) o.trace4.push([+m.t.toFixed(3), +spd.toFixed(2), +(fg.loco.phF || 0).toFixed(3), +(fg.strollK || 0).toFixed(2), Math.round(fg.loco.w.go * 100), ...(fg.loco.stPitch || [0, 0]).map(x => Math.round(x * 57.3)), +J.L_Foot.y.toFixed(3), +J.R_Foot.y.toFixed(3), +J.L_Toe0.y.toFixed(3), +J.R_Toe0.y.toFixed(3), (fg.stLock || []).map(L => L.on ? 'D' : '.').join(''), fg.lockF.map(L => (L.on ? 'D' : '.') + (L.step ? 's' : '')).join('')].join(' '));
        prevSpd = spd;
        if (spd > 0.6 && fg.srvWalking) { const kl = ang(J.L_Thigh, J.L_Calf, J.L_Foot), kr = ang(J.R_Thigh, J.R_Calf, J.R_Foot); o.kneeWalk.push(Math.min(kl, kr)); }
        prev = [J.L_Foot.clone(), J.R_Foot.clone()];
      }
      const kw = o.kneeWalk.sort((a, b) => a - b), q = f => kw.length ? +kw[Math.floor(f * (kw.length - 1))].toFixed(0) : null;
      const byK = {}; for (const w of o.worst) (byK[w[0]] || (byK[w[0]] = [])).push(w); const top = {}; for (const k in byK) top[k] = byK[k].sort((a, b) => b[1] - a[1]).slice(0, 4).map(w => ({ m: +w[1].toFixed(3), ...w[2] }));
      return JSON.stringify({ who: g.match.players[0].prof.name, frames: o.frames, phases: o.phases, through: o.through, crossed: o.crossed, pops: o.pops, toeDrift: (() => { const a = o.stances.slice().sort((x, y) => x - y); return a.length ? [a.length, +a[Math.floor(a.length / 2)].toFixed(3), +a[Math.floor(0.9 * (a.length - 1))].toFixed(3), +a[a.length - 1].toFixed(3)] : null; })(), skate: (() => { const a = o.skate.slice().sort((x, y) => x - y); return a.length ? [a.length, +a[Math.floor(a.length / 2)].toFixed(2), +a[Math.floor(0.9 * (a.length - 1))].toFixed(2), +(a.filter(x => x > 0.3).length / a.length).toFixed(2)] : null; })(), stops: stops.map(s => s.lifts + '@' + s.last + (s.close ? 'c' + s.close : '')), stepsStill: o.stepsStill, trace: o.trace, trace2: o.trace2, trace3: o.trace3, trace4: o.trace4, stanceKnee: [q(0.1), q(0.5), q(0.9)], top }); })()`);
    console.log('PROBE', r);
  }
}
