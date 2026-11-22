// Real frame rate as the player gets it: a computer match left to run on the page's own loop (requestAnimationFrame), frames counted
// over SECS seconds for each graphics setting in Q (comma list of indices into QUALITY), with the GPU's time included. env: Q SECS CAM VEN
export default async function ({ ev }) {
  const E = process.env;
  await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === ${JSON.stringify(E.VEN || 'ao')}) || D.TOURNAMENTS[0];
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    for (const el of document.body.querySelectorAll('#ui,#shade,#overlay')) el.style.display = 'none';
    await A.game.start({ T, weather: 'clear', p0: ix('Nadal'), p1: ix('Federer'), format: 'atp3', demo: true, cam: ${JSON.stringify(E.CAM || 'chase')}, intro: false, firstServer: 0 });
    A.mode = 'match'; A.paused = false; A.covered = false; A.game.running = true; return 1; })()`);
  for (const q of (E.Q || '0,1,2').split(',').map(Number)) {
    const r = await ev(`(async () => { const A = window.__app; A.gfx.setQuality(${q}); await new Promise(r => setTimeout(r, 1500));
      let n = 0, t0 = performance.now(), ts = [], last = t0; await new Promise(res => { const tick = now => { n++; ts.push(now - last); last = now; if (now - t0 < ${+(E.SECS || 6)} * 1000) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
      ts.sort((a, b) => a - b); const el = performance.now() - t0; return 'quality ' + ${q} + ' (' + (A.gfx.Q ? A.gfx.Q.name : '') + '): ' + (n / el * 1000).toFixed(1) + ' fps, frame median ' + ts[ts.length >> 1].toFixed(1) + ' ms, p90 ' + ts[Math.floor(ts.length * 0.9)].toFixed(1) + ' ms, canvas ' + A.gfx.renderer.domElement.width + 'x' + A.gfx.renderer.domElement.height; })()`);
    console.log('FPS', r);
  }
}
