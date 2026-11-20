// Minimal Chrome DevTools driver: load a page in headless Chromium, optionally run steps, save a screenshot.
// usage: node shot.mjs <url> <out.png> [--w 1600] [--h 900] [--wait 800] [--steps file.mjs] [--eval "js"] [--info]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const argv = process.argv.slice(2), url = argv[0], out = argv[1] && !argv[1].startsWith('--') ? argv[1] : null;
const opt = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
const W = +(opt('w') || 1600), H = +(opt('h') || 900), PORT = +(opt('port') || 9333);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function up() { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); return r.ok; } catch (e) { return false; } }
// (a browser this run started is closed again at the end, and its profile deleted: /tmp is memory on his machine, and left
// running, one idle Chromium and a 170 MB profile per port piled up; --keep leaves it up for the next run)
let spawned = null;
const finish = code => { if (spawned && !argv.includes('--keep')) { try { process.kill(-spawned.pid, 'SIGTERM'); } catch (e) {} try { fs.rmSync(`/tmp/rallypro-chrome-profile-${PORT}`, { recursive: true, force: true }); } catch (e) {} } process.exit(code); };
if (!(await up())) {
  const args = ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check', `--user-data-dir=/tmp/rallypro-chrome-profile-${PORT}`, '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl', '--enable-webgl', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--hide-scrollbars', `--window-size=${W},${H}`, ...(process.env.CHROME_FLAGS ? process.env.CHROME_FLAGS.split(' ') : []), 'about:blank'];
  const p = spawn(process.env.CHROME || 'chromium', args, { detached: true, stdio: 'ignore' }); p.unref(); spawned = p;
  for (let i = 0; i < 60 && !(await up()); i++) await sleep(200);
}
const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pend = new Map(); const logs = [];
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map(a => a.value !== undefined ? a.value : (a.description || a.type)).join(' ')); else if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION: ' + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text) + ' @' + (m.params.exceptionDetails.url||'') + ':' + m.params.exceptionDetails.lineNumber); else if (m.method === 'Log.entryAdded') logs.push('LOG ' + m.params.entry.level + ': ' + m.params.entry.text + ' ' + (m.params.entry.url || '')); });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr, awaitP = true) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: awaitP, returnByValue: true }); if (r.result && r.result.exceptionDetails) return 'ERR ' + JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description); return r.result && r.result.result ? r.result.result.value : undefined; };
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
for (let i = 0; i < 150; i++) { if (await ev('window.__ready === true')) break; await sleep(100); }
await sleep(+(opt('wait') || 600));
const key = async (k, type = 'keyDown', code) => send('Input.dispatchKeyEvent', { type, key: k, code: code || (k.length === 1 ? 'Key' + k.toUpperCase() : k), windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : ({ Enter: 13, Escape: 27, ' ': 32, Tab: 9, Shift: 16 }[k] || 0), text: type === 'keyDown' && k.length === 1 ? k : undefined });
const mouse = async (type, x, y, button = 'left', extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button, clickCount: type === 'mouseMoved' ? 0 : 1, buttons: type === 'mouseReleased' ? 0 : (button === 'left' ? 1 : 2), ...extra });
const shot = async file => { const r = await send('Page.captureScreenshot', { format: file.endsWith('.jpg') ? 'jpeg' : 'png', quality: 88 }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); };
const api = { send, ev, sleep, key, mouse, shot, logs };
if (opt('eval')) console.log('eval →', JSON.stringify(await ev(opt('eval'))));
if (opt('steps')) { const mod = await import(fs.realpathSync(opt('steps'))); await mod.default(api); }
if (out && out !== '-') await shot(out);
if (argv.includes('--info')) console.log('info →', await ev('document.getElementById("i") ? document.getElementById("i").textContent : ""'));
if (logs.length) console.log(logs.slice(0, 40).join('\n'));
await send('Page.close').catch(() => {}); ws.close(); await sleep(150); finish(0);
