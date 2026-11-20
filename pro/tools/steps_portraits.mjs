// the menu's portraits of the players named in NAMES (by display name), saved as OUT_<name>.png
export default async function ({ ev, shot }) {
  const fs = await import('node:fs'), E = process.env, OUT = E.OUT || '/tmp/rally-work2/heads/p';
  for (let i = 0; i < 120 && !(await ev('!!(window.__app && __app.faces && Object.keys(__app.faces).length > 20)')); i++) await new Promise(r => setTimeout(r, 500));
  const info = await ev(`(() => { const k = Object.keys(__app.faces); const v = __app.faces[k[0]]; return k.length + ' ' + k.slice(0, 3).join(',') + ' ' + (typeof v) + ' ' + (v && v.constructor && v.constructor.name) + ' ' + String(v).slice(0, 40); })()`); console.log(info);
  const want = (E.NAMES || '').split(',');
  const got = await ev(`(async () => { const { PLAYERS } = await import('./js/data.js'); const o = {}; for (const [id, pl] of Object.entries(PLAYERS)) { const n = pl.facts.name; if (!${JSON.stringify(want)}.includes(n)) continue; const v = __app.faces[id + '|default']; if (!v) { o[n] = null; continue; }
    if (typeof v === 'string') o[n] = v; else if (v.toDataURL) o[n] = v.toDataURL('image/png'); else if (v.src) o[n] = v.src; } return o; })()`);
  for (const [n, d] of Object.entries(got || {})) { if (!d) { console.log('none', n); continue; } fs.writeFileSync(`${OUT}_${n.replace(/ /g, '_')}.png`, Buffer.from(d.split(',')[1], 'base64')); }
  console.log('saved', Object.keys(got || {}).length);
}
