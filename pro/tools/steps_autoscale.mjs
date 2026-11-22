// Does the picture's resolution follow the frame rate? A computer match on the page's own loop, as in play, sampled every second:
// frames drawn that second, the resolution scale, the smoothed frame time against the frame time wanted, the screen's refresh as
// measured. env: Q CAM VEN SECS FLAGS
export default async function ({ ev }) {
  const E = process.env;
  console.log(await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'); const T = D.TOURNAMENTS.find(t => t.key === ${JSON.stringify(E.VEN || 'ao')}) || D.TOURNAMENTS[0];
    Object.assign(globalThis, ${JSON.stringify(Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; })))});
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    await new Promise(r => setTimeout(r, 1500));            // the menus first, as a player comes to a match
    for (const el of document.body.querySelectorAll('#ui,#shade,#overlay')) el.style.display = 'none';
    await A.game.start({ T, weather: 'clear', p0: ix('Nadal'), p1: ix('Federer'), format: 'atp3', demo: true, cam: ${JSON.stringify(E.CAM || 'tv')}, intro: false, firstServer: 0 });
    A.gfx.setQuality(${+(E.Q || 2)}); A.mode = 'match'; A.paused = false; A.covered = false; A.game.running = true;
    const g = A.game, f0 = g.frame.bind(g); window.__AS = { n: 0 }; g.frame = dt => { window.__AS.n++; return f0(dt); }; return 'ready refresh ' + (A.refresh || 0).toFixed(2); })()`));
  for (let s = 0; s < +(E.SECS || 30); s++) {
    console.log('SEC', s, await ev(`(async () => { const A = window.__app, n0 = window.__AS.n; await new Promise(r => setTimeout(r, 1000)); const G = A.gfx;
      return 'frames ' + (window.__AS.n - n0) + ' scale ' + G.scale.toFixed(2) + ' frameMs ' + G.frameMs.toFixed(1) + ' want ' + (G.expect || 0).toFixed(1) + ' refresh ' + (A.refresh || 0).toFixed(1) + ' slow ' + G.slow + ' calm ' + (G.calm || 0).toFixed(1) + ' px ' + G.renderer.domElement.width + 'x' + G.renderer.domElement.height; })()`));
  }
}
