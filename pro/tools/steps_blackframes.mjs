// Black frames, caught: the app's own loop runs a match (the computer playing for him) for SECS seconds of real time, and after every
// picture drawn a few pixels of it are read back; a picture whose pixels are all near black is logged with what was going on - phase,
// cut, replay, cine, the camera and its numbers, the canvas size. Also counts canvas resizes. env: VEN SECS FORMAT
export default async function ({ ev, sleep }) {
  const E = process.env;
  console.log(await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'); const ix = n => D.PLAYERS.findIndex(p => p.facts.name === n);
    A.set.format = ${JSON.stringify(E.FORMAT || 'atp3')}; A.set.cam = 'tv';
    await A.play({ kind: 'quick' }, ix('Nadal'), ix('Djokovic'), D.TOURNAMENTS.find(t => t.key === ${JSON.stringify(E.VEN || 'ao')}), null);
    const g = A.game, gfx = g.gfx, r = gfx.renderer, gl = r.getContext(), px = new Uint8Array(4);
    const AIm = await import('./js/ai.js'); g.match.ctl[0] = new AIm.AI({ human: true });
    window.__bf = { frames: 0, black: [], resizes: 0, sizes: new Set() };
    const cv = r.domElement; new ResizeObserver(() => { window.__bf.resizes++; }).observe(cv);
    const orig = gfx.render.bind(gfx);
    gfx.render = (dt) => { const out = orig(dt); const B = window.__bf; B.frames++; const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; B.sizes.add(w + 'x' + h);
      let lum = 0, n = 0; for (const [fx, fy] of [[0.2, 0.2], [0.5, 0.2], [0.8, 0.2], [0.2, 0.5], [0.5, 0.5], [0.8, 0.5], [0.2, 0.8], [0.5, 0.8], [0.8, 0.8]]) { gl.readPixels(Math.floor(w * fx), Math.floor(h * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); lum += px[0] + px[1] + px[2]; n++; }
      if (lum / n < 12 && B.black.length < 30) { const m = g.match, c = gfx.camera; B.black.push({ t: +g.time.toFixed(2), ph: m.phase, phT: +(m.phaseT || 0).toFixed(2), cine: g.cine && g.cine.kind, rep: !!g.replay, fade: +(g.fade || 0).toFixed(2), fadeT: g.fadeT || 0, end: g.endSeq && g.endSeq.stage, cam: [c.position.x, c.position.y, c.position.z].map(v => +v.toFixed(2)), fov: +c.fov.toFixed(1), size: w + 'x' + h, ui: document.querySelector('#overlay').className, wipe: (document.querySelector('#wipe') || {}).className }); }
      return out; };
    return 'started'; })()`));
  const secs = +(E.SECS || 120);
  for (let s = 0; s < secs; s += 10) { await sleep(10000); const st = await ev(`JSON.stringify({ f: window.__bf.frames, b: window.__bf.black.length, rz: window.__bf.resizes, pts: window.__app.game.match.history.length, ph: window.__app.game.match.phase })`); console.log('BF', s + 10, st); }
  console.log(await ev(`JSON.stringify({ frames: window.__bf.frames, resizes: window.__bf.resizes, sizes: [...window.__bf.sizes], black: window.__bf.black })`));
}
