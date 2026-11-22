// Rally Pro — one match on screen: builds the venue, runs the engine at a fixed step,
// turns its events into pictures and sound, and maps the player's hands onto a racket.
import * as THREE from 'three';
import { Match, STEP, TIMING, FORMATS } from './sim.js';
import { mirrorBall } from './net.js';
import { AI } from './ai.js';
import { COURT, BALL } from './physics.js';
import { buildArena } from './arena.js';
import { insideCourt } from './staff.js';
import { venueSpec } from './venues.js';
import { WEATHER, loadSkyTexture } from './skies.js';
import { Figure } from './figure.js';
import { loadPerson, loadAvatar } from './people.js';
import { loadCrowdAtlas } from './crowd.js';
import { loadSurface } from './textures.js';
import { BallFx } from './ballfx.js';
import { PLAYERS, profileFor, envFor, DIFFICULTY, ROUND_NAME, lookAt } from './data.js';
import { Human } from './human.js';
// how much of the point a replay's figures are run through unseen before it opens (their springs warmed: about 40 ms for both)
const REPLAY_PRE = 0.5;

const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const sm = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _held = new THREE.Vector3();          // the bounced ball's place: its own vector, since the camera reuses _w before the ball is drawn

export class Game {
  constructor(gfx, o = {}) {
    this.gfx = gfx; this.input = o.input || null; this.ui = o.ui || null; this.audio = o.audio || null;
    this.opts = { assist: 2, aimSens: 1, markers: true, ...(o.opts || {}) };
    this.match = null; this.fig = []; this.fx = null; this.arena = null;
    this.camMode = 'fp'; this.cam = { yaw: 0, pitch: -0.08, ballW: 0, pos: new THREE.Vector3(0, 1.7, 13), kick: 0, fov: 66, roll: 0 };
    this.acc = 0; this.timeScale = 1; this.paused = false; this.time = 0;
    this.fade = 0; this.fadeT = 0; this.pendingFlip = null;
    this.hud = {};
    this.running = false;
  }

  async start(cfg) {
    this.cfg = cfg;
    const T = cfg.T, wKey = cfg.weather || 'clear', W = WEATHER[wKey];
    const spec = venueSpec(T ? T.key : 'default', wKey, T && T.surface);
    if (T) { spec.surface = T.surface; if (!spec.own) { if (T.inner) spec.inner = T.inner; if (T.outer) spec.outer = T.outer; } spec.indoor = !!T.indoor; }
    const indoor = spec.indoor || W.indoor;
    const skyTex = W.sky && !indoor ? await loadSkyTexture(W.sky) : null;
    if (this.fx) { this.gfx.scene.remove(this.fx.group); }
    for (const f of this.fig) this.gfx.scene.remove(f.group);
    const model = await loadPerson('m04');
    const [pc, pk] = await Promise.all([loadSurface(spec.surface), loadSurface('concrete')]);
    // the people who work the court: an official and four ball kids
    const staffM = await Promise.all(['Business_Male_01', 'Male_Child_01', 'Female_Child_01', 'Male_Child_02', 'Female_Child_02'].map(n => loadAvatar('staff/' + n + '.glb').catch(() => null)));
    const staff = staffM[0] ? { umpire: staffM[0], kids: staffM.slice(1).filter(Boolean) } : null;
    const A = this.arena = buildArena(spec, { quality: this.gfx.q, skyTex, crowdAtlas: this.gfx.q > 0 ? await loadCrowdAtlas() : null, model, staff, photo: { court: pc, concrete: pk } });
    this.gfx.setArena(A);
    // conditions
    let env;
    if (cfg.envOverride) env = { ...cfg.envOverride };                // online: the host's conditions, seen from this end
    else {
      env = T ? envFor(T, W.night ? 'night' : 'day') : { surface: spec.surface };
      env.tempC = (env.tempC == null ? 22 : env.tempC) + (W.temp || 0); env.humidity = clamp((env.humidity == null ? 0.5 : env.humidity) + (W.hum || 0), 0.05, 0.98);
      env.windX = (env.windX || 0) * (W.wind == null ? 1 : W.wind); env.windZ = (env.windZ || 0) * (W.wind == null ? 1 : W.wind);
      if (indoor) { env.indoor = true; env.windX = env.windZ = 0; }
    }
    this.env = env;
    const surf = spec.surface, D = DIFFICULTY[cfg.online ? 1 : cfg.difficulty == null ? 1 : cfg.difficulty];
    const p0 = profileFor(cfg.p0, surf, T && T.key), p1 = profileFor(cfg.p1, surf, T && T.key);
    if (!cfg.demo && !cfg.online) { p1.speed *= D.speed; p1.react *= D.react; p1.s1Kmh *= D.pace; p1.s1Max *= D.pace; p1.s2Kmh *= D.pace; p1.fhKmh *= D.pace; p1.bhKmh *= D.pace; }
    const m = this.match = new Match({ env, format: cfg.format || (T && T.bestOf === 5 ? 'slam5' : 'atp3'), p0, p1, seed: cfg.seed, firstServer: cfg.firstServer == null ? (Math.random() < 0.5 ? 0 : 1) : cfg.firstServer, pace: cfg.pace == null ? 1 : cfg.pace, quick: cfg.quick !== false });
    m.bounds = A.bounds;
    if (!cfg.demo && !cfg.online) m.diffScale[1] = D.err;
    this.human = cfg.demo ? null : new Human(this);
    if (this.human) { m.timingWindow[0] = D.window; m.diffScale[0] = D.aid; m.cleanK[0] = D.clean == null ? 1 : D.clean; m.mercy[0] = D.mercy == null ? 1 : D.mercy; m.aimSafe[0] = D.aimSafe; this.human.safe = D.safe; this.human.srvSafe = D.srvSafe; }
    m.ctl = [this.human || new AI(), new AI()];
    this.net = null;
    if (cfg.online) this.goOnline(cfg.online);
    // bodies
    this.fig = [new Figure(lookAt(cfg.p0, T && T.key), model), new Figure(lookAt(cfg.p1, T && T.key), model)];
    for (const f of this.fig) this.gfx.scene.add(f.group);
    this.fx = new BallFx(this.gfx.scene, surf); this.fx.setViewport(this.gfx.h);
    this.setCamera(cfg.cam || (cfg.demo ? 'tv' : 'fp'));
    this.drawBoard();
    this.acc = 0; this.running = true; this.over = false; this._prev = null;
    this.cine = cfg.intro ? { kind: 'intro', t: 0, dur: 3.9 } : null; this.cineAt = null;
    if (this.cine) this.fig[0].setFirstPerson(false);
    if (this.ui) this.ui.matchStart(this);
    if (this.audio) this.audio.startMatch(this);
    return this;
  }
  stop() { this.running = false; if (this.audio) this.audio.stopMatch(); }

  setCamera(mode) {
    this.camMode = mode;
    if (this.gfx) { this.gfx.slow = 0; this.gfx.fast = 0; }
    if (this.fig[0]) this.fig[0].setFirstPerson(mode === 'fp');
    this.cam.snap = true;
  }
  // From the broadcast camera a player gone back deep is seen past the front rows of the stand behind him: the few spectators
  // standing on the line from the camera to him are not drawn while he is there (their cards set to nothing), so he is never
  // seen through a spectator's body. Put back as soon as he comes in, or the camera changes.
  clearCrowd(cp, pl) {
    const A = this.arena; if (!A || !A.root) return;
    if (this._crA !== A) { this._crA = A; this._cr = []; this._crHid = new Map();
      A.root.traverse(o => { if (o.isInstancedMesh && o.material && o.material.customProgramCacheKey && /crowd-cards/.test(o.material.customProgramCacheKey())) {
        const n = o.count, pos = new Float32Array(n * 3), M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
        for (let i = 0; i < n; i++) { o.getMatrixAt(i, M); M.decompose(P, Q, S); pos[i * 3] = P.x; pos[i * 3 + 1] = P.y + 0.55; pos[i * 3 + 2] = P.z; }
        this._cr.push({ o, pos }); } }); }
    const want = new Map();
    if (pl && cp && !globalThis.__noClearCrowd) {
      const segs = [0.45, 0.95, 1.35, 1.75].map(y => [cp.x, cp.y, cp.z, pl.x, y, pl.z]);
      for (const c of this._cr) { const pos = c.pos, n = pos.length / 3, hid = [];
        for (let i = 0; i < n; i++) { const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
          if (Math.abs(z) < Math.abs(pl.z) || Math.sign(z) !== Math.sign(pl.z)) continue;
          for (const s of segs) { const dx = s[3] - s[0], dy = s[4] - s[1], dz = s[5] - s[2], L2 = dx * dx + dy * dy + dz * dz, t = Math.max(0, Math.min(1, ((x - s[0]) * dx + (y - s[1]) * dy + (z - s[2]) * dz) / L2));
            const ex = s[0] + dx * t - x, ey = s[1] + dy * t - y, ez = s[2] + dz * t - z; if (ex * ex + ey * ey + ez * ez < 0.75 * 0.75) { hid.push(i); break; } } }
        if (hid.length) want.set(c, hid); } }
    const Z = this._crZero || (this._crZero = new THREE.Matrix4().makeScale(0, 0, 0)), M = new THREE.Matrix4();
    for (const [c, saved] of this._crHid) { const keep = new Set(want.get(c) || []); let ch = false;
      for (const [i, m] of saved) if (!keep.has(i)) { c.o.setMatrixAt(i, m); saved.delete(i); ch = true; }
      if (ch) c.o.instanceMatrix.needsUpdate = true; if (!saved.size) this._crHid.delete(c); }
    for (const [c, hid] of want) { let saved = this._crHid.get(c); if (!saved) this._crHid.set(c, saved = new Map()); let ch = false;
      for (const i of hid) if (!saved.has(i)) { c.o.getMatrixAt(i, M); saved.set(i, M.clone()); c.o.setMatrixAt(i, Z); ch = true; }
      if (ch) c.o.instanceMatrix.needsUpdate = true; }
  }
  // Behind the player, deep in a corner, the camera is back among what stands behind the baseline (the ball kids, the towel
  // stands, the cabinets against the back wall): whatever of that is between it and him is not drawn, so he is never hidden
  // behind a box. Only what this hid is shown again, as soon as it is out of the way or the camera changes.
  clearSight(cp, p) {
    const A = this.arena; if (!A || !A.root) return;
    if (this._occA !== A) { this._occ = null; this._hid = null; this._occA = A; }
    if (!this._occ) { this._occ = [];
      const bb = new THREE.Box3(), c = new THREE.Vector3(), sz = new THREE.Vector3(), kidRoots = new Set((A.kids || []).map(k => k.k.root));
      const consider = o => { if (kidRoots.has(o)) return; bb.setFromObject(o); if (bb.isEmpty()) return; bb.getCenter(c); bb.getSize(sz);
        if (bb.min.y < 0.3 && bb.max.y < 2.8 && sz.x < 4.5 && sz.z < 4.5 && (Math.abs(c.z) > COURT.halfLen + 0.8 || Math.abs(c.x) > COURT.halfWD + 0.6) && Math.abs(c.z) < A.hz + 0.2 && Math.abs(c.x) < A.hx + 0.2)
          this._occ.push({ o, x: c.x, z: c.z, r: 0.5 * Math.hypot(sz.x, sz.z) }); };
      for (const o of A.root.children) { if (o.isGroup && o.children.length > 3 && !o.isMesh) { for (const q of o.children) consider(q); } else consider(o); }
      for (const k of (A.kids || [])) this._occ.push({ o: k.k.root, kid: true, r: 0.35 });
      this._hid = new Set(); }
    const hide = new Set();
    if (cp && p) { const dx = p.x - cp.x, dz = p.z - cp.z, L2 = dx * dx + dz * dz, L = Math.sqrt(L2);
      for (const q of this._occ) { const x = q.kid ? q.o.position.x : q.x, z = q.kid ? q.o.position.z : q.z, t = L2 > 1e-6 ? ((x - cp.x) * dx + (z - cp.z) * dz) / L2 : 0;
        const lat = Math.abs((x - cp.x) * dz - (z - cp.z) * dx) / Math.max(L, 1e-3), near = Math.hypot(x - cp.x, z - cp.z) < q.r + 0.8;
        if (near || (t > -0.05 && t < 1 - 0.45 / Math.max(L, 0.5) && lat < q.r + 0.45)) hide.add(q.o); } }
    const owned = new Set();
    for (const o of this._hid) { if (hide.has(o)) owned.add(o); else o.visible = true; }
    for (const o of hide) if (!owned.has(o) && o.visible) { o.visible = false; owned.add(o); }
    this._hid = owned;
  }
  cycleCamera() { const order = ['fp', 'chase', 'tv']; this.setCamera(order[(order.indexOf(this.camMode) + 1) % order.length]); }

  // ---------- frame ----------
  frame(dt) {
    if (!this.running) return;
    const m = this.match;
    this.time += dt;
    if (this.input) this.input.poll();
    // Space (or a click) skips a replay; taken here, before the player's own controls can read it as a toss
    if (this.replay && this.input) { const I = this.input; if (I.pressed.has('Space') || I.pressed.has('Enter') || I.edges.some(e => e.type === 'down')) { I.takePressed(); I.takeEdges(); this.replay.skip = true; } }
    if (this.net) { if (!this.netGo) { this.gfx.render(dt); return; } this.netIn(); }
    if (!this.paused) {
      this.acc += Math.min(dt, 0.05) * this.timeScale;
      let n = 0;
      while (this.acc >= STEP && n++ < 40) { this.keep(m); m.step(STEP); this.acc -= STEP; if (m.events.length) this.drain(); }
      // (into a replay as a broadcast goes into one: the wipe closes over the live picture, the replay starts behind it, and it opens
      // on the slow motion; he asked for replays "the same style as actual atp tennis". Between points it is still a straight cut.)
      if (this.pendingReplay && m.phase === 'over' && m.phaseT > 0.85) { const e = this.pendingReplay; this.pendingReplay = null;
        if (this.ui && this.ui.sting && !globalThis.__repStingOld) { this.ui.sting(); this.stingIn = { e, at: this.time + 0.2 }; } else this.startReplay(e); }
      if (this.stingIn && this.time >= this.stingIn.at) { const e = this.stingIn.e; this.stingIn = null; this.startReplay(e); }
    }
    this.direct(dt);
    if (this.replay) { this.playReplay(dt); if (this.ui) this.ui.frame(this, dt); return; }
    const sdt = this.paused ? 0 : dt * this.timeScale;
    // the match moves in fixed small steps; the picture is drawn where it is between the last two, so
    // every frame shows the same amount of movement however many steps fell inside it
    const ip = this.paused ? null : this.between(m, this.acc / STEP);
    // Between points the picture cuts straight to the next one. For the cut to be clean nothing may be seen
    // settling after it, so each player's body is run on unseen for three quarters of a second first: his
    // stance, feet and hands are already where they will be, as if the shot had been running all along.
    if (this.settle) { this.settle = false; for (let k = 0; k < 45; k++) for (let i = 0; i < 2; i++) this.fig[i].update(1 / 60, m.players[i], m); }
    for (let i = 0; i < 2; i++) this.fig[i].update(sdt, m.players[i], m);
    // a slide on clay throws up dust and leaves its streak in the court
    for (let i = 0; i < 2; i++) { const sf = this.fig[i].slideFx; if (!sf || sdt <= 0) continue;
      this.slideAcc = (this.slideAcc || 0) + sdt;
      if (this.slideAcc > 0.045) { this.slideAcc = 0; this.fx.puff(sf.x, 0.02, sf.z, 3, { speed: 0.35 + sf.speed * 0.12, size: 0.14, life: 0.8, alpha: 0.42, vx: sf.vx * 4, vz: sf.vz * 4, up: 0.5 }); this.fx.mark(sf.x, sf.z, sf.vx, sf.vz, 6, { scale: 1.25 }); } }
    // the ball rides the server's hand until it is tossed; before that he bounces it a few times
    const b = m.ball;
    let held = b.held >= 0 ? this.fig[b.held].offHand : null;
    const RT = m.ritual || { n: 4, per: 0.6, t0: 0.5 };
    // (by his own routine's clock, which waits while he walks to his mark: see Figure.ritT)
    const rT = held && this.fig[b.held].ritT != null ? this.fig[b.held].ritT : m.phaseT;
    if (held && m.phase === 'ready' && rT > RT.t0 && rT < RT.t0 + RT.per * RT.n) {
      // the ball leaves the palm and comes back to it (offHand is where the posed palm holds it)
      const u = ((rT - RT.t0) % RT.per) / RT.per, f = this.fig[b.held], top = held.y, lo = BALL.r;
      const y = u < 0.5 ? top + (lo - top) * (2 * u) * (2 * u) : lo + (top - lo) * (1 - (2 - 2 * u) * (2 - 2 * u));
      held = _held.copy(held).setY(Math.min(y, held.y));
      if (u < 0.5 !== this._bdown) { this._bdown = u < 0.5; if (!this._bdown && this.audio) this.audio.bounce({ x: held.x, z: held.z, vy: 3, speed: 4 }, this.arena.spec.surface); }
    }
    this.record(sdt);
    this.updateCamera(dt);
    this.fx.update(sdt, b, this.gfx.camera, { held, maxScale: this.camMode === 'tv' ? 2.6 : 1.9 });
    this.markers();
    if (this.arena.crowd && this.arena.crowd.watch) this.arena.crowd.watch(b.x, b.z, m.phase === 'live' && b.visible);
    if (this.arena.watchBall) this.arena.watchBall(b.x, b.y, b.z, (m.phase === 'live' || m.phase === 'toss') && b.visible);
    if (this.arena.staffWatch) this.arena.staffWatch(m, this);              // ball kids and umpire follow the match (staff.js)
    if (this.arena.setServeClock) this.arena.setServeClock(m.phase === 'ready' ? Math.max(0, Math.ceil(m.serveClock)) : null);
    this.arena.update(sdt, this.time);
    // sweat comes with the games played, sooner on a hot day and in a long rally, hardly at all under a roof
    if (!this.paused && m.score && m.score.sets) {
      const games = m.score.sets.reduce((n, x) => n + (x.g ? x.g[0] + x.g[1] : 0), 0) + (m.score.g ? m.score.g[0] + m.score.g[1] : 0);
      const T = this.cfg && this.cfg.T, heat = T ? (T.indoor ? 0.45 : clamp(0.55 + (T.temp - 18) * 0.04, 0.5, 1.3)) : 1;
      for (const f of this.fig) { const U = f.person && f.person.body && f.person.body.userData.U; if (U && U.uSweat) U.uSweat.value = clamp(games / 16 * heat + (m.phase === 'live' ? Math.min(0.06, m.rally * 0.006) : 0), 0, 1); }
    }
    // fades: changing ends, cuts
    if (this.fadeT > 0) { this.fadeT -= dt; const u = 1 - this.fadeT / 0.9; this.fade = u < 0.5 ? u * 2 : (1 - u) * 2; if (u >= 0.5 && this.pendingFlip != null) { this.gfx.setFlip(this.pendingFlip); this.pendingFlip = null; this.fx.clearMarks && this.arena.spec.surface !== 'clay' && this.fx.clearMarks(); } if (this.fadeT <= 0) this.fade = 0; }
    this.gfx.lens.uniforms.uFade.value = this.fade;
    this.gfx.render(dt);
    if (this.ui) this.ui.frame(this, dt);
    if (this.audio) this.audio.frame(this, dt);
    if (ip) this.unbetween(m, ip);
    if (this.net) this.netOut();
  }
  // ---------- online (net.js) ----------
  // This side's player is played here and nowhere else; the other is placed where his side says he is, and swings when
  // it says he swings. Each side sends the shots its own player makes the moment it makes them, and calls the balls
  // coming to its own player; so neither waits on the other for anything it does itself.
  goOnline(o) {
    const net = this.net = o.net, m = this.match;
    this.netGo = false; this.remote = null;
    m.online = true; m.players[1].puppet = true;
    net.clock = () => m.t;
    m.onShot = sh => net.send({ k: 'shot', ...sh });
    m.onJudged = j => net.send({ k: 'judge', type: j.type, w: j.w, why: j.why, d: j.d ? { x: j.d.x, z: j.d.z, miss: j.d.miss } : null });
    const game = this;
    m.ctl[1] = { update(mm, i, dt) { game.placeRemote(mm, dt); } };
  }
  netIn() {
    const m = this.match, net = this.net;
    const md = d => d ? { ...d, x: d.x != null ? -d.x : d.x, z: d.z != null ? -d.z : d.z } : d;
    for (const d of net.take()) {
      if (d.k === 'st') { if (!this.remote || d.t >= this.remote.t) this.remote = d; }
      else if (d.k === 'shot') m.applyRemoteShot(d, net.toLocal(d.t), mirrorBall);
      else if (d.k === 'judge') m.applyRemoteJudged(d, md);
      else if (d.k === 'toss') m.applyRemoteToss();
      else if (d.k === 'catch') m.applyRemoteCatch();
      else if (d.k === 'bye') { this.netGone = true; if (this.ui && this.ui.netGone) this.ui.netGone(); }
    }
    if (m.events.length) this.drain();
  }
  netOut() {
    const m = this.match, p = m.players[0], st = p.stroke;
    this.net.send({ k: 'st', t: m.t, x: p.x, z: p.z, vx: p.vx, vz: p.vz, st: st && !st.done ? { kind: st.kind, wing: st.wing, t0: st.t0, tc: st.tc } : null }, true);
  }
  // the other player: where his side last said he was, carried on at his speed for as long as that took to arrive
  placeRemote(m, dt) {
    const r = this.remote, p = m.players[1]; if (!r) return;
    const age = clamp(m.t - this.net.toLocal(r.t), 0, 0.25), tx = -(r.x + r.vx * age), tz = -(r.z + r.vz * age);
    const k = 1 - Math.exp(-dt * 25);                          // settle onto it without a jump when a packet arrives
    p.x += (tx - p.x) * k; p.z += (tz - p.z) * k; p.vx = -r.vx; p.vz = -r.vz; p.move.x = p.move.z = 0;
    const rs = r.st, cur = p.stroke;
    if (rs && rs.kind !== 'serve') {
      if (!cur || cur._rt0 !== rs.t0) p.stroke = { kind: rs.kind, wing: rs.wing, t0: this.net.toLocal(rs.t0), tc: rs.tc != null ? this.net.toLocal(rs.tc) : null, done: false, hit: false, intent: null, _rt0: rs.t0 };
      else if (rs.tc != null && cur.tc == null) cur.tc = this.net.toLocal(rs.tc);
    } else if (rs && rs.kind === 'serve' && cur && cur.kind === 'serve' && rs.tc != null && cur.tc == null) cur.tc = this.net.toLocal(rs.tc);
  }
  // both loaded: the clocks start together
  netStart() { this.netGo = true; this.match.t = 0; this.acc = 0; }
  // the state one step back, kept before each step
  keep(m) {
    const k = this._prev || (this._prev = { b: [0, 0, 0], p: [0, 0, 0, 0], t: 0, pt: 0, ok: false }), b = m.ball;
    k.b[0] = b.x; k.b[1] = b.y; k.b[2] = b.z; k.p[0] = m.players[0].x; k.p[1] = m.players[0].z; k.p[2] = m.players[1].x; k.p[3] = m.players[1].z; k.t = m.t; k.pt = m.phaseT; k.ok = true;
  }
  // put the match where it is a fraction `a` of the way through the step it is in; returns the true state to put back
  between(m, a) {
    const k = this._prev; if (!k || !k.ok) return null;
    a = Math.min(1, Math.max(0, a)); const w = 1 - a, b = m.ball, P = m.players;
    const real = this._real || (this._real = { b: [0, 0, 0], p: [0, 0, 0, 0], t: 0, pt: 0 });
    real.b[0] = b.x; real.b[1] = b.y; real.b[2] = b.z; real.p[0] = P[0].x; real.p[1] = P[0].z; real.p[2] = P[1].x; real.p[3] = P[1].z; real.t = m.t; real.pt = m.phaseT;
    // a ball put back in a hand or a player put on his mark is placed, not moved: no sliding between the two
    if (Math.hypot(b.x - k.b[0], b.y - k.b[1], b.z - k.b[2]) < 0.6) { b.x -= (b.x - k.b[0]) * w; b.y -= (b.y - k.b[1]) * w; b.z -= (b.z - k.b[2]) * w; }
    for (let i = 0; i < 2; i++) { const dx = P[i].x - k.p[i * 2], dz = P[i].z - k.p[i * 2 + 1]; if (dx * dx + dz * dz < 0.04) { P[i].x -= dx * w; P[i].z -= dz * w; } }
    const st = real.t - k.t; m.t -= st * w; if (m.phaseT >= st) m.phaseT -= st * w;
    return real;
  }
  unbetween(m, r) {
    const b = m.ball, P = m.players;
    b.x = r.b[0]; b.y = r.b[1]; b.z = r.b[2]; P[0].x = r.p[0]; P[0].z = r.p[1]; P[1].x = r.p[2]; P[1].z = r.p[3]; m.t = r.t; m.phaseT = r.pt;
  }

  markers() {
    const m = this.match, fx = this.fx, h = this.human;
    if (!h || this.opts.controls === 'classic' || this.opts.controls == null) {
      // the first game's controls aim with the arrows: no marker to steer, only where his ball will land
      const b0 = this.match.ball, inc0 = this.match.incoming, show0 = h && this.opts.markers && this.match.phase === 'live' && b0.live && b0.lastHit === 1 && inc0 && inc0.land && !inc0.bounced && b0.bounces === 0;
      if (globalThis.__aimMarkOld) { fx.showLanding(show0 ? inc0.land : null, show0 ? 1 : 0); fx.showAim(0, 0, 1, '#fff', 0); return; }
      // where his own ball will land too, as it flies; and where he is aiming: the marker moves as he holds an arrow, and stays where he
      // aimed while the ball is in the air, so aim and landing can be compared (an early or late swing pulls the ball off it)
      const mine0 = h && this.opts.markers && this.match.phase === 'live' && b0.live && b0.lastHit === 0 && inc0 && inc0.land && !inc0.bounced && b0.bounces === 0;
      fx.showLanding(show0 ? inc0.land : null, show0 ? 1 : 0);
      // one lime circle for his own shot, on the court: where he is aiming while the ball comes to him (amber within 0.6 m of a line), and
      // once he has hit it, where it will land
      const s0 = this.match.players[0].sgn, ap = h && this.opts.markers ? h.aimPreview : null;
      if (ap) { const risky = Math.abs(ap.X) > COURT.halfW - 0.6 || Math.abs(ap.D) > COURT.halfLen - 0.6; fx.showMine(ap.X * s0, ap.D * s0, 0.9, risky ? '#ffb36b' : '#d4ff3a'); }
      else if (mine0) fx.showMine(inc0.land.x, inc0.land.z, 0.9, '#d4ff3a');
      else fx.showMine(null);
      fx.showAim(0, 0, 1, '#fff', 0);
      return;
    }
    const b = m.ball, inc = m.incoming;
    // where his shot will land
    const show = this.opts.markers && m.phase === 'live' && b.live && b.lastHit === 1 && inc && inc.land && !inc.bounced && b.bounces === 0;
    fx.showLanding(show ? inc.land : null, show ? 1 : 0);
    // where mine is going
    const srv = m.score.server === 0 && (m.phase === 'ready' || m.phase === 'toss');
    const on = this.opts.markers && (m.phase === 'live' ? b.lastHit !== 0 || !b.live : srv);
    const p = m.players[0], sp = Math.hypot(p.vx, p.vz);
    // The ring is the size of the miss: nineteen balls in twenty land inside it. It is the
    // engine's own scatter for the ball about to be hit — bigger for a fast ball, on the run,
    // for more pace or a riskier shot. Keep it inside the lines and the ball goes in; let it
    // overlap one to gamble, and it turns amber to say so.
    const R = srv ? { x: 0.42, z: 0.55 } : m.missRing(0, h.kindNow || 'drive', h.hold ? h.power : 0.6);
    this.ringX = damp(this.ringX || R.x, R.x, 10, 1 / 60); this.ringZ = damp(this.ringZ || R.z, R.z, 10, 1 / 60);
    const r = this.ringX, rz = this.ringZ;
    const risky = !srv && (Math.abs(h.aim.X) + r > COURT.halfW + 0.05 || Math.abs(h.aim.D) + rz > COURT.halfLen + 0.05);
    const col = risky ? '#ffb36b' : h.kindNow === 'slice' ? '#8fd3ff' : h.kindNow === 'drop' ? '#ffd27a' : h.kindNow === 'lob' ? '#c9a6ff' : h.kindNow === 'flat' ? '#ff9a8a' : '#ffffff';
    fx.showAim(h.aim.X, h.aim.D, r, col, on ? (h.hold ? 0.85 : 0.5) : 0, rz);
  }

  // ---------- replays ----------
  // Every frame of the point is kept. A great winner is shown again in slow motion, as a broadcast does: the strike from
  // low behind the man who hit it, then the ball going past from the other end. A straight cut in and out; Space skips.
  record(dt) {
    const m = this.match; if (dt <= 0) return;
    if (m.phase !== 'live' && !(m.phase === 'over' && m.phaseT < 0.9) && m.phase !== 'toss') { if (m.phase === 'ready') this.rec = []; return; }
    const R = this.rec || (this.rec = []), b = m.ball;
    // (one copy of each stroke for the whole recording, kept up to date: the figure knows a stroke by its identity, and a
    // fresh copy every frame made each replayed frame look like a new stroke starting)
    const sc = this.recSt || (this.recSt = new WeakMap()), cp = st => { if (!st) return null; let c = sc.get(st); if (!c) { c = {}; sc.set(st, c); } Object.assign(c, st); c.intent = null; return c; };
    // (and what about each stroke changes as it is played, kept frame by frame and put back as the replay reaches each frame:
    // the one copy holds a stroke as it ended, struck and finished from its first frame, and the replay played every wind-up
    // as an already-struck swing, every finish cut short by the next stroke as if it were already let go of)
    const stF = st => st ? { tc: st.tc, done: st.done, tEnd: st.tEnd, kind: st.kind, wing: st.wing, tcPlan: st.tcPlan, cp: st.cp, held: st.held, t0: st.t0 } : null;
    const snap = p => ({ x: p.x, z: p.z, vx: p.vx, vz: p.vz, split: p.split, mood: p.mood, moodT: p.moodT, atNet: p.atNet, approach: p.approach,
      move: { x: p.move.x, z: p.move.z }, stroke: cp(p.stroke), lastStroke: cp(p.lastStroke), stF: stF(p.stroke), lsF: stF(p.lastStroke) });
    R.push({ t: m.t, phase: m.phase, phaseT: m.phaseT, server: m.score.server, inc: m.incoming,
      ball: { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, wx: b.wx, wy: b.wy, wz: b.wz, visible: b.visible, held: b.held, live: b.live, lastHit: b.lastHit, bounces: b.bounces, isServe: b.isServe },
      p: [snap(m.players[0]), snap(m.players[1])] });
    if (R.length > 1400) R.splice(0, R.length - 1400);
  }
  // the frame at which the winner struck the ball that won the point
  strikeOf(w) { const R = this.rec || []; for (let k = R.length - 1; k > 0; k--) if (R[k].ball.lastHit === w && R[k - 1].ball.lastHit !== w) return k; return -1; }
  // How good was it? Only a winner, and only one worth seeing twice: a long rally, a pass or a lob over a man at the net,
  // a winner on the run, a big one, a sharp angle, a drop shot, a big point.
  highlight(e) {
    if (e.why !== 'winner' || !this.rec) return 0;
    const R = this.rec, k = this.strikeOf(e.winner); if (k < 0) return 0;
    const A = R[k].p[e.winner], L = R[k].p[1 - e.winner], kind = e.kind || 'drive';
    let sc = 0;
    if (e.rally >= 7) sc += 1; if (e.rally >= 13) sc += 1;
    if (Math.abs(L.z) < 5.5 && kind !== 'smash' && kind !== 'volley') sc += 1.6;          // past or over the man at the net
    if (kind === 'lob') sc += 0.8; if (kind === 'drop') sc += 0.8;
    if ((e.speed || 0) * 3.6 >= 138) sc += 1;
    if (Math.hypot(A.vx, A.vz) > 3.6) sc += 1.1;                                          // struck on the run
    for (let j = k + 1; j < R.length; j++) { const b = R[j].ball; if (b.bounces > 0) { if (Math.abs(b.x) > 3.3 && Math.abs(b.z) < 8.8) sc += 1; break; } }   // a sharp angle
    if (e.val >= 1) sc += 0.5;
    if (e.winner === 0) sc += 0.3;
    return sc;
  }
  startReplay(e) {
    const R = this.rec; if (!R || R.length < 40) return;
    const k = this.strikeOf(e.winner); if (k < 0) return;
    // where the winning ball bounced: the replay ends a moment after it, before the camera has only the back wall to look at
    let bx = 0, bz = -Math.sign(R[k].p[e.winner].z) * 9, tb = R[k].t + 1.2;
    for (let j = k + 1; j < R.length; j++) { const b = R[j].ball; if (b.bounces > 0) { bx = b.x; bz = b.z; tb = R[j].t; break; } }
    const tc = R[k].t, last = R[R.length - 1].t, from = Math.max(R[0].t, tc - (globalThis.__repCamOld ? 1.1 : 0.65)), end = Math.min(last, tb + (globalThis.__repCamOld ? 0.7 : 0.55));
    // (kept from half a second before it opens, for the figures' unseen run-in below: cut at the opening itself,
    // as it was, that run-in had nothing to run through, and every replay opened with the figures cold, the springs that keep an
    // arm out of the body starting from nothing in the middle of a swing)
    const frames = R.filter(f => f.t >= (globalThis.__repPreOld ? from : from - REPLAY_PRE) && f.t <= end); if (frames.filter(f => f.t >= from).length < 30) return;
    const speed = 0.42, A = R[k].p[e.winner], Lp = R[k].p[1 - e.winner];
    this.replay = { frames, t: from, end, tc, speed, who: e.winner, bx, bz, lx: Lp.x, lz: Lp.z, k: 0, side: A.x >= 0 ? 1 : -1, cut: false, cx: null, cz: null };
    this.replays = (this.replays || 0) + 1; this.lastReplayPt = this.match.history.length;
    for (const f of this.fig) { f.inited = false; f.handInit = false; f.setFirstPerson(false); }
    this.match.timer += globalThis.__repCamOld ? (end - from) / speed + 0.2 : Math.max(0, Math.min(end, tc + 0.42) - from) / 0.28 + Math.max(0, end - Math.max(from, tc + 0.42)) / 0.5 + 0.6;
    this.cam.snap = true;
    // (the ball's streak starts afresh: drawn through the last places it had in the live point, the replay opened on a yellow streak
    // from wherever the point ended to where the replay begins)
    if (this.fx && !globalThis.__repStreakOld) this.fx.reset();
    if (this.ui && this.ui.replay) this.ui.replay(true);
  }
  endReplay() {
    this.replay = null; if (this.fx && !globalThis.__repStreakOld) this.fx.reset();
    // straight on to the next point: the cut that would have come after the replay comes now
    const m = this.match; if (m.phase === 'over' && !m.score.over) m.timer = Math.min(m.timer, 1e-3);
    for (const f of this.fig) { f.inited = false; f.handInit = false; } this.fig[0].setFirstPerson(this.camMode === 'fp'); this.cam.snap = true;
    if (this.ui && this.ui.replay) this.ui.replay(false);
  }
  // Each stroke as it was at this moment of the replay. (Its planned moment of contact, which a person's wind-up is timed by
  // and which the game reads afresh every frame, is taken between the two kept frames as the positions are: held from one
  // to the next and then stepped, in slow motion each step of it lurched the wind-up on and stalled it, the arms jerking.)
  replayStrokes(a, c, u) {
    for (let i = 0; i < 2; i++) { const qa = a.p[i], qc = c.p[i];
      for (const [k, f] of [['stroke', 'stF'], ['lastStroke', 'lsF']]) { const st = qa[k], F = qa[f]; if (!st || !F) continue; Object.assign(st, F);
        const G = qc[k] === st ? qc[f] : null; if (G && F.tcPlan != null && G.tcPlan != null && !globalThis.__repOld) st.tcPlan = F.tcPlan + (G.tcPlan - F.tcPlan) * u; } }
  }
  playReplay(dt) {
    const rp = this.replay, F = rp.frames, live = this.match;
    // (super slow motion through the shot, from the side, as a broadcast's slow-motion camera has it; then the ball to its bounce at
    // half speed from the other end)
    if (!globalThis.__repCamOld) rp.speed = rp.t < rp.tc + 0.42 ? 0.28 : 0.5;
    if (rp.stingOut == null) rp.t += dt * rp.speed;
    // (and out as it came in: the wipe closes over the replay's last moment and the next point comes up behind it)
    if (this.ui && this.ui.sting && !globalThis.__repStingOld) {
      if (rp.stingOut == null && (rp.skip || rp.t >= rp.end - 0.2 * rp.speed)) { rp.stingOut = this.time; this.ui.sting(); }
      if (rp.stingOut != null && this.time - rp.stingOut >= 0.2) { this.endReplay(); return; }
    } else if (rp.t >= rp.end || rp.skip) { this.endReplay(); return; }
    try {
      // Before the first frame of a replay is shown, the figures are run unseen through the half second of the
      // point before it, as they are before the cut to a new point: brought in cold, their springs (the elbows' aim, the hands'
      // hold on the racket, the feet's turn) carried on from the end of the point, and the replay opened with the arms and
      // feet swinging into place.
      if (!rp.pre) { rp.pre = true;
        // (at the replay's own pace: run at the real one, the hands' smoothing came out of it with their speed per frame set for a
        // frame two and a half times longer, and overshot through the replay's first frames, the arms jerking as it began)
        const pdt = globalThis.__repOld ? 1 / 60 : rp.speed / 60;
        for (let tt = Math.max(F[0].t, rp.t - REPLAY_PRE), k = 0; tt < rp.t - 1e-6; tt += pdt) {
          while (k < F.length - 2 && F[k + 1].t <= tt) k++;
          const a = F[k], c = F[k + 1] || a, u = c.t > a.t ? clamp((tt - a.t) / (c.t - a.t), 0, 1) : 0, L = (x, y) => x + (y - x) * u;
          const b = { ...a.ball, x: L(a.ball.x, c.ball.x), y: L(a.ball.y, c.ball.y), z: L(a.ball.z, c.ball.z) };
          this.replayStrokes(a, c, u);
          const P = [0, 1].map(i => Object.assign(Object.create(live.players[i]), a.p[i], { x: L(a.p[i].x, c.p[i].x), z: L(a.p[i].z, c.p[i].z), vx: L(a.p[i].vx, c.p[i].vx), vz: L(a.p[i].vz, c.p[i].vz) }));
          const m = Object.assign(Object.create(live), { t: tt, phase: a.phase, phaseT: a.phase === c.phase ? L(a.phaseT, c.phaseT) : a.phaseT, ball: b, players: P, incoming: a.inc,
            score: Object.assign(Object.create(live.score), { server: a.server }) });
          for (let i = 0; i < 2; i++) this.fig[i].update(pdt, P[i], m);
        } }
      let k = rp.k; while (k < F.length - 2 && F[k + 1].t <= rp.t) k++; rp.k = k;
      const a = F[k], c = F[k + 1] || a, u = c.t > a.t ? clamp((rp.t - a.t) / (c.t - a.t), 0, 1) : 0, L = (x, y) => x + (y - x) * u;
      // the ball and the players between the two kept frames, so the slow motion is smooth
      const b = { ...a.ball, x: L(a.ball.x, c.ball.x), y: L(a.ball.y, c.ball.y), z: L(a.ball.z, c.ball.z) };
      this.replayStrokes(a, c, u);
      const P = [0, 1].map(i => Object.assign(Object.create(live.players[i]), a.p[i], { x: L(a.p[i].x, c.p[i].x), z: L(a.p[i].z, c.p[i].z), vx: L(a.p[i].vx, c.p[i].vx), vz: L(a.p[i].vz, c.p[i].vz) }));
      const m = Object.assign(Object.create(live), { t: rp.t, phase: a.phase, phaseT: a.phase === c.phase ? L(a.phaseT, c.phaseT) : a.phaseT, ball: b, players: P, incoming: a.inc,
        score: Object.assign(Object.create(live.score), { server: a.server }) });
      const sdt = dt * rp.speed;
      for (let i = 0; i < 2; i++) this.fig[i].update(sdt, P[i], m);
      // the sounds of it, as they happen
      const pb = rp.pb;
      if (pb && this.audio) {
        if (b.lastHit !== pb.lastHit && b.lastHit >= 0) this.audio.hit({ who: b.lastHit, kind: 'drive', speed: Math.hypot(b.vx, b.vy, b.vz), x: b.x, z: b.z, power: 0.4 });
        if (pb.vy < -0.5 && b.vy > 0.5 && b.y < 0.4) this.audio.bounce({ x: b.x, z: b.z, vy: -pb.vy, speed: Math.hypot(pb.vx, pb.vz) }, this.arena.spec.surface);
      }
      rp.pb = { lastHit: b.lastHit, vx: b.vx, vy: b.vy, vz: b.vz };
      const cam = this.gfx.camera, A = this.arena, C = this.cam, s = rp.who === 0 ? 1 : -1;
      let fov;
      if (!globalThis.__repCamOld && rp.t < rp.tc + 0.42) {
        // the broadcast's slow-motion camera at the side of the court, at court level and on a long lens, tight on the man hitting it:
        // a little in front of him, so he is seen three-quarters on, the swing across the picture
        const W = P[rp.who], sx = rp.side, fx = clamp(W.x + sx * 6.2, -A.hx + 0.8, A.hx - 0.8), fz = W.z - s * 2.2;
        rp.cx = rp.cx == null ? W.x : damp(rp.cx, W.x, 4, sdt * 2.4); rp.cz = rp.cz == null ? W.z : damp(rp.cz, W.z, 4, sdt * 2.4);
        rp.sx = rp.sx == null ? fx : damp(rp.sx, fx, 3, sdt * 2.4); rp.sz = rp.sz == null ? fz : damp(rp.sz, fz, 3, sdt * 2.4);
        cam.position.set(rp.sx, 1.2, rp.sz); cam.lookAt(rp.cx, 1.0, rp.cz);
        const dist = Math.hypot(rp.sx - rp.cx, rp.sz - rp.cz); fov = clamp(2 * Math.atan(1.75 / Math.max(1, dist)) * 180 / Math.PI, 14, 40);
      } else if (rp.t < rp.tc + 0.28) {
        // low behind the striker and following him, a long lens over his shoulder: the run, the shot, where it goes
        const W = P[rp.who];
        rp.cx = rp.cx == null ? W.x : damp(rp.cx, W.x, 3.5, sdt * 2.4); rp.cz = rp.cz == null ? W.z : damp(rp.cz, W.z, 3.5, sdt * 2.4);
        const back = Math.min(4.0, Math.max(2.0, A.hz - Math.abs(rp.cz) - 0.8));
        cam.position.set(clamp(rp.cx + rp.side * 1.5, -A.hx + 1, A.hx - 1), 1.5, rp.cz + s * back);
        cam.lookAt(rp.cx + (rp.bx - rp.cx) * 0.18, 1.05, rp.cz - s * 7);
        fov = 36;
      } else {
        // the reverse angle: low behind the man it beat, the ball coming past him to its bounce
        rp.cut = true;
        const mx = (rp.lx + rp.bx) / 2, mz = (rp.lz + rp.bz) / 2, dz = Math.min(A.hz - 1.0, Math.max(Math.abs(rp.lz), Math.abs(rp.bz)) + 4.5);
        cam.position.set(clamp(mx * 0.5 - rp.side * 1.2, -A.hx + 1, A.hx - 1), 1.65, -s * dz);
        cam.lookAt(mx, 0.85, mz + s * 2.5);
        fov = 38;
      }
      C.snap = false;
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); C.fov = fov; }
      if (this.gfx.setFocus) this.gfx.setFocus(cam.position.distanceTo(_w.set(b.x, b.y, b.z)), 12, 0.006);
      const held = b.held >= 0 ? this.fig[b.held].offHand : null;
      this.fx.update(sdt, b, cam, { held, maxScale: 1.6 });
      this.fx.showLanding(null, 0); this.fx.showAim(0, 0, 1, "#fff", 0); if (this.fx.showMine) this.fx.showMine(null);
      this.arena.update(sdt, this.time);
      this.gfx.render(dt);
      if (this.audio) this.audio.frame(this, dt);
    } catch (err) { console.error(err); this.endReplay(); }
  }

  // ---------- direction: the pictures between the tennis ----------
  // A match is cut like a broadcast. It opens on a crane shot of the stadium; after a point the
  // picture goes to whoever won it, held close on a long lens with the stands thrown out of
  // focus, or to the crowd after a big one; it comes back to the player as the next point is set.
  direct(dt) {
    const m = this.match, c = this.cine;
    if (c) {
      c.t += dt;
      const done = c.kind === 'intro' ? c.t >= c.dur : (m.phase === 'ready' && m.phaseT > 0.05) || m.phase === 'toss' || m.phase === 'live' || c.t > 9;
      if (done || this.replay) this.endCine();
    } else if (this.cineAt && !this.replay && !this.pendingReplay && this.human && m.phase === 'over' && m.phaseT >= this.cineAt.after) {
      const e = this.cineAt.e; this.cineAt = null;
      const big = e.val >= 1 || e.rally >= 9;
      this.cine = { kind: big && Math.random() < 0.45 ? 'crowd' : 'react', t: 0, who: e.winner, side: Math.random() < 0.5 ? -1 : 1, seed: Math.random() };
      this.fig[0].setFirstPerson(false); this.cam.snap = true;
      if (this.ui && this.ui.cine) this.ui.cine(true);
    }
    if (m.phase !== 'over' && this.cineAt) this.cineAt = null;
  }
  endCine() {
    this.cine = null; this.fig[0].setFirstPerson(this.camMode === 'fp'); this.cam.snap = true;
    if (this.ui && this.ui.cine) this.ui.cine(false);
  }
  cineCamera(dt) {
    const c = this.cine, cam = this.gfx.camera, A = this.arena, m = this.match;
    const ease = u => u * u * (3 - 2 * u);
    let fov = 40;
    if (c.kind === 'intro') {
      // the crane: from high over one corner down toward the near baseline
      const u = ease(Math.min(1, c.t / c.dur)), p = m.players[0];
      cam.position.set(lerp(-A.hx - 3, -5.5, u), lerp(17, 4.4, u), lerp(A.hz + 9, A.hz + 1.5, u));
      cam.lookAt(lerp(1.5, p.x * 0.5, u), lerp(0, 1.1, u), lerp(-5, -2, u));
      fov = lerp(44, 50, u); this.gfx.setFocus(70, 40, 0.004);
    } else if (c.kind === 'react') {
      // a long lens on the man who won it, drifting slowly round him
      const p = m.players[c.who], f = this.fig[c.who], s = p.sgn, d = 4.6 - Math.min(1.2, c.t * 0.22), a = c.side * (0.5 + c.t * 0.05);
      const hx = f.head ? f.head.x : p.x, hz = f.head ? f.head.z : p.z, hy = f.head ? f.head.y : 1.7;
      cam.position.set(hx + Math.sin(a) * d, hy - 0.12, hz - s * Math.cos(a) * d);
      cam.lookAt(hx, hy - 0.22, hz);
      fov = 21; this.gfx.setFocus(d + 2.5, 9, 0.011);
    } else {
      // the crowd on its feet: from the middle of the court, panning along a stand
      const side = c.side, z = lerp(-6, 6, (c.seed + c.t * 0.035) % 1);
      cam.position.set(side * 1.5, 2.4, z);
      cam.lookAt(side * (A.hx + 7), 5.2, z + 5 - c.t * 0.5);
      fov = 34; this.gfx.setFocus(60, 30, 0.002);
    }
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); this.cam.fov = fov; }
  }

  // ---------- camera ----------
  updateCamera(dt) {
    if (this.cine) { this.cineCamera(dt); return; }
    const m = this.match, p = m.players[0], f = this.fig[0], b = m.ball, cam = this.gfx.camera, C = this.cam;
    let fov = 66;
    if (this.camMode === 'fp') {
      C.pos.copy(f.eye);
      // look toward the far court, drawn to the ball while it is in play
      const aimX = this.human ? this.human.aim.X : 0;
      _v.set(aimX * 0.28, 0.95, -7.5);
      let w = 0;
      if (b.visible && m.phase === 'live') { w = b.lastHit === 0 ? 0.6 : 1; if (b.z > p.z + 0.4) w *= Math.max(0, 1 - (b.z - p.z - 0.4) / 1.5); }
      else if (m.phase === 'toss' && m.score.server === 0) w = b.held >= 0 ? 0.2 : 0.92;
      else if (m.phase === 'over' && m.phaseT < 1.6 && b.visible) w = 0.7 * (1 - m.phaseT / 1.6);
      C.ballW = C.snap ? w : damp(C.ballW, w, w > C.ballW ? 9 : 4, dt);
      _w.set(b.x, b.y, b.z); _v.lerp(_w, C.ballW);
      const dx = _v.x - C.pos.x, dy = _v.y - C.pos.y, dz = _v.z - C.pos.z;
      const yaw = clamp(Math.atan2(dx, -dz), -1.2, 1.2), pitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -1.0, 1.25);
      const k = C.snap ? 1e3 : 13;
      C.yaw = damp(C.yaw, yaw, k, dt); C.pitch = damp(C.pitch, pitch, k, dt);
      C.roll = C.snap ? -p.vx * 0.006 : damp(C.roll, -p.vx * 0.006, 6, dt);
      C.kick = C.snap ? 0 : damp(C.kick, 0, 9, dt);
      cam.position.copy(C.pos);
      cam.rotation.set(C.pitch + C.kick * 0.012, -C.yaw, C.roll, 'YXZ');
      fov = (this.opts.fov || 68) - (m.phase === 'toss' && m.score.server === 0 ? 3 : 0);
    } else if (this.camMode === 'chase') {
      // (never out through the back wall: with him deep behind the baseline the camera went past it, and from behind the wall's
      // back hid him. Held at the wall it swings round toward the middle of the court instead, keeping its distance and height,
      // a three-quarter view from behind and beside him: held straight behind and lifted, it ended up over him looking down
      // on his head, and aimed up the court it lost him out of the bottom of the picture.)
      const zMax = (this.arena && this.arena.hz ? this.arena.hz : 1e9) - 0.7, R = 4.4, dzW = Math.min(R, Math.max(0.8, zMax - p.z));
      if (C.side == null || C.snap || Math.abs(p.x) > 1.2) C.side = p.x > 0 ? -1 : 1;   /* (kept until he is well over the middle: chosen afresh each frame it swung across through him) */
      const side = C.side;
      const swing = R > dzW ? Math.sqrt(R * R - dzW * dzW) * side : 0;
      _v.set(p.x * 0.78 + swing, 2.55, p.z + dzW);
      // (and its line to him kept inside the arena's own outline: deep in a back corner, swung round toward the middle, it looked
      // at him through the rounded corner wall for half a second; it is brought in along that line until the line is clear)
      // (and where its line to him would cross the arena's own outline, deep in a back corner, it keeps its distance and swings on
      // round him toward the middle of the court, to the first place the line is clear: brought in along the line instead it
      // filled the picture with his back, and stopped half way it looked at him through the corner wall)
      C.pullN = 0;
      if (this.arena && this.arena.F) { const A = this.arena;
        const clear = (cx, cz) => { if (!insideCourt(A, cx, cz, 0.45)) return false; for (let q = 1; q <= 10; q++) { const f = q / 10; if (!insideCourt(A, lerp(cx, p.x, f), lerp(cz, p.z, f), 0.2)) return false; } return true; };
        if (!clear(_v.x, _v.z)) {
          const dx0 = _v.x - p.x, dz0 = _v.z - p.z, r0 = Math.max(2.8, Math.hypot(dx0, dz0)), a0 = Math.atan2(dx0, dz0), pref = C.swSide || (p.x > 0 ? -1 : 1);
          let found = null, fk = 0;
          for (let k = 1; k <= 16 && !found; k++) for (const sg of [pref, -pref]) { const a = a0 + sg * k * 0.1, cx = p.x + Math.sin(a) * r0, cz = p.z + Math.cos(a) * r0; if (clear(cx, cz)) { found = [cx, cz]; fk = k; C.swSide = sg; break; } }
          if (found) { _v.x = found[0]; _v.z = found[1]; C.pullN = Math.min(0.4, fk * 0.04); }
          else { let k = 0; for (let it = 0; it < 10; it++) { k += 0.08; if (clear(lerp(_v.x, p.x, k), lerp(_v.z, p.z, k))) break; } k = Math.min(k, 0.6); _v.x = lerp(_v.x, p.x, k); _v.z = lerp(_v.z, p.z, k); _v.y += k * 3; C.pullN = 0.4; }
        } else C.swSide = null; }
      C.over = C.snap ? Math.abs(swing) : damp(C.over || 0, Math.abs(swing), 7, dt);
      // (moved round him, not across: eased as a turn about him and a distance from him, so swinging from behind him to beside
      // him it keeps its distance; eased in a straight line, it cut across close to him and he filled the picture for a moment)
      if (C.snap) C.pos.copy(_v);
      else { const k = 1 - Math.exp(-dt * 7), ox = C.pos.x - p.x, oz = C.pos.z - p.z, wx = _v.x - p.x, wz = _v.z - p.z;
        const a0 = Math.atan2(ox, oz), a1 = Math.atan2(wx, wz), r0 = Math.hypot(ox, oz), r1 = Math.hypot(wx, wz);
        const da = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)), a = a0 + da * k, r = r0 + (r1 - r0) * k;
        C.pos.set(p.x + Math.sin(a) * r, C.pos.y + (_v.y - C.pos.y) * k, p.z + Math.cos(a) * r); }
      // (and the camera itself, not only where it is headed, stays inside with a clear line to him: easing after him at seven a
      // second, with him sprinting into a back corner it trailed most of a metre behind its mark, out through the boards, and for a
      // few frames the picture was the back of a hoarding; it is brought along toward its mark until it is clear)
      if (this.arena && this.arena.F && !C.snap && !globalThis.__camOld) { const A = this.arena;
        const ok = (cx, cz) => { if (!insideCourt(A, cx, cz, 0.3)) return false; for (let q = 1; q <= 8; q++) { const f = q / 8; if (!insideCourt(A, lerp(cx, p.x, f), lerp(cz, p.z, f), 0.15)) return false; } return true; };
        if (!ok(C.pos.x, C.pos.z) && ok(_v.x, _v.z)) { let lo = 0, hi = 1; for (let it = 0; it < 8; it++) { const mid = (lo + hi) / 2; if (ok(lerp(C.pos.x, _v.x, mid), lerp(C.pos.z, _v.z, mid))) hi = mid; else lo = mid; }
          C.pos.x = lerp(C.pos.x, _v.x, hi); C.pos.z = lerp(C.pos.z, _v.z, hi); C.clampN = (C.clampN || 0) + 1; } }
      // (and the wider he is, or the more it has swung round, the more it looks at him rather than up the middle: out by the side
      // wall, aimed half way to the middle, he was at the edge of the picture and partly out of it)
      C.pull = C.snap ? (C.pullN || 0) : damp(C.pull || 0, C.pullN || 0, 7, dt);
      { const kO = Math.max(sm(C.over / 3), sm(C.pull / 0.4)), kW = sm((Math.abs(p.x) - 3.2) / 2.6) * 0.75, kL = Math.max(kO, kW), lx = lerp(lerp(p.x, b.visible ? b.x : 0, 0.25) * 0.5, p.x, kL), pk = sm(C.pull / 0.4), ly = lerp(globalThis.__chaseLy ?? 0.55, lerp(0.85, 0.7, pk), kO)   /* (aimed a little lower than it was: at 1.05 his feet were on the bottom edge of the picture, often just below it) */, lz = lerp(-3.5, p.z - lerp(3, 0.9, pk), kO);   /* (raised over a corner, it looks at him, not on up the court past him) */
        cam.position.copy(C.pos); cam.lookAt(lx, ly, lz); }
      fov = globalThis.__chaseFov ?? 55;
      this.clearSight(C.pos, p);
    }
    if (this.camMode !== 'chase' && this._hid && this._hid.size) this.clearSight(null, null);
    if (this.camMode !== 'tv' && this._crHid && this._crHid.size) this.clearCrowd(null, null);
    if (this.camMode !== 'fp' && this.camMode !== 'chase') {
      // the broadcast position: high behind the baseline, panning a little with the ball
      const bx = b.visible ? b.x : 0;
      // (and pans on with the near player when he runs wide, as a broadcast camera follows him: held to the ball alone, a player
      // chasing a wide ball past the sideline ran out of the picture for a second and a half)
      const near = m.players.reduce((a, q) => (q.z > a.z ? q : a), m.players[0]), nx = near ? near.x : 0, ex = Math.sign(nx) * Math.max(0, Math.abs(nx) - 4.6) * 0.75;
      const tvT = bx * 0.16 + ex;
      C.tvx = C.snap ? tvT : damp(C.tvx || 0, tvT, 3, dt);
      // (and tilts down after him when he goes back deep: three metres behind the baseline his feet were off the bottom of it)
      // (and craned up over the stands when he goes back deep: from its usual height the first rows of the stand behind the
      // baseline, and the back wall's raised end, stood between it and his legs within a couple of metres of the back wall)
      const nz = near ? Math.abs(near.z) : 0, nzA = near ? Math.max(nz, Math.abs(near.z + (near.vz || 0) * 0.4)) : 0;   /* (where he is going, a little ahead, as a camera operator leads a running player) */
      // (and over whatever of the stadium stands between it and the court itself: the ends of a bowl are not always alike, and
      // with the stadium turned round for a change of ends, the front of Wimbledon's far upper tier came up just under the
      // camera's line, a band across the middle of the picture where the net should be)
      const deepN = near && nzA > COURT.halfLen + 1.2;
      if (this.arena && this.arena.root && !globalThis.__noCrane && (deepN || !globalThis.__craneCourtOld)) {
        if (!(this._craneT > this.time - 0.1)) { this._craneT = this.time; const rc = this._rc || (this._rc = new THREE.Raycaster()), sgn = near ? Math.sign(near.z) || 1 : 1;
          const court = [[0.5, 0, 0.4], [1.0, 0, 0], [0.5, 0, -COURT.halfLen], [0.3, 0, COURT.halfLen]].concat(near && !deepN ? [[0.06, near.x, near.z], [0.95, near.x, near.z]] : []);   /* (along the middle, and the near player wherever he is: by the near corners a ball kid would stand in the way of no picture) */
          const zA = near ? near.z + (near.vz || 0) * 0.4 : 0, xA = near ? near.x + (near.vx || 0) * 0.4 : 0, pts = (deepN ? [[0.06, near.x, near.z], [0.45, near.x, near.z], [0.95, near.x, near.z], [0.06, xA, zA], [0.45, xA, zA]] : []).concat(globalThis.__craneCourtOld ? [] : court).map(([y, x, z]) => new THREE.Vector3(x, y, z));   /* (his feet too: tilted down after him, the front rows of the stand cut across the bottom of the picture at his shoes) */
          let want = 9.6, wantZ = 30;
          for (const [h, cz] of [[9.6, 30], [10.8, 30], [12, 30], [13.2, 30], [14.4, 30], [15.6, 30]]) {   /* (up a little only: craned higher, or forward over the stands, it looked down on the top of his head and lost the far player) */ let ok = true; const o = new THREE.Vector3(0, h, cz * sgn);
            for (const q of pts) { const d = q.clone().sub(o), L = d.length(); rc.set(o, d.normalize()); rc.far = L - 0.35;
              const hit = rc.intersectObject(this.arena.root, true).find(x => x.object.visible && !x.object.isPoints); if (hit) { ok = false; break; } }
            want = h; wantZ = cz; if (ok) break; }
          this._craneW = want; this._craneZ = wantZ; } }
      else { this._craneW = 9.6; this._craneZ = 30; }
      C.tvh = C.snap ? (this._craneW || 9.6) : damp(C.tvh || 9.6, this._craneW || 9.6, (this._craneW || 9.6) > (C.tvh || 9.6) ? 6 : 2, dt);   /* (up quickly, as he runs back; down slowly) */
      C.tvcz = C.snap ? (this._craneZ || 30) : damp(C.tvcz || 30, this._craneZ || 30, (this._craneZ || 30) < (C.tvcz || 30) ? 6 : 2, dt);
      const camH = C.tvh, camZ = C.tvcz;
      // (the look tilted down just enough that his feet stay a few degrees inside the bottom edge of the picture, and never so far
      // that the far player goes off the top of it: where both cannot be had at once, it zooms out a little to hold both, as a
      // broadcast camera does)
      const far = m.players.find(q => q !== near) || near, mg = 0.05, half0 = 31 / 2 * Math.PI / 180, a0 = Math.atan2(camH - 0.5, camZ - 0.4);
      const aBot = Math.atan2(camH, Math.max(1, camZ - nzA)), aTop = Math.atan2(camH - 2.05, camZ - (far ? far.z : -12));
      let half = half0, aL;
      if (aBot - aTop + 2 * mg <= 2 * half0) aL = Math.min(Math.max(a0, aBot - (half0 - mg)), aTop + (half0 - mg));
      else { half = (aBot - aTop) / 2 + mg; aL = (aBot + aTop) / 2; }
      const tzT = camZ - (camH - 0.5) / Math.tan(aL);
      C.tvz = C.snap ? tzT : damp(C.tvz ?? 0.4, tzT, 3, dt);
      cam.position.set(0, C.tvh || 9.6, C.tvcz || 30.0); cam.lookAt(C.tvx, 0.5, C.tvz ?? 0.4);
      this.clearCrowd(cam.position, near && nzA > COURT.halfLen + 1.5 ? near : null);
      fov = globalThis.__noTvZoom ? 31 : Math.max(31, half * 2 * 180 / Math.PI);   // three metres of room behind the near baseline, as a broadcast frames it
    }
    // focus: the court and both players sharp, the stands beyond them soft — strongly through the
    // broadcast camera's long lens, only a little through the player's own eyes
    if (this.gfx.setFocus) {
      // focused on the far baseline from wherever the camera is, with the same softness behind it in every view
      const fd = Math.hypot(cam.position.x, cam.position.y, cam.position.z + 12) + 2;
      this.gfx.setFocus(fd, 30, 0.0035);
    }
    C.fov = damp(C.fov, fov, C.snap ? 1e3 : 6, dt);
    if (Math.abs(cam.fov - C.fov) > 0.01) { cam.fov = C.fov; cam.updateProjectionMatrix(); }
    C.snap = false;
  }

  // ---------- engine events ----------
  drain() {
    if (this.net && this.match.online) for (const e of this.match.events) { if (e.type === 'toss' && e.who === 0) this.net.send({ k: 'toss' }); else if (e.type === 'tossCatch' && e.who === 0) this.net.send({ k: 'catch' }); }
    const m = this.match, ev = m.events, A = this.arena, fx = this.fx, au = this.audio, ui = this.ui;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      switch (e.type) {
        case 'hit': {
          if (e.who === 0 && this.camMode === 'fp') this.cam.kick = (e.kind === 'serve' ? 1.6 : 1) * (0.5 + e.power) * 0.5;
          if (e.who === 0 && this.human && e.timing != null) this.hud.timing = { t: this.time, v: e.timing, shank: e.shank };
          if (e.kind === 'serve') this.hud.serve = { t: this.time, kmh: e.speed * 3.6, who: e.who };
          this.hud.lastHit = { t: this.time, who: e.who, kmh: e.speed * 3.6, kind: e.kind };
          break;
        }
        case 'bounce': {
          const b = m.ball, sp = e.speed;
          if (!e.dead || sp > 4) fx.mark(e.x, e.z, b.vx, b.vz, sp);
          const s = A.spec.surface;
          if (s === 'clay') fx.puff(e.x, 0.02, e.z, Math.min(10, 3 + sp * 0.25) | 0, { speed: 0.5 + sp * 0.03, size: 0.10, life: 0.55, alpha: 0.45, vx: b.vx, vz: b.vz });
          else if (e.line && s === 'grass') fx.puff(e.x, 0.02, e.z, 7, { speed: 0.6, size: 0.09, life: 0.5, alpha: 0.6, color: '#ffffff', vx: b.vx, vz: b.vz });
          else if (s === 'hard' && sp > 18) fx.puff(e.x, 0.02, e.z, 2, { speed: 0.3, size: 0.06, life: 0.25, alpha: 0.18 });
          break;
        }
        case 'net': A.net.hit(e.x, e.y, m.ball.lastHit === 0 ? -1 : 1, e.speed); break;
        case 'netcord': A.net.hit(e.x, e.y, m.ball.lastHit === 0 ? -1 : 1, e.speed * 0.4); break;
        case 'point': {
          const big = e.val >= 1 ? 0.25 : 0, q = e.why === 'winner' || e.why === 'ace' ? 0.25 : e.cls === 'unforced' || e.why === 'doubleFault' ? -0.12 : 0.05;
          A.crowd.cheer(clamp(0.22 + e.rally * 0.045 + q + big + (e.val >= 2 ? 0.2 : 0), 0.08, 1), 2.2 + e.rally * 0.12 + (e.val >= 2 ? 3 : 0));
          this.drawBoard();
          // cutaways and replays between points are off unless asked for: the next point comes straight up
          if (this.human && this.cfg.cuts) this.cineAt = { e, after: 1.05 };
          if (this.cfg.cuts && (e.why === 'ace' || e.why === 'winner') && (e.why === 'ace' ? Math.random() < 0.5 : e.rally >= 3 || e.val >= 1 || Math.random() < 0.5)) this.pendingReplay = e;
          // a great winner is shown again (not online, where the two ends would fall out of step, and not on the last point:
          // the result comes up then); not two in a row unless the second is even better
          else if (this.human && !this.net && !m.score.over && this.opts.replays !== 'off') {
            const sc = this.highlight(e), recent = this.lastReplayPt != null && m.history.length - this.lastReplayPt <= 3;
            if (sc >= (recent ? 3.2 : 2.2)) this.pendingReplay = e;
          }
          break;
        }
        case 'changeEnds': this.pendingFlip = m.env.flip; this.flipAt = true; break;
        case 'placed': this.cam.snap = true; for (const f of this.fig) { f.inited = false; f.handInit = false; }
          // changing ends happens at the same cut
          if (this.pendingFlip != null) { this.gfx.setFlip(this.pendingFlip); this.pendingFlip = null; this.flipAt = false; if (this.fx.clearMarks && this.arena.spec.surface !== 'clay') this.fx.clearMarks(); }
          this.settle = true; break;
        case 'match': this.over = true; break;
      }
      if (au) au.event(e.type, e, this);
      if (ui) ui.event(e.type, e, this);
    }
    ev.length = 0;
    // the cut for a change of ends happens as the players walk off
    if (this.flipAt && m.phase === 'between') { this.flipAt = false; this.fadeT = 0.9; }
  }

  // The stadium scoreboard.
  drawBoard() {
    const A = this.arena, m = this.match; if (!A || !A.scoreCanvas) return;
    const c = A.scoreCanvas, g = c.getContext('2d'), W = c.width, H = c.height, s = m.score;
    g.fillStyle = '#04070c'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#0d1a2b'; g.fillRect(0, 0, W, 70);
    g.font = '600 34px "Helvetica Neue", Arial, sans-serif'; g.fillStyle = '#9fb4cc'; g.textBaseline = 'middle'; g.textAlign = 'left';
    const T = this.cfg.T; g.fillText(((T ? T.name : 'Exhibition') + (this.cfg.round ? ' · ' + (ROUND_NAME[this.cfg.round] || this.cfg.round) : '')).toUpperCase(), 36, 36);
    const pt = m.pointText();
    for (let i = 0; i < 2; i++) {
      const y = 150 + i * 120;
      g.font = '700 64px "Helvetica Neue", Arial, sans-serif'; g.fillStyle = '#ffffff'; g.textAlign = 'left';
      g.fillText(m.players[i].prof.name.toUpperCase(), 70, y);
      if (s.server === i && !s.over) { g.fillStyle = '#d7e83a'; g.beginPath(); g.arc(40, y, 11, 0, 6.3); g.fill(); }
      g.textAlign = 'center'; let x = W - 60;
      g.fillStyle = '#d7e83a'; g.font = '700 64px "Helvetica Neue", Arial, sans-serif'; g.fillText(s.over ? '' : pt[i], x, y); x -= 110;
      g.fillStyle = '#ffffff'; g.fillText(String(s.g[i]), x, y); x -= 84;
      for (let k = s.sets.length - 1; k >= 0; k--) { g.fillStyle = s.sets[k].g[i] > s.sets[k].g[1 - i] ? '#ffffff' : '#7f8ea3'; g.fillText(String(s.sets[k].g[i]), x, y); x -= 76; }
    }
    A.scoreTex.needsUpdate = true;
  }
}
