// dev.html?lineup=1[&ev=wim]: a close camera on each named player's head from any angle round him (0 = his face, 180 = from behind),
// for checking heads, hair and headwear from the views the game is seen in. env NAMES (comma list), ANGLES (degrees), OUT, UP (m above the head bone).
export default async function ({ ev, shot }) {
  const E = process.env, OUT = E.OUT || '/tmp/rally-work2/heads/c', AN = (E.ANGLES || '180,135,90').split(',').map(Number);
  for (let i = 0; i < 80 && !(await ev('!!window.__line')); i++) await new Promise(r => setTimeout(r, 250));
  await new Promise(r => setTimeout(r, 1500));
  const names = await ev('__line.names');
  for (const nm of (E.NAMES || 'Kyrgios').split(',')) { const i = names.indexOf(nm); if (i < 0) { console.log('no', nm); continue; }
    for (const a of AN) {
      await ev(`(() => { __line.at(${i}, 'front'); const f = __line.figs[${i}], c = __gfx.camera, T = __THREE, h = new T.Vector3(); f.fig.group.updateMatrixWorld(true); f.fig.person.bones['Bip01_Head'].getWorldPosition(h);
        const r = 0.95, an = ${a} * Math.PI / 180; c.position.set(h.x + Math.sin(an) * r, h.y + ${+(E.UP || 0.12)}, h.z - Math.cos(an) * r); c.lookAt(h.x, h.y + 0.06, h.z); c.fov = 24; c.updateProjectionMatrix(); __gfx.render(0.016); return 1; })()`);
      await shot(`${OUT}_${nm.replace(/ /g, '_')}_${a}.jpg`); } }
  console.log('done');
}
