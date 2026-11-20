// The walk to the serve in the pose lab (dev.html?lab=run&ph=ready&srv=0&p=Name&v=<m/s>&vz=<m/s>): frames at the times in US
// (seconds into the walk) from the views in VIEWS, OUT_<view>_nn.jpg. FLAGS a,b=1 set globalThis.__a ... first.
export default async function ({ ev, shot }) {
  const E = process.env, OUT = E.OUT || '/tmp/rally-work2/sw/w', US = (E.US || '0,0.15,0.3,0.45,0.6,0.75').split(',').map(Number), VW = (E.VIEWS || 'back,side,tv').split(',');
  for (let i = 0; i < 40 && !(await ev('!!window.__lab')); i++) await new Promise(r => setTimeout(r, 250));
  await ev(`Object.assign(globalThis, ${JSON.stringify(Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; })))}); 1`);
  for (const vw of VW) { let k = 0; for (const u of US) { await ev(`(__lab.go(${u}), __lab.shoot(${JSON.stringify(vw)}), 1)`); await shot(`${OUT}_${vw}_${String(k).padStart(2, '0')}.jpg`); k++; } }
  console.log('done');
}
