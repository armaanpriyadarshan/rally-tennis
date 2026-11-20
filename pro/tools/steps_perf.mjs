// Cost of one figure update in the pose lab: N strokes back to back, ms per update, for each FLAGS set (comma lists, | between sets).
export default async function ({ ev }) {
  for (let i = 0; i < 40 && !(await ev('!!window.__lab')); i++) await new Promise(r => setTimeout(r, 250));
  const sets = (process.env.SETS || '').split('|');
  for (const fs of sets) {
    const fl = Object.fromEntries(fs.split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; }));
    console.log(await ev(`(() => { for (const k of Object.keys(globalThis)) if (/^__[a-zA-Z]+Old$|^__no[A-Z]/.test(k)) delete globalThis[k]; Object.assign(globalThis, ${JSON.stringify(fl)}); const L = window.__lab, fg = L.fig, p = L.p, m = L.m;
      let n = 0, ms = 0;
      for (let rep = 0; rep < 6; rep++) { m.t = 0; p.x = 0; p.z = 11.9; p.vx = rep % 2 ? 2.5 : 0; p.vz = 0; p.stroke = null; fg.inited = false; fg.handInit = false;
        for (let k = 0; k < 200; k++) { m.t += 1 / 60; m.phaseT = m.t; p.x += p.vx / 60; if (!p.stroke && m.t >= 1.1) p.stroke = { kind: 'drive', wing: rep % 3 ? 'fh' : 'bh', t0: m.t, tc: 2, done: false, tEnd: 2, auto: true, cp: { x: p.x + 0.7, y: 0.9, z: p.z - 0.3 } };
          if (p.stroke && m.t >= 2.001 && !p.stroke.done) { p.stroke.done = true; p.stroke.hit = true; }
          const t0 = performance.now(); fg.update(1 / 60, p, m); ms += performance.now() - t0; n++; } }
      return ${JSON.stringify(fs || 'current')} + ': ' + (ms / n).toFixed(3) + ' ms/update over ' + n; })()`));
  }
}
