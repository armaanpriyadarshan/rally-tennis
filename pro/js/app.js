// Rally Pro — the application: menus, match set-up, tournaments and the season, and the
// broadcast graphics over a match (score bug, flags, straps, statistics). Few words, big type.
import { Gfx, QUALITY } from './render.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { PLAYERS, TOURNAMENTS, DIFFICULTY, ROUND_NAME, playerByName, lookAt, surfaceEdge, eventEdge, SURFACE_PLAY, kitEvent, eventSeeding } from './data.js';
import { loadPerson } from './people.js';
import { renderPortraits } from './portraits.js';
import { PORTRAIT_FILES } from './portraitfiles.js';
import { rollWeather } from './skies.js';
import { Season, Draw, simMatch, scoreLine, rng } from './season.js';
import { TIMING } from './sim.js';
import { Net } from './net.js';

const $ = s => document.querySelector(s);
const BLANK_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';   // a card's picture until his portrait is drawn
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pname = id => PLAYERS[id].facts.name;
const TIER = { slam: ['#ffffff', 'Grand Slam'], m1000: ['var(--gold)', 'Masters 1000'], 500: ['var(--silver)', 'ATP 500'], finals: ['var(--lime)', 'Finals'] };
// a name as the tour's graphics set it: first name light, SURNAME bold
const full = id => { const f = PLAYERS[id].facts, first = (f.full || '').replace(new RegExp('\\s*' + f.name + '$'), ''); return `${first ? esc(first) + ' ' : ''}<b>${esc(f.name)}</b>`; };
const MARK = 'Rally<small><em style="font-style:normal;font-weight:700">Pro</em> Tour</small>';
const clockText = t => { const m = Math.floor(t / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const SFC = { hard: 'var(--hard)', clay: 'var(--clay)', grass: 'var(--grass)' };
const RND = { R16: 'Round 1', QF: 'Quarter-final', SF: 'Semi-final', F: 'Final' };
const wait = ms => new Promise(r => setTimeout(r, ms));
// Run from the developer's own machine, the game keeps a play log (keys pressed for a shot and what came of them)
// and hands it to the local server, so a control that misbehaves can be seen as it was played. Nowhere else.
const KIT_EVENTS = ['ao', 'rg', 'wim', 'us'];
const LOCAL = location.hostname === '127.0.0.1' || location.hostname === 'localhost';

const SAVE = 'rallypro.settings.v1';
const DEFAULTS = { controls: 'classic', assist: 1, aimSens: 1, fov: 68, quality: 2, volume: 0.8, voice: true, markers: true, replays: 'best', cam: 'tv', difficulty: 1, format: 'atp3', player: null, tips: 0 };

class App {
  constructor() {
    const saved = JSON.parse(localStorage.getItem(SAVE) || '{}');
    this.set = { ...DEFAULTS, ...saved };
    if (!saved.rev) this.set.assist = DEFAULTS.assist;
    if (this.set.format === 'auto' || this.set.format === 'short') this.set.format = 'atp3';   // (Tour and Short are no longer offered: three sets)
    // (the broadcast camera is the default view from 2026-11-23, "make the default pov the broadcast": a setting saved before then, which
    // held the old default, is moved to it once; V still changes it)
    if (!saved.camTv) { this.set.cam = 'tv'; this.set.camTv = 1; try { localStorage.setItem(SAVE, JSON.stringify(this.set)); } catch (e) {} }
    if ((saved.rev || 0) < 3) this.set.player = null;        // the tour is twelve players now: old picks no longer point at the same man
    if ((saved.rev || 0) < 4) { this.set.controls = 'classic'; this.set.cam = 'chase'; }     // the first game's controls, seen from behind the player
    if ((saved.rev || 0) < 5) { this.set.cam = 'fp'; this.set.assist = 1; }                  // first person, with Assist footwork (2026-11-11)
    this.set.rev = 5;
    const canvas = $('#view');
    this.gfx = new Gfx(canvas, { quality: this.set.quality });
    this.input = new Input(canvas);
    this.audio = new Audio(); this.audio.vol = this.set.volume; this.audio.voiceOn = false;                    // no spoken calls
    this.game = new Game(this.gfx, { input: this.input, ui: this, audio: this.audio, opts: this.set });
    this.ui = $('#ui'); this.hud = $('#hud');
    this.mode = 'menu';
    const p0 = this.set.player != null && PLAYERS[this.set.player] ? this.set.player : playerByName('Alcaraz').id;
    this.sel = { p0, p1: playerByName(p0 === playerByName('Sinner').id ? 'Alcaraz' : 'Sinner').id, T: TOURNAMENTS.find(t => t.key === 'us'), session: 'auto' };
    this.ctx = null; this.faces = {};
    this.fbT = 0; this.callT = 0; this.tipKey = '';
    addEventListener('resize', () => { this.gfx.resize(); if (this.game.fx) this.game.fx.setViewport(this.gfx.h); });
    addEventListener('keydown', e => this.key(e));
    for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => this.audio.unlock(), { passive: true });
    this.input.onLock = on => { if (!on && !this.input.soft && this.mode === 'match' && !this.game.over && !this.paused) this.pause(true); };
    this.last = performance.now();
    requestAnimationFrame(t => this.loop(t));
  }
  save() { localStorage.setItem(SAVE, JSON.stringify(this.set)); }
  async boot() {
    await this.attract();
    // every player's picture for the menus, from his own figure
    // (drawn in the background a few a frame, not all before the menu opens: twenty-eight figures built, posed and read back in
    // one go held the loading screen up for seconds, longest on a Mac's Safari)
    // (and baked ahead of time where they can be, tools/steps_bakeportraits.mjs: the menus then only load pictures, and the figure
    // to draw any other is loaded behind the menu, not before it)
    if (globalThis.__faceSyncOld) { try { this.model = await loadPerson('m04'); for (const [id, v] of Object.entries(renderPortraits(this.gfx.renderer, this.model, PLAYERS, id => lookAt(id, 'default')))) this.faces[id + '|default'] = v; } catch (e) { console.warn('portraits', e); } }
    else { PLAYERS.forEach((P, id) => { const f = PORTRAIT_FILES[P.facts.name + '|default']; if (f) this.faces[id + '|default'] = f; else this.wantFace(id, 'default'); });
      loadPerson('m04').then(m => { this.model = m; }).catch(e => console.warn('portraits', e)); }
    this.home(); this.unwipe();
  }
  loop(now) {
    requestAnimationFrame(t => this.loop(t));
    this.pumpFaces();
    // how often this screen asks for a picture
    const gap = now - (this.prevNow || now); this.prevNow = now;
    if (gap > 2 && gap < 50) this.gapAvg = this.gapAvg ? this.gapAvg * 0.95 + gap * 0.05 : gap;
    // and the screen's own refresh, which a late frame does not change: the shortest gap, followed while gaps stay near it (the
    // average above grows with every frame that misses the screen, and with it the frame time the resolution is held to, so a game
    // running at forty frames a second on a sixty hertz screen was never thought slow)
    if (gap > 3 && gap < 50) { const r = this.refresh || gap; this.refresh = gap < r * 0.97 ? gap : gap < r * 1.4 ? r + (gap - r) * 0.02 : (this.mode !== 'match' && gap < 50) ? r + (gap - r) * 0.002 : r; }
    // a match is drawn about sixty times a second however fast the screen is (every second picture of a
    // 120 Hz screen, so still evenly); the match behind the menus thirty; under a full menu not at all
    const inMenu = this.mode !== 'match', every = Math.max(1, Math.floor((inMenu ? 33.3 : 16.7) / (this.gapAvg || 16.7) + 0.25));
    this.tick = (this.tick || 0) + 1;
    if (this.tick % every) return;
    if (inMenu && this.covered) { this.last = now; return; }
    this.gfx.expect = globalThis.__expectOld ? every * (this.gapAvg || 16.7) : Math.max(15, every * (this.refresh || this.gapAvg || 16.7)); this.gfx.measure = !inMenu;   // (a match is held to about sixty, not to a fast screen's every refresh)
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (this.game.running) this.game.frame(dt);
  }
  // two computer players behind the menus
  async attract() {
    const big = TOURNAMENTS.filter(t => t.level !== '500' && !t.indoor), T = big[Math.floor(Math.random() * big.length)];
    const a = Math.floor(Math.random() * PLAYERS.length); let b = Math.floor(Math.random() * PLAYERS.length); if (b === a) b = (a + 1) % PLAYERS.length;
    this.mode = 'menu'; this.hud.classList.add('hidden'); this.input.enabled = false; this.input.unlock();
    await this.game.start({ T, weather: rollWeather(T, T.night && Math.random() < 0.4 ? 'night' : 'day'), p0: a, p1: b, demo: true, cam: 'tv', pace: 0.55, format: 'atp3' });
    this.audio.setVolume(this.set.volume * 0.35);
  }

  // ---------- the wipe: two slabs close over the picture, the scene changes behind them ----------
  wipe(text, sub) {
    const w = $('#wipe'); clearTimeout(this.stingT);
    w.querySelector('b').innerHTML = text ? esc(text) + (sub ? `<small>${esc(sub)}</small>` : '') : MARK;
    w.className = 'in';
    return wait(text ? 700 : 420);
  }
  unwipe() { $('#wipe').className = ''; }

  // ---------- screens ----------
  screen(html, cls, full) { this.ui.innerHTML = `<div class="screen ${cls || ''}">${html}</div>`; const s = $('#shade'); s.className = full ? 'full' : ''; s.style.opacity = 1; this.covered = !!full; return this.ui.firstChild; }
  on(sel, fn) { this.ui.querySelectorAll(sel).forEach(n => n.addEventListener('click', e => fn(n, e))); }
  bar(title, extra) { return `<div class="bar"><button class="back" data-back>‹</button><h2>${title}</h2><span class="sp"></span>${extra || ''}</div>`; }
  home() {
    const S = Season.load(), on = S && !S.done;
    this.screen(`
      <div class="mark"><b>Rally</b><span><em>Pro</em> Tour</span></div>
      <div class="corner"><button class="btn sm" data-go="how">Controls</button><button class="btn sm" data-go="settings">Settings</button></div>
      <div class="tiles">
        <button class="tile main" data-go="quick"><i>Exhibition</i><b>Play</b></button>
        <button class="tile" data-go="tour"><i>Thirty events</i><b>Tournament</b></button>
        <button class="tile" data-go="season"><i>${on ? esc(pname(S.human)) + ' · Week ' + (S.ev + 1) : 'The full year'}</i><b>${on ? 'Continue' : 'Season'}</b></button>
        <button class="tile" data-go="online"><i>Against a friend</i><b>Online</b></button>
      </div>`, 'home');
    this.on('[data-go]', n => this[n.dataset.go]());
  }
  how() {
    const classic = this.set.controls === 'classic';
    const K = classic ? [['↑ ↓ ← →  /  W A S D', 'Move'], ['Space', 'Toss · Serve · Hit'], ['Hold ← or →', 'As you swing: angle'], ['Hold ↑ / ↓', 'As you swing: lob or deep · drop shot'], ['Hold ↑ / ↓', 'As you serve: kick · slice'], ['Space at the top', 'Of the toss: more pace'], ['V', 'Camera'], ['Tab', 'Statistics'], ['M', 'Sound'], ['Esc', 'Pause']]
      : [['Mouse', 'Aim'], ['Tap', 'Rally ball'], ['Hold', 'Drive · longer is harder'], ['Release', 'As the ring closes'], ['Right button', 'Slice'], ['Shift', 'Flat'], ['Q', 'Lob'], ['E', 'Drop shot'],
        ['W A S D', 'Move'], ['Space', 'Split step'], ['Click · Click', 'Toss · Serve'], ['V', 'Camera'], ['Tab', 'Statistics'], ['Esc', 'Pause']];
    this.screen(this.bar('Controls', `<span class="chips">${[['classic', 'Classic'], ['mouse', 'Mouse']].map(([k, n]) => `<span class="chip ${this.set.controls === k ? 'on' : ''}" data-ctl="${k}">${n}</span>`).join('')}</span>`) + `<div class="keys">${K.map(([k, t]) => `<kbd>${k}</kbd><span>${t}</span>`).join('')}</div>`, '', true);
    this.on('[data-back]', () => this.home());
    this.on('[data-ctl]', n => { this.set.controls = n.dataset.ctl; this.save(); this.how(); });
  }
  settings(back) {
    const s = this.set, chips = (key, list) => `<span class="chips">${list.map(([v, n]) => `<span class="chip ${String(s[key]) === String(v) ? 'on' : ''}" data-set="${key}" data-v="${v}">${n}</span>`).join('')}</span>`;
    const row = (l, h) => `<span class="lab">${l}</span><span>${h}</span>`, range = (key, a, b, st) => `<input type="range" min="${a}" max="${b}" step="${st}" value="${s[key]}" data-range="${key}">`;
    const html = this.bar('Settings') + `<div class="sheet">
      ${row('Controls', chips('controls', [['classic', 'Classic'], ['mouse', 'Mouse']]))}
      ${row('Footwork', chips('assist', [[2, 'Auto'], [1, 'Assist'], [0, 'Manual']]))}
      ${row('Camera', chips('cam', [['fp', 'First person'], ['chase', 'Behind'], ['tv', 'Broadcast']]))}
      ${row('Aim speed', range('aimSens', 0.4, 2.2, 0.05))}
      ${row('Field of view', range('fov', 55, 85, 1))}
      ${row('Graphics', chips('quality', QUALITY.map((q, i) => [i, q.name])))}
      ${row('Aim ring', chips('markers', [[true, 'On'], [false, 'Off']]))}
      ${row('Replays', chips('replays', [['best', 'Great winners'], ['off', 'Off']]))}
      ${row('Volume', range('volume', 0, 1, 0.05))}</div>`;
    const host = back ? $('#overlay') : this.ui;
    if (back) { host.className = ''; host.innerHTML = `<div class="screen" style="background:rgba(2,6,14,.92)">${html}</div>`; } else this.screen(html, '', true);
    host.querySelectorAll('[data-back]').forEach(n => n.onclick = () => back ? back() : this.home());
    host.querySelectorAll('[data-set]').forEach(n => n.onclick = () => { let v = n.dataset.v; v = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v; this.set[n.dataset.set] = v; this.apply(n.dataset.set); this.settings(back); });
    host.querySelectorAll('[data-range]').forEach(n => n.oninput = () => { this.set[n.dataset.range] = +n.value; this.apply(n.dataset.range); });
  }
  apply(k) {
    const s = this.set; this.save(); Object.assign(this.game.opts, s);
    if (k === 'quality') this.gfx.setQuality(s.quality);
    if (k === 'volume') this.audio.setVolume(this.mode === 'match' ? s.volume : s.volume * 0.35);
    if (k === 'cam' && this.mode === 'match') this.game.setCamera(s.cam);
  }

  // ---------- players and events as cards ----------
  // his picture in the kit he wears at that event (each major has its own), drawn the first time it is wanted
  // (asked for and not yet drawn, it is queued and the card shows his default kit, or nothing, until it is: drawn there and then for
  // every card on the screen, the player list's first opening froze the game for seconds)
  face(id, T) {
    const ek = T ? kitEvent(T.key) : 'default', k = id + '|' + ek;
    if (!this.faces[k] && !globalThis.__faceSyncOld && PORTRAIT_FILES[PLAYERS[id].facts.name + '|' + ek]) this.faces[k] = PORTRAIT_FILES[PLAYERS[id].facts.name + '|' + ek];
    if (!this.faces[k] && this.model) { if (globalThis.__faceSyncOld) { try { this.faces[k] = renderPortraits(this.gfx.renderer, this.model, [PLAYERS[id]], i => lookAt(i, ek))[id]; } catch (e) { console.warn('portrait', e); } } else this.wantFace(id, ek); }
    return this.faces[k] || this.faces[id + '|default'];
  }
  wantFace(id, ek) { const k = id + '|' + ek; this.faceWant = this.faceWant || new Set(); this.faceQ = this.faceQ || []; if (this.faces[k] || this.faceWant.has(k)) return; this.faceWant.add(k); this.faceQ.push({ id, ek, k }); }
  // a few portraits a frame, about ten milliseconds' worth, and every card waiting for one is given it as it comes
  pumpFaces() {
    if (!this.faceQ || !this.faceQ.length || !this.model || this.mode === 'match') return;
    const t0 = performance.now();
    while (this.faceQ.length && performance.now() - t0 < 10) {
      const q = this.faceQ.shift(); if (this.faces[q.k]) continue;
      try { this.faces[q.k] = renderPortraits(this.gfx.renderer, this.model, [PLAYERS[q.id]], i => lookAt(i, q.ek))[q.id]; } catch (e) { console.warn('portrait', e); continue; }
      for (const im of document.querySelectorAll('img[data-k="' + q.k + '"]')) im.src = this.faces[q.k];
      if (q.ek === 'default') for (const im of document.querySelectorAll('img[data-d="' + q.id + '"]')) if (im.dataset.blank) { delete im.dataset.blank; if (!this.faces[im.dataset.k]) im.src = this.faces[q.k]; }
    }
  }
  card(id, who, cls, T) {
    const P = PLAYERS[id], f = P.facts, b = P.base, L = T ? lookAt(id, T.key) : P.look, img = this.face(id, T), fk = id + '|' + (T ? kitEvent(T.key) : 'default');
    return `<button class="pl ${cls || ''}" data-p="${id}"><span class="kit" style="background:radial-gradient(120% 90% at 50% 0%, ${L.top} 0%, transparent 62%)"></span><img data-k="${fk}" data-d="${id}" ${img ? `src="${img}"` : `src="${BLANK_IMG}" data-blank="1"`} alt="">
      ${who ? `<span class="who">${who}</span>` : ''}${T ? this.edge(id, T, 'card') : ''}
      <span class="nums"><span><b>${Math.round(b.s1Kmh)}</b><span class="lab">Serve</span></span><span><b>${Math.round(b.fhKmh)}</b><span class="lab">Forehand</span></span></span>
      <span class="nm"><b>${esc(f.name)}</b><span>${esc(f.country || '')} · ${f.cm} cm · ${f.lefty ? 'Left' : 'Right'}${f.oneHandBh ? ' · One-hand' : ''}</span></span></button>`;
  }
  // how much better (or worse) he is at this event than anywhere (on its surface where he has hardly played it):
  // shown only where it is worth knowing
  edge(id, T, where) {
    const surface = T.surface, e = eventEdge(id, T.key, surface); if (Math.abs(e.pct) < 3) return '';
    const sf = surface[0].toUpperCase() + surface.slice(1), ev = e.src === 'event';
    const title = ev ? `${e.wl[0]}–${e.wl[1]} here in his career, against his overall record` : `Career win rate on ${surface} against his overall`;
    return `<span class="edge ${e.pct > 0 ? 'up' : 'dn'}" title="${title}">${where === 'card' ? (ev ? e.wl[0] + '–' + e.wl[1] + ' ' : sf + ' ') : ''}${e.pct > 0 ? '+' : '−'}${Math.abs(e.pct)}%</span>`;
  }
  evTile(t, on, res) {
    return `<button class="ev ${on ? 'on' : ''} ${res ? 'done' : ''}" data-t="${t.key}" style="--tier:${TIER[t.level][0]};--sf:${SFC[t.surface]}"><i class="sf"></i><b>${esc(t.name)}</b><span>${TIER[t.level][1]}${t.indoor ? ' · Indoor' : ''}</span>${res ? `<i class="res">${esc(res)}</i>` : ''}</button>`;
  }
  pick(side, done) {
    this.screen(this.bar(side ? 'Opponent' : 'Your player') + `<div class="grid12">${PLAYERS.map(p => this.card(p.id, '', p.id === (side ? this.sel.p1 : this.sel.p0) ? 'on' : '', this.sel.T)).join('')}</div>`, '', true);
    this.on('[data-back]', done);
    this.on('[data-p]', n => {
      const id = +n.dataset.p, s = this.sel;
      if (side) { if (id === s.p0) s.p0 = s.p1; s.p1 = id; } else { if (id === s.p1) s.p1 = s.p0; s.p0 = id; this.set.player = id; this.save(); }
      done();
    });
  }
  options() {
    const s = this.set, fm = [['slam5', 'Five sets'], ['atp3', 'Three sets'], ['one', 'One set'], ['classic', 'Classic'], ['tb10', 'Tiebreak']];   /* (named by what they are, he asked: "five sets, three sets instead of tour and short"; Classic before Tiebreak) */
    return `<span class="chips">${fm.map(([k, n]) => `<span class="chip ${s.format === k ? 'on' : ''}" data-f="${k}">${n}</span>`).join('')}</span>
      <span class="chips">${DIFFICULTY.map((d, i) => `<span class="chip ${s.difficulty === i ? 'on' : ''}" data-d="${i}">${d.name}</span>`).join('')}</span>`;
  }
  wire(redraw) {
    this.on('[data-f]', n => { this.set.format = n.dataset.f; this.save(); redraw(); });
    this.on('[data-d]', n => { this.set.difficulty = +n.dataset.d; this.save(); redraw(); });
    this.on('[data-s]', n => { this.sel.session = n.dataset.s; redraw(); });
  }
  quick() {
    const s = this.sel, ses = [['auto', 'Auto'], ['day', 'Day'], ['night', 'Night']];
    this.screen(this.bar('Match') + `
      <div class="h2h">${this.card(s.p0, 'You', 'me', s.T)}<div class="vs">V</div>${this.card(s.p1, 'Opponent', 'opp', s.T)}</div>
      <div class="strip">${TOURNAMENTS.map(t => this.evTile(t, t === s.T)).join('')}</div>
      <div class="foot"><span class="chips">${ses.map(([k, n]) => `<span class="chip ${s.session === k ? 'on' : ''}" data-s="${k}">${n}</span>`).join('')}</span>${this.options()}<span class="sp"></span><button class="btn go" data-start>Play</button></div>`, '', true);
    this.on('[data-back]', () => this.home());
    this.on('.pl.me', () => this.pick(0, () => this.quick())); this.on('.pl.opp', () => this.pick(1, () => this.quick()));
    this.on('[data-t]', n => { s.T = TOURNAMENTS.find(t => t.key === n.dataset.t); this.quick(); });
    this.wire(() => this.quick());
    this.on('[data-start]', () => this.play({ kind: 'quick' }, s.p0, s.p1, s.T, null));
    const cur = this.ui.querySelector('.ev.on'); if (cur) cur.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
  // the field for an event: the best of the tour by ranking, with you in it
  // the field and its seeds for this event, drawn afresh each time an event is opened (its strength there, and form), and
  // kept until the draw is made from it, so the seeds shown are the seeds played
  fieldFor(T, me) {
    if (!this.seedings || this.seedings.key !== T.key) this.seedings = { key: T.key, order: eventSeeding(PLAYERS.map(p => p.id), T, rng((Date.now() ^ (Math.random() * 0xfffff)) & 0xfffff)) };
    const order = this.seedings.order;
    const field = order.slice(0, T.draw); if (!field.includes(me)) field[field.length - 1] = me;
    return order.filter(id => field.includes(id));
  }
  // An event as the tour presents it: its court drawn in its own colours, what it is worth round by round,
  // how it plays, and who is in it.
  eventPanel(T, me) {
    const field = this.fieldFor(T, me), byes = T.draw === 12 ? 4 : 0, pts = T.points || {}, R = T.rounds || [];
    const pace = T.pace > 4 ? 'Fast' : T.pace < -4 ? 'Slow' : 'Medium', fmt = n => Number(n).toLocaleString('en-GB');
    const court = `<svg viewBox="0 0 400 210" class="crt" aria-hidden="true"><rect width="400" height="210" rx="6" fill="${T.outer || '#3d7bd9'}"/><rect x="60" y="34" width="280" height="142" fill="${T.inner || T.outer || '#2a5aa8'}"/>
      <g fill="none" stroke="#f4f4ef" stroke-width="2.2"><rect x="60" y="34" width="280" height="142"/><line x1="60" y1="52" x2="340" y2="52"/><line x1="60" y1="158" x2="340" y2="158"/><line x1="135" y1="52" x2="135" y2="158"/><line x1="265" y1="52" x2="265" y2="158"/><line x1="135" y1="105" x2="265" y2="105"/></g>
      <line x1="200" y1="26" x2="200" y2="184" stroke="#0b0d12" stroke-width="3"/><circle cx="200" cy="26" r="3.5" fill="#0b0d12"/><circle cx="200" cy="184" r="3.5" fill="#0b0d12"/></svg>`;
    const tile = (k, v, sub) => `<div class="tl"><span class="lab">${k}</span><b>${v}</b>${sub ? `<i>${sub}</i>` : ''}</div>`;
    const path = R.map(r => `<div><span>${RND[r] || r}</span><b>${fmt(pts[r] || 0)}</b></div>`).join('') + `<div class="w"><span>Champion</span><b>${fmt(pts.W || 0)}</b></div>`;
    const rows = field.map((id, i) => `<div class="${id === me ? 'me' : ''}"><small>${i < 8 ? i + 1 : ''}</small><b>${esc(pname(id))}</b><i>${esc(PLAYERS[id].facts.country || '')}</i>${this.edge(id, T)}${i < byes ? '<em>Bye</em>' : ''}</div>`).join('');
    return `<div class="evp" style="--tier:${TIER[T.level][0]}">
      <div class="hd"><span class="lab">${TIER[T.level][1]} · ${esc(T.month || '')}</span><b>${esc(T.name)}</b><span class="lab">${esc(T.court || '')} · ${esc(T.city || '')}${T.country ? ', ' + esc(T.country) : ''}</span></div>
      <div class="bd">
        <div class="lf">${court}
          <div class="tls">${tile('Surface', esc(T.surface), (SURFACE_PLAY[T.surface] || SURFACE_PLAY.hard).about)}${tile('Format', 'Best of ' + T.bestOf, 'Sets')}${tile('Court pace', pace, T.cpi ? 'CPI ' + T.cpi : '')}
            ${tile('Draw', T.draw, byes ? byes + ' byes' : 'Round robin')}${tile('Capacity', T.cap ? fmt(T.cap) : '—', 'Centre court')}${tile('Conditions', Math.round(T.temp) + '°', T.indoor ? 'Indoor' : (T.roof ? 'Roof · ' : '') + Math.round(T.windKmh) + ' km/h wind')}</div>
          <div class="pts"><span class="lab">Ranking points</span><div class="path">${path}</div></div></div>
        <div class="fld"><span class="lab">The field</span><div class="rows">${rows}</div></div>
      </div></div>`;
  }
  tour() {
    const s = this.sel, T = s.T;
    this.screen(this.bar('Tournament') + `
      <div class="strip" style="margin-top:calc(var(--u)*1.5)">${TOURNAMENTS.map(t => this.evTile(t, t === T)).join('')}</div>
      <div class="h2h" style="grid-template-columns:1fr 2fr">${this.card(s.p0, 'You', 'me', T)}${this.eventPanel(T, s.p0)}</div>
      <div class="foot">${this.options()}<span class="sp"></span><button class="btn go" data-enter>Enter</button></div>`, '', true);
    this.on('[data-back]', () => this.home());
    this.on('.pl.me', () => this.pick(0, () => this.tour()));
    this.on('[data-t]', n => { s.T = TOURNAMENTS.find(t => t.key === n.dataset.t); this.tour(); });
    this.wire(() => this.tour());
    this.on('[data-enter]', () => {
      const field = this.fieldFor(T, s.p0);
      this.draw = new Draw(T, field, s.p0, (Date.now() & 0xfffff)); this.seedings = null;
      this.drawView(null);
    });
    const cur = this.ui.querySelector('.ev.on'); if (cur) cur.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
  drawView(season) {
    const d = season ? season.draw : this.draw, T = d.T, me = d.human, hm = d.humanMatch(), bye = d.hasBye(me);
    const line = (id, m, top) => { if (id == null) return '<div><small></small><b>—</b></div>'; const w = m.res && m.res.winner === id, sc = m.res ? m.res.sets.map(x => x.g[m.res.a === id ? 0 : 1]).join(' ') : ''; void top;
      return `<div class="${w ? 'w' : ''} ${id === me ? 'you' : ''}"><small>${d.seedNo[id] || ''}</small><b>${esc(pname(id))}</b><i>${sc}</i></div>`; };
    const cols = d.rounds.map((r, ri) => `<div class="rnd"><span class="lab">${RND[T.rounds[ri]] || T.rounds[ri]}</span><div class="ms">${r.map(m => `<div class="tie ${m.a === me || m.b === me ? 'me' : ''}">${line(m.a, m, true)}${line(m.b, m)}</div>`).join('')}</div></div>`).join('');
    const champ = d.champion != null ? `<div class="champ"><span class="lab">Champion</span><b>${esc(pname(d.champion))}</b></div>` : '';
    let foot;
    if (d.champion != null) foot = `<span class="lab">${d.champion === me ? 'Title' : (RND[d.resultFor(me)] || '')}</span><span class="sp"></span><button class="btn go" data-done>Done</button>`;
    else if (hm) foot = `<span class="lab">${RND[d.roundName] || d.roundName} · v ${esc(pname(hm.a === me ? hm.b : hm.a))}</span><span class="sp"></span><button class="btn sm" data-sim>Sim match</button><button class="btn sm" data-simall>Sim all</button><button class="btn go" data-play>Play</button>`;
    else foot = `<span class="lab">${bye ? 'Bye' : d.alive(me) ? '' : 'Out · ' + (RND[d.resultFor(me)] || '')}</span><span class="sp"></span><button class="btn sm" data-simall>Sim all</button><button class="btn go" data-next>Next round</button>`;
    this.screen(this.bar(esc(T.name), `<span class="lab">${TIER[T.level][1]} · ${esc(T.surface)}</span>`) + `<div class="draw">${cols}${champ}</div><div class="foot">${foot}</div>`, '', true);
    const again = () => { if (season) season.save(); this.drawView(season); };
    this.on('[data-back]', () => season ? this.season() : this.tour());
    this.on('[data-play]', () => { d.simRound(false); this.play({ kind: 'draw', draw: d, match: hm, season }, me, hm.a === me ? hm.b : hm.a, T, d.roundName); });
    this.on('[data-sim]', () => { d.report(hm, simMatch(hm.a, hm.b, T, d.r)); d.simRound(false); again(); });
    this.on('[data-next]', () => { d.simRound(false); again(); });
    this.on('[data-simall]', () => { d.simAll(); again(); });
    this.on('[data-done]', () => { if (season) { season.close(); this.season(); } else this.tour(); });
  }
  season() {
    let S = this.S || Season.load();
    if (!S || (S.done && !this.S)) {
      this.screen(this.bar('Season') + `<div class="h2h" style="grid-template-columns:1fr 1.4fr">${this.card(this.sel.p0, 'You', 'me')}
        <div class="now"><span class="lab">${TOURNAMENTS.length} events · January to November</span><b>${S && S.done ? 'No. ' + S.rankOf(S.human) : 'The tour'}</b><span class="lab">${S && S.done ? esc(pname(S.human)) + ' · ' + S.pts[S.human] + ' points' : 'Four majors · nine Masters · the Finals'}</span></div></div>
        <div class="foot"><span class="sp"></span><button class="btn go" data-new>Start</button></div>`, '', true);
      this.on('[data-back]', () => this.home()); this.on('.pl.me', () => this.pick(0, () => { this.S = null; this.season(); }));
      this.on('[data-new]', () => { Season.clear(); this.S = new Season(this.sel.p0); this.S.save(); this.season(); });
      return;
    }
    this.S = S; this.sel.p0 = S.human;
    const T = S.event, rank = S.ranking(), me = S.human;
    const cal = TOURNAMENTS.map((t, i) => { const r = S.results[i]; return this.evTile(t, i === S.ev && !S.done, r ? (r.human === 'W' ? 'Won' : r.human || '—') : ''); }).join('');
    const rows = rank.map((id, i) => `<tr class="${id === me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(pname(id))}</td><td>${S.pts[id]}</td></tr>`).join('');
    let now, foot;
    if (S.done) { now = `<div class="now"><span class="lab">Year end</span><b>No. ${S.rankOf(me)}</b><span class="lab">${S.pts[me]} points · ${S.results.filter(r => r.human === 'W').length} titles</span></div>`; foot = '<span class="sp"></span><button class="btn go" data-reset>New season</button>'; }
    else { const q = S.qualified(T);
      now = `<div class="now" style="--tier:${TIER[T.level][0]}"><span class="lab">Week ${S.ev + 1} / ${TOURNAMENTS.length} · ${TIER[T.level][1]} · ${esc(T.surface)}</span><b>${esc(T.name)}</b><span class="lab">${q ? esc(T.court || '') : 'Top eight only'}</span></div>`;
      foot = `<button class="btn sm" data-abandon>Abandon</button><span class="sp"></span><button class="btn sm" data-simev>Sim event</button><button class="btn sm" data-simrest>Sim season</button>${q ? `<button class="btn go" data-enter>${S.draw ? 'Draw' : 'Enter'}</button>` : ''}`; }
    this.screen(this.bar(esc(pname(me)), `<span class="lab">No. ${S.rankOf(me)} · ${S.pts[me]} pts</span>`) + `<div class="cols"><div>${now}<div class="cal">${cal}</div></div><div><table class="rk">${rows}</table></div></div><div class="foot">${foot}</div>`, '', true);
    this.on('[data-back]', () => this.home());
    this.on('[data-enter]', () => { S.open(); S.save(); this.sel.T = T; this.drawView(S); });
    this.on('[data-simev]', () => { S.simEvent(); this.season(); });
    this.on('[data-simrest]', () => { let g = 0; while (!S.done && g++ < 40) S.simEvent(); this.season(); });
    this.on('[data-reset]', () => { Season.clear(); this.S = null; this.season(); });
    this.on('[data-abandon]', () => { Season.clear(); this.S = null; this.home(); });
    const cur = this.ui.querySelector('.cal .ev.on'); if (cur) cur.scrollIntoView({ block: 'center' });
  }

  // ---------- a match ----------
  async play(ctx, p0, p1, T, round) {
    this.ctx = ctx; this.round = round || null;
    const s = this.sel, set = this.set;
    const session = ctx.kind === 'quick' && s.session !== 'auto' ? s.session : (T.night && Math.random() < 0.4 ? 'night' : 'day');
    const weather = T.indoor ? 'roof' : rollWeather(T, session);
    const fmt = set.format === 'auto' ? (T.bestOf === 5 ? 'slam5' : 'atp3') : set.format;
    await this.wipe(T.name, round ? RND[round] || round : TIER[T.level][1]);
    this.ui.innerHTML = ''; $('#shade').style.opacity = 0; this.covered = false;
    this.game.stop();
    await this.game.start({ T, weather, p0, p1, round, format: fmt, difficulty: set.difficulty, cam: set.cam, intro: true });
    this.mode = 'match'; this.paused = false;
    this.audio.setVolume(set.volume);
    this.hud.classList.remove('hidden'); this.input.enabled = true;
    this.unwipe();
    // the match strap rides over the establishing shot; then the score bug, and the picture is the player's
    const d = ctx.draw, who = id => { const f = PLAYERS[id].facts, sd = d && d.seedNo[id]; return `<div>${full(id)}<small>${esc(f.country || '')}${sd ? ' ' + sd : ''}</small></div>`; };
    const st = $('#strap');
    st.querySelector('.tab').innerHTML = `<b>${esc(round ? RND[round] || round : 'Exhibition')}</b>${T.court ? ' · ' + esc(T.court) : ''}`;
    st.querySelector('.who').innerHTML = who(p0) + who(p1);
    st.querySelector('.evn').innerHTML = `${esc(T.name)}<small>${esc(T.city || '')}</small>`;
    $('#bug').classList.add('off'); st.classList.add('on');
    await wait(3600);
    st.classList.remove('on');
    await wait(350);
    if (this.mode === 'match') { $('#bug').classList.remove('off'); if (this.set.controls !== 'classic') this.input.lock(); }
  }
  matchStart(g) {
    if (LOCAL && g.human) { g.human.log = this.plog = [['start', new Date().toISOString().slice(11, 19), { ...this.set }, g.cfg.T && g.cfg.T.key, pname(g.cfg.p0), pname(g.cfg.p1), navigator.userAgent.replace(/.*(Firefox|Chrome)\/(\d+).*/, '$1 $2'), innerWidth + 'x' + innerHeight, { controlsBuild: g.human.build || 'old', path: location.pathname }]]; clearInterval(this.plogT); this.plogT = setInterval(() => { if (this.plog && this.plog.length) { const b = JSON.stringify(this.plog.splice(0)); fetch('/__playlog', { method: 'POST', body: b, keepalive: true }).catch(() => {}); } }, 3000); }
    const T = g.cfg.T, k = T && T.key;
    this.hud.dataset.ev = k === 'ao' || k === 'rg' || k === 'wim' || k === 'us' ? k : 'atp';
    this.stat = null; this.statsOpen = false; $('#stats').classList.add('hidden');
    for (const q of ['#bug .tab', '#bug .ext', '#lt', '#strap', '#tip', '#replay']) $(q).classList.remove('on');
    $('#bug').classList.remove('stat'); this.bug(g);
  }
  // The score bug: surname, sets already played, games, points; the server's mark. No more than that.
  bug(g) {
    const m = g.match, s = m.score, pt = m.pointText(), d = this.ctx && this.ctx.draw, ids = [g.cfg.p0, g.cfg.p1], live = !s.over;
    const nm = i => { const f = PLAYERS[ids[i]].facts, sd = d && d.seedNo[ids[i]]; return `<div class="r">${s.server === i && live ? '<i class="dot"></i>' : ''}<span>${esc(f.name)}</span><em class="cc">${esc(f.country || '')}</em>${sd ? `<em class="seed">${sd}</em>` : ''}</div>`; };
    const col = (cls, cell) => `<div class="c ${cls}">${cell(0)}${cell(1)}</div>`;
    const sets = s.sets.map(x => col('st', i => `<div class="r ${x.g[i] > x.g[1 - i] ? 'w' : ''}">${x.g[i]}${x.tb && x.g[i] < x.g[1 - i] ? `<sup>${x.tb[i]}</sup>` : ''}</div>`)).join('');
    // between games the points cell is not there at all
    const pts = this.ptsShown = live && (s.p[0] + s.p[1] > 0 || m.phase === 'ready' || m.phase === 'toss' || m.phase === 'live');
    const st = this.stat;
    $('#bug .cells').innerHTML = col('nm', nm) + sets
      + (live ? col('gm', i => `<div class="r ${s.g[i] > s.g[1 - i] ? 'lead' : ''}">${s.g[i]}</div>`) + col('pt' + (pts ? '' : ' gone'), i => `<div class="r">${pt[i]}</div>`) : '')
      + (st ? col('sv', i => `<div class="r ${st.better === i ? 'w' : ''}">${st.v[i]}</div>`) : '');
  }
  // a tab on one player's row: lime for what the point is for, white for what just happened
  tab(row, html, plain, dur) {
    const t = $('#bug .tab'); clearTimeout(this.tabT);
    if (row == null) { t.classList.remove('on'); return; }
    t.className = 'tab r' + row + (plain ? ' plain' : ''); t.firstChild.innerHTML = html; void t.offsetWidth; t.classList.add('on');
    $('#bug .ext').classList.remove('on');
    if (dur) this.tabT = setTimeout(() => t.classList.remove('on'), dur * 1000);
  }
  // a figure beside the striker's row: the speed of a serve
  ext(row, html, dur) {
    const t = $('#bug .ext'); clearTimeout(this.extT);
    if (row == null || $('#bug .tab').classList.contains('on')) { t.classList.remove('on'); return; }
    t.className = 'ext r' + row; t.innerHTML = html; void t.offsetWidth; t.classList.add('on');
    this.extT = setTimeout(() => t.classList.remove('on'), dur * 1000);
  }
  // one statistic on the bug, under a header tab, for a few seconds at a change of ends
  statOn(g) {
    const m = g.match, A = m.players[0].stats, B = m.players[1].stats, pc = (a, b) => b ? Math.round(100 * a / b) : 0;
    const list = [['<b>1st serve</b> in', pc(A.s1In, A.s1Tot), pc(B.s1In, B.s1Tot), '%'], ['<b>Aces</b>', A.aces, B.aces, ''], ['<b>Winners</b>', A.winners, B.winners, ''], ['<b>Unforced</b> errors', A.ue, B.ue, '', true],
      ['<b>1st serve</b> points won', pc(A.s1Won, A.s1In), pc(B.s1Won, B.s1In), '%'], ['<b>Points</b> won', A.pts, B.pts, ''], ['<b>Net points</b> won', pc(A.netWon, A.netPts), pc(B.netWon, B.netPts), '%']];
    const pick = list.filter(x => x[1] + x[2] > 0), it = pick[(this.statN = (this.statN || 0) + 1) % Math.max(1, pick.length)]; if (!it) return;
    this.stat = { v: [it[1] + it[3], it[2] + it[3]], better: it[1] === it[2] ? -1 : (it[4] ? it[1] < it[2] : it[1] > it[2]) ? 0 : 1 };
    $('#bug .hd').innerHTML = `<span>${it[0]}</span><b>Match</b>`; this.tab(null); this.bug(g); $('#bug').classList.add('stat');
    clearTimeout(this.statT); this.statT = setTimeout(() => this.statOff(g), 5200);
  }
  statOff(g) { if (!this.stat) return; this.stat = null; $('#bug').classList.remove('stat'); if (this.mode === 'match') this.bug(g); }
  // the lower third: two bands, a name over a line about him
  lower(top, bottom, mid) { const l = $('#lt'); if (!top) { l.classList.remove('on'); return; } l.classList.toggle('mid', !!mid); l.querySelector('.a span').innerHTML = top; l.querySelector('.b span').innerHTML = bottom || ''; l.classList.add('on'); }
  fb(text, col) { const f = $('#fb'); f.textContent = text; f.style.color = col || '#fff'; f.classList.add('on'); this.fbT = 0.9; }
  replay(on) { $('#replay').classList.toggle('on', on); $('#reticle').style.opacity = on ? 0 : 1; $('#meter').classList.remove('on'); if (on) { this.tab(null); $('#fb').classList.remove('on'); } }
  cine(on) { $('#reticle').style.opacity = on ? 0 : 1; $('#meter').classList.remove('on'); }
  // into and out of a replay: the slabs close, hold on the mark, and open
  trophyOn() { $('#bug').classList.add('off'); this.lower(null); }   // (the trophy without the score bug over it)
  sting() { const w = $('#wipe'); w.querySelector('b').innerHTML = MARK; w.dataset.ev = $('#hud').dataset.ev || 'atp'; w.className = 'in'; clearTimeout(this.stingT); this.stingT = setTimeout(() => { if (this.mode === 'match') w.className = ''; }, 560); }
  // Electronic line calling: for a ball within a hand's width of a line, show where it landed.
  lineCall(e, g) {
    const c = $('#linecall'), x = c.getContext('2d'), W = c.width, H = c.height, out = !e.good, mm = Math.round(Math.abs(e.miss) * 1000);
    const surf = g.arena.spec, px = 1400 * W / 320, k = W / 320;
    x.clearRect(0, 0, W, H);
    const L0 = H * 0.62;
    x.fillStyle = surf.outer || surf.inner; x.fillRect(0, 0, W, H); x.fillStyle = surf.inner; x.fillRect(0, L0, W, H - L0);
    const lw = 0.05 * px; x.fillStyle = surf.lines || '#f4f4f0'; x.fillRect(0, L0 - lw, W, lw);
    const edge = L0 - lw, cy = edge - (e.miss + 0.03) * px;
    x.save(); x.translate(W / 2, cy); x.fillStyle = 'rgba(20,20,22,.8)'; x.beginPath(); x.ellipse(0, 0, 0.045 * px, 0.033 * px, 0, 0, 6.3); x.fill(); x.restore();
    const bh = 62 * k; x.fillStyle = '#051123'; x.fillRect(0, H - bh, W, bh); x.fillStyle = out ? '#ffffff' : '#e2f03a'; x.fillRect(0, H - bh, 112 * k, bh);
    x.fillStyle = '#020700'; x.font = `700 ${Math.round(31 * k)}px Outfit, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(out ? 'OUT' : 'IN', 56 * k, H - bh / 2 + k);
    x.fillStyle = '#fff'; x.font = `600 ${Math.round(22 * k)}px Outfit, sans-serif`; x.textAlign = 'right'; x.fillText(out ? `${Math.max(1, mm)} MM` : (mm < 34 ? 'ON THE LINE' : `${mm - 33} MM`), W - 16 * k, H - bh / 2 + k);
    c.classList.add('on'); this.callT = 2.6;
  }
  event(type, e, g) {
    if (this.mode !== 'match') return;
    const m = g.match, n = i => m.players[i].prof.name;
    if (this.plog) { const r3 = v => v == null ? null : +(+v).toFixed(3);
      if (type === 'hit' && e.who === 0) this.plog.push(['hit', +m.t.toFixed(2), e.kind, r3(e.timing), e.shank ? 1 : 0]);
      else if (type === 'whiff' && e.who === 0) this.plog.push(['whiff', +m.t.toFixed(2), r3(e.lat), r3(e.relZ), r3(e.h)]);
      else if (type === 'point') this.plog.push(['point', +m.t.toFixed(2), e.winner, e.why, e.rally, Math.round(1 / Math.max(1e-3, this.fdt || 0.016))]);
      else if (type === 'tossMiss' || type === 'tossCatch' || type === 'fault') this.plog.push([type, +m.t.toFixed(2)]); }
    switch (type) {
      case 'hit':
        if (e.kind === 'serve') { this.tab(null); this.ext(e.who, `<b>${Math.round(e.speed * 3.6)}</b><i>km/h</i>${e.stype === 'kick' ? 'Kick · ' : e.stype === 'slice' ? 'Slice · ' : e.stype === 'flat' ? 'Flat · ' : ''}${e.serveNum === 1 ? '1st' : '2nd'} serve`, 2.6); if (e.who === 0 && e.q < 0.55) this.fb('Mistimed', '#ff6a4d'); }
        else if (e.who === 0 && e.timing != null) { const a = Math.abs(e.timing), w = e.window || 0.035; this.fb(e.shank ? 'Frame' : a < w * 0.5 ? 'Perfect' : a < w ? 'Good' : e.timing > 0 ? 'Early' : 'Late', e.shank ? '#ff6a4d' : a < w * 0.5 ? '#e2f03a' : a < w ? '#fff' : '#ff6a4d'); }
        break;
      case 'bounce': if (e.first && !e.dead && e.miss != null && Math.abs(e.miss) < 0.07) this.lineCall(e, g); break;
      case 'whiff': if (e.who === 0) this.fb(e.relZ > 1 ? 'Early' : e.relZ < -0.3 ? 'Late' : 'Missed', '#ff6a4d'); break;
      case 'fault': this.tab(m.score.server, e.serveNum === 2 ? '<b>Double</b> fault' : '<b>Fault</b>', true, 1.5); break;
      case 'let': this.tab(m.score.server, '<b>Let</b>', true, 1.3); break;
      case 'point': {
        const good = { ace: `<b>Ace</b> ${Math.round(e.speed * 3.6)} km/h`, winner: '<b>Winner</b>', serviceWinner: '<b>Service</b> winner' }[e.why], bad = { net: '<b>Net</b>', long: '<b>Out</b>', wide: '<b>Out</b>' }[e.why];
        this.bug(g);
        if (good) this.tab(e.winner, good, false, m.quick ? 1.3 : 1.9); else if (bad) this.tab(1 - e.winner, bad, true, m.quick ? 1.2 : 1.6);
        this.set.tips = (this.set.tips || 0) + 1;
        // what the next point is for, on the row of the man who holds it
        clearTimeout(this.sitT);
        if (!m.quick) this.sitT = setTimeout(() => {
          if (m.score.over || this.mode !== 'match' || this.stat) return;
          const v = [m.pointValue(0), m.pointValue(1)], who = v[0] >= v[1] ? 0 : 1, top = v[who];
          if (top === 3) this.tab(who, g.cfg.round === 'F' ? '<b>Championship</b> point' : '<b>Match</b> point');
          else if (top === 2) this.tab(who, '<b>Set</b> point');
          else if (m.isBreakPoint()) this.tab(1 - m.score.server, '<b>Break</b> point');
        }, 3200);
        break;
      }
      case 'cut': {                                   // the picture cuts straight to the next point (game.js); what it is for goes up at once
        clearTimeout(this.sitT); this.tab(null);
        this.sitT = setTimeout(() => {
          if (m.score.over || this.mode !== 'match' || this.stat) return; this.bug(g);
          const v = [m.pointValue(0), m.pointValue(1)], who = v[0] >= v[1] ? 0 : 1, top = v[who];
          if (top === 3) this.tab(who, g.cfg.round === 'F' ? '<b>Championship</b> point' : '<b>Match</b> point');
          else if (top === 2) this.tab(who, '<b>Set</b> point');
          else if (m.isBreakPoint()) this.tab(1 - m.score.server, '<b>Break</b> point');
        }, 320);
        break;
      }
      case 'game': this.bug(g); break;
      case 'set': this.bug(g); break;
      case 'changeEnds': if (e.sit && m.score.g[0] + m.score.g[1] > 0) setTimeout(() => { if (this.mode === 'match' && !g.over && !this.statsOpen) this.statOn(g); }, m.quick ? 1900 : 2600); break;
      case 'match': { this.save();
        // a celebration after every match, and the trophy if it is his title: a quick match, or the final of an event (he asked for
        // "celebrations after matches and a trophy scene if you win"); the results come up when it is over or he moves it on
        const c = this.ctx || {}, won = m.score.winner === 0 && c.kind !== 'online', title = won && (c.kind === 'quick' || this.round === 'F');
        if (g.endSequence && !globalThis.__endSeqOld) g.endSequence({ trophy: title, onDone: () => this.finish() }); else setTimeout(() => this.finish(), 5200);
        break; }
    }
  }
  frame(g, dt) {
    if (this.mode !== 'match') return;
    // online: how far away the other player is, and by what path
    if (g.net) { this.netT = (this.netT || 0) + dt; if (this.netT > 0.5) { this.netT = 0; const N = g.net, el = $('#net'); if (el) { el.textContent = (N.kind === 'lan' ? 'Same network' : N.kind === 'relay' ? 'Relayed' : 'Direct') + ' · ' + Math.round(N.rtt * 1000) + ' ms'; el.classList.add('on'); } } }
    else if (this.netT != null) { this.netT = null; const el = $('#net'); if (el) el.classList.remove('on'); }
    this.fdt = (this.fdt || dt) * 0.95 + dt * 0.05;
    const m = g.match, h = g.human;
    if ((this.callT -= dt) <= 0) $('#linecall').classList.remove('on');
    if ((this.fbT -= dt) <= 0) $('#fb').classList.remove('on');
    // the points cell comes back as the server steps up (the serve clock is the one on the court's back wall)
    if (!m.score.over && !this.ptsShown && (m.phase === 'ready' || m.phase === 'toss')) this.bug(g);
    if (!h) return;
    // timing ring: closes on the inner circle at the moment to let go
    const out = $('#ringOut');
    let tau = null;
    if (m.phase === 'live' && h.tau != null && h.tau < 0.75 && h.tau > -0.2) tau = h.tau;
    else if (m.phase === 'toss' && m.score.server === 0 && m.ball.held < 0 && !(m.players[0].stroke && m.players[0].stroke.tc != null)) tau = m.tossIdeal - TIMING.serveSwing - m.t;
    if (tau != null && tau > -0.15) { const r = 15 + Math.max(0, tau) * 120, good = Math.abs(tau) < (m.windowFor ? m.windowFor(0) : 0.03); out.setAttribute('r', r.toFixed(1)); out.setAttribute('opacity', (tau > 0.6 ? (0.75 - tau) / 0.15 : 0.9).toFixed(2)); out.setAttribute('stroke', good ? '#e2f03a' : tau < 0 ? '#ff6a4d' : '#fff'); }
    else out.setAttribute('opacity', 0);
    // power, and the shot it will be
    const mt = $('#meter'); mt.classList.toggle('on', h.power > 0);
    if (h.power > 0) { mt.firstChild.style.width = Math.round((h.power - 0.3) / 0.7 * 100) + '%'; const k = { slice: 'Slice', flat: 'Flat', lob: 'Lob', drop: 'Drop' }[h.kindNow] || (h.power < 0.5 ? 'Loop' : ''); if (mt.dataset.k !== k) mt.dataset.k = k; }
    // No prompts on the picture: the controls are on their own screen in the menu (on 2026-11-13 he asked for the in-match
    // hints to go; their count was only saved at the end of a finished match, so they kept coming back)
    let tip = '';
    if (m.score.over || g.over) tip = '';                     // the match is over: nothing left to press
    if (tip !== this.tipKey) { this.tipKey = tip; const t = $('#tip'); t.innerHTML = tip; t.classList.toggle('on', !!tip); }
  }
  // The statistics panel: one page, the better figure in lime.
  showStats(on, title) {
    const g = this.game, m = g.match, A = m.players[0].stats, B = m.players[1].stats, el = $('#stats');
    this.statsOpen = on; el.classList.toggle('hidden', !on); if (!on) return;
    this.statOff(g);
    const pc = (a, b) => b ? Math.round(100 * a / b) : 0, s = m.score, w = s.over ? s.winner : -1;
    const rows = [['Aces', A.aces, B.aces], ['Double faults', A.df, B.df, true], ['1st serve in', pc(A.s1In, A.s1Tot), pc(B.s1In, B.s1Tot), 0, '%'], ['1st serve points won', pc(A.s1Won, A.s1In), pc(B.s1Won, B.s1In), 0, '%'],
      ['2nd serve points won', pc(A.s2Won, A.s2Tot), pc(B.s2Won, B.s2Tot), 0, '%'], ['Winners', A.winners, B.winners], ['Unforced errors', A.ue, B.ue, true], ['Break points won', `${A.bpWon}/${A.bpTot}`, `${B.bpWon}/${B.bpTot}`], ['Total points won', A.pts, B.pts]];
    const line = s.sets.map(x => `${x.g[0]}-${x.g[1]}`).concat(s.over ? [] : [`${s.g[0]}-${s.g[1]}`]).join('  ');
    el.innerHTML = `<div class="hd">${title || '<b>Match</b> statistics'}<small>${clockText(m.t)}</small></div>
      <div class="who"><span class="${w === 0 ? 'w' : ''}">${full(g.cfg.p0)}</span><i>${line}</i><span class="${w === 1 ? 'w' : ''}">${full(g.cfg.p1)}</span></div>`
      + rows.map(([l, a, b, low, unit]) => { const na = parseFloat(a), nb = parseFloat(b), mx = Math.max(1, na, nb), la = low ? na < nb : na > nb, lb = low ? nb < na : nb > na;
        return `<div class="rw"><b class="${la ? 'w' : ''}">${a}${unit || ''}</b><i class="l ${la ? 'w' : ''}" style="--w:${Math.round(100 * na / mx)}%"></i><span>${l}</span><i class="r ${lb ? 'w' : ''}" style="--w:${Math.round(100 * nb / mx)}%"></i><b class="${lb ? 'w' : ''}">${b}${unit || ''}</b></div>`; }).join('');
  }
  key(e) {
    if (e.code === 'KeyM' && !e.repeat) this.audio.toggle();
    if (this.mode !== 'match') return;
    if (e.code === 'Escape') { e.preventDefault(); this.pause(!this.paused); }
    else if (e.code === 'Tab') { e.preventDefault(); if (!e.repeat) this.showStats(!this.statsOpen); }
    else if (e.code === 'KeyV' && !e.repeat && !this.paused) { this.game.cycleCamera(); this.set.cam = this.game.camMode; this.save(); }
  }
  pause(on) {
    if (this.mode !== 'match') return;
    this.paused = on; this.game.paused = on && !this.game.net; const o = $('#overlay');
    if (!on) { o.className = 'hidden'; if (this.set.controls !== 'classic') this.input.lock(); return; }
    this.input.unlock();
    o.className = ''; o.innerHTML = `<div class="box"><h2>Paused</h2><button class="btn go" data-a="resume">Resume</button><button class="btn" data-a="stats">Stats</button><button class="btn" data-a="settings">Settings</button><button class="btn" data-a="sim">Sim to the end</button><button class="btn" data-a="quit">Leave</button></div>`;
    o.querySelectorAll('[data-a]').forEach(n => n.onclick = () => {
      const a = n.dataset.a;
      if (a === 'resume') this.pause(false);
      else if (a === 'stats') { this.pause(false); this.showStats(true); }
      else if (a === 'settings') this.settings(() => this.pause(true));
      else if (a === 'quit') { o.className = 'hidden'; this.leave(false); }
      else if (a === 'sim') { o.className = 'hidden'; this.leave(true); }
    });
  }
  // The match is over: the result over the last picture, then on to whatever it was part of.
  finish() {
    if (this.mode !== 'match') return;
    const g = this.game, s = g.match.score, me = g.cfg.p0, opp = g.cfg.p1, won = s.winner === 0;
    this.input.unlock(); this.input.enabled = false;
    const res = { a: me, b: opp, winner: won ? me : opp, loser: won ? opp : me, sets: s.sets.map(x => ({ g: [x.g[0], x.g[1]], tb: x.tb })) };
    this.tab(null); $('#bug').classList.add('off');
    this.lower(`${full(res.winner)}<small>${esc(PLAYERS[res.winner].facts.country || '')}</small>`, `Defeated <b>${esc(pname(res.loser))}</b> ${scoreLine(res, res.winner)}`);
    // then the numbers, which carry the names and the score themselves: the result card makes way for them
    setTimeout(() => { if (this.mode === 'match') { this.lower(null); this.showStats(true); } }, 2400);
    const o = $('#overlay'); o.className = 'result'; o.innerHTML = '<div class="box"><button class="btn go" data-ok>Continue</button></div>';
    o.querySelector('[data-ok]').onclick = () => { o.className = 'hidden'; this.afterMatch(res); };
  }
  leave(sim) {
    const g = this.game, c = this.ctx;
    this.paused = false; g.paused = false;
    this.afterMatch(sim ? simMatch(g.cfg.p0, g.cfg.p1, g.cfg.T, c.draw ? c.draw.r : Math.random) : null);
  }
  async afterMatch(res) {
    const c = this.ctx; this.showStats(false); this.lower(null); $('#strap').classList.remove('on');
    await this.wipe();
    this.game.stop(); this.mode = 'menu'; this.hud.classList.add('hidden');
    if (res && c.kind === 'draw') { c.draw.report(c.match, res); if (c.season) c.season.save(); }
    await this.attract();
    if (c.kind === 'online') { if (this.net) { this.net.send({ k: 'bye' }); this.net.close(); this.net = null; } this.online(); }
    else if (c.kind === 'draw') this.drawView(c.season || null); else this.quick();
    this.unwipe();
  }

  // ---------- online: against someone else, browser to browser ----------
  online(msg) {
    const s = this.sel, T = s.T;
    if (this.net && !this.net.open) { this.net.close(); this.net = null; }
    this.screen(this.bar('Online') + `
      <div class="h2h" style="grid-template-columns:1fr 2fr">${this.card(s.p0, 'You', 'me', T)}
        <div class="evp"><div class="hd"><span class="lab">Host picks the event</span><b>${esc(T.name)}</b><span class="lab">${esc(T.surface)} · ${esc(T.city || '')}</span></div>
          <div class="online">
            <div class="row"><button class="btn go" data-host>Host a match</button><span class="lab" data-code></span></div>
            <div class="row"><input data-join maxlength="4" placeholder="CODE" spellcheck="false" autocomplete="off"><button class="btn" data-dojoin>Join</button></div>
            <div class="lab" data-status>${esc(msg || 'Each of you plays your own player from your own keyboard. Nobody waits on the other: you move and hit at once, and the ball comes across as fast as the line between you allows.')}</div>
          </div></div></div>
      <div class="strip">${TOURNAMENTS.map(t => this.evTile(t, t === T)).join('')}</div>`, '', true);
    const status = t => { const n = this.ui.querySelector('[data-status]'); if (n) n.textContent = t; };
    this.on('[data-back]', () => { if (this.net) { this.net.close(); this.net = null; } this.home(); });
    this.on('.pl.me', () => this.pick(0, () => this.online()));
    this.on('[data-t]', n => { s.T = TOURNAMENTS.find(t => t.key === n.dataset.t); this.online(); });
    const net = () => { if (this.net) this.net.close(); const N = this.net = new Net(); N.lobby = true; N.on('status', status); N.on('error', e => status(e)); N.on('close', () => { if (this.mode === 'match') this.netGone(); }); return N; };
    this.on('[data-host]', () => {
      const N = net();
      N.on('msg', d => this.onlineMsg(d));
      N.on('open', () => status('Connected. Setting up the match'));
      N.host(code => { const c = this.ui.querySelector('[data-code]'); if (c) c.innerHTML = 'Code <b class="code">' + code + '</b>'; status('Give your opponent this code'); });
    });
    const join = () => { const inp = this.ui.querySelector('[data-join]'), code = (inp.value || '').trim().toUpperCase(); if (code.length !== 4) { status('The code is four letters.'); return; }
      const N = net(); N.on('msg', d => this.onlineMsg(d)); N.on('open', () => { status('Connected. Waiting for the host'); N.send({ k: 'hi', p: this.sel.p0 }); }); N.join(code); };
    this.on('[data-dojoin]', join);
    const inp = this.ui.querySelector('[data-join]'); if (inp) inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') join(); });
  }
  // the setup, before the match: who plays whom, where, in what weather; then both load, then both start
  async onlineMsg(d) {
    const N = this.net; if (!N) return;
    if (d.k === 'hi' && N.role === 'host' && !this.netSetup) {
      this.netSetup = true;
      const T = this.sel.T, session = T.night && Math.random() < 0.4 ? 'night' : 'day', weather = T.indoor ? 'roof' : rollWeather(T, session);
      const fmt = T.bestOf === 5 ? 'slam5' : 'atp3', first = Math.random() < 0.5 ? 0 : 1;
      await this.onlinePlay({ T, weather, fmt, me: this.sel.p0, them: d.p, first });
      const e = this.game.env;
      N.send({ k: 'setup', T: T.key, weather, fmt, host: this.sel.p0, guest: d.p, first, env: { surface: e.surface, pace: e.pace, altitude: e.altitude, tempC: e.tempC, humidity: e.humidity, indoor: e.indoor, windX: e.windX, windZ: e.windZ } });
    } else if (d.k === 'setup' && N.role === 'guest' && !this.netSetup) {
      this.netSetup = true;
      const T = TOURNAMENTS.find(t => t.key === d.T) || this.sel.T, env = { ...d.env, windX: -(d.env.windX || 0), windZ: -(d.env.windZ || 0) };
      await this.onlinePlay({ T, weather: d.weather, fmt: d.fmt, me: d.guest, them: d.host, first: 1 - d.first, env });
      N.send({ k: 'loaded' });
    } else if (d.k === 'loaded' && N.role === 'host') { N.send({ k: 'go' }); this.netGoNow(); }
    else if (d.k === 'go' && N.role === 'guest') this.netGoNow();
  }
  async onlinePlay(o) {
    this.ctx = { kind: 'online' };
    await this.wipe(o.T.name, 'Online');
    this.ui.innerHTML = ''; $('#shade').style.opacity = 0; this.covered = false;
    this.game.stop();
    await this.game.start({ T: o.T, weather: o.weather, p0: o.me, p1: o.them, format: o.fmt, cam: this.set.cam, firstServer: o.first, envOverride: o.env || null, online: { net: this.net } });
    this.mode = 'match'; this.paused = false;
    this.audio.setVolume(this.set.volume);
    this.hud.classList.remove('hidden'); this.input.enabled = true;
    this.netWaiting = true; $('#tip').innerHTML = 'Waiting for your opponent to load'; $('#tip').classList.add('on');
    this.unwipe();
  }
  netGoNow() {
    this.netWaiting = false; this.netSetup = false; $('#tip').classList.remove('on'); this.tipKey = '';
    if (this.net) this.net.lobby = false;
    this.game.netStart(); $('#bug').classList.remove('off');
  }
  netGone() {
    if (this.mode !== 'match' || !this.game.net) return;
    const o = $('#overlay'); o.className = ''; o.innerHTML = '<div class="box"><h2>Your opponent has gone</h2><button class="btn go" data-ok>Leave</button></div>';
    o.querySelector('[data-ok]').onclick = () => { o.className = 'hidden'; this.afterMatch(null); };
  }
}

const app = new App();
window.__app = app;
app.boot();
