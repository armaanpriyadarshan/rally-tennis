// Bake every player's menu portrait, in every kit he wears (his ordinary one and each major's), with the game's own portrait
// renderer, into assets/portraits/<name>-<kit>.webp and their index js/portraitfiles.js. The menus then load pictures instead of
// building, posing and reading back a figure for each card (seconds of a frozen page the first time the player list opened).
// Run again whenever a look, kit, face or body changes:   node tools/shot.mjs "file://$PWD/index.html" --steps tools/steps_bakeportraits.mjs
import fs from 'node:fs';
import path from 'node:path';
export default async function ({ ev }) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), dir = path.join(root, 'assets/portraits');
  fs.mkdirSync(dir, { recursive: true });
  await ev(`(async () => { for (let k = 0; k < 600; k++) { const A = window.__app; if (A && A.model && A.mode === 'menu') return 1; await new Promise(r => setTimeout(r, 50)); } return 0; })()`);
  const list = JSON.parse(await ev(`(async () => { const D = await import('./js/data.js'); const kits = ['default', ...new Set(D.TOURNAMENTS.map(t => D.kitEvent(t.key)))];
    return JSON.stringify(D.PLAYERS.map((P, id) => ({ id, name: P.facts.name, kits }))); })()`));
  const slug = n => n.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const index = {}; let bytes = 0;
  for (const P of list) for (const ek of P.kits) {
    const url = await ev(`(async () => { const A = window.__app, D = await import('./js/data.js'), R = await import('./js/portraits.js');
      return R.renderPortraits(A.gfx.renderer, A.model, [D.PLAYERS[${P.id}]], i => D.lookAt(i, ${JSON.stringify(ek)}))[${P.id}]; })()`);
    const m = /^data:image\/(\w+);base64,(.*)$/.exec(url || ''); if (!m) { console.log('FAILED', P.name, ek); continue; }
    const file = `${slug(P.name)}-${ek}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`, buf = Buffer.from(m[2], 'base64');
    fs.writeFileSync(path.join(dir, file), buf); index[P.name + '|' + ek] = 'assets/portraits/' + file; bytes += buf.length;
  }
  fs.writeFileSync(path.join(root, 'js/portraitfiles.js'), '// Each player\'s menu portrait in each kit, baked by tools/steps_bakeportraits.mjs (run it again when a look changes).\n' +
    'export const PORTRAIT_FILES = ' + JSON.stringify(index, null, 0).replace(/","/g, '",\n  "') + ';\n');
  console.log('baked', Object.keys(index).length, 'portraits,', Math.round(bytes / 1024), 'kB');
}
