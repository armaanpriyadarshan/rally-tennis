// Minimal Firefox driver over WebDriver BiDi, for timing the game in the browser it is played in: starts a headless Firefox on a
// throwaway profile (FFPREFS: extra prefs as k=v,k=v), loads the page, runs a steps module with { ev } as shot.mjs does.
// usage: node ff.mjs <url> [--port 9470] [--w 1920] [--h 1080] [--steps file.mjs]
import { spawn } from 'node:child_process'; import fs from 'node:fs';
const a = process.argv.slice(2), url = a[0], opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const PORT = +opt('port', 9470), W = +opt('w', 1920), H = +opt('h', 1080), prof = `/tmp/rally-ff-profile-${PORT}`;
fs.rmSync(prof, { recursive: true, force: true }); fs.mkdirSync(prof, { recursive: true });
const prefs = { 'browser.shell.checkDefaultBrowser': false, 'datareporting.policy.dataSubmissionEnabled': false, 'toolkit.telemetry.enabled': false, 'browser.startup.homepage_override.mstone': 'ignore', 'app.update.enabled': false, 'media.autoplay.default': 0, 'webgl.force-enabled': true, 'browser.sessionstore.resume_from_crash': false,
  ...Object.fromEntries((process.env.FFPREFS || '').split(',').filter(Boolean).map(s => { const [k, v] = s.split('='); return [k, isNaN(+v) ? (v === 'true' ? true : v === 'false' ? false : v) : +v]; })) };
fs.writeFileSync(prof + '/user.js', Object.entries(prefs).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n'));
const p = spawn(process.env.FIREFOX || 'firefox', ['--headless', '--no-remote', '--profile', prof, '--remote-debugging-port', String(PORT), `--window-size=${W},${H}`, 'about:blank'], { detached: true, stdio: 'ignore' }); p.unref();
// (/tmp is memory here: the throwaway profile and the add-on archive Firefox copies into /tmp at each start go when it does)
const xpi0 = new Set(fs.readdirSync('/tmp').filter(f => /^tmp-.*\.xpi$/.test(f)));
const kill = () => { try { process.kill(-p.pid); } catch {} try { p.kill('SIGKILL'); } catch {}
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
  for (const f of fs.readdirSync('/tmp')) if (/^tmp-.*\.xpi$/.test(f) && !xpi0.has(f)) try { fs.rmSync('/tmp/' + f); } catch {} };
process.on('exit', kill);
let ws; for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 500)); try { ws = new WebSocket(`ws://127.0.0.1:${PORT}/session`); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); break; } catch { ws = null; } }
if (!ws) { console.error('no firefox'); process.exit(1); }
let id = 0; const pend = new Map(); ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method === 'log.entryAdded' && process.env.FFLOG) console.log('LOG', m.params.level, m.params.text); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('session.new', { capabilities: {} });
const ctx = (await send('browsingContext.getTree', {})).result.contexts[0].context;
await send('session.subscribe', { events: ['log.entryAdded'] });
await send('browsingContext.setViewport', { context: ctx, viewport: { width: W, height: H } });
await send('browsingContext.navigate', { context: ctx, url, wait: 'complete' });
const ev = async expr => { const r = await send('script.evaluate', { expression: expr, target: { context: ctx }, awaitPromise: true, resultOwnership: 'none' });
  if (r.error) return 'ERR ' + r.error + ' ' + r.message; if (r.result.type === 'exception') return 'ERR ' + JSON.stringify(r.result.exceptionDetails.text); const v = r.result.result; return v && 'value' in v ? v.value : v && v.type; };
for (let i = 0; i < 120; i++) { if (await ev('!!(window.__app && window.__app.game && window.__app.game.arena)') === true) break; await new Promise(r => setTimeout(r, 500)); }
if (opt('steps')) { const mod = await import(fs.realpathSync(opt('steps'))); await mod.default({ ev, send }); }
ws.close(); kill(); process.exit(0);
