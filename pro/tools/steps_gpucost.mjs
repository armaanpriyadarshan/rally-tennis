// What each part of a frame costs, without the screen's refresh hiding it: one frozen moment of a computer match drawn over and over,
// each draw followed by reading one pixel back (which waits for the graphics chip to finish). The settings are taken in turn, ROUNDS
// times round, so whatever else the machine is doing falls on all of them alike; median ms per frame for each. env: Q CAM VEN WEATHER
// ROUNDS N FLAGS
export default async function ({ ev }) {
  const E = process.env, N = +(E.N || 16), ROUNDS = +(E.ROUNDS || 4);
  console.log(await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'), R = await import('./js/render.js'); const T = D.TOURNAMENTS.find(t => t.key === ${JSON.stringify(E.VEN || 'ao')}) || D.TOURNAMENTS[0];
    Object.assign(globalThis, ${JSON.stringify(Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; })))});
    const ix = n => D.PLAYERS.findIndex(p => (p.facts && p.facts.name || '').includes(n));
    for (const el of document.body.querySelectorAll('#ui,#shade,#overlay')) el.style.display = 'none';
    await A.game.start({ T, weather: ${JSON.stringify(E.WEATHER || 'clear')}, p0: ix('Nadal'), p1: ix('Federer'), format: 'atp3', demo: true, cam: ${JSON.stringify(E.CAM || 'fp')}, intro: false, firstServer: 0 });
    A.mode = 'match'; const g = A.game; g.running = false; A.gfx.auto = false; const gfx = A.gfx, Q0 = +${+(E.Q || 2)};
    for (let f = 0; f < 60 * 8; f++) { g.running = true; g.frame(1 / 60); g.running = false; }
    const base = { ...R.QUALITY[Q0] }, setQ = o => { Object.assign(R.QUALITY[Q0], base, o); gfx.setQuality(Q0); };
    const inst = []; g.arena.root.traverse(o => { if (o.isInstancedMesh) inst.push(o); }); const arenaCh = g.arena.root.children.slice(), lights = gfx.arena.shadowLights;
    const C = window.__C = {
      'as shipped': [() => setQ({}), () => {}],
      'no depth-of-field': [() => setQ({ focus: false }), () => {}],
      'no MSAA': [() => setQ({ msaa: 0 }), () => {}],
      'no MSAA, no DoF': [() => setQ({ msaa: 0, focus: false }), () => {}],
      'shadow map not redrawn': [() => { setQ({}); gfx.arena.shadowLights = []; }, () => { gfx.arena.shadowLights = lights; }],
      'instanced (crowd) hidden': [() => { setQ({}); inst.forEach(o => o.visible = false); }, () => inst.forEach(o => o.visible = true)],
      'arena hidden': [() => { setQ({}); arenaCh.forEach(o => o.visible = false); }, () => arenaCh.forEach(o => o.visible = true)],
      'scale 0.8': [() => setQ({ scale: 0.8 }), () => {}],
      'scale 0.67': [() => setQ({ scale: 0.67 }), () => {}],
      'Low (q0)': [() => { Object.assign(R.QUALITY[Q0], base); gfx.setQuality(0); }, () => {}],
    };
    window.__G = { g, gfx, setQ }; return 'ready ' + gfx.renderer.domElement.width + 'x' + gfx.renderer.domElement.height; })()`));
  const names = JSON.parse(await ev(`JSON.stringify(Object.keys(window.__C))`)), acc = Object.fromEntries(names.map(n => [n, []]));
  for (let r = 0; r < ROUNDS; r++) for (const nm of names) {
    const ts = JSON.parse(await ev(`(async () => { const { gfx } = window.__G, [on, off] = window.__C[${JSON.stringify(nm)}]; on(); await new Promise(r => setTimeout(r, 30));
      const gl = gfx.renderer.getContext(), px = new Uint8Array(4), sync = () => { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
      for (let i = 0; i < 5; i++) { gfx.render(1 / 60); sync(); } const ts = []; for (let i = 0; i < ${N}; i++) { sync(); const t = performance.now(); gfx.render(1 / 60); sync(); ts.push(performance.now() - t); if (i % 6 === 5) await new Promise(r => setTimeout(r, 0)); }
      off(); return JSON.stringify(ts); })()`));
    acc[nm].push(...ts);
  }
  for (const nm of names) { const a = acc[nm].sort((x, y) => x - y); console.log('GPU', nm.padEnd(28), 'median', a[a.length >> 1].toFixed(2), 'ms  p25', a[a.length >> 2].toFixed(2)); }
}
