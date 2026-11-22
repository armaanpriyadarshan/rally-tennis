// Frames per second with nothing holding the page to the screen's refresh (run Chromium with --disable-gpu-vsync
// --disable-frame-rate-limit): a computer match on its own requestAnimationFrame loop, the simulation, figures and drawing all
// included, so the CPU and the graphics chip overlap as they do in play. Each setting in CONF (name=json of QUALITY fields, ';'-separated)
// is taken in turn ROUNDS times round. env: Q CAM VEN SECS ROUNDS CONF FLAGS
export default async function ({ ev }) {
  const E = process.env, ROUNDS = +(E.ROUNDS || 2), SECS = +(E.SECS || 4);
  const CONF = (E.CONF || 'shipped={}').split(';').map(s => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)]; });
  console.log(await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'), R = await import('./js/render.js'); const T = D.TOURNAMENTS.find(t => t.key === ${JSON.stringify(E.VEN || 'ao')}) || D.TOURNAMENTS[0];
    Object.assign(globalThis, ${JSON.stringify(Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; })))});
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    for (const el of document.body.querySelectorAll('#ui,#shade,#overlay')) el.style.display = 'none';
    await A.game.start({ T, weather: 'clear', p0: ix('Nadal'), p1: ix('Federer'), format: 'atp3', demo: true, cam: ${JSON.stringify(E.CAM || 'fp')}, intro: false, firstServer: 0 });
    A.mode = 'match'; A.loop = () => {}; const g = A.game; g.running = true; A.gfx.auto = false; window.__F = { g, gfx: A.gfx, R, base: { ...R.QUALITY[${+(E.Q || 2)}] } };
    let last = performance.now(); window.__F.n = 0; const tick = now => { requestAnimationFrame(tick); const dt = Math.min(0.05, (now - last) / 1000); last = now; g.frame(1 / 60); window.__F.n++; }; requestAnimationFrame(tick);
    await new Promise(r => setTimeout(r, 2000)); return 'ready ' + A.gfx.renderer.domElement.width + 'x' + A.gfx.renderer.domElement.height; })()`));
  const acc = {};
  for (let r = 0; r < ROUNDS; r++) for (const [nm, js] of CONF) {
    const fps = await ev(`(async () => { const F = window.__F, Q = ${+(E.Q || 2)}; Object.assign(F.R.QUALITY[Q], F.base, ${js}); F.gfx.setQuality(Q); await new Promise(r => setTimeout(r, 800));
      const n0 = F.n, t0 = performance.now(); await new Promise(r => setTimeout(r, ${SECS * 1000})); return (F.n - n0) / (performance.now() - t0) * 1000; })()`);
    (acc[nm] = acc[nm] || []).push(fps);
  }
  for (const [nm] of CONF) console.log('FPS', nm.padEnd(22), acc[nm].map(x => x.toFixed(1)).join(' '));
}
