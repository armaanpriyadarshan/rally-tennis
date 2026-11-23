// Every event's trophy (trophies.js) stood in rows on the court of VEN, shot from in front at eye height, ten to a picture, the
// event's key on a card under each; with a 1.85 m man-sized post at the left end of each row for scale. OUT_<row>.jpg
export default async function ({ ev, shot }) {
  const E = process.env, OUT = E.OUT || '/tmp/rally-work2/tl/row';
  console.log(await ev(`(async () => {
    const A = window.__app, D = await import('./js/data.js'), TR = await import('./js/trophies.js'), THREE = await import('three'); const T = D.TOURNAMENTS.find(t => t.key === ${JSON.stringify(E.VEN || 'ao')});
    await A.game.start({ T, weather: 'clear', p0: 0, p1: 1, format: 'classic', difficulty: 1, cam: 'tv', intro: false, demo: true, seed: 3, firstServer: 0 });
    A.mode = 'match'; A.loop = () => {}; const g = A.game; g.running = false; for (const f of g.fig) f.group.visible = false; if (g.match.ball) g.match.ball.visible = false;
    for (const el of document.body.querySelectorAll('body > *:not(canvas)')) el.style.display = 'none';
    const keys = ${JSON.stringify((E.KEYS || '').split(',').filter(Boolean))}.length ? ${JSON.stringify((E.KEYS || '').split(',').filter(Boolean))} : D.TOURNAMENTS.map(t => t.key);
    const grp = new THREE.Group(); g.gfx.scene.add(grp); window.__tl = { g, grp, keys, rows: Math.ceil(keys.length / 10) };
    keys.forEach((k, i) => { const t = TR.buildTrophy(k), r = Math.floor(i / 10), c = i % 10; t.position.set(-2.7 + c * 0.6, 0, 6 - r * 40); grp.add(t);
      const cv = document.createElement('canvas'); cv.width = 128; cv.height = 40; const x = cv.getContext('2d'); x.fillStyle = '#111'; x.fillRect(0, 0, 128, 40); x.fillStyle = '#fff'; x.font = 'bold 28px sans-serif'; x.textAlign = 'center'; x.fillText(k, 64, 30);
      const card = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.094), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) })); card.position.set(-2.7 + c * 0.6, 0.06, 6.35 - r * 40); card.rotation.x = -0.6; grp.add(card); });
    for (let r = 0; r < window.__tl.rows; r++) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.85, 8), new THREE.MeshStandardMaterial({ color: '#c33' })); post.position.set(-3.3, 0.925, 6 - r * 40); grp.add(post); }
    return 'trophies ' + keys.length; })()`));
  const rows = await ev('window.__tl.rows');
  for (let r = 0; r < rows; r++) {
    await ev(`(() => { const { g } = window.__tl, cam = g.gfx.camera; cam.position.set(-0.05, 0.42, 8.6 - ${r} * 40); cam.lookAt(-0.05, 0.25, 6 - ${r} * 40); cam.fov = 44; cam.updateProjectionMatrix(); g.gfx.render(0); return 1; })()`);
    await shot(`${OUT}_${r}.jpg`);
  }
}
