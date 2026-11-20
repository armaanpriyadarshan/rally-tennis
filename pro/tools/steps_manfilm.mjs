// A film of the human player moved with the arrow keys as a person moves him, in a real match through the game's own camera
// (CAM=tv for the broadcast, CAM=chase for the camera behind him). The computer serves; through each rally the arrows are held
// in a fixed pattern of taps, holds, reversals and diagonals (KEYS, default below), and Space is pressed when the timing says.
// env: P0 P1, RSEED, FOOT (0 Manual, 1 Assist, 2 Auto footwork; default 0), CAM, SECS (seconds of film), STEP (frames between
// pictures, default 2), T0 (seconds of match to skip first), OUT (prefix), FLAGS (a,b=1 → globalThis.__a ...), KEYS ("L:0.45,-:0.15,R:0.6,..."; U D L R and pairs
// like UL; - for none)
export default async function ({ ev, shot }) {
  const E = process.env, OUT = E.OUT || '/tmp/rally-work2/mf/f', CAM = E.CAM || 'tv';
  const KEYS = (E.KEYS || 'L:0.45,-:0.15,R:0.6,-:0.1,UL:0.4,D:0.5,R:0.3,L:0.3,R:0.25,-:0.3,DR:0.5,U:0.35,L:0.7,-:0.2').split(',').map(x => { const [k, d] = x.split(':'); return [k, +d]; });
  await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === 'ao');
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    let rs = ${+(E.RSEED || 11)}; Math.random = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
    Object.assign(globalThis, ${JSON.stringify(Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; })))});
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Alcaraz')}), p1: ix(${JSON.stringify(E.P1 || 'Laver')}), format: 'atp3', difficulty: 1, cam: ${JSON.stringify(CAM)}, intro: false, seed: ${+(E.RSEED || 11)}, firstServer: 1, envOverride: { surface: 'hard', pace: 0, tempC: 24, humidity: 0.5, windX: 0, windZ: 0 } });
    A.mode = 'match'; A.input.enabled = true; A.input.locked = true;
    const g = A.game, m = g.match; g.opts.assist = ${+(E.FOOT || 0)}; g.running = false; g.audio = null;
    const TIMING = (await import('./js/sim.js')).TIMING;
    window.__mf = { g, m, A, TIMING, kI: 0, kT: 0, inc: null, done: false, log: [] };
    for (let f = 0; f < Math.round(${+(E.T0 || 0)} * 60); f++) { g.running = true; g.frame(1 / 60); g.running = false; }
    return m.phase; })()`);
  const N = Math.round(+(E.SECS || 12) * 60), ST = +(E.STEP || 2); let k = 0;
  for (let f = 0; f < N; f++) {
    await ev(`(() => { const S = window.__mf, { g, m, A } = S, inp = A.input, KEYS = ${JSON.stringify(KEYS)}, map = { L: 'ArrowLeft', R: 'ArrowRight', U: 'ArrowUp', D: 'ArrowDown' };
      if (m.phase === 'live') { S.kT += 1 / 60; while (S.kT > KEYS[S.kI % KEYS.length][1]) { S.kT -= KEYS[S.kI % KEYS.length][1]; S.kI++; }
        const kk = KEYS[S.kI % KEYS.length][0], H = g.human; inp.keys.clear();
        if (!(H && H.tau != null && H.tau < 0.3)) for (const c of kk) if (map[c]) inp.keys.add(map[c]);
        const inc = m.incoming; if (inc && inc !== S.inc && m.ball.lastHit !== 0) { S.inc = inc; S.done = false; }
        if (!S.done && H && H.tau != null && H.tau <= 0.1) { inp.pressed.add('Space'); S.done = true; } }
      else { inp.keys.clear(); if (m.phase === 'ready' && m.score.server === 0 && m.phaseT > 0.9) inp.pressed.add('Space'); if (m.phase === 'toss' && m.score.server === 0 && m.ball.held < 0 && !S.tossed) { S.tossed = 1; S.srvAt = m.tossIdeal - S.TIMING.serveSwing; } if (S.srvAt && m.t >= S.srvAt) { inp.pressed.add('Space'); S.srvAt = 0; } if (m.phase !== 'toss') S.tossed = 0; }
      g.running = true; g.frame(1 / 60); g.running = false;
      const p = m.players[0], fg = g.fig[0]; if (${f} % 3 === 0) S.log.push([+m.t.toFixed(2), m.phase, [...inp.keys].map(x => x.slice(5, 6)).join(''), +Math.hypot(p.vx, p.vz).toFixed(1), fg.loco ? ['f', 'b', 'r', 'l'].map(q => +fg.loco.w[q].toFixed(1)).join('/') : '', +(fg.yaw || 0).toFixed(2), fg.lockF.map(L => (L.on ? 'D' : '.') + (L.step ? 's' : '')).join(''), p.stroke ? (p.stroke.__dk || p.stroke.kind) + '/' + (p.stroke.wing || '') + (p.stroke.tc != null ? ' u' + (m.t - p.stroke.tc).toFixed(2) : ' noTc') + (p.stroke.done ? ' done' : '') : '-', 'sw' + (fg.strokeW || 0).toFixed(2), 'tau' + (g.human && g.human.tau != null ? g.human.tau.toFixed(2) : '-'), 'hlp' + (g.human && g.human.helpedNow ? 1 : 0), 'ball' + m.ball.lastHit + '/' + m.ball.bounces].join(' '));
      return 1; })()`);
    if (f % ST) continue;
    await ev(`(() => { for (const el of document.body.querySelectorAll('body > *:not(canvas)')) el.style.display = 'none'; const c = document.querySelector('canvas'); if (c) c.style.display = ''; const g = window.__mf.g; g.gfx.render(1 / 60); const P = g.fig[0].person, cam = g.gfx.camera, v = new (cam.position.constructor)(); P.jointPos('Pelvis', v); const d = v.distanceTo(cam.position); v.project(cam); return [((v.x + 1) / 2).toFixed(3), ((1 - v.y) / 2).toFixed(3), d.toFixed(1)].join(' '); })()`).then(r => console.log('POS ' + k + ' ' + r));
    await shot(`${OUT}_${String(k).padStart(3, '0')}.jpg`); k++;
  }
  console.log((await ev(`window.__mf.log.join('\\n')`)));
  console.log('frames', k);
}
