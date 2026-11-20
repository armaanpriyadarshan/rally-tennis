// dev.html?lineup=1: each named player's head close up from the views in VIEWS (face, face3: a close camera on the face; or the lineup's head, side, rear, front, back), one picture each.
// env: NAMES (comma list, default all) VIEWS OUT
export default async function ({ ev, shot }) {
  const E = process.env, OUT = E.OUT || '/tmp/rally-work2/heads/h', VW = (E.VIEWS || 'head,side').split(',');
  for (let i = 0; i < 80 && !(await ev('!!window.__line')); i++) await new Promise(r => setTimeout(r, 250));
  await new Promise(r => setTimeout(r, 1500));
  const names = await ev('__line.names'), want = E.NAMES ? E.NAMES.split(',') : names;
  for (const nm of want) { const i = names.indexOf(nm); if (i < 0) { console.log('no', nm); continue; }
    for (const v of VW) {
      if (v === 'face' || v === 'face3') await ev(`(() => { __line.at(${i}, 'front'); const f = __line.figs[${i}], c = __gfx.camera, T = __THREE, h = new T.Vector3(); f.fig.group.updateMatrixWorld(true); f.fig.person.bones['Bip01_Head'].getWorldPosition(h);
        const side = ${JSON.stringify(v)} === 'face3' ? 0.45 : 0.06; c.position.set(h.x + side, h.y + 0.10, h.z - 0.95); c.lookAt(h.x, h.y + 0.08, h.z); c.fov = 22; c.updateProjectionMatrix(); __gfx.render(0.016); return 1; })()`);
      else await ev(`__line.at(${i}, ${JSON.stringify(v)})`);
      await shot(`${OUT}_${nm.replace(/ /g, '_')}_${v}.jpg`); } }
  console.log('done');
}
