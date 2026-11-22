// The serve's circle as he sees it: a match with him (the first game's controls, markers on) serving first, waiting to serve, with
// no arrow, then Left, then Right held; each shot from his own eyes (fp), from behind (chase) and the broadcast camera (tv).
// OUT_<key>_<cam>.jpg, and a line per shot with the circle's place on the court. env: P0 P1 VEN OUT
export default async function ({ ev, shot }) {
  const E = process.env, OUT = E.OUT || '/tmp/rally-work2/sc/s';
  console.log(await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === ${JSON.stringify(E.VEN || 'ao')}) || D.TOURNAMENTS[0];
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    let rs = 7; Math.random = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
    for (const el of document.body.querySelectorAll('#ui,#shade,#overlay')) el.style.display = 'none';
    A.set.controls = 'classic'; A.set.markers = true;
    await A.game.start({ T, weather: 'clear', p0: ix(${JSON.stringify(E.P0 || 'Federer')}), p1: ix(${JSON.stringify(E.P1 || 'Nadal')}), format: 'atp3', difficulty: 1, cam: 'fp', intro: false, firstServer: 0, opts: { controls: 'classic', markers: true } });
    A.mode = 'match'; A.input.enabled = true; A.input.locked = true; const g = A.game, m = g.match; g.running = false; g.audio = null; window.__sc = { g, A };
    for (let f = 0; f < 60 * 20; f++) { g.running = true; g.frame(1 / 60); g.running = false; if (m.phase === 'ready' && m.score.server === 0 && m.phaseT > 0.3) break; }
    return 'phase ' + m.phase + ' server ' + m.score.server + ' controls ' + g.opts.controls + ' human ' + !!g.human; })()`));
  for (const k of ['none', 'ArrowLeft', 'ArrowRight']) for (const cam of ['fp', 'chase', 'tv']) {
    console.log('STATE', k, cam, await ev(`(() => { const { g, A } = window.__sc, m = g.match; A.input.keys.clear(); if (${JSON.stringify(k)} !== 'none') A.input.keys.add(${JSON.stringify(k)});
      g.setCamera(${JSON.stringify(cam)}); for (let f = 0; f < 20; f++) { m.phaseT = Math.min(m.phaseT, 0.3); g.running = true; g.frame(1 / 60); g.running = false; }
      const ap = g.human && g.human.aimPreview, mk = g.fx.mineMesh || g.fx.mine; return m.phase + ' aim ' + (ap ? ap.X.toFixed(2) + ',' + ap.D.toFixed(2) : '-') + ' marker ' + (mk ? (mk.visible ? 'on ' : 'off ') + mk.position.x.toFixed(2) + ',' + mk.position.z.toFixed(2) : '?'); })()`));
    await shot(`${OUT}_${k}_${cam}.jpg`);
  }
}
