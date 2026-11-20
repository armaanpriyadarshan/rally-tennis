// Pose-lab strip: load pro/dev.html?lab=<kind>&p=<Name>&wing=..&view=.. and save one frame per time from contact (US, seconds,
// comma separated; or U0 U1 STEP for every frame between) to OUT_nn.jpg, for tiling (tools/labsheet.py).
// env: US | U0 U1 STEP, OUT, PICK (force one of his clips: -1 main, 0.. alts), FLAGS=a,b=1 (globalThis.__a ...)
export default async function ({ ev, shot }) {
  const E = process.env, OUT = E.OUT || '/tmp/rally-work2/lab/f';
  let US = (E.US || '-0.9,-0.75,-0.6,-0.45,-0.3,-0.2,-0.1,0,0.1,0.2,0.35,0.5').split(',').map(Number);
  if (E.U0 != null) { US = []; const st = +(E.STEP || 1 / 60); for (let u = +E.U0; u <= +E.U1 + 1e-6; u += st) US.push(+u.toFixed(4)); }
  for (let i = 0; i < 40 && !(await ev('!!window.__lab')); i++) await new Promise(r => setTimeout(r, 250));
  const fl = Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; }));
  if (E.PICK != null) fl.__forcePick = +E.PICK;
  await ev(`Object.assign(globalThis, ${JSON.stringify(fl)}); 1`);
  let k = 0; for (const u of US) { await ev(`__lab.go(${u})`); await shot(`${OUT}_${String(k).padStart(2, '0')}.jpg`); k++; }
  console.log('frames', k);
}
