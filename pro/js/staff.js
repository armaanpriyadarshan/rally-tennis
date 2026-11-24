// Rally Pro — the people who work the court: the chair umpire and six ball kids.
// They work as they do at a tour event. Two kids kneel by the net posts and four stand at the back
// corners, hands behind their backs, watching the ball. When a point ends the kid nearest the dead
// ball runs out, picks it up and runs back to his place, if he can be back before the next serve; while
// the ball is in play nobody moves. After each point the umpire enters it on his tablet and leans to
// the microphone to call the score; between points he watches the server, in a point the ball.
// A kid at rest costs a head turn a frame. One who moves is posed in full from motion capture (the
// CMU walks and runs in motion.js), his feet held where they land, through the same kind of solve the
// players use.
import * as THREE from 'three';
import { CLIPS, J, N3, ANKLE_H, sampleLoop, mix } from './motion.js';
import { COURT, BALL } from './physics.js';
import { swing } from './people.js';
import { blobTexture } from './textures.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const sm = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const dampA = (a, b, k, dt) => a + wrap(b - a) * (1 - Math.exp(-k * dt));
const UP = V(0, 1, 0), RIGHT = V(1, 0, 0), GRAV = 9.81;

// ---------- poses: nineteen joints, in the motion clips' frame (x right, y up, z forward; metres for a 1.85 m body) ----------
const STAND = CLIPS.stand.F[0];
const pose = (o, base = STAND) => { const a = Float32Array.from(base); for (const k in o) a.set(o[k], J[k] * 3); return a; };
const segL = (P, a, b) => Math.hypot(P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]);
const LEGC = (segL(STAND, J.lhip, J.lknee) + segL(STAND, J.lknee, J.lankle) + segL(STAND, J.rhip, J.rknee) + segL(STAND, J.rknee, J.rankle)) / 2;
// at ease at the back: feet apart, hands clasped behind the back
const AT_EASE = pose({ lankle: [-0.14, 0.095, 0], rankle: [0.14, 0.095, 0], ltoe: [-0.18, 0.03, 0.135], rtoe: [0.18, 0.03, 0.135], lknee: [-0.12, 0.55, 0.075], rknee: [0.12, 0.55, 0.075],
  neck: [0, 1.53, 0.025], head: [0, 1.84, 0.05], lsho: [-0.20, 1.585, -0.015], rsho: [0.20, 1.585, -0.015],
  lelb: [-0.245, 1.30, -0.11], relb: [0.245, 1.30, -0.11], lwri: [-0.075, 1.07, -0.19], rwri: [0.075, 1.07, -0.19] });
// on the right knee by the net post: the left foot flat in front, a forearm across the raised knee
const KNEEL = pose({ pelvis: [0, 0.63, 0.02], lhip: [-0.10, 0.53, 0.02], rhip: [0.10, 0.53, 0.02], lknee: [-0.15, 0.50, 0.40], rknee: [0.12, 0.08, -0.07],
  lankle: [-0.15, 0.095, 0.44], rankle: [0.13, 0.115, -0.52], ltoe: [-0.18, 0.03, 0.57], rtoe: [0.13, 0.03, -0.60],
  neck: [0, 1.04, 0.15], head: [0, 1.35, 0.20], lsho: [-0.20, 1.09, 0.12], rsho: [0.20, 1.09, 0.12],
  lelb: [-0.26, 0.80, 0.20], relb: [0.25, 0.80, 0.14], lwri: [-0.16, 0.60, 0.40], rwri: [0.22, 0.57, 0.31] });
// bent to take a ball off the ground in front of the right foot
const PICK = pose({ lhip: [-0.10, 0.56, -0.14], rhip: [0.10, 0.56, -0.14], lknee: [-0.17, 0.48, 0.30], rknee: [0.18, 0.36, 0.06],
  lankle: [-0.15, 0.095, 0.12], rankle: [0.16, 0.10, -0.18], ltoe: [-0.17, 0.03, 0.26], rtoe: [0.18, 0.03, -0.05],
  neck: [0, 0.98, 0.33], head: [0, 1.20, 0.47], lsho: [-0.20, 0.96, 0.30], rsho: [0.20, 0.93, 0.33],
  lelb: [-0.28, 0.70, 0.36], relb: [0.25, 0.66, 0.45], lwri: [-0.20, 0.48, 0.40], rwri: [0.22, 0.30, 0.55] });
// down low where he stands, hands on his knees: a kid caught out on the court when play starts holds this, quite still
const CROUCH = pose({ lhip: [-0.10, 0.66, -0.06], rhip: [0.10, 0.66, -0.06], lknee: [-0.17, 0.46, 0.24], rknee: [0.17, 0.46, 0.24],
  lankle: [-0.17, 0.095, 0.02], rankle: [0.17, 0.095, 0.02], ltoe: [-0.20, 0.03, 0.16], rtoe: [0.20, 0.03, 0.16],
  neck: [0, 1.13, 0.26], head: [0, 1.40, 0.36], lsho: [-0.20, 1.10, 0.22], rsho: [0.20, 1.10, 0.22],
  lelb: [-0.27, 0.86, 0.26], relb: [0.27, 0.86, 0.26], lwri: [-0.18, 0.62, 0.30], rwri: [0.18, 0.62, 0.30] });
const FW = [CLIPS.walk, CLIPS.jog, CLIPS.run, CLIPS.sprint];
const ARM_J = [[J.lsho, J.lelb, J.lwri], [J.rsho, J.relb, J.rwri]], LEG_J = [[J.lhip, J.lknee, J.lankle, J.ltoe], [J.rhip, J.rknee, J.rankle, J.rtoe]];

// time to run d metres from a standstill to a standstill, at most v m/s (with a little for going round things)
const runT = (d, v) => (d < v * v / 6.5 ? 2 * Math.sqrt(d / 6.5) : d / v + v / 6.5) * 1.08;

// ---------- scratch ----------
const _inv = new THREE.Matrix4(), _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _qP = new THREE.Quaternion(), _qC = new THREE.Quaternion(), _qH = new THREE.Quaternion(), _qN = new THREE.Quaternion();
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _f = V(), _g = V(), _h = V(), _pel = V(), _spine = V(), _pole = V(), _sh = V(), _el = V(), _wr = V(), _hip = V(), _an = V(), _kn = V(), _w = V();
const _fx = V(), _fy = V(), _fz = V();
// the direction from joint a to joint b of a pose, in the body's own frame (x right, y up, forward -z)
function cd(P, a, b, out) { return out.set(P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]).normalize(); }
// Person.drive for the few bones driven every frame at rest, without its by-name lookups: the bone, its rest
// orientation, and the world orientations it and its parent keep in person.world (the same objects drive() updates)
function links(per, names) {
  const L = {};
  for (const n of names) {
    const b = per.bones['Bip01_' + n], pn = b.parent.name.slice(6);
    if (!per.world[n]) per.drive(n, _q.identity());
    if (!per.world[pn]) per.drive(pn, _q.identity());
    L[n] = { b, rq: per.rest['Bip01_' + n].q, w: per.world[n], pw: per.world[pn] };
  }
  return L;
}
function fastDrive(l, F) { l.w.copy(F).multiply(l.rq); l.b.quaternion.copy(l.pw).invert().multiply(l.w); }
function frameOf(rt, up, out) { const y = _fy.copy(up).normalize(), x = _fx.copy(rt).addScaledVector(y, -rt.dot(y)).normalize(), z = _fz.copy(x).cross(y); _m4.makeBasis(x, y, z); return out.setFromRotationMatrix(_m4); }
// two-bone IK: the middle joint of a chain from `a` to `t`, bent toward `pole`
function ik(a, t, l1, l2, pole, out) {
  const d = _a.copy(t).sub(a); let L = d.length(); L = clamp(L, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4); d.normalize();
  const x = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const p = _b.copy(pole).addScaledVector(d, -pole.dot(d)); if (p.lengthSq() < 1e-8) p.set(0, 0, -1).addScaledVector(d, d.z); p.normalize();
  return out.copy(a).addScaledVector(d, x).addScaledVector(p, h);
}

// The court's floor plan: inside the walls, `margin` metres clear of them, the rounded corners taken as the
// polygon they are built from.
export function insideCourt(A, x, z, margin) {
  const F = A.F, ax = Math.abs(x), az = Math.abs(z);
  if (ax > A.hx - margin || az > A.hz - margin) return false;
  if (!F) return true;
  const sx = A.hx - F.rc, sz = A.hz - F.rc; if (ax <= sx || az <= sz) return true;
  return Math.hypot(ax - sx, az - sz) <= F.rc * Math.cos(Math.PI / 4 / Math.max(1, F.nc)) - margin;
}

// ---------- a ball the staff handle: lying dead, or in a kid's hand ----------
class Ball {
  constructor(mesh) { this.mesh = mesh; this.mode = 'off'; this.x = 0; this.y = 0; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0; this.mirror = false; this.claim = null; this.age = 0; }
  show(on) { this.mesh.visible = on; }
  speed() { return Math.hypot(this.vx, this.vz); }
}

export class Staff {
  // A: the arena; o: { ump, umpAt: { tablet, mic } (arena-local), kids: [{ person, x, z, ry, kneel }], group, obstacles: [{ x, z, r }] }
  constructor(A, o) {
    this.A = A; this.f = 1;
    this.F = A.F; this.hx = A.hx; this.hz = A.hz;
    this.obst = o.obstacles || [];
    this.players = [{ x: 0, z: 0, r: 0.6 }, { x: 0, z: 0, r: 0.6 }];
    this.balls = []; this.prev = null; this.hideMatch = false; this.matchBall = null; this.frozen = false;
    // set true if the computer server holds his serve while m.courtBusy (then a kid may take longer over a ball)
    this.aiWaits = false;
    this.ump = o.ump ? new Ump(this, o.ump, o.umpAt) : null;
    this.kids = (o.kids || []).map((k, i) => new Kid(this, k.person, k, i));
    // contact shadows under the kids: one draw for all six
    const bm = new THREE.MeshBasicMaterial({ map: blobTexture(64), color: '#000000', transparent: true, depthWrite: false, opacity: 0.30, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const bg = new THREE.PlaneGeometry(1, 1); bg.rotateX(-Math.PI / 2);
    this.blobs = new THREE.InstancedMesh(bg, bm, Math.max(1, this.kids.length)); this.blobs.renderOrder = 3; this.blobs.frustumCulled = false; this.blobs.userData.live = true;
    (o.group || A.root).add(this.blobs);
    for (const k of this.kids) { k.pose(0, k.rest, true); k.settled(); }
    this.blobs.instanceMatrix.needsUpdate = true;
    this.t = 0;
  }
  inside(x, z, margin) { return insideCourt(this.A, x, z, margin); }
  // out of whatever stands on the floor there
  clear(p, margin) { for (const o of this.obst) { const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), r = o.r + margin; if (d < r) { if (d < 1e-4) p.x += r; else { p.x = o.x + dx / d * r; p.z = o.z + dz / d * r; } } } return p; }
  clampIn(p, margin) { for (let i = 0; i < 24 && !this.inside(p.x, p.z, margin); i++) { p.x *= 0.96; p.z *= 0.985; } return p; }
  takeBall() {
    let b = this.balls.find(x => x.mode === 'off');
    // all in use: the ball that has lain longest unwanted goes (one lying out of the way, never one in a hand)
    if (!b && this.balls.length >= 8) { let old = null; for (const x of this.balls) if (x.mode === 'free' && !x.claim && !x.mirror && (!old || x.age > old.age)) old = x; if (old) { this.free(old); b = old; } }
    if (!b && this.mesh0 && this.balls.length < 8) { const m = new THREE.Mesh(this.mesh0.geometry, this.mesh0.material); m.castShadow = true; m.visible = false; m.userData.live = true; this.A.root.add(m); b = new Ball(m); this.balls.push(b); }
    if (b) { b.mode = 'off'; b.mirror = false; b.claim = null; b.age = 0; b.show(false); }
    return b || null;
  }
  free(b) { if (!b) return; b.mode = 'off'; b.mirror = false; b.claim = null; b.show(false); if (this.matchBall === b) this.matchBall = null; }

  // ---------- each frame, from the game: what the match is doing ----------
  watch(m, game) {
    const f = this.f = this.A.uniforms ? this.A.uniforms.uArenaFlip.value : 1, b = m.ball, ph = m.phase, prev = this.prev;
    this.m = m; this.game = game;
    if (!this.mesh0 && game.fx && game.fx.ball) this.mesh0 = game.fx.ball;
    { const dtt = this.pT != null ? m.t - this.pT : 0; this.pT = m.t;
      for (let i = 0; i < 2; i++) { const p = m.players[i], q = this.players[i], x = p.x * f, z = p.z * f;
        // (and where he is headed: a kid at the back gets out of his way before he arrives, not as he does)
        if (dtt > 1e-4 && dtt < 0.25) { q.vx = (x - q.x) / dtt; q.vz = (z - q.z) / dtt; } else if (dtt !== 0) q.vx = q.vz = 0;
        q.x = x; q.z = z; } }
    // a point (or a serve) is over: the ball lying out there is someone's to fetch
    if (ph === 'over' && prev !== 'over' && b.visible && b.held < 0 && !this.matchBall) {
      const db = this.takeBall(); if (db) { db.mode = 'free'; db.mirror = true; this.matchBall = db; }
    }
    const mb = this.matchBall;
    if (mb && mb.mirror) {
      if ((ph === 'over' || ph === 'between') && b.held < 0) { mb.x = b.x * f; mb.y = b.y; mb.z = b.z * f; mb.vx = b.vx * f; mb.vy = b.vy; mb.vz = b.vz * f; }
      else { mb.mirror = false; if (mb.mode === 'free') mb.show(true); this.matchBall = null; }                     // the match has taken its ball back for the next point: ours stays where it lay
    }
    if (mb && !mb.mirror && mb.mode !== 'free' && mb.mode !== 'off' && !(ph === 'over' || ph === 'between')) this.matchBall = null;
    // picked up before the next point was set: the match's own ball is the one in the kid's hand now
    this.hideMatch = !!(mb && mb.mode === 'hand' && (ph === 'over' || ph === 'between') && b.held < 0);
    if (mb && mb.mode === 'hand' && !(ph === 'over' || ph === 'between')) this.matchBall = null;
    // While the ball is in play nobody on the court moves (Kid.update holds them where they are).
    this.frozen = ph === 'toss' || ph === 'live';
    // send someone for a ball lying dead, but only on an errand he can finish before the next serve
    if (ph === 'over' || ph === 'between' || ph === 'ready') { const left = this.deadLeft(m, game); if (left > 1) for (const x of this.balls) if (x.mode === 'free' && !x.claim && x.age > 0.3) this.dispatch(x, left, m); }
    // A ball lying in the court that nobody could fetch in time is quietly gone as the next point is set (the
    // picture dips for that in quick play), and at the latest as the serve is tossed.
    if ((ph === 'ready' && prev !== 'ready' && prev !== 'toss') || (ph === 'toss' && prev !== 'toss'))
      for (const x of this.balls) if (x.mode === 'free' && !x.mirror && (!x.claim || ph === 'toss') && ((Math.abs(x.x) < COURT.halfWD + 0.3 && Math.abs(x.z) < COURT.halfLen + 0.3) || (!x.claim && x.age > 20))) this.free(x);   /* (and one anywhere that nobody has fetched in twenty seconds, at the same cut) */
    // whether a kid is out on the court (for a computer server that waits for him: see aiWaits)
    m.courtBusy = this.courtBusy();
    if (this.hideMatch && game.fx && game.fx.ball) game.fx.ball.visible = false;
    if (this.ump) this.ump.watch(m, this);
    this.prev = ph;
  }
  courtBusy() {
    const X = COURT.halfWD + 0.6, Z = COURT.halfLen + 0.8;
    for (const k of this.kids) {
      if (k.state !== 'rise' && k.state !== 'out' && k.state !== 'pick' && k.state !== 'back') continue;
      if (Math.abs(k.x) < X && Math.abs(k.z) < Z) return true;
      const b = k.target; if (b && Math.abs(b.x) < X && Math.abs(b.z) < Z) return true;
    }
    return false;
  }
  // How long until the next serve can be struck: the rest of this dead time, and how long the next server stands at
  // the line (a person may toss as soon as he likes, so a kid is never sent out while he waits to)
  deadLeft(m, game) {
    const ph = m.phase, human = !!game.human && m.score.server === 0, wait = human ? 0.4 : this.aiWaits ? 9 : m.quick ? 1.3 : 2.4;
    if (ph === 'over') return m.timer + (m.quick && m.nextGap === 0 ? 0 : (m.nextGap || 0) * (m.pace || 1)) + wait;
    if (ph === 'between') return Math.max(0, m.timer) + wait;
    if (ph === 'ready') return human ? 0 : Math.max(0, wait - m.phaseT);
    return 0;
  }
  // a kid's errand, there and back to his place and down again, in seconds
  trip(k, p) {
    const v = k.home.kneel ? 6.0 : 4.6;
    return (k.home.kneel ? 0.25 : 0.05) + runT(Math.hypot(p.x - k.x, p.z - k.z), v) + 0.72 + runT(Math.hypot(p.x - k.home.x, p.z - k.home.z), v) + (k.home.kneel ? 0.95 : 0.65);
  }
  dispatch(ball, left, m) {
    const p = ball.restAt || (ball.restAt = V()); this.restOf(ball, p);
    if (!this.inside(p.x, p.z, 0.12)) { if (ball.age > 3 && ball.speed() < 0.05) this.free(ball); return; }         // lost behind the wall's corner: out of sight, out of play
    for (const o of this.obst) if (o.solid && Math.hypot(p.x - o.x, p.z - o.z) < o.r) { if (ball.age > 3 && ball.speed() < 0.05) this.free(ball); return; }   // under a cabinet
    // Onto the court itself only for a whole errand, there and back, that is over before the next serve (in quick
    // play that needs a server who waits: aiWaits), and never between a first and a second serve. Off the court, at
    // the back or wide, he need only have the ball in his hand by then; if play starts on his way back he stops
    // where he is, out of the way, until the point is over.
    const inCourt = Math.abs(p.x) < COURT.halfWD + 0.2 && Math.abs(p.z) < COURT.halfLen + 0.2;
    if (inCourt && (m.score.serveNum === 2 || !this.aiWaits)) return;
    let best = null, bt = left - 0.2;
    const netZone = Math.abs(p.z) < COURT.halfLen - 5.4;
    for (const k of this.kids) {
      if (k.state !== 'home') continue;
      // whose ball it is: by the net, the kid on that side (or a back kid at that end); further back, the back kids at that end
      const ok = netZone ? (k.home.kneel ? Math.sign(k.home.x) === Math.sign(p.x || 1) : Math.sign(k.home.z) === Math.sign(p.z || 1)) : (!k.home.kneel && Math.sign(k.home.z) === Math.sign(p.z));
      if (!ok) continue;
      const t = inCourt ? this.trip(k, p) : (k.home.kneel ? 0.25 : 0.05) + runT(Math.hypot(p.x - k.x, p.z - k.z), k.home.kneel ? 6.0 : 4.6) + 0.72;
      if (t < bt) { bt = t; best = k; }
    }
    // (a ball off the court that has lain through a serve is fetched whenever someone is free, in time or not: one in a far
    // corner is three seconds' run away, never in time for the next serve, and they lay there all match, seven at once.
    // If play starts while he is out he stops where he is, off the court, until the point is over.)
    if (!best && !inCourt && ball.age > 4) { let bt2 = 1e9;
      for (const k of this.kids) { if (k.state !== 'home') continue; const ok = netZone ? (k.home.kneel ? Math.sign(k.home.x) === Math.sign(p.x || 1) : Math.sign(k.home.z) === Math.sign(p.z || 1)) : (!k.home.kneel && Math.sign(k.home.z) === Math.sign(p.z)); if (!ok) continue;
        const t = runT(Math.hypot(p.x - k.x, p.z - k.z), k.home.kneel ? 6.0 : 4.6); if (t < bt2) { bt2 = t; best = k; } } }
    if (best) best.fetch(ball);
  }
  // where a ball will come to rest: it rolls out as the match's dead ball does (speed falling 2.2 a second)
  restOf(b, out) {
    if (b.mode === 'hand') return out.set(b.x, 0, b.z);
    const air = b.y > 0.25 ? 0.45 : 0;
    out.set(b.x + b.vx * (1 / 2.2 + air), 0, b.z + b.vz * (1 / 2.2 + air));
    // the net stops it
    if (Math.sign(out.z) !== Math.sign(b.z) && Math.abs(b.z) > 0.02 && Math.abs(out.x) < COURT.postX + 1.4) out.z = Math.sign(b.z) * 0.06;
    return this.clampIn(out, 0.15);
  }
  // ---------- each frame, from the arena ----------
  update(dt, t) {
    this.t = t;
    // balls
    for (const b of this.balls) {
      if (b.mode === 'off') continue;
      b.age += dt;
      if (b.mode === 'free' && !b.mirror) this.roll(b, dt);
    }
    this.runner = null; for (const k of this.kids) if (k.state === 'out' || k.state === 'pick' || k.state === 'back') { this.runner = k; break; }
    for (const k of this.kids) k.update(dt, t);
    if (this.ump) this.ump.update(dt, t);
    for (const b of this.balls) if (b.mode !== 'off') { b.mesh.position.set(b.x, b.y, b.z); b.mesh.updateMatrix(); }
  }
  roll(b, dt) {
    if (b.y > BALL.r + 1e-3 || b.vy > 0) {
      b.vy -= GRAV * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.y <= BALL.r) { b.y = BALL.r; if (b.vy < -1.0) { b.vy = -b.vy * 0.62; b.vx *= 0.85; b.vz *= 0.85; } else b.vy = 0; }
    } else {
      const k = Math.max(0, 1 - 2.2 * dt); b.vx *= k; b.vz *= k; b.x += b.vx * dt; b.z += b.vz * dt; b.y = BALL.r;
      if (Math.abs(b.vx) + Math.abs(b.vz) < 0.01) b.vx = b.vz = 0;
    }
    const wx = this.hx - 0.1, wz = this.hz - 0.1;
    if (Math.abs(b.x) > wx) { b.x = Math.sign(b.x) * wx; b.vx *= -0.35; }
    if (Math.abs(b.z) > wz) { b.z = Math.sign(b.z) * wz; b.vz *= -0.35; }
  }
  // the way round what stands between a kid and where he is going: the net between the posts, the chair, benches, players
  route(fx, fz, tx, tz, out) {
    out.set(tx, 0, tz);
    const NX = COURT.halfWD + 1.3;
    if (Math.abs(fz) > 0.12 && Math.abs(tz) > 0.12 && Math.sign(fz) !== Math.sign(tz)) {
      const u = fz / (fz - tz), cx = fx + (tx - fx) * u;
      if (Math.abs(cx) < NX) { out.set(Math.sign(fx || 1) * Math.max(Math.abs(fx), NX), 0, 0); tx = out.x; tz = out.z; }
    }
    let hit = null, hd = 1e9, hr = 0, hpx = 0, hpz = 0;
    const dx = tx - fx, dz = tz - fz, L2 = dx * dx + dz * dz;
    if (L2 < 1e-6) return out;
    const no = this.obst.length;
    for (let i = 0; i < no + 2; i++) {
      const o = i < no ? this.obst[i] : this.players[i - no], r = i < no ? o.r + 0.28 : 0.75;
      const u = clamp(((o.x - fx) * dx + (o.z - fz) * dz) / L2, 0, 1), px = fx + dx * u, pz = fz + dz * u, d = Math.hypot(px - o.x, pz - o.z);
      if (d < r && u > 0 && u < 1 && Math.hypot(tx - o.x, tz - o.z) > r * 0.9 && u * Math.sqrt(L2) < hd) { hd = u * Math.sqrt(L2); hit = o; hr = r; hpx = px; hpz = pz; }
    }
    if (hit) {
      const px = hpx, pz = hpz; let nx = px - hit.x, nz = pz - hit.z, nl = Math.hypot(nx, nz);
      if (nl < 1e-3) { nx = -dz; nz = dx; nl = Math.hypot(nx, nz) || 1; if ((fx - hit.x) * nx + (fz - hit.z) * nz < 0) { nx = -nx; nz = -nz; } }
      out.set(hit.x + nx / nl * (hr + 0.2), 0, hit.z + nz / nl * (hr + 0.2));
    }
    return out;
  }
}

// ---------- a ball kid ----------
class Kid {
  constructor(S, person, home, i) {
    this.S = S; this.p = person; this.i = i;
    this.home = { x: home.x, z: home.z, ry: home.ry, kneel: !!home.kneel };
    this.H = (person.look.height || 1.5) / 1.85;
    this.rest = home.kneel ? KNEEL : AT_EASE;
    this.x = home.x; this.z = home.z; this.yaw = home.ry; this.vx = 0; this.vz = 0; this.face = home.ry;
    this.P = new Float32Array(N3); this.G = new Float32Array(N3); this.T2 = new Float32Array(N3);
    this.ph = Math.random(); this.go = 0; this.restW = 1; this.pickU = -1; this.crouchW = 0; this.still = false;
    this.lock = [0, 1].map(() => ({ on: false, x: 0, z: 0, ox: 0, oz: 0, st: -1, sx: 0, sz: 0 }));
    this.hy = 0; this.hp = 0; this.lag = 5 + Math.random() * 4; this.k = 0.75 + Math.random() * 0.25;
    this.state = 'home'; this.ball = null; this.target = null; this.hold = null;
    this.qChest = new THREE.Quaternion(); this.eyeY = person.dim.eyeY;
    this.reach = V(); this.reachW = 0; this.grip = [0.4, 0.4]; this.gripSet = [-1, -1];
    this.apDir = V(0, 0, -1); this.apFix = false; this.tmp = V(); this.wp = V(); this.hand = V();
    this.feet = [V(), V()];
    // nothing on him is merged into the stadium's still geometry: it all goes where he goes
    person.root.traverse(o => { o.userData.live = true; if (o.isSkinnedMesh) o.castShadow = false; });
  }
  fetch(ball) { ball.claim = this; this.target = ball; this.state = this.home.kneel ? 'rise' : 'out'; this.apFix = false; this.stateT = 0; }
  // back at rest: the pose is set, and from now on only the head moves
  settled() {
    this.state = 'home'; this.vx = this.vz = 0; this.go = 0; this.restW = 1; this.reachW = 0; this.pickU = -1; this.fromDodge = false;
    this.p.chestQ = this.qChest;
    // where his eyes are now, for aiming the head
    const per = this.p; per.arm.updateWorldMatrix(false, true); _inv.copy(per.root.matrixWorld).invert();
    this.eyeY = per.jointPos('LEye', _a).add(per.jointPos('REye', _b)).multiplyScalar(0.5).applyMatrix4(_inv).y;
  }
  update(dt, t) {
    const S = this.S;
    // A player running at a back kid's place, chasing a wide ball deep or on his way back from one: the kid steps along the
    // wall out of his way and back again once he has gone, point or no point (standing still, the players ran shoulder to
    // shoulder with him, and from behind one seemed to run through him).
    if (this.state === 'home' && !this.home.kneel && dt > 0 && this.threat() < 1.4) { this.state = 'dodge'; this.fromDodge = true; this.stateT = 0; this.dodgeAt = null; this.clearT = 0; }
    if (this.state === 'home') { this.watch(dt, t); return; }
    if (dt <= 0) return;
    // the ball is in play: wherever he is, he stops, gets down low and keeps still until the point is over
    if (S.frozen && this.state !== 'hold' && !this.fromDodge) this.beginHold();
    if (this.state === 'hold') { this.holdUpdate(dt, t); return; }
    this.crouchW = Math.max(0, this.crouchW - dt / 0.3);
    this.stateT = (this.stateT || 0) + dt;
    const H = this.H, home = this.home;
    let tx = this.x, tz = this.z, vmax = 0, look = null;
    switch (this.state) {
      case 'rise': { this.restW = Math.max(0, this.restW - dt / 0.32); if (this.restW < 0.45) { this.state = 'out'; this.stateT = 0; } look = this.target; break; }
      case 'out': {
        const b = this.target; if (!b || b.claim !== this || b.mode === 'off') { this.state = 'back'; break; }
        this.restW = Math.max(0, this.restW - dt / 0.25);
        const p = S.restOf(b, this.tmp), dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
        // he comes in on the ball with it ahead and a little to his right, where the hand that takes it is
        if (!this.apFix || d > 1.3) { if (d > 1e-3) this.apDir.set(dx / d, 0, dz / d); this.apFix = d < 1.3; }
        const ax = this.apDir.x, az = this.apDir.z;
        tx = p.x - ax * 0.50 * H + az * 0.20 * H; tz = p.z - az * 0.50 * H - ax * 0.20 * H;
        _a.set(tx, 0, tz); S.clampIn(_a, 0.3); S.clear(_a, 0.25); tx = _a.x; tz = _a.z;
        vmax = home.kneel ? 6.0 : 4.6; this.face = Math.atan2(-ax, -az); look = b;
        const e = Math.hypot(tx - this.x, tz - this.z), sp = Math.hypot(this.vx, this.vz);
        if (e < 0.07 && sp < 0.3 && b.speed() < 0.7 && Math.abs(wrap(this.yaw - this.face)) < 0.35) { this.state = 'pick'; this.pickU = 0; this.stateT = 0; }
        if (this.stateT > 9) { b.claim = null; this.target = null; this.state = 'back'; }
        break;
      }
      case 'pick': {
        const b = this.target, u = this.pickU = this.pickU + dt / 0.72;
        look = b; this.face = this.yaw;
        if (b && b.mode !== 'hand' && u >= 0.44 && b.claim === this) {
          // the match's own dead ball, if the next point is not set yet: from now on it is the one in his hand
          if (b.mirror) { b.mirror = false; const fx = S.game && S.game.fx; if (fx && fx.ball) fx.ball.visible = false; }
          b.mode = 'hand'; b.vx = b.vy = b.vz = 0; this.hold = b; b.show(true);
        }
        if (u >= 1) { this.pickU = -1; this.target = null; this.state = 'back'; this.stateT = 0; }
        break;
      }
      case 'back': {
        S.route(this.x, this.z, home.x, home.z, this.wp); tx = this.wp.x; tz = this.wp.z;
        vmax = home.kneel ? 5.6 : 4.0; this.face = home.ry;
        const e = Math.hypot(home.x - this.x, home.z - this.z), sp = Math.hypot(this.vx, this.vz);
        if (e < 0.05 && sp < 0.2) { this.state = 'face'; this.stateT = 0; }
        break;
      }
      case 'dodge': {
        const near = this.threat(), pl = this.thr;
        this.restW = Math.max(0, this.restW - dt / 0.15); this.face = home.ry;
        if (near < 2.2) { this.clearT = 0;
          // to whichever spot near his place stays furthest from where the player is going over the next moment: back toward
          // the wall from a player running along the back, aside from one running at him (stepping along the wall, he ran on
          // ahead of a player running the same way, who caught him up), the nearer of two equally clear spots
          if (!this.dodgeAt || this.pathGap(this.dodgeAt.x, this.dodgeAt.z, 0.8) < 1.1) { const zs = Math.sign(home.z) || 1; let best = -9;
            for (const [ox, oz] of [[0, 1.0], [1.45, 0], [-1.45, 0], [1.1, 0.8], [-1.1, 0.8], [0.7, 1.0], [-0.7, 1.0]]) {
              _a.set(home.x + ox, 0, home.z + oz * zs); S.clampIn(_a, 0.35); S.clear(_a, 0.3);
              const sc = Math.min(2.4, this.pathGap(_a.x, _a.z, 1.5)) - 0.15 * Math.hypot(_a.x - home.x, _a.z - home.z);   /* (judged a second and a half ahead: over less, walking along the back he was still short of a spot to one side, and walked on into it) */
              if (sc > best) { best = sc; this.dodgeAt = { x: _a.x, z: _a.z }; } } }
          tx = this.dodgeAt.x; tz = this.dodgeAt.z; vmax = 3.2;
        } else { this.clearT += dt; if (this.clearT > 0.4) { tx = home.x; tz = home.z; vmax = 2.2; this.dodgeAt = null;
          const e = Math.hypot(home.x - this.x, home.z - this.z), sp = Math.hypot(this.vx, this.vz); if (e < 0.05 && sp < 0.2) { this.state = 'face'; this.stateT = 0; } } }
        if (pl) look = this.lookAt || (this.lookAt = { x: 0, y: 1.3, z: 0 }), look.x = pl.x, look.z = pl.z;
        S.route(this.x, this.z, tx, tz, this.wp); tx = this.wp.x; tz = this.wp.z;
        break;
      }
      case 'face': { this.face = home.ry; tx = home.x; tz = home.z; if (Math.abs(wrap(this.yaw - home.ry)) < 0.15) { this.state = 'settle'; this.stateT = 0; } break; }
      case 'settle': {
        this.face = home.ry; tx = home.x; tz = home.z;
        this.restW = Math.min(1, this.restW + dt / (home.kneel ? 0.5 : 0.35));
        if (this.hold && this.restW > 0.55) { this.S.free(this.hold); this.hold = null; }          // put away
        if (this.restW >= 1 && this.go < 0.02 && this.lock[0].st < 0 && this.lock[1].st < 0) { this.pose(dt, this.rest, false); this.settled(); return; }
        break;
      }
    }
    if (this.state === 'out' && this.target) { S.route(this.x, this.z, tx, tz, this.wp); tx = this.wp.x; tz = this.wp.z; }
    this.move(dt, tx, tz, vmax);
    // the head: the ball he is going for, else the way he is going
    let ty = 0, tp = -0.1;
    if (look) { const lx = look.x - this.x, lz = look.z - this.z, c = Math.cos(this.yaw), s = Math.sin(this.yaw), rx = c * lx - s * lz, rz = s * lx + c * lz, ly = (look.y == null ? 0 : look.y) - this.eyeNow();
      ty = clamp(Math.atan2(rx, -rz), -1.2, 1.2); tp = clamp(Math.atan2(ly, Math.hypot(rx, rz)), -0.95, 0.5); }
    this.hy = damp(this.hy, ty, 9, dt); this.hp = damp(this.hp, tp, 9, dt);
    this.compose(dt);
    this.pose(dt, this.P, false);
  }
  // how close a player will come to his place in the next half second (and where), and to a given spot
  threat() {
    let w = 9; this.thr = null;
    for (const p of this.S.players) { const vx = p.vx || 0, vz = p.vz || 0;
      for (let k = 0; k <= 5; k++) { const u = k * 0.1, x = p.x + vx * u, z = p.z + vz * u, d = Math.hypot(x - this.home.x, z - this.home.z); if (d < w) { w = d; this.thr = p; this.thrX = x; } } }
    return w;
  }
  pathGap(x, z, hor = 0.5) { let w = 9; for (const p of this.S.players) { const vx = p.vx || 0, vz = p.vz || 0; for (let k = 0; k <= 8; k++) { const u = k * hor / 8; w = Math.min(w, Math.hypot(p.x + vx * u - x, p.z + vz * u - z)); } } return w; }
  beginHold() {
    const r = this.state, home = this.home;
    this.resume = r; this.state = 'hold'; this.holdT = 0; this.still = false; this.lock[0].moved = this.lock[1].moved = false;
    // at (or all but at) his place he simply finishes getting into his own position
    this.holdHome = Math.hypot(home.x - this.x, home.z - this.z) < 0.35 && r !== 'out' && r !== 'pick';
  }
  holdUpdate(dt, t) {
    const S = this.S, A = S.A;
    this.holdT += dt;
    const k = Math.exp(-dt * 45); this.vx *= k; this.vz *= k; if (Math.abs(this.vx) + Math.abs(this.vz) < 0.02) this.vx = this.vz = 0;
    this.x += this.vx * dt; this.z += this.vz * dt; this.speed = Math.hypot(this.vx, this.vz);
    this.go = Math.max(0, this.go - dt / 0.08);
    if (this.holdHome) this.restW = Math.min(1, this.restW + dt / 0.12); else this.crouchW = Math.min(1, this.crouchW + dt / 0.09);
    // eyes on the ball
    const b = A.ballAt, lx = b.x - this.x, lz = b.z - this.z, c = Math.cos(this.yaw), s = Math.sin(this.yaw), rx = c * lx - s * lz, rz = s * lx + c * lz;
    const ty = clamp(Math.atan2(rx, -rz), -1.15, 1.15) * this.k, tp = clamp(Math.atan2(b.y - this.eyeNow(), Math.hypot(rx, rz)), -0.5, 0.6), kh = 1 - Math.exp(-dt * this.lag);
    this.hy += (ty - this.hy) * kh; this.hp += (tp - this.hp) * kh;
    if (!S.frozen) { this.endHold(); return; }
    if (this.still) { this.drivehead(this.qChest); return; }
    this.compose(dt); this.pose(dt, this.P, false, true);
    if (this.holdT > 0.16 && this.speed === 0 && this.lock[0].st < 0 && this.lock[1].st < 0) this.still = true;
  }
  // the point is over: on with what he was doing
  endHold() {
    const r = this.resume, tg = this.target; this.still = false; this.stateT = 0;
    if (this.holdHome) { this.state = 'face'; return; }
    if ((r === 'rise' || r === 'out' || r === 'pick') && tg && tg.claim === this && tg.mode !== 'off' && tg.mode !== 'hand') { this.state = 'out'; this.apFix = false; this.pickU = -1; return; }
    if (tg && tg.claim === this && tg.mode !== 'hand') tg.claim = null;
    this.target = null; this.pickU = -1; this.state = 'back';
  }
  eyeNow() { return lerp(this.H * 1.62, this.eyeY, this.restW) - (this.pickU > 0 ? Math.sin(Math.min(1, this.pickU) * Math.PI) * 0.45 * this.H : 0); }
  // speed up, steer and slow down onto a point; turn to run where he runs, and to `face` as he stops
  move(dt, tx, tz, vmax) {
    const H = this.H, dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    const want = vmax > 0 && d > 0.01 ? Math.min(vmax, Math.sqrt(2 * 6.5 * Math.max(0, d - 0.01))) * (this.state === 'out' || this.state === 'back' || this.state === 'dodge' ? 1 : 0) : 0;
    const wvx = d > 1e-4 ? dx / d * want : 0, wvz = d > 1e-4 ? dz / d * want : 0;
    const ex = wvx - this.vx, ez = wvz - this.vz, e = Math.hypot(ex, ez), braking = wvx * this.vx + wvz * this.vz < this.vx * this.vx + this.vz * this.vz;
    const acc = (braking ? 8.5 : 6.5) * dt; if (e > acc) { this.vx += ex / e * acc; this.vz += ez / e * acc; } else { this.vx = wvx; this.vz = wvz; }
    this.x += this.vx * dt; this.z += this.vz * dt;
    const sp = Math.hypot(this.vx, this.vz);
    this.yaw = wrap(this.yaw); this.face = wrap(this.face);
    const runYaw = Math.atan2(-this.vx, -this.vz), wR = sm((sp - 0.35) / 0.9);
    // coming in to his place he turns to face the court as he slows
    const homing = this.state === 'back' && Math.hypot(this.home.x - this.x, this.home.z - this.z) < 0.5 && sp < 1.1;
    this.yaw = dampA(this.yaw, sp > 0.35 && !homing ? runYaw : this.face, sp > 0.35 && !homing ? 4 + 8 * wR : 8, dt);
    // the gait for this speed, its cycle running at the rate that covers this ground
    const s = sp / H; let i = 0; while (i < FW.length - 2 && s > FW[i + 1].speed) i++;
    const a = FW[i], b = FW[i + 1], u = sm((s - a.speed) / (b.speed - a.speed)), stride = lerp(a.stride, b.stride, u);
    this.ph = (this.ph + dt * Math.min(3.2, s / stride)) % 1;
    sampleLoop(a, this.ph, this.G); if (u > 0.001) mix(this.G, sampleLoop(b, this.ph, this.T2), u);
    this.go = damp(this.go, sm((sp - 0.08) / 0.7), 10, dt);
    this.speed = sp;
  }
  // this frame's nineteen joints: at rest, standing, running, bending for the ball, crouched still
  compose(dt) {
    const P = this.P; P.set(STAND);
    if (this.restW > 0.001) mix(P, this.rest, this.restW);
    if (this.go > 0.001) mix(P, this.G, this.go);
    this.reachW = 0; this.grip[0] = 0.35; this.grip[1] = this.hold ? 0.62 : 0.35;
    if (this.pickU >= 0) {
      const u = this.pickU, c = u < 0.5 ? sm(u / 0.40) : 1 - sm((u - 0.52) / 0.48);
      mix(P, PICK, c);
      const b = this.target, rw = sm(u / 0.38) * (1 - sm((u - 0.50) / 0.30));
      if (b && rw > 0.001) { this.reach.set(b.x, b.y + 0.07, b.z); this.reachW = rw * (1 - sm(this.crouchW)); }
      if (u > 0.3 && u < 0.6) this.grip[1] = lerp(0.25, 0.62, sm((u - 0.38) / 0.1));
    }
    if (this.crouchW > 0.001) mix(P, CROUCH, sm(this.crouchW));
  }
  // the solve: hips and trunk from the joints, the head where he looks, arms by the joints' directions (or
  // reaching to a point), legs to ankles held on the ground while they are on it
  pose(dt, P, still, hold) {
    const per = this.p, D = per.dim, R = per.root, H = this.H, r = (D.thigh + D.shank) / LEGC;
    R.position.set(this.x, 0, this.z); R.rotation.set(0, this.yaw, 0); R.updateMatrix(); R.updateWorldMatrix(true, false); _inv.copy(R.matrixWorld).invert();
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const hmx = (P[J.lhip * 3] + P[J.rhip * 3]) / 2, hmy = (P[J.lhip * 3 + 1] + P[J.rhip * 3 + 1]) / 2, hmz = (P[J.lhip * 3 + 2] + P[J.rhip * 3 + 2]) / 2;
    const pel = _pel.set(hmx * r, (hmy - ANKLE_H) * r + D.ankle, -hmz * r);
    const spine = _spine.set(P[J.neck * 3] - hmx, P[J.neck * 3 + 1] - hmy, hmz - P[J.neck * 3 + 2]).normalize();
    const qPel = frameOf(cd(P, J.lhip, J.rhip, _a), _b.copy(UP).lerp(spine, 0.35), _qP);
    const qChest = frameOf(cd(P, J.lsho, J.rsho, _c), spine, _qC);
    this.qChest.copy(qChest);
    per.bones.Bip01_Pelvis.position.copy(pel).multiplyScalar(1 / per.scale);
    per.drive('Pelvis', qPel); per.drive('Spine', qPel); per.drive('Spine1', _q.copy(qPel).slerp(qChest, 0.5)); per.drive('Spine2', qChest);
    this.drivehead(qChest);
    per.arm.updateWorldMatrix(false, true);
    // arms
    for (let i = 0; i < 2; i++) {
      const S = i ? 'R' : 'L', AJ = ARM_J[i];
      const sh = per.jointPos(S + '_UpperArm', _sh).applyMatrix4(_inv);
      const el = _el.copy(sh).addScaledVector(cd(P, AJ[0], AJ[1], _d), D.upper), wr = _wr.copy(el).addScaledVector(cd(P, AJ[1], AJ[2], _d), D.fore);
      if (i === 1 && this.reachW > 0.001) {
        const pole = _pole.copy(el).sub(_e.copy(sh).add(wr).multiplyScalar(0.5));
        this.toLocal(this.reach, _f); wr.lerp(_f, this.reachW);
        const dd = _g.copy(wr).sub(sh), mx = (D.upper + D.fore) * 0.995; if (dd.length() > mx) wr.copy(sh).addScaledVector(dd.normalize(), mx);
        ik(sh, wr, D.upper, D.fore, pole, el);
      }
      const Ff = per.setLimb(S, 'arm', el, wr, qChest, sh, _qa, _qb);
      per.drive(S + '_Hand', Ff); if (this.gripSet[i] !== this.grip[i]) { per.setFingers(S, this.grip[i]); this.gripSet[i] = this.grip[i]; }
      // the ball he carries sits in this palm
      if (i === 1 && this.hold && this.hold.mode === 'hand') {
        _h.copy(per.dir.palmR).applyQuaternion(Ff).add(wr); if (per.dir.palmNR) _h.addScaledVector(_w.copy(per.dir.palmNR).applyQuaternion(Ff), 0.03);
        this.toArena(_h, this.hand); this.hold.x = this.hand.x; this.hold.y = Math.max(BALL.r, this.hand.y); this.hold.z = this.hand.z;
      }
    }
    // legs: each ankle where the joints put it, or where it stands on the ground
    const sp = this.speed || 0;
    let mx = 0, mz = 0;
    for (let i = 0; i < 2; i++) {
      const S = i ? 'R' : 'L', LJ = LEG_J[i], ja = LJ[2], Lk = this.lock[i];
      let ax = this.x + (cy * P[ja * 3] - sy * P[ja * 3 + 2]) * r, az = this.z + (-sy * P[ja * 3] - cy * P[ja * 3 + 2]) * r, ay = Math.max(D.ankle, (P[ja * 3 + 1] - ANKLE_H) * r + D.ankle);
      if (still) { Lk.on = true; Lk.x = ax; Lk.z = az; Lk.ox = Lk.oz = 0; Lk.st = -1; }
      else if (hold) {
        // both feet stay where they are; one in mid-step comes down at once
        // both feet stay where they are, except that as he gets down a foot left far out (mid-stride) is brought in once
        if (Lk.st >= 0) { Lk.st += dt / 0.1; const w = sm(Math.min(1, Lk.st)); ax = lerp(Lk.sx, ax, w); az = lerp(Lk.sz, az, w); ay = Math.max(ay, D.ankle + Math.sin(w * Math.PI) * 0.04 * H); if (Lk.st >= 1) { Lk.st = -1; Lk.on = true; Lk.x = ax; Lk.z = az; } }
        else {
          if (!Lk.on) { Lk.on = true; Lk.x = this.feet[i].x; Lk.z = this.feet[i].z; Lk.ox = Lk.oz = 0; }
          if (this.holdT < 0.12 && Math.hypot(ax - Lk.x, az - Lk.z) > 0.16 * H && this.lock[1 - i].st < 0 && !Lk.moved) { Lk.st = 0; Lk.sx = Lk.x; Lk.sz = Lk.z; Lk.moved = true; ay = D.ankle; }
          else { ax = Lk.x; az = Lk.z; }
        }
      } else {
        const hgt = ay - D.ankle, down = hgt < (Lk.on ? 0.042 : 0.03) * H, engage = sp < 3.0 * H;
        if (Lk.st >= 0) {
          Lk.st += dt / 0.14; const w = sm(Math.min(1, Lk.st));
          ax = lerp(Lk.sx, ax, w); az = lerp(Lk.sz, az, w); ay = Math.max(ay, D.ankle + Math.sin(w * Math.PI) * 0.05 * H);
          if (Lk.st >= 1) { Lk.st = -1; Lk.on = down; Lk.x = ax; Lk.z = az; Lk.ox = Lk.oz = 0; }
        } else if (down && engage) {
          if (!Lk.on) { Lk.on = true; Lk.x = ax + Lk.ox; Lk.z = az + Lk.oz; Lk.ox = Lk.oz = 0; }
          if (Math.hypot(ax - Lk.x, az - Lk.z) > 0.17 * H && this.lock[1 - i].st < 0) { Lk.st = 0; Lk.sx = Lk.x; Lk.sz = Lk.z; Lk.on = false; }
          ax = Lk.x; az = Lk.z;
        } else {
          if (Lk.on) { Lk.ox = Lk.x - ax; Lk.oz = Lk.z - az; Lk.on = false; }
          if (Lk.ox || Lk.oz) { const k = Math.exp(-dt / 0.07); Lk.ox *= k; Lk.oz *= k; if (Math.abs(Lk.ox) + Math.abs(Lk.oz) < 1e-4) Lk.ox = Lk.oz = 0; ax += Lk.ox; az += Lk.oz; }
        }
      }
      this.feet[i].set(ax, ay, az); mx += ax / 2; mz += az / 2;
      const dx = ax - this.x, dz = az - this.z, ankle = _an.set(cy * dx - sy * dz, ay, sy * dx + cy * dz);
      const hip = per.jointPos(S + '_Thigh', _hip).applyMatrix4(_inv);
      const jh = LJ[0], jk = LJ[1], jt = LJ[3];
      const kp = _pole.set(P[jk * 3] - (P[jh * 3] + P[ja * 3]) / 2, P[jk * 3 + 1] - (P[jh * 3 + 1] + P[ja * 3 + 1]) / 2, -(P[jk * 3 + 2] - (P[jh * 3 + 2] + P[ja * 3 + 2]) / 2));
      if (kp.lengthSq() < 1e-4) kp.set(0, 0, -1); kp.z -= 0.05;
      const dd = _g.copy(ankle).sub(hip), mxL = (D.thigh + D.shank) * 0.998; if (dd.length() > mxL) ankle.copy(hip).addScaledVector(dd.normalize(), mxL);
      const kn = ik(hip, ankle, D.thigh, D.shank, kp, _kn);
      const Fs = per.setLimb(S, 'leg', kn, ankle, qPel, hip, _qa, _qb);
      const fd = cd(P, ja, jt, _d), down = 1 - sm((ay - D.ankle) / (0.05 * H)), rest = per.dir['foot' + S];
      if (down > 0) { fd.y = lerp(fd.y, rest.y, down); fd.normalize(); }
      swing(Fs, rest, fd, _qc); per.drive(S + '_Foot', _qc); per.drive(S + '_Toe0', _qc);
    }
    // his contact shadow
    const spread = Math.hypot(this.feet[0].x - this.feet[1].x, this.feet[0].z - this.feet[1].z), bl = this.S.blobs;
    _m4.compose(_a.set(mx, 0.007, mz), _q.setFromAxisAngle(UP, this.yaw), _b.set((0.55 + spread * 0.55) * this.H / 0.83, 1, (0.50 + spread * 0.35) * this.H / 0.83 * (this.home.kneel && this.restW > 0.5 ? 1.6 : 1)));
    bl.setMatrixAt(this.i, _m4); bl.instanceMatrix.needsUpdate = true;
  }
  // head and neck from the yaw and pitch he is looking at, then the collarbones again (they hang from the neck)
  drivehead(qChest) {
    const L = this.L || (this.L = links(this.p, ['Neck', 'Head', 'L_Clavicle', 'R_Clavicle']));
    _qH.copy(qChest).multiply(_q2.setFromAxisAngle(UP, -this.hy)).multiply(_qa.setFromAxisAngle(RIGHT, this.hp));
    _qb.setFromAxisAngle(UP, -this.hy).multiply(_qa.setFromAxisAngle(RIGHT, this.hp)); _qH.slerp(_qb, 0.5);
    fastDrive(L.Neck, _qN.copy(qChest).slerp(_qH, 0.45)); fastDrive(L.Head, _qH);
    fastDrive(L.L_Clavicle, qChest); fastDrive(L.R_Clavicle, qChest);
  }
  toLocal(p, out) { const dx = p.x - this.x, dz = p.z - this.z, c = Math.cos(this.yaw), s = Math.sin(this.yaw); return out.set(c * dx - s * dz, p.y, s * dx + c * dz); }
  toArena(p, out) { const c = Math.cos(this.yaw), s = Math.sin(this.yaw); return out.set(c * p.x + s * p.z + this.x, p.y, -s * p.x + c * p.z + this.z); }
  // at rest: only the head, a beat behind the ball and not all alike
  watch(dt, t) {
    const S = this.S, A = S.A, on = A.ballLive || (S.m && S.m.phase === 'ready' && S.m.ball.visible);
    let ty, tp;
    if (on) { const b = A.ballAt, lx = b.x - this.x, lz = b.z - this.z, c = Math.cos(this.yaw), s = Math.sin(this.yaw), rx = c * lx - s * lz, rz = s * lx + c * lz;
      ty = clamp(Math.atan2(rx, -rz), -1.15, 1.15) * this.k; tp = clamp(Math.atan2(b.y - this.eyeY, Math.hypot(rx, rz)), -0.5, 0.6); }
    else {
      // between points: a kid out on the court draws every eye; otherwise the odd glance about
      const run = S.runner;
      if (run && run !== this) { const lx = run.x - this.x, lz = run.z - this.z, c = Math.cos(this.yaw), s = Math.sin(this.yaw), rx = c * lx - s * lz, rz = s * lx + c * lz; ty = clamp(Math.atan2(rx, -rz), -1.1, 1.1) * this.k; tp = -0.08; }
      else { ty = 0.25 * Math.sin(t * 0.21 * this.k + this.lag); tp = 0; }
    }
    const k = 1 - Math.exp(-dt * this.lag); this.hy += (ty - this.hy) * k; this.hp += (tp - this.hp) * k;
    this.drivehead(this.qChest);
  }
}

// ---------- the chair umpire ----------
class Ump {
  constructor(S, person, at) {
    this.S = S; this.p = person; const per = person;
    this.chestQ = person.chestQ.clone();
    per.root.traverse(o => { if (o.isSkinnedMesh) o.castShadow = false; });
    per.root.updateWorldMatrix(true, true); _inv.copy(per.root.matrixWorld).invert();
    this.eye = per.jointPos('LEye', V()).add(per.jointPos('REye', V())).multiplyScalar(0.5).applyMatrix4(_inv);
    // what the arms hang from, as posed: kept when the neck turns and the chest moves
    this.fClav = {}; this.rest = {};
    for (const S2 of ['L', 'R']) {
      const b = per.bones['Bip01_' + S2 + '_Clavicle'], q = b.getWorldQuaternion(new THREE.Quaternion()), rq = per.root.getWorldQuaternion(new THREE.Quaternion()).invert();
      this.fClav[S2] = rq.multiply(q).multiply(per.rest['Bip01_' + S2 + '_Clavicle'].q.clone().invert());
      for (const n of ['UpperArm', 'Forearm', 'Hand']) this.rest[S2 + n] = per.bones['Bip01_' + S2 + '_' + n].quaternion.clone();
      this['wr' + S2] = per.jointPos(S2 + '_Hand', V()).applyMatrix4(_inv);
      this['el' + S2] = per.jointPos(S2 + '_Forearm', V()).applyMatrix4(_inv);
      this['sh' + S2] = per.jointPos(S2 + '_UpperArm', V()).applyMatrix4(_inv);
    }
    // tablet and microphone in his own frame (the arena is not turned while the stadium is built)
    this.tablet = at && at.tablet ? per.root.worldToLocal(at.tablet.clone()) : V(0.12, 0.77, -0.35);
    this.mic = at && at.mic ? per.root.worldToLocal(at.mic.clone()) : V(-0.16, 0.97, -0.34);
    this.hy = 0; this.hp = 0; this.ph = Math.random() * 6; this.lag = 5.5;
    this.T = 99; this.call = 1.2; this.looks = null; this.pointNo = -1; this.games = -1; this.ends = 0; this.change = false;
    this.tabW = 0; this.callW = 0; this.armOn = false;
  }
  watch(m, S) {
    const s = m.score, g = s.g[0] + s.g[1] + s.sets.length * 100;
    if (this.pointNo < 0) { this.pointNo = s.pointNo; this.games = g; this.ends = m.ends; return; }
    if (s.pointNo !== this.pointNo) {
      this.pointNo = s.pointNo; this.T = 0; this.cut = 1;
      const game = g !== this.games; this.games = g;
      this.change = m.ends !== this.ends; this.ends = m.ends;
      this.call = game ? 1.55 : 1.0;                    // "Game, Federer" takes longer than "Thirty-fifteen"
    }
  }
  update(dt, t) {
    const S = this.S, A = S.A, m = S.m, per = this.p;
    this.T += dt;
    // after a point: into the tablet, then the call; at a change of ends a look at each player
    const T = this.T, c0 = 1.05, c1 = c0 + this.call;
    // once the next point is under way he is done with the tablet and the microphone, whatever he was saying
    this.cut = damp(this.cut == null ? 1 : this.cut, S.frozen ? 0 : 1, S.frozen ? 9 : 3, dt); if (S.frozen && this.cut < 0.03 && T < c1 + 0.4) this.T = c1 + 0.4;
    const tab = sm((T - 0.22) / 0.3) * (1 - sm((T - 0.98) / 0.3)) * this.cut, call = sm((T - c0) / 0.28) * (1 - sm((T - c1) / 0.35)) * this.cut;
    this.tabW = tab; this.callW = call;
    let tx, ty, tz, on = true, kHead = this.lag;
    if (tab > 0.3 && T < 1.1) { tx = this.tablet.x; ty = this.tablet.y; tz = this.tablet.z; kHead = 7; }
    else if (call > 0.3) { tx = this.mic.x; ty = this.mic.y + 0.22; tz = this.mic.z; kHead = 7; }
    else if (m && this.change && T > c1 && T < c1 + 2.4) { const p = m.players[T < c1 + 1.2 ? 0 : 1], f = S.f; _a.set(p.x * f, 1.6, p.z * f); per.root.worldToLocal(_a.applyMatrix4(A.root.matrixWorld)); tx = _a.x; ty = _a.y; tz = _a.z; }
    else if (A.ballLive || (m && m.phase === 'ready')) { _a.copy(A.ballAt).applyMatrix4(A.root.matrixWorld); per.root.worldToLocal(_a); tx = _a.x; ty = _a.y; tz = _a.z; }
    else on = false;
    let yw, pt;
    if (on) { const lx = tx - this.eye.x, ly = ty - this.eye.y, lz = tz - this.eye.z; yw = clamp(Math.atan2(lx, -lz), -1.2, 1.2); pt = clamp(Math.atan2(ly, Math.hypot(lx, lz)), -0.85, 0.6); }
    else { yw = 0.22 * Math.sin(t * 0.17 + this.ph); pt = -0.04; }
    const k = 1 - Math.exp(-dt * kHead); this.hy += (yw - this.hy) * k; this.hp += (pt - this.hp) * k;
    // the chest: breathing, a slow shift of weight, and the lean in to the microphone
    const br = Math.sin(t * 1.45 + this.ph), sway = Math.sin(t * 0.23 + this.ph * 2) * 0.012;
    const lean = -(0.010 * br) - call * 0.16 - tab * 0.07, twist = call * 0.20 - tab * 0.05 + Math.sin(T * 9) * 0.012 * call;
    const qCh = _qC.copy(this.chestQ).multiply(_q.setFromAxisAngle(RIGHT, lean)).multiply(_q2.setFromAxisAngle(UP, twist)).multiply(_qa.setFromAxisAngle(_d.set(0, 0, 1), sway));
    const L = this.L || (this.L = links(per, ['Spine1', 'Spine2', 'Neck', 'Head', 'L_Clavicle', 'R_Clavicle']));
    fastDrive(L.Spine1, _qP.identity().slerp(qCh, 0.5)); fastDrive(L.Spine2, qCh);
    // head, with a small nod as he speaks
    const nod = call > 0.5 ? Math.sin(T * 11) * 0.025 * call : 0;
    _qH.copy(qCh).multiply(_q.setFromAxisAngle(UP, -this.hy)).multiply(_q2.setFromAxisAngle(RIGHT, this.hp + nod));
    fastDrive(L.Neck, _qN.copy(qCh).slerp(_qH, 0.45)); fastDrive(L.Head, _qH);
    // the arms stay as they were posed, unless he is reaching for the tablet or leaning far enough to move them
    const act = tab > 0.001 || call > 0.02;
    fastDrive(L.L_Clavicle, this.fClav.L); fastDrive(L.R_Clavicle, this.fClav.R);
    if (!act) { if (this.armOn) { this.armOn = false; this.restArms(); } return; }
    this.armOn = true;
    per.arm.updateWorldMatrix(false, true); _inv.copy(per.root.matrixWorld).invert();
    for (const S2 of ['L', 'R']) {
      const sh = per.jointPos(S2 + '_UpperArm', _sh).applyMatrix4(_inv), wr = _wr.copy(this['wr' + S2]);
      if (S2 === 'R' && tab > 0.001) { const tap = Math.max(0, Math.sin(T * 24)) * 0.018 * sm((T - 0.5) / 0.1) * (1 - sm((T - 0.9) / 0.08)); _e.set(this.tablet.x - 0.02, this.tablet.y + 0.06 + tap, this.tablet.z + 0.09); wr.lerp(_e, tab); }
      const pole = _pole.copy(this['el' + S2]).sub(_e.copy(this['sh' + S2]).add(this['wr' + S2]).multiplyScalar(0.5));
      const D = per.dim, dd = _g.copy(wr).sub(sh), mx = (D.upper + D.fore) * 0.995; if (dd.length() > mx) wr.copy(sh).addScaledVector(dd.normalize(), mx);
      const el = ik(sh, wr, D.upper, D.fore, pole, _el);
      const Ff = per.setLimb(S2, 'arm', el, wr, this.fClav[S2], sh, _qa, _qb); per.drive(S2 + '_Hand', Ff);
    }
  }
  restArms() { const per = this.p; for (const S2 of ['L', 'R']) for (const n of ['UpperArm', 'Forearm', 'Hand']) per.bones['Bip01_' + S2 + '_' + n].quaternion.copy(this.rest[S2 + n]); }
}
