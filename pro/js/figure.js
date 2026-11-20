// Rally Pro — the players. A figure is a jointed body solved every frame from a handful
// of targets (pelvis, chest, two hands, two feet, racket), so strokes are authored as hand
// paths and the limbs follow by inverse kinematics. Stroke shapes and timings are built on
// joint tracks measured from tour broadcast footage: wrist height and lateral reach through
// the forehand and backhand, stance width and crouch in the ready position, and the
// durations of each phase.
import * as THREE from 'three';
import { sunMask } from './arena.js';
import { canvas, tex } from './textures.js';
import { TIMING } from './sim.js';
import { Person, swing } from './people.js';
import { STROKE_DATA } from './strokedata.js';
import { buildHair } from './hair.js';
import { Loco, J, ANKLE_H, N3, mix, strokeClip, sampleAt } from './motion.js';
import { PLAYER_MOTION } from './playermotion.js';
import { PLAYER_MOTION_ALTS } from './playeralts.js';
import { LOCO, LOCO_JOINTS } from './locodata.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// How he moves between shots, measured from the same joint tracks (about 600 seconds of
// sideways movement, phase-aligned on the ankles; tools/gait.py prints the tables):
//  - he takes 0.80 + 0.20 v step cycles a second — 1.2 at 2 m/s, 1.5 at 3.7 — so the steps get long;
//  - moving sideways the feet alternate like a walk turned side-on: the leading foot works from
//    0.4 m ahead of the hips to 0.2 behind, the trailing one from under the hips to 0.55 behind,
//    so they pass close and often cross; ankles lift 0.14 m at a shuffle, 0.20 m at a run;
//  - the hips ride low when the feet are widest and about 9 cm higher as they pass;
//  - the shoulders stay square to the net up to about 3.5 m/s, and both hands stay on the racket
//    in front of the body until a full sprint; the trunk leans into the run, 6 degrees at
//    2 m/s and 14 at 3.6;
//  - the split step is a 10-12 cm hop lasting about 0.3 s that lands 12-25 cm wider and lower;
//  - pushing off and running he is 10-13 cm lower at the hips than standing ready.
// Seen from behind, a run toward or away from the net is foreshortened, so running straight is
// measured instead from 3D motion capture (CMU Graphics Lab database: 14 runs by four people at
// 2.7-4.4 m/s, two walks; tools/gait_run.py), rescaled to a 1.85 m player:
//  - 0.80 + 0.16 v cycles a second, each foot down for 0.6 of the cycle at a walk but only
//    0.3 at a run, with a moment in the air between steps;
//  - the foot lands 0.17 m ahead of the hips and leaves 0.44 behind; the ankle comes up
//    0.33 m at 2.7 m/s and 0.46 at 4.2 as the heel swings through;
//  - the feet track 0.12 m apart, and the hips rise and fall 10 cm with every step.
export const GAIT = {
  cad0: 0.80, cad1: 0.20, cadF: 0.16, walk0: 0.55, walk1: 0.35,   // cycles per second = a + b * speed (sideways; cadF is b running straight)
  duty0: 0.60, duty1: 0.05, dutyMin: 0.36, dutyMax: 0.56,  // share of a cycle each foot is down, sideways
  dutyW0: 0.60, dutyW1: 0.04, dutyR0: 0.42, dutyR1: 0.04, dutyRMin: 0.24, run0: 1.9, run1: 2.6,   // the same running straight: a walk below run0, a run above run1
  lead: 0.18, trail: 0.07, trailF: 0.13,                   // feet centres along the direction of travel: +-lead, both shifted back by trail
  track: 0.07,                                             // half the distance between the feet's tracks, running straight
  lift0: 0.105, lift1: 0.022, liftMin: 0.12, liftMax: 0.22,          // ankle lift in metres, sideways
  liftF0: 0.11, liftF1: 0.082, liftFMin: 0.15, liftFMax: 0.48,       // and running straight
  bobSide: 0.045, bobWalk: 0.022, bobRun: 0.05,            // half the rise and fall of the hips
  lean1: 0.02, lean2: 0.014,                               // radians = lean1 * v + lean2 * v^2
  turn0: 3.2, turn1: 4.8, pump0: 3.8, pump1: 5.0,          // speeds at which the body turns to run, and the arms start to pump
  drop: 0.10, drop0: 1.6, drop1: 3.2, crouchRun: 0.09,     // how much lower the hips ride when driving sideways; and below standing height running straight
  hop: 0.105, hopT: 0.30, land: 0.07, landT: 0.30, wide: 1.5,
};
// Step rate, ground contact and ankle lift for a speed and a direction (k: 1 sideways, 0 straight).
export function gaitAt(speed, k, between) {
  const G = GAIT, run = sm((speed - G.run0) / (G.run1 - G.run0));
  const cad = between ? G.walk0 + G.walk1 * speed : G.cad0 + lerp(G.cadF, G.cad1, k) * speed;
  const dutyS = clamp(G.duty0 - speed * G.duty1, G.dutyMin, G.dutyMax);
  const dutyF = lerp(clamp(G.dutyW0 - G.dutyW1 * speed, 0.4, 0.62), clamp(G.dutyR0 - G.dutyR1 * speed, G.dutyRMin, 0.4), between ? 0 : run);
  const liftS = clamp(G.lift0 + speed * G.lift1, G.liftMin, G.liftMax), liftF = clamp(G.liftF0 + speed * G.liftF1, G.liftFMin, G.liftFMax);
  return { cad, duty: lerp(dutyF, dutyS, k), lift: lerp(liftF, liftS, k) * (between ? 0.6 : 1), run: run * (1 - k) * (between ? 0 : 1) };
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const sm = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
// For fading one movement into another over time: its acceleration is zero at both ends as well as its speed, so the
// body neither kicks as a change starts nor stops dead as it ends (smoothstep's acceleration jumps at both ends).
const sm5 = t => { t = clamp(t, 0, 1); return t * t * t * (t * (6 * t - 15) + 10); };
// A critically damped spring toward `target` (state in o[key] and o[key + 'V']): like damp(), but its speed never jumps,
// so a weight told to change all at once still sets off and settles smoothly. `w` about 2.15x a damp() rate matches it.
function ease(o, key, target, w, dt) {
  const vk = key + 'V'; const x = o[key] == null ? target : o[key], v = o[vk] || 0, d = x - target, e = Math.exp(-w * dt), k = (v + w * d) * dt;
  o[key] = target + (d + k) * e; o[vk] = (v - w * k) * e; return o[key];
}
const UP = V(0, 1, 0);

// ---------- body ----------
// Lengths in metres for a 1.85 m player; everything scales with height.
const B = {
  hipY: 0.985, hipHalf: 0.095, thigh: 0.455, shank: 0.455, ankle: 0.085, foot: 0.27,
  spine: 0.515, shHalf: 0.190, neck: 0.11, headR: 0.108,
  upper: 0.325, fore: 0.275, hand: 0.085,
  racket: 0.685, grip: 0.07, headC: 0.52,         // grip centre to the middle of the strings
};

function mat(color, rough, o = {}) { return sunMask(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...o })); }

function stringTexture(col) {
  const s = 256, c = canvas(s, s), g = c.getContext('2d');
  g.clearRect(0, 0, s, s); g.strokeStyle = col || 'rgba(245,245,238,0.95)'; g.lineWidth = 1.6;
  for (let i = 1; i < 18; i++) { const p = i * s / 18; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.stroke(); }
  for (let i = 1; i < 20; i++) { const p = i * s / 20; g.beginPath(); g.moveTo(0, p); g.lineTo(s, p); g.stroke(); }
  const t = tex(c, { clamp: true, aniso: 8 }); return t;
}

// A racket of its era: the head's size follows its area (a wooden frame's 65 square inches
// against a modern 100), the throat is longer where the head is small, and the frame takes
// its second colour on the throat.
export function buildRacket(look = {}) {
  const g = new THREE.Group(), merge = list => { const m = mergeGeometries(list); for (const x of list) x.dispose(); return m; };
  const k = Math.sqrt(clamp(look.head || 1, 0.6, 1.12)), wood = (look.head || 1) < 0.76;
  const frameM = mat(look.frame || '#15171c', wood ? 0.55 : 0.32, { metalness: wood ? 0 : 0.25 }), throatM = mat(look.frame2 || look.frame || '#15171c', wood ? 0.55 : 0.32, { metalness: wood ? 0 : 0.25 }), gripM = mat(look.grip || '#f1f1ec', 0.9);
  // local axes: +Y from the butt toward the tip, strings in the XY plane, face normal +Z
  const headL = 0.33 * k * (look.round ? 0.86 : 1), headW = 0.255 * k * (look.round ? 1.02 : 1), tip = B.headC + 0.165, headY = tip - headL / 2;
  const at = (geo, x, y, z, rz) => { if (rz) geo.rotateZ(rz); geo.translate(x, y, z); return geo; };
  const hoop = new THREE.TorusGeometry(1, wood ? 0.062 : 0.045, 8, 36); hoop.scale(headW / 2, headL / 2, wood ? 0.20 : 0.24); hoop.translate(0, headY, 0);
  const shaftTop = 0.22, yoke = headY - headL / 2, tl = Math.hypot(yoke - shaftTop + 0.03, 0.05);
  const throat = [-1, 1].map(sd => at(new THREE.CylinderGeometry(0.0095, 0.011, tl, 8), sd * 0.03, (yoke + shaftTop) / 2 + 0.01, 0, -sd * Math.atan2(0.05, yoke - shaftTop + 0.03)));
  if (wood) throat.push(at(new THREE.BoxGeometry(0.05, (yoke - shaftTop) * 0.8, 0.018), 0, (yoke + shaftTop) / 2 + 0.01, 0));
  const frame = [hoop, at(new THREE.CylinderGeometry(0.0125, 0.0135, 0.10, 10), 0, 0.17, 0), at(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 10), 0, -0.09, 0)];
  const fm = new THREE.Mesh(merge(frame), frameM), tm = new THREE.Mesh(merge(throat), throatM), gm = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0175, 0.21, 10), gripM); gm.position.y = 0.02;
  const st = new THREE.Mesh(new THREE.PlaneGeometry(headW * 0.93, headL * 0.94), new THREE.MeshStandardMaterial({ map: stringTexture(look.string), transparent: true, side: THREE.DoubleSide, roughness: 0.6, alphaTest: 0.05 }));
  st.material.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n vec2 oc = vMapUv * 2.0 - 1.0; if (dot(oc, oc) > 0.98) discard;'); };
  st.position.y = headY;
  g.add(fm, tm, gm, st);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Follow a moving target without trailing it. The target's track is smoothed by a filter that keeps its
// velocity (Holt's), so a steady sweep is followed exactly while the corners between keyed poses are
// rounded off over a few frames; a sudden jump (one the target's own motion does not account for) is
// absorbed by an offset that decays, so the hand carries on from where it was and nothing snaps.
const _fp = new THREE.Vector3(), _fs = new THREE.Vector3();
// Mix pose B into pose A by w, the joints above the hips at a common heading (see the stroke clip's mix in update()).
const UPPER_J = [J.neck, J.head, J.lsho, J.rsho, J.lelb, J.relb, J.lwri, J.rwri, J.lhand, J.rhand];
const _armJ = [['lsho', 'lelb', 'lwri', 'lhand'], ['rsho', 'relb', 'rwri', 'rhand']].map(c => c.map(k => J[k])), _armS = new Float32Array(18);
function mixUpper(A, B, w, S) {
  if (w <= 0) { if (S) S.muD = null; return A; } if (w >= 1) { A.set(B); if (S) S.muD = null; return A; }
  const hd = P => Math.atan2(P[J.rsho * 3 + 2] - P[J.lsho * 3 + 2], P[J.rsho * 3] - P[J.lsho * 3]);
  const yA = hd(A), yB = hd(B); let d = Math.atan2(Math.sin(yB - yA), Math.cos(yB - yA));
  // (the way round kept from the frame before: where the two headings are near opposite, the shorter way round flips from one
  // side to the other between frames, and the upper body was spun a whole turn in one)
  if (S) { if (S.muD != null) d = S.muD + Math.atan2(Math.sin(d - S.muD), Math.cos(d - S.muD)); S.muD = d; }
  {
    // turn A's upper body by +w*d and B's by -(1-w)*d, each about its own hips' middle, so both share the heading yA + w*d
    const rot = (P, a) => { const c = Math.cos(a), sn = Math.sin(a), cx = (P[J.lhip * 3] + P[J.rhip * 3]) / 2, cz = (P[J.lhip * 3 + 2] + P[J.rhip * 3 + 2]) / 2;
      for (const j of UPPER_J) { const x = P[j * 3] - cx, z = P[j * 3 + 2] - cz; P[j * 3] = cx + x * c - z * sn; P[j * 3 + 2] = cz + x * sn + z * c; } };
    rot(A, w * d); rot(B, -(1 - w) * d);
  }
  // (the arms blended along themselves, each bone turned from the one pose's way to the other's, from the blended shoulder out:
  // blended by where each joint is, an arm going from a finish over the far shoulder to the ready position in front had its
  // forearm shrink to a few centimetres half way, and as it grew back its way round had flipped, the elbow thrown up and the
  // forearm laid across the chest in a frame)
  if (globalThis.__armSlerpOld) return mix(A, B, w);
  const ARMS = _armJ, sv = _armS; let q = 0;
  for (const ch of ARMS) for (let k = 1; k < 4; k++) { const a0 = ch[k - 1], a1 = ch[k];
    sv[q++] = A[a1 * 3] - A[a0 * 3]; sv[q++] = A[a1 * 3 + 1] - A[a0 * 3 + 1]; sv[q++] = A[a1 * 3 + 2] - A[a0 * 3 + 2]; }
  mix(A, B, w); q = 0;
  for (const ch of ARMS) for (let k = 1; k < 4; k++) { const a0 = ch[k - 1], a1 = ch[k];
    const ax = sv[q], ay = sv[q + 1], az = sv[q + 2]; q += 3; const bx = B[a1 * 3] - B[a0 * 3], by = B[a1 * 3 + 1] - B[a0 * 3 + 1], bz = B[a1 * 3 + 2] - B[a0 * 3 + 2];
    const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz); if (la < 1e-5 || lb < 1e-5) continue;
    const c = Math.max(-1, Math.min(1, (ax * bx + ay * by + az * bz) / (la * lb))), th = Math.acos(c), L = la + (lb - la) * w;
    let ox, oy, oz; if (th < 1e-4 || th > 3.05) { ox = A[a1 * 3] - A[a0 * 3]; oy = A[a1 * 3 + 1] - A[a0 * 3 + 1]; oz = A[a1 * 3 + 2] - A[a0 * 3 + 2]; const l = Math.hypot(ox, oy, oz) || 1; ox /= l; oy /= l; oz /= l; }
    else { const s0 = Math.sin((1 - w) * th) / Math.sin(th), s1 = Math.sin(w * th) / Math.sin(th); ox = ax / la * s0 + bx / lb * s1; oy = ay / la * s0 + by / lb * s1; oz = az / la * s0 + bz / lb * s1; }
    A[a1 * 3] = A[a0 * 3] + ox * L; A[a1 * 3 + 1] = A[a0 * 3 + 1] + oy * L; A[a1 * 3 + 2] = A[a0 * 3 + 2] + oz * L; }
  return A;
}
function follow(cur, tgt, F, dt, thr, first, al = 0.6, be = 0.5) {
  if (!F.s) { F.s = new THREE.Vector3(); F.v = new THREE.Vector3(); }
  if (first || F.n < 2) { F.off.set(0, 0, 0); F.s.copy(tgt); F.v.set(0, 0, 0); }
  else if (dt > 0) {
    _fp.copy(F.a).multiplyScalar(2).sub(F.b);                 // where it would be had it carried on as it was going
    // a jump: take it up from where we are. (Measured against how far it is already moving each frame: in the fastest
    // part of a swing a hand's ordinary acceleration bends its path by more than the fixed mark, and every frame was taken
    // for a jump, the hand held back where it had been and trailing its swing by a forearm's length.)
    if (_fp.distanceTo(tgt) > thr + 0.6 * F.a.distanceTo(F.b)) { F.off.copy(cur).sub(tgt); F.s.copy(tgt); F.v.set(0, 0, 0); }
    else {
      _fs.copy(F.s).add(F.v);                                 // the level carried on by its trend, then pulled to the target
      _fp.copy(_fs).lerp(tgt, al);
      F.v.lerp(_fs.copy(_fp).sub(F.s), be); F.s.copy(_fp);
    }
    F.off.multiplyScalar(Math.exp(-dt / 0.07));
  }
  F.b.copy(F.a); F.a.copy(tgt); F.n++;
  cur.copy(F.s).add(F.off);
}

// The body's frame as the skeleton stands this moment: up from the hips' middle to the neck, right along the shoulder line,
// forward from those. (Turns of the arm are limited against this, the frame they are seen in: measured against the chest's
// own turn, which runs ahead of the skeleton's in a fast twist, an arm held to 36 degrees a frame there still swung 46
// against the body as it is drawn.)
const _lpO0 = new THREE.Vector3(), _lpO1 = new THREE.Vector3(), _rkQi = new THREE.Quaternion(), _rkQ = new THREE.Quaternion(), _rkQ2 = new THREE.Quaternion(), _rkD = new THREE.Vector3(), _rkN = new THREE.Vector3(), _rgSh = new THREE.Vector3(), _rr1 = new THREE.Vector3(), _rr2 = new THREE.Vector3(), _rr3 = new THREE.Vector3(), _rr4 = new THREE.Vector3(), _rr5 = new THREE.Vector3(), _rr6 = new THREE.Vector3();
const _ecP = new THREE.Vector3(), _ecU = new THREE.Vector3(), _ecA = new THREE.Vector3(), _ecB = new THREE.Vector3(), _ecF = new THREE.Vector3(), _ecS = new THREE.Vector3(), _ecE = new THREE.Vector3(), _ecW = new THREE.Vector3(), _ecX = new THREE.Vector3(), _ecT = new THREE.Vector3(), _ecQ = new THREE.Vector3();
function bodyFrame(person, pelvis, cR, cU, cF) {
  person.jointPos('Neck', cU).sub(pelvis).normalize();
  person.jointPos('R_UpperArm', cR).sub(person.jointPos('L_UpperArm', cF)); cR.addScaledVector(cU, -cR.dot(cU)).normalize();
  cF.copy(cU).cross(cR).normalize();
}
export class Figure {
  // `model`: a loaded person model (see people.js loadPerson)
  constructor(look = {}, model) {
    this.model = model;
    this.look = look;
    this.H = (look.height || 1.85) / 1.85;                 // body scale
    this.lefty = !!look.lefty; this.hs = this.lefty ? -1 : 1;
    this.oneHand = !!look.oneHandBh;
    this.group = new THREE.Group();
    this.frame = new THREE.Group(); this.group.add(this.frame);   // carries root position and facing
    this.parts = {};
    this.build(look);
    // animation state
    this.yaw = 0; this.twist = 0; this.pelvisY = this.D.hipY; this.lean = 0.1; this.side = 0;
    this.poleS = [V(0, -1, 0), V(0, -1, 0)]; this.poleInit = false;
    this.loco = new Loco(); this.armFree = 0; this.heel = [0, 0]; this.lockF = [{ on: false }, { on: false }]; this.SP = new Float32Array(N3); this.clipW = 0; this.addrW = 0; this.bounceDy = 0;
    this.feet = [{ p: V(-0.2, 0, 0), planted: true, lift: 0 }, { p: V(0.2, 0, 0), planted: true, lift: 0 }];   // 0 = left, 1 = right, world space
    this.gait = 0; this.gaitW = 0; this.inited = false;
    this.hand = [V(), V()]; this.handInit = false;
    this.rk = { dir: V(0, 1, 0), nrm: V(0, 0, -1) };
    this.headYaw = 0; this.headPitch = 0;
    this.breath = Math.random() * 6;
    this.head = V(); this.eye = V(); this.fwd = V(0, 0, -1);
    this.racketHead = V(); this.offHand = V();
    this.fp = false;
    this.hop = 0; this.lastSplit = -99;
    this.strokeW = 0; this.pose = null;
    this.idleT = 0;
  }

  build(L) {
    const P = this.parts, G = this.group;
    const person = this.person = new Person(this.model, L);
    G.add(person.root);
    this.D = person.dim;
    // What makes a player recognisable from the stands: his hair and what he wears on it.
    const spec = L.hairSpec || { top: L.longHair ? 14 : 4, sides: L.longHair ? 14 : 2, back: L.longHair ? 20 : 2.5, tex: 'straight', fringe: 0.3, recede: 0, ears: !!L.longHair, c: L.hair || '#2a1c12' };
    this.hair = buildHair(person, spec, L.headwear || (L.headband ? { type: 'headband', c: L.band || '#ffffff', w: 5 } : L.cap ? { type: 'cap', c: L.capCol || '#ffffff' } : null));
    // racket
    this.racket = buildRacket(L.rk || {}); G.add(this.racket);
    // A fast swing is blurred, as a broadcast camera's shutter blurs it: the band the racket head has swept
    // over the last two frames, drawn faint and fading back from where the racket is now.
    { const NS = 9, geo = new THREE.BufferGeometry(), pos = new Float32Array(NS * 2 * 3), at = new Float32Array(NS * 2), idx = [];
      for (let i = 0; i < NS - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      for (let i = 0; i < NS; i++) at[i * 2] = at[i * 2 + 1] = i / (NS - 1);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aT', new THREE.BufferAttribute(at, 1)); geo.setIndex(idx);
      const col = new THREE.Color((L.rk && L.rk.frame) || '#15171c').lerp(new THREE.Color('#cfd2cf'), 0.5).multiplyScalar(1.6);
      const bm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, uniforms: { uCol: { value: col }, uK: { value: 0 } },
        vertexShader: 'attribute float aT; varying float vT; void main() { vT = aT; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 uCol; uniform float uK; varying float vT; void main() { float a = uK * vT * vT * 0.38; if (a < 0.004) discard; gl_FragColor = vec4(uCol, a); }' });
      const mesh = new THREE.Mesh(geo, bm); mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.visible = false; mesh.castShadow = false;
      G.add(mesh); this.blur = { mesh, hist: [], NS }; }
    // contact shadow: a soft dark pool under the feet that survives any light
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity: 0.38, toneMapped: false, color: '#000000' }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.006; blob.renderOrder = 3; G.add(blob); P.blob = blob;
    this.Fhand = [new THREE.Quaternion(), new THREE.Quaternion()];
  }

  setFirstPerson(on) {
    this.fp = on;
    // in first person the camera sits where the head is: hide what would fill the lens
    this.person.setFirstPerson(on);
  }

  // ---------- pose targets ----------
  // Returns hand positions in body space (x right, y up, f forward), racket direction and
  // face normal, chest twist (+ = turning toward the racket side), lean and crouch.
  // Authored for a right-hander; a left-hander is the mirror image.
  ready(t, o = {}) {
    const b = Math.sin(t * 11.9) * 0.018 * (o.live ? 1 : 0.25);
    // waiting on a serve he is bent lower over a wider base than between shots in a rally
    const c = (o.wait ? 0.16 : 0.14) + b, st = o.wait ? 0.40 : 0.39;
    if (this.fp) return { R: [0.20, 0.90 + b, 0.30], L: [-0.02, 0.94 + b, 0.44], dir: [-0.36, 0.30, 0.88], nrm: [0.75, 0.0, 0.66], twist: 0, lean: o.wait ? 0.40 : 0.32, crouch: c, stance: st, lgrip: 0.42, head: 0 };
    // waiting to receive he is never still: the weight rocks from foot to foot
    // the ready position: racket out in front pointing at the net, head at chest height, hitting hand on the grip at the waist, the other on the throat
    const fz = o.wait ? 0.05 : 0;
    // racket straight out in front of him at the net, hitting hand on the grip, the other hand round the throat
    // the butt of the handle in at his belly, the racket straight out at the net, both hands on the handle
    return { R: [0.04, 0.99 + b - fz * 0.6, 0.31 + fz], L: [0.04, 1.04 + b - fz * 0.6, 0.43 + fz], dir: [0.0, 0.50, 0.87], nrm: [1.0, 0.0, 0.0], twist: 0, lean: o.wait ? 0.40 : 0.32, crouch: c, stance: st, lgrip: 0.5, lgripAt: 0.092, head: 0, elbows: -0.40, elbowFwd: 0.95, shift: o.wait ? Math.sin(t * 2.7) * 0.04 : 0, set: o.wait ? 1 : 0 };
  }
  // Before a serve: side-on and upright at the line, he bounces the ball a few times with the
  // off hand, the racket hanging in the other, then brings ball and strings together, looks up
  // across the net, and is set.
  preServe(T, RT) {
    const n = RT ? RT.n : 4, per = RT ? RT.per : 0.6, t0 = RT ? RT.t0 : 0.5, set = sm((T - (t0 + n * per)) / 0.35);
    let y = 0.90, look = -0.5; this.bounceDy = 0;
    if (T > t0 && T < t0 + n * per) { const u = ((T - t0) % per) / per; const d = u < 0.16 ? sm(u / 0.16) : u < 0.62 ? 1 : 1 - sm((u - 0.62) / 0.3); y = 0.90 - 0.13 * d; this.bounceDy = -0.11 * d; }
    // chest turned well round to the racket side; the racket hangs in front of him, the ball hand works beside it
    const bounce = { R: [0.34, 0.80, 0.16], L: [0.26, y, 0.34], dir: [0.42, -0.80, 0.42], nrm: [0.6, 0, -0.8], twist: 1.15, lean: 0.28, crouch: 0.04, stance: 0.24, lgrip: 0, head: look, footL: [0.02, 0.14], footR: [0.06, -0.18], hipTurn: 0.85, set: 1 };
    this.bounceHand = 1 - set;
    if (set <= 0) return bounce;
    return blendPose(bounce, { ...SERVE.keys[0], head: 0.05, set: 1 }, set);
  }
  stroll(t, speed) {
    let sw = Math.sin(this.gait * Math.PI * 2) * 0.12 * Math.min(1, speed / 1.4), swL = -sw;
    // (the arms swing as the filmed walker's do, each against the opposite leg and in time with the feet: swung by a sine of
    // the step's clock they went their own way, in places with the leg on the same side, the pacing walk of a camel; the
    // filmed walker swings his little, about a sixth of a metre from front to back, and a stroll swings a quarter: so a little
    // more than his, the racket hand, carrying the racket, less than the free one)
    const F = this.loco && this.loco.FW;
    if (!globalThis.__strollArmOld && F) { const k = Math.min(1, speed / 1.0) * (this.loco.w.go || 0), rk = this.hs > 0 ? [J.rwri, J.rsho] : [J.lwri, J.lsho], fr = this.hs > 0 ? [J.lwri, J.lsho] : [J.rwri, J.rsho];
      sw = (F[rk[0] * 3 + 2] - F[rk[1] * 3 + 2] - 0.075) * (globalThis.__strollSwR ?? 1.15) * k; swL = (F[fr[0] * 3 + 2] - F[fr[1] * 3 + 2] - 0.065) * (globalThis.__strollSwL ?? 1.6) * k; }
    // (and the hands hang a little in front of the hips, where a relaxed arm hangs, the racket hand swinging back only half as
    // far as forward: about the hips' line, both hands spent half of each step behind the body, the racket trailing behind him)
    const fwdR = globalThis.__strollFwdOld ? 0.05 : 0.11, fwdL = globalThis.__strollFwdOld ? 0.02 : 0.09; if (!globalThis.__strollFwdOld && sw < 0) sw *= 0.5;
    let R = [0.27, 0.80, fwdR + sw], L = [-0.27, 0.84, fwdL + swL];
    // (the hands where the players' are as they walk between points, tracked from footage of them: the racket hand carried a
    // little forward and in, the elbow bent, swinging little; the free hand swinging against the opposite leg. A left-hander's
    // are the same half a stride on, so his racket arm too swings with the other leg)
    if (!globalThis.__strollClipOld && F) { const k = Math.min(1, speed / 0.6) * (this.loco.w.go || 0), G = this.hs > 0 ? F : (this.loco.FW2 || F);
      if (k > 0.001) { const cR = [G[J.rhand * 3], G[J.rhand * 3 + 1], G[J.rhand * 3 + 2]], cL = [G[J.lhand * 3], G[J.lhand * 3 + 1], G[J.lhand * 3 + 2]];
        R = R.map((v, q) => v + (cR[q] - v) * k); L = L.map((v, q) => v + (cL[q] - v) * k); } }
    // (the racket hangs from the hand, its head toward the court and a little forward, as the players carry it walking back)
    return { R, L, dir: globalThis.__strollClipOld ? [0.05, -0.55, 0.83] : [0.08, -0.86, 0.5], nrm: [1, 0, 0], twist: 0, lean: 0.06, crouch: 0.02, stance: 0.14, lgrip: 0, head: this.lookUp ? 0.02 : -0.25 };
  }
  runPose(t, speed) {
    const ph = this.gait * Math.PI * 2, sw = Math.sin(ph) * 0.07 * Math.min(1, speed / 4), up = Math.cos(ph * 2) * 0.012;
    // (the free hand carried in front of the stomach, as a tennis player runs with it, not beside the hip: the running arm's
    // swing is blended toward this, and held beside the hip, with the elbow swung back behind him, it read as a hand on the hip)
    // (the racket carried low and pointing ahead, the hand by the waist, as a player runs with it: held at the chest pointing
    // up, swung by the running arm, it rode up behind his head at a sprint, as if he were already taking it back)
    if (!globalThis.__runCarryOld) return { R: [0.22, 0.98 + up, 0.30 + sw], L: [-0.14, 1.10, 0.30 - sw], dir: [-0.22, 0.42, 0.88], nrm: [0.7, 0.1, 0.7], twist: 0, lean: 0.22, crouch: 0.15, stance: 0.22, lgrip: 0, head: 0, elbows: 0.15 };
    return { R: [0.22, 1.06 + up, 0.40 + sw], L: [-0.14, 1.10, 0.30 - sw], dir: [-0.30, 0.78, 0.55], nrm: [0.7, 0.1, 0.7], twist: 0, lean: 0.22, crouch: 0.15, stance: 0.22, lgrip: 0, head: 0, elbows: 0.15 };
  }

  // Where the ball was met, as far as the arms are concerned: up to contact, the place on the court; after it, that place
  // carried on with him. (Left on the court, a ball hit on the run was behind him a few tenths of a second later, and the
  // reach to it and the step back from it dragged both hands back through his chest in the follow-through: a two-hander's
  // top arm a dozen centimetres inside it, a forehand's finish across the ribs.)
  cpGone(st, p, t) {
    if (!st.cp || globalThis.__cpOld) return st.cp;
    if (this.cpAtSt !== st) { this.cpAtSt = st; this.cpAt = null; }
    if (t < st.tc) return st.cp;
    if (!this.cpAt) this.cpAt = { x: p.x, z: p.z, cp: { x: 0, y: 0, z: 0 } };
    const c = this.cpAt.cp; c.x = st.cp.x + p.x - this.cpAt.x; c.y = st.cp.y; c.z = st.cp.z + p.z - this.cpAt.z; return c;
  }
  // His own tracked clip for a stroke, if one has been made (see playermotion.js).
  ownClip(kind, wing, st) {
    // A lob, a drop shot or a slice begins as his own drive does, from his tracked clip: the turn, the footwork and (for the
    // lob and the forehand drop, disguised as a drive) the take-back are his; the clip is let go of over a fifth of a second
    // from tb on and the shot's own keys swing at the ball. (Played from the keys alone, every player's slice, lob and drop
    // were the same hand-made swing, and the lob was his drive.)
    if (!globalThis.__noOwnTb && (kind === 'lob' || kind === 'drop' || kind === 'slice')) {
      const c = this.ownClip('drive', wing, st); if (!c) return null;
      // (a slice, and the backhand drop that is played as one, is a different take-back from early on, the racket going up high
      // by the far shoulder where the drive's goes back low: his own clip is kept only through the turn and let go of over a
      // third of a second; let go of over a fifth from half a second out, the racket was swung up from one to the other faster
      // than the free hand on its throat could follow, and that hand was left twenty centimetres off it)
      const sl = kind === 'slice' || (kind === 'drop' && wing === 'bh');
      const tb = kind === 'lob' ? -0.22 : !sl ? -0.36 : (globalThis.__tbS ?? -0.72), tbD = sl ? (globalThis.__tbD ?? 0.32) : 0.2;
      const cache = this._tbW || (this._tbW = new Map()); let e = cache.get(c); if (!e) cache.set(c, e = {});
      const key = tb + '/' + tbD; return e[key] || (e[key] = Object.assign(Object.create(c), { tb, tbD }));
    }
    const key = kind === 'serve' ? 'serve' : kind === 'smash' ? 'smash' : kind === 'volley' || kind === 'block' ? wing + 'Volley' : kind === 'slice' || kind === 'drop' ? wing + 'Slice' : wing;
    // only strokes whose tracked clip has been looked at and passed (marked ok, or a serve not marked bad) are played from footage
    const usable = c => c && (c.ok === true || (CLIP_OK[key] && c.ok !== false));
    const SERVE_ARM = [-0.80, -0.06];                     // tracked serves are averaged: the trophy and racket drop come out flattened
    // He has more than one of this stroke on film: which one this shot is, chosen once as the stroke begins, by what it
    // is (on the run, an attack on a ball that sits up, a low one, or a ball he is set for), at random among the ones
    // that fit, so no two rallies show the same forehand over and over.
    const alts = (key === 'fh' || key === 'bh') && PLAYER_MOTION_ALTS[this.look.name || ''] && PLAYER_MOTION_ALTS[this.look.name || ''][key];
    if (alts && alts.length && st) {
      if (globalThis.__forcePick != null && (!st.clipPick || st.clipPick.i !== globalThis.__forcePick)) st.clipPick = { key, i: globalThis.__forcePick, sit: 'forced', want: 'forced' };   // (tools only: play one clip)
      if (!st.clipPick || st.clipPick.key !== key) {
        const sp = this.lastSpeed || 0, cp = st.cp, it = st.intent || {};
        const want = sp > 2.6 || st.onRun ? 'run' : it.state === 'attack' || (cp && cp.y > 1.25) ? 'attack' : cp && cp.y < 0.6 ? 'low' : 'set';
        // (his first clip has no label: one whose feet leave the court by half a metre was a ball hit on the run)
        const main = strokeClip(PLAYER_MOTION, this.look.name || '', key, this.lefty);
        if (main && main.sit == null) { let lift = 0; for (const a of main.F) lift = Math.max(lift, a[J.lankle * 3 + 1], a[J.rankle * 3 + 1]); main.sit = lift > 0.5 ? 'run' : 'set'; }
        // (and where his first clip is the weaker one, measured by how much the arms pass through the body in it, it is
        // played only when none of the others fits the shot)
        const weak = MAIN_WEAK.has((this.look.name || '') + '/' + key);
        const altPool = alts.map((c, i) => ({ i, sit: c.situation || 'set', ok: c.ok === true && !ALT_BAD.has((this.look.name || '') + '/' + key + '/' + i) })).filter(x => x.ok);
        const pool = (usable(main) && !MAIN_BAD.has((this.look.name || '') + '/' + key) && !(weak && altPool.some(x => x.sit === want || (want === 'attack' && x.sit === 'high'))) ? [{ i: -1, sit: main.sit }] : []).concat(altPool);
        // (nothing fits: a ball he is set for is the nearest thing, and a weak first clip is the last resort; a clip of a ball dug
        // out at the knee never stands in for anything else: picked at random for attacking and running forehands, a third of
        // Federer's came out as a scoop, the racket head dropped to the shins and finished low across the body)
        const fit = pool.filter(x => x.sit === want || (want === 'attack' && x.sit === 'high')), setAlts = pool.filter(x => x.i >= 0 && x.sit === 'set');
        const setLike = pool.filter(x => x.sit === 'set' && !(weak && x.i < 0));
        const from = fit.length ? fit : setLike.length ? setLike : weak && setAlts.length ? setAlts : pool.filter(x => x.sit !== 'run' && (x.sit !== 'low' || want === 'low'));
        const pick = (from.length ? from : pool)[Math.floor(Math.random() * (from.length ? from.length : pool.length))];
        st.clipPick = { key, i: pick ? pick.i : -1, sit: pick ? pick.sit : null, want };
      }
      if (st.clipPick.i >= 0) { const id = (this.look.name || '') + '#' + (globalThis.__altIdOld ? '' : key + '#') + st.clipPick.i, lib = this._altLib || (this._altLib = {});   /* (the wing in the name: kept under the number alone, a backhand's second clip took the place a forehand's had been filed under, found no backhand there and played his first one instead, every time after) */
        if (!lib[id]) lib[id] = { [key]: alts[st.clipPick.i] };
        const c = strokeClip(lib, id, key, this.lefty); if (usable(c)) return c; }
    }
    const mine = MAIN_BAD.has((this.look.name || '') + '/' + key) ? null : strokeClip(PLAYER_MOTION, this.look.name || '', key, this.lefty);
    // a serve tracked from a single clean instance keeps its own arm until the racket drop
    if (usable(mine)) { if (key === 'serve' && !mine.armZone) mine.armZone = (PLAYER_MOTION[this.look.name].serve.n || 1) > 1 ? SERVE_ARM : [-0.30, -0.06];
      // (a finish that goes on behind his head is held from before it does: see CLIP_END)
      const ce = globalThis.__clipEnd ?? CLIP_END[(this.look.name || '') + '/' + key];
      if (ce != null && mine.span && mine.span[1] > ce) { const cc = this._ceW || (this._ceW = new Map()); let w = cc.get(mine); if (!w || w.span[1] !== ce) cc.set(mine, w = Object.assign(Object.create(mine), { span: [mine.span[0], ce] })); return w; }
      return mine; }
    // no passing swing of his own: borrow the nearest real one — same hand where there is one, the same
    // kind of backhand — mirrored to his side, rather than fall back on hand-made keys
    for (const d of DONORS(key, this.lefty, this.oneHand)) { const c = strokeClip(PLAYER_MOTION, d, key, this.lefty); if (usable(c)) { if (key === 'serve' && !c.armZone) c.armZone = SERVE_ARM; return c; } }
    // last, a clip whose arms need help at contact
    for (const d of [this.look.name, ...DONORS(key, this.lefty, this.oneHand)]) { const z = PARTIAL[d + '/' + key], c = z && strokeClip(PLAYER_MOTION, d, key, this.lefty); if (c) { c.armZone = z; return c; } }
    return null;
  }
  // Keyframed strokes. `u` is seconds relative to contact.
  strokeKeys(kind, wing) {
    const one = this.oneHand;
    if (kind === 'serve') return SERVE;
    if (kind === 'smash') return SMASH;
    if (kind === 'volley' || kind === 'block') return wing === 'fh' ? FH_VOLLEY : BH_VOLLEY;
    if (kind === 'drop' && !globalThis.__noOwnTb) return wing === 'fh' ? DROP_FH : DROP_BH;
    if (kind === 'lob' && !globalThis.__noOwnTb) return wing === 'fh' ? LOB_FH : one ? LOB_BH1 : LOB_BH2;
    if (kind === 'slice' || kind === 'drop') return wing === 'fh' ? FH_SLICE : BH_SLICE;
    const base = wing === 'fh' ? FOREHAND : one ? BACKHAND_1H : BACKHAND_2H;
    // where a player's own footage shows his racket somewhere else, his keys say so
    const ov = globalThis.__noOvr ? null : RACKET_OVR[(this.look.name || '') + '/' + wing];   /* (__noOvr: tools only, a stroke seen without its override) */
    if (!ov) return base;
    const id = this.look.name + '/' + wing; if (_ovCache.has(id)) return _ovCache.get(id);
    const keys = base.keys.map(k => ({ ...k }));
    for (const o of ov) { let k = keys.find(q => Math.abs(q.u - o.u) < 0.06); if (!k) { k = { ...base.at(o.u), u: o.u }; keys.push(k); } k.dir = o.dir; if (o.nrm) k.nrm = o.nrm; }
    keys.sort((a, b) => a.u - b.u); const tr = track(keys, { hold: base.hold }); _ovCache.set(id, tr); return tr;
  }

  // ---------- per-frame ----------
  // p: sim player; m: match (for time, ball, phase); dt: frame time
  update(dt, p, m, o = {}) {
    // The body is moved by the player's velocity as it changes no faster than legs can change it, about eighteen metres a second
    // each second: the game gives a well-timed split step its first step at once, two and a half metres a second in a frame, and
    // stops a player at a limit of the arena in one; the stride and the feet were thrown with it, a foot a third of a metre in a
    // frame. (Where he is stays the game's; only how the body reads his going.)
    if (!globalThis.__velSmoothOld) { if (!this.inited || this.vS == null || dt <= 0) this.vS = [p.vx, p.vz];
      else { const dx = p.vx - this.vS[0], dz = p.vz - this.vS[1], dl = Math.hypot(dx, dz), mx = 18 * dt; if (dl > mx) { this.vS[0] += dx * mx / dl; this.vS[1] += dz * mx / dl; } else { this.vS[0] = p.vx; this.vS[1] = p.vz; } }
      if (this.vS[0] !== p.vx || this.vS[1] !== p.vz) p = Object.assign(Object.create(p), { vx: this.vS[0], vz: this.vS[1] }); }
    const H = this.H, s = p.sgn, hs = this.hs, t = m.t, D = this.D, person = this.person;
    const speed = this.lastSpeed = Math.hypot(p.vx, p.vz);
    const base = s > 0 ? 0 : Math.PI;                      // facing the net
    if (!this.inited) { this.lockF = [{ on: false }, { on: false }]; this.pvx = this.pvz = null; this.ax = this.az = 0; this.slideT = 0;
      // (placed afresh, at a cut or the start or end of a replay, where the clock may even have gone back: nothing about a
      // stroke being let go of, handed over or carried in from before the cut is carried over it)
      for (const k of ['segL', 'rgOk', 'cpAtSt', 'cpAt', 'ecAng', 'lgReachK', 'regripShort', 'poleArmOk', 'ankAirOk', 'legSepA', 'footSide', 'headSideA', 'headUA', 'headAngA', 'headRkOk', 'acrossOff', 'lpOff', 'lpW', 'sepK', 'vS', 'wSrvE', 'wKE', 'hopW', 'slideW', 'srvWalking', 'turnT', 'rgEl', 'rgElOk', 'roomFE', 'roomFEV', 'roomF', 'roomE', 'roomEV', 'roomX', 'ocMu', 'plSt', 'pl', 'prevSt', 'cancelT', 'cancelU', 'deferredSt', 'deferT', 'keySt', 'keysOld', 'keysNow', 'inSt', 'inT', 'ocSt', 'ocLast', 'ocLostT', 'ocFrom', 'ocInT', 'uFor', 'uLast', 'uLastSt', 'uOff', 'tpSt', 'wSt', 'xinSt', 'shSt', 'lastSelSt', 'ctErrSt', 'popSt', 'fYaw', 'ankPrev', 'offRel', 'offLocOk', 'minOk', 'poleInit', 'elGot', 'elVel', 'bodyGot', 'bodyVel', 'proS', 'proV', 'fastT', 'sinceSw', 'elRelOk', 'shownSt', 'inKey', 'wrRelOk', 'azSt', 'azK', 'ballHW', 'tossCuSt', 'tossCuOff', 'tossCuT', 'wasSrvWait', 'xfT', 'xfK', 'poseLast', 'lpLast', 'muD', 'lastFreeA', 'inFreeA']) this[k] = undefined;
      this.ocW = 0; this.swPrevD = 0;
      this.inited = true; this.placedT = t; this.feet[0].p.set(p.x - s * 0.2, 0, p.z); this.feet[1].p.set(p.x + s * 0.2, 0, p.z); this.rootX = p.x; this.rootZ = p.z; }
    // ---- which pose ----
    // (the engine lets go of a stroke 0.8 s after contact, while its finish may still be fading into the run or the ready
    // position: the figure plays that fade to its end rather than dropping the last of the stroke in one frame; only within
    // the point, never across the cut to the next one)
    let st = p.stroke;
    // (and on into the walk between points after a fault, where the engine has let go of it; but never across a cut, after
    // which he has been put on his mark)
    // (unless a stroke begun since that one was called off: that is the one being let go of, below; taken back to the older
    // finish instead, the arms were thrown from the new wind-up to the old follow-through, and back again when it ran out)
    const newerCancel = this.prevSt && this.prevSt !== p.lastStroke && !this.prevSt.done && p.lastStroke && p.lastStroke.tc != null && this.prevSt.t0 > p.lastStroke.tc;
    if (!st && !newerCancel && p.lastStroke && p.lastStroke.tc != null && (m.phase === 'live' || m.phase === 'over' || (m.phase === 'between' && p.lastStroke.tc > (this.placedT ?? -9))) && t - p.lastStroke.tc < 1.4 && t >= p.lastStroke.tc) st = p.lastStroke;
    // (a new stroke begun a moment after contact, before any ball can be coming back, a press that came late: the stroke
    // just struck goes on into its finish, and the new one starts from there; given the new one at once, the finish was
    // dropped in a frame and both arms flew back to the start of a wind-up)
    // (played until it has let go of the arms, not cut off at a fixed time: cut at full weight, the finish was dropped in a
    // frame half a second after contact and both arms flew to the new wind-up; only a ball really on its way back to him,
    // due within half a second, takes the new stroke sooner, and then the hands are carried over from the finish)
    // (never once the new one has been shown on its own: gone back to, the old finish flashed up in the middle of a wind-up; and
    // from a little before the old contact, which the engine can mark done a frame early)
    else if (st && st.tc == null && st.kind !== 'serve' && p.lastStroke && p.lastStroke.tc != null && t >= p.lastStroke.tc - 0.05 && t - p.lastStroke.tc < 1.2
      && this.shownSt !== st && !(st.tcPlan != null && st.tcPlan - t > 0.12 && st.tcPlan - t < 0.5 && st.tcPlan - p.lastStroke.tc > 0.3)
      && ((st.t0 - p.lastStroke.tc < 0.45 && t - p.lastStroke.tc < 0.55)                                   // a press that came late
        || (this.deferredSt !== st && this.lastSelSt === p.lastStroke && (this.swNow || 0) > 0.05)        // (or any new stroke while the finish still shows)
        || (this.deferredSt === st && (this.defSw || 0) > 0.01))) { st = p.lastStroke; this.deferredSt = p.stroke; }
    // (a wind-up called off before he swung, the point over or the ball let go: it is let go of over a quarter of a second,
    // not dropped in a frame with the arms flung from the take-back to the ready position)
    // (and so is one still held when the point is over, the ball gone by without his letting go: the engine keeps it until
    // the next point, and he stood frozen in his take-back, his feet crossed in it, for a second and a half)
    if (st && st.tc == null && st.kind !== 'serve' && st === p.stroke && (m.phase === 'over' || m.phase === 'between' || m.phase === 'done')) st = null;
    // (a stroke handed back already well past its contact, when no stroke was being played a moment ago, is not picked up: its
    // finish would appear from nowhere, the arms thrown a metre in a frame into the middle of it)
    if (st && st !== this.lastSelSt && !this.lastSelSt && st.tc != null && t - st.tc > 0.15 && st !== p.stroke) st = null;
    let cancelK = 1;
    // (the computer's too: a stroke booked for a contact it then thinks better of is dropped by the engine part way through
    // the take-back, and the arms went from the wind-up to the ready position in a frame)
    if (!st && this.prevSt && (this.prevSt.tc == null || (this.cancelT != null ? this.cancelT : t) < this.prevSt.tc - 0.12) && !this.prevSt.done && this.prevSt.kind !== 'serve') { if (this.cancelT == null) { this.cancelT = t; this.cancelU = this.uLastSt === this.prevSt ? this.uLast : null; } const k = 1 - sm5((t - this.cancelT) / 0.45); if (k > 0.001) { st = this.prevSt; cancelK = k; } else { this.prevSt = null; this.cancelT = null; } } else if (st) this.cancelT = null;
    if (cancelK === 1 && st === p.stroke) this.prevSt = p.stroke;
    // (once let go of, it is gone: kept, it came back at full strength when a later finish ended, and a smash called off eight
    // seconds before was thrown up in a frame after the point, both arms with it)
    // (and one that takes over from a finish that was still being played out comes in from it, not at full strength at once)
    const deferIn = this.deferredSt && st === this.deferredSt ? (this.deferT == null ? (this.deferT = t, 0.002) : Math.max(0.002, sm5((t - this.deferT) / 0.18))) : 1;
    if (this.deferredSt && st !== this.deferredSt && st !== p.lastStroke) { this.deferredSt = null; this.deferT = null; }
    // A switch of the stroke shown while the last one still holds the body (a new swing that cannot wait, begun as the last
    // one's finish is still playing): the body as it was last shown is held and let go of over the time to the new contact, at
    // most a quarter of a second. (Switched at once, the trunk fell from the finish carried by the old clip to the run in one
    // frame and both arms were thrown with it, eighty degrees.)
    if (this.handInit && this.lastSelSt && st !== this.lastSelSt && (this.swNow || 0) > 0.3 && this.poseLast && this.lpLast && !(st && st.kind === 'serve') && this.lastSelSt.kind !== 'serve') {
      const tcX = st ? (st.tc != null ? st.tc : st.tcPlan) : null; this.xfT = t; this.xfD = tcX != null ? clamp((tcX - t) * 0.75, 0.12, 0.25) : 0.25;
      this.xfPose = this.poseLast; (this.xfLP || (this.xfLP = new Float32Array(N3))).set(this.lpLast); }
    this.lastSelSt = st; if (st && st === p.stroke && st.tc == null) this.shownSt = st;
    const between = m.phase === 'between' || (m.phase === 'over' && m.phaseT > 0.9) || m.phase === 'done';
    let pose, sw = 0, u = 0, keys = null;
    if (st && (st.kind !== 'serve' || m.phase === 'toss' || st.done)) {
      // The shot shown is the one being swung: a change of kind decided as he lets go (the ↓ of a drop volley, a drive the
      // game turns into a volley at the net) changes where the ball goes, not the arms, once the swing is under way; swapped
      // a sixth of a second before contact, the arms were thrown from one swing's shape to another's at the ball.
      { const ue = st.tc != null ? t - st.tc : st.tcPlan != null ? t - st.tcPlan : -9;
        if (st.__dk == null || st.kind === 'serve' || st.kind === 'smash' || st.__dk === 'serve' || st.__dk === 'smash' || ue < -0.3) st.__dk = st.kind;
        // A groundstroke begun with under a third of a second to the ball, nothing set up for it (pressed late, or a ball the
        // planner had not prepared him for), is played as what a player does then: a short blocked swing, the racket taken back
        // only a little and pushed through. (Played as the full stroke, the whole take-back and swing were crammed into a
        // seventh of a second: the figure went from the ready position to mid-swing in a few frames and flailed through it.)
        { const tcK = st.tc != null ? st.tc : st.tcPlan;
          if (!st.__rushSet && tcK != null) { st.__rushSet = true; if (!globalThis.__noRushBlock && t - st.t0 < 0.06 && tcK - st.t0 < (globalThis.__rushT ?? 0.37) && /^(drive|loop|flat|lob)$/.test(st.kind)) st.__rush = true; }   /* (0.3 s left the strokes booked with 0.30-0.37 s to go as full swings squeezed in: the take-back snapped from the chest to the shoulder in two frames, 35 degrees a frame) */
          if (st.__rush) st.__dk = 'block'; } }
      keys = this.strokeKeys(st.__dk, st.wing);
      const span = keys.span;
      // (a held position is reached gently, not stopped at; and where the swing's own clock takes over from the
      // wind-up's, the difference between them is let go of over a tenth of a second instead of jumped)
      const soft = (x, h) => x < h - 0.08 ? x : h - 0.08 * Math.exp(-(x - (h - 0.08)) / 0.08);
      if (cancelK < 1 && this.cancelU != null) u = this.cancelU;          // (a wind-up being let go of stays where it was)
      else if (st.tc != null) {
        u = t - st.tc;
        if (this.uFor !== st) { this.uFor = st; this.uOff = this.uLast != null && this.uLastSt === st ? this.uLast - u : 0; this.uOffT = t; this.uOffEnd = st.tc; }
        // where the wind-up was not where the real clock says the swing is (a swing let go of late or early), the
        // difference is worked off evenly over the time left to contact: the swing runs a little faster or slower and
        // arrives on time, rather than jumping ahead in a few frames
        if (this.uOff) { const left = this.uOffEnd - this.uOffT; u += this.uOff * (left > 0.03 ? clamp((this.uOffEnd - t) / left, 0, 1) : Math.exp(-(t - this.uOffT) / 0.05)); }
      }
      else if (st.kind === 'serve') u = soft((t - st.t0) - (TIMING.tossUp + TIMING.tossFly), keys.hold);   // wind-up and toss run on their own clock
      // a person's wind-up: timed to when the ball will reach him, as he reads it, and carried on to where the forward
      // swing begins (Space lets it go; it is released at most a sixth of a second before contact)
      // (held no earlier than an eighth of a second before contact: he lets go a sixth of a second before it, and held a fifth
      // of a second back the rest of the swing ran half as fast again to arrive on time, the fastest part of it most of all)
      // (a re-read of when the ball will arrive, a plan that moves contact half a second later, is worked off over a quarter
      // of a second: jumped to, the wind-up was thrown half a second back in one frame)
      else if (st.tcPlan != null) {
        if (this.tpSt !== st) { this.tpSt = st; this.tpOff = 0; this.tpOffT = -9; this.tpOffNow = 0; }
        else if (Math.abs(st.tcPlan - this.tpLast) > (globalThis.__tpJumpOld ? 0.04 : 0.008)) { this.tpOff = this.tpOffNow + (st.tcPlan - this.tpLast); this.tpOffT = t; }   /* (any re-read over half a frame: under the old 0.04 s, one of 0.033 s was jumped, the wind-up and both feet skipped two frames) */
        this.tpLast = st.tcPlan;
        // (worked off at the rate of the clock itself: a later contact holds the wind-up where it is until the new time
        // catches up with it, as a player who reads the ball as slower waits in his turn; worked off over a quarter of a
        // second instead, the take-back was run backwards at several times its speed)
        const left = Math.max(0, Math.abs(this.tpOff) - (t - this.tpOffT));
        this.tpOffNow = Math.sign(this.tpOff) * left;
        u = soft(t - st.tcPlan + this.tpOffNow, Math.max(keys.hold, -0.12));
      }
      else u = soft(span[0] + (t - st.t0), keys.hold);                   // human holding the take-back
      // A stroke begun late, the ball on him sooner than he read it, still has its whole wind-up: from where one begun in
      // time starts, played faster (up to about twice as fast, fastest in the middle) and caught up by a quarter of a second
      // before contact. (Begun where the clock already was, the unit turn was skipped: the body was faded into the middle of
      // the take-back in a fifth of a second, and the arm was thrown thirty centimetres a frame to get there.)
      if (st.kind !== 'serve' && st.kind !== 'smash' && cancelK === 1) {
        if (this.wSt !== st) { this.wSt = st; const back = Math.min(u + 0.9, (-0.25 - u) * 0.6); this.wU0 = u; this.wBack = back > 0.03 ? back : 0; }
        if (this.wBack > 0 && u < -0.25) u -= this.wBack * (1 - sm((u - this.wU0) / (-0.25 - this.wU0)));
      }
      if (this.dbgOn) this.dbgU = { b: cancelK < 1 && this.cancelU != null ? 'cancel' : st.tc != null ? 'tc' : st.kind === 'serve' ? 'srv' : st.tcPlan != null ? 'plan' : 'hold', u: +u.toFixed(3), tc: st.tc, tp: st.tcPlan != null ? +st.tcPlan.toFixed(3) : null, wB: +(this.wBack || 0).toFixed(3), uOff: +(this.uOff || 0).toFixed(3), tpN: +(this.tpOffNow || 0).toFixed(3) };
      this.uLast = u; this.uLastSt = st;
      if (st.kind === 'serve' && st.tc != null) { /* contact time now known */ }
      const end = st.done ? (st.tEnd - (st.tc || st.tEnd)) + TIMING.follow + TIMING.recover : 99;
      // (how fast it comes in is fixed by its first frame, from the contact time then known or planned: worked out again when
      // a person let go, a late press's fade-in was cut short and the body turned half its wind-up in one frame)
      if (this.xinSt !== st) { this.xinSt = st; const tcK = st.tc != null ? st.tc : st.tcPlan; this.xin = tcK != null ? clamp((tcK - st.t0) * 0.8, 0.2, 0.22) : 0.22;   /* (never under a sixth of a second: a swing begun at the last moment turned the body round in four frames, and at an eighth, sprinting to a ball, the arm still swung seventy degrees in a frame as the trunk came round under it; a late ball is met with the body still turning, as it is) */ }
      if (u < span[1] + 0.05) { const X = 0.3 + 0.22 * sm(speed / 3.5), Xin = this.xin; sw = sm((t - st.t0) / Xin) * (1 - sm5((u - (span[1] - X)) / X)) * cancelK * deferIn;   /* (in on a gentler curve: on the steeper one a swing begun at a sprint, a quarter of a second before the ball, turned the body and both arms sixty degrees in its steepest frame) */ void end; }   /* (in over at most a fifth of a second, and always well before contact on a late swing) */   /* (on the run the finish is cut shorter and let go of more slowly, as a player recovering does) */
      // Running hard to a ball still well over half a second away, he runs: arms pumping, free to turn and run, the racket taken
      // back only in the last steps. Booked nine-tenths of a second ahead, the stroke's take-back came in at once and held him
      // facing the net with the racket out to the side for the whole run, shuffling sideways at a sprint to a ball far from him.
      if (!globalThis.__prepLateOld && st.kind !== 'serve' && st.kind !== 'smash') { const tcL = st.tc != null ? st.tc : st.tcPlan, left = tcL != null ? tcL - t : 0.9;
        const want = sm((speed - (globalThis.__prepRunV ?? 2.2)) / 1.2) * sm((left - (globalThis.__prepLead ?? 0.5)) / 0.25);
        this.prepLate = this.inited && dt > 0 && this.prepLateSt === st ? this.prepLate + (want - this.prepLate) * (1 - Math.exp(-dt * (want < this.prepLate ? 9 : 14))) : want; this.prepLateSt = st;
        sw *= 1 - this.prepLate; }
    }
    // the arms' share of the stroke: all of it from the first frame on the way in (see the hands' entry below), the same
    // as the body's on the way out
    // (a wind-up being called off lets go of the arms with the rest of it, over the same quarter second: kept at full
    // strength while the body faded, they were dropped from the take-back to the ready position in the last frame of it)
    const swA = st && st.kind !== 'serve' && sw > 0.001 && (st.tc == null || t < st.tc) ? cancelK : sw;
    this.defSw = st && st === p.lastStroke && this.deferredSt ? sw : 0;
    const live = m.phase === 'live' || m.phase === 'toss' || m.phase === 'ready';
    const serverWait = m.phase === 'ready' && m.score.server === p.i;
    // (a server moving along the baseline to choose his spot walks there, turned the way he is going, and settles into his
    // stance only once he stops: held in the side-on serving stance and slid sideways, the legs ran a sideways gait under it,
    // lunging, scissoring and splaying into the splits as he changed direction)
    const srvWalkK = this.srvWalkK = serverWait && !globalThis.__srvWalkOld ? damp(this.srvWalkK || 0, globalThis.__srvWalk2Old ? sm((Math.hypot(p.vx, p.vz) - 0.25) / 0.5) : sm((Math.hypot(p.vx, p.vz) - 0.08) / 0.3), globalThis.__srvWalk2Old ? 8 : 10, dt) : 0;
    // (he turns and runs from two and a half metres a second, not three and a fifth, and pumps his arms from three, not nearly four:
    // a run to a ball well wide, behind or in front of him began as a quick sideways shuffle of three steps a second and went
    // on with the racket held out in front of him at chest height, as if already taking it back)
    const gT0 = globalThis.__turnOld ? GAIT.turn0 : (globalThis.__turn0 ?? 2.5), gT1 = globalThis.__turnOld ? GAIT.turn1 : (globalThis.__turn1 ?? 4.0), gP0 = globalThis.__pumpOld ? GAIT.pump0 : (globalThis.__pump0 ?? 3.0), gP1 = globalThis.__pumpOld ? GAIT.pump1 : (globalThis.__pump1 ?? 4.4);
    this.fastT = speed > gP0 ? (this.fastT || 0) + dt : 0;
    // (running in to the net, inside the service line or moving toward it in front of the baseline, a volleyer carries the
    // racket up in front and does not pump; pumping and then taking it up again was a racket that went up, down and up)
    const inward = (-p.vz * p.sgn) > 0.6 * speed && Math.abs(p.z) < 10.5;
    this.pumpSus = sm((this.fastT - (Math.abs(p.z) < 7.2 || inward ? 0.6 : (globalThis.__pumpOld ? 0.22 : 0.1))) / 0.25);
    // (his routine at the line waits for him to stop walking: bounced on the move, the ball dropped to the court at his feet in
    // mid-stride; walking, he holds it, and once he has stopped he begins again)
    if (serverWait && !globalThis.__ritWalkOld) { const RT0 = m.ritual || { t0: 0.5 }; if (this.ritT == null || m.phaseT < (this.ritPT ?? 0)) this.ritT = m.phaseT; else this.ritT += m.phaseT - this.ritPT; this.ritPT = m.phaseT; if ((this.srvWalkK || 0) > 0.25) this.ritT = Math.min(this.ritT, RT0.t0 - 0.35); } else this.ritT = null;
    let basePose;
    if (this.posed) basePose = this.posed;
    else if (between || !live) basePose = this.stroll(t, speed);
    else if (serverWait) { basePose = this.preServe(this.ritT != null ? this.ritT : m.phaseT, m.ritual);
      // walking to his mark to serve he walks as anyone does between points, arms down, racket hanging in his hand, ball in the
      // other; the set-up's turn of the chest and its stance come on only as he stops (walked in the set-up pose, the chest was
      // turned well round to the racket side and the feet kept the serving stance as he walked along the line)
      if (!globalThis.__srvStrollOld && srvWalkK > 0.001) basePose = blendPose(basePose, this.stroll(t, speed), srvWalkK); }
    else {
      // the racket stays in front in both hands until he is flat out; only then do the arms pump
      basePose = this.ready(t, { live: m.phase === 'live', wait: m.phase !== 'live' });
      const pump = sm((speed - gP0) / (gP1 - gP0)) * this.pumpSus * (st && sw > 0.3 ? 0 : 1);
      if (pump > 0.001) basePose = blendPose(basePose, this.runPose(t, speed), pump);
    }
    // (from one kind of standing to another, the walk between points into the stance to serve or to receive, over a quarter of a
    // second: switched in a frame, a foot still on its way down from a step was sent to its new place in the stance at once,
    // fifteen centimetres in a frame, and the other after it)
    if (!globalThis.__baseXfOld && !this.posed) { const src = between || !live ? 1 : serverWait ? 2 : 3;
      if (this.baseSrc != null && src !== this.baseSrc && this.baseLast && this.baseLastPt === this.placedT) { this.baseFrom = this.baseLast; this.baseFT = t; }
      this.baseSrc = src;
      if (this.baseFrom) { const k = sm5((t - this.baseFT) / 0.25); if (k < 1 && this.baseLastPt === this.placedT) basePose = blendPose(this.baseFrom, basePose, k); else this.baseFrom = null; }
      this.baseLast = blendPose(basePose, basePose, 0); this.baseLastPt = this.placedT; }
    pose = basePose;
    // A stroke that changes kind or side part way (a drive he turns into a drop shot as he swings, a forehand he runs
    // round) is crossfaded from the old keys to the new over a tenth of a second, not switched in a frame.
    // (the old keys are played on their own side: given the new side's sign, as they were, the first frame of a ball run
    // round was the old take-back mirrored onto the other side, a snap; and a change of side takes longer than a change of
    // shot, the racket brought across in front of him past the ready position, not swapped in a tenth of a second)
    const wSign = st && st.wing === 'fh' ? 1 : -1;
    if (keys && st) { if (this.keySt !== st) { this.keySt = st; this.keysNow = keys; this.keysOld = null; this.keysNowW = wSign; }
      else if (keys !== this.keysNow) { this.keysOld = this.keysNow; this.keysOldW = this.keysNowW != null ? this.keysNowW : wSign; this.keysSide = this.keysOldW !== wSign; this.keysNow = keys; this.keysNowW = wSign; this.keysT = t; } }
    if (keys && sw > 0.001) { let sp = keys.at(u, this, st.wing === 'fh' ? 1 : -1);
      // a block booked late (a ball on him with under a third of a second to go) has no time for the turn its keys hold from a
      // sixth of a second out: the racket goes more nearly straight from where it was to the contact, the turn scaled down
      // with the time there is (with a fifth of a second, the full turn came in three frames, the arm 36 degrees a frame)
      // (eased in from the frame the contact's time is known: a stroke started before it was had its take-back target moved
      // thirty centimetres in a frame when it came)
      if (!globalThis.__blockShortOld && (st.__rush || (!globalThis.__sliceShortOld && /^(slice|drop)$/.test(st.kind) && st.tc != null && st.tc - st.t0 < 0.37)) && st.tc != null && u < 0) { const av = st.tc - st.t0, k = sm((av - 0.14) / (globalThis.__lateSpan ?? 0.3));   /* (a slice or a drop shot booked as late, the same: its keys' take-back high by the far shoulder came in three frames) */
        if (st.__tcSeen == null) st.__tcSeen = t; const ramp = st.__tcSeen <= st.t0 + 0.02 ? 1 : sm((t - st.__tcSeen) / 0.08);
        if (k < 0.999 && ramp > 0.001) { const q = clamp((u + av) / Math.max(av, 1e-3), 0, 1); sp = blendPose(sp, blendPose(basePose, keys.at(0, this, wSign), sm(q)), (1 - k) * ramp); } }
      if (this.keysOld) { const dur = this.keysSide ? 0.3 : 0.12, k = sm5((t - this.keysT) / dur);
        if (k < 1) { sp = blendPose(this.keysOld.at(u, this, this.keysOldW), sp, k); if (this.keysSide) sp = blendPose(sp, basePose, 0.65 * Math.sin(Math.PI * k)); } else this.keysOld = null; }
      pose = blendPose(basePose, sp, sw);
      // the arms go over to the stroke at once on the way in (the hands are carried from where they were, below, as the
      // gap is let go of); the body, the legs and the trunk, still fade in
      if (swA > sw) { const pa = blendPose(basePose, sp, swA); pose.R = pa.R; pose.L = pa.L; pose.dir = pa.dir; pose.nrm = pa.nrm; pose.lgrip = pa.lgrip; pose.lgripAt = pa.lgripAt; pose.elbows = pa.elbows; pose.elbowFwd = pa.elbowFwd; } }
    // reactions after the point
    // A point that meant something gets a reaction, chosen from the ones this player shows (Nadal's crouched
    // "vamos", Connors' fist, Borg next to nothing), by how big the point was and how it ended, never the same
    // twice running, and not after every point: most are played and forgotten.
    this.reactK = 0;
    if (p.moodT !== this.reactFor) { this.reactFor = p.moodT; this.react = pickReaction(this, p, m); }
    if (this.react && m.phase === 'over' && t - p.moodT < 2.2 && m.phaseT > 0.3 && !(st && sw > 0.2)) {
      const R0 = REACT[this.react], AN = !globalThis.__reactAnimOld && REACT_ANIM[this.react], R = AN ? AN.at(m.phaseT - 0.3, this) : R0, dur = (AN ? R0.adur : 0) || R0.dur || 1.5, k = sm((m.phaseT - 0.3) / (R0.in || 0.25)) * (1 - sm((t - p.moodT - dur) / 0.5));
      this.reactK = k; this.reactShout = R0.shout || 0; this.reactFist = R0.fist || 0; this.reactPoint = R0.point || 0; this.reactPole = R0.poleL || null;
      pose = blendPose(pose, R, k);
      // (a hand going up to the head or above it goes up in front of him, not up the front of the chest: blended straight from
      // down by the hip to the top of the head, both arms passed up through the chest on the way to the hands-on-head)
      if (!globalThis.__reactBowOld) { const bow = Math.sin(Math.PI * clamp(k, 0, 1)) * (globalThis.__reactBow ?? 0.26); if (bow > 0.001) for (const hk of ['R', 'L']) if (R[hk][1] > 1.3) pose[hk] = [pose[hk][0], pose[hk][1], pose[hk][2] + bow]; }
    }
    // The small things players do between points. After a point that is nothing to shout about, now and then: a wipe of the
    // forehead with the wristband, a look down at the strings, a twirl of the racket in the hand as he turns away. Waiting
    // to receive, now and then a spin of the racket in his hands. (Without them, between the points every man stood or walked
    // with his arms hanging the same way every time.)
    this.touchK = 0;
    if (!globalThis.__touchOld && !this.fp) {
      const nm = this.look.name || '', often = TOUCH_OFTEN[nm] ?? 0.5;
      if (m.phase === 'over' && this.touchFor !== p.moodT) { this.touchFor = p.moodT; this.touch = !this.react && Math.random() < often ? TOUCH_KINDS[Math.floor(Math.random() * TOUCH_KINDS.length)] : null; this.touchT = t + 0.35 + Math.random() * 0.35; }
      const rcv = m.score && m.score.server !== p.i;
      if (m.phase === 'ready' && rcv && this.rdyFor !== p.moodT) { this.rdyFor = p.moodT; this.rdySpinT = Math.random() < often * 0.8 ? t + 0.2 + Math.random() * 0.9 : null; }
      if (m.phase !== 'ready') this.rdySpinT = null;
      const calmNow = !(st && sw > 0.05) && speed < 2.6 && !((this.reactK || 0) > 0.02);
      if (this.touch && m.phase === 'over' && calmNow) { const u = t - this.touchT, TA = TOUCH_ANIM[this.touch];
        if (TA && u > 0) { const dur = TA.span[1] - 0.15, k = sm(u / 0.25) * (1 - sm((u - dur) / 0.3)); if (k > 0.001) { pose = blendPose(pose, TA.at(u, this), k); this.touchK = k; } }
        else if (this.touch === 'spin' && u > 0) spinRacket(pose, u, 0.5); }
      if (this.rdySpinT != null && m.phase === 'ready' && calmNow) { const u = t - this.rdySpinT; if (u > 0) spinRacket(pose, u, 0.42); }
    }
    { const k = this.xfT != null ? 1 - sm5((t - this.xfT) / this.xfD) : 0; if (k > 0.001) pose = blendPose(pose, this.xfPose, k); else this.xfT = null; this.xfK = k; }
    this.poseLast = blendPose(pose, pose, 0);
    this.pose = pose; this.strokeW = sw;

    // ---- body carriage ----
    // turn and run for a wide ball, shuffle for a near one
    let yawT = 0;
    // (the stroke holds the body only until the ball has gone: running out of a finish he turns to run as anyone does; held
    // facing the net while the recovery played out, a third of his sprints back across the court were a sideways gallop)
    const swTurn = globalThis.__turnRecOld || !(st && st.tc != null) ? sw : sw * (1 - sm((t - st.tc - 0.2) / 0.2));
    this.turnT = live && speed > gT0 * 0.85 && !(swTurn > 0.3) ? (this.turnT || 0) + dt : 0;
    if (speed > gT0 && !(swTurn > 0.3) && live) {
      const lx = p.vx * s, lf = -p.vz * s;               // velocity in body space (x right, f forward)
      // (only once he has been going that fast for a moment: a step or two across to a ball near him is shuffled facing the net,
      // as a player does; turned at once at the peak of every quick shuffle, the body swung side-on and back in half a second
      // and the legs ran a crossover under a body still shuffling)
      const fT0 = globalThis.__keyTurnOld ? 4.2 : (globalThis.__fastTurn0 ?? 3.0);
      const turnSus = globalThis.__turnSusOld ? 1 : Math.max(sm(((this.turnT || 0) - 0.14) / 0.22), globalThis.__turnFastOld ? 0 : sm((speed - fT0) / 0.8));   /* (but nobody shuffles at a sprint: above about three and a half metres a second he turns at once) */   /* (from three metres a second, not four and a bit: moved with the arrows, a new way every third of a second, the wait for a steady run never ran out, and he went sideways and back at three or four metres a second square to the net, the legs a jumping jack, both feet off the court) */
      yawT = clamp(Math.atan2(lx, Math.max(0.2, Math.abs(lf)) * Math.sign(lf || 1)), -1.15, 1.15) * sm((speed - gT0) / (gT1 - gT0)) * (lf < -0.5 ? 0.35 : 1) * turnSus;
      // (going back and across fast, as for a deep ball wide of him, he turns to the side and runs, the shoulders to the sideline:
      // kept within a third of the turn going back, at five or six metres a second he galloped sideways with his chest to the net)
      if (!globalThis.__backRunOld && lf < -0.5 && Math.abs(lx) > 0.25 * speed) { const bk = sm((speed - 3.8) / 1.2); if (bk > 0.001) yawT = lerp(yawT, Math.sign(lx) * Math.min(1.6, Math.atan2(Math.abs(lx), lf)) * sm((speed - gT0) / (gT1 - gT0)) * turnSus, bk); }
      // (and straight back, faster than a backpedal goes, he drops a foot back and turns side-on to run, to his forehand side unless
      // he is already going a little across: the arrow held back sent him backpedalling at four metres a second, facing the net)
      if (!globalThis.__keyTurnOld && lf < -0.5 && Math.abs(lx) <= 0.25 * speed) { const bk = sm((speed - 2.6) / 0.9); if (bk > 0.001) { if (!this.backSide || Math.abs(lx) > 0.12 * speed) this.backSide = Math.abs(lx) > 0.12 * speed ? Math.sign(lx) : (hs > 0 ? 1 : -1); yawT = lerp(yawT, this.backSide * 1.25 * turnSus, bk); } } else if (!(lf < -0.5)) this.backSide = 0;
    } else if ((between || (serverWait && !globalThis.__srvWalkOld)) && speed > (serverWait && !globalThis.__srvWalk2Old ? (this.srvWalking ? 0.08 : 0.15) : 0.5)) { yawT = Math.atan2(p.vx * s, -p.vz * s); }
    // (waiting to serve, any move along the line is a walk, turned to where he is going from a few steps a second and back into
    // his stance when he stops: held facing the net below half a metre a second, he slid along the line in his wide serving
    // stance, and just above it half turned, the legs of a sideways shuffle crossing under a body walking)
    if (serverWait && !globalThis.__srvWalk2Old) this.srvWalking = speed > (this.srvWalking ? 0.08 : 0.15); else this.srvWalking = false;
    { const y0 = this.yaw; this.yaw = dampAngle(this.yaw, yawT, between ? 5 : serverWait && !globalThis.__srvWalk2Old ? 12 : live && !globalThis.__turnFastOld && Math.abs(yawT) > Math.abs(this.yaw) ? 13 : 9, dt);   /* (into the turn to run as quickly as hips turn; back out of it at the old pace) */
      // (out of play, turning round no faster than a man pivots on his feet, about five degrees a frame: stopping on his mark to
      // serve, the way he was walking at a tenth of a metre a second swung about, and the body and both feet with it went round a
      // hundred degrees in five frames, a foot thrown 27 cm in one)
      // (and in play, as a stroke comes on, out of the turn to run at the shoulders' pace, about seven degrees a frame: let go of
      // in a frame as the stroke took over, a sprinting man's body spun fifty degrees in three frames to face the net, every hand
      // target swung round with it, and the arm went through his chest and the racket was flung over)
      const outPlay = m.phase !== 'live' && m.phase !== 'toss', strokeIn = !outPlay && st && st.kind !== 'serve' && st.kind !== 'smash' && sw > 0.02;
      if ((outPlay && !globalThis.__yawCapOld || strokeIn && !globalThis.__yawStrokeCapOld) && dt > 0) { let d = this.yaw - y0; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; const cap = (outPlay ? 5 : 7) * dt; if (Math.abs(d) > cap) this.yaw = y0 + Math.sign(d) * cap; } }
    const tw = (pose.twist || 0) * hs;
    // (fast through a swing; outside one, getting into the stance to serve or to receive, the turn comes on over a fifth of a
    // second: chased at the swing's rate, the server's shoulders swung side-on in a frame as the point began, twenty centimetres)
    // (and in a rushed block, about half the turn, taken at the slower rate: chasing the full turn in the seventh of a second
    // there was, the shoulders swung fifty degrees in six frames and both arms with them)
    const rushK = st && st.__rush ? 1 : 0;
    this.twist = damp(this.twist, tw * (1 - (this.clipW || 0)) * (1 - 0.5 * rushK), lerp(7, lerp(22, 12, rushK), sm((sw - 0.1) / 0.3)), dt);
    // split step: a small hop that lands wide and low
    if (p.split !== this.lastSplit && t - p.split < 0.3) { this.lastSplit = p.split; this.hopT = 0; }
    let hop = 0, hopLand = 0;
    if (this.hopT != null) { this.hopT += dt; const hu = this.hopT / GAIT.hopT, lu = (this.hopT - GAIT.hopT) / GAIT.landT; if (lu >= 1) this.hopT = null; else { hop = hu < 1 ? Math.sin(hu * Math.PI) * GAIT.hop : 0; hopLand = hu >= 1 ? Math.sin(Math.pow(lu, 0.6) * Math.PI) * GAIT.land : 0; } }
    // ---- footwork from how he is speeding up or pulling up ----
    if (dt > 0) { if (this.pvx != null) { this.ax = damp(this.ax, (p.vx - this.pvx) / dt, 14, dt); this.az = damp(this.az, (p.vz - this.pvz) / dt, 14, dt); } this.pvx = p.vx; this.pvz = p.vz; }
    const along = speed > 0.3 ? (this.ax * p.vx + this.az * p.vz) / speed : 0;
    // pulling up hard from a run: the hips go down into a braking stance; the first steps of a run: low and driving
    const brakeK = live && speed > 0.9 ? clamp(-along / 9, 0, 1) : 0, driveK = live && speed < 3.2 ? clamp(along / 9, 0, 1) * (1 - sm((speed - 2.2) / 1.0)) : 0;
    // on clay a player pulling up from a run slides into it: the leading foot glides on with the body
    const clay = !!(m.env && m.env.surf && m.env.surf.key === 'clay');
    if (clay && live && speed > 1.6 && brakeK > 0.22) this.slideT = 0.3; else this.slideT = Math.max(0, (this.slideT || 0) - dt);
    const sliding = this.slideT > 0 && speed > 0.45;
    this.slideFx = null;
    // jump into the serve and the smash
    let jump = 0;
    if (st && (st.kind === 'serve' || st.kind === 'smash') && st.tc != null) { const ju = t - st.tc; if (ju > -0.14 && ju < 0.22) jump = Math.sin((ju + 0.14) / 0.36 * Math.PI) * (st.kind === 'serve' ? 0.13 : 0.10); }
    // which way he is going against the way he faces
    const fa = base - this.yaw, rx = Math.cos(fa), rz = -Math.sin(fa), fx0 = -Math.sin(fa), fz0 = -Math.cos(fa);
    const vR = p.vx * rx + p.vz * rz, vF = p.vx * fx0 + p.vz * fz0;
    this.latK = speed > 1e-3 ? vR / speed : 0; this.fwdK = speed > 1e-3 ? vF / speed : 0;

    // ---- movement: motion capture under the feet, mixed by where he is going ----
    const settling = m.phase === 'over' && m.phaseT < 0.4;            // the point over, he straightens up as he reacts
    const strolling = between || (!live && !settling), serving = !!st && (st.kind === 'serve' || st.kind === 'smash') && sw > 0.2;
    const upright = strolling || serverWait || serving;
    const LP = this.loco.update(dt, vR / H, vF / H, speed / H, upright), go = this.loco.w.go;
    // his own stroke, where one was tracked: the whole body comes from the clip
    const srvSt = !!st && st.kind === 'serve' && (m.phase === 'toss' || st.tc != null);
    let OC = null, clipW = 0, clipWA = 0, cu = u;
    this.ocHoldU = null; this.ocTbU = null;
    if (serverWait) {
      // waiting to serve he already stands as his own serve begins: side-on, the racket hanging, the ball in the other hand
      OC = this.ownClip('serve', 'fh');
      // (the address is the clip's first moment with his feet set apart and uncrossed: Sinner's begins as he steps into
      // place, one foot across the other, and he stood waiting to serve cross-legged)
      if (OC && OC.addrU == null) { OC.addrU = OC.span[0] + 0.02;
        const a0 = OC.F[0], sep0 = ((a0[J.rankle * 3] - a0[J.lankle * 3]) * (a0[J.rhip * 3] - a0[J.lhip * 3]) + (a0[J.rankle * 3 + 2] - a0[J.lankle * 3 + 2]) * (a0[J.rhip * 3 + 2] - a0[J.lhip * 3 + 2])) / (Math.hypot(a0[J.rhip * 3] - a0[J.lhip * 3], a0[J.rhip * 3 + 2] - a0[J.lhip * 3 + 2]) || 1);
        if (sep0 < 0.02) for (let f = 0; f < Math.min(OC.n, Math.round(0.9 * OC.fps)); f++) { const a = OC.F[f], hx = a[J.rhip * 3] - a[J.lhip * 3], hz = a[J.rhip * 3 + 2] - a[J.lhip * 3 + 2], hl = Math.hypot(hx, hz) || 1;
          const sep = ((a[J.rankle * 3] - a[J.lankle * 3]) * hx + (a[J.rankle * 3 + 2] - a[J.lankle * 3 + 2]) * hz) / hl, gap = Math.hypot(a[J.rankle * 3] - a[J.lankle * 3], a[J.rankle * 3 + 2] - a[J.lankle * 3 + 2]);
          if (sep > 0.12 && gap > 0.28) { OC.addrU = OC.span[0] + f / OC.fps; break; } } }
      if (OC) { cu = OC.addrU; this.addrW = damp(this.addrW, 1 - srvWalkK, 7, dt); clipW = this.addrW * (1 - go); }
    } else if (st && (sw > 0.001 || srvSt)) {
      OC = this.ownClip(st.__dk || st.kind, st.wing, st);
      // (a clip tracked only a little way past contact, half a second, is played on into its last moment, slowing into it, and
      // that finish held a moment before it is let go of: faded out over its own last third of a second as before, the
      // finish was never seen at all, the fade began at contact and the racket came round low to the hip from hand-made keys)
      if (OC) { const held = srvSt && this.addrW > 0.5, fo = (0.32 + 0.2 * sm(speed / 3.5)) * (globalThis.__foK ?? (st.kind !== 'serve' && st.kind !== 'smash' && OC.tb == null && FINISH_FADE[(this.look.name || '') + '/' + st.wing] || 1)); /* the finish comes back to ready over a third of a second, not in a snap */
        const e1 = OC.span[1], hold = st.kind === 'serve' || st.kind === 'smash' ? 0 : clamp(0.82 - e1, 0, 0.4), dS = 0.14;
        if (hold > 0) this.ocHoldU = e1 - dS; if (OC.tb != null) this.ocTbU = OC.tb;
        if (hold > 0 && u > e1 - dS) cu = e1 - dS * Math.exp(-(u - (e1 - dS)) / dS);
        const cIn = sm5((u - OC.span[0]) / (st.kind === 'serve' || st.kind === 'smash' ? 0.14 : 0.3)), cOut = 1 - sm5((u - (e1 + hold - fo)) / fo); clipW = held ? Math.max(sw, this.addrW) * cOut : Math.min(sw, cIn, cOut); clipWA = held ? clipW : Math.min(swA, cIn, cOut); }   /* (the least of the three, not their product: two fades at once would go twice as fast) */
      if (OC && OC.tb != null) { const k = 1 - sm5((u - OC.tb) / (OC.tbD || 0.2)); clipW *= k; clipWA *= k; }
      // A stroke that changes part way into one with no tracked swing of its own (a drive turned into a drop shot with
      // the down arrow as the racket goes back): the clip it was playing is let go of over a fifth of a second, not in one
      // frame, while the keys of the new stroke come in (the arms were thrown from one pose to the other at once)
      // (and one turned into a stroke whose clip has not begun yet, a backhand's wind-up re-read as a forehand's further off:
      // the old clip is let go of the same way until the new one starts; dropped, both arms were flung a metre in a frame)
      if (OC && clipW < 0.02 && this.ocSt === st && this.ocLast && this.ocLast !== OC && (this.ocW || 0) > 0.02) { OC = null; clipW = 0; clipWA = 0; }
      if (!OC && st && this.ocSt !== st) { this.ocSt = st; this.ocLast = null; this.ocW = 0; this.ocInT = null; }
      if (!OC && this.ocSt === st && this.ocLast && (this.ocW || 0) > 0.001) {
        if (this.ocLostT == null) this.ocLostT = t;
        const k = 1 - sm5((t - this.ocLostT) / 0.2);
        if (k > 0.001) { OC = this.ocLast; clipW = this.ocW * k; clipWA = (this.ocWA || 0) * k; cu = u; }
        else { this.ocLast = null; this.ocW = 0; this.ocLostT = null; }
      } else if (OC) {
        // (a clip that appears part way through a stroke, a slice turned into a drive as he lets go, comes in over a fifth of a
        // second; it had appeared at full weight in one frame)
        if (this.ocSt === st && !this.ocLast && this.ocInT == null && u > OC.span[0] + 0.2) this.ocInT = t;
        if (this.ocSt !== st) this.ocInT = null;
        if (this.ocInT != null) { const k = sm5((t - this.ocInT) / 0.2); clipW *= k; clipWA *= k; if (k >= 1) this.ocInT = null; }
        // (and one that changes to a stroke with a clip of its own, a forehand run round into a backhand: the old clip's
        // pose is laid over the new one and let go of over a fifth of a second)
        if (this.ocSt === st && this.ocLast && this.ocLast !== OC && (this.ocW || 0) > 0.05) { this.ocFrom = this.ocLast; this.ocFromT = t; this.ocFromD = this.keysSide && t - (this.keysT || -9) < 0.05 ? 0.3 : 0.2; this.ocFromW = this.ocW * (this.ocLostT != null ? 1 - sm5((t - this.ocLostT) / 0.2) : 1); }
        this.ocSt = st; this.ocLast = OC; this.ocW = clipW; this.ocWA = clipWA; this.ocLostT = null; }
    }
    if (!st || st !== this.ocSt) this.ocFrom = null;
    // (out of the address into the toss, the serve clip carries on from the moment the address showed and catches up with the
    // toss's own clock over a third of a second: switched to that clock at once, it skipped the clip's last fifth of a second
    // before the toss, and McEnroe's arms, already moving there, were thrown a quarter of a metre in the first frame)
    if (srvSt && OC && OC.addrU != null) {
      if (this.tossCuSt !== st) { this.tossCuSt = st; this.tossCuOff = this.wasSrvWait ? OC.addrU - cu : 0; this.tossCuT = t;
        // (where the waiting pose comes from later in the clip than the toss begins, the clip goes back to its start: there the body
        // is crossfaded from how it stood, over a fifth of a second, as one stroke into another is; jumped, the feet were thrown
        // fifteen centimetres in the frame the toss began)
        if (!globalThis.__tossXfOld && this.tossCuOff > 0.02 && this.lpLast && this.poseLast) { this.xfT = t; this.xfD = 0.2; this.xfK = 1; this.xfPose = this.poseLast; (this.xfLP || (this.xfLP = new Float32Array(N3))).set(this.lpLast); } }
      const k = 1 - sm5((t - this.tossCuT) / 0.33); if (k > 0.001 && this.tossCuOff < 0) cu = Math.max(OC.span[0], cu + this.tossCuOff * k);
    }
    this.wasSrvWait = serverWait;
    if (!serverWait && !srvSt) this.addrW = 0;
    if (this.dbgOn) { if (sw - (this.swPrevD || 0) > 0.35 && dt > 0) (this.popLog || (this.popLog = [])).push({ t: +t.toFixed(3), from: +(this.swPrevD || 0).toFixed(2), to: +sw.toFixed(2), same: st === this.popSt, isP: st === p.stroke, isLast: st === p.lastStroke, isPrev: st === this.prevSt, kind: st && st.kind, wing: st && st.wing, t0: st && st.t0 != null ? +(t - st.t0).toFixed(3) : null, tc: st && st.tc != null ? +(t - st.tc).toFixed(3) : null, u: +u.toFixed(3), cancelK: +cancelK.toFixed(2), deferIn: +deferIn.toFixed(3), xin: this.xin, ph: m.phase, auto: st && st.auto, done: st && st.done, prev: this.popInfo, dtNow: +dt.toFixed(4), tPrev: this.popT }); this.swPrevD = sw; this.popSt = st; this.popT = +t.toFixed(3); this.popInfo = st ? { kind: st.kind, wing: st.wing, tc: st.tc != null ? +(t - st.tc).toFixed(3) : null, isP: st === p.stroke, isLast: st === p.lastStroke, sw: +sw.toFixed(2), ph: m.phase } : { none: true, ph: m.phase, pS: !!p.stroke, pSdone: p.stroke ? p.stroke.done : null, pStc: p.stroke && p.stroke.tc != null ? +(t - p.stroke.tc).toFixed(3) : null, pSkind: p.stroke ? p.stroke.kind : null }; }
    this.clipW = clipW; this.swNow = sw; if (this.dbgOn) { this.dbgClipS = OC && clipW > 0.001 ? Float32Array.from(sampleAt(OC, cu, this._dbgS || (this._dbgS = new Float32Array(N3)))) : null; this.dbgClipW = clipW; this.dbgClipWA = clipWA; } if (this.dbgOn) this.ocDbg = OC ? { id: OC.id, span: OC.span.map(x => +x.toFixed(2)), cu: +cu.toFixed(2), n: OC.n, pick: st && st.clipPick ? st.clipPick.i + ':' + st.clipPick.sit : '-' } : null;                         // (swNow: read by the transition checks in /tmp tools)
    // the arms: the clip's, except inside a partial clip's contact window
    let armW = clipWA; if (OC && OC.armZone && armW > 0) { const z = OC.armZone, zk = 1 - sm5((cu - (z[0] - 0.14)) / 0.14) * (1 - sm5((cu - z[1]) / 0.14));   /* (the arms go over to the keys and back over a seventh of a second each way, not an eighth of one: a snap at the speed of the swing) */
      // (and over a fifth of a second of real time at least: a serve's clock runs up to half as fast again after the toss to
      // arrive at contact on time, and on it Sampras's arm was handed from his tracked trophy to the keyed racket drop in four
      // frames, the hand thrown eighty centimetres)
      if (this.azSt !== st || !(dt > 0)) { this.azSt = st; this.azK = zk; } else this.azK += clamp(zk - this.azK, -dt / 0.2, dt / 0.2);
      armW *= this.azK; }
    // (the legs of a shot hit on the move are the run's: the clip's feet were planted for the man it was filmed on, whose
    // hips went where his did, and played under a body going somewhere else they slid away under him and were stepped back
    // under him every twenty centimetres, six patting steps a second through every shot hit on the run; the upper body and
    // the turn are the stroke's)
    // (and out of a serve or an overhead once he has landed: the game walks him back to the baseline while the tracked landing
    // is still playing, and on its feet, neither of them down, he glided backwards a metre)
    const srvLand = st && (st.kind === 'serve' || st.kind === 'smash') ? (st.tc != null ? sm((t - st.tc - 0.3) / 0.15) : 0) : 1;
    const isSrvK = !!st && (st.kind === 'serve' || st.kind === 'smash');
    // (all of it at a run: with a sixth of the leg pose still the stroke's planted stance, which does not travel with him, the planted
    // foot fell out of step with the stride and was left behind, then caught up in a slow step, both legs trailing him sideways)
    const legRun = this.legRunNow = clipW > 0.001 ? (globalThis.__lrOld ? 0.85 : lerp(0.85, 1, sm((speed - 2.4) / 1.2))) * sm((speed - (isSrvK ? 0.5 : 1.3)) / (isSrvK ? 1.0 : 1.7)) * go * srvLand : 0;
    if (legRun > 0.001) { const LL = this._locoLegs || (this._locoLegs = new Float32Array(18)); let q = 0; for (const j of LEG_RUN_J) for (let c = 0; c < 3; c++) LL[q++] = LP[j * 3 + c]; }
    if (clipW > 0.001) {
      // (the upper body mixed at a common heading: the two poses' shoulder lines are turned about the hips to the heading part
      // way between theirs, then blended. Mixed straight, where a finish wraps the trunk round more than a quarter turn from the
      // pose it hands back to, the blended shoulder line shrank and spun, and the chest, both arms with it, turned a hundred
      // degrees in two frames as Nadal's backhand let go into his run)
      const runHip = Math.atan2(LP[J.rhip * 3 + 2] - LP[J.lhip * 3 + 2], LP[J.rhip * 3] - LP[J.lhip * 3]);
      mixUpper(LP, sampleAt(OC, cu, this.SP), clipW, this);
      if (legRun > 0.001) { const LL = this._locoLegs; let q = 0; for (const j of LEG_RUN_J) for (let c = 0; c < 3; c++) { LP[j * 3 + c] = lerp(LP[j * 3 + c], LL[q++], legRun * clipW); }
        // (and the hips go with the run, the shoulders keeping most of the stroke's turn: running in to a ball with the racket
        // taken back, a player runs with his hips to the ball and his shoulders turned. With the clip's hips, side-on for the
        // take-back, over legs running forward, the thighs swung across under him and he ran at the ball in a sideways gallop.)
        if (!globalThis.__noHipRun) { const ch = Math.atan2(LP[J.rhip * 3 + 2] - LP[J.lhip * 3 + 2], LP[J.rhip * 3] - LP[J.lhip * 3]);
          const d = Math.atan2(Math.sin(runHip - ch), Math.cos(runHip - ch)) * legRun * clipW;
          if (Math.abs(d) > 1e-3) { const cx = (LP[J.lhip * 3] + LP[J.rhip * 3]) / 2, cz = (LP[J.lhip * 3 + 2] + LP[J.rhip * 3 + 2]) / 2;
            const rot = (j, a) => { const c = Math.cos(a), sn = Math.sin(a), x = LP[j * 3] - cx, z = LP[j * 3 + 2] - cz; LP[j * 3] = cx + x * c - z * sn; LP[j * 3 + 2] = cz + x * sn + z * c; };
            rot(J.lhip, d); rot(J.rhip, d); const du = d * (globalThis.__hipRunUp ?? 0.35); for (const j of UPPER_J) rot(j, du); } } }
      if (this.ocFrom) { const k = (1 - sm5((t - this.ocFromT) / (this.ocFromD || 0.2))) * this.ocFromW; if (k > 0.001) mixUpper(LP, sampleAt(this.ocFrom, cu, this.SP2 || (this.SP2 = new Float32Array(N3))), k, this.ocMu || (this.ocMu = {})); else { this.ocFrom = null; if (this.ocMu) this.ocMu.muD = null; } }
      // bouncing the ball: the hand that holds it goes down with each bounce
      if (serverWait && this.bounceDy) { const o = hs > 0 ? [J.lwri, J.lhand] : [J.rwri, J.rhand]; for (const j of o) LP[j * 3 + 1] += this.bounceDy * clipW; }
    }
    if (!(clipW > 0.001)) this.muD = null;
    if ((this.xfK || 0) > 0.001) mix(LP, this.xfLP, this.xfK);
    (this.lpLast || (this.lpLast = new Float32Array(N3))).set(LP);
    this.gait = this.loco.phF;
    // ---- making room for a ball at the body ----
    // A ball that comes in at him, closer than a comfortable reach, is met by moving the body out of its way, not by bringing
    // the racket in to it: a step across and a lean away through the wind-up, so it is met out at the side, then back. (The
    // swing was moved bodily onto the ball instead: the racket keeps its angle, so the hand went to where the head would have
    // been, inside his chest, and the arm folded up across it with the racket beside his head.) The game's own place for him
    // is unchanged; this is where the body is drawn, at most a third of a metre from it.
    let roomT = 0, roomFT = 0;
    if (st && !/^(serve|smash|volley|block)$/.test(st.__dk || st.kind) && !this.posed && sw > 0.01 && !globalThis.__noRoom) {
      const cpR = st.tc != null ? this.cpGone(st, p, t) : st.cpPlan;
      if (cpR) { const side = (st.wing === 'fh' ? 1 : -1) * hs, L = ((cpR.x - p.x) * rx + (cpR.z - p.z) * rz) * side;
        // (and a ball let get level with him or past him is taken by stepping back from it, so it is still met a little in front)
        const Zc = (cpR.x - p.x) * fx0 + (cpR.z - p.z) * fz0;
        roomFT = -clamp(0.3 - Zc, 0, 0.4) * sm5((u + 0.55) / 0.35) * (1 - sm5((u - 0.12) / 0.4)) * sw;
        const wR = sm5((u + 0.55) / 0.35) * (1 - sm5((u - 0.12) / 0.4));
        // (more for a ball on the far side of him, taken on this wing all the same: he steps round it, as for an inside-out
        // forehand, rather than meeting it with the arm folded across his chest)
        roomT = -side * clamp(0.62 - L, 0, lerp(0.34, 0.55, sm((0.12 - L) / 0.3))) * wR * sw; }
    }
    this.roomX = this.inited && dt > 0 ? ease(this, 'roomE', roomT, 11, dt) : (this.roomE = roomT, this.roomEV = 0, roomT);
    this.roomF = this.inited && dt > 0 ? ease(this, 'roomFE', roomFT, 11, dt) : (this.roomFE = roomFT, this.roomFEV = 0, roomFT);
    const px = p.x + rx * this.roomX + fx0 * this.roomF, pz = p.z + rz * this.roomX + fz0 * this.roomF;
    const F = this.frame; F.position.set(px, 0, pz); F.rotation.set(0, base - this.yaw, 0); F.updateMatrixWorld(true);
    const fwd = _v1.set(0, 0, -1).applyQuaternion(F.quaternion), right = _v2.set(1, 0, 0).applyQuaternion(F.quaternion);
    this.fwd.copy(fwd);
    const qYaw = F.quaternion, air = (hop + jump) * H;
    // body-space → world
    const W = (x, y, f, out) => out.set(px, 0, pz).addScaledVector(right, x * H).addScaledVector(fwd, f * H).setY(y * H + air * 0.9);
    // a joint of the clip, and directions between joints turned into the world
    const cdir = (a, b, out) => out.set(0, 0, 0).addScaledVector(right, LP[b * 3] - LP[a * 3]).addScaledVector(UP, LP[b * 3 + 1] - LP[a * 3 + 1]).addScaledVector(fwd, LP[b * 3 + 2] - LP[a * 3 + 2]).normalize();
    const seg = (a, b) => Math.hypot(LP[b * 3] - LP[a * 3], LP[b * 3 + 1] - LP[a * 3 + 1], LP[b * 3 + 2] - LP[a * 3 + 2]);
    // the clip's legs against this body's: everything below the hips is scaled by that
    const legC = (seg(J.lhip, J.lknee) + seg(J.lknee, J.lankle) + seg(J.rhip, J.rknee) + seg(J.rknee, J.rankle)) / 2, r = (D.thigh + D.shank) / legC;
    const hmx = (LP[J.lhip * 3] + LP[J.rhip * 3]) / 2, hmy = (LP[J.lhip * 3 + 1] + LP[J.rhip * 3 + 1]) / 2, hmz = (LP[J.lhip * 3 + 2] + LP[J.rhip * 3 + 2]) / 2;
    // hips: at the clip's height, or where the stroke wants them (low to load, rising through the ball)
    const strokeK = Math.max(sw * (1 - 0.55 * go), (pose.set || 0) * (1 - go)) * (1 - clipW), clipY = (hmy - ANKLE_H) * r + D.ankle;
    let wantY = lerp(clipY, D.hipY - (pose.crouch || 0) * H, strokeK) - hopLand * H - (brakeK * 0.08 + driveK * 0.05 + (sliding ? 0.07 : 0)) * H;
    if (this.dbgOn) this.hipDbg = { clipY: +clipY.toFixed(3), hmy: +hmy.toFixed(3), r: +r.toFixed(3), legC: +legC.toFixed(3), strokeK: +strokeK.toFixed(2), crouch: +(pose.crouch || 0).toFixed(3), base: +wantY.toFixed(3), metW: +(this.metW || 0).toFixed(2), metCpY: this.metCpY != null ? +this.metCpY.toFixed(2) : null, hipY: +D.hipY.toFixed(3), clipW: +clipW.toFixed(2) };
    // a low ball is played from the legs, not by dropping the racket: through the swing the hips go down with
    // the height of the contact (knees bent, back still upright), as far as about a third of a metre
    // (how much lower than his own swing meets it, from last frame's measure of that: the legs take nearly half of it, to
    // about a quarter of a metre; the arm reaches the rest)
    // (by how low the ball really is, below a waist-high 0.88 m, not by how far below the clip's own contact it is: the
    // clips were filmed with chest-high practice balls, and measured against them every ordinary ball looked low and every
    // player squatted to the floor on every shot)
    // (and he comes up out of it through the shot, as the legs drive: kept down until the arm's own shift let go, half a second
    // after contact, he sat in a deep squat through the whole finish)
    if (st && st.kind !== 'serve' && st.kind !== 'smash' && this.metW > 0 && this.metCpY != null) {
      const upK = st.tc != null ? 1 - sm5((t - st.tc + 0.02) / 0.3) : 1;
      wantY -= this.metW * upK * clamp((0.88 - this.metCpY) * 0.42, 0, 0.17);
    }
    // and never so low that a knee goes down to the court: a deep lunge has the hips at about two thirds of their standing height
    // (and that only in a real stretch or for a ball down at the shins: an ordinary stroke keeps the hips at three quarters of
    // their height. The slice's crouch, a lowish ball and the stance reaching both feet added up, and Djokovic sat through his
    // slice take-back on an invisible stool, hips at two thirds of their height, chest upright)
    const deepK = Math.max(this.plW || 0, this.metCpY != null && this.metW > 0.2 ? sm((0.5 - this.metCpY) / 0.25) : 0);
    this.hipFloor = st && st.kind !== 'serve' && st.kind !== 'smash' ? D.hipY * (globalThis.__floorOld ? 0.64 : lerp(0.75, 0.68, deepK)) : D.hipY * 0.6;
    if (st && st.kind !== 'serve' && st.kind !== 'smash') wantY = Math.max(wantY, this.hipFloor);
    // waiting in a rally he is never still: a small bounce on the balls of the feet and a weight shift side to side
    const readyW = (1 - go) * (1 - strokeK) * (live && !strolling && !serverWait ? 1 : 0);
    if (readyW > 0.001) { const ph = t * 2.1 * Math.PI * 2 + this.breath; wantY -= readyW * 0.014 * H * (0.5 + 0.5 * Math.sin(ph)); this.sway = Math.sin(t * 1.3 + this.breath) * 0.022 * H * readyW; } else this.sway = 0;
    // ---- a stretch: planted into a wide ball ----
    // A ball he has run wide for is met off a planted, wide stance: the foot on the side he is running to goes out ahead of
    // him and takes the weight, its knee bent over it, and the other leg is left stretched out behind as the body comes on over
    // the front foot; then he pushes off it back the way he came. (Met on the run's own stride, the feet came together under
    // him at contact or the stride crossed them, and he sank onto the trailing leg with the other one reaching for the ball.)
    let plW = 0;
    if (this.plSt !== st) { this.plSt = st; this.pl = null; }
    if (this.pl && this.pl.placedT !== this.placedT) this.pl = null;
    // (begun only in play; once begun it is let go of in its own time, not dropped in a frame as the point ends)
    if (st && st.tc != null && !/^(serve|smash)$/.test(st.kind) && !this.posed && !globalThis.__noPlant) {
      const uP = t - st.tc;
      // (a run mostly across the court: one mostly forward, to a short ball, is met in its stride)
      if (!this.pl && live && dt > 0 && uP > -0.42 && uP < -0.2 && Math.abs(vR) > 1.5 && Math.abs(vR) > 0.7 * speed) {
        const sd = vR >= 0 ? 1 : -1, lead = vR >= 0 ? 1 : 0;
        this.pl = { lead, lx: right.x * sd, lz: right.z * sd, P: [null, null], force: [false, false], landed: false, go: false, placedT: this.placedT };
      }
      const pl = this.pl;
      if (pl) {
        // The plant is one quick step, the last of the run: the front foot is left to the run's own stride until three tenths
        // of a second out, then put down in a sixth of a second where the body will be as it meets the ball, a little beyond
        // it. (Sent there as soon as the stretch was decided, it went down a metre ahead of a body still running at nearly four
        // metres a second: from behind he was in the splits for a third of a second, the back leg swinging up behind him.)
        if (!pl.go && uP >= -0.3) {
          pl.go = true;
          const pr = p.prof || {}, aB = (pr.accel || 6.8) * (pr.brake || 1.35), tau = Math.max(0, -0.13 - uP), dS = speed > 0.05 ? Math.min(speed * tau, 0.8 * speed * speed / (2 * aB)) : 0;
          const bx = p.x + (speed > 0.05 ? p.vx / speed * dS : 0), bz = p.z + (speed > 0.05 ? p.vz / speed * dS : 0);
          pl.P[pl.lead] = { x: bx + pl.lx * 0.2 * H + fwd.x * 0.03 * H, z: bz + pl.lz * 0.2 * H + fwd.z * 0.03 * H };
          pl.force[pl.lead] = true;
          const Lk = this.lockF[pl.lead], ft = this.feet[pl.lead];
          Lk.step = { t: 0, x: Lk.step ? ft.p.x : Lk.on ? Lk.x : ft.p.x, z: Lk.step ? ft.p.z : Lk.on ? Lk.z : ft.p.z, fast: true }; Lk.on = false;
        }
        if (pl.go) {
          plW = 1 - sm((uP - 0.2) / 0.22);
          // (and let go of quickly once he moves off again: after the ball, the game has him on his way back at once, and held
          // down through the finish both feet were slid along the court under a body already running; or if he does not stop
          // over it at all)
          if (pl.relT == null && uP > 0.02 && pl.landed && -(p.vx * pl.lx + p.vz * pl.lz) > 0.5) pl.relT = t;
          if (pl.relT != null) plW = Math.min(plW, 1 - sm((t - pl.relT) / 0.12));
          if (!pl.landed) { const Lk = this.lockF[pl.lead]; if (Lk.on && !Lk.step && Math.hypot(Lk.x - pl.P[pl.lead].x, Lk.z - pl.P[pl.lead].z) < 0.08 * H) { pl.landed = true; pl.P[pl.lead] = { x: Lk.x, z: Lk.z }; } }
        }
      }
    }
    this.plW = plW;
    // feet: where the clip puts each ankle over the ground, moved by the stroke's own footwork
    const hitI = hs > 0 ? 1 : 0;
    // Walking, shuffling or standing, the feet are set a shoe's width and a little apart, each on its own side: the walking
    // clips put one foot in front of the other on a single line, a catwalk, and the shoes brushed and overlapped as they passed.
    // (Not running flat out, where the feet do land near a line with the swinging knee high; not a sideways crossover, a step
    // across on purpose; not inside a stroke, whose footwork is the stroke's.)
    const widen = this.widenOff || (this.widenOff = [0, 0]); widen[0] = widen[1] = 0;
    if (!globalThis.__widenOld) { const jaL = LEG_J[0][2], jaR = LEG_J[1][2], kL = 1 + 0.15 * clipW, gap = (LP[jaR * 3] - LP[jaL * 3]) * r * kL, minW = (globalThis.__stepW ?? 0.15) * H;
      const vL = p.vx * right.x + p.vz * right.z, vF = p.vx * fwd.x + p.vz * fwd.z, sideK = speed > 0.3 ? Math.abs(vL) / speed : 0;
      const wK = (1 - sm((speed - 2.2) / 1.4)) * (1 - sm((sideK - 0.55) / 0.25)) * (1 - strokeK) * (1 - (globalThis.__widenSrvOld ? (srvSt ? 1 : 0) : (this.wSrvE = this.inited && dt > 0 ? (this.wSrvE || 0) + ((srvSt ? 1 : 0) - (this.wSrvE || 0)) * (1 - Math.exp(-dt * 14)) : (srvSt ? 1 : 0)))); void vF;   /* (let go of over a tenth of a second as the serve begins: dropped in a frame, a foot was moved ten centimetres as the toss began) */
      // (the weight itself eased over a tenth of a second: how sideways he is going counts from a third of a metre a second, and
      // crossing that it went from nothing to all, the stance's width dropped and a foot moved fourteen centimetres in a frame)
      const wKr = wK; let wKe = wKr; if (!globalThis.__widenEaseOld) { wKe = this.inited && dt > 0 && this.wKE != null ? this.wKE + (wKr - this.wKE) * (1 - Math.exp(-dt * 14)) : wKr; this.wKE = wKe; }
      if (wKe > 0.001 && gap < minW) { const d = (minW - Math.max(gap, -minW)) * 0.5 * wKe; widen[0] = -d; widen[1] = d; } }
    // (and wherever both feet are at or near the court, their places are never closer than a shoe and a little: McEnroe's
    // serving stance, feet in line along the baseline, had them four centimetres apart, one shoe inside the other. They are
    // set apart along the line between them, so the stance keeps its shape. A foot already planted is not moved: this sets
    // where it comes down.)
    const sepO = this.sepOff || (this.sepOff = [V(), V()]); sepO[0].set(0, 0, 0); sepO[1].set(0, 0, 0);
    if (!globalThis.__footSepOld) { const tg = [0, 1].map(i => { const ja = LEG_J[i][2]; return _sfT[i].set(px, 0, pz).addScaledVector(right, LP[ja * 3] * r * (1 + 0.15 * clipW) + widen[i]).addScaledVector(fwd, LP[ja * 3 + 2] * r); });
      const lowK = (1 - sm(((LP[LEG_J[0][2] * 3 + 1] - ANKLE_H) * r - 0.06 * H) / (0.05 * H))) * (1 - sm(((LP[LEG_J[1][2] * 3 + 1] - ANKLE_H) * r - 0.06 * H) / (0.05 * H))) * (1 - sm((speed - 2.2) / 1.4));
      const dx = tg[1].x - tg[0].x, dz = tg[1].z - tg[0].z, d = Math.hypot(dx, dz), mnS = (globalThis.__footMin ?? 0.17) * H;
      if (lowK > 0.001 && d < mnS) { let ux = dx, uz = dz; if (d < 0.02 * H) { ux = right.x; uz = right.z; } const ul = Math.hypot(ux, uz) || 1, k = (mnS - d) * 0.5 * lowK; sepO[0].set(-ux / ul * k, 0, -uz / ul * k); sepO[1].set(ux / ul * k, 0, uz / ul * k); } }
    for (let i = 0; i < 2; i++) {
      const sx = i === 0 ? -1 : 1, ja = LEG_J[i][2], ft = this.feet[i], ankle = _an[i].set(px, 0, pz).addScaledVector(right, LP[ja * 3] * r * (1 + 0.15 * clipW) + widen[i]).addScaledVector(fwd, LP[ja * 3 + 2] * r).add(sepO[i]);   // (tracked clips come out narrow in the feet: lifting video to 3D squeezes the spread)
      ankle.y = Math.max(D.ankle, (LP[ja * 3 + 1] - ANKLE_H) * r + D.ankle) + air * 0.9;
      if (this.dbgOn) (this.dbgFt || (this.dbgFt = {}))['a' + i] = [+(ankle.x - px).toFixed(3), +(ankle.z - pz).toFixed(3)];
      // after the serve the back leg kicks up behind for balance, bent, the foot about knee high: the tracked clip
      // flings it to hip height, so a lift above a quarter metre is eased down (softly, so the arc keeps its shape)
      // and it comes down again soon after, to step through, rather than hanging up behind him
      // (the back leg's kick after a serve goes back, not out sideways: the tracked landing sweeps it nearly half a metre out to
      // the side, and from behind he landed in the splits, the body leaning away from it)
      if (srvSt && clipW > 0.01 && st.tc != null) { const su = t - st.tc, kw = sm((su - 0.02) / 0.1) * (1 - sm((su - 0.75) / 0.25)) * clipW;
        if (kw > 0.001) { const lat = LP[ja * 3] - hmx, mx = 0.2; if (Math.abs(lat) > mx) ankle.addScaledVector(right, -Math.sign(lat) * (Math.abs(lat) - mx) * 0.7 * kw * r); } }
      if (srvSt && clipW > 0.01) { const su = st.tc != null ? t - st.tc : -1, cap = (0.24 - 0.17 * sm((su - 0.28) / 0.25)) * H, lf = ankle.y - D.ankle; if (lf > cap) ankle.y = D.ankle + cap + (lf - cap) * 0.35 * (1 - sm((su - 0.28) / 0.25)); }
      // A groundstroke clip is one shot, filmed once: whatever the feet did in it (Alcaraz's backhand kicks the back leg up
      // to the knee, the counterweight of a ball hit on the run) would happen on every shot. A foot leaves the court only as
      // far as this shot asks: a small lift standing, the clip's whole kick when he is running or stretched for it.
      else if (clipW > 0.01 && st && st.kind !== 'serve' && st.kind !== 'smash') {
        const runK = Math.max(sm((speed - 1.8) / 2.6), st.onRun ? 0.6 : 0), cap = (0.09 + 0.6 * runK * runK) * H, lf = ankle.y - D.ankle;
        // (not on the running stride laid under a shot hit on the move: capped, its swing foot was held a hand's breadth off the
        // court and dragged forward along it, both feet down at once for a fifth of the time he ran)
        const cK = clipW * (1 - (this.legRunNow || 0));
        if (lf > cap) ankle.y = D.ankle + cap + (lf - cap) * (0.1 + 0.4 * runK) * cK + (lf - cap) * (1 - cK);
      }
      if (strokeK > 0.01) {
        const mine = (i === hitI), fo = (mine ? pose.footR : pose.footL) || Z2, heel = (mine ? pose.heelR : pose.heelL) || 0;
        ankle.addScaledVector(right, (sx * Math.max(0, (pose.stance || 0.3) - 0.34) + fo[0] * hs) * H * strokeK).addScaledVector(fwd, fo[1] * H * strokeK);
        ankle.y += heel * H * strokeK; this.heel[i] = heel * strokeK;
      } else this.heel[i] = 0;
      // the split step lands wider than it took off
      // (and let go of over a tenth of a second when the hop's time is up: dropped in a frame, the feet were pulled thirteen
      // centimetres in, a foot thrown that far as he set off from the split)
      { const want = this.hopT != null ? sm(this.hopT / GAIT.hopT) : 0; if (i === 0) this.hopW = globalThis.__hopWOld || !this.inited || dt <= 0 || want >= (this.hopW || 0) ? want : this.hopW + (want - this.hopW) * (1 - Math.exp(-dt * 16));
        if ((this.hopW || 0) > 1e-4) ankle.addScaledVector(right, sx * 0.07 * H * this.hopW); }
      // sliding, the leading foot reaches out wide and glides on with the body
      const slideLead = sliding && i === (vR >= 0 ? 1 : 0);
      // (eased in and out over a tenth of a second, not set and cleared in a frame as a slide begins, ends or changes side)
      { const sw2 = this.slideW || (this.slideW = [0, 0]); sw2[i] = globalThis.__slideWOld || !this.inited || dt <= 0 ? (slideLead ? 1 : 0) : sw2[i] + ((slideLead ? 1 : 0) - sw2[i]) * (1 - Math.exp(-dt * 16));
        if (sw2[i] > 1e-4) ankle.addScaledVector(right, sx * 0.10 * H * sw2[i]); }
      if (this.dbgOn) (this.dbgFt || (this.dbgFt = {}))['k' + i] = [+(strokeK || 0).toFixed(2), this.hopT != null ? +this.hopT.toFixed(3) : null, slideLead ? 1 : 0, sliding ? 1 : 0];
      // a foot on the ground stays where it is; when the body has gone too far from it, it steps
      // (a foot that leaves the ground is let go of gradually, from where it stood to where the clip has it,
      // and it counts as down a little below the height it counts as up, so it does not catch and let go)
      // (at every speed: above 3.2 m/s a foot used to go where the running clip had it, and as the clip's stride never
      // quite matched his real speed and direction, a foot on the court slid along under him at nearly running pace; the
      // step it takes when the body has got too far from it is further the faster he goes, a sprinter's stance covering
      // half a metre)
      // (a foot up on its toes, the heel lifted, is still on the court: pushing off it or pivoting on it after a shot, the toe
      // stays where it is; counted by its ankle alone it was off the ground, and the toe was carried along the court with the
      // body for a third of a second, a man gliding on tiptoe out of every forehand hit on the move)
      if (plW > 0.001) { const pl = this.pl, L0 = this.lockF[i];
        // (the trailing foot stays where it last came down, if that is behind him and inside a leg's reach of where he pulls up;
        // otherwise it is put there)
        // (judged from where the front foot came down: a stance between a third and three quarters of a metre wide is kept)
        if (i !== pl.lead && pl.landed && !pl.P[i] && !pl.gone && L0.on && !L0.step) { const PL = pl.P[pl.lead], lat = (L0.x - PL.x) * pl.lx + (L0.z - PL.z) * pl.lz;
          if (lat < -0.32 * H && lat > -0.75 * H) pl.P[i] = { x: L0.x, z: L0.z };
          else { pl.P[i] = { x: PL.x - pl.lx * 0.5 * H - fwd.x * 0.05 * H, z: PL.z - pl.lz * 0.5 * H - fwd.z * 0.05 * H }; pl.force[i] = true; } }
        // (a body that comes on past its front foot pushes it on along the court with him, a slide; and pulls the trailing foot
        // after him once he is a leg's length past it, dragged on its toe)
        if (dt > 0 && pl.landed && pl.P[i]) { const L1 = this.lockF[i], vl = p.vx * pl.lx + p.vz * pl.lz;
          if (L1.on && !L1.step) { const lat = (L1.x - px) * pl.lx + (L1.z - pz) * pl.lz, lim = i === pl.lead ? 0.12 * H : -0.42 * H;
            let k = i === pl.lead ? (vl > 0 ? lim - lat : 0) : lim - lat;
            // (the front foot slides at most a little under a metre a second; a body getting a fifth of his height past it has not
            // stopped, and the plant is let go of)
            if (i === pl.lead && k > 0) { if (lat < -0.1 * H && pl.relT == null) pl.relT = t; k = Math.min(k, 0.9 * dt); }
            // (the trailing foot, left a leg's length behind by a body still going, is not dragged after him along the court: it is
            // let go of and steps after him)
            if (i !== pl.lead && k > 0) { pl.P[i] = null; pl.gone = true; k = 0; }
            if (k > 0) { pl.P[i] = { x: pl.P[i].x + pl.lx * k, z: pl.P[i].z + pl.lz * k }; L1.x += pl.lx * k; L1.z += pl.lz * k; } } }
        const P = pl.P[i]; if (P) { ankle.x = lerp(ankle.x, P.x, plW); ankle.z = lerp(ankle.z, P.z, plW); ankle.y = lerp(ankle.y, D.ankle, plW); }
      }
      { const Lk = this.lockF[i], hgt = ankle.y - D.ankle, toeY = LP[LEG_J[i][3] * 3 + 1], toeDown = toeY < (Lk.on ? 0.062 : 0.05) && hgt < 0.13 * H && speed < 1.6 && go < 0.6,   /* (not in a running stride: there the toe is down only at the push-off, and held to it the foot stuck behind him, a speed-walk) */
        // (at a walk or a shuffle a foot a few centimetres up in the clip is a foot set down, not a step: counted as in the air it
        // hovered there, and with the other foot stepping, both were off the court together)
        slowK = globalThis.__noSlowDown ? 0 : (1 - sm((speed - (globalThis.__skOld ? 1.8 : 1.2)) / (globalThis.__skOld ? 1.4 : 1.0))) * (1 - this.loco.w.up) * (strolling ? 0 : 1),   /* (not at a shuffle's pace: its steps are that low, and held down as planted the trailing foot was towed after him) */   /* (not walking upright between points: there the walk's own swing foot dips that low, and held down it was dragged into a lunge at every step) */
        down = (hgt < ((Lk.on ? 0.042 : 0.03) + 0.045 * slowK) * H || (globalThis.__toeLock !== false && toeDown)) && air < 0.005, engage = true, stepD = plW > 0.001 && this.pl.force[i] ? 0.06 * H : Math.abs(this.roomX) > 0.05 && Math.sign(this.roomX) === (i === 0 ? -1 : 1) ? 0.09 * H : (0.19 + 0.09 * clamp(speed - 2, 0, 4)) * H;
        if (Lk.step) {
          // (a step that goes further is lifted higher and takes a little longer: a foot carried a few centimetres off the
          // court across half a metre read as a foot sliding along it)
          const sd = Lk.step.d != null ? Lk.step.d : (Lk.step.d = Math.hypot(ankle.x - Lk.step.x, ankle.z - Lk.step.z));
          Lk.step.t += dt / ((Lk.step.fast ? 0.17 : 0.13 + 0.12 * clamp(sd / 0.6, 0, 1)) / (globalThis.__stepOld ? 1 : 1 + 0.3 * clamp(speed - 2, 0, 3)));   /* (quicker at speed: a step as slow as a walking one, the body ran half a metre on while the foot was still on its way) */ const w = sm(Math.min(1, Lk.step.t));
          ankle.x = lerp(Lk.step.x, ankle.x, w); ankle.z = lerp(Lk.step.z, ankle.z, w); ankle.y = Math.max(ankle.y, D.ankle + Math.sin(w * Math.PI) * (0.055 + 0.11 * clamp(sd / 0.5, 0, 1)) * H);
          // (and set down once it is down, in the last tenth of the step: carried on to the step's own end, a foot already on the
          // court followed the clip's ankle as it drifted, two or three centimetres a frame along the court)
          if (Lk.step.t >= 1 || (!globalThis.__stepEndOld && Lk.step.t >= 0.88 && down && ankle.y - D.ankle < 0.012 * H)) { Lk.step = null; Lk.on = down; const lpo = !globalThis.__landDrawnOld && down && this.lpOff ? this.lpOff[i] : null; Lk.x = ankle.x + (lpo ? lpo.x : 0); Lk.z = ankle.z + (lpo ? lpo.z : 0); if (lpo) { ankle.x = Lk.x; ankle.z = Lk.z; } Lk.ox = Lk.oz = 0; Lk.ox0 = Lk.oz0 = 0; }
        } else if (down && engage) {
          if (!Lk.on) { const lpo = !globalThis.__landDrawnOld && this.lpOff ? this.lpOff[i] : null; Lk.on = true; Lk.x = ankle.x + (Lk.ox || 0) + (lpo ? lpo.x : 0); Lk.z = ankle.z + (Lk.oz || 0) + (lpo ? lpo.z : 0); Lk.ox = Lk.oz = 0; Lk.ox0 = Lk.oz0 = 0; }
          if (slideLead) { Lk.x += p.vx * dt * 0.95; Lk.z += p.vz * dt * 0.95; this.slideFx = { x: Lk.x, z: Lk.z, vx: p.vx, vz: p.vz, speed }; }
          const e = Math.hypot(ankle.x - Lk.x, ankle.z - Lk.z);
          // (and a foot planted across the other, or almost on top of it, out of a stroke: a serve that lands with the back
          // leg swung through stood on cross-legged until he next moved; he steps it back out to where it belongs)
          let crossed = false;
          if (i === 1 && strokeK < 0.3 && !srvSt && this.lockF[0].on && !this.lockF[0].step) { const o = this.lockF[0], sep = (Lk.x - o.x) * right.x + (Lk.z - o.z) * right.z; crossed = sep < 0.06 * H; }
          // (and planted almost on top of each other, a shoe inside the other, it steps out to its place, wherever it is)
          if (!globalThis.__footSepOld && !crossed && !(srvSt && st.tc != null)) { const o = this.lockF[1 - i]; if (o.on && !o.step && Math.hypot(Lk.x - o.x, Lk.z - o.z) < (globalThis.__footStepMin ?? 0.12) * H) crossed = true; }
          // (a catch-up step waits for the other foot to be down, unless it is well overdue: started while the other was still in
          // the air, both feet were off the court together at a backpedal's pace)
          const oth = this.lockF[1 - i], othDown = oth.on || globalThis.__noWaitStep;
          if (!slideLead && (e > stepD || (crossed && e > (globalThis.__footSepOld ? 0.04 : 0.025) * H)) && !oth.step && (othDown || e > stepD * 1.6 || (plW > 0.001 && this.pl.force[i]))) { Lk.step = { t: 0, x: Lk.x, z: Lk.z }; Lk.on = false; this.forcedSteps = (this.forcedSteps || 0) + 1; if (e > stepD) this.forcedE = (this.forcedE || 0) + 1; else this.forcedX = (this.forcedX || 0) + 1; if (this.dbgSteps) this.dbgSteps.push({ t: +t.toFixed(2), i, e: +e.toFixed(2), stepD: +stepD.toFixed(2), sp: +speed.toFixed(2), ph: m.phase, sk: +strokeK.toFixed(2), st: st ? st.kind : '-', yaw: +this.yaw.toFixed(2), dx: +(ankle.x - Lk.x).toFixed(2), dz: +(ankle.z - Lk.z).toFixed(2), px: +(p.x - (this.lastStepPx ?? p.x)).toFixed(2), pz: +(p.z - (this.lastStepPz ?? p.z)).toFixed(2), hop: this.hopT != null, u: st && st.tc != null ? +(t - st.tc).toFixed(2) : null, cw: +clipW.toFixed(2), sw: +sw.toFixed(2), go: +go.toFixed(2), lr: +(this.legRunNow || 0).toFixed(2), srv: m.score.server === p.i, phT: +(m.phaseT || 0).toFixed(2), sk: +strokeK.toFixed(2), clipF: +((LP[LEG_J[i][2] * 3] * right.x + 0) ).toFixed(2) }); this.lastStepPx = p.x; this.lastStepPz = p.z; }
          ankle.x = Lk.x; ankle.z = Lk.z;
          // (and on it: a foot counted down is held at its place on the court, but its height was left to the clip, which counts
          // anything up to four centimetres as down; held there it hovered, and at a backpedal or pulling up both feet were seen
          // off the court together. A flat foot is pressed onto the court; one up on its toes keeps its heel up, the toe on the
          // court, below.)
          Lk.toe = !(hgt < ((0.042 + 0.045 * slowK) * H)) && !globalThis.__noPress;
          if (!Lk.toe && !globalThis.__noPress) { const hh = (this.heel[i] || 0) * H, ex = ankle.y - D.ankle - hh; if (ex > 0) ankle.y = D.ankle + hh + ex * 0.25; }
        } else {
          // (the gap is closed from rest, critically damped: a foot leaving the ground does not jerk off its mark; and a foot that
          // has been left far behind by a running body is picked up and carried forward as a step, in an arc, not drawn along
          // the court to where the stride has it)
          // (and the step begins where the foot is, this frame too: left at the stride's place for the frame it was let go of, a
          // third of a metre on, the foot flashed forward and back before the step set off, plain to see in a slow-motion replay)
          if (Lk.on && Math.hypot(Lk.x - ankle.x, Lk.z - ankle.z) > 0.1 * H && !this.lockF[1 - i].step) { Lk.step = { t: 0, x: Lk.x, z: Lk.z }; Lk.on = false; this.liftSteps = (this.liftSteps || 0) + 1; if (!globalThis.__flashOld) { ankle.x = Lk.x; ankle.z = Lk.z; } }
          else if (Lk.on) { Lk.ox0 = Lk.x - ankle.x; Lk.oz0 = Lk.z - ankle.z; Lk.oT = 0; Lk.on = false; }
          if (Lk.ox0 || Lk.oz0) { Lk.oT += dt; const q = Lk.oT / 0.045, f = (1 + q) * Math.exp(-q); Lk.ox = Lk.ox0 * f; Lk.oz = Lk.oz0 * f;
            if (f < 0.002) { Lk.ox0 = Lk.oz0 = 0; Lk.ox = Lk.oz = 0; } ankle.x += Lk.ox; ankle.z += Lk.oz; }
        } }
      ft.p.set(ankle.x, 0, ankle.z); ft.lift = ankle.y - D.ankle;
      if (this.dbgOn) { (this.dbgFt || (this.dbgFt = {}))['o' + i] = [+(this.lockF[i].ox || 0).toFixed(3), +(this.lockF[i].ox0 || 0).toFixed(3), +(this.lockF[i].oT || 0).toFixed(3), +(this.plW || 0).toFixed(2)]; (this.dbgFt)['w' + i] = [+(this.widenOff ? this.widenOff[i] : 0).toFixed(3), +(this.sepOff ? this.sepOff[i].x : 0).toFixed(3), +(this.sepOff ? this.sepOff[i].z : 0).toFixed(3), +px.toFixed(3), +pz.toFixed(3), +right.x.toFixed(3), +right.z.toFixed(3), +r.toFixed(3)]; (this.dbgFt)['s1' + i] = [+(ankle.x - px).toFixed(3), +(ankle.z - pz).toFixed(3)]; (this.dbgFt)['raw' + i] = [+(LP[ja * 3] * r).toFixed(3), +(LP[ja * 3 + 2] * r).toFixed(3)]; }
    }
    // A foot in the air passes the planted one round it, in front or behind, not through it: carried straight from where it
    // lifted to where it lands, a crossover step or a turn on the spot took the moving foot through the other ankle and the
    // shins through each other. It is moved across its own way a foot's width clear of the other, on the side it is on
    // (in front when it is passing straight through).
    const lpPre = [_lpO0.copy(_an[0]), _lpO1.copy(_an[1])];
    // The stride's feet kept from crossing over each other, softly: the sideways gap between them (right foot's side positive)
    // is kept to at least about a tenth of his height, eased into as it closes (a smooth curve of where the stride puts them, so
    // nothing jumps), and the feet in the air take it up by how far off the court each is. (Crossed over by the stride when
    // running across the body, a foot was then sent back to its own side through the other leg by the passes below: in a frame,
    // a foot thrown twenty centimetres; spread over several, the shins through each other.)
    // (not in a serve, whose stance brings the feet together on purpose: let go of over a tenth of a second as one begins or
    // waits, taken up again after it; and a foot coming down or leaving the court takes little of it, so a planted foot does not
    // slide)
    const sepK = this.sepK = !this.inited || dt <= 0 ? ((srvSt || serverWait) ? 0 : 1) : (this.sepK ?? 1) + (((srvSt || serverWait) ? 0 : 1) - (this.sepK ?? 1)) * (1 - Math.exp(-dt * 10));
    if (!globalThis.__softSepOld && this.inited && this.lpW && this.lpWPt === this.placedT && sepK > 0.001) { const pw0 = this.lpW, f0 = (1 - pw0[0]) ** 2, f1 = (1 - pw0[1]) ** 2, fs0 = f0 + f1;
      if (fs0 > 0.02) { const gmin = (globalThis.__sepMin ?? 0.06) * H, soft = (globalThis.__sepSoft ?? 0.04) * H, sep = (_an[1].x - _an[0].x) * right.x + (_an[1].z - _an[0].z) * right.z, x0 = sep - gmin, eff = gmin + 0.5 * (x0 + Math.sqrt(x0 * x0 + soft * soft)), dd = (eff - sep) * sepK;
        if (dd > 1e-4) { const pl0 = !globalThis.__plantHoldOld && this.lockF[0].on && !this.lockF[0].step, pl1 = !globalThis.__plantHoldOld && this.lockF[1].on && !this.lockF[1].step, k0 = pl0 ? 0 : dd * f0 / fs0, k1 = pl1 ? 0 : dd * f1 / fs0; _an[0].x -= right.x * k0; _an[0].z -= right.z * k0; _an[1].x += right.x * k1; _an[1].z += right.z * k1; this.feet[0].p.set(_an[0].x, 0, _an[0].z); this.feet[1].p.set(_an[1].x, 0, _an[1].z); } } }
    if (this.dbgOn) for (let a = 0; a < 2; a++) (this.dbgFt || (this.dbgFt = {}))['s0' + a] = [+(_an[a].x - px).toFixed(3), +(_an[a].z - pz).toFixed(3)];
    if (!globalThis.__footPassOld && this.inited) { const minD = (globalThis.__footSep ?? 0.13) * H, ap = this.ankAir || (this.ankAir = [V(), V()]), apOk = this.ankAirOk || (this.ankAirOk = [false, false]);
      for (let i = 0; i < 2; i++) { const a = _an[i], b = _an[1 - i], La = this.lockF[i], Lb = this.lockF[1 - i];
        const airA = !La.on || !!La.step, downB = Lb.on && !Lb.step;
        const wB = !globalThis.__lpShareOld && this.lpW && this.lpWPt === this.placedT ? this.lpW[1 - i] : downB ? 1 : 0;   /* (by how planted the other foot is, eased: switched on and off as it landed and lifted, the passing foot was thrown a quarter of a metre sideways in a frame) */
        if (airA && wB > 0.01 && a.y - D.ankle < 0.25 * H) { const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz);
          if (d < minD) { let ux = 0, uz = 0; if (apOk[i]) { ux = a.x - ap[i].x; uz = a.z - ap[i].z; } let ul = Math.hypot(ux, uz); if (ul < 1e-4) { ux = p.vx; uz = p.vz; ul = Math.hypot(ux, uz); } if (ul < 1e-4) { ux = fwd.x; uz = fwd.z; ul = 1; } ux /= ul; uz /= ul;
            const nx = -uz, nz = ux, along = dx * ux + dz * uz; let side = dx * nx + dz * nz; if (Math.abs(side) < 0.01 * H) side = (nx * fwd.x + nz * fwd.z) >= 0 ? 1 : -1;
            // (the side it passes on is chosen once and kept until it is down: chosen afresh each frame, a foot passing straight
            // through the other's place was pushed to one side, then judged to be on that side of its own way next frame, and
            // shook from one side to the other)
            const sideW = this.footSide || (this.footSide = [0, 0]); if (!sideW[i]) sideW[i] = Math.sign(side) * ((nx * fwd.x + nz * fwd.z) >= 0 ? 1 : -1); const sg = sideW[i] * ((nx * fwd.x + nz * fwd.z) >= 0 ? 1 : -1);
            const want = Math.sqrt(Math.max(0, minD * minD - along * along)), cur = Math.max(0, (dx * nx + dz * nz) * sg);
            if (this.dbgOn) (this.dbgFt || (this.dbgFt = {}))['pr' + i] = [+side.toFixed(3), sideW[i], +along.toFixed(3), +d.toFixed(3), +wB.toFixed(2)];
            if (want > cur) { const k = (want - cur) * sg * Math.min(1, wB); a.x += nx * k; a.z += nz * k; this.feet[i].p.set(a.x, 0, a.z); this.dbgFP = { t: +t.toFixed(2), i, k: +k.toFixed(3), d: +d.toFixed(3) }; } } } }
      for (let i = 0; i < 2; i++) { ap[i].copy(globalThis.__apPreOld ? _an[i] : lpPre[i]); apOk[i] = true; if (this.footSide && this.lockF[i].on && !this.lockF[i].step) this.footSide[i] = 0; } }   /* (the way a foot is going read from where the stride takes it, not where this pushed it: read with the push, a foot hovering by the other was pushed one way, read as going that way, and pushed back the other, flicking fifteen centimetres every frame) */
    // upright, the legs carry the hips: as high as the leg on the ground allows with the knee just soft
    // (and in a stretch the hips go as low as it takes for both legs to reach the court: the trailing leg nearly straight, the
    // front knee bent deep over its foot)
    if (plW > 0.001) {
      let cap = 1e9; const L = (D.thigh + D.shank) * 0.975;
      for (let i = 0; i < 2; i++) { if (this.feet[i].lift > 0.035 * H) continue; const jh = LEG_J[i][0], hx = px + right.x * LP[jh * 3] * r + fwd.x * LP[jh * 3 + 2] * r, hz = pz + right.z * LP[jh * 3] * r + fwd.z * LP[jh * 3 + 2] * r, dh = Math.hypot(_an[i].x - hx, _an[i].z - hz); cap = Math.min(cap, D.ankle + Math.sqrt(Math.max(0, L * L - dh * dh))); }
      if (cap < 1e8) wantY = lerp(wantY, Math.min(wantY, Math.max(cap, D.hipY * 0.64)), plW);
    }
    const upW = this.loco.w.up * (1 - strokeK) * (1 - clipW);
    if (upW > 0.01) {
      // (the knee under the weight all but straight: at 0.982 of the leg's length it stayed bent twenty-two degrees, and every
      // player walked back to the line, and stood at it, in a crouch, like a man creeping; a walker's knee is near straight but for
      // the moment the weight comes on, which the foot landing ahead gives him here, the hips coming down to reach it)
      let cap = 1e9; const L = (D.thigh + D.shank) * (globalThis.__walkStraightOld ? 0.982 : (globalThis.__walkReach ?? 0.995));
      for (let i = 0; i < 2; i++) { if (this.feet[i].lift > 0.035 * H) continue; const jh = LEG_J[i][0], hx = px + right.x * LP[jh * 3] * r + fwd.x * LP[jh * 3 + 2] * r, hz = pz + right.z * LP[jh * 3] * r + fwd.z * LP[jh * 3 + 2] * r, dh = Math.hypot(_an[i].x - hx, _an[i].z - hz); if (dh < L) cap = Math.min(cap, _an[i].y + Math.sqrt(L * L - dh * dh)); }
      if (cap < 1e8) wantY = lerp(wantY, Math.min(cap, D.hipY + 0.012 * H), upW);
    }
    // (and always low enough for a planted foot to reach the court: in a wide stance, pulling up out of a run, the hips were
    // kept at standing height, the leg could not reach the foot held at its place, and the foot was drawn hanging in the air
    // up to a fifth of a metre above the court)
    if (!globalThis.__noReachCap && !strolling) { let cap = 1e9; const L = (D.thigh + D.shank) * 0.985;
      for (let i = 0; i < 2; i++) { if (!this.lockF[i].on) continue; const jh = LEG_J[i][0], hx = px + right.x * LP[jh * 3] * r + fwd.x * LP[jh * 3 + 2] * r, hz = pz + right.z * LP[jh * 3] * r + fwd.z * LP[jh * 3 + 2] * r, dh = Math.hypot(_an[i].x - hx, _an[i].z - hz);
        cap = Math.min(cap, _an[i].y + Math.sqrt(Math.max(0, L * L - dh * dh))); }
      // (only standing, shuffling or pulling up, and by no more than a hand's breadth: at a sprint the foot left behind is a
      // stride back, and lowered to reach it he ran in a crouch, near kneeling)
      const capK = 1 - sm((speed - ((this.fwdK || 0) < -0.5 ? 3.0 : 1.6)) / 0.8);   /* (backing up, a short-stepped shuffle, up to a jog's pace) */ if (cap < wantY && capK > 0.001) wantY = lerp(wantY, Math.max(cap, wantY - 0.09 * H, this.hipFloor || D.hipY * 0.6), capK); }
    this.pelvisY = damp(this.pelvisY, wantY, 30, dt);
    const pelvis = _pel.set(px, this.pelvisY + air, pz).addScaledVector(right, hmx * r + (pose.shift || 0) * hs * H * strokeK + (this.sway || 0)).addScaledVector(fwd, hmz * r + (pose.fshift || 0) * H * strokeK);
    // trunk: the hips from the hip line, the chest from the shoulder line and the spine
    const spine = _v3.set(0, 0, 0).addScaledVector(right, LP[J.neck * 3] - hmx).addScaledVector(UP, LP[J.neck * 3 + 1] - hmy).addScaledVector(fwd, LP[J.neck * 3 + 2] - hmz).normalize();
    const clipLean = Math.atan2(spine.dot(fwd), spine.y);
    const frameOf = (rt, up, out) => { const y = _b.copy(up).normalize(), x = _a.copy(rt).addScaledVector(y, -rt.dot(y)).normalize(), z = _c.copy(x).cross(y); _m.makeBasis(x, y, z); return out.setFromRotationMatrix(_m); };
    // (the hips never turned more than about eighty degrees from the line between the feet: a stroke's clip coming in turns its
    // hips to the shot before the feet have moved to it, and turned past square to an open stance the legs, each from its own
    // hip to a foot now on the other side of the body, crossed in an X between ankles a third of a metre apart. No further
    // than hips turn over planted feet; nothing is done with the feet close together, where their line means little.)
    // (the turn the shoulders' twist adds to the hips counted in: clamped first and turned after, a drop shot's take-back, whose
    // twist is large, still turned the hips past the feet and crossed the legs)
    const hipV = cdir(J.lhip, J.rhip, _v4), hipTw = -this.twist * (pose.hipTurn == null ? 0.42 : pose.hipTurn), twFirst = !globalThis.__hipClampOld && !globalThis.__hipTwLateOld && this.inited;
    if (twFirst) hipV.applyAxisAngle(UP, hipTw);
    if (!globalThis.__hipClampOld && this.inited) { const fx = _an[1].x - _an[0].x, fz = _an[1].z - _an[0].z, fl = Math.hypot(fx, fz), w = sm((fl - 0.07 * H) / (0.06 * H));
      if (w > 0.001) { const th = Math.atan2(fz * hipV.x - fx * hipV.z, fx * hipV.x + fz * hipV.z), mxA = (globalThis.__hipClampDeg ?? 80) * Math.PI / 180;
        if (Math.abs(th) > mxA) hipV.applyAxisAngle(UP, -(th - Math.sign(th) * mxA) * w); } }
    const qPel = frameOf(hipV, _v5.copy(UP).lerp(spine, 0.35), _q1); if (!twFirst) qPel.multiply(_q3.setFromAxisAngle(UP, hipTw));
    // a stroke's own lean and side bend replace the clip's while it is being played
    // (and the lower the hips go, the more the trunk hinges forward over them, as a player's does getting down to a ball: the
    // hips lowered for a low ball or a wide stance with the chest left upright, from behind and above he sat on an invisible
    // chair through the take-back. About fifteen degrees of lean at four fifths of standing height, twenty-five at three quarters.)
    const hipK = this.pelvisY / D.hipY, hinge = globalThis.__noHinge ? 0 : clamp((0.9 - hipK) / 0.16, 0, 1) * 0.46;
    const leanT = ((pose.lean || 0) - clipLean) * strokeK, total = clipLean + leanT;
    this.lean = damp(this.lean, total < hinge ? leanT + (hinge - total) : leanT, 14, dt);
    const leanS = (pose.sideLean || 0) * hs * sw;
    const qLean = _q2.setFromAxisAngle(_v6.copy(right), -this.lean).multiply(_q3.setFromAxisAngle(_v7.copy(fwd), -leanS));
    const qChest = frameOf(cdir(J.lsho, J.rsho, _v4), spine, _q4).multiply(_q3.setFromAxisAngle(UP, -this.twist)).premultiply(qLean);
    // (a move of the hand toward the ball, back toward the body, is kept to what leaves the hand a forearm in front of the chest,
    // judged both by which way he faces and which way his chest does: in a turned take-back the two differ by a right angle)
    const backCap = (mv, h) => { const mz = _bcM.copy(sh[0]).add(sh[1]).multiplyScalar(0.5);
      for (const dir of [fwd, _bcF.set(0, 0, -1).applyQuaternion(qChest)]) { const fx = dir.x, fzz = dir.z, l = Math.hypot(fx, fzz); if (l < 1e-3) continue; const ux = fx / l, uz = fzz / l;
        const fz = mv.x * ux + mv.z * uz; if (fz >= 0) continue; const f0 = (h.x - mz.x) * ux + (h.z - mz.z) * uz, back = Math.max(0, f0 - (globalThis.__backMin ?? 0.24)); if (-fz > back) { const d = -fz - back; mv.x += ux * d; mv.z += uz * d; } } };
    // pose the trunk first: where the shoulders and hips end up is read back from the skeleton
    person.setTrunk(pelvis, qPel, qChest);
    const cRight = _v6.set(1, 0, 0).applyQuaternion(qChest), pRight = _v7.set(1, 0, 0).applyQuaternion(qPel);
    const shL = person.jointPos('L_UpperArm', _shL), shR = person.jointPos('R_UpperArm', _shR);
    const hipL = person.jointPos('L_Thigh', _hipL), hipR = person.jointPos('R_Thigh', _hipR);
    // A leg swinging through passes the planted one, not through it: with both legs solved roughly as they will be, where the
    // shins would come closer than two calves' thickness, the foot in the air is carried out to its own side by what is
    // missing. (At a run the swinging shin crossed the standing one a hand's height above the ankle, the ankles themselves
    // still well apart.) The foot on the court is never moved.
    if (!globalThis.__legPassOld && this.inited) { const hp = [hipL, hipR], kq = [_lpK0, _lpK1], mn = (globalThis.__legPass ?? 0.12) * H;
      const segD = (p0, p1, q0, q1) => { let best = 9; for (let k = 0; k <= 6; k++) { const q = _lsA.copy(p0).lerp(p1, k / 6), ab = _lsB.copy(q1).sub(q0), tt = clamp(_lsC.copy(q).sub(q0).dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1); best = Math.min(best, q.distanceTo(_lsC.copy(q0).addScaledVector(ab, tt))); } return best; };
      const knee = (i) => { const pl = _lpP.copy(fwd).addScaledVector(right, (i === 0 ? -1 : 1) * 0.2); return ik(hp[i], _an[i], D.thigh, D.shank, pl, kq[i]); };
      // (both in the air, in a sprint's flight or a jump, each goes half the way out to its own side)
      // (and how the way out is shared between the feet goes by how planted each is, eased over a few frames as a foot lands or
      // lifts, not switched: shared half and half with both up and all to the moving foot with one down, the share flipped as a
      // foot landed or lifted and the other was thrown a third of a metre in a frame)
      if (!globalThis.__lpShareOld) { const pw = this.lpW || (this.lpW = [1, 1]), ke = 1 - Math.exp(-dt * (globalThis.__lpShareK ?? 30));
        for (let a = 0; a < 2; a++) { const L0 = this.lockF[a], want = L0.on && !L0.step ? 1 : 0; pw[a] = this.lpWPt === this.placedT ? pw[a] + (want - pw[a]) * ke : want; } this.lpWPt = this.placedT;
        const f0 = 1 - pw[0], f1 = 1 - pw[1], fs = f0 + f1;
        if (this.dbgOn) (this.dbgFt || (this.dbgFt = {})).pw = [+pw[0].toFixed(2), +pw[1].toFixed(2)];
        if (fs > 0.02) { const sh = [f0 / fs, f1 / fs];
          // (a foot down on the court is not moved by this at all, even while its weight is still easing in after it landed: moved, a
          // foot just set down slid a quarter of a metre; the other foot's share is left as it was, to grow as the weight eases)
          if (!globalThis.__plantHoldOld) for (let a = 0; a < 2; a++) { const L0 = this.lockF[a]; if (L0.on && !L0.step) sh[a] = 0; }
          for (let a = 0; a < 2; a++) { const L0 = this.lockF[a]; if (L0.step && L0.step.t < 0.33 && !globalThis.__stepOutOld && pw[1 - a] > 0.5) sh[a] *= Math.max(0.2, L0.step.t / 0.33); }
          knee(0); knee(1); const dd = () => Math.min(segD(kq[0], _an[0], kq[1], _an[1]), segD(_lpM.copy(hp[0]).lerp(kq[0], 0.5), kq[0], _lpN.copy(hp[1]).lerp(kq[1], 0.5), kq[1])); let k = mn - dd();
          for (let it = 0; it < 3 && k > 0.002; it++) { for (const a of [0, 1]) { if (sh[a] < 1e-3) continue; const sx = a === 0 ? -1 : 1, rx = right.x * sx, rz = right.z * sx, l = Math.hypot(rx, rz) || 1; _an[a].x += rx / l * k * sh[a]; _an[a].z += rz / l * k * sh[a]; this.feet[a].p.set(_an[a].x, 0, _an[a].z); knee(a); } k = mn - dd(); }
          if (this.dbgOn) (this.dbgFt || (this.dbgFt = {})).lp = { sh: sh.map(x => +x.toFixed(2)), right: [+right.x.toFixed(2), +right.z.toFixed(2)], kEnd: +k.toFixed(3) }; } }
      else {
      { const air0 = !this.lockF[0].on || !!this.lockF[0].step, air1 = !this.lockF[1].on || !!this.lockF[1].step;
        if (air0 && air1) { knee(0); knee(1); const dd = () => Math.min(segD(kq[0], _an[0], kq[1], _an[1]), segD(_lpM.copy(hp[0]).lerp(kq[0], 0.5), kq[0], _lpN.copy(hp[1]).lerp(kq[1], 0.5), kq[1])); let k = mn - dd();
          for (let it = 0; it < 3 && k > 0.002; it++) { for (const a of [0, 1]) { const sx = a === 0 ? -1 : 1, rx = right.x * sx, rz = right.z * sx, l = Math.hypot(rx, rz) || 1; _an[a].x += rx / l * k * 0.5; _an[a].z += rz / l * k * 0.5; this.feet[a].p.set(_an[a].x, 0, _an[a].z); knee(a); } k = mn - dd(); } } }
      for (let a = 0; a < 2; a++) { const b = 1 - a, La = this.lockF[a], Lb = this.lockF[b]; if (!((!La.on || La.step) && Lb.on && !Lb.step)) continue;
        knee(a); knee(b); const d = Math.min(segD(kq[a], _an[a], kq[b], _an[b]), segD(_lpM.copy(hp[a]).lerp(kq[a], 0.5), kq[a], _lpN.copy(hp[b]).lerp(kq[b], 0.5), kq[b]));
        if (d < mn) { const sx = a === 0 ? -1 : 1, rx = right.x * sx, rz = right.z * sx, l = Math.hypot(rx, rz) || 1; let k = mn - d;
          // (a foot only now lifting to step out from beside the other goes out over the first third of its step, not all in the
          // frame it leaves the court: shoved the whole way at once it jumped seventeen centimetres as it lifted)
          const kS = !globalThis.__stepOutOld && La.step && La.step.t < 0.33 ? Math.max(0.2, La.step.t / 0.33) : 1;
          // (by steps, re-measured: the way out is to its own side, and how far depends on where the shins meet)
          for (let it = 0; it < 3 && k > 0.002; it++) { k *= kS; _an[a].x += rx / l * k; _an[a].z += rz / l * k; this.feet[a].p.set(_an[a].x, 0, _an[a].z); knee(a); k = mn - Math.min(segD(kq[a], _an[a], kq[b], _an[b]), segD(_lpM.copy(hp[a]).lerp(kq[a], 0.5), kq[a], _lpN.copy(hp[b]).lerp(kq[b], 0.5), kq[b])); }
          if (this.dbgOn) this.dbgLegPass = { t: +t.toFixed(2), a, d: +d.toFixed(3) }; } } } }
    // (what that pass moved each foot by, kept for the frame after: a foot it carried round the other that then lands is put down
    // where it was drawn, not where the stride had it, across the other foot, a third of a metre away)
    if (this.dbgOn) for (let a = 0; a < 2; a++) (this.dbgFt || (this.dbgFt = {}))['s3' + a] = [+(_an[a].x - px).toFixed(3), +(_an[a].z - pz).toFixed(3)];
    // (and let go of no faster than about seven centimetres a frame, though taken up at once: what keeps the feet apart can vanish
    // in a frame, the other foot lifting or turning, and the foot it held out was dropped back across twenty centimetres; held out a
    // frame or two longer than it need be, the legs are only further apart)
    { const lo = this.lpOff || (this.lpOff = [V(), V()]), mxR = (globalThis.__lpRel ?? 0.04) * H * Math.min(2, dt * 60);
      for (let a = 0; a < 2; a++) { const tx = _an[a].x - lpPre[a].x, tz = _an[a].z - lpPre[a].z, L0 = this.lockF[a];
        if (globalThis.__lpRelOld || (L0.on && !L0.step) || this.lpPt !== this.placedT) { lo[a].set(tx, 0, tz); continue; }
        // (taken up at once: capped even at eleven centimetres a frame, legs passing through each other went up by half across the
        // roster, tried 2026-11-19 and taken out)
        // (except a foot crossed over to the other's side, being put back on its own: that goes across at most about eleven
        // centimetres a frame, not through the other leg in one)
        const sxA = a === 0 ? -1 : 1, latA = ((lpPre[a].x - lpPre[1 - a].x) * right.x + (lpPre[a].z - lpPre[1 - a].z) * right.z) * sxA, crossedA = !globalThis.__crossCapOld && latA < 0;
        const out = Math.hypot(tx, tz) >= Math.hypot(lo[a].x, lo[a].z), mxA = out ? (globalThis.__lpOut != null ? globalThis.__lpOut * H * Math.min(2, dt * 60) : crossedA ? (globalThis.__crossCap ?? 0.08) * H * Math.min(2, dt * 60) : 1e9) : mxR;
        let dx = tx - lo[a].x, dz = tz - lo[a].z; const dl = Math.hypot(dx, dz); if (dl > mxA) { dx *= mxA / dl; dz *= mxA / dl; }
        lo[a].x += dx; lo[a].z += dz; _an[a].x = lpPre[a].x + lo[a].x; _an[a].z = lpPre[a].z + lo[a].z; this.feet[a].p.set(_an[a].x, 0, _an[a].z); }
      this.lpPt = this.placedT; }
    const chest = _chest.copy(shL).add(shR).multiplyScalar(0.5);

    // ---- hands ----
    // hitting hand R / off hand L in a right-hander's terms; mirrored for a left-hander
    const hit = hs > 0 ? 1 : 0, off = 1 - hit, srvOff = !!st && st.kind === 'serve' && (globalThis.__srvOffOld || !(st.tc != null && t - st.tc > 0.6 && sw < 0.05));
    const tgt = _tg;
    W(pose.R[0] * hs, pose.R[1], pose.R[2], tgt[hit]);
    W(pose.L[0] * hs, pose.L[1], pose.L[2], tgt[off]); if (this.dbgOn) (this._keyOff || (this._keyOff = V())).copy(tgt[off]);
    // Arms let go of after the point hang from the shoulders, an arm's length down, whatever height the body is still at: the
    // relaxed pose puts the hands at a set height for a man standing up, and while he was still down in his wide ready stance
    // that bent both arms, hands at the waist, elbows out behind: a gunslinger's stance from the camera behind him. (Eased in
    // and out; not in a reaction, which places its own hands, nor waiting to serve.)
    // (not while he is still running out the point: hanging straight down at a sprint, the free hand sat on his hip)
    { const want = !live && !this.posed && !serverWait ? (1 - Math.max(this.reactK || 0, this.touchK || 0)) * (1 - sm(sw / 0.2)) * (1 - sm((speed - 2.0) / 1.5)) : 0, wH = clamp(ease(this, 'hangW', want, 13, dt), 0, 1);
      if (wH > 0.001) { const shs = [shL, shR]; for (let i = 0; i < 2; i++) { const hy = shs[i].y - (D.upper + D.fore) * 0.97; if (tgt[i].y > hy) tgt[i].y = lerp(tgt[i].y, hy, wH); } } }
    // running flat out, or strolling between points, the arms are the clip's own: they swing
    // (coming out of a stroke the arms are handed to the run as the stroke lets go of them, not at once below some mark, and
    // more slowly than they are taken back into one: given at once to a run cycle caught at full swing, the free arm
    // flopped out to it in a tenth of a second)
    this.sinceSw = sw > 0.05 ? 0 : (this.sinceSw || 0) + dt;
    // (the arms pump only on a real run, a quarter of a second and more at speed, longer up at the net: a lunge or two quick
    // steps to a volley is made with the racket held up in front in both hands, and pumping for each dart, the arms flicked
    // between the two at every step)
    const sustain = this.pumpSus;
    const walkSv = serverWait && !globalThis.__srvStrollOld ? (this.srvWalkK || 0) : 0;   /* (walking to serve: the arms swing as they do strolling between points) */
    const free = ease(this, 'armFree', strolling ? 1 - Math.max(this.reactK || 0, this.touchK || 0) : lerp(sm((speed - gP0) / (gP1 - gP0)) * sustain * (1 - sm(sw / 0.4)), 1, walkSv), strolling || walkSv > 0.5 ? 7 : this.sinceSw < 0.5 ? 8 : 19, dt);   /* (after a point the arms loosen slowly) */
    const sh = [shL, shR], cEl = _el2, cWr = _wr2, CJ = ARM_J;
    // the way each knee bends (see below): a function, so either leg's can be had while the other is solved
    const kpFor = (i, out) => { const jh = LEG_J[i][0], jk = LEG_J[i][1], ja = LEG_J[i][2];
      const kp = out.set(0, 0, 0).addScaledVector(right, LP[jk * 3] - (LP[jh * 3] + LP[ja * 3]) / 2).addScaledVector(UP, LP[jk * 3 + 1] - (LP[jh * 3 + 1] + LP[ja * 3 + 1]) / 2).addScaledVector(fwd, LP[jk * 3 + 2] - (LP[jh * 3 + 2] + LP[ja * 3 + 2]) / 2);
      if (kp.lengthSq() < 1e-4) kp.copy(fwd); kp.addScaledVector(fwd, 0.05);
      // A knee bends out over its own toes, never in toward the other knee. Tracking from video loses depth, and its
      // knees fall inward (knock-kneed at a serve's trophy): what of the bend points in toward the other leg is taken
      // out, and some of the way the hips face is put back, so the knees come forward and a little apart.
      { const hl = _kpH.copy(hipR).sub(hipL).setY(0); if (hl.lengthSq() > 1e-6) { hl.normalize(); const sx = i === 0 ? -1 : 1, lat = kp.dot(hl) * sx, kl = kp.length();
          if (lat < 0) kp.addScaledVector(hl, -sx * lat * 0.92);
          const pf = _kpF.copy(UP).cross(hl).normalize(); if (kp.dot(pf) < 0.45 * kl) kp.addScaledVector(pf, 0.45 * kl - kp.dot(pf));
          kp.addScaledVector(hl, sx * 0.06 * kl);
          // (and never bowed out past about thirty degrees from the way the hips face: the tracked knees splay with the tracked
          // toes, and in a crouch they stood out sideways like a frog's)
          { const out2 = kp.dot(hl) * sx, fw2 = kp.dot(pf), mxO = Math.max(0, fw2) * 0.58; if (out2 > mxO) kp.addScaledVector(hl, -sx * (out2 - mxO)); } } }
      return kp; };
    // (no move of the hand toward the ball takes it into the trunk: in a turned take-back the way to a ball out to the side or
    // behind runs straight through the body, and the hand and forearm were moved a third of a metre into it; the move is cut
    // back to the most that leaves the hand a forearm's thickness outside the trunk)
    const inTrunk = (q) => { const mz = _stM.copy(sh[0]).add(sh[1]).multiplyScalar(0.5), ax = _stA.copy(mz).sub(pelvis), L = ax.length(); if (L < 1e-3) return false; ax.multiplyScalar(1 / L);
      const rel = _stR.copy(q).sub(pelvis), al = rel.dot(ax); if (al < -(globalThis.__stBelow ?? 0.16) || al > L * 1.05) return false; const rt = _stX.copy(sh[1]).sub(sh[0]); rt.addScaledVector(ax, -rt.dot(ax)); const shW = rt.length(); if (shW < 1e-3) return false; rt.multiplyScalar(1 / shW);
      const fw = _stF.copy(ax).cross(rt), dx = rel.dot(rt), dz = rel.dot(fw), mg = globalThis.__stMargin ?? 0.13, a = shW * 0.39 + mg, b = (dz > 0 ? shW * 0.25 : shW * 0.32) + mg; return Math.hypot(dx / a, dz / b) < 1; };
    // (and a hand that starts already within the margin, by the hip at the start of a forehand, may not be taken any deeper
    // than it is: skipped as already inside, a ball jammed into the body took the forehand swing half a metre across through
    // the stomach, the hand in front of the navel and the elbow in his side)
    const trunkE = (q) => { const mz = _stM.copy(sh[0]).add(sh[1]).multiplyScalar(0.5), ax = _stA.copy(mz).sub(pelvis), L = ax.length(); if (L < 1e-3) return 9; ax.multiplyScalar(1 / L);
      const rel = _stR.copy(q).sub(pelvis), al = rel.dot(ax); if (al < -(globalThis.__stBelow ?? 0.16) || al > L * 1.05) return 9; const rt = _stX.copy(sh[1]).sub(sh[0]); rt.addScaledVector(ax, -rt.dot(ax)); const shW = rt.length(); if (shW < 1e-3) return 9; rt.multiplyScalar(1 / shW);
      const fw = _stF.copy(ax).cross(rt), dx = rel.dot(rt), dz = rel.dot(fw), mg = globalThis.__stMargin ?? 0.13, a = shW * 0.39 + mg, b = (dz > 0 ? shW * 0.25 : shW * 0.32) + mg; return Math.hypot(dx / a, dz / b); };
    const shiftClear = (mv, h) => { if (globalThis.__shiftClearOld) return; const e0 = trunkE(h), need = globalThis.__shiftDeepOld ? 1 : Math.min(1, e0); if (globalThis.__shiftDeepOld && e0 < 1) return;
      if (trunkE(_stQ.copy(h).add(mv)) >= need - 1e-4) return; let lo = 0, hi = 1; for (let it = 0; it < 7; it++) { const sv = (lo + hi) / 2; if (trunkE(_stQ.copy(h).addScaledVector(mv, sv)) < need - 1e-4) hi = sv; else lo = sv; } mv.multiplyScalar(lo); };
    // how much of the runner's arm swing the racket arm takes: all of it strolling, about half flat out
    // (eased: from strolling between points to the ready position it went from all of it to half in a frame)
    const carry = this.posed ? 0 : clamp(ease(this, 'carryE', strolling ? 1 : lerp(0.12 + (globalThis.__runCarryOld ? 0.38 : 0.2) * free, 1, walkSv), 12, dt), 0, 1);   /* (the racket arm swings less than the free one at a run) */
    // waiting to serve, the ball hand works in front of him at the waist (the keyed bounce), not where his tracked
    // address clip lets it hang at his side, where the ball is lost against his leg
    this.addrHandW = damp(this.addrHandW || 0, serverWait && m.ball && m.ball.held === p.i ? 1 - (globalThis.__srvStrollOld ? 0.7 : 1) * (this.srvWalkK || 0) : 0, 10, dt);   /* (walking, the ball hand hangs at his side with the ball in it) */
    // and the racket arm holds the racket in front of him (head down while he bounces, then pointing at the box at the
    // address), not hanging at his side as the tracked serve starts; it gives way to the clip as the toss begins
    this.addrArmW = damp(this.addrArmW || 0, serverWait ? 1 - (this.srvWalkK || 0) : 0, serverWait ? 10 : 5, dt);
    // (a groundstroke begun on the run: until the take-back is under way the free hand is on the racket in front of him, as the
    // keys hold it, not where the clip's first moments have it, hanging by his hip as the man stood waiting: Lendl's forehand
    // started at a sprint with his free hand on his hip)
    const runEarly = st && !/^(serve|smash)$/.test(st.kind) ? sm((speed - 2.0) / 1.5) * (1 - sm5((u + 0.62) / 0.16)) : 0;
    const freeA = free * (1 - sm(swA / 0.4)), freeOf = i => Math.max(freeA * (i === hit ? carry : 1), (i === hit ? armW : clipWA * (1 - runEarly)) * (1 - (i === hit ? this.addrArmW : this.addrHandW)));   /* (in a stroke the running arms are gone at once: the hands' entry carries them) */
    this.lastFreeA = Math.max(freeA, free * (1 - sm(sw / 0.4)));
    _keyHand.copy(tgt[hit]);                                    // where the stroke's keys put the hitting hand, before the clip moves it
    // running flat out the arms swing as a runner's do, whichever way the legs are going: a sideways run's
    // own capture has them hanging, so outside a stroke clip they come from the forward gait
    // (eased in and out as a stroke clip ends or a run starts, never switched)
    const FWp = this.loco.FW; const rw = clamp(ease(this, 'runArmW', strolling ? 0 : (1 - clipW) * sm((this.loco.w.go - 0.15) / 0.3), 17, dt), 0, 1);
    // (the runner's swing is laid on the way his chest faces, not his hips: coming out of a stroke the chest is still turned
    // from the finish, and running across the court the hips turn to the run, and a forward-and-back swing taken square to
    // the hips cut across the chest, the elbow flung out to the side and the hand left on the hip)
    const cyR = _cyR.copy(cRight).setY(0); if (cyR.lengthSq() < 1e-6) cyR.copy(right); cyR.normalize(); const cyF = _cyF.copy(UP).cross(cyR);
    const adir = (a, b, out) => { cdir(a, b, out); const rwE = rw * (1 - clipWA); if (rwE > 0.001) { _c.set(0, 0, 0).addScaledVector(cyR, FWp[b * 3] - FWp[a * 3]).addScaledVector(UP, FWp[b * 3 + 1] - FWp[a * 3 + 1]).addScaledVector(cyF, FWp[b * 3 + 2] - FWp[a * 3 + 2]).normalize(); out.lerp(_c, rwE).normalize(); } return out; };
    // (an elbow the clip folds tighter than an arm folds, which is the tracker losing a forearm against the body, is opened
    // about the elbow in the arm's own plane until the hand is a forearm's length off the shoulder: pushed out any other
    // way, a hand asked to be at the shoulder spins round it)
    for (let i = 0; i < 2; i++) {
      const ud = _pa.copy(adir(CJ[i][0], CJ[i][1], _v8)), fd = _pb.copy(adir(CJ[i][1], CJ[i][2], _v8));
      cEl[i].copy(sh[i]).addScaledVector(ud, D.upper);
      const U = D.upper, Fl = D.fore, R = (U + Fl) * (i === hit ? 0.56 : 0.46), need = (R * R - U * U - Fl * Fl) / (2 * U * Fl), c0 = ud.dot(fd);
      if (c0 < need) { const pp = _pc.copy(fd).addScaledVector(ud, -c0); if (pp.lengthSq() < 1e-6) pp.set(0, -1, 0).addScaledVector(ud, -ud.y);
        if (pp.lengthSq() > 1e-6) { pp.normalize(); const th = Math.acos(clamp(need, -1, 1)); fd.copy(ud).multiplyScalar(Math.cos(th)).addScaledVector(pp, Math.sin(th)); } }
      // (the free arm running back into position carries itself: a third of the way it stays with the ready position's
      // hold, so it swings less than a sprinter's; flat out, a sprinter's swing from the clip would flail round the body)
      cWr[i].copy(cEl[i]).addScaledVector(fd, Fl); let fw = freeOf(i); if (i === off && !strolling && swA < 0.4) fw = Math.min(fw, 1 - 0.35 * free * (1 - sm(swA / 0.4))); if (fw > 0.001) tgt[i].lerp(cWr[i], fw); }
    if (this.dbgOn) this.dbg = { cWr: cWr.map(v => v.clone()), cEl: cEl.map(v => v.clone()), tgt1: tgt.map(v => v.clone()), freeOff: freeOf(off), armW, clipWA, sh: sh.map(v => v.clone()), keyH: _keyHand.clone(), keyOff: this._keyOff ? this._keyOff.clone() : null, free, rw, freeA, carry, swA, sw, clipFeet: Math.hypot(LP[J.lankle * 3] - LP[J.rankle * 3], LP[J.lankle * 3 + 2] - LP[J.rankle * 3 + 2]) * H, clipW, locks: this.lockF.map(l => (l.on ? 'on' : l.step ? 'step' : 'air')), cR: cRight.clone(), cU: _v9.set(0, 1, 0).applyQuaternion(qChest).clone() };
    // Both hands on one handle: the clip's two wrists are two measurements of where that handle is (the tracker often
    // has one of them, hidden behind the body, a hand's length or more out), so the bottom hand goes where the two agree
    // on, not where the hitting wrist alone says. (Taken from the hitting wrist alone, the hands sat beside the hip and
    // the top arm folded up into a wing to reach them.)
    if (OC && armW > 0.001 && (this.twoHW || 0) > 0.001) { const est = _pa.copy(cWr[off]).addScaledVector(this.rk.dir, -0.105 * H); tgt[hit].lerp(est, 0.5 * this.twoHW * armW); }
    // In a forehand's take-back the free arm points at the ball: out in front of the chest and nearly straight, from the
    // turn until it starts to come in a fifth of a second before contact. (Folded up beside the head, which is where a
    // tracked arm whose depth the camera lost ends up, its elbow stands out to the side: the chicken wing.)
    this.pointW = 0;
    if (st && st.wing === 'fh' && keys && !/^(serve|smash|volley|block)$/.test(st.__dk || st.kind) && swA > 0.001) {
      const w = swA * sm5((u + 0.8) / 0.2) * (1 - sm5((u + 0.3) / 0.25)) * Math.max(freeOf(off), 1 - (pose.lgrip > 0.04 ? 1 : 0));
      this.pointW = w;
      if (w > 0.001) {
        // (measured on the forehands tracked well, in the chest's frame: mostly forward, at most about a third of the way up,
        // the rest across toward the ball; across in front of the face and up, as Djokovic's lost arm was, it covers the face)
        const L = D.upper + D.fore, d = _pa.copy(tgt[off]).sub(sh[off]), cU = _pb.set(0, 1, 0).applyQuaternion(qChest), cF = _pc.copy(cU).cross(cRight).normalize();
        const r = Math.max(d.length(), 0.92 * L), nx = d.dot(cRight) * hs, ny = d.dot(cU), nz = d.dot(cF), nl = Math.hypot(nx, ny, nz) || 1, cap = POINT_CAP[this.look.name || ''] || POINT_CAP._;
        // (the part across keeps the side the clip's arm is on, and comes down to the clip's own as that arm passes through
        // straight ahead: taken from its side alone, the hand was thrown across the body in a frame where Djokovic's lost
        // arm went over his head)
        const sx = nx / nl; let y = Math.min(ny / nl, cap[0]), z = Math.max(nz / nl, cap[1]); const xx = 1 - y * y - z * z, xF = xx > 0 ? Math.sign(sx || 1) * Math.sqrt(xx) : 0;
        const x = sx + (xF - sx) * Math.min(1, Math.abs(sx) / 0.3), k = r / (Math.hypot(x, y, z) || 1);
        d.set(0, 0, 0).addScaledVector(cRight, x * hs * k).addScaledVector(cU, y * k).addScaledVector(cF, z * k);
        tgt[off].lerp(_v9.copy(sh[off]).add(d), w);
      }
      // and then it comes in at the chest, below the shoulder, not across in front of the face
      // (a little below the shoulder, at the top of the chest, and on into the recovery, where a clip that throws the hand up by
      // the head (Sampras's) would otherwise have it back up there: held level with the shoulder instead, the folded arm stood
      // out sideways at shoulder height, flexed like a strongman's)
      const w2 = swA * sm5((u + 0.32) / 0.1) * (1 - sm5((u - 0.25) / 0.2)) * freeOf(off), w2c = Math.max(w2, swA * sm5((u + 0.32) / 0.1) * (1 - sm5((u - 0.5) / 0.3)) * freeOf(off));
      // (and once the ball is struck, across in front of the chest toward the middle and lower still, as a finish folds the
      // free arm across the body: kept on its own side at shoulder height, from behind it was a fist raised beside the head)
      if (w2c > 0.001) { const L = D.upper + D.fore, cU = _pb.set(0, 1, 0).applyQuaternion(qChest), kFin = sm5((u + 0.05) / 0.12), cap = -(0.1 + 0.12 * kFin) * L, y = _pa.copy(tgt[off]).sub(sh[off]).dot(cU);
        if (y > cap) tgt[off].addScaledVector(cU, -(y - cap) * w2c);
        if (kFin > 0.001) { const oU = _pc.copy(cRight).multiplyScalar(off === 1 ? 1 : -1), x = _pa.copy(tgt[off]).sub(sh[off]).dot(oU); if (x > -0.14) tgt[off].addScaledVector(oU, -(x + 0.14) * w2c * kFin); } }
      if (w2 > 0.001) { const cU = _pb.set(0, 1, 0).applyQuaternion(qChest);
        // ...and in front of the chest, a quarter of a metre clear of the shoulders' plane at least, eased in (a soft floor,
        // no corner): folded in level with the body, its upper arm went through the chest in the fastest part of the swing
        const cF = _pc.copy(cU).cross(cRight).normalize(), z = _pa.copy(tgt[off]).sub(sh[off]).dot(cF), def = 0.25 - z, add = 0.5 * (def + Math.sqrt(def * def + 0.0016));
        if (add > 1e-4) tgt[off].addScaledVector(cF, add * w2); }
    }
    if (this.dbgOn && this.dbg) this.dbg.tP = tgt.map(v => v.clone());
    // The free arm out of a stroke and on the run is a limb swinging at its own pace: its hand moves round the shoulder no
    // faster than about three and a half metres a second (an arm let hang and swing; a sprinter's drive is not much more).
    // Handed at full speed from a finish that throws it far behind him (Federer's one-hander) to a running stride, it
    // otherwise swept a hundred and fifty degrees in a sixth of a second: the flop. Not in a stroke's swing, not the serve.
    // (the limit rises smoothly into the swing and falls after it, never switched: let go at once, the lag it had built up
    // came out in one frame)
    // (only where one movement is handed to another, into a wind-up and out of a finish: a running stride's own arm swing
    // is let go at its own pace, held back it stuck at the back of its swing, the hand on the hip like a man strolling)
    { const uS = st && st.tc != null ? t - st.tc : -9, swingK = sm5((uS + 0.6) / 0.25) * (1 - sm5((uS - 0.25) / 0.2)), srvNow = st && (st.kind === 'serve' || st.kind === 'smash');
      const trans = st ? (st.tc == null || uS < -0.3 || (uS > 0.2 && uS < 1.3) ? 1 : 0) : (this.sinceSw || 0) < 0.6 ? 1 : 0;
      const rel = _pa.copy(tgt[off]).sub(sh[off]), pr = this.offRel || (this.offRel = rel.clone());
      if (trans && !srvNow && this.handInit && dt > 0 && !(m.ball && m.ball.held === p.i && m.phase === 'toss')) {
        const d = _pb.copy(rel).sub(pr), dl = d.length(), mxd = (6 + 40 * swingK) * dt; if (dl > mxd) { rel.copy(pr).addScaledVector(d, mxd / dl); tgt[off].copy(sh[off]).add(rel); } }
      pr.copy(rel); }
    if (this.dbgOn && this.dbg) this.dbg.tL = tgt.map(v => v.clone());
    // the toss: until the ball leaves his hand the hand goes where the ball is, and lets it go from there
    const bl = m.ball, carrying = bl && bl.held === p.i && m.phase === 'toss';
    if (carrying) { this.tossW = Math.min(1, (this.tossW || 0) + dt * 6); tgt[off].lerp(_v8.set(bl.x, bl.y, bl.z), this.tossW);
      // a toss is made with a straight arm: the hand goes out to the arm's full length along the way to the ball
      const d = _v8.copy(tgt[off]).sub(sh[off]), dl = d.length(), L = (D.upper + D.fore) * 0.985 + 0.065 * H;
      if (dl > 1e-4 && dl < L) tgt[off].copy(sh[off]).addScaledVector(d.divideScalar(dl), lerp(dl, L, this.tossW)); }
    else this.tossW = Math.max(0, (this.tossW || 0) - dt * 8);
    if (!carrying && this.tossW > 0.001) tgt[off].lerp(this.hand[off], this.tossW * 0.5);
    // The toss arm once the ball has gone: on up after it, nearly straight and pointing at it, until the racket
    // comes up to the ball; then it pulls down in front of the face and the chest, the elbow folding, and tucks
    // in at the waist on its own side as the racket goes through. (Tracking cannot follow an arm that crosses in
    // front of the face, so this part of the serve is not taken from footage.)
    this.tossArmW = 0;
    if (st && st.kind === 'serve' && !carrying && m.ball && m.ball.held < 0 && (m.phase === 'toss' || (st.tc != null && t - st.tc < 0.7))) {
      const su = st.tc != null ? t - st.tc : -9;
      const toB = _v8.set(m.ball.x, Math.max(m.ball.y, sh[off].y + 0.4), m.ball.z).sub(sh[off]).normalize().lerp(UP, 0.3).normalize();
      const aim = _v9.copy(sh[off]).addScaledVector(toB, (D.upper + D.fore) * 0.97 + 0.07 * H);
      const P1 = W(0.02 * hs, 1.50, 0.46, _a), P2 = W(-0.06 * hs, 1.14, 0.38, _b);
      // (the tuck at the end is in front of the stomach as the chest faces then, near the middle: placed by the hips, with
      // the chest still turned from the swing, it put the hand beside the hip, and from behind he stood hand on hip)
      const cUt = _v6b.set(0, 1, 0).applyQuaternion(qChest), cFt = _v6c.copy(cUt).cross(cRight).normalize();
      const P3 = _c.copy(chest).addScaledVector(cUt, -0.40 * H).addScaledVector(cFt, 0.25 * H).addScaledVector(cRight, (off === 1 ? 1 : -1) * (globalThis.__tuckX ?? -0.05) * H);   /* (across the middle of the stomach, the elbow in by the side: tucked on its own side the elbow stood out, and from behind it was a hand on the hip) */   /* (a forearm's length out from the shoulder all the way: brought down closer, it passed the shoulder joint as the trunk turned and the hand jumped round it) */
      const k1 = sm((su + 0.24) / 0.14), k2 = sm((su + 0.10) / 0.12), k3 = sm((su - 0.02) / 0.23);
      const want = _v5.copy(aim).lerp(P1, k1).lerp(P2, k2).lerp(P3, k3);
      // (held tucked only through the landing: kept there past a third of a second, from behind the bent arm with its hand hidden
      // in front of him read as a hand on the hip as he came in)
      this.tossArmW = Math.min(this.tossW > 0 ? 1 - this.tossW : 1, 1 - sm((su - 0.22) / 0.2));
      tgt[off].lerp(want, this.tossArmW);
    }
    // Never a hand on the hip (after the toss arm, which tucks in by the hips' frame while the chest is still turned). Running, or coming out of a stroke into a run, the free hand at waist height is carried in
    // front of the stomach and in toward the middle, as a tennis player carries it: beside the hip with the elbow swung back
    // (where the runner's swing, held part way toward the ready position, left it) it read from every camera as a hand on
    // the hip, the elbow flared out where it could not go back through his back. (A soft floor, eased in by height: the arm
    // let hang lower, walking, and the finishes that throw it out behind are left alone.)
    // (and out of a serve or a smash, once the toss arm has tucked in: the tracked serve loses that arm behind his back as
    // he lands, and he walked off with the hand on the back of his hip)
    {
      // (in play only: once the point is over the arms are let hang, and held in front of the waist as they relaxed they were
      // bent at the elbow, hands at the waist, as if on the hips)
      const inPlay = m.phase === 'live' || m.phase === 'toss' || (m.phase === 'over' && speed > 2.2);   /* (and still running it out once the point is over: let hang at a run, the hands were at the hips) */
      // (and through a stroke's recovery once he is running out of it: the swing over, the free hand that rode at his hip from
      // the finish was carried there into the run, and handed on from there when the stroke let go)
      const ucR = st ? (st.tc != null ? t - st.tc : u) : -9, recovK = st && st.kind !== 'serve' && st.kind !== 'smash' && ucR > 0.15 ? sm((ucR - 0.15) / 0.2) * sm((speed - 2.0) / 1.5) : 0;   /* (from the finish on, once the ball is away) */
      let zw = !strolling && !this.posed && inPlay ? Math.max(freeOf(off) * (1 - sm(swA / 0.4)), recovK) * (1 - (this.addrHandW || 0)) : 0;
      let srvK = 0;
      if (st && (st.kind === 'serve' || st.kind === 'smash') && st.tc != null && !this.posed) { const su = t - st.tc; srvK = sm((su - 0.2) / 0.2) * (1 - sm((su - 1.3) / 0.4)); }
      const suH = st && (st.kind === 'serve' || st.kind === 'smash') && st.tc != null && !this.posed ? t - st.tc : -9, hkw = suH > -1 ? sm((suH - 0.05) / 0.12) * (1 - sm((suH - 1.3) / 0.4)) : 0;
      const rw2 = inPlay && !this.posed && !strolling ? (1 - sm(sw / 0.3)) * sm((speed - 1.5) / 1.5) * (1 - (this.addrArmW || 0)) : 0;
      if (zw > 0.001 || srvK > 0.001 || hkw > 0.001 || rw2 > 0.001) {
        const cU = _pb.set(0, 1, 0).applyQuaternion(qChest), cF = _pc.copy(cU).cross(cRight).normalize(), oU = _pa.copy(cRight).multiplyScalar(off === 1 ? 1 : -1);
        const rel = _v9.copy(tgt[off]).sub(sh[off]), y = rel.dot(cU), z = rel.dot(cF), x = rel.dot(oU);
        const band = sm((y + 0.58) / 0.12) * (1 - sm((y + 0.10) / 0.10)) * zw;
        if (band > 0.001) { const soft = d => 0.5 * (d + Math.sqrt(d * d + 0.0009));
          // (gathering after a serve the free hand comes on in toward the middle, where the racket will be: held in front of
          // its own hip, with the racket hand in front of the other, from behind he stood with both hands on his hips)
          tgt[off].addScaledVector(cF, soft(0.22 - z) * band).addScaledVector(oU, -soft(x + 0.06) * band); }
        if (this.dbgOn && this.dbg) { this.dbg.zw = zw; this.dbg.band = band; }
        // (and the racket hand, carried on a run, in front of the stomach toward the middle, as the racket is carried: left level
        // with its own shoulder and only a hand's breadth in front, its elbow stood out behind him to the side, and from behind
        // it was the other hand on the other hip)
        { if (rw2 > 0.001) { const hU2 = _rc1.copy(cRight).multiplyScalar(hit === 1 ? 1 : -1), rh = _rc2.copy(tgt[hit]).sub(sh[hit]), yh = rh.dot(cU), zh = rh.dot(cF), xh = rh.dot(hU2);
            const bandH = sm((yh + 0.58) / 0.12) * (1 - sm((yh + 0.10) / 0.10)) * rw2, soft = d => 0.5 * (d + Math.sqrt(d * d + 0.0009));
            if (bandH > 0.001) tgt[hit].addScaledVector(cF, soft(0.2 - zh) * bandH).addScaledVector(hU2, -soft(xh + 0.08) * bandH); } }
        // (out of a serve the free arm is let hang at his side, a little in front, until the ready position takes the racket back
        // into both hands: held alone in front of his stomach with the racket still down by the other leg, or tucked behind
        // the hip where the tracked serve loses it, from behind it was a hand on the hip)
        const hangK = srvK * (1 - (this.lgWE || 0)) * (1 - free) * (1 - sm((speed - 1.8) / 1.2));   /* (not running off after the serve: hanging straight down at a run, it was a hand on the hip from behind) */   /* (until the running arm takes it: walking or jogging in, it still hangs; the clip's own arm in between was the hand on the hip) */
        if (hangK > 0.001) { const L = D.upper + D.fore, hp = _v9.copy(sh[off]).addScaledVector(cU, -0.93 * L).addScaledVector(cF, 0.08).addScaledVector(oU, 0.03); tgt[off].lerp(hp, hangK); }
        // (and the racket hand, once the follow-through has swept past: left resting on its own hip, the racket pointing on
        // ahead out of sight, from behind it was the other hand on the other hip)
        // (as it comes down it goes on across the body to the other side, as a serve's follow-through does: the tracked serve
        // brings it back to his own hip, the elbow flared, a hand on the hip from behind; later it comes back toward the middle)
        if (hkw > 0.001) { const hU = _pa.copy(cRight).multiplyScalar(hit === 1 ? 1 : -1), rh = _v9.copy(tgt[hit]).sub(sh[hit]), yh = rh.dot(cU), zh = rh.dot(cF), xh = rh.dot(hU);
          const bh = sm((yh + 0.62) / 0.12) * (1 - sm((yh + 0.06) / 0.10)) * hkw, soft = d => 0.5 * (d + Math.sqrt(d * d + 0.0009)), xMax = -0.22 + 0.18 * sm((suH - 0.45) / 0.45);
          if (bh > 0.001) tgt[hit].addScaledVector(cF, soft(0.26 - zh) * bh).addScaledVector(hU, -soft(xh - xMax) * bh); }
      }
    }
    // A one-handed backhand's finish, and any backhand slice's, sends the free arm back and down behind him nearly straight,
    // balancing the racket arm: placed at the hip, as the keys and the borrowed clips leave it, the elbow bent out round it and
    // from behind it was a hand on the hip through Sampras' and Federer's finishes.
    if (st && st.wing === 'bh' && st.tc != null && !this.posed && (this.oneHand ? !/^(volley|block|smash|serve)$/.test(st.__dk || st.kind) : /^(slice|drop)$/.test(st.__dk || st.kind))) {
      const ucB = t - st.tc, wB = sm((ucB - 0.02) / 0.12) * (1 - sm((ucB - 0.5) / 0.25)) * (1 - (this.gripW || 0)) * swA;
      if (wB > 0.001) { const L = (D.upper + D.fore) * 0.98, d = _rc1.copy(tgt[off]).sub(sh[off]), dl = d.length();
        if (dl > 1e-3 && dl < L) tgt[off].copy(sh[off]).addScaledVector(d.multiplyScalar(1 / dl), lerp(dl, L, wB)); }
    }
    // and a slice's racket arm runs on out toward the target nearly straight after the ball: held 30 cm in front of the waist,
    // its elbow stood out to the side, and from behind a left-hander's slice finish was a hand on the hip
    if (st && st.wing === 'bh' && st.tc != null && !this.posed && /^(slice|drop)$/.test(st.__dk || st.kind)) {
      const ucS = t - st.tc, wS = sm((ucS - 0.04) / 0.12) * (1 - sm((ucS - 0.42) / 0.2)) * swA;
      if (wS > 0.001) { const L = (D.upper + D.fore) * 0.96, d = _rc1.copy(tgt[hit]).sub(sh[hit]), dl = d.length(), cFs = _rc2.set(0, 0, -1).applyQuaternion(qChest);
        const fz = sm((d.dot(cFs) / Math.max(dl, 1e-3) - 0.1) / 0.2);
        if (dl > 1e-3 && dl < L && fz > 0.001) tgt[hit].copy(sh[hit]).addScaledVector(d.multiplyScalar(1 / dl), lerp(dl, L, wS * fz)); }
    }
    // And wherever a free hand that holds nothing is down at its own hip and not in front of him, its arm hangs nearly straight:
    // bent there, the elbow stood out to the side, and in a slice's recovery (the hand coming round from behind him to the
    // racket) or a finish let go of, from behind it was a hand on the hip.
    // (and after a serve, once the free arm has come down from the toss and the body has landed: bent there, the hand by the
    // hip, from behind Nadal stood with his hand on his hip as he came in from the line)
    const srvDown = st && st.kind === 'serve' && st.tc != null ? sm((t - st.tc - 0.2) / 0.1) : 0;
    { const inPl = (m.phase === 'live' || m.phase === 'toss' || (m.phase === 'over' && speed > 2.2)) && !this.posed && !(st && st.kind === 'smash') && (!(st && st.kind === 'serve') || srvDown > 0.001);
      if (inPl && (this.gripW || 0) < 0.6) { const cU = _rc2.set(0, 1, 0).applyQuaternion(qChest), cF = _hu2.copy(cU).cross(cRight).normalize(), sxO = off === 1 ? 1 : -1;
        const d = _rc1.copy(tgt[off]).sub(sh[off]), dl = d.length(), hy = d.dot(cU), hz = d.dot(cF), hx = d.dot(cRight) * sxO;
        const srvK = st && st.kind === 'serve' ? srvDown : 1, hzW = st && st.kind === 'serve' ? 0.22 : 0.08;
        const hz2 = sm((hy + 0.62) / 0.1) * (1 - sm((hy + 0.16) / 0.1)) * (1 - sm((hz - hzW) / 0.1)) * sm((hx + 0.04) / 0.08) * (1 - (this.gripW || 0) / 0.6) * (1 - sm((speed - 3) / 1.5)) * srvK, L = (D.upper + D.fore) * 0.985;
        if (hz2 > 0.001 && dl > 1e-3 && dl < L) tgt[off].copy(sh[off]).addScaledVector(d.multiplyScalar(1 / dl), lerp(dl, L, hz2)); } }
    // A forehand's turn: the free hand, off the racket, comes up and forward with the shoulders to point across at the ball, at
    // about the chest. (Left low in front of the waist, as some of the tracked swings carry it, the forearm was hidden by the
    // body from behind and the elbow stood out at his side: a hand on the hip.)
    if (st && st.wing === 'fh' && !/^(serve|smash|volley|block)$/.test(st.__dk || st.kind) && !this.posed && !globalThis.__noTurnArm) {
      const wT = sm5((u + 0.98) / 0.16) * (1 - sm5((u + 0.32) / 0.14)) * swA * (1 - (this.gripW || 0));
      if (wT > 0.001) { const cU = _rc2.set(0, 1, 0).applyQuaternion(qChest), cF = _hu2.copy(cU).cross(cRight).normalize(), d = _rc1.copy(tgt[off]).sub(sh[off]), hy = d.dot(cU), hz = d.dot(cF);
        if (hy < -0.28) tgt[off].addScaledVector(cU, (-0.28 - hy) * wT);
        if (hz < 0.36) tgt[off].addScaledVector(cF, (0.36 - hz) * wT); }
    }
    if (this.dbgOn && this.dbg) this.dbg.tZ = tgt.map(v => v.clone());
    const dir = _dir.set(pose.dir[0] * hs, pose.dir[1], -pose.dir[2]).applyQuaternion(qYaw).normalize();
    const nrm = _nrm.set(pose.nrm[0] * hs, pose.nrm[1], -pose.nrm[2]).applyQuaternion(qYaw).normalize();
    if (clipW > 0.001 && (serverWait || srvSt)) {
      const fk = (serverWait ? 1 : 1 - sm((u + 1.08) / 0.24)) * clipW * (1 - (this.addrArmW || 0));
      if (fk > 0.001) { const fd = cdir(ARM_J[hit][1], ARM_J[hit][2], _v8), cf = _v9.set(0, 0, -1).applyQuaternion(qChest); fd.multiplyScalar(0.72).addScaledVector(cf, 0.62).addScaledVector(UP, -0.12).normalize(); dir.lerp(fd, fk).normalize(); if (Math.abs(nrm.dot(dir)) > 0.9) nrm.copy(cRight); }
    }
    // a tracked groundstroke: the racket is carried by the tracked forearm. Its angle to the forearm (the wrist)
    // comes from the stroke's keys, measured against where the keys' own forearm points, so wrist and racket
    // move with the real arm instead of being laid on top of it
    if (this.dbgOn) this.dbgDir = { c0: dir.clone() };
    const carryK = st && (st.kind === 'serve' || st.kind === 'smash') ? sm((u + 1.08) / 0.24) : 1;      // a serve: once the address is over
    if (armW * carryK > 0.001 && st) {
      const fa = _v8.copy(cWr[hit]).sub(sh[hit]).normalize();                                      // the tracked arm, shoulder to wrist
      const kfa = _v9.copy(_keyHand).sub(sh[hit]).normalize();                                     // the keys' arm
      const q = _q5.setFromUnitVectors(kfa, fa);                                                   // the keys' arm onto the tracked one
      // (and where the two arms point near opposite ways, the shortest turn from one onto the other has no settled axis: a
      // finish over the far shoulder in the keys and one beside the head in the clip (Agassi's), and the least change in
      // either swung the axis round and the racket with it, sixty degrees a frame. There the turn of the frame before is
      // carried on by how much each arm moved since, which can't spin; the shortest turn as before where they are closer.)
      if (!globalThis.__carryPtOld) {
        const ang = Math.acos(clamp(kfa.dot(fa), -1, 1)), pt = this.carryPt || (this.carryPt = { q: new THREE.Quaternion(), kfa: V(), fa: V(), ok: false, st: null, pt: null });
        // (and the turn of the frame before goes over to the shortest one no faster than the arms themselves moved, and a few
        // degrees a frame besides: where the two agree that is at once, as before; where they had parted, near opposite, the
        // racket turns back round the arm over a few frames instead of flicking round it in one)
        if (pt.ok && pt.st === st && pt.pt === this.placedT) { const qt = _qPt.setFromUnitVectors(pt.fa, fa).multiply(pt.q).multiply(_qPt2.setFromUnitVectors(pt.kfa, kfa).invert());
          const mxA = (globalThis.__carryRate ?? 0.14) * dt * 60 + Math.acos(clamp(pt.fa.dot(fa), -1, 1)) + Math.acos(clamp(pt.kfa.dot(kfa), -1, 1));
          if (qt.angleTo(q) > mxA) q.copy(qt.rotateTowards(q, mxA)); }
        if (this.dbgOn) this.dbgCarry = { ang: +ang.toFixed(2), ok: pt.ok && pt.st === st, w: +armW.toFixed(2), kfa: kfa.clone(), fa: fa.clone() };
        pt.q.copy(q); pt.kfa.copy(kfa); pt.fa.copy(fa); pt.ok = true; pt.st = st; pt.pt = this.placedT; }
      // (part of the turn, not a straight blend of each direction: blended straight, the face's normal passed through nothing
      // half way where the two faces were near opposite, and the racket, the hand round it, and both arms with it on a
      // two-hander, rolled over in a frame as a clip handed its finish back to the keys)
      // Once the clip is held at its finish, so is the racket on its arm: the racket as carried then, and the clip let go of
      // from there toward the keys' own racket the shortest way. (Carried on, the racket followed the keys' wrist through
      // their own recovery on an arm that was standing still, and where the two arms were far apart that turned into the
      // racket looping round the hand, two hundred and seventy degrees in a tenth of a second, at the end of every one of
      // Nadal's backhands.)
      // (and so is a lob's, a slice's or a drop's as his own drive's take-back is let go of for the shot's keys: Djokovic's
      // drive drops the racket head behind him where a slice's keys hold it up, and the racket flipped over in six frames)
      const hu0 = this.ocHoldU, tb0 = this.ocTbU, wq = armW * carryK;
      // (and as the clip is let go of after the hit for any reason, a player moving off to recover: carried on while the keys'
      // arm went back to ready on its own, the racket turned twice as fast as either, sixty degrees a frame)
      // (no longer held as a moving player's clip is let go of: the final turn limit below catches the loops this was for, and
      // held, the racket pointed back while the arm came up and forward, and had to be wrenched round his head to catch up)
      const letGo = !!globalThis.__letGoOn && st.tc != null && t - st.tc > 0.2 && wq < 0.97;
      if (!globalThis.__holdRkOld && ((hu0 != null && u > hu0) || (tb0 != null && u > tb0) || letGo) && !(st.kind === 'serve' || st.kind === 'smash')) {
        const hz = this.holdRk || (this.holdRk = { st: null, pt: null, d: V(), n: V() }), qi = _hzQ.copy(qYaw).invert();
        // (kept in the body's frame, so it turns with him if he turns while it is held)
        if (hz.st !== st || hz.pt !== this.placedT) { hz.d.copy(dir).applyQuaternion(q).applyQuaternion(qi).normalize(); hz.n.copy(nrm).applyQuaternion(q).applyQuaternion(qi).normalize(); hz.st = st; hz.pt = this.placedT; }
        const hd = _hzD.copy(hz.d).applyQuaternion(qYaw), hn = _hzE.copy(hz.n).applyQuaternion(qYaw);
        const rq = _qPt.setFromUnitVectors(dir, hd);
        // (carried from the frame before as the two directions move, and eased onto the shortest turn as the carry above is:
        // a held finish wrapped round the neck and the keys' racket at ready are near opposite, and the shortest way between
        // swung round with every few degrees the keys moved, the racket swept over his head at forty degrees a frame)
        if (!globalThis.__hzPtOld) { const hb = hz.tr || (hz.tr = { q: new THREE.Quaternion(), d0: V(), h0: V(), ok: false, st: null });
          if (hb.ok && hb.st === st && dt > 0) { const qt = _qT1.setFromUnitVectors(hb.h0, hd).multiply(hb.q).multiply(_qT2.setFromUnitVectors(hb.d0, dir).invert());
            const mxA = (globalThis.__carryRate ?? 0.14) * dt * 60 + Math.acos(clamp(hb.h0.dot(hd), -1, 1)) + Math.acos(clamp(hb.d0.dot(dir), -1, 1));
            if (qt.angleTo(rq) > mxA) rq.copy(qt.rotateTowards(rq, mxA)); }
          hb.q.copy(rq); hb.d0.copy(dir); hb.h0.copy(hd); hb.ok = true; hb.st = st; }
        const n1 = _hzN.copy(nrm).applyQuaternion(rq), ax = _hzK2.copy(dir).applyQuaternion(rq).normalize();
        const a1 = n1.addScaledVector(ax, -n1.dot(ax)), a2 = _hzM.copy(hn).addScaledVector(ax, -hn.dot(ax)); let tw = 0;
        if (a1.lengthSq() > 1e-8 && a2.lengthSq() > 1e-8) { a1.normalize(); a2.normalize(); tw = Math.atan2(_hzK.copy(a1).cross(a2).dot(ax), clamp(a1.dot(a2), -1, 1)); }
        const qw = _qCarry.identity().slerp(rq, wq); dir.applyQuaternion(qw).normalize(); nrm.applyQuaternion(qw).applyAxisAngle(dir, tw * wq).normalize();
      } else { const qw = _qCarry.identity().slerp(q, wq); dir.applyQuaternion(qw).normalize(); nrm.applyQuaternion(qw).normalize(); }
      if (this.dbgOn) { this.dbgDir.c1 = dir.clone(); this.dbgHold = { letGo, hu0: hu0 != null ? +hu0.toFixed(2) : null, tb0, wq: +wq.toFixed(3), u: +u.toFixed(3) }; }
    }
    // Djokovic keeps the racket's head up through his turn, the racket upright beside him before it goes back: his own
    // arm carries the shared keys' racket out flat at the height of his head there, which from behind is a racket laid
    // over his head. Its head is kept at least this far above level until the carry has it upright of itself.
    const hu = st && HEAD_UP[(this.look.name || '') + '/' + st.wing];
    if (hu && armW > 0.001 && !/^(serve|smash|volley|block|slice|drop)$/.test(st.__dk || st.kind)) {
      const w = armW * sm5((u - hu[0]) / 0.1) * (1 - sm5((u - hu[1]) / 0.12)), hl = Math.hypot(dir.x, dir.z);
      // (the face turned with it by the same turn: squared off against the new direction instead, a face that was nearly along
      // it flipped over, and the hand and wrist with it)
      if (w > 0.001 && dir.y < hu[2] && hl > 1e-3) { const k = Math.sqrt(1 - hu[2] * hu[2]) / hl, d0 = _hu2.copy(dir); dir.lerp(_hu.set(dir.x * k, hu[2], dir.z * k), w).normalize(); nrm.applyQuaternion(_huq.setFromUnitVectors(d0, dir)).normalize(); }
    }
    // meet the ball: move the swing so the strings arrive where the ball actually is. The whole swing is shifted by one
    // amount, the gap between the ball and where this swing's own racket head is AT CONTACT (its keys, or its clip, at
    // u = 0, placed on him as he stands now). Measured from where the head is mid-swing instead (pointing down behind his
    // back in an overhead, back past his hip in a forehand), the gap would change by a metre within a tenth of a second and
    // haul the hand up and down with it.
    // (The clips were filmed in practice, the ball met at the chest: in a match it is mostly at the waist, half a metre lower.
    // Moved only around contact, the hand dipped half a metre into the ball and sprang back in a third of a second, a whip
    // the arm never makes. So the whole swing is moved, eased in through the take-back and out through the recovery: the
    // hand keeps the clip's own speed all the way, and the legs take part of a low ball, below.)
    this.metW = 0;
    // (before he lets go, toward where the plan has the ball met, on the wind-up's own clock: switched on only at the release,
    // the whole swing was moved up to forty centimetres in the frame he let go; and what is left between the plan's contact
    // and the real one is let go of over the time to contact, not jumped)
    const cpE = st ? (st.tc != null ? this.cpGone(st, p, t) : st.cpPlan) : null;
    if (!this.shPrev) { this.shPrev = V(); this.shOff = V(); this.shOffT = -9; this.shOffD = 0.15; this.shK = -1; }
    if (this.shSt !== st) { this.shSt = st; this.shK = -1; this.shOffT = -9; this.shPrev.set(0, 0, 0); }
    let shRan = false;
    if (st && cpE && keys && st.kind !== 'serve') {
      // (its height over the whole swing: a low ball is got down to from the start, the racket taken back low; across and
      // forward only through the swing at it: the take-back stays by the body, as a player's does, and the swing bends out
      // to wherever the ball is, then the finish comes back)
      // (a volley is set, not swung: the racket is put in the ball's path through the set-up, and the punch at it is short;
      // brought there only in the last third of a second, the arm was flung out to the ball in a few frames)
      const setK = /^(volley|block)$/.test(st.__dk || st.kind) ? 1 : 0;
      // (a slice's follow-through goes on toward the target from wherever the ball was met: a ball taken late, behind the keys'
      // contact, kept the swing a third of a metre back through the finish, and from behind the racket hand ended on the hip)
      const slK = /^(slice|drop)$/.test(st.__dk || st.kind) ? 1 : 0;
      const uu = u, w = sm5((uu + 0.8) / 0.5) * (1 - sm5((uu - 0.03) / lerp(0.32, 0.24, slK))) * sw, wh = sm5((uu + lerp(0.34, 0.75, setK)) / lerp(0.3, 0.4, setK)) * (1 - sm5((uu - lerp(0.04, 0.02, slK)) / lerp(0.42, 0.26, slK))) * sw;
      if (w > 0.002) {
        const p0 = keys.at(0, this, st.wing === 'fh' ? 1 : -1), h0 = W(p0.R[0] * hs, p0.R[1], p0.R[2], _pa);
        const d0 = _pb.set(p0.dir[0] * hs, p0.dir[1], -p0.dir[2]).applyQuaternion(qYaw).normalize();
        let cShC = null;
        if (OC && armW > 0.001) { const S0 = sampleAt(OC, 0, this._S0 || (this._S0 = new Float32Array(N3))), j = ARM_J[hit][2], js = ARM_J[hit][0];
          // (and the racket as the tracked forearm will carry it then, the same turn of the keys' arm onto the clip's that
          // places it every frame: taken from the keys alone, the strings were put a racket's angle away from where they
          // arrived, and the last tenth of a second before contact had to snap them onto the ball)
          const cw = W(S0[j * 3], S0[j * 3 + 1], S0[j * 3 + 2], _pc), csh = W(S0[js * 3], S0[js * 3 + 1], S0[js * 3 + 2], _cq);
          const q0 = _q5.setFromUnitVectors(_bm.copy(h0).sub(csh).normalize(), _be.copy(cw).sub(csh).normalize());
          d0.lerp(_bm.copy(d0).applyQuaternion(q0), armW).normalize(); h0.lerp(cw, armW); cShC = _shC.copy(csh); }
        const nomHead = h0.addScaledVector(d0, (B.headC + GRIP_UP) * H);
        (this.metGap || (this.metGap = V())).set(cpE.x - nomHead.x, cpE.y - nomHead.y, cpE.z - nomHead.z); this.metW = w; this.metCpY = cpE.y;
        // The height first, by the swing's plane: a ball lower (or higher) than the clip's own contact is reached the way a
        // player reaches it, the whole arm and racket swung round the shoulder lower, keeping their shape and the racket's
        // angle to the forearm. (Taken as a slide of the hand alone, thirty centimetres down and the rest by bending the racket
        // at the wrist, the arm was squashed at contact and the racket pointed at the court: the tracked contacts are at chest
        // height, the balls of a rally at the waist.)
        const shP = cShC || sh[hit], vA = _rv1.copy(nomHead).sub(shP), vl = vA.length(), vh = Math.hypot(vA.x, vA.z);
        let rotTh = 0;
        // (the height wanted is from his own shoulder as it is, lower when the legs have taken part of a low ball)
        if (vl > 0.2 && vh > 0.05 && !globalThis.__noRot) { const e0 = Math.atan2(vA.y, vh), e1 = Math.asin(clamp((cpE.y - sh[hit].y) / vl, -0.95, 0.95)); rotTh = clamp(e1 - e0, -0.62, 0.35); }
        // (through the forward swing, as the racket comes to the ball: begun with the take-back, the dropped racket was swung on
        // down to hang straight at the shins before every low ball)
        const wr = sm5((uu + lerp(0.3, 0.7, setK)) / lerp(0.26, 0.4, setK)) * (1 - sm5((uu - 0.05) / 0.32)) * sw, th = rotTh * wr;
        if (Math.abs(th) > 1e-4) { const ax = _rv2.copy(vA).cross(UP); if (ax.lengthSq() > 1e-8) { ax.normalize(); _rq.setFromAxisAngle(ax, th);
            tgt[hit].sub(sh[hit]).applyQuaternion(_rq).add(sh[hit]); dir.applyQuaternion(_rq).normalize(); nrm.applyQuaternion(_rq).normalize();
            const gw = this.gripW || 0; if (gw > 0.001) { const q2 = _rq2.copy(_rq); q2.slerp(_iq2.identity(), 1 - gw); tgt[off].sub(sh[hit]).applyQuaternion(_rq.set(q2.x, q2.y, q2.z, q2.w)).add(sh[hit]); } } }
        // what is left after it is closed as before: across and forward by moving the hand, any height the plane could not
        // give by a smaller slide
        const headY1 = sh[hit].y + vl * Math.sin(Math.atan2(vA.y, vh) + rotTh);
        _v9.set(cpE.x - nomHead.x, cpE.y - headY1, cpE.z - nomHead.z);
        // (the hand goes no more than 40 cm toward it, 35 up or down: a ball further off is met by tilting the racket at
        // the wrist and the legs taking the height, below; asked to go a metre, the hand was hauled down by the ankles and
        // both arms went straight through the body to follow it)
        _v9.y = globalThis.__noRot ? clamp(_v9.y, -0.35, 0.3) : clamp(_v9.y, -0.2, 0.2); if (_v9.length() > 0.4) _v9.setLength(0.4);
        // (down toward a low ball only as the racket comes forward to it: lowered through the whole take-back too, the bottom of
        // the loop was pushed into the court and the racket dragged along it before every low forehand)
        if (_v9.y < 0) _v9.y *= lerp(0.35, 1, sm5((uu + lerp(0.32, 0.7, setK)) / 0.24));
        // (and only toward a ball he is nearly at: with the place it will be met still metres off, his legs still taking him there,
        // the hands were pulled the whole forty centimetres at it through the set-up of every volley he ran in to, a forehand
        // volley's racket hand dragged across his chest, a backhand's both arms locked straight out in front; at the ball, a
        // stretch for one still out of reach, it reaches all the same)
        // (but not at a ball that goes by two metres and more off, swung at and missed: reached the whole forty centimetres toward
        // one passing thirteen metres away, a forehand's finish was dragged across and the arm folded into the chest)
        const gH = Math.hypot(this.metGap.x, this.metGap.z), farK = globalThis.__farOld ? 1 : lerp(1 - sm((gH - 0.9) / 0.7), globalThis.__whiffOld ? 1 : 1 - sm((gH - 1.8) / 1.2), sm5((uu + 0.12) / 0.1));
        _v9.set(_v9.x * wh * farK, _v9.y * w, _v9.z * wh * farK);
        // (and after the ball, none of it back toward the body: the finish wraps the hands round close to the chest, and a swing moved
        // a fifth of a metre back for a ball met deep, kept moved through the finish, put a two-hander's arms into it)
        if (!globalThis.__finShiftOld && uu > 0) { const fz = _v9.x * fwd.x + _v9.z * fwd.z; if (fz < 0) { const k = sm5(uu / 0.1); _v9.x -= fwd.x * fz * k; _v9.z -= fwd.z * fz * k; } }
        // (and back toward the body no further than leaves the hand a forearm in front of the chest: a ball taken at the body or
        // late, the swing moved back a third of a metre toward it, and the hands and forearms went into the chest; a volley at
        // the body is played with the racket in front and the elbows out, the ball met close to the strings' throat)
        if (!globalThis.__backCapOld) backCap(_v9, tgt[hit]);
        const sK = (st.tc != null ? 1 : 0) + (st.cp === cpE ? 0 : 2), sO = this.shOff;
        if (this.shK !== sK) { sO.copy(this.shPrev).sub(_v9); this.shOffT = t; this.shOffD = st.tc != null ? clamp((st.tc - t) * 0.8, 0.06, 0.15) : 0.15; }
        this.shK = sK; shRan = true;
        { const k = 1 - sm5((t - this.shOffT) / this.shOffD); if (k > 0.001) _v9.addScaledVector(sO, k); }
        this.shPrev.copy(_v9);
        if (this.dbgOn) this.shiftNow = { x: +_v9.dot(right).toFixed(3), y: +_v9.y.toFixed(3), z: +_v9.dot(fwd).toFixed(3), gx: +this.metGap.dot(right).toFixed(3), gy: +this.metGap.y.toFixed(3), gz: +this.metGap.dot(fwd).toFixed(3), u: +uu.toFixed(3) };
        shiftClear(_v9, tgt[hit]);
        tgt[hit].add(_v9);
        // the free hand goes with it: all the way while it holds the racket, half once it has let go (the body is lower and
        // nearer the ball, not the racket arm alone)
        // (but not back toward the body, a hand that holds nothing: a ball met late behind him took the swing back a quarter of a
        // metre, and the free hand out in front of the chest was taken back into it)
        { const sF = _shF.copy(_v9).multiplyScalar(0.5 + 0.5 * (this.gripW || 0)); if (!globalThis.__freeBackOld) { const fz = sF.x * fwd.x + sF.z * fwd.z, g = 1 - (this.gripW || 0); if (fz < 0) { sF.x -= fwd.x * fz * g; sF.z -= fwd.z * fz * g; } } tgt[off].add(sF); }
        if (this.dbgOn && this.dbg && Math.abs(uu) < 0.009) this.dbg.shift = { kind: st.kind, wing: st.wing, x: _v9.dot(right), y: _v9.y, z: _v9.dot(fwd), clip: !!(OC && armW > 0.001) };
      }
    }
    if (this.dbgOn && this.dbg) this.dbg.tS = tgt.map(v => v.clone());
    if (!shRan) { this.shPrev.set(0, 0, 0); this.shK = -1; }
    if (st && st.kind === 'serve' && st.tc != null && m.ball && m.ball.visible !== false) {
      const uu = t - st.tc, w = Math.exp(-(uu * uu) / 0.006);
      if (w > 0.01 && uu < 0.02) { const b = m.ball, nomHead = _v8.copy(tgt[hit]).addScaledVector(dir, (B.headC + GRIP_UP) * H); tgt[hit].addScaledVector(_v9.set(b.x - nomHead.x, b.y - nomHead.y, b.z - nomHead.z), w * 0.9); }
    }
    // Hands and racket follow their targets exactly, so nothing trails a fast swing. Where a target jumps
    // (a new pose, a swing started late) the jump is taken up by an offset that dies away in a few
    // hundredths of a second: the hand carries on from where it was and nothing snaps.
    // Into a stroke from wherever the arms were. The stroke's own targets take over at once, and the difference between
    // them and where the hands and racket really are (the arms pumping as he ran, or holding the racket in the ready
    // position) is carried with them and let go of smoothly over a third of a second. Blended instead, the stroke's take-back
    // mixed with a running arm still swinging through its own stride, and the arm flailed on its way into the wind-up.
    if (!this.handInit && st) this.inSt = st;          // (just placed or re-posed, the hands are where the stroke has them: nothing to carry in)
    // (and whenever the stroke being shown changes, whatever the reason, a finish handed to a new wind-up, a wind-up let go of,
    // a stroke the engine dropped the frame before its contact: the hands carry on from where they were and are let go of over
    // a quarter of a second; each of those was a frame where both arms jumped)
    const selKey = st || null, selChanged = this.handInit && this.inKey !== undefined && selKey !== this.inKey && !(st && st.kind === 'serve') && !(this.inKey && this.inKey.kind === 'serve');
    this.inKey = selKey;
    const entry = st && st.kind !== 'serve' && st !== this.inSt && this.handInit && sw > 0 && swA === 1;
    if (entry || selChanged) {
      // (over three quarters of the time left to contact: over half of it, a metre's difference was let go of at eleven metres
      // a second, the free arm whipped into a slice's take-back)
      this.inFreeA = this.lastFreeA || 0; this.inSt = selKey; this.inT = t; const tcE = st ? (st.tc != null ? st.tc : st.tcPlan) : null; this.inDur = !entry ? 0.25 : tcE != null ? clamp((tcE - t) * 0.75, 0.1, 0.32) : 0.32;   /* (a person's swing before he lets go: the planned contact; given the whole third of a second for a swing begun a fifth of a second before the ball, the hands were held back and let go of forty centimetres in the last frame) */
      const io = this.inOff || (this.inOff = [V(), V()]);
      for (let i = 0; i < 2; i++) { const d = _cq.copy(this.hand[i]).sub(tgt[i]); io[i].set(d.dot(right), d.y, d.dot(fwd)); }
      (this.inQ || (this.inQ = new THREE.Quaternion())).setFromUnitVectors(_cq.copy(dir).normalize(), _bm.copy(this.rk.dir).normalize());
    }
    if (this.inT != null && (st || null) === this.inSt && !(st && st.kind === 'serve')) {
      const k = 1 - sm5((t - this.inT) / this.inDur);
      // (the free arm already pumping on a run lets go of where it was twice as fast: carried back toward its last place, by the
      // hip, for a quarter of a second as a stroke let go of it, it was a hand on the hip from behind)
      const fP = Math.max(freeA, this.inFreeA || 0), kF = 1 - sm5((t - this.inT) / (this.inDur * (1 - 0.55 * sm((fP - 0.3) / 0.4)))), kk = [k, k]; kk[off] = Math.min(k, kF);   /* (pumping as the stroke began, not only now: a stroke takes the arms at once, and the hand held back at the bottom of its pump for a fifth of a second sat on the hip) */
      // (and the racket hand too, running and out of any stroke: held back where the last stroke left it, the racket was carried
      // beside the hip)
      { const runK = (1 - sm(sw / 0.3)) * sm((speed - 2.0) / 1.5); if (runK > 0.001) kk[hit] = lerp(k, Math.min(k, 1 - sm5((t - this.inT) / (this.inDur * 0.45))), runK); }
      // (and the way it is carried goes round the front of the trunk, not through it: carried straight, in the frame of where he
      // faces while the trunk turned side-on for the take-back, a hand taken from the running arm's place by one hip to a slice's
      // set-up by the other shoulder went through the middle of his chest, ten centimetres deep)
      if (k > 0.001) { for (let i = 0; i < 2; i++) { const o = this.inOff[i], ki = kk[i]; const e0 = globalThis.__inRoundOld ? 9 : trunkE(tgt[i]); tgt[i].addScaledVector(right, o.x * ki).addScaledVector(UP, o.y * ki).addScaledVector(fwd, o.z * ki);
          if (!globalThis.__inRoundOld && ki > 0.001) { const need = Math.min(1, e0); if (trunkE(tgt[i]) < need - 1e-3) { const fwT = _inF.copy(_stF), T0 = _inT.copy(tgt[i]); let lo = 0, hi = 0.6; if (trunkE(_stQ.copy(T0).addScaledVector(fwT, hi)) < need - 1e-3) lo = hi; else for (let it = 0; it < 8; it++) { const mid = (lo + hi) / 2; if (trunkE(_stQ.copy(T0).addScaledVector(fwT, mid)) < need - 1e-3) lo = mid; else hi = mid; } tgt[i].addScaledVector(fwT, hi); } } }
        _iq2.identity().slerp(this.inQ, k); dir.applyQuaternion(_iq2).normalize(); nrm.applyQuaternion(_iq2).normalize(); }
    }
    // Last of all, wherever the targets came from (the keys, his clip, a stroke let go of and blended into the run by how much is
    // left of it, the carry in from where the hands were), a hand is never asked to be inside the trunk: one that would be is
    // asked to be just in front of it instead, by the least move forward that clears it. (A slice called off as he ran had the
    // racket hand blended from by the far shoulder to its running place by the near hip, straight through the middle of him, and
    // the forearm was drawn in his stomach for the tenth of a second the stroke took to fade.) Not in a serve, an overhead or a
    // reaction after the point, whose hands are on the body where they are meant to be.
    if (!globalThis.__tgtClearOld && !(st && (st.kind === 'serve' || st.kind === 'smash')) && !((this.reactK || 0) > 0.01)) {
      const mz = _stM.copy(sh[0]).add(sh[1]).multiplyScalar(0.5), ax = _stA.copy(mz).sub(pelvis), L = ax.length();
      if (L > 1e-3) { ax.multiplyScalar(1 / L); const rt = _stX.copy(sh[1]).sub(sh[0]); rt.addScaledVector(ax, -rt.dot(ax)); const shW = rt.length();
        if (shW > 1e-3) { rt.multiplyScalar(1 / shW); const fw = _stF.copy(ax).cross(rt), mg = globalThis.__tgtMg ?? 0.05;
          const eAt = q => { const rel = _stR.copy(q).sub(pelvis), al = rel.dot(ax); if (al < 0 || al > L * 1.05) return 9; const nk = al < 0.4 * L ? 0.75 + 0.25 * al / (0.4 * L) : al > 0.9 * L ? 0.75 : 1, dx = rel.dot(rt), dz = rel.dot(fw); return Math.hypot(dx / (shW * 0.39 * nk + mg), dz / ((dz > 0 ? shW * 0.25 : shW * 0.32) * nk + mg)); };
          for (let i = 0; i < 2; i++) { if (eAt(tgt[i]) >= 1) continue; const T0 = _inT.copy(tgt[i]); let lo = 0, hi = 0.6; for (let it = 0; it < 9; it++) { const mid = (lo + hi) / 2; if (eAt(_stQ.copy(T0).addScaledVector(fw, mid)) < 1) lo = mid; else hi = mid; } tgt[i].addScaledVector(fw, hi); if (this.dbgOn) (this.dbgTC || (this.dbgTC = [0, 0]))[i] = +hi.toFixed(3); } } } }
    if (this.dbgOn && this.dbg) this.dbg.tI = tgt.map(v => v.clone());
    if (this.dbgOn && this.dbgDir) this.dbgDir.c2 = dir.clone();
    const first = !this.handInit; this.handInit = true;
    if (!this.fol) { const F = () => ({ off: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3(), n: 0 }); this.fol = [F(), F(), F(), F()]; }
    // (the follow keeps its own hands and racket: what is done to them after it each frame, the push out of the body, the
    // strings put onto the ball, the hand on the grip, is that frame's alone and is not carried into the next as an offset,
    // where it was added again on top of itself)
    const hF = this.handF || (this.handF = [this.hand[0].clone(), this.hand[1].clone()]), rF = this.rkF || (this.rkF = { dir: this.rk.dir.clone(), nrm: this.rk.nrm.clone() });
    if (first) { hF[0].copy(this.hand[0]); hF[1].copy(this.hand[1]); rF.dir.copy(this.rk.dir); rF.nrm.copy(this.rk.nrm); }
    // (through the swing at the ball the hands' paths bend and speed up hard, from ten to thirty centimetres a frame at contact:
    // taken there for a jump, the racket hand was held where it had been for two frames and then thrown after its swing,
    // seventy degrees in a frame; real jumps there are let go of by the stroke's own blends)
    const ucF = st && st.kind !== 'serve' ? (st.tc != null ? t - st.tc : u) : 9, thrK = Math.exp(-(ucF * ucF) / 0.03) * sw;
    // (just after contact, as the swing slows into its finish, the smoothing follows the swing closely and carries little of
    // its own momentum: carried at the speed it had through the ball, the hand ran on at twice the swing's speed for a few
    // frames and the arms were flung into the finish)
    const postK = globalThis.__noPost ? 0 : sm((ucF - 0.005) / 0.04) * (1 - sm((ucF - 0.35) / 0.15)) * sw, alF = lerp(0.6, 0.85, postK), beF = lerp(0.5, 0.15, postK);
    follow(hF[0], tgt[0], this.fol[0], dt, 0.025 * H + 0.25 * thrK, first, alF, beF); follow(hF[1], tgt[1], this.fol[1], dt, 0.025 * H + 0.25 * thrK, first, alF, beF);
    if (this.dbgOn) { const r3 = v => [+(v.x - p.x).toFixed(3), +v.y.toFixed(3), +(v.z - p.z).toFixed(3)]; this.dbgTgt = [r3(tgt[0]), r3(tgt[1])]; this.dbgHF = [r3(hF[0]), r3(hF[1])]; }
    follow(rF.dir, dir, this.fol[2], dt, 0.12, first); rF.dir.normalize();
    follow(rF.nrm, nrm, this.fol[3], dt, 0.12, first); rF.nrm.normalize();
    this.hand[0].copy(hF[0]); this.hand[1].copy(hF[1]); this.rk.dir.copy(rF.dir); this.rk.nrm.copy(rF.nrm);
    // Outside the swing at the ball the racket turns, against the body, no faster than a hand turns it: about twenty degrees a
    // frame. (Between two poses whose rackets point nearly opposite ways, a take-back let go of after the point for the racket
    // hanging by the side, a forehand's finish over the head for the run back, the mix of the two flipped it thirty-five to
    // sixty degrees in a frame; turned evenly instead, the way round jumped from one side to the other between frames.)
    { const ucR = st && st.tc != null ? t - st.tc : null, srvR = st && (st.kind === 'serve' || st.kind === 'smash'),
        inWin = ucR != null && (srvR ? ucR > -0.75 && ucR < 0.5 : ucR > -0.4 && ucR < 0.35), qi = _rkQi.copy(qYaw).invert();
      const dL = _rkD.copy(this.rk.dir).applyQuaternion(qi).normalize(), nL = _rkN.copy(this.rk.nrm).applyQuaternion(qi), pv = this.rkLoc;
      if (!globalThis.__rkRateOld && pv && pv.ok && pv.pt === this.placedT && !first && dt > 0 && !inWin) {
        const ang = Math.acos(clamp(dL.dot(pv.d), -1, 1)), mx = 0.35 * Math.min(2, dt * 60);
        if (ang > mx) { const q = _rkQ.setFromUnitVectors(pv.d, dL); const qs = _rkQ2.identity().slerp(q, mx / ang); dL.copy(pv.d).applyQuaternion(qs); nL.copy(pv.n).applyQuaternion(qs);
          this.rk.dir.copy(dL).applyQuaternion(qYaw); this.rk.nrm.copy(nL).applyQuaternion(qYaw); rF.dir.copy(this.rk.dir); rF.nrm.copy(this.rk.nrm); } }
      const o = this.rkLoc || (this.rkLoc = { d: V(), n: V(), ok: false, pt: null }); o.d.copy(dL); o.n.copy(nL); o.ok = true; o.pt = this.placedT; }
    if (this.dbgOn && this.dbgDir) this.dbgDir.c3 = this.rk.dir.clone();
    // The strings meet the ball. Around contact, whatever gap is left between the middle of the strings and the
    // place the ball is struck is closed: the hand goes toward it as far as the arm reaches, and the wrist angles
    // the racket for the rest (as a player's does when the ball is not quite where he set up for it).
    if (st && st.tc != null) {
      const serve = st.kind === 'serve' || st.kind === 'smash', uu = t - st.tc;
      const T = serve && m.ball && m.ball.visible !== false && uu < 0.01 ? _v5.set(m.ball.x, m.ball.y, m.ball.z) : st.cp ? _v5.set(st.cp.x, st.cp.y, st.cp.z) : null;
      // (eased in over the first few hundredths of a second after a person lets go: it is a fifth of the way on already then,
      // and came on in one frame; and never more than half a metre: a ball out of his reach is missed, not grabbed at, and
      // reaching for one two metres off threw both arms out in the frame he let go)
      const relK = !serve && st.held != null ? sm5((t - st.t0 - st.held) / 0.06) : 1;
      const w = T ? Math.exp(-(uu * uu) / (uu < 0 ? 0.0090 : 0.0050)) * relK : 0;           // over the last tenth and a half of a second, and a little after
      if (w > 0.003) {
        const hh = this.hand[hit], Lh = (B.headC + GRIP_UP) * H, rk = this.rk.dir;
        // (its own vector: _v6 is the chest's right, still needed below)
        // (after contact the gap is the one there was at contact, let go of, not one to the place the ball was struck: the swing
        // has gone on past it, and pulled back to it the arm hung up there for a tenth of a second and then dropped in a frame)
        const ce = this.ctErr || (this.ctErr = V());
        let err;
        if (uu <= 0 || this.ctErrSt !== st) { err = _errV.copy(T).sub(_v7.copy(hh).addScaledVector(rk, Lh)); if (!serve && err.length() > 0.5) err.setLength(0.5); if (uu <= 0) { ce.copy(err); this.ctErrSt = st; } }
        else err = _errV.copy(ce);
        err.multiplyScalar(w);
        // the hand: as far as the arm allows (shoulder to palm, a little short of straight)
        const want = _v7.copy(hh).add(err), toS = want.sub(sh[hit]), mxR = (D.upper + D.fore) * 0.99 + 0.07 * H;
        if (toS.length() > mxR) toS.setLength(mxR);
        const moved = _v8.copy(sh[hit]).add(toS).sub(hh);
        // (and, as the swing's own move toward the ball, never back into the body: the hand stays a forearm in front of the chest
        // and the wrist takes the rest, as for a ball beyond reach)
        if (!globalThis.__backCapOld) backCap(moved, hh);
        shiftClear(moved, hh);
        hh.add(moved);
        // the racket: angled at the wrist toward what is left, turning in the plane of its strings (the face keeps
        // facing where the ball is going; it never turns edge-on to point at the ball), no more than a wrist bends
        const rest = err.sub(moved), fn = this.rk.nrm;
        rest.addScaledVector(fn, -0.5 * rest.dot(fn));                                         // a wrist tilts the face only part of the way
        if (rest.lengthSq() > 1e-6) {
          const nd = _v9.copy(rk).multiplyScalar(Lh).add(rest).normalize(), ang = Math.acos(clamp(nd.dot(rk), -1, 1)), lim = 0.55;
          if (ang > lim) nd.lerp(rk, 1 - lim / ang).normalize();
          rk.copy(nd);
        }
      }
    }
    // off hand rides the racket when the pose says so (ready position, two-handed backhand)
    // a two-handed backhand keeps both hands on the handle from the take-back to the finish
    // (the hand goes on to the handle and comes off it in a few hundredths of a second, never in one frame)
    // (the two-handed grip goes on as the arms go over to the stroke, and from wherever the ready position's hold on the
    // throat left the hand: in between, with neither holding it, the free hand followed the clip's own lost arm out to the hip)
    // (every two-handed backhand: the topspin, the flat one, the lob as well as the drive; only the slice, the drop and the volley
    // are hit with one hand. Kept to the drive alone, a looped backhand let go with the top hand and both arms flew out wide
    // at shoulder height through the finish)
    // (and while a wind-up is being let go of, the hand stays on the racket as it comes back to the ready position, which holds
    // it there too: let go when the stroke's weight fell away and taken back by the ready position a moment later, the free
    // hand was flung off the handle and back on it in a third of a second)
    const fadingOut = this.cancelT != null && st === this.prevSt;
    const dKind = st ? (st.__dk || st.kind) : null;     // (the stroke being shown, which a change of kind at the release does not change)
    const twoWant = !!st && !this.oneHand && st.wing === 'bh' && (st.__rush || !/^(slice|drop|volley|block|smash|serve)$/.test(dKind || '')) && (swA > 0.15 || fadingOut);   /* (a two-hander blocks a rushed backhand with both hands) */
    // (taken over from how much the hand really was on the throat, not how much the ready position asked it to be: on the
    // run the arm swing had most of it, and the grip was taken at once from wherever the hand was swinging; and from
    // where on the racket it was, sliding down to the handle, not jumped the length of the throat)
    const lgPrev = this.lgEff || 0;
    if (twoWant && (this.twoHW || 0) < lgPrev) { this.twoHW = lgPrev; this.twoHWV = 0; this.twoAt0 = this.lgAt != null ? this.lgAt : 0.105; this.twoAtT = t; }
    this.twoHW = clamp(ease(this, 'twoHW', twoWant ? 1 : 0, 30, dt), 0, 1);
    // A one-hander takes the racket back with the free hand on its throat, the elbow down, and lets go as the forward swing
    // starts (a sixth of a second before contact); after that the free arm opens out behind him as the clip has it. (Taken
    // from the clip all the way, the free elbow came up level with the shoulder and out to the side: the tracker had lost
    // that hand on the racket.)
    const oneWant = !!st && this.oneHand && st.wing === 'bh' && dKind !== 'volley' && dKind !== 'block' && dKind !== 'drop' && (swA > 0.15 || this.cancelT != null && st === this.prevSt) && (st.tc == null || t - st.tc < (dKind === 'lob' && !globalThis.__lobRelOld ? -0.2 : (globalThis.__oneRel ?? -0.15)));   /* (a lob's sooner: its racket drops lower and further back before it swings up, past where the free hand reaches) */
    if (oneWant && (this.oneHW || 0) < lgPrev) { this.oneHW = lgPrev; this.oneHWV = 0; this.oneAt0 = this.lgAt != null ? this.lgAt : 0.30; this.oneAtT = t; }
    this.oneHW = clamp(ease(this, 'oneHW', oneWant ? (globalThis.__reachOld ? 1 : (this.lgReachK ?? 1)) : 0, 30, dt), 0, 1);
    // (and as soon as the throat is out of that arm's reach, the hold is let go of then, not a frame or two later: the hand stays
    // where it was, at the end of its reach, and its arm is held to a free arm's pace; only how much it is said to hold goes,
    // where for those frames the hand counted as holding a throat six centimetres beyond it)
    if (!globalThis.__oneOutOld && oneWant && (this.regripShort || 0) > 0.015 && dt > 0) { const tg = this.lgReachK ?? 1; if (tg < this.oneHW - 0.05) { this.oneHW = Math.max(tg, this.oneHW - 0.3 * dt * 60); this.oneHWV = 0; } }   /* (a one-hander's hold on the throat lets go too as the throat goes out of that arm's reach: held on in name through a lob's low take-back, the hand was left eight centimetres off it) */
    const twoH = this.twoH = this.twoHW > 0.5;
    // how much the off hand is on the handle, 0..1, changing smoothly: everything the grip does to that arm (where the hand
    // is, the wrist behind the palm, the hand's turn) goes on and off with it, so nothing about the arm jumps when it lets go
    // (never in the serve: once the toss starts that hand is the ball's)
    // (eased: the free arm's weight crosses the window that lets go of the handle in a few frames as he runs out of a finish,
    // and the hand left the racket for the running arm in one or two of them)
    const lgW = clamp(ease(this, 'lgWE', srvOff ? 0 : sm(pose.lgrip / (globalThis.__lgOld ? 0.08 : 0.32)) * sm((0.72 - free) / 0.24) * sm(((globalThis.__lgOld ? 0.72 : 0.6) - armW) / (globalThis.__lgOld ? 0.24 : 0.2)), srvOff ? 60 : 18, dt), 0, 1);   /* (let go of a little sooner as his own arm comes in: half the clip's, half the keys', Nadal's free hand was held to the throat in name while it hung a fifth of a metre off it) */
    const gripW = this.gripW = Math.max(this.twoHW, lgW, this.oneHW || 0);
    const twoAt = this.twoAtT != null ? lerp(this.twoAt0, 0.105, sm5((t - this.twoAtT) / 0.16)) : 0.105, oneAt = this.oneAtT != null ? lerp(this.oneAt0, 0.30, sm5((t - this.oneAtT) / 0.16)) : 0.30;
    // (a racket held in two hands reaches no further than the other arm: the hitting hand is kept where the hand above it on the
    // handle can still get to. Left where one arm alone would take it, a two-handed backhand's racket hand was out up to a
    // quarter of a metre beyond the other arm's reach through the whole swing and finish, and that hand hung off the handle)
    { const wTwo = Math.max(this.twoHW, this.oneHW || 0);
      if (wTwo > 0.001 && !globalThis.__noTwoReach) { const atR = this.twoHW >= (this.oneHW || 0) ? twoAt : oneAt, OS = off === 0 ? 'L' : 'R', sO = off === 0 ? shL : shR;
        const gp = _rg1.copy(this.hand[hit]).addScaledVector(this.rk.dir, atR * H), d = _rg2.copy(gp).sub(sO), dl = d.length();
        const reach = (D.upper + D.fore) * 0.95 + person.dir['palm' + OS].length() + PALM_OFF * H;
        if (dl > reach) this.hand[hit].addScaledVector(d, -(dl - reach) / dl * wTwo); } }
    if (this.twoHW > 0.001) this.hand[off].lerp(_v8.copy(this.hand[hit]).addScaledVector(this.rk.dir, twoAt * H), this.twoHW);
    if ((this.oneHW || 0) > 0.001) this.hand[off].lerp(_v8.copy(this.hand[hit]).addScaledVector(this.rk.dir, oneAt * H), this.oneHW * (1 - this.twoHW));   // (the throat)
    // (and lets go as the throat goes out of the free arm's reach, as a hand does: held on in name, it hovered a hand's breadth
    // off the racket as a forehand's take-back carried it away)
    this.lgReachK = globalThis.__reachOld ? 1 : clamp((this.lgReachK ?? 1) + clamp(1 - sm(((this.regripShort || 0) - (globalThis.__rsA ?? 0.004)) / (globalThis.__rsB ?? 0.035)) - (this.lgReachK ?? 1), -0.3, 0.08), 0, 1);
    // (where on the racket the free hand holds it slides there, at most about two heights a second, not jumps there: a slice begun
    // late, its keys already at the take-back's hold up the throat, took the hand from the ready position's place to it, forty
    // centimetres along the racket, in a frame, the free arm thrown forty degrees)
    { const lgT = pose.lgripAt != null ? pose.lgripAt : pose.lgrip * 0.6; this.lgAt = this.lgAt == null || !this.handInit || !(dt > 0) || globalThis.__lgAtOld ? lgT : this.lgAt + clamp(lgT - this.lgAt, -(globalThis.__lgAtRate ?? 2) * dt, (globalThis.__lgAtRate ?? 2) * dt); }
    this.lgEff = clamp(pose.lgrip * 2.4, 0, 1) * (1 - free) * lgW * (this.twoHW > 0.5 ? 1 : this.lgReachK);
    if (lgW > 0.001 && this.twoHW < 0.999) { const g = _v8.copy(this.hand[hit]).addScaledVector(this.rk.dir, this.lgAt * H); this.hand[off].lerp(g, this.lgEff * (1 - this.twoHW)); }
    { const wT = this.twoHW, wO = (this.oneHW || 0) * (1 - wT), wL = lgW > 0.001 ? this.lgEff * (1 - wT) : 0;
      this.gripAtE = (wT * twoAt + wO * oneAt + wL * this.lgAt) / Math.max(1e-6, wT + wO + wL); this.gripOn = Math.min(1, wT + wO + wL); }
    // an arm cannot reach further than it is long
    // the grip is in the palm, a few centimetres beyond the wrist the arm is solved to
    const wrist = _wr;
    { const hb = m.ball && m.ball.held === p.i && (m.phase === 'toss' || m.phase === 'ready') ? 1 : 0, cur = this.ballHW == null ? hb : this.ballHW; this.ballHW = dt > 0 ? cur + clamp(hb - cur, -dt / 0.16, dt / 0.16) : hb; }
    for (let i = 0; i < 2; i++) {
      const S = i === 0 ? 'L' : 'R';
      wrist[i].copy(this.hand[i]);
      if (i === hit) wrist[i].addScaledVector(_v8.copy(person.dir['palm' + S]).applyQuaternion(this.Fhand[i]), -1);
      else if (gripW > 0.001 && !(m.ball && m.ball.held === p.i)) {
        wrist[i].addScaledVector(_v8.copy(person.dir['palm' + S]).applyQuaternion(this.Fhand[i]), -gripW);
        if (person.dir['palmN' + S]) wrist[i].addScaledVector(_v8.copy(person.dir['palmN' + S]).applyQuaternion(this.Fhand[i]), -PALM_OFF * H * gripW);
      }
      else if ((this.ballHW || 0) > 0.001) {
        // (the ball in his hand: eased in over a sixth of a second as it is handed to him for the next point, and out as it
        // leaves; put on the palm in one frame, the wrist was moved a hand's depth and the free arm flicked as he walked back)
        const bw = this.ballHW;
        wrist[i].addScaledVector(_v8.copy(person.dir['palm' + S]).applyQuaternion(this.Fhand[i]), -bw);
        if (person.dir['palmN' + S]) wrist[i].addScaledVector(_v8.copy(person.dir['palmN' + S]).applyQuaternion(this.Fhand[i]), -0.021 * H * bw);     // the ball sits on the palm, not off it
      }
      const d = _v8.copy(wrist[i]).sub(sh[i]), mx = (D.upper + D.fore) * 0.995; if (d.length() > mx) wrist[i].copy(sh[i]).addScaledVector(d.normalize(), mx);
    }

    // ---- the shoulders rise as the arms go up: the collarbone takes part of any lift above the horizontal ----
    { const cUp = _v8.set(0, 1, 0).applyQuaternion(qChest), cBack = _v9.copy(cRight).cross(cUp);       // right x up = backward
      const d0 = this._d0 || (this._d0 = [0, 0]); for (let i = 0; i < 2; i++) d0[i] = _a.copy(wrist[i]).sub(sh[i]).length();
      for (let i = 0; i < 2; i++) {
        const sx = i === 0 ? -1 : 1, S = i === 0 ? 'L' : 'R', d = _a.copy(wrist[i]).sub(sh[i]), lift = Math.asin(clamp(d.normalize().dot(cUp), -1, 1));
        const a = 0.42 * Math.max(0, lift - 0.25);
        // and the shoulder comes forward with an arm reaching across the body (the shoulder blade slides round the ribs): a
        // two-hander's bottom arm, a forehand's finish. Without it a straight arm across the chest could only pass through it.
        const xc = _b.copy(wrist[i]).sub(chest).dot(cRight) * sx, cross = st && (st.kind === 'serve' || st.kind === 'smash') ? 0 : clamp((0.06 - xc) / 0.32, 0, 1) * (1 - sm((wrist[i].y - sh[i].y - 0.15) / 0.2));
        // (eased: the hand sweeps across in a few hundredths of a second in a serve's follow-through, a shoulder blade does not)
        const po = this.proS || (this.proS = [0, 0]), pv = this.proV || (this.proV = [0, 0]), pw0 = 0.5 * sm(cross), wp = 12, ep = Math.exp(-wp * dt);
        if (dt > 0 && this.handInit) { const dd = po[i] - pw0, kk = (pv[i] + wp * dd) * dt; po[i] = pw0 + (dd + kk) * ep; pv[i] = (pv[i] - wp * kk) * ep; } else { po[i] = pw0; pv[i] = 0; }
        const pro = Math.max(0, po[i]);
        if (a > 0.001 || pro > 0.001) { _q6.setFromAxisAngle(cBack, sx * a).multiply(qChest); if (pro > 0.001) _q6.premultiply(_q3.setFromAxisAngle(cUp, sx * pro)); person.drive(S + '_Clavicle', _q6); }
      }
      person.arm.updateWorldMatrix(false, true);
      person.jointPos('L_UpperArm', shL); person.jointPos('R_UpperArm', shR);
      for (let i = 0; i < 2; i++) {
        const d = _a.copy(wrist[i]).sub(sh[i]), mx = (D.upper + D.fore) * 0.995;
        // the free arm reaching up in a serve or an overhead: the shrug adds to its reach, it does not fold the elbow
        if (i === off && st && (st.kind === 'serve' || st.kind === 'smash') && d.length() < d0[i]) wrist[i].copy(sh[i]).addScaledVector(d.normalize(), Math.min(d0[i], mx));
        else if (d.length() > mx) wrist[i].copy(sh[i]).addScaledVector(d.normalize(), mx);
        // and never folds shut: a wrist closer to its shoulder than this is a tracking glitch, not a pose
        // (the racket arm, even wrapped round in a finish, keeps its hand a forearm's length off the shoulder)
        // (pushed out along the way to the asked-for spot, but the nearer that spot is to the joint the less that way means:
        // there it is pushed forward and up from the chest instead, so a hand asked to be at the shoulder does not orbit it)
        const mn = (D.upper + D.fore) * (i === hit ? 0.53 : 0.42), dl = d.length();
        // (and the way it goes out is mostly the way the arm pointed a moment ago: a hand asked to pass close by its shoulder
        // then slides round it instead of jumping from one side to the other)
        const md = this.minDir || (this.minDir = [V(), V()]);
        // (and where the hand is cutting the corner past the shoulder, the hands' smoothing taking the chord of an arc the swing
        // makes round it, the arm turns toward where the swing really is, as fast as an arm turns: pushed out along the way it
        // pointed before, the serve's racket arm stayed up in the air for a tenth of a second, then fell to the other side)
        // (the direction it is pushed out along follows where the arm is asked to go, as fast as an arm turns, and the push
        // fades out over the last third of the way out rather than stopping at the threshold: switched between the two, the
        // wrist jumped half a metre round the shoulder in a frame as it crossed it)
        { const nearK = 1 - sm((dl / mn - 1) / 0.6);
          if (nearK > 0.001) { const cur = _b.copy(this.minOk ? md[i] : _c.copy(cBack).multiplyScalar(-0.8).addScaledVector(cUp, 0.6).normalize());
            if (dl > 1e-3) { const td = _c.copy(d).multiplyScalar(1 / dl), ang = Math.acos(clamp(cur.dot(td), -1, 1)), step = Math.min(ang, 30 * Math.max(dt, 1 / 120)), ax = _axV.copy(cur).cross(td);
              if (ang > 1e-3 && ax.lengthSq() > 1e-10) cur.applyAxisAngle(ax.normalize(), step); }
            cur.normalize(); const dirW = _c.copy(cur).lerp(_axV.copy(d).normalize(), dl > 1e-3 ? 1 - nearK : 0).normalize();
            wrist[i].copy(sh[i]).addScaledVector(dirW, Math.max(dl, mn) * nearK + dl * (1 - nearK)); } }
        md[i].copy(wrist[i]).sub(sh[i]).normalize();
      } }

    // The free arm turns round its shoulder no faster than an arm does: about fourteen hundred degrees a second, a half more round
    // contact, where it is pulled in hard (relative to the chest, so the trunk's own turn is not counted; allowed two and a half
    // times, Djokovic's swept forty to sixty degrees in a frame as it came in across his chest after the ball was struck). Whatever else asks
    // it to be somewhere new in one frame (a hand pushed out of the shoulder, a clamp to the arm's reach taking the other
    // side) is then taken over a few frames, not swung through in one. (Not while it holds the racket or the ball.)
    { const i = off, cUp = _v8.set(0, 1, 0).applyQuaternion(qChest), cBk = _v9.copy(cRight).cross(cUp), d = _a.copy(wrist[i]).sub(sh[i]), dl = d.length();
      const loc = _b.set(d.dot(cRight), d.dot(cUp), d.dot(cBk)).divideScalar(dl || 1), pv = this.offLoc || (this.offLoc = V());
      const held = gripW > 0.3 || (m.ball && m.ball.held === p.i && m.phase === 'toss') || (this.tossW || 0) > 0.01;   /* (not merely holding the ball between points: handed it at the ready, the arm was let go in that frame) */
      if (!held && this.offLocOk && this.handInit && dt > 0 && dl > 1e-3) {
        const uc = st && st.tc != null ? (t - st.tc) / 0.2 : 9, near = Math.exp(-uc * uc), mxA = (24 + 12 * near) * dt, ang = Math.acos(clamp(loc.dot(pv), -1, 1));
        if (ang > mxA) { const ax = _c.copy(pv).cross(loc); if (ax.lengthSq() > 1e-10) { ax.normalize(); loc.copy(pv).applyAxisAngle(ax, mxA); wrist[i].copy(sh[i]).addScaledVector(cRight, loc.x * dl).addScaledVector(cUp, loc.y * dl).addScaledVector(cBk, loc.z * dl); } } }
      pv.copy(loc); this.offLocOk = this.handInit; }
    if (this.dbgOn && this.dbg) this.dbg.wr2 = wrist.map(v => v.clone());
    this.minOk = this.handInit;                        // (the arm's last direction is a guide only once there is one)
    // ---- the arms stay outside the body ----
    // The trunk is an oval cylinder from the hips to the shoulders (as wide and deep as his own shoulders make it) and the
    // head a ball on top: a hand that the keys or a clip put inside either is moved out to its surface, and an elbow that
    // would end up inside, or whose forearm would cut through the chest, is swung out round the arm.
    const shW = shL.distanceTo(shR), tA = shW * 0.39, tB = shW * 0.31,   /* (the ribs, not the shoulders: an arm hangs against the side of the trunk) */ tAx = _bx.copy(chest).sub(pelvis), tLen = tAx.length(); tAx.multiplyScalar(1 / Math.max(1e-4, tLen));
    const tRt = _br.copy(cRight).addScaledVector(tAx, -cRight.dot(tAx)).normalize(), tFw = _bf.copy(tAx).cross(tRt);       // up x right = forward
    const headC0 = _bh.copy(chest).setY(chest.y + (D.headY - D.shY) + 0.06 * H), headR = 0.115 * H;
    const bodyPush = (q, m, out, noHead) => { out.set(0, 0, 0);
      const rel = _bq.copy(q).sub(pelvis), along = rel.dot(tAx);
      if (along > -0.06 * tLen && along < tLen * 1.16) { const nk = along > tLen ? 1 - 0.45 * (along - tLen) / (0.16 * tLen) : along < 0.4 * tLen ? 0.72 + 0.28 * Math.max(0, along) / (0.4 * tLen) : 1,   /* (narrowing to the neck above the shoulders, and to the waist below the ribs: a two-hander's hands rest by the back hip) */ dx = rel.dot(tRt), dz = rel.dot(tFw), e = Math.hypot(dx / (tA * nk + m), dz / (tB * nk + m));   /* (up past the shoulders it narrows to the neck) */
        if (e < 1) { if (e > 1e-3) out.addScaledVector(tRt, dx / e - dx).addScaledVector(tFw, dz / e - dz); else out.addScaledVector(tFw, tB * nk + m); } }
      const hd = _bq.copy(q).sub(headC0), hl = hd.length(); if (!noHead && hl < headR + m) { const k = (headR + m - Math.max(hl, 1e-3)) / Math.max(hl, 1e-3); if (out.lengthSq() < (hd.lengthSq() * k * k)) out.copy(hd).multiplyScalar(k); }
      return out; };
    // The racket past the head goes round it on one side, chosen as it first comes near and kept until it is clear: pushed out
    // of the head the shortest way, the way flipped from one side to the other as the frame crossed over the middle of the
    // head, and the racket was thrown forty degrees in a frame. Turned at the hand, sideways across the body, by just what
    // takes the frame out of the head and a few centimetres more; nothing where it is clear.
    const headRound = (base, rk, nrm, L0, m, slot) => {
      if (globalThis.__headRoundOld) return; const Rin = (globalThis.__headRR ?? 0.095) * H + m, Rout = Rin + (globalThis.__headZone ?? 0.005) * H, rgt = _hdR.set(cRight.x, 0, cRight.z); if (rgt.lengthSq() < 1e-6) return; rgt.normalize();
      // (the side is the one it is already sweeping toward, chosen as it comes near and kept while it is near: held back on
      // the other, it was let go of in a frame as its own path came clear past the head)
      const pvA = this.headRkPrev || (this.headRkPrev = [V(), V()]), okA = this.headRkOk || (this.headRkOk = [false, false]), pv = pvA[slot];
      const pv0 = _hdV.copy(okA[slot] ? pv : rk); void rgt; pv.copy(rk); okA[slot] = true;
      // (the head from the jaw to the crown: a ball about the middle of the skull let the frame through the jaw)
      const segOK = slot === 1 && this.headJOk && !globalThis.__headCapOld, cen = (q) => { if (!segOK) return headC0; const ab = _hdA.copy(headC0).sub(_hdJ), tt = clamp(_hdB.copy(q).sub(_hdJ).dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1); return _hdC.copy(_hdJ).addScaledVector(ab, tt); };
      let near = false; for (let k = 3; k <= 13; k++) { const q = _hdQ.copy(base).addScaledVector(rk, L0 * k / 10); if (q.distanceTo(cen(q)) < Rout) { near = true; break; } }
      const sideA = this.headSideA || (this.headSideA = [0, 0]), uA = this.headUA || (this.headUA = [V(), V()]), angA = this.headAngA || (this.headAngA = [0, 0]);
      // (and let go of no faster than seven degrees a frame: its own path comes clear of the head on the far side in a frame or
      // two, and dropped at once the racket was thrown back onto it thirty degrees)
      const step = (globalThis.__headRel ?? 0.12) * dt * 60;
      // (never more than a third of a right angle, and never into the trunk: a turn added to frame after frame grew past a right
      // angle, the racket held a quarter turn off its own path and laid through his chest as it let go)
      const mxA = globalThis.__headCap ?? 0.6, trunkAt = (ang) => { const u = _hdT.copy(uA[slot]); u.addScaledVector(rk, -u.dot(rk)); if (u.lengthSq() < 1e-4) return 0; u.normalize(); const ax = _hdN.copy(rk).cross(u); if (ax.lengthSq() < 1e-8) return 0; ax.normalize();
        const d = _hdD.copy(rk).applyAxisAngle(ax, ang); if (d.dot(u) < rk.dot(u)) d.copy(rk).applyAxisAngle(ax, -ang); let mx = 0; for (let k = 2; k <= 13; k++) mx = Math.max(mx, bodyPush(_hdQ.copy(base).addScaledVector(d, L0 * k / 10), 0.01 * H, _hdW, true).length()); return mx; };
      const safe = (ang) => { ang = Math.min(ang, mxA); if (globalThis.__headTrunkOld || ang < 1e-4) return ang; const t0 = trunkAt(0); if (trunkAt(ang) <= t0 + 1e-4) return ang; let lo = 0, hi = ang; for (let it = 0; it < 7; it++) { const mid = (lo + hi) / 2; if (trunkAt(mid) <= t0 + 1e-4) lo = mid; else hi = mid; } return lo; };
      const turn = (ang) => { if (ang < 1e-4) return; const u = _hdT.copy(uA[slot]); if (!globalThis.__headPerpOld) { u.addScaledVector(rk, -u.dot(rk)); if (u.lengthSq() < 1e-4) u.copy(uA[slot]); u.normalize(); } const ax = _hdN.copy(rk).cross(u); if (ax.lengthSq() < 1e-8) return; ax.normalize(); const q = _hdQq.setFromAxisAngle(ax, -ang); const t1 = _hdO.copy(rk).applyQuaternion(q); if (t1.dot(u) < rk.dot(u)) q.setFromAxisAngle(ax, ang); rk.applyQuaternion(q).normalize(); nrm.applyQuaternion(q).normalize(); };
      // (and as it lets go, never back into the head: its own path past the head on the far side, the turn still held toward the
      // near side took the frame back through the jaw; what is left of the turn is cut to what keeps it out)
      const penAt = (ang) => { const u = _hdT.copy(uA[slot]); u.addScaledVector(rk, -u.dot(rk)); if (u.lengthSq() < 1e-4) return 0; u.normalize(); const ax = _hdN.copy(rk).cross(u); if (ax.lengthSq() < 1e-8) return 0; ax.normalize();
        const d = _hdD.copy(rk).applyAxisAngle(ax, ang); if (d.dot(u) < rk.dot(u)) d.copy(rk).applyAxisAngle(ax, -ang); let mx = -1; for (let k = 3; k <= 13; k++) { const q = _hdQ.copy(base).addScaledVector(d, L0 * k / 10); mx = Math.max(mx, Rin - q.distanceTo(cen(q))); } return mx; };
      if (!near) { if (this.dbgOn && slot === 1) this.dbgHead = { near: false, ang: +angA[slot].toFixed(3) };
        if (angA[slot] > 1e-4) { let a2 = Math.max(0, Math.min(angA[slot], mxA) - step); if (!globalThis.__headRelSafeOld && a2 > 1e-4 && penAt(a2) > 0) { let lo = 0, hi = a2; for (let it = 0; it < 7; it++) { const mid = (lo + hi) / 2; if (penAt(mid) > 0) hi = mid; else lo = mid; } a2 = lo; } a2 = safe(a2); angA[slot] = a2; turn(a2); } else sideA[slot] = 0; return; }
      // (the way round is across its own motion, to whichever side of the head its path is passing: over the top, behind or in
      // front. Chosen as it comes near and kept; a path's offset from the head keeps its side however close it comes.)
      // (out from the head to the racket's line, square to the shaft, as the frame first comes near; kept while near. Judged
      // across the motion from the tip, the way lay along the shaft and the turn shoved the frame anywhere, into the back.)
      if (!sideA[slot]) { let kb = 11, db = 9; for (let k = 3; k <= 13; k++) { const q = _hdQ.copy(base).addScaledVector(rk, L0 * k / 10), dq = q.distanceTo(cen(q)); if (dq < db) { db = dq; kb = k; } }
        const c = cen(_hdQ.copy(base).addScaledVector(rk, L0 * kb / 10)), rel = _hdP.copy(c).sub(base), along = rel.dot(rk), d = _hdS.copy(base).addScaledVector(rk, along).sub(c);
        if (d.lengthSq() < 1e-6) { d.copy(rk).sub(pv0); d.addScaledVector(rk, -d.dot(rk)); }
        if (d.lengthSq() < 1e-6) d.copy(rgt);
        uA[slot].copy(d.normalize()); sideA[slot] = 1; }
      const u = _hdU.copy(uA[slot]); if (!globalThis.__headPerpOld) { u.addScaledVector(rk, -u.dot(rk)); if (u.lengthSq() < 1e-4) u.copy(uA[slot]); u.normalize(); }
      // (turned at the hand, sideways, by as much as clears the wider zone, in proportion to how far into it the frame has
      // come: nothing at its edge, all of it at the head itself, so the turn grows and lets go with the swing, not in a frame)
      let ang = 0;
      for (let k = 3; k <= 13; k++) { const l = L0 * k / 10, q = _hdQ.copy(base).addScaledVector(rk, l), pc = _hdP.copy(q).sub(cen(q)), dd = pc.length(); if (dd >= Rout) continue;
        const pu = pc.dot(u), disc = pu * pu - dd * dd + Rout * Rout; if (disc < 0) continue; const lam = -pu + Math.sqrt(disc), w = sm((Rout - dd) / (Rout - Rin)); ang = Math.max(ang, Math.atan2(lam * w, l)); }
      ang = Math.max(ang, Math.min(angA[slot], mxA) - step);
      // (then the least turn that takes the frame outside the head itself, found by trying: one estimate fell short for a frame
      // deep in the head, the jaw five centimetres inside the strings)
      if (!globalThis.__headHardOld && penAt(ang) > 0.002) { let lo = ang, hi = mxA; if (penAt(hi) > 0.002) lo = hi; else for (let it = 0; it < 8; it++) { const mid = (lo + hi) / 2; if (penAt(mid) > 0.002) lo = mid; else hi = mid; } ang = Math.max(ang, hi); }
      ang = safe(ang); angA[slot] = ang; void u; turn(ang);
      if (this.dbgOn && slot === 1) { let mj = 9, mc = 9; for (let k = 3; k <= 13; k++) { const q = _hdQ.copy(base).addScaledVector(rk, L0 * k / 10); mc = Math.min(mc, q.distanceTo(cen(q))); if (this.headJOk) mj = Math.min(mj, q.distanceTo(_hdJ)); } this.dbgHead = { ang: +ang.toFixed(3), near, mc: +mc.toFixed(3), mj: +mj.toFixed(3), Rin: +Rin.toFixed(3), u: [u.x, u.y, u.z].map(x => +x.toFixed(2)) }; } };
    if (this.dbgOn && this.dbg) { this.dbg.hand = this.hand.map(v => v.clone()); this.dbg.tgt2 = tgt.map(v => v.clone()); this.dbg.tFw = tFw.clone(); this.dbg.tRt = tRt.clone(); this.dbg.cRight = cRight.clone(); }
    { const pw = [_bp0, _bp1], want = this.bodyWant || (this.bodyWant = [V(), V()]), tmp = _cq;
      // what it takes to clear: the hand out of the trunk and the head, then the forearm (judged with the elbow where it
      // is about to go), both hands together when they share a handle
      for (let i = 0; i < 2; i++) { bodyPush(wrist[i], LIMB_R + 0.012 * H, pw[i]); const ph = bodyPush(this.hand[i], LIMB_R, _bq2); if (ph.lengthSq() > pw[i].lengthSq()) pw[i].copy(ph);
        // A hand across the middle of the body, below the shoulders (the bottom hand of a two-hander back by the other hip, a
        // forehand's finish down by the other side), is IN FRONT of the trunk, and the further across, the further in front:
        // only so does its arm pass across the front of the chest. Pushed out sideways to the nearest surface instead, the
        // hand stayed level with the body and the arm went straight through it. (The tracked clips lose exactly this depth.)
        const rel = _bq.copy(wrist[i]).sub(pelvis), al = rel.dot(tAx), sx = i === 0 ? -1 : 1;
        if (this.dbgOn && this.dbg) (this.dbg.front || (this.dbg.front = []))[i] = { al: +(al / tLen).toFixed(2), x: +rel.dot(tRt).toFixed(2), z: +rel.dot(tFw).toFixed(2), pw: +pw[i].length().toFixed(2) };
        // (how far forward is eased on its own, more slowly than the push out of the trunk: as the hands sweep across the
        // middle in a swing the need comes on in a few hundredths of a second, and taken at once it threw the arms forward;
        // and it eases off round contact, where the hands are out in front anyway)
        const fp = this.frontWant || (this.frontWant = [0, 0]); fp[i] = 0;
        // (and a forehand's free arm folding in through the swing comes in across the front of the chest, not into it, on
        // whichever side the hand is)
        const ucF = st && st.tc != null ? t - st.tc : 9, foldK = st && st.wing === 'fh' && i === off && !/^(serve|smash|volley|block)$/.test(st.__dk || st.kind) ? sm5((ucF + 0.38) / 0.12) * (1 - sm5((ucF - 0.35) / 0.2)) : 0;
        // (a serve's or an overhead's finish too, the racket arm wrapping across to the far hip: left out with the rest of the
        // serve, McEnroe's finish laid that arm through his stomach)
        const srvFin = st && (st.kind === 'serve' || st.kind === 'smash') && st.tc != null && t > st.tc + 0.05 && !globalThis.__srvFinOld;
        if ((!(st && (st.kind === 'serve' || st.kind === 'smash')) || srvFin) && al > -0.1 * tLen && al < tLen * 1.3) { const x = rel.dot(tRt), z = rel.dot(tFw), cross = Math.max(clamp((-x * sx + 0.06) / 0.26, 0, 1), 0.7 * foldK);
          // (up by the other shoulder, a finish wrapping round, the arm crosses in front of the neck: less far forward there)
          if (cross > 0 && Math.abs(x) < tA + LIMB_R + (globalThis.__frontWide ?? 0.22)) {   /* (to a hand a little further out by the other hip too: a two-hander's take-back with the hands just outside a tenth of a metre past the trunk had the upper arm across the inside of the chest) */ const need = ((tB + LIMB_R + 0.03) * sm(cross * 2.5) + 0.2 * cross) * (1 - 0.4 * sm((al / tLen - 0.85) / 0.25));
            const uc = st && st.tc != null ? t - st.tc : 9, nearC = Math.exp(-(uc * uc) / 0.008);
            // (round contact only where the hand is in front already: a block reached late for a ball behind him on the far side had
            // the racket hand back by the other hip at contact, and eased off there the arm lay through his chest)
            if (z < need) fp[i] = (need - z) * (1 - 0.75 * nearC * (globalThis.__nearZOld ? 1 : sm((z + 0.02) / 0.12))); } }
        // (and wherever the arm itself, shoulder to hand, would pass through the trunk with the hand in front of the body, low across
        // the stomach in a take-back: the hand goes forward far enough that the line clears it, for the elbow to be round it. Left to
        // the rules above, which go by how far across the hand is, a one-hander's take-back with the hand at the middle of the waist
        // had the elbow in the middle of the chest, and no turn of it round the arm could get it out.)
        // (the toss arm too, pulled in to the chest as the racket goes up to the ball)
        if (!globalThis.__lineOld && (!(st && (st.kind === 'serve' || st.kind === 'smash')) || srvFin || (i === off && st.tc != null && t > st.tc - 0.12 && !globalThis.__tossLineOld)) && rel.dot(tFw) > -0.02) {
          // (the reach up the chest and in near the shoulder is a stroke's: with both hands on the racket coming back to the ready
          // position it pushed the hands forward off the throat's place, the grip pulled the free hand back a hand's breadth, and
          // that arm's elbow was thrown up in a frame; it goes as the stroke does, where the hands share the handle)
          const xK = globalThis.__lineTopOld ? 0 : gripW > 0.5 && !globalThis.__lineGateOld ? sm((sw - 0.3) / 0.4) : 1;
          const lineNeed = ext => { let nd = 0; for (const f of (ext ? [0.35, 0.5, 0.65, 0.8] : [0.5, 0.65, 0.8])) { const q = _bm.copy(sh[i]).lerp(wrist[i], f), r = q.sub(pelvis), al2 = r.dot(tAx);
            // (up to the top of the chest, narrower there as the neck is: kept below the shoulders, a two-hander's top arm crossing the
            // upper chest to the hands up by the far shoulder in the finish went through it, and no turn of the elbow could clear it)
            if (al2 < 0.05 * tLen || al2 > tLen * (ext ? 1.05 : 0.95)) continue;
            const nk2 = al2 < 0.4 * tLen ? 0.72 + 0.28 * al2 / (0.4 * tLen) : al2 > 0.9 * tLen && ext ? 0.75 : 1, lmg = LIMB_R * (globalThis.__lineMgOld ? 0.7 : (globalThis.__lineMg ?? 1)), a2 = tA * nk2 + lmg, b2 = tB * nk2 + lmg, dx2 = r.dot(tRt), dz2 = r.dot(tFw);
            if (Math.abs(dx2) < a2) { const zx = b2 * Math.sqrt(1 - (dx2 / a2) ** 2); if (dz2 < zx && dz2 > -zx) nd = Math.max(nd, (zx - dz2) / f); } } return nd; };
          const n0 = lineNeed(false), needL = xK > 0.001 ? n0 + (Math.max(n0, lineNeed(true)) - n0) * xK : n0;
          if (needL > fp[i]) fp[i] = Math.min(needL, (globalThis.__lineCap ?? 0.4) * H); } }
      if (gripW > 0.5) { const big = pw[0].lengthSq() > pw[1].lengthSq() ? pw[0] : pw[1]; pw[0].copy(big); pw[1].copy(big); }
      { const fp = this.frontWant, fg = this.frontGot || (this.frontGot = [0, 0]), fv = this.frontVel || (this.frontVel = [0, 0]), wf = globalThis.__frontW ?? 90, ef = Math.exp(-wf * dt);
        if (gripW > 0.5) fp[0] = fp[1] = Math.max(fp[0], fp[1]);
        for (let i = 0; i < 2; i++) { if (dt > 0 && this.handInit) { const f0 = fg[i], d = fg[i] - fp[i], k = (fv[i] + wf * d) * dt; fg[i] = fp[i] + (d + k) * ef; fv[i] = (fv[i] - wf * k) * ef;
            /* (sooner than it was, but never more than three centimetres a frame: at its old pace a two-hander's hands crossed to the far hip a tenth of a second ahead of the push, and the arm lay through the stomach) */ const mxF = (globalThis.__frontCap ?? 0.09) * dt * 60; if (Math.abs(fg[i] - f0) > mxF) { fg[i] = f0 + Math.sign(fg[i] - f0) * mxF; fv[i] *= 0.5; } } else { fg[i] = fp[i]; fv[i] = 0; }
          if (fg[i] > 1e-4 && globalThis.__frontOld) { const fw0 = pw[i].dot(tFw); if (fw0 < fg[i]) pw[i].addScaledVector(tFw, fg[i] - fw0); } } }
      for (let i = 0; i < 2; i++) want[i].copy(pw[i]);
      if (this.dbgOn && this.dbg) { this.dbg.fp = (this.frontWant || []).map(x => +x.toFixed(3)); this.dbg.fg = (this.frontGot || []).map(x => +x.toFixed(3)); this.dbg.gw = +gripW.toFixed(2); }
      if (this.dbgOn && this.dbg) this.dbg.w1 = want.map(q => [q.dot(tRt), q.dot(tAx), q.dot(tFw)].map(x => +x.toFixed(2)));
      // (not with both hands on the handle on the way back: then the bottom arm lies across the front of the body as it
      // really does, and pushing the hands off it locks that arm out straight)
      const fPush = gripW < 0.5 || (st && st.tc != null && t > st.tc);      // (after contact the arms wrap round the shoulder and are kept off it)
      for (let it = 0; it < 2 && fPush; it++) { let any = false;
        // (never back: judged with last frame's elbow, which may be pointing back through him, the forearm comes out inside
        // and the way out of the trunk nearest its middle can be the back; the hand was then pushed in behind him and the
        // arm through his body after it. Where the elbow goes is the swivel's business below.)
        for (let i = 0; i < 2; i++) { tmp.copy(wrist[i]).add(want[i]); const e0 = ik(sh[i], tmp, D.upper, D.fore, this.poleS[i], _be, true), mid = _bm.copy(e0).add(tmp).multiplyScalar(0.5); bodyPush(mid, LIMB_R, pw[i]).multiplyScalar(1.6);
          const bz = pw[i].dot(tFw); if (bz < 0) pw[i].addScaledVector(tFw, -bz); if (pw[i].lengthSq() > 1e-6) any = true; }
        if (!any) break;
        if (gripW > 0.5) { const big = pw[0].lengthSq() > pw[1].lengthSq() ? pw[0] : pw[1]; pw[0].copy(big); pw[1].copy(big); }
        for (let i = 0; i < 2; i++) want[i].add(pw[i]); }
      if (this.dbgOn && this.dbg) this.dbg.w2 = want.map(q => [q.dot(tRt), q.dot(tAx), q.dot(tFw)].map(x => +x.toFixed(2)));
      // ...eased in and out (a spring, so its speed never jumps): shoved out of the body the instant it touches, an arm
      // would jump; this way it slides round the body
      const got = this.bodyGot || (this.bodyGot = [V(), V()]), gv = this.bodyVel || (this.bodyVel = [V(), V()]), w = globalThis.__pushW || 40, e = Math.exp(-w * dt);
      // (and no more than ten centimetres a frame: where what it takes to clear changes all at once, a stroke changed for another
      // dropping the hand inside the trunk, or the nearest way out turning from one side of the body to the other, the spring
      // alone threw the arm sixty centimetres in two frames)
      for (let i = 0; i < 2; i++) { const g0 = _gp0.copy(got[i]);
        for (const c of ['x', 'y', 'z']) { const d = got[i][c] - want[i][c], k = (gv[i][c] + w * d) * dt; got[i][c] = want[i][c] + (d + k) * e; gv[i][c] = (gv[i][c] - w * k) * e; }
        { const st0 = g0.distanceTo(got[i]), mxS = (globalThis.__pushCap || 0.05) * H * dt * 60; if (dt > 0 && st0 > mxS) { const k = mxS / st0; got[i].sub(g0).multiplyScalar(k).add(g0); gv[i].multiplyScalar(k); } }
        if (dt <= 0 || this.inited === false) { got[i].copy(want[i]); gv[i].set(0, 0, 0); }
        wrist[i].add(got[i]); this.hand[i].add(got[i]);
        // (the forward offset for a hand across the body goes on straight from its own easing: run through this spring as well,
        // two easings one after the other, it came a tenth of a second behind the hands crossing, and through that tenth a
        // two-hander's take-back laid the bottom arm through his stomach)
        if (!globalThis.__frontOld) { const fgi = this.frontGot ? this.frontGot[i] : 0, gz = got[i].dot(tFw); if (fgi > gz + 1e-4) { wrist[i].addScaledVector(tFw, fgi - gz); this.hand[i].addScaledVector(tFw, fgi - gz); } }
        // (and never into its own shoulder: with both hands on the racket the push that takes the racket hand out of the chest is
        // given to both, and in a backhand volley's take-back it drove the hand on the throat in to within a hand's breadth of its
        // shoulder, the arm folded shut and its elbow swung from behind him to in front in two frames)
        { const dW = _gp0.copy(wrist[i]).sub(sh[i]), dl = dW.length(), mn = (D.upper + D.fore) * (i === hit ? 0.53 : 0.42) * 0.95;
          if (dl > 1e-4 && dl < mn) { dW.multiplyScalar((mn - dl) / dl); wrist[i].add(dW); this.hand[i].add(dW); } } }
      if (this.dbgOn && this.dbg) { this.dbg.got = got.map(q => q.clone()); this.dbg.wrB = wrist.map(q => q.clone()); }
      // (and once more after those pushes, with both hands on the handle: they move the racket hand, and in a two-hander's
      // finish, wrapped round and pushed out in front of the chest, they put it a hand's breadth beyond where the top hand
      // could follow; the top hand hung off the handle there)
      if (this.twoHW > 0.001 && !globalThis.__reachOld) { const OS = off === 0 ? 'L' : 'R', sO = off === 0 ? shL : shR, gp = _rg1.copy(this.hand[hit]).addScaledVector(this.rk.dir, 0.105 * H), d = _rg2.copy(gp).sub(sO), dl = d.length();
        const reach = (D.upper + D.fore) * (globalThis.__twoReachK ?? 0.9) + PALM_OFF * H;   /* (the arm's own length to the handle: with the palm's length added as if it lay straight along the arm, which it does not round a handle, the top arm still fell short by most of a hand) */
        if (dl > reach) { d.multiplyScalar(-(dl - reach) / dl * this.twoHW); this.hand[hit].add(d); wrist[hit].add(d); } }
      // the racket: any part of it inside the trunk or the head, it is tipped at the wrist until it clears
      { const L = (B.headC + GRIP_UP) * H, hh = this.hand[hit], rk = this.rk.dir; let worst = null, wk = 0;
        // (out to the top of the frame, not only the middle of the strings: the upper half of the head swept through his face)
        const kMax = globalThis.__tipOld ? 10 : 13;
        for (let k = 3; k <= kMax; k++) { const q = _bm.copy(hh).addScaledVector(rk, L * k / 10), ps = bodyPush(q, 0.035 * H, _be, !globalThis.__headRoundOld); if (ps.lengthSq() > wk) { wk = ps.lengthSq(); worst = { k, ps: ps.clone() }; } }
        if (worst) { const nd = _bm.copy(rk).multiplyScalar(L * worst.k / 10).add(worst.ps).normalize(); rk.copy(nd); const nn = this.rk.nrm; nn.addScaledVector(rk, -nn.dot(rk)).normalize(); }
        if (this.dbgOn && this.dbgDir) this.dbgDir.c4 = rk.clone(); } }
      // and never into the court: the lowest point of the frame is kept a few centimetres off it, the hand (and the hand on the
      // handle with it) lifted by what is missing, as a player's racket skims over the court at the bottom of a low swing and
      // does not drag along it
      { const rk = this.rk.dir, nn = this.rk.nrm, sd = _bm.copy(rk).cross(nn).normalize(), a = 0.165 * H, b = 0.128 * H, hh = this.hand[hit];
        const cy = hh.y + rk.y * (B.headC + GRIP_UP) * H, low = cy - Math.sqrt((a * rk.y) ** 2 + (b * sd.y) ** 2), def = 0.035 - low;
        this.rkLow = low;
        // (the lift taken up as a spring: put on in a frame, both hands jumped half a metre when the racket swung low)
        const lf = this.rkLift = clamp(ease(this, 'rkLiftE', Math.min(Math.max(def, 0), 0.3), 40, dt), 0, 0.3), d = Math.max(lf, Math.min(Math.max(def, 0), 0.05));
        if (d > 1e-4) { hh.y += d; wrist[hit].y += d; if (gripW > 0.001) { this.hand[off].y += d * gripW; wrist[off].y += d * gripW; } } }

    // ---- solve the limbs and pose the skeleton ----
    const P = this.parts, LJ = LEG_J;
    const cUpW = _c.set(0, 1, 0).applyQuaternion(qChest), cFwdW = _v5.copy(cUpW).cross(cRight);          // up x right = forward
    const inPlayE = (m.phase === 'live' || m.phase === 'toss' || (m.phase === 'over' && speed > 2.2)) && !this.posed;
    for (let i = 0; i < 2; i++) {
      const S = i === 0 ? 'L' : 'R', sx = i === 0 ? -1 : 1;
      // elbows hang down and out, and tuck behind on the hitting side; swinging free they go where the clip's go
      // elbows hang down and a little out; held in front of the body they point down and forward
      // the elbow bends where a real one does for a hand in this place (learned from tracked arms)
      const rel = _v9.copy(wrist[i]).sub(sh[i]), reach = rel.length() / (D.upper + D.fore); rel.normalize();
      poleFor(rel.dot(cRight) * sx, rel.dot(cUpW), rel.dot(cFwdW), reach, _pl);
      const pole = _v8.set(0, 0, 0).addScaledVector(cRight, _pl[0] * sx).addScaledVector(cUpW, _pl[1]).addScaledVector(cFwdW, _pl[2]);
      if (pole.lengthSq() < 1e-6) pole.set(0, -1, 0); pole.normalize(); if (this.dbgOn) { const DP = this.dbgPole || (this.dbgPole = [{}, {}]); DP[i].p1 = pole.clone(); DP[i].cR = cRight.clone(); }
      // a celebration that puts the free hand to the head says where its elbow goes (Wawrinka's finger to the temple: elbow low
      // and in front, the forearm pointing up at the temple; the tracked arms' elbow for a hand there is out at the side, which
      // laid the forearm across his face and put the finger in his eye)
      if (i === off && !globalThis.__rPoleOld && this.reactPole && (this.reactK || 0) > 0.001) { const rp = this.reactPole;
        pole.lerp(_rpV.set(0, 0, 0).addScaledVector(cRight, rp[0] * sx).addScaledVector(cUpW, rp[1]).addScaledVector(cFwdW, rp[2]).normalize(), clamp(this.reactK, 0, 1)).normalize(); }
      // eased over a few frames: the table's answer may move faster than an elbow does
      // the clip's own elbow, as far as the clip's arm is bent: a nearly straight tracked arm says nothing about which way
      // its elbow points (that direction is noise), and following it flips the elbow from frame to frame
      // (with both hands on the handle the clip's own top arm says nothing: the tracker loses that hand behind the body, so
      // its elbow is not followed; the top elbow hangs down and a little out below the hands, as it does in a two-hander)
      { const fw = freeOf(i) * (i === off ? (1 - (this.tossArmW || 0)) * (1 - Math.max(this.twoHW || 0, this.oneHW || 0)) : 1);
        // (toward where the clip's elbow is, from the middle of this arm, not the clip's: where the stroke has put the hand
        // somewhere else (a wide forehand's hand brought in to the front of the stomach, the clip's still out at the side), the
        // clip's elbow taken against its own arm's line lay on the inside of this one, and the elbow went through his stomach)
        if (fw > 0.001) { const mid = _a.copy(sh[i]).add(cWr[i]).multiplyScalar(0.5), off2 = _v9.copy(cEl[i]).sub(mid), ext = off2.length() / Math.max(1e-3, D.upper), bent = sm((ext - 0.06) / 0.22);
          if (!globalThis.__elClipOld) { mid.copy(sh[i]).add(wrist[i]).multiplyScalar(0.5); off2.copy(cEl[i]).sub(mid); }
          if (bent > 0.001 && off2.lengthSq() > 1e-8) pole.lerp(off2.normalize(), fw * bent).normalize(); } } if (this.dbgOn) { const DP = this.dbgPole || (this.dbgPole = [{}, {}]); DP[i].p2 = pole.clone(); }
      // a pole lying along the arm says nothing about where the elbow goes, and the least change in it would spin the elbow
      // round the arm: as it comes into line, the elbow is let hang down and a little out instead
      { const dS = _b.copy(wrist[i]).sub(sh[i]).normalize(), pd = pole.dot(dS), perp = Math.sqrt(Math.max(0, 1 - pd * pd));
        // (down, and back, and only a little out: with the arm hanging straight down "down" says nothing, and what was left of
        // "a little out" put the elbow straight out to the side, the arms of a man with his hands on his hips; an arm let hang
        // bends with its elbow behind it)
        if (perp < 0.45) { const fb = _a.set(0, -1, 0).addScaledVector(_axV.set(0, 1, 0).applyQuaternion(qChest).cross(cRight).normalize(), -0.6).addScaledVector(cRight, sx * 0.25); fb.addScaledVector(dS, -fb.dot(dS)); if (fb.lengthSq() > 1e-6) { fb.normalize(); pole.addScaledVector(fb, (0.45 - perp) * 2.2).normalize(); } } }
      { const hw = Math.max(this.twoHW || 0, this.oneHW || 0); if (i === off && hw > 0.001) { const dn = _pa.set(0, -1, 0).addScaledVector(cRight, sx * 0.35).addScaledVector(cFwdW, -0.15).normalize(); pole.lerp(dn, hw).normalize(); } } if (this.dbgOn) { const DP = this.dbgPole || (this.dbgPole = [{}, {}]); DP[i].p4 = pole.clone(); }
      // (running, out of any stroke, an elbow swings back as a runner's does, not out to the side: flared, with the hand at the
      // front of the waist, the forearm lay across the side of the body and from behind it was a hand on the hip)
      // (and wherever the hand is down at its own hip and not in front, in a stroke too: a low take-back (Connors') or the
      // racket carried in to a volley, its elbow flared out to the side, read from behind as a hand on the hip)
      const hipZone = (() => { if (!inPlayE || (st && (st.kind === 'serve' || st.kind === 'smash'))) return 0; const r = _rc1.copy(wrist[i]).sub(sh[i]), hy = r.dot(cUpW), hz = r.dot(cFwdW), hx = r.dot(cRight) * sx;
        return sm((hy + 0.62) / 0.1) * (1 - sm((hy + 0.18) / 0.1)) * (1 - sm((hz - 0.05) / 0.12)) * sm((hx + 0.02) / 0.08); })();
      // (and walking between points, both elbows go back as the players' do, the arms bent forty degrees: let stand out to the
      // side, from behind the free arm, its hand at the waist, was a hand on the hip at every step)
      const strollE = !globalThis.__strollElbOld && strolling && !inPlayE ? Math.min(1, speed / 0.5) : 0;
      { const runE = Math.max((i === off ? freeOf(off) : carry) * (1 - sm(swA / 0.4)) * sm((speed - 2.5) / 1.5) * (inPlayE ? 1 : 0), hipZone, strollE);
        if (runE > 0.001) { const oU = _rc1.copy(cRight).multiplyScalar(sx), xo = pole.dot(oU);
          if (xo > 0.2) { const pn = _rc2.copy(pole).addScaledVector(oU, (0.2 - xo) * runE), dS = _b.copy(wrist[i]).sub(sh[i]).normalize(); pn.addScaledVector(dS, -pn.dot(dS));
            if (pn.lengthSq() > 0.04) pole.copy(pn.normalize()); } } } if (this.dbgOn) { const DP = this.dbgPole || (this.dbgPole = [{}, {}]); DP[i].p5 = pole.clone(); }
      // No chicken wing. An elbow can turn round the line from shoulder to hand, and with the hand at or below the shoulder
      // a real one stays within about sixty degrees of the lowest it could be (a hundred with the hand up level with the
      // shoulder): it does not ride up and out to the side while the hand is down by the chest or the hip. Tracked clips
      // put it there when the camera lost the arm's depth, and a finish fading into the ready position left it there while
      // the hand came down. (Hands overhead, a serve, a smash or the toss arm are free.)
      // (and the toss arm once it tucks in after contact: free there, its elbow stood back and out from a hand held at the
      // waist, a hand on the hip from behind)
      const srvTuck = i === off && st && (st.kind === 'serve' || st.kind === 'smash') && st.tc != null && t - st.tc > 0.04 && (this.tossW || 0) < 0.01;
      if ((!(st && (st.kind === 'serve' || st.kind === 'smash')) && !(i === off && ((this.tossArmW || 0) > 0.01 || (this.tossW || 0) > 0.01))) || srvTuck) {
        const dS = _pa.copy(wrist[i]).sub(sh[i]), Ls = dS.length(), hy = (wrist[i].y - sh[i].y) / (D.upper + D.fore);
        const pw = i === off ? this.pointW || 0 : 0;     // (the forehand's pointing arm: nearly straight, its elbow underneath, however high it points)
        if (Ls > 1e-3 && (hy < 0.25 || pw > 0.001)) { dS.multiplyScalar(1 / Ls);
          // (lowest as the trunk carries the arm, not as gravity does: leaning into the ready position the chest is tipped a
          // fifth of a right angle forward, a hand hanging down the body is then behind the shoulder's plumb line, and the
          // "lowest" elbow measured by gravity flipped to the front, and the limit dragged both elbows forward and out)
          const cDn = _v9.set(0, -1, 0).applyQuaternion(qChest), lo = _pb.copy(cDn).addScaledVector(dS, -cDn.dot(dS)), pp = _pc.copy(pole).addScaledVector(dS, -pole.dot(dS));
          // (an arm hanging straight down has no lowest place for its elbow: it is measured from straight behind instead, so the
          // limit still holds there; skipped, the elbow of a hanging arm was free to stand straight out to the side)
          if (lo.lengthSq() <= 0.02) { const bk = _axV.set(0, 1, 0).applyQuaternion(qChest).cross(cRight).normalize().negate(); lo.copy(bk).addScaledVector(dS, -bk.dot(dS)); }
          // (and never in toward the spine: for a hand held a little in front, "lowest" points back and in, the elbow went into
          // his back, and pushed out of it there it stood straight out to the side; an elbow hanging behind goes back and a
          // little out)
          if (lo.lengthSq() > 1e-6) { lo.normalize(); const oA = _axV.copy(cRight).multiplyScalar(sx), li = lo.dot(oA); if (li < 0.12) { lo.addScaledVector(oA, 0.12 - li); lo.addScaledVector(dS, -lo.dot(dS)); } }
          if (lo.lengthSq() > 0.02 && pp.lengthSq() > 1e-6) { lo.normalize(); pp.normalize();
            // (and with the hand down at the waist or lower, within about thirty-five: let swing sixty degrees round there, the elbow
            // stood out to the side of a hand held by the hip, and he ran with his hands on his hips)
            // (and the free arm folding in through a forehand's finish keeps its elbow low, whatever the clip says: Sampras's
            // tracked finish raised it level with the shoulder, out to the side, the arm flexed beside his face)
            const fkF = i === off && st && st.wing === 'fh' && !/^(serve|smash|volley|block)$/.test(st.__dk || st.kind || '') && st.tc != null ? sm5((t - st.tc + 0.12) / 0.1) * (1 - sm5((t - st.tc - 0.75) / 0.25)) : 0;
            // (a low hand in front of the body, within about twenty: with the hand held in front of the waist the elbow stays at
            // the side, and flared out from there it read from behind as a hand on the hip; a hand behind the hip is left its
            // room, an elbow there has to go back and out)
            const fwdS = sm((dS.dot(_axV.set(0, 1, 0).applyQuaternion(qChest).cross(cRight).normalize()) - 0.05) / 0.25), low = 1 - sm((hy + 0.45) / 0.25);
            const ang = Math.acos(clamp(pp.dot(lo), -1, 1)), lim0 = lerp(1.05 - (0.45 + 0.25 * fwdS) * low + 0.7 * sm((hy + 0.25) / 0.4) + 1.4 * sm((hy - 0.1) / 0.15), 0.8, pw), lim = lerp(lim0, Math.min(lim0, 0.85), fkF);
            if (ang > lim && ang > 1e-3) { const bx = _a.copy(pp).addScaledVector(lo, -Math.cos(ang)).normalize(); pole.copy(lo).multiplyScalar(Math.cos(lim)).addScaledVector(bx, Math.sin(lim)).normalize(); }
            if (this.dbgOn && this.dbg) (this.dbg.lim || (this.dbg.lim = []))[i] = { lo: lo.clone(), ang: +ang.toFixed(2), lim: +lim.toFixed(2), after: pole.clone() }; } } }
      // then eased over a few frames, so whatever moves it, the elbow turns and never jumps
      // (more slowly with the arm folded: there the elbow stands well off the line from shoulder to hand, and the same turn
      // of it moves the elbow furthest)
      // The whole arm must clear the body. An elbow can only swing round the line from shoulder to wrist; if, where the
      // pole puts it, the upper arm or the forearm would pass through the trunk (an arm reaching across the chest with its
      // elbow behind the back), the nearest place round that circle where the whole arm is outside is taken instead.
      { const dS = _pa.copy(wrist[i]).sub(sh[i]); let Ls = dS.length(); const mxL = (D.upper + D.fore) * 0.98;
        if (Ls > 1e-3) { dS.multiplyScalar(1 / Ls); Ls = Math.min(Ls, mxL);
          const xC = (D.upper * D.upper - D.fore * D.fore + Ls * Ls) / (2 * Ls), hC = Math.sqrt(Math.max(0, D.upper * D.upper - xC * xC));
          const p0 = _pb.copy(pole).addScaledVector(dS, -pole.dot(dS));
          if (hC > 0.02 && p0.lengthSq() > 1e-6) { p0.normalize(); const p1 = _pc.copy(dS).cross(p0), cen = _bm.copy(sh[i]).addScaledVector(dS, xC);
            const clear = (th) => { const c = Math.cos(th), sn = Math.sin(th), e = _be.copy(cen).addScaledVector(p0, hC * c).addScaledVector(p1, hC * sn);
              // (real passing through only: an arm let hang rests against the ribs, and asked to clear them by a whole limb's
              // thickness the elbow of every relaxed arm was swung out round it, both arms akimbo after each point; the push
              // to the surface below still keeps it outside)
              const cm = LIMB_R * (globalThis.__clrM ?? 0.45);
              for (const f of [0.75, 1]) { if (bodyPush(_cq.copy(sh[i]).lerp(e, f), cm, _bq2).lengthSq() > 1e-6) return false; }
              for (const f of [0.25, 0.5, 0.75]) { if (bodyPush(_cq.copy(e).lerp(wrist[i], f), cm, _bq2).lengthSq() > 1e-6) return false; }
              return true; };
            // (not for the top arm of a two-handed grip: its shape is the grip's, the elbow hanging below the hands)
            if (this.dbgOn && this.dbg) (this.dbg.clr || (this.dbg.clr = []))[i] = clear(0) ? 'clear' : 'blocked';
            // (the clear place nearest where the elbow is now, not nearest where it was asked to be: searched from the asked-for
            // side, the answer flipped from one side of the arm to the other as the arm wrapped round, and the elbow was swung
            // across in a frame or two)
            if (!clear(0)) { let best = null; const cur = this.poleInit ? this.poleS[i] : p0, aC = Math.atan2(cur.dot(p1), cur.dot(p0)), cands = [];
              for (let k = 1; k <= 9; k++) for (const sg of [1, -1]) { const th = sg * k * 0.349; cands.push(th); }
              cands.sort((x, y) => Math.abs(Math.atan2(Math.sin(x - aC), Math.cos(x - aC))) + 0.15 * Math.abs(x) - Math.abs(Math.atan2(Math.sin(y - aC), Math.cos(y - aC))) - 0.15 * Math.abs(y));
              for (const th of cands) if (clear(th)) { best = th; break; }
              if (this.dbgOn && this.dbg) this.dbg.clr[i] = best == null ? 'none' : 'found ' + best.toFixed(2);
              if (best != null) pole.copy(p0).multiplyScalar(Math.cos(best)).addScaledVector(p1, Math.sin(best)).normalize();
              (this.clrB || (this.clrB = [0, 0]))[i] = best != null ? 1 : 0; }
            // (and where the elbow is now, eased, is inside though the place asked for is clear, it gets out at the same pace: an
            // elbow still turned in from a finish behind the hip, the hand come round to the front, lagged inside the side of the
            // chest for a tenth of a second, the arm through the body, at the leisurely turn kept for everything else)
            else { let escS = 0; if (!globalThis.__escSOld && this.poleInit) { const cur = this.poleS[i], aC = Math.atan2(cur.dot(p1), cur.dot(p0)); if (!clear(aC)) escS = 1; } (this.clrB || (this.clrB = [0, 0]))[i] = escS; } } } }
      // An elbow can only swing round the line from shoulder to wrist, so that is how it is eased: as an angle about that
      // line, never straight across it (eased straight across, a pole that has to go half way round passes through
      // nothing and the elbow jumps to the other side of the arm in one frame), and no faster than an arm turns.
      { const ps = this.poleS[i];
        if (!this.poleInit) ps.copy(pole);
        else {
          const dA = _pa.copy(wrist[i]).sub(sh[i]); const dl2 = dA.length();
          // (carried round with the arm as the arm swings, keeping its side of it, before it is eased: kept pointing the same way
          // in the world and only laid flat again across the arm's new line, an arm swung from out to the side to down by the hip
          // in a few frames had its elbow come out pointing in, into the side of the chest)
          if (!globalThis.__poleTpOld && dl2 > 1e-4) { const pa = this.poleArm || (this.poleArm = [V(), V()]), dn = _ptD.copy(dA).multiplyScalar(1 / dl2);
            if (this.poleArmOk && this.poleArmOk[i] && pa[i].lengthSq() > 0.5) ps.applyQuaternion(_ptQ.setFromUnitVectors(pa[i], dn));
            pa[i].copy(dn); (this.poleArmOk || (this.poleArmOk = [false, false]))[i] = true; }
          const a0 = _pb.copy(ps), b0 = _pc.copy(pole);
          if (dl2 > 1e-4) { dA.multiplyScalar(1 / dl2); a0.addScaledVector(dA, -a0.dot(dA)); b0.addScaledVector(dA, -b0.dot(dA)); }
          if (dl2 > 1e-4 && a0.lengthSq() > 1e-6 && b0.lengthSq() > 1e-6) {
            a0.normalize(); b0.normalize();
            let ang = Math.atan2(_v9.copy(a0).cross(b0).dot(dA), clamp(a0.dot(b0), -1, 1));
            // (the long way round the outside where the short way goes through the body: an elbow with its new place on the far
            // side of the arm, more than a quarter turn away, was swung round through the inside of the arm and into the chest)
            if (!globalThis.__poleWayOld && Math.abs(ang) > 1.6) { const inw = _ptI.copy(pelvis).addScaledVector(tAx, 0.5 * tLen).sub(sh[i]); inw.addScaledVector(dA, -inw.dot(dA));
              if (inw.lengthSq() > 1e-6) { inw.normalize(); if (_ptM.copy(a0).applyAxisAngle(dA, ang / 2).dot(inw) > 0.3) ang -= Math.sign(ang) * 2 * Math.PI; } }
            // (an elbow that would pass through the body gets out of it at an arm's pace, not at the leisurely turn kept for
            // everything else: in the fastest part of a swing it otherwise lagged inside the chest for several frames)
            const esc = this.clrB && this.clrB[i] ? 1 : 0, k = 1 - Math.exp(-dt * (22 + 20 * esc) * clamp((reach - 0.5) / 0.3, 0.35, 1)), mx = (14 + 12 * esc) * dt;
            ps.copy(a0).applyAxisAngle(dA, clamp(ang * k, -mx, mx));
          } else ps.lerp(pole, 1 - Math.exp(-dt * 22)).normalize();
        }
        pole.copy(ps); } if (this.dbgOn) { const DP = this.dbgPole || (this.dbgPole = [{}, {}]); DP[i].p8 = pole.clone(); }
      // The wrist, too, moves round the chest no faster than a hand does away from the swing at the ball: about fifteen
      // centimetres a frame (nine metres a second). Through the stroke itself it is free. (A hand handed from one stroke to
      // another can be asked to be half a metre away in a frame, by a grip let go or a rule switched on; it gets there over a
      // few frames, the racket with it, as the racket is placed from where the hand ends up.)
      // (measured from the hips along the body's heading, not from the shoulder in the chest's frame: as a stroke's clip hands
      // its finish back to the keys the trunk can turn a third of a turn in a few frames, and a wrist held to the chest, or to a
      // shoulder swinging round with it, was dragged off its hand, both arms flicking forty to a hundred degrees)
      { const cRL = _wlR.copy(right), cU3 = _axV.set(0, 1, 0), cF3 = _bq.copy(fwd), wp = this.wrRel || (this.wrRel = [V(), V()]), wok = this.wrRelOk || (this.wrRelOk = [false, false]);
        if (this.dbgOn && this.dbg) { (this.dbg.wrL || (this.dbg.wrL = []))[i] = wrist[i].clone(); (this.dbg.limF || (this.dbg.limF = [0, 0]))[i] = 0; }
        const rel = _bp0.copy(wrist[i]).sub(pelvis), lx = rel.dot(cRL), ly = rel.dot(cU3), lz = rel.dot(cF3);
        if (wok[i] && this.handInit && dt > 0 && !(m.ball && m.ball.held === p.i)) { const srv = st && (st.kind === 'serve' || st.kind === 'smash'), uc = st && st.tc != null ? t - st.tc : 9;
          // (into the finish the hand slows as the racket does: free up to a twentieth of a second after the ball, then down to a
          // fifth of a metre a frame by a fifth of a second; left free to the end of the finish, the fold limit, the push out of
          // the body and the grip threw both hands of a two-hander's finish fifty to seventy-seven degrees in a frame)
          const inSwing = st && sw > 0.05 && (srv ? (m.phase === 'toss' || (uc > -0.6 && uc < 0.5)) : (uc > -0.45 && uc < 0.35)), fin = !srv && uc < 9 ? sm((uc - 0.06) / 0.12) : 0, lim = (inSwing ? 0.6 - 0.4 * fin : 0.15) * dt * 60;
          const dx = lx - wp[i].x, dy = ly - wp[i].y, dz = lz - wp[i].z, dd = Math.hypot(dx, dy, dz);
          if (dd > lim && this.dbgOn && this.dbg) this.dbg.limF[i] = +dd.toFixed(3);
          if (dd > lim) { const k = lim / dd; wrist[i].copy(pelvis).addScaledVector(cRL, wp[i].x + dx * k).addScaledVector(cU3, wp[i].y + dy * k).addScaledVector(cF3, wp[i].z + dz * k); } }
        const r2 = _bp0.copy(wrist[i]).sub(pelvis); wp[i].set(r2.dot(cRL), r2.dot(cU3), r2.dot(cF3)); wok[i] = !!this.handInit; }
      // (a hand across the body further than the arm reaches keeps how far in front and how high it is, and gives up how far
      // across: pulled straight back toward the shoulder by the arm's length instead, a serve's finish to the far hip lost its
      // place in front of the body and the arm, stretched straight, lay across the chest)
      // (taken on as the other hand lets go, not all at once as its hold passes a half, and the move it makes eased in and out over
      // a few frames: a one-hander's lob, the free hand leaving the throat, had the racket hand thrown twenty centimetres across in
      // the frame the hold went under a half, and back a few frames later)
      const acNew = !globalThis.__acrossGripOld, acW0 = acNew ? _acA.copy(wrist[i]) : null, acK = acNew ? 1 - sm((gripW - 0.15) / 0.5) : 1;
      if (!globalThis.__acrossOld && (acNew ? acK > 0.001 : !(gripW > 0.5))) { const r = _bp0.copy(wrist[i]).sub(sh[i]), mx = (D.upper + D.fore) * 0.995, sxA = i === 0 ? -1 : 1;   /* (not with both hands on a handle: moved alone, the bottom hand left the top one a hand's breadth up the throat) */
        if (r.length() > mx && _bp1.copy(wrist[i]).sub(pelvis).dot(tRt) * sxA < 0) { const side = r.dot(tRt), rest = r.addScaledVector(tRt, -side), rl = rest.length();
          if (rl < mx * 0.98) { const ns = Math.sign(side) * Math.sqrt(mx * mx - rl * rl); if (Math.abs(ns) < Math.abs(side)) wrist[i].copy(sh[i]).add(rest).addScaledVector(tRt, ns); }
          // (and if even straight down and forward it is out of reach, it keeps how far forward it is and gives up height: pulled
          // back along the arm instead, a left-hander's serve finish lost its place in front of him and that arm lay across his chest)
          else if (!globalThis.__acrossOld2) { const fz = rest.dot(tFw), tg = mx * 0.97; if (fz > 0 && fz < tg) { const up = rest.addScaledVector(tFw, -fz), ul = up.length(); if (ul > 1e-4) { up.multiplyScalar(Math.sqrt(tg * tg - fz * fz) / ul); wrist[i].copy(sh[i]).addScaledVector(tFw, fz).add(up); } } } } }
      if (acNew && !globalThis.__acrossOld) { const ao = this.acrossOff || (this.acrossOff = [V(), V()]), want = _acB.copy(wrist[i]).sub(acW0).multiplyScalar(acK);
        if (dt > 0 && this.handInit) { const d = _acC.copy(want).sub(ao[i]), mxA = (globalThis.__acrossRate ?? 0.06) * dt * 60; if (d.length() > mxA) d.setLength(mxA); ao[i].add(d); } else ao[i].copy(want);
        wrist[i].copy(acW0).add(ao[i]); }
      let el = ik(sh[i], wrist[i], D.upper, D.fore, pole, _el[i], true);
      // an elbow inside the trunk, or a forearm through it: the elbow swings out round the arm to the trunk's surface
      { const pe = bodyPush(el, LIMB_R, _bq2), mid = _bp0.copy(el).add(wrist[i]).multiplyScalar(0.5), pm = bodyPush(mid, LIMB_R * 0.9, _bp1);
        if (pm.lengthSq() > pe.lengthSq()) pe.copy(pm).multiplyScalar(2);
        // (eased like the hands: the elbow slides round the body rather than being knocked out of it)
        // (quicker round contact, where the arm is moving at twenty metres a second and an elbow eased in a hundredth of a second
        // behind it went through the side of the chest on the swing at the ball)
        const ucE = st && st.tc != null ? t - st.tc : 9, eg = this.elGot || (this.elGot = [V(), V()]), ev = this.elVel || (this.elVel = [V(), V()]), w = globalThis.__elbowFastOld ? 50 : lerp(50, globalThis.__elbowFastW ?? 140, Math.exp(-(ucE * ucE) / 0.012)), ex = Math.exp(-w * dt);
        if (dt > 0) for (const c of ['x', 'y', 'z']) { const d = eg[i][c] - pe[c], k = (ev[i][c] + w * d) * dt; eg[i][c] = pe[c] + (d + k) * ex; ev[i][c] = (ev[i][c] - w * k) * ex; } else eg[i].copy(pe);
        if (eg[i].lengthSq() > 1e-8) { const mid2 = _bp1.copy(sh[i]).add(wrist[i]).multiplyScalar(0.5), np = _bq.copy(el).add(eg[i]).sub(mid2); if (np.lengthSq() > 1e-8) el = ik(sh[i], wrist[i], D.upper, D.fore, np.normalize(), _el[i], true); } }
      // Last, the elbow moves no faster than an elbow does: relative to the chest, about nine centimetres a frame away from the
      // swing at the ball (four times that around contact). Whatever was asked of it, the arm solver can answer a hand passing
      // close to the shoulder with an elbow on the far side of the arm; here it is put on its circle round the arm as near to
      // where it was as that allows, and goes on from there.
      { const cU2 = _axV.set(0, 1, 0).applyQuaternion(qChest), cF2 = _bq.copy(cU2).cross(cRight).normalize(), ep = this.elRel || (this.elRel = [V(), V()]), eok = this.elRelOk || (this.elRelOk = [false, false]);
        const rel = _bp0.copy(el).sub(sh[i]), lx = rel.dot(cRight), ly = rel.dot(cU2), lz = rel.dot(cF2);
        if (eok[i] && this.handInit && dt > 0) { const uc = st && st.tc != null ? t - st.tc : 9, near = Math.exp(-(uc * uc) / (globalThis.__elW || 0.007)), lim = (0.09 + (i === hit ? 0.22 : 0.09) * near) * dt * 60;   /* (the fast elbow only right at the ball: allowed a tenth of a second either side, a late, rushed take-back swung the upper arm half a turn a second faster than a shoulder turns) */   /* (the free elbow less: it is not swung at the ball) */
          const dx = lx - ep[i].x, dy = ly - ep[i].y, dz = lz - ep[i].z, dd = Math.hypot(dx, dy, dz);
          if (dd > lim) { const k = lim / dd, tg = _bp1.copy(sh[i]).addScaledVector(cRight, ep[i].x + dx * k).addScaledVector(cU2, ep[i].y + dy * k).addScaledVector(cF2, ep[i].z + dz * k);
            const mid = _bq2.copy(sh[i]).add(wrist[i]).multiplyScalar(0.5), np = tg.sub(mid); if (np.lengthSq() > 1e-8) el = ik(sh[i], wrist[i], D.upper, D.fore, np.normalize(), _el[i], true); } }
        const r2 = _bp0.copy(el).sub(sh[i]); ep[i].set(r2.dot(cRight), r2.dot(cU2), r2.dot(cF2)); eok[i] = !!this.handInit; }
      if (this.dbgOn && this.dbg) { (this.dbg.wr3 || (this.dbg.wr3 = []))[i] = wrist[i].clone(); (this.dbg.el || (this.dbg.el = []))[i] = el.clone(); (this.dbg.pole || (this.dbg.pole = []))[i] = pole.clone(); }
      // Last of all, no arm segment turns faster than an arm does, outside the instant of the hit: about thirty-six degrees a frame,
      // measured against the chest, as the audit measures it. (Every limit before this one works on where the hand and the elbow
      // are, and where two of them hand over in the same frame, a stroke begun a fifth of a second before the ball, a two-hander's
      // grip let go, the upper arm could still swing forty-five degrees in one frame.)
      if (!globalThis.__noSegLim) { const sl = this.segL || (this.segL = [null, null]), cR = _sgR, cU = _sgU, cF = _sgF; if (globalThis.__segChest) { cR.copy(cRight); cU.set(0, 1, 0).applyQuaternion(qChest); cF.copy(cU).cross(cR).normalize(); } else bodyFrame(person, pelvis, cR, cU, cF);
        const loc = (v, o) => o.set(v.dot(cR), v.dot(cU), v.dot(cF)), wld = (l, o) => o.set(0, 0, 0).addScaledVector(cR, l.x).addScaledVector(cU, l.y).addScaledVector(cF, l.z);
        const ua = loc(_sgA.copy(el).sub(sh[i]).normalize(), _sgA2), fa = loc(_sgB.copy(wrist[i]).sub(el).normalize(), _sgB2);
        const ucS = st && st.tc != null ? t - st.tc : 9, srvS = st && (st.kind === 'serve' || st.kind === 'smash'), hitWin = srvS ? (ucS > -0.22 && ucS < 0.17) : (ucS > -0.11 && ucS < 0.09);
        const prev = sl[i], ok = prev && this.handInit && dt > 0 && prev.pt === this.placedT;
        // (a free arm, holding nothing, to thirty degrees: it has no racket to keep up with, and at the full limit single frames of
        // its swing back for balance read as a flick; and one half on the handle, letting go of it or taking it, to twenty: held on
        // the throat by the grip and then let go, the hand left it in one frame at the full thirty as a slice's take-back began)
        if (ok && !hitWin) { const mx = (i === off && !((this.gripOn || 0) > (globalThis.__freeLimG ?? 0.8)) && !globalThis.__freeLimOld ? ((this.gripOn || 0) > 0.01 && !globalThis.__relLimOld ? (globalThis.__relLim ?? 0.35) : 0.52) : 0.63) * Math.min(2, dt * 60), lim = (cur, pv) => { const ang = Math.acos(clamp(cur.dot(pv), -1, 1)); if (ang > mx) { const ax = _sgC.copy(pv).cross(cur); if (ax.lengthSq() < 1e-10) return false; cur.copy(pv).applyAxisAngle(ax.normalize(), mx); return true; } return false; };
          const c1 = lim(ua, prev.ua), c2 = lim(fa, prev.fa);
          if (c1 || c2) { const e2 = wld(ua, _sgC).multiplyScalar(D.upper).add(sh[i]); const w2 = wld(fa, _sgA).multiplyScalar(D.fore).add(e2); const dW = _sgB.copy(w2).sub(wrist[i]);
            el.copy(e2); wrist[i].copy(w2); this.hand[i].add(dW); } }
        if (!prev) sl[i] = { ua: V(), fa: V(), nua: V(), nfa: V(), pt: null, npt: null }; sl[i].nua.copy(ua); sl[i].nfa.copy(fa); sl[i].npt = this.placedT; }
      const Ff = person.setLimb(S, 'arm', el, wrist[i], qChest, sh[i], _qa, _qb);
      // the hand turns at the wrist so the handle lies across the palm
      const Fh = this.Fhand[i];
      if (i === hit) { swing(Ff, person.dir['grip' + S], this.rk.dir, _qc); Fh.copy(_qc); }            // the fist closes exactly along the handle
      else if (gripW > 0.001 && !(m.ball && m.ball.held === p.i)) {
        // the off hand closes round the handle from the other side: its palm faces the hitting hand's through the grip
        swing(Ff, person.dir['grip' + S], this.rk.dir, _qc);
        const HS = hit === 0 ? 'L' : 'R', pn = person.dir['palmN' + S], hpn = person.dir['palmN' + HS];
        if (pn && hpn) {
          const ax = _v8.copy(this.rk.dir).normalize(), cur = _v9.copy(pn).applyQuaternion(_qc), want = _a.copy(hpn).applyQuaternion(this.Fhand[hit]).negate();
          cur.addScaledVector(ax, -cur.dot(ax)); want.addScaledVector(ax, -want.dot(ax));
          if (cur.lengthSq() > 1e-6 && want.lengthSq() > 1e-6) { cur.normalize(); want.normalize(); const ang = Math.atan2(_b.copy(cur).cross(want).dot(ax), cur.dot(want)); _qc.premultiply(_q6.setFromAxisAngle(ax, ang)); }
        }
        Fh.copy(Ff).slerp(_qc, Math.max(this.twoHW, clamp(pose.lgrip * 2.4, 0, 1)) * gripW);
      }
      else if (this.tossW > 0.01 && person.dir['palmN' + S]) {
        // carrying the ball up: the palm faces the way the arm lifts it, forward while the arm is low, turning up under the ball as it rises
        const el = sm((wrist[i].y - (sh[i].y - 0.45 * H)) / (0.35 * H)), pd = _v9.copy(fwd).lerp(UP, 0.35 + 0.65 * el).normalize();
        swing(Ff, person.dir['palmN' + S], pd, _qc); Fh.copy(Ff).slerp(_qc, this.tossW);
      }
      else if (i === off && m.phase === 'ready' && m.ball && m.ball.held === p.i && (this.addrHandW || 0) > 0.01 && person.dir['palmN' + S]) {
        // bouncing it: the hand over the ball, palm down and a little forward, pushing it down and taking it back
        swing(Ff, person.dir['palmN' + S], _v9.set(0, -1, 0).addScaledVector(fwd, 0.35).normalize(), _qc); Fh.copy(Ff).slerp(_qc, 0.9 * this.addrHandW);
      }
      else Fh.copy(Ff);
      person.drive(S + '_Hand', Fh);
      // a hand on the handle closes round it (about 60, 80 and 55 degrees at the three finger joints); a free hand hangs loose
      person.setFingers(S, i === hit ? 1.02 : m.ball && m.ball.held === p.i ? 0.45 : Math.max(0.3 + 0.65 * gripW, globalThis.__reactAnimOld ? 0 : (this.reactK || 0) * (this.reactFist || 0) * 1.05), i !== hit && !globalThis.__pointOld ? (this.reactK || 0) * (this.reactPoint || 0) : 0);   /* (the free hand clenched for a fist pump, the vamos; its index finger out for Wawrinka's tap to the temple) */
      // legs: the ankle where the clip puts it over the ground, the knee bent the way the clip's is
      const hip = i === 0 ? hipL : hipR, ft = this.feet[i], jh = LJ[i][0], jk = LJ[i][1], ja = LJ[i][2], jt = LJ[i][3];
      const ankle = _an[i];
      const kp = kpFor(i, _v8);
      const dd = _v9.copy(ankle).sub(hip), mxL = (D.thigh + D.shank) * 0.998; if (dd.length() > mxL) ankle.copy(hip).addScaledVector(dd.normalize(), mxL);
      const kn = ik(hip, ankle, D.thigh, D.shank, kp, _kn[i]);
      // (the second leg kept a calf's width off the first, its knee turned out round its own hip-to-ankle line, which leaves
      // both the hip and the foot where they are: in a scissoring stride, a serve's landing or a turn on the spot the two
      // shins passed through each other)
      const othAir = !this.lockF[1 - i].on || !!this.lockF[1 - i].step, meAir = !this.lockF[i].on || !!this.lockF[i].step;
      // (the leg that turns its knee out is the one in the air, or the right one when both are down or both up; the other's
      // knee is where it is or, not yet solved, where it will be)
      const sepMe = meAir && !othAir ? true : !meAir && othAir ? false : i === 1;
      if (sepMe && !globalThis.__legSepOld) { const o = 1 - i, hip0 = o === 0 ? hipL : hipR, a0 = _an[o], k0 = o < i ? _kn[o] : ik(hip0, a0, D.thigh, D.shank, kpFor(o, _kpO), _kpK), mn = (globalThis.__legSep ?? 0.115) * H;
        const segD = (p0, p1, q0, q1) => { let best = 9; for (let k = 0; k <= 6; k++) { const q = _lsA.copy(p0).lerp(p1, k / 6), ab = _lsB.copy(q1).sub(q0), tt = clamp(_lsC.copy(q).sub(q0).dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1); best = Math.min(best, q.distanceTo(_lsC.copy(q0).addScaledVector(ab, tt))); } return best; };
        const legD = (kk) => Math.min(segD(kk, ankle, k0, a0), segD(_lsD.copy(hip).lerp(kk, 0.55), kk, _lsE.copy(hip0).lerp(k0, 0.55), k0), segD(kk, ankle, _lsE.copy(hip0).lerp(k0, 0.55), k0), segD(_lsD.copy(hip).lerp(kk, 0.55), kk, k0, a0));
        const ax = _lsF.copy(ankle).sub(hip); const al = ax.length();
        let want = 0;
        if (al > 1e-3) { ax.multiplyScalar(1 / al); const rel = _lsG.copy(kn).sub(hip), rot = th => _lsH.copy(rel).applyAxisAngle(ax, th).add(hip);
          if (legD(kn) < mn) { let best = 0, bd = legD(kn); for (const th of (globalThis.__legSepNarrowOld ? [0.15, -0.15, 0.3, -0.3, 0.45, -0.45, 0.6, -0.6] : [0.15, -0.15, 0.3, -0.3, 0.45, -0.45, 0.6, -0.6, 0.75, -0.75, 0.9, -0.9])) {   /* (as far as ninety degrees out, at up to nine degrees a frame: at sixty and six, a stroke's finish with both feet off the court still brought the shins together) */ const dd = legD(rot(th)); if (dd >= mn) { best = th; bd = dd; break; } if (dd > bd + 0.005) { bd = dd; best = th; } } want = best; }
          const LS = this.legSepA || (this.legSepA = [0, 0]), cur = LS[i], mxS = (globalThis.__legSepNarrowOld ? 0.1 : 0.16) * Math.max(dt * 60, 0.5); LS[i] = cur + clamp(want - cur, -mxS, mxS);
          if (Math.abs(LS[i]) > 1e-4) kn.copy(rot(LS[i])); if (this.dbgOn) this.dbgLegSep = LS.map(x => +x.toFixed(2)); } }
      else if (this.legSepA && this.legSepA[i]) { const LS = this.legSepA, mxS = 0.1 * Math.max(dt * 60, 0.5); LS[i] -= clamp(LS[i], -mxS, mxS); const ax = _lsF.copy(ankle).sub(hip), al = ax.length(); if (al > 1e-3 && Math.abs(LS[i]) > 1e-4) { ax.multiplyScalar(1 / al); kn.copy(_lsG.copy(kn).sub(hip).applyAxisAngle(ax, LS[i]).add(hip)); } }
      const Fs = person.setLimb(S, 'leg', kn, ankle, qPel, hip, _qa, _qb);
      // the foot: along the clip's ankle-to-ball line, flat once it is down
      const fd = cdir(ja, jt, _v8), down = (1 - sm((ankle.y - air * 0.9 - D.ankle) / (0.05 * H))) * (this.heel[i] > 0.005 ? 0 : 1); if (this.heel[i] > 0.005) { fd.copy(person.dir['foot' + S]).applyQuaternion(qPel); fd.y -= this.heel[i] * 6; fd.normalize(); } if (down > 0) { const rest = _v9.copy(person.dir['foot' + S]).applyQuaternion(qYaw); fd.y = lerp(fd.y, rest.y, down); fd.normalize(); }
      // (and never tipped into the court: a heel up on its toes, the toes stay on the surface, the foot no steeper than
      // that; tilted further, the front of the shoe went down through the court a few centimetres)
      // (a foot on its way somewhere carries its toes clear of the court, more the faster it goes: pitched down a couple of
      // centimetres over the surface through a step or a stride, the toe looked to be dragged along it)
      const ap = this.ankPrev || (this.ankPrev = [V(), V()]), fsp = dt > 0 && this.inited ? Math.hypot(ankle.x - ap[i].x, ankle.z - ap[i].z) / dt : 0; ap[i].copy(ankle);
      const clr = this.lockF[i].on ? 0 : 0.045 * H * sm((fsp - 0.8) / 2.2);
      { const fl = 0.18 * H, ay = ankle.y, minY = 0.018 + clr - ay;      /* (the ankle-to-toe of these feet is 17-18 cm) */ if (fd.y * fl < minY) { const hz = Math.hypot(fd.x, fd.z) || 1, ny = clamp(minY / fl, -0.95, 0.95), k = Math.sqrt(1 - ny * ny) / hz; fd.x *= k; fd.z *= k; fd.y = ny; } }
      // (a foot planted up on its toes has its toe on the court: pitched as the clip had it, the toe of a heel-up foot stood a few
      // centimetres off the court with the whole foot in the air)
      if (this.lockF[i].on && this.lockF[i].toe) { const fl = 0.18 * H, want = 0.016 - ankle.y; if (fd.y * fl > want) { const hz = Math.hypot(fd.x, fd.z) || 1, ny = clamp(want / fl, -0.95, 0.95), k = Math.sqrt(1 - ny * ny) / hz; fd.x *= k; fd.z *= k; fd.y = ny; } }
      // (and its heading turns as a foot does, about the ankle, a planted one slowly as it pivots on the ball of the foot:
      // taken from the clip frame by frame, a foot on its toes, pointing nearly straight down, had no steady heading, and
      // the toe was flicked round the court at ten metres a second)
      // (and points the way its knee bends, within about twenty-five degrees, as a knee tracks over its toes: the tracked toes
      // splay out forty-five degrees and more, video loses their depth, and with the knees bending straight ahead over feet
      // turned out like that he looked knock-kneed from behind in every wide stance)
      let hKnee = null, kW = 0;
      { const mid = _a.copy(hip).add(ankle).multiplyScalar(0.5), kf = _b.copy(kn).sub(mid); kf.y = 0; const kl = kf.length(); kW = sm((kl - 0.04 * H) / (0.06 * H)); if (kW > 0.001) hKnee = Math.atan2(kf.x, kf.z); }
      { const fy = this.fYaw || (this.fYaw = [null, null]), hz = Math.hypot(fd.x, fd.z); let h = Math.atan2(fd.x, fd.z);
        if (hKnee != null) { let dk = h - hKnee; dk = Math.atan2(Math.sin(dk), Math.cos(dk)); const lim = lerp(Math.PI, 0.44, kW); if (Math.abs(dk) > lim) h = hKnee + Math.sign(dk) * lim; }
        if (fy[i] == null || !this.inited || dt <= 0) fy[i] = h;
        else if (hz > 0.25) { let dh = h - fy[i]; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); const mx = (this.lockF[i].on ? 5 : 14) * dt; fy[i] += clamp(dh, -mx, mx); }
        if (hz > 1e-4) { fd.x = Math.sin(fy[i]) * hz; fd.z = Math.cos(fy[i]) * hz; } }
      swing(Fs, person.dir['foot' + S], fd, _qc);
      person.drive(S + '_Foot', _qc); person.drive(S + '_Toe0', _qc);
    }
    this.poleInit = true;
    // head: watch the ball
    const headC = this.head.copy(chest).setY(chest.y + (D.headY - D.shY) + 0.06 * H);
    let hy = 0, hp = (pose.head || 0);
    const b = m.ball;
    if (b && b.visible && (m.phase === 'live' || m.phase === 'toss')) { const dx = b.x - headC.x, dy = b.y - headC.y, dz = b.z - headC.z; const lx = dx * right.x + dz * right.z, lf = dx * fwd.x + dz * fwd.z; hy = clamp(Math.atan2(lx, Math.max(0.3, lf)), -1.1, 1.1); hp = clamp(Math.atan2(dy, Math.hypot(lx, lf)), -0.9, 1.1); }
    ease(this, 'headYaw', hy, 24, dt); ease(this, 'headPitch', hp, 24, dt);
    _qc.copy(qChest).slerp(qYaw, 0.6).multiply(_q5.setFromAxisAngle(UP, -this.headYaw * 0.85)).multiply(_q6.setFromAxisAngle(_v8.set(1, 0, 0), this.headPitch * 0.8));
    person.drive('Neck', _qa.copy(qChest).slerp(_qc, 0.5)); person.drive('Head', _qc);
    // the collarbones hang from the neck in this skeleton: turning the head must not carry the shoulders (and the arms
    // already solved from them) with it, so they go back to where the arms were solved from
    person.redrive('L_Clavicle'); person.redrive('R_Clavicle');
    // He blinks: every two to five and a half seconds, now and then twice in quick succession, the lids coming down in
    // about six hundredths of a second and going back up a little slower (people.js moves the lids; the heads have no
    // eyelids of their own to rig)
    if (this.blinkU === undefined) { this.blinkU = null; this.group.traverse(o => { if (!this.blinkU && o.isMesh && o.material && o.material.userData && o.material.userData.U && o.material.userData.U.uBlink) this.blinkU = o.material.userData.U.uBlink; }); }
    if (this.blinkU && dt > 0) {
      if (this.blinkAt == null) this.blinkAt = t + 1 + Math.random() * 3;
      const bu = t - this.blinkAt;
      this.blinkU.value = bu < 0 ? 0 : bu < 0.06 ? sm(bu / 0.06) : bu < 0.08 ? 1 : bu < 0.17 ? 1 - sm((bu - 0.08) / 0.09) : 0;
      if (bu >= 0.17) this.blinkAt = t + (Math.random() < 0.12 ? 0.25 : 2 + Math.random() * 3.5);
      if (bu < -6) this.blinkAt = t + Math.random() * 2;          // (the clock went back: a replay, a new match)
    }
    // the eyes go the rest of the way, and get there first: the head turns most of the way to the ball, the eyes finish it
    if (person.bones['Bip01_LEye']) {
      this.eyeYaw = damp(this.eyeYaw || 0, clamp(hy - this.headYaw * 0.85, -0.42, 0.42), 30, dt); this.eyePitch = damp(this.eyePitch || 0, clamp(hp - this.headPitch * 0.8, -0.3, 0.3), 30, dt);
      _qa.copy(_qc).multiply(_q5.setFromAxisAngle(UP, -this.eyeYaw)).multiply(_q6.setFromAxisAngle(_v8.set(1, 0, 0), this.eyePitch));
      person.drive('LEye', _qa); person.drive('REye', _qa);
    }
    // the mouth: open on the breath out through the hit (more on the serve), wide in a shout after a point won
    // with feeling, and a little when running hard
    const jb = person.bones['Bip01_MJaw'];
    if (jb) {
      let jw = 0;
      if (st && st.tc != null) { const ju = t - st.tc - 0.05; jw = Math.exp(-(ju * ju) / 0.012) * (st.kind === 'serve' || st.kind === 'smash' ? 0.2 : st.kind === 'drop' || st.kind === 'slice' || st.kind === 'block' ? 0.06 : 0.14); }
      jw = Math.max(jw, (this.reactK || 0) * (this.reactShout || 0), sm((speed - 3.5) / 1.5) * 0.05);
      this.jaw = damp(this.jaw || 0, jw, 22, dt);
      if (!jb.userData.q0) jb.userData.q0 = jb.quaternion.clone();
      jb.quaternion.copy(jb.userData.q0).multiply(_q6.setFromAxisAngle(_v8.set(0, 0, 1), this.jaw));
    }
    person.arm.updateWorldMatrix(false, true);
    person.jointPos('LEye', this.eye).add(person.jointPos('REye', _v8)).multiplyScalar(0.5);
    // racket in the hitting hand
    const R = this.racket, hh = this.hand[hit];
    // the palm of the hitting hand, read back from the posed skeleton
    const SH = hit === 0 ? 'L' : 'R';
    person.jointPos(SH + '_Hand', _v8); _grip.copy(person.dir['palm' + SH]).applyQuaternion(this.Fhand[hit]).add(_v8);
    if (person.dir['palmN' + SH]) _grip.addScaledVector(_v9.copy(person.dir['palmN' + SH]).applyQuaternion(this.Fhand[hit]), PALM_OFF * H);
    // the racket kept out of the body, from where the hand really is now the arm is posed (tipped at the wrist, a few
    // passes, so tipping it off one side of the trunk does not put it through another)
    // (and the head where it really is now, not straight over the middle of the chest, where it was guessed before the body
    // was posed: leaning back as he ran, a backhand's recovery swung the racket head through his own, round the guessed one)
    if (!globalThis.__headRealOld) { const hj = person.jointPos('Head', _hrA), nj = person.jointPos('Neck', _hrB), dv = _hrC.copy(hj).sub(nj); if (dv.lengthSq() > 1e-6) { dv.normalize(); headC0.copy(hj).addScaledVector(dv, 0.08 * H); _hdJ.copy(hj); this.headJOk = true; } }
    { const Lr = (B.headC + GRIP_UP) * H, rk = this.rk.dir;
      if (globalThis.__headFirst) headRound(_grip, rk, this.rk.nrm, Lr, (globalThis.__headM ?? 0.005) * H, 1);
      for (let it = 0; it < 3; it++) { let wk = 1e-6, best = -1; const bp = _bp0;
        for (let k = 2; k <= (globalThis.__tipOld ? 10 : 13); k++) { const ps = bodyPush(_bm.copy(_grip).addScaledVector(rk, Lr * k / 10), 0.03 * H, _be, !globalThis.__headRoundOld); if (ps.lengthSq() > wk) { wk = ps.lengthSq(); best = k; bp.copy(ps); } }
        if (best < 0) break;
        rk.copy(_bm.copy(rk).multiplyScalar(Lr * best / 10).add(bp)).normalize(); }
      const nn = this.rk.nrm; nn.addScaledVector(rk, -nn.dot(rk)).normalize();
      // (the head last: the trunk's push, after it, put the frame back into the jaw)
      if (!globalThis.__headFirst) headRound(_grip, rk, this.rk.nrm, Lr, (globalThis.__headM ?? 0.005) * H, 1); }
    const z = _v8.copy(this.rk.nrm).addScaledVector(this.rk.dir, -this.rk.nrm.dot(this.rk.dir)).normalize(), x = _v9.copy(this.rk.dir).cross(z).normalize();
    // Last, the racket as drawn turns no faster than a racket does away from the swing at the ball: twenty-two degrees a frame,
    // unless keeping to that would leave it more than two centimetres inside the body or the head. (Each pass before this
    // keeps it out of the body as it can; where the clip let go of a moving player's finish and the hand dropped toward his
    // chest in a frame, keeping out took a third of a right angle in one.)
    { const rd = this.rkDrawn || (this.rkDrawn = { d: V(), n: V(), ok: false, pt: null }), ucR = st && st.tc != null ? t - st.tc : (st && st.tcPlan != null ? t - st.tcPlan : 9), srvR = st && (st.kind === 'serve' || st.kind === 'smash');
      const swingWin = st && (srvR ? (ucR > -0.75 && ucR < 0.45) : (ucR > -0.38 && ucR < 0.3));
      if (!globalThis.__rkLimOld && rd.ok && rd.pt === this.placedT && !swingWin && dt > 0) {
        const cur = this.rk.dir, ang = Math.acos(clamp(cur.dot(rd.d), -1, 1)), mx = (globalThis.__rkLim ?? 0.38) * dt * 60;
        if (ang > mx) { const Lr = (B.headC + GRIP_UP) * H, ax = _rlA.copy(rd.d).cross(cur); if (ax.lengthSq() > 1e-10) { ax.normalize();
          const pen = (a) => { const d = _rlD.copy(rd.d).applyAxisAngle(ax, a); let p = 0; for (let k = 2; k <= 13; k++) { const q = _rlQ.copy(_grip).addScaledVector(d, Lr * k / 10); p = Math.max(p, bodyPush(q, 0, _rlP, true).length()); if (this.headJOk) { const ab = _rlB.copy(headC0).sub(_hdJ), tt = clamp(_rlC.copy(q).sub(_hdJ).dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1); p = Math.max(p, 0.095 * H - q.distanceTo(_rlC.copy(_hdJ).addScaledVector(ab, tt))); } } return p; };
          let a = mx; const lim = 0.02; if (pen(a) > lim) { let lo = a, hi = ang; if (pen(hi) > lim) a = hi; else { for (let it = 0; it < 7; it++) { const mid = (lo + hi) / 2; if (pen(mid) > lim) lo = mid; else hi = mid; } a = hi; } }
          // (and even getting out of the body or the head, no more than about twenty-eight degrees a frame: let go entirely there, a
          // racket brought down past the head after Nadal's finish over it was flicked thirty-eight degrees in a frame; a frame or two
          // with the frame a little in the hair shows less than that)
          if (!globalThis.__rkEscOld) a = Math.min(a, Math.max(mx, (globalThis.__rkEsc ?? 0.49) * dt * 60));
          if (a < ang - 1e-4) { const q = _rlR.setFromAxisAngle(ax, a), d = _rlD.copy(rd.d).applyQuaternion(q).normalize(), qq = _rlS.setFromUnitVectors(_rlE.copy(cur), d); this.rk.dir.copy(d); this.rk.nrm.applyQuaternion(qq).normalize(); } } } }
      rd.d.copy(this.rk.dir); rd.ok = true; rd.pt = this.placedT; }
    { const z2 = _v8.copy(this.rk.nrm).addScaledVector(this.rk.dir, -this.rk.nrm.dot(this.rk.dir)).normalize(); z.copy(z2); x.copy(this.rk.dir).cross(z).normalize(); }
    if (this.dbgOn && this.dbgDir) this.dbgDir.c5 = this.rk.dir.clone();
    _m.makeBasis(x, this.rk.dir, z); R.quaternion.setFromRotationMatrix(_m);
    R.position.copy(_grip).addScaledVector(this.rk.dir, GRIP_UP * H);
    // The free hand on the racket, last. It was aimed at the handle (or the throat) before the arms were solved, but each arm is
    // then kept within its reach, off its own shoulder, out of the body and to an arm's speed on its own, and the racket goes
    // where the hitting hand ends up: the hand meant to be holding it was left up to a third of a metre off it, through a
    // two-hander's swing and in the ready position. So now that the racket is placed, that arm is solved again to put the palm
    // where it grips, and the hand closed round it.
    if (!((this.gripOn || 0) > 0.01) || (m.ball && m.ball.held === p.i)) { this.rgOk = false; this.rgElOk = false; if (this.rgCor) this.rgCor.set(0, 0, 0); this.regripShort = 0; }   /* (and nothing out of reach while not holding it: kept from the last frame it held on, the hold that lets go as the throat goes out of reach never took the racket again, the free hand left off it in the ready position) */
    if ((this.gripOn || 0) > 0.01 && !(m.ball && m.ball.held === p.i) && !globalThis.__noRegrip) {
      // (all the way on the handle until the grip is mostly let go of, then off it quickly: in proportion to the grip, the hand
      // was left hovering a hand's breadth off the throat through the first tenth of a second of every forehand take-back)
      const OS = off === 0 ? 'L' : 'R', HS = hit === 0 ? 'L' : 'R', wOn = globalThis.__rgOld ? this.gripOn : sm((this.gripOn - 0.3) / 0.45), sO = globalThis.__rgShOld ? (off === 0 ? shL : shR) : person.jointPos(OS + '_UpperArm', _rgSh);   /* (from the shoulder joint where the skeleton has it now: solved from the one worked out for the arms earlier, a few centimetres off it as the trunk turns and bobs at a run, the arm was laid in the right directions from the wrong place and the hand landed that far off the handle, the same however often it was solved again) */
      const want = _rg1.copy(_grip).addScaledVector(this.rk.dir, (this.gripAtE != null ? this.gripAtE : 0.105) * H);
      const w0 = person.jointPos(OS + '_Hand', _rg2), pNow = _rg3.copy(person.dir['palm' + OS]).applyQuaternion(this.Fhand[off]).add(w0);
      if (person.dir['palmN' + OS]) pNow.addScaledVector(_rg4.copy(person.dir['palmN' + OS]).applyQuaternion(this.Fhand[off]), PALM_OFF * H);
      const gap = _rg4.copy(want).sub(pNow);
      if (this.dbgOn) this.regripGap = +gap.length().toFixed(3);
      // (the correction applied changes by no more than a few centimetres a frame: where the arm's own solution jumps, as a
      // limit lets go, the hand is carried over it rather than jumping with it)
      const cor = gap.multiplyScalar(wOn), prv = this.rgCor || (this.rgCor = V()), mxC = (globalThis.__rgRate ?? 0.05) * H * (dt * 60);
      if (this.rgOk && dt > 0) { const dc = _rgM.copy(cor).sub(prv), dl = dc.length(); if (dl > mxC) cor.copy(prv).addScaledVector(dc, mxC / dl); }
      prv.copy(cor); this.rgOk = true; if (this.dbgOn) this.dbgRg = { cor: +cor.length().toFixed(3), wOn: +wOn.toFixed(2), w0: w0.clone() };
      if (!(cor.lengthSq() > 1e-6)) this.rgElOk = false;
      if (cor.lengthSq() > 1e-6) {
        // (the elbow kept on the side the arm's own solution has it: re-solved with the smoothed aim instead, it was put on the
        // other side of the arm whenever this came on or off, the free arm thrown eighty degrees in a frame)
        const elNow = person.jointPos(OS + '_Forearm', _rgP), mid0 = _rgM.copy(sO).add(w0).multiplyScalar(0.5), pole2 = elNow.sub(mid0);
        if (pole2.lengthSq() < 1e-8) pole2.copy(this.poleS[off]); else pole2.normalize();
        const nw = w0.add(cor);
        // (and held to where that elbow was the frame before, in the chest's frame: taken from the arm's own solution each frame,
        // with the hands pushed off the handle and pulled back to it every frame of a two-hander's take-back, that solution put
        // the elbow on the far side of the arm for one frame and the top elbow was thrown out and back, forty degrees)
        if (globalThis.__rgPoleOn && this.rgElOk && this.rgEl) { const mid2 = _rpB.copy(sO).add(nw).multiplyScalar(0.5), ax = _rpC.copy(nw).sub(sO).normalize(), pw = _rpA.copy(this.rgEl).applyQuaternion(qChest).add(sO).sub(mid2);
          pw.addScaledVector(ax, -pw.dot(ax)); const pc = _rpD.copy(pole2).addScaledVector(ax, -pole2.dot(ax));
          // (only where the arm's own answer has jumped round the arm, more than a sixth of a turn from where the elbow was: held to it
          // always, an elbow the body push was taking out of the chest was kept in it)
          if (pw.lengthSq() > 1e-6 && pc.lengthSq() > 1e-6 && pw.normalize().dot(pc.normalize()) < (globalThis.__rgPoleCos ?? 0.5)) pole2.copy(pw); }
        const dd = _rgE.copy(nw).sub(sO), mx = (D.upper + D.fore) * 0.995; this.regripShort = Math.max(0, dd.length() - mx); if (!globalThis.__oneOutOld && this.regripShort > 0.015 && (this.oneHW || 0) > 0.5 && !(this.twoHW > 0.5) && this.gripOn > 0.78) { this.gripOn = 0.78; this.oneHW = Math.min(this.oneHW, 0.78); this.oneHWV = 0; }   /* (a hand that cannot reach the throat is not holding it: said to, that frame) */ if (dd.length() > mx) nw.copy(sO).addScaledVector(dd.normalize(), mx);
        const el2 = ik(sO, nw, D.upper, D.fore, pole2, _rgE, true);
        // (and turned no faster than an arm turns, as above: this pass comes after that limit)
        { const sl = this.segL && this.segL[off], ucG = st && st.tc != null ? t - st.tc : 9, srvG = st && (st.kind === 'serve' || st.kind === 'smash'), winG = srvG ? (ucG > -0.22 && ucG < 0.17) : (ucG > -0.11 && ucG < (this.twoHW > 0.5 && !globalThis.__rgOld ? 0.3 : 0.09));   /* (a two-hander's top hand stays on the handle through the whipped finish: held to an arm's turn per frame there, it trailed the racket by a hand's breadth) */
          if (sl && sl.pt === this.placedT && dt > 0 && !globalThis.__noSegLim && !winG) {
            const cU = _sgU, cR = _sgR, cF = _sgF, mx = ((this.gripOn || 0) <= (globalThis.__freeLimG ?? 0.8) && !globalThis.__freeLimOld ? ((this.gripOn || 0) > 0.01 && !globalThis.__relLimOld ? (globalThis.__relLim ?? 0.35) : 0.52) : 0.63) * Math.min(2, dt * 60); if (globalThis.__segChest) { cR.copy(cRight); cU.set(0, 1, 0).applyQuaternion(qChest); cF.copy(cU).cross(cR).normalize(); } else bodyFrame(person, pelvis, cR, cU, cF);
            const loc = (v, o) => o.set(v.dot(cR), v.dot(cU), v.dot(cF)), wld = (l, o) => o.set(0, 0, 0).addScaledVector(cR, l.x).addScaledVector(cU, l.y).addScaledVector(cF, l.z);
            const ua = loc(_sgA.copy(el2).sub(sO).normalize(), _sgA2), fa = loc(_sgB.copy(nw).sub(el2).normalize(), _sgB2);
            const lim = (cur, pv) => { const ang = Math.acos(clamp(cur.dot(pv), -1, 1)); if (ang > mx) { const ax = _sgC.copy(pv).cross(cur); if (ax.lengthSq() > 1e-10) cur.copy(pv).applyAxisAngle(ax.normalize(), mx); } };
            lim(ua, sl.ua); lim(fa, sl.fa);
            if (this.dbgOn && this.dbgRg) this.dbgRg.nwPre = nw.clone();
            el2.copy(wld(ua, _sgC)).multiplyScalar(D.upper).add(sO); nw.copy(wld(fa, _sgC)).multiplyScalar(D.fore).add(el2);
            if (this.dbgOn && this.dbgRg) { this.dbgRg.nwLim = nw.clone(); this.dbgRg.elLim = el2.clone(); }
            sl.nua.copy(ua); sl.nfa.copy(fa); } }
        const Ff = person.setLimb(OS, 'arm', el2, nw, qChest, sO, _rgA, _rgB);
        (this.rgEl || (this.rgEl = V())).copy(el2).sub(sO).applyQuaternion(_rpQ.copy(qChest).invert()); this.rgElOk = true;
        swing(Ff, person.dir['grip' + OS], this.rk.dir, _rgQ);
        const pn = person.dir['palmN' + OS], hpn = person.dir['palmN' + HS];
        if (pn && hpn) { const ax = _rg2.copy(this.rk.dir).normalize(), cur = _rg3.copy(pn).applyQuaternion(_rgQ), wv = _rg4.copy(hpn).applyQuaternion(this.Fhand[hit]).negate();
          cur.addScaledVector(ax, -cur.dot(ax)); wv.addScaledVector(ax, -wv.dot(ax));
          if (cur.lengthSq() > 1e-6 && wv.lengthSq() > 1e-6) { cur.normalize(); wv.normalize(); const ang = Math.atan2(_rg1.copy(cur).cross(wv).dot(ax), cur.dot(wv)); _rgQ.premultiply(_rgQ2.setFromAxisAngle(ax, ang)); } }
        const Fh = this.Fhand[off]; Fh.copy(Ff).slerp(_rgQ, wOn); person.drive(OS + '_Hand', Fh);
        person.arm.updateWorldMatrix(false, true);
        // (and once more, measured with the hand as it is now turned onto the handle: where the palm is depends on how the hand is
        // turned, and judged from its turn of the frame before, a one-hander's hand on the throat of a slice set high by the far
        // shoulder was left six centimetres off it)
        if (!globalThis.__rg2Old) {
          const w1 = person.jointPos(OS + '_Hand', _rr1), p1 = _rr2.copy(person.dir['palm' + OS]).applyQuaternion(Fh).add(w1);
          if (person.dir['palmN' + OS]) p1.addScaledVector(_rr3.copy(person.dir['palmN' + OS]).applyQuaternion(Fh), PALM_OFF * H);
          const want2 = _rr3.copy(_grip).addScaledVector(this.rk.dir, (this.gripAtE != null ? this.gripAtE : 0.105) * H), res = want2.sub(p1).multiplyScalar(wOn);
          if (this.dbgOn && this.dbgRg) this.dbgRg.res = +res.length().toFixed(3);
          if (res.length() > 0.012) { const nw2 = _rr4.copy(w1).add(res.clampLength(0, 0.08 * H)), dd2 = _rr5.copy(nw2).sub(sO), mx2 = (D.upper + D.fore) * 0.995; if (dd2.length() > mx2) nw2.copy(sO).addScaledVector(dd2.normalize(), mx2);
            const elC = person.jointPos(OS + '_Forearm', _rr5), pole3 = elC.sub(_rr1.copy(sO).add(nw2).multiplyScalar(0.5));
            if (pole3.lengthSq() > 1e-8) { pole3.normalize(); const el3 = ik(sO, nw2, D.upper, D.fore, pole3, _rr6, true);
              person.setLimb(OS, 'arm', el3, nw2, qChest, sO, _rgA, _rgB); person.drive(OS + '_Hand', Fh); person.arm.updateWorldMatrix(false, true); } }
          if (this.dbgOn && this.dbgRg) { const w3 = person.jointPos(OS + '_Hand', _rr1), p3 = _rr2.copy(person.dir['palm' + OS]).applyQuaternion(Fh).add(w3); if (person.dir['palmN' + OS]) p3.addScaledVector(_rr3.copy(person.dir['palmN' + OS]).applyQuaternion(Fh), PALM_OFF * H);
            this.dbgRg.res2 = +_rr4.copy(_grip).addScaledVector(this.rk.dir, (this.gripAtE != null ? this.gripAtE : 0.105) * H).sub(p3).length().toFixed(3); this.dbgRg.short2 = +Math.max(0, _rr5.copy(_rr4.copy(_grip)).sub(sO).length() - (D.upper + D.fore)).toFixed(3); } }
      }
    }
    // ---- last, no elbow in the body ----
    // The trunk as it is finally drawn (the hips to the neck, as wide and deep as the shoulders make it) is checked once more
    // against each arm, after everything that moves an arm late in the frame: the second solve that puts a two-hander's top
    // hand on the handle, the hand sent out to the ball at contact. An elbow found inside is swung out round the line from
    // the shoulder to the wrist, by the least turn that clears it, so the hand and the racket stay where they are; the turn
    // comes on fast and goes off slowly. (Those late passes put the elbow back in the chest after the body push had cleared
    // it: a two-hander's top elbow sat a dozen centimetres inside it through the finish of a backhand hit on the run, and a
    // forehand's upper arm went through the ribs at the ball.)
    if (!globalThis.__noElbowClear && this.handInit) {
      const pel = person.jointPos('Pelvis', _ecP), up = person.jointPos('Neck', _ecU).sub(pel), tLen = up.length(); up.normalize();
      const lS = person.jointPos('L_UpperArm', _ecA), rt = person.jointPos('R_UpperArm', _ecB).sub(lS), shW = rt.length(); rt.addScaledVector(up, -rt.dot(up)).normalize(); const fw = _ecF.copy(up).cross(rt);
      const ins = q => { const rx = q.x - pel.x, ry = q.y - pel.y, rz = q.z - pel.z, al = rx * up.x + ry * up.y + rz * up.z; if (al < 0 || al > tLen * 1.05) return 0;
        const nk = al < 0.4 * tLen ? 0.75 + 0.25 * al / (0.4 * tLen) : al > 0.9 * tLen ? 0.75 : 1, dx = rx * rt.x + ry * rt.y + rz * rt.z, dz = rx * fw.x + ry * fw.y + rz * fw.z;
        const a = shW * 0.39 * nk + 0.05, b = (dz > 0 ? shW * 0.25 : shW * 0.32) * nk + 0.05, e = Math.hypot(dx / a, dz / b); return e < 1 ? (1 - e) * Math.min(a, b) : 0; };
      const ecA = this.ecAng || (this.ecAng = [0, 0]);
      for (let i = 0; i < 2; i++) {
        const S = i ? 'R' : 'L', sh = person.jointPos(S + '_UpperArm', _ecS), el = person.jointPos(S + '_Forearm', _ecE), wr = person.jointPos(S + '_Hand', _ecW);
        const ax = _ecX.copy(wr).sub(sh); if (ax.lengthSq() < 1e-6) continue; ax.normalize();
        const at = (a, out) => out.copy(el).sub(sh).applyAxisAngle(ax, a).add(sh);
        const pen = a => { const e2 = at(a, _ecT); return Math.max(ins(_ecQ.copy(sh).lerp(e2, 0.75)), ins(e2), ins(_ecQ.copy(e2).lerp(wr, 0.5))); };
        // the least turn that clears it, trying first the way it is already turned
        // (only a turn that does clear it: where none does, the hand pinned across the chest, the least bad one changed from frame
        // to frame and the elbow was thrown from side to side)
        let want = 0; if (this.dbgOn) { const pa = []; for (let k = -12; k <= 12; k += 2) pa.push(+pen(k * 0.17).toFixed(3)); (this.dbgEc || (this.dbgEc = []))[i] = { p0: +pen(0).toFixed(3), sweep: pa }; }
        if (pen(0) > 0.004) { const sg = ecA[i] < 0 ? -1 : 1;
          // (already turned one way, the way it is turned is kept while a turn that way, no more than a third of a turn past where it
          // is, still clears it: the least turn found on either side, a little less the other way, was a flip, refused, and the turn
          // went back to none for the frames it took, the free elbow of a two-hander's finish five centimetres in the chest)
          if (ecA[i] !== 0 && !globalThis.__ecSideOld) for (let k = 1; k <= 12; k++) { const a = sg * k * 0.17; if (Math.abs(a) > Math.abs(ecA[i]) + 0.6) break; if (pen(a) <= 0.004) { want = a; break; } }
          for (let k = 1; k <= 12 && !want; k++) for (const sd of [sg, -sg]) { const a = sd * k * 0.17; if (pen(a) <= 0.004) { want = a; break; } } }
        // (out fast, back slowly, and over to the other side only by way of none: switched straight across, the elbow was swung
        // from one side of the arm to the other at twenty degrees a frame)
        const grow = Math.abs(want) > Math.abs(ecA[i]) && (ecA[i] === 0 || Math.sign(want) === Math.sign(ecA[i])), ucE = st && st.tc != null && st.kind !== 'serve' && st.kind !== 'smash' ? t - st.tc : 9, nearE = i === (hs > 0 ? 1 : 0) && !globalThis.__ecNearOld ? Math.exp(-(ucE * ucE) / 0.0144) : 0, mx = (grow ? 0.15 * (1 + nearE) : 0.06) * (dt * 60);   /* (twice as fast out for the racket arm in the tenth of a second round the ball, where the arm itself turns twenty to forty degrees a frame: at nine degrees a frame the turn fell behind a late forehand's elbow, in the stomach for three frames) */   /* (nine degrees a frame at most: turned out at twenty, the turn itself was the jolt, the arm thrown thirty degrees in a frame as a volley's free hand came back to the racket) */
        const flip = ecA[i] !== 0 && want !== 0 && Math.sign(want) !== Math.sign(ecA[i]);
        // (but turned only a little that way, under a fifth of a right angle, it goes over at the faster pace straight away: refused,
        // the turn went back to none over the frames it took, and a late forehand's elbow sat in the stomach for four of them)
        const flipOk = flip && (globalThis.__ecFlip || (!globalThis.__ecFlipSmallOld && Math.abs(ecA[i]) < 0.35));
        if (flip && !flipOk) want = 0;
        // (over to the other side by way of none, at twice the easy pace: held to one side, a finish whose elbow needed turning the
        // other way out of the body was left in it, twelve centimetres, for a frame)
        const mx2 = flipOk ? 0.25 * (dt * 60) : mx;
        ecA[i] = dt > 0 ? ecA[i] + clamp(want - ecA[i], -mx2, mx2) : want;
        if (Math.abs(ecA[i]) < 1e-3) { ecA[i] = 0; continue; }
        const el2 = at(ecA[i], _ecT);
        person.setLimb(S, 'arm', el2, wr, qChest, sh, _qa, _qb); person.redrive(S + '_Hand');
        for (let f = 0; f <= 4; f++) for (const sg2 of ['', '1', '2']) { const nm = S + '_Finger' + f + sg2; if (person.world[nm]) person.redrive(nm); }
        person.arm.updateWorldMatrix(false, true);
        // (the turn limit next frame is measured from the arm as solved, not as turned here: fed this turn, it held the next
        // frame's arm back against it, the hand fell a quarter of a metre behind where it was going and then caught up in a frame)
      }
    }
    // (the arms as finally shown this frame are what the next frame's turn limit is measured from)
    if (this.segL) for (const q of this.segL) if (q && q.npt != null) { q.ua.copy(q.nua); q.fa.copy(q.nfa); q.pt = q.npt; }
    this.racketHead.copy(_grip).addScaledVector(this.rk.dir, (B.headC + GRIP_UP) * H);
    // the swing's blur: where the throat and tip have been this frame and the two before
    { const BL = this.blur, h = BL.hist;
      if (first) h.length = 0;
      if (dt > 0) {
        const yk = _v8.copy(_grip).addScaledVector(this.rk.dir, (GRIP_UP + B.headC - 0.165) * H), tp = _v9.copy(_grip).addScaledVector(this.rk.dir, (GRIP_UP + B.headC + 0.165) * H);
        h.push([yk.x, yk.y, yk.z, tp.x, tp.y, tp.z]); if (h.length > 3) h.shift();
      }
      const n = h.length, a = h[n - 1], b = n > 1 ? h[n - 2] : null, sp = b && dt > 0 ? Math.hypot(a[3] - b[3], a[4] - b[4], a[5] - b[5]) / dt : 0;
      const k = clamp((sp - 7) / 12, 0, 1); BL.k = b ? damp(BL.k || 0, k, 30, dt) : 0;
      BL.mesh.visible = BL.k > 0.02 && n > 1;
      if (BL.mesh.visible) {
        BL.mesh.material.uniforms.uK.value = BL.k;
        const pa = BL.mesh.geometry.attributes.position, NS = BL.NS;
        for (let i = 0; i < NS; i++) {
          const x = i / (NS - 1) * (n - 1), j = Math.min(n - 2, Math.floor(x)), f = x - j, A = h[j], Bh = h[j + 1];
          for (let e = 0; e < 2; e++) pa.setXYZ(i * 2 + e, A[e * 3] + (Bh[e * 3] - A[e * 3]) * f, A[e * 3 + 1] + (Bh[e * 3 + 1] - A[e * 3 + 1]) * f, A[e * 3 + 2] + (Bh[e * 3 + 2] - A[e * 3 + 2]) * f);
        }
        pa.needsUpdate = true;
      }
    }
    this.offHand.copy(this.hand[off]);
    // a ball in his hand is drawn where the posed hand really holds it: on the palm, against the fingers
    if (m.ball && m.ball.held === p.i) {
      const OS = off === 0 ? 'L' : 'R', pm = person.dir['palm' + OS], pn = person.dir['palmN' + OS];
      // (while the hand turns over at the start of the toss the ball is held in the fingertips, which stay against it
      // whichever way the palm faces; it settles back into the palm as the palm comes up under it)
      const turn = m.phase === 'toss' ? 1 - Math.abs(clamp(this.tossW || 0, 0, 1) - 0.5) * 2 : 0;
      if (pm && pn) { person.jointPos(OS + '_Hand', _v8); this.offHand.copy(pm).applyQuaternion(this.Fhand[off]).multiplyScalar(1 + 0.55 * turn).add(_v8).addScaledVector(_v9.copy(pn).applyQuaternion(this.Fhand[off]), 0.037 - 0.022 * turn); }
    }
    // Hanging hair swings: a pendulum per player, drawn toward hanging straight down (so it falls the right
    // way when he bends or turns his head) and left behind as the head speeds up, stops or changes direction.
    const hg = this.hair;
    if (hg && hg.userData.sway && dt > 0) {
      const HS = this.hairS || (this.hairS = { d: new THREE.Vector3(0, -1, 0), v: new THREE.Vector3(), p: new THREE.Vector3(), pv: new THREE.Vector3(), ok: false });
      person.jointPos('Head', _v8);
      if (!HS.ok || first) { HS.p.copy(_v8); HS.pv.set(0, 0, 0); HS.d.set(0, -1, 0); HS.v.set(0, 0, 0); HS.ok = true; }
      const vel = _v9.copy(_v8).sub(HS.p).divideScalar(dt), acc = _a.copy(vel).sub(HS.pv).divideScalar(dt).clampLength(0, 40);
      HS.pv.copy(vel); HS.p.copy(_v8);
      const f = _b.set(0, -1, 0).sub(HS.d).multiplyScalar(100).addScaledVector(HS.v, -7).addScaledVector(acc, -4);
      HS.v.addScaledVector(f, Math.min(dt, 1 / 30)); HS.d.addScaledVector(HS.v, Math.min(dt, 1 / 30)).normalize();
      const ang = Math.acos(clamp(-HS.d.y, -1, 1)); if (ang > 1.1) HS.d.lerp(_b.set(0, -1, 0), 1 - 1.1 / ang).normalize();
      hg.getWorldQuaternion(_q6).invert();
      hg.userData.sway.copy(HS.d).applyQuaternion(_q6).sub(_c.set(0, -1, 0)).multiplyScalar(0.9);
    }
    // contact shadow
    P.blob.position.set((this.feet[0].p.x + this.feet[1].p.x) / 2, 0.006, (this.feet[0].p.z + this.feet[1].p.z) / 2);
    const spread = Math.hypot(this.feet[0].p.x - this.feet[1].p.x, this.feet[0].p.z - this.feet[1].p.z);
    P.blob.scale.set(0.75 + spread * 0.9, 0.62 + spread * 0.5, 1); P.blob.material.opacity = 0.34 * (1 - clamp((hop + jump) * 5, 0, 0.6));
    P.blob.rotation.z = -(base - this.yaw);
  }

  // Feet either stay planted (and step when the body leaves them behind) or cycle in a gait.
  stepFeet(dt, p, m, pose, fwd, right, speed, between, air) {
    const H = this.H, st = (pose.stance || 0.3) * H;
    const moving = speed > 0.45;
    this.gaitW = damp(this.gaitW, moving ? 1 : 0, moving ? 12 : 9, dt);
    const vx = p.vx, vz = p.vz, vdx = speed > 1e-3 ? vx / speed : 0, vdz = speed > 1e-3 ? vz / speed : 0;
    const latK = right.x * vdx + right.z * vdz, fwdK = fwd.x * vdx + fwd.z * vdz, w = this.gaitW * (between ? 0.5 : 1);
    // backing up is stepped like the sideways shuffle, not run like a sprint
    const kS = between ? Math.abs(latK) : Math.max(Math.abs(latK), clamp(-fwdK, 0, 1));
    // cadence rises with speed, far more slowly than the ground covered: the steps get long
    const ga = gaitAt(speed, kS, between), cad = ga.cad, duty = ga.duty;
    if (moving) this.gait = (this.gait + cad * dt) % 1;
    // across the direction of travel the feet close in to a runner's narrow track
    const px = right.x - vdx * latK, pz = right.z - vdz * latK, pl = Math.hypot(px, pz);
    const narrow = lerp(1, Math.min(1, GAIT.track * H / Math.max(1e-3, st * pl)), this.gaitW * sm(speed / 2.4) * (1 - Math.abs(latK)) * (fwdK < 0 && !between ? 0.4 : 1));
    const trail = lerp(GAIT.trailF, GAIT.trail, kS) * Math.min(1, speed / 2);
    for (let i = 0; i < 2; i++) {
      const sx = i === 0 ? -1 : 1, f = this.feet[i];
      // where this foot wants to be at rest; on the move, the part of the stance that lies along
      // the direction of travel closes up to the measured spacing — leading foot a little ahead
      // of the hips, trailing foot well behind — so the feet pass each other instead of straddling
      const along = sx * st * latK, alongGo = lerp(along, (sx * latK * GAIT.lead - trail) * H, w);
      const hx = p.x + px * sx * st * narrow + vdx * alongGo, hz = p.z + pz * sx * st * narrow + vdz * alongGo;
      // gait position: down and still on the ground for `duty`, then swung through
      const ph = (this.gait + (i === 0 ? 0 : 0.5)) % 1;
      const stride = speed * duty / cad;                                // ground covered while this foot is down
      let rel, lift;
      if (ph < duty) { rel = 0.5 - ph / duty; lift = 0; }
      else { const u = (ph - duty) / (1 - duty); rel = -0.5 + sm(u); lift = Math.sin(Math.pow(u, 0.85) * Math.PI) * ga.lift * H; }
      const gx = hx + vdx * rel * stride, gz = hz + vdz * rel * stride;
      if (this.gaitW > 0.98) { f.p.x = gx; f.p.z = gz; f.lift = lift; f.planted = false; }
      else if (this.gaitW > 0.02) { f.p.x = lerp(f.p.x, gx, this.gaitW * 0.5); f.p.z = lerp(f.p.z, gz, this.gaitW * 0.5); f.lift = lift * this.gaitW; f.planted = false; }
      else {
        // standing: leave the foot where it is until it is out of place, then step it home
        if (!f.step) {
          const e = Math.hypot(f.p.x - hx, f.p.z - hz), other = this.feet[1 - i];
          if (e > 0.11 * H && !other.step) f.step = { t: 0, fx: f.p.x, fz: f.p.z };
          f.lift = damp(f.lift, 0, 30, dt);
        } else {
          f.step.t += dt / 0.17; const w = Math.min(1, f.step.t);
          f.p.x = lerp(f.step.fx, hx, sm(w)); f.p.z = lerp(f.step.fz, hz, sm(w)); f.lift = Math.sin(w * Math.PI) * 0.045 * H;
          if (w >= 1) f.step = null;
        }
      }
      f.lift = Math.max(f.lift, air * H * 0.9);
      f.p.y = 0;
    }
  }
}

// ---------- maths ----------
const _v1 = V(), _v2 = V(), _v3 = V(), _v4 = V(), _v5 = V(), _v6 = V(), _v7 = V(), _v8 = V(), _v9 = V();
const _pel = V(), _chest = V(), _shL = V(), _shR = V(), _hipL = V(), _hipR = V(), _dir = V(), _nrm = V();
const _tg = [V(), V()], _el = [V(), V()], _kn = [V(), V()], _an = [V(), V()], _wr = [V(), V()], _grip = V();
const _el2 = [V(), V()], _wr2 = [V(), V()], _keyHand = V(), _cyR = V(), _cyF = V(), _errV = V(), _axV = V(), _v6b = V(), _v6c = V(), _shC = V(), _rv1 = V(), _rv2 = V(), _rq = new THREE.Quaternion(), _rq2 = new THREE.Quaternion();
// tracked strokes in use. Serves filmed side-on come through well; a groundstroke filmed from one side loses the
// off arm (its depth across the court is a guess), so those wait for a second camera angle.
const CLIP_OK = { serve: true };
// how far up the handle the middle of the palm closes: the butt cap shows just below the little finger
// Racket directions read off a player's own footage where his style departs from the shared keys (right-hander's
// terms: x toward his hitting side, y up, z forward). Nadal takes the racket back low across his waist, head
// toward his other side, and lifts it only late, where Federer brings it up beside his shoulder at once.
const RACKET_OVR = {
  'Nadal/fh': [{ u: -0.70, dir: [0.82, 0.10, 0.56] }, { u: -0.54, dir: [0.30, 0.90, 0.31] }, { u: -0.40, dir: [-0.15, 0.95, -0.27] }],
  // (Djokovic had keys here too, for both wings, solved against his tracked arm while the tracker had the forehand's forearm
  // folded flat into the shoulder in the turn, and against the backhand clip he now plays least. Once the clip's arm was
  // made whole (bridgeFoldedArm in motion.js) the forehand's keys swung the racket round over his head to point back past
  // his other shoulder, and the backhand's lifted it, dropped it, lifted it again and dropped it in the last tenth of a
  // second. His own arms now carry the shared keys' racket as the footage has it: on the forehand up and back beside his
  // shoulder, head up, then dropped; on the backhand back low beside his left hip, head up and behind him.)
  // Nadal's backhand: racket back flat at his waist, head pointing behind him, until it drops into the swing
  'Nadal/bh': [{ u: -0.54, dir: [-0.81, 0.25, -0.54] }, { u: -0.37, dir: [-0.80, 0.09, -0.60] }, { u: -0.21, dir: [-0.72, -0.16, -0.67] }, { u: 0.00, dir: [-0.14, 0.53, -0.84] }],
};
const _ovCache = new Map();
// Where a real elbow sits for a given place of the hand. For every frame of every tracked stroke and every
// motion-capture clip, the hand's direction from the shoulder and its reach (in the chest's own frame), and the
// direction the elbow bends toward; the left arm mirrored onto the right. An arm placed by hand-made keys asks
// this table where its elbow should go, instead of following a fixed rule.
let POLES = null;
function buildPoles() {
  const rows = [], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = a => Math.hypot(a[0], a[1], a[2]), nrm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const take = get => {
    const ls = get('lsho'), rs = get('rsho'), nk = get('neck'), lh = get('lhip'), rh = get('rhip');
    const Rx = nrm(sub(rs, ls)), u0 = sub(nk, [(lh[0] + rh[0]) / 2, (lh[1] + rh[1]) / 2, (lh[2] + rh[2]) / 2]), d0 = dot(u0, Rx);
    const Uy = nrm([u0[0] - Rx[0] * d0, u0[1] - Rx[1] * d0, u0[2] - Rx[2] * d0]), Fz = cross(Rx, Uy);                  // clip axes: x right, y up, z forward
    for (const [sd, mx] of [['r', 1], ['l', -1]]) {
      const sh = get(sd + 'sho'), el = get(sd + 'elb'), wr = get(sd + 'wri'), d = sub(wr, sh), L = len(sub(el, sh)) + len(sub(wr, el)), dl = len(d);
      if (L < 0.2 || dl < 0.05) continue;
      const dn = [d[0] / dl, d[1] / dl, d[2] / dl], e = sub(el, sh), k = dot(e, dn), pv = [e[0] - dn[0] * k, e[1] - dn[1] * k, e[2] - dn[2] * k];
      if (len(pv) < 0.03 * L) continue;
      const pn = nrm(pv), loc = v => [dot(v, Rx) * mx, dot(v, Uy), dot(v, Fz)];
      rows.push([...loc(dn), Math.min(1, dl / L), ...loc(pn)]);
    }
  };
  for (const k in LOCO) { const c = LOCO[k]; for (const f of c.J) take(n => { const j = LOCO_JOINTS.indexOf(n) * 3; return [f[j], f[j + 1], f[j + 2]]; }); }
  for (const name in PLAYER_MOTION) for (const k in PLAYER_MOTION[name]) {
    const c = PLAYER_MOTION[name][k]; if (!c || c.ok !== true || !c.J || !c.J.pelvis) continue;
    const n = c.J.pelvis.length / 3, flip = c.hand === 'L';
    for (let f = 0; f < n; f++) take(nm => { let q = nm; if (flip && (nm[0] === 'l' || nm[0] === 'r') && nm !== 'lhip' && nm !== 'rhip' || (flip && (nm === 'lhip' || nm === 'rhip'))) q = (nm[0] === 'l' ? 'r' : 'l') + nm.slice(1); const a = c.J[q] || c.J[nm]; return [a[f * 3] * (flip ? -1 : 1), a[f * 3 + 1], a[f * 3 + 2]]; });
  }
  POLES = new Float32Array(rows.length * 7); rows.forEach((r, i) => POLES.set(r, i * 7));
  return POLES;
}
// the elbow's bend direction for a hand at local direction (x right of this arm's side, y up, z forward) and reach
function poleFor(dx, dy, dz, reach, out) {
  const T = POLES || buildPoles(), n = T.length / 7; const K = 8, bi = _kI.fill(-1), bs = _kS.fill(-9);
  for (let i = 0; i < n; i++) {
    const o = i * 7, sc = T[o] * dx + T[o + 1] * dy + T[o + 2] * dz - 0.8 * Math.abs(T[o + 3] - reach);
    if (sc <= bs[K - 1]) continue;
    let j = K - 1; while (j > 0 && bs[j - 1] < sc) { bs[j] = bs[j - 1]; bi[j] = bi[j - 1]; j--; } bs[j] = sc; bi[j] = i;
  }
  out[0] = out[1] = out[2] = 0;
  for (let j = 0; j < K; j++) { if (bi[j] < 0) break; const w = Math.exp((bs[j] - bs[0]) * 9), o = bi[j] * 7; out[0] += T[o + 4] * w; out[1] += T[o + 5] * w; out[2] += T[o + 6] * w; }
  return out;
}
const _pl = [0, 0, 0], _kI = new Int32Array(8), _kS = new Float32Array(8);
const _rpV = new THREE.Vector3();
// whose tracked swing a player borrows when he has none of his own that passes
// tracked clips that pass everywhere but around contact, and the window (s from contact) where the arms are hand-made instead
// (none at present: Nadal's backhand, the one that needed it, is now tracked whole from two cameras)
const PARTIAL = {};
// first clips that come out worse than the alternates tracked since (2026-11-14, share of two-hander frames with an arm
// more than 4 cm inside the trunk: Djokovic's 70% against 24-45% for his others, Nadal's 75% in the finish against 0%)
const MAIN_WEAK = new Set(['Djokovic/bh', 'Nadal/bh', 'Nadal/fh']);
// How high (up, as a part of the arm's direction) and how far forward at least a forehand's free arm points through the
// take-back, in the chest's frame. Djokovic's straightens out toward the ball at the height of his shoulder, mostly forward
// (his footage, from behind and from the side): his tracked arm, lost against his face, is across in front of the face and
// up, and held only to the shared limits the hand stayed in front of his eyes, which from the side is the hand over his face.
const POINT_CAP = { _: [0.36, 0.62], Djokovic: [0.14, 0.86] };
// a forehand's racket head kept up through the turn: [from u, to u, least height of the head as a part of its direction]
const HEAD_UP = { 'Djokovic/fh': [-0.86, -0.5, 0.6] };
// first clips that fail in the game though they passed on their frames, and are not played: McEnroe's backhand has its
// hitting hand down by the wrong hip in the take-back, so the free hand on the throat ends up behind his back and the arm
// is seen across it (the clip's own note has the racket back over his right shoulder; the tracker lost which side was which)
// Djokovic's forehand: from contact on, the tracker took his shoulders round the wrong way, through his back, while his hips
// opened toward the net, a twist of 150 degrees between them a twentieth of a second after the ball; from behind, his chest and
// face were seen turned to the camera through the finish (his two other passed forehands are played)
const MAIN_BAD = new Set(globalThis.__djFhOld ? ['McEnroe/bh'] : ['McEnroe/bh', 'Djokovic/fh']);
// alternative clips that passed their check against the footage but look wrong played in a match: Federer's knee-high forehand
// holds the racket straight up through the take-back and digs the ball out with the head dropped, and on court it read as a
// scoop slice rather than a forehand
// Finishes that end far from the ready position (Sampras's forehand with the racket up by his own shoulder, Agassi's with
// the hand back behind his hip) are let go of over longer: faded in the usual third of a second, the arm swung through the
// chest on its way back, twelve centimetres for Sampras and six for Agassi, and forty degrees in a frame.
const FINISH_FADE = { 'Sampras/fh': 2, 'Agassi/fh': 1.5, 'Laver/bh': 1.4, 'McEnroe/bh': 1.4 };
// Tracked clips held from a moment before their end: Agassi's forehand ends, as his windshield-wiper finishes do, with the hand
// above his right shoulder and then going on behind his head; held there and let go of, the hand came back to the front
// through his right side at fifteen centimetres a frame and the racket swung round past his hip ninety degrees in one.
// Held while the hand is still beside his ear, it comes down in front of the shoulder.
const CLIP_END = { 'Agassi/fh': 0.24 };
// (and, found by running every clip of every player through the lab: forehands whose arm goes through the body in the finish
// or at the ball, fifteen centimetres for Federer's second, thirteen for Alcaraz's high one, ten at contact for Djokovic's first)
// (and two backhands: Sinner's fourth, its free arm through the chest in the finish, and Djokovic's fifth, its top hand a
// tenth of a metre off the handle at the ball; each has others of the same kind of ball)
const ALT_BAD = new Set(['Federer/fh/0', 'Federer/fh/1', 'Alcaraz/fh/1', 'Djokovic/fh/0', 'Sinner/bh/3', 'Djokovic/bh/4']);
const DONORS = (key, lefty, oneHand) => key === 'serve' ? (lefty ? ['Nadal', 'Federer'] : ['Federer', 'Djokovic', 'Sinner', 'Alcaraz', 'Nadal'])
  : key === 'fh' ? (lefty ? ['Federer', 'Nadal'] : ['Federer', 'Djokovic', 'Sinner', 'Alcaraz', 'Nadal'])   /* (a left-hander with none of his own borrows Federer's classic forehand mirrored, not Nadal's lasso finish over the head, which is Nadal's alone) */
  : key === 'bh' ? (oneHand ? ['Federer'] : lefty ? ['Nadal', 'Djokovic', 'Sinner', 'Alcaraz', 'Agassi'] : ['Djokovic', 'Sinner', 'Alcaraz', 'Nadal', 'Agassi']) : [];
const GRIP_UP = 0.022, PALM_OFF = 0.024;      // and how far off the palm, into the fingers' curl, the handle's centre lies
// an arm's own thickness (about 8 cm across at the elbow): its centre line keeps this far off the trunk, or its skin goes into it
const LIMB_R = 0.042;
// which clip joints make each arm and each leg (left, right)
const LEG_RUN_J = [J.lknee, J.rknee, J.lankle, J.rankle, J.ltoe, J.rtoe];
const ARM_J = [[J.lsho, J.lelb, J.lwri], [J.rsho, J.relb, J.rwri]], LEG_J = [[J.lhip, J.lknee, J.lankle, J.ltoe], [J.rhip, J.rknee, J.rankle, J.rtoe]];
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion(), _q5 = new THREE.Quaternion(), _q6 = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _a = V(), _b = V(), _c = V(), _hu = V(), _hu2 = V(), _huq = new THREE.Quaternion();
const _pa = V(), _pb = V(), _pc = V();
const _sgR = V(), _sgU = V(), _sgF = V(), _sgA = V(), _sgB = V(), _sgA2 = V(), _sgB2 = V(), _sgC = V();
const _rgP = V(), _rgM = V(), _rg1 = V(), _rg2 = V(), _rg3 = V(), _rg4 = V(), _rgE = V(), _rgQ = new THREE.Quaternion(), _rgQ2 = new THREE.Quaternion(), _rgA = new THREE.Quaternion(), _rgB = new THREE.Quaternion();
const _rpA = V(), _rpB = V(), _rpC = V(), _rpD = V(), _rpQ = new THREE.Quaternion(), _inF = V(), _inT = V(), _acA = V(), _acB = V(), _acC = V(), _rlA = V(), _rlD = V(), _rlQ = V(), _rlP = V(), _rlB = V(), _rlC = V(), _rlE = V(), _rlR = new THREE.Quaternion(), _rlS = new THREE.Quaternion(), _hdD = V(), _hdT = V(), _hdJ = V(), _hdA = V(), _hdB = V(), _hdC = V(), _hdV = V(), _hdS = V(), _hdR = V(), _hdQ = V(), _hdW = V(), _hdP = V(), _hdU = V(), _hdN = V(), _hdO = V(), _hdQq = new THREE.Quaternion(), _hrA = V(), _hrB = V(), _hrC = V(), _sfT = [V(), V()], _kpH = V(), _kpF = V(), _kpO = V(), _kpK = V(), _lpK0 = V(), _lpK1 = V(), _lpP = V(), _lpM = V(), _lpN = V(), _lsA = V(), _lsB = V(), _lsC = V(), _lsD = V(), _lsE = V(), _lsF = V(), _lsG = V(), _lsH = V(), _stM = V(), _stA = V(), _stR = V(), _stX = V(), _stF = V(), _stQ = V(), _bcF = V(), _bcM = V(), _ptI = V(), _ptM = V(), _ptD = V(), _ptQ = new THREE.Quaternion(), _shF = V(), _qT1 = new THREE.Quaternion(), _qT2 = new THREE.Quaternion(), _hzK2 = V(), _hzQ = new THREE.Quaternion(), _hzD = V(), _hzE = V(), _hzN = V(), _hzM = V(), _hzK = V(), _qPt = new THREE.Quaternion(), _qPt2 = new THREE.Quaternion(), _qCarry = new THREE.Quaternion(), _wlR = V(), _gp0 = V(), _rc1 = V(), _rc2 = V(), _bx = V(), _br = V(), _bf = V(), _bh = V(), _bq = V(), _bq2 = V(), _bp0 = V(), _bp1 = V(), _be = V(), _bm = V(), _cq = V();
const _iq = new THREE.Quaternion(), _iq2 = new THREE.Quaternion();      // (into a stroke from where the arms were)   // (the arms kept out of the body)          // (the elbow's swing about the arm)
function damp(a, b, k, dt) { return a + (b - a) * (1 - Math.exp(-k * dt)); }
function dampAngle(a, b, k, dt) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * (1 - Math.exp(-k * dt)); }
// two-bone IK: the middle joint of a chain from `a` to `t`, bent toward `pole`
// soft: near full stretch the reach eases in (the last 2% of it approached exponentially, never quite reached), because
// there the elbow's offset from the line goes as the square root of what is left: a millimetre more reach would throw the
// elbow centimetres, and a nearly straight arm would flicker. A straight arm keeps about 166 degrees at the elbow and the
// hand falls short of its mark by under a centimetre.
function ik(a, t, l1, l2, pole, out, soft) {
  const d = _a.copy(t).sub(a); let L = d.length(); const mx = l1 + l2 - 1e-4, mn = Math.abs(l1 - l2) + 1e-4;
  if (soft) { const ds = mx * 0.98, w = mx - ds; if (L > ds) L = ds + w * (1 - Math.exp(-(L - ds) / w)); }
  L = clamp(L, mn, mx); d.normalize();
  const x = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const p = _b.copy(pole).addScaledVector(d, -pole.dot(d)); if (p.lengthSq() < 1e-8) p.set(0, 0, 1).addScaledVector(d, -d.z); p.normalize();
  return out.copy(a).addScaledVector(d, x).addScaledVector(p, h);
}
let _blob = null;
function blobTex() { if (_blob) return _blob; const c = canvas(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); _blob = tex(c, { clamp: true }); _blob.colorSpace = THREE.NoColorSpace; return _blob; }

const Z2 = [0, 0];
function blendPose(a, b, w) {
  const mixA = (x, y) => [lerp(x[0], y[0], w), lerp(x[1], y[1], w), lerp(x[2], y[2], w)];
  const mix2 = (x, y) => { x = x || Z2; y = y || Z2; return [lerp(x[0], y[0], w), lerp(x[1], y[1], w)]; };
  return { R: mixA(a.R, b.R), L: mixA(a.L, b.L), dir: mixA(a.dir, b.dir), nrm: mixA(a.nrm, b.nrm), twist: lerp(a.twist || 0, b.twist || 0, w), lean: lerp(a.lean || 0, b.lean || 0, w),
    shift: lerp(a.shift || 0, b.shift || 0, w), fshift: lerp(a.fshift || 0, b.fshift || 0, w), footR: mix2(a.footR, b.footR), footL: mix2(a.footL, b.footL), heelR: lerp(a.heelR || 0, b.heelR || 0, w), heelL: lerp(a.heelL || 0, b.heelL || 0, w), hipTurn: lerp(a.hipTurn == null ? 0.42 : a.hipTurn, b.hipTurn == null ? 0.42 : b.hipTurn, w), set: lerp(a.set || 0, b.set || 0, w), elbows: lerp(a.elbows || 0, b.elbows || 0, w), elbowFwd: lerp(a.elbowFwd || 0, b.elbowFwd || 0, w),
    crouch: lerp(a.crouch || 0, b.crouch || 0, w), stance: lerp(a.stance || 0.3, b.stance || 0.3, w), lgrip: lerp(a.lgrip || 0, b.lgrip || 0, w), lgripAt: lerp(a.lgripAt != null ? a.lgripAt : (a.lgrip || 0) * 0.6, b.lgripAt != null ? b.lgripAt : (b.lgrip || 0) * 0.6, w), head: lerp(a.head || 0, b.head || 0, w), sideLean: lerp(a.sideLean || 0, b.sideLean || 0, w) };
}

// ---------- reactions after a point ----------
// Poses in the strokes' terms (hitting hand R, free hand L, for a right-hander; mirrored for a left-hander).
const REACT = {
  // won
  fist:    { adur: 1.55, R: [0.26, 1.38, 0.22], L: [-0.22, 1.0, 0.18], dir: [0.3, 0.3, -0.9], nrm: [1, 0, 0], twist: 0.2, lean: 0.12, crouch: 0.06, stance: 0.24, lgrip: 0, head: 0.1, fist: 1, shout: 0.22 },
  vamos:   { adur: 1.35, R: [0.24, 1.00, 0.30], L: [-0.22, 0.98, 0.32], dir: [0.4, -0.2, 0.9], nrm: [1, 0, 0], twist: 0.1, lean: 0.36, crouch: 0.20, stance: 0.38, lgrip: 0, head: 0.2, fist: 1, shout: 0.32, in: 0.15, dur: 1.2 },
  free:    { adur: 1.55, R: [0.26, 0.92, 0.12], L: [-0.30, 1.42, 0.10], dir: [0.15, -0.9, 0.35], nrm: [1, 0, 0], twist: -0.45, lean: 0.10, crouch: 0.06, stance: 0.26, lgrip: 0, head: 0.12, fist: 1, shout: 0.26 },
  raise:   { adur: 1.75, R: [0.18, 1.86, 0.18], L: [-0.24, 1.00, 0.10], dir: [0.1, 0.95, 0.2], nrm: [1, 0, 0], twist: 0.1, lean: 0.04, crouch: 0.02, stance: 0.26, lgrip: 0, head: 0.3, shout: 0.18, dur: 1.3 },
  calm:    { adur: 1.25, fist: 0.8, R: [0.27, 0.86, 0.14], L: [-0.20, 0.92, 0.10], dir: [0.1, -0.6, 0.8], nrm: [1, 0, 0], twist: 0.05, lean: 0.08, crouch: 0.02, stance: 0.20, lgrip: 0, head: -0.12, dur: 1.2 },
  // lost
  down:    { adur: 1.8, R: [0.26, 0.74, 0.02], L: [-0.24, 0.80, 0.02], dir: [0.05, -0.8, 0.6], nrm: [1, 0, 0], twist: 0, lean: 0.2, crouch: 0.02, stance: 0.16, lgrip: 0, head: -0.55 },
  strings: { adur: 1.6, R: [0.12, 1.20, 0.30], L: [0.04, 1.58, 0.42], dir: [-0.1, 0.95, 0.3], nrm: [0, -0.3, -0.95], twist: 0.15, lean: 0.06, crouch: 0.02, stance: 0.20, lgrip: 0, head: 0.25, dur: 1.4 },
  hips:    { adur: 1.7, R: [0.21, 1.00, -0.02], L: [-0.21, 1.00, -0.02], dir: [0.2, -0.85, -0.45], nrm: [1, 0, 0], twist: 0, lean: 0.10, crouch: 0.0, stance: 0.24, lgrip: 0, head: -0.25, dur: 1.5 },
  hands:   { adur: 1.4, R: [0.10, 1.84, 0.02], L: [-0.10, 1.86, 0.04], dir: [0.15, 0.35, -0.92], nrm: [1, 0, 0], twist: 0, lean: -0.04, crouch: 0.0, stance: 0.22, lgrip: 0, head: 0.22, in: 0.2, dur: 1.1 },
  temple:  { adur: 1.4, fist: 0.9, point: 1, poleL: [0.55, -0.65, 0.5], R: [0.27, 0.92, 0.12], L: [-0.12, 1.68, 0.05], dir: [0.15, -0.70, 0.70], nrm: [1, 0, 0], twist: -0.1, lean: 0.06, crouch: 0.02, stance: 0.22, lgrip: 0, head: 0.15, in: 0.18 },
};
// how often each player shows each reaction (weights); anyone not listed is in between
const REACT_STYLE = {
  Nadal:   { win: { vamos: 4, fist: 2, free: 1 }, lose: { down: 2, hips: 1, strings: 1 }, often: 0.85 },
  Alcaraz: { win: { vamos: 2, free: 2, raise: 1, fist: 1 }, lose: { hands: 2, down: 1, strings: 1 }, often: 0.8 },
  Djokovic:{ win: { free: 3, raise: 1, fist: 2 }, lose: { hands: 2, strings: 1, hips: 1 }, often: 0.75 },
  Sinner:  { win: { calm: 3, free: 1 }, lose: { down: 2, strings: 1 }, often: 0.5 },
  Federer: { win: { calm: 3, free: 2, fist: 1 }, lose: { strings: 2, down: 1 }, often: 0.55 },
  Sampras: { win: { calm: 3, fist: 1 }, lose: { down: 3, hips: 1 }, often: 0.45 },
  Agassi:  { win: { fist: 2, calm: 2 }, lose: { hips: 2, down: 1, strings: 1 }, often: 0.6 },
  Lendl:   { win: { calm: 4 }, lose: { strings: 2, hips: 1 }, often: 0.35 },
  Borg:    { win: { calm: 1 }, lose: { calm: 1 }, often: 0.2 },
  McEnroe: { win: { fist: 2, free: 1 }, lose: { hands: 3, strings: 2, hips: 1 }, often: 0.85 },
  Connors: { win: { free: 4, fist: 2, vamos: 1 }, lose: { hips: 2, hands: 1, down: 1 }, often: 0.9 },
  Laver:   { win: { calm: 3 }, lose: { down: 1, strings: 1 }, often: 0.3 },
  // (the 2026-11 additions, from what each is known for: Murray's roar, Wawrinka's finger to his temple, Medvedev's deadpan,
  // Becker's fist, Hewitt's "C'mon!", Kyrgios and Monfils playing to the crowd, Edberg and Wilander barely a gesture)
  Murray:    { win: { fist: 3, vamos: 2, free: 1 }, lose: { down: 2, hands: 1, strings: 1 }, often: 0.85 },
  Wawrinka:  { win: { temple: 4, fist: 1, calm: 1 }, lose: { down: 2, strings: 1 }, often: 0.65 },
  Zverev:    { win: { fist: 2, free: 1, vamos: 1 }, lose: { hands: 1, down: 1, strings: 1 }, often: 0.7 },
  Thiem:     { win: { fist: 2, calm: 2 }, lose: { down: 2, strings: 1 }, often: 0.55 },
  Medvedev:  { win: { calm: 4 }, lose: { hands: 1, strings: 1, down: 1 }, often: 0.35 },
  Tsitsipas: { win: { fist: 2, free: 1, calm: 1 }, lose: { strings: 2, down: 1 }, often: 0.6 },
  'del Potro': { win: { raise: 2, free: 1, fist: 1 }, lose: { down: 2, hips: 1 }, often: 0.6 },
  Roddick:   { win: { fist: 3, vamos: 1 }, lose: { hands: 1, down: 1, hips: 1 }, often: 0.8 },
  Kyrgios:   { win: { free: 2, raise: 1, fist: 1 }, lose: { hands: 2, down: 1, hips: 1 }, often: 0.9 },
  Monfils:   { win: { raise: 2, free: 2, vamos: 1 }, lose: { hands: 1, down: 1 }, often: 0.85 },
  Becker:    { win: { fist: 3, vamos: 1 }, lose: { hips: 1, down: 1, strings: 1 }, often: 0.75 },
  Edberg:    { win: { calm: 4 }, lose: { down: 1, strings: 1 }, often: 0.3 },
  Ivanisevic: { win: { free: 2, raise: 1, fist: 1 }, lose: { hands: 2, hips: 1, down: 1 }, often: 0.85 },
  Wilander:  { win: { calm: 3 }, lose: { down: 1, strings: 1 }, often: 0.3 },
  Kuerten:   { win: { raise: 2, calm: 1, free: 1 }, lose: { down: 1, strings: 1 }, often: 0.55 },
  Hewitt:    { win: { fist: 4, vamos: 2 }, lose: { hips: 1, down: 1 }, often: 0.9 },
};
function pickReaction(fig, p, m) {
  if (Math.abs(p.mood) <= 0.6) return null;
  const st = REACT_STYLE[fig.look.name] || { win: { fist: 1, calm: 1 }, lose: { down: 1, strings: 1 }, often: 0.6 };
  const lp = m.lastPoint || {}, big = (lp.val || 0) >= 1 || lp.bp, chance = Math.min(1, st.often * (big ? 1.6 : 1));
  if (Math.random() > chance) return null;
  let w = { ...(p.mood > 0 ? st.win : st.lose) };
  if (p.mood > 0 && !big) { delete w.raise; if (w.vamos) w.vamos *= 0.5; }          // the big ones are kept for big points
  if (p.mood < 0 && !big) delete w.hands;
  if (fig.lastReact && w[fig.lastReact] && Object.keys(w).length > 1) delete w[fig.lastReact];
  let sum = 0; for (const k in w) sum += w[k]; let r = Math.random() * sum;
  for (const k in w) { r -= w[k]; if (r <= 0) { fig.lastReact = k; return k; } }
  return null;
}

// ---------- stroke library ----------
// Each key: time relative to contact, hitting hand R and off hand L as [x right, y up,
// f forward] in metres for a 1.85 m right-hander, racket direction and string-face normal,
// chest twist in radians (+ toward the racket side), forward lean, crouch.
// Between keys the pose follows one smooth curve through all of them (a cubic with the speed it has at each key taken
// from its neighbours), so a swing does not stop dead at every key and set off again, as easing key to key made it do.
// The racket face turns about the handle, as a forearm turns it, however far it turns. A key marked `fill` gives only its
// time and racket direction (a point on the racket's arc that a straight blend would cut across); the rest of it is taken
// from the keys either side.
const POSE_F = ['R', 'L', 'dir', 'nrm', 'footR', 'footL'], POSE_S = ['twist', 'lean', 'shift', 'fshift', 'heelR', 'heelL', 'hipTurn', 'set', 'elbows', 'elbowFwd', 'crouch', 'stance', 'lgrip', 'lgripAt', 'head', 'sideLean'];
const flatPose = q => { const v = []; for (const k of POSE_F) v.push(...q[k]); for (const k of POSE_S) v.push(q[k]); return v; };
function unflatPose(v) { const q = {}; let i = 0; for (const k of POSE_F) { const n = k === 'footR' || k === 'footL' ? 2 : 3; q[k] = v.slice(i, i + n); i += n; } for (const k of POSE_S) q[k] = v[i++]; return q; }
const NRM_I = 9;                                            // where nrm sits in the flat pose
function track(keys, o = {}) {
  // fill-in keys: everything but their racket direction from the full keys either side
  for (let i = 0; i < keys.length; i++) { const k = keys[i]; if (!k.fill) continue; let a = i - 1, b = i + 1; while (keys[a].fill) a--; while (keys[b].fill) b++;
    keys[i] = { ...blendPose(keys[a], keys[b], (k.u - keys[a].u) / (keys[b].u - keys[a].u)), ...k, fill: false }; }
  const span = [keys[0].u, keys[keys.length - 1].u], n = keys.length;
  const V = keys.map(k => flatPose(blendPose(k, k, 0))), N = V[0].length;
  // the speed at each key: from the keys either side (one-sided at the ends)
  const M = V.map((v, i) => { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), du = keys[b].u - keys[a].u; return v.map((_, c) => du > 0 ? (V[b][c] - V[a][c]) / du : 0); });
  const at = (u, fig, side) => {
    u = clamp(u, span[0], span[1]);
    let i = 0; while (i < n - 2 && u > keys[i + 1].u) i++;
    const h = keys[i + 1].u - keys[i].u, t = h > 0 ? (u - keys[i].u) / h : 0, t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2, A = V[i], B = V[i + 1], MA = M[i], MB = M[i + 1], out = new Array(N);
    for (let c = 0; c < N; c++) out[c] = h00 * A[c] + h10 * h * MA[c] + h01 * B[c] + h11 * h * MB[c];
    const p = unflatPose(out);
    p.lgrip = clamp(p.lgrip, 0, 1); p.heelR = Math.max(0, p.heelR); p.heelL = Math.max(0, p.heelL); p.set = Math.max(0, p.set);
    // the face: the two keys' faces laid across the racket as it now points, and turned from one to the other about it
    const d = p.dir, dl = Math.hypot(d[0], d[1], d[2]) || 1, dx = d[0] / dl, dy = d[1] / dl, dz = d[2] / dl;
    const proj = (q) => { const k = q[NRM_I] * dx + q[NRM_I + 1] * dy + q[NRM_I + 2] * dz; const x = q[NRM_I] - k * dx, y = q[NRM_I + 1] - k * dy, z = q[NRM_I + 2] - k * dz, l = Math.hypot(x, y, z); return l > 1e-5 ? [x / l, y / l, z / l] : null; };
    const na = proj(A), nb = proj(B);
    if (na && nb) { const cx = na[1] * nb[2] - na[2] * nb[1], cy = na[2] * nb[0] - na[0] * nb[2], cz = na[0] * nb[1] - na[1] * nb[0];
      const ang = Math.atan2(cx * dx + cy * dy + cz * dz, na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2]) * (t * t * (3 - 2 * t));
      const c = Math.cos(ang), sn = Math.sin(ang), kd = (dx * na[0] + dy * na[1] + dz * na[2]) * (1 - c);              // Rodrigues about the racket
      p.nrm = [na[0] * c + (dy * na[2] - dz * na[1]) * sn + dx * kd, na[1] * c + (dz * na[0] - dx * na[2]) * sn + dy * kd, na[2] * c + (dx * na[1] - dy * na[0]) * sn + dz * kd]; }
    void fig; void side;
    return p;
  };
  return { keys, span, at, hold: o.hold == null ? -0.36 : o.hold };
}
// Forehand, off a semi-open stance. He turns with both hands on the racket, the off arm stretches
// across as the racket goes up, the weight sinks onto the outside leg; the hips open ahead of
// the shoulders, the racket drops below the ball and comes through with the arm long, contact
// well out in front; the hitting side comes round and the racket finishes over the far shoulder.
const FOREHAND_A = track([
  { u: -0.92, R: [0.04, 0.98, 0.31], L: [0.04, 1.03, 0.43], dir: [0.0, 0.50, 0.87], nrm: [1.0, 0.0, 0.0], twist: 0, lean: 0.34, crouch: 0.19, stance: 0.36, lgrip: 0.5, lgripAt: 0.092, elbows: -0.40, elbowFwd: 0.95 },
  { u: -0.56, R: [0.36, 1.12, 0.12], L: [0.27, 1.18, 0.22], dir: [0.10, 0.96, 0.25], nrm: [0.9, 0, 0.44], twist: 0.9, lean: 0.30, crouch: 0.20, stance: 0.40, lgrip: 0.42, shift: 0.05, footR: [0.06, -0.06], hipTurn: 0.5 },
  { u: -0.36, R: [0.50, 1.22, -0.10], L: [0.62, 1.30, 0.18], dir: [0.25, 0.92, -0.30], nrm: [0.95, -0.1, 0.3], twist: 1.35, lean: 0.26, crouch: 0.23, stance: 0.42, lgrip: 0, shift: 0.10, footR: [0.10, -0.10], hipTurn: 0.5 },
  { u: -0.20, R: [0.54, 0.98, -0.30], L: [0.60, 1.28, 0.22], dir: [0.45, 0.30, -0.84], nrm: [0.6, -0.6, 0.5], twist: 1.45, lean: 0.24, crouch: 0.28, stance: 0.44, lgrip: 0, shift: 0.12, footR: [0.10, -0.10], hipTurn: 0.55 },
  { u: -0.09, R: [0.50, 0.78, -0.18], L: [0.30, 1.16, 0.30], dir: [0.50, -0.40, -0.77], nrm: [0.2, -0.75, 0.6], twist: 0.95, lean: 0.24, crouch: 0.28, stance: 0.44, lgrip: 0, shift: 0.10, footR: [0.10, -0.10], hipTurn: 0.25 },
  { u: 0.00, R: [0.50, 0.98, 0.38], L: [-0.18, 1.02, 0.20], dir: [0.80, 0.16, 0.30], nrm: [-0.25, 0.08, 0.96], twist: -0.05, lean: 0.20, crouch: 0.15, stance: 0.44, lgrip: 0, shift: 0.02, footR: [0.10, -0.08], heelR: 0.04, hipTurn: 1 },
  { u: 0.09, R: [0.28, 1.26, 0.60], L: [-0.26, 0.98, 0.14], dir: [-0.86, 0.38, 0.34], nrm: [-0.30, -0.40, -0.86], twist: -0.55, lean: 0.18, crouch: 0.10, stance: 0.44, lgrip: 0, shift: -0.04, footR: [0.04, 0.02], heelR: 0.09, hipTurn: 0.8 },
  { u: 0.22, R: [-0.16, 1.34, 0.30], L: [-0.28, 0.98, 0.12], dir: [-0.40, 0.42, -0.81], nrm: [-0.6, 0.2, 0.75], twist: -1.10, lean: 0.18, crouch: 0.10, stance: 0.42, lgrip: 0, shift: -0.08, footR: [-0.04, 0.14], heelR: 0.12, hipTurn: 0.7 },
  { u: 0.42, R: [-0.28, 1.20, 0.18], L: [-0.26, 1.00, 0.16], dir: [-0.38, -0.15, -0.91], nrm: [-0.7, 0, 0.7], twist: -1.05, lean: 0.20, crouch: 0.13, stance: 0.40, lgrip: 0.2, shift: -0.06, footR: [-0.02, 0.12], heelR: 0.08, hipTurn: 0.6 },
  // back to ready the racket comes down and round in front of him at the waist, not up past his face
  // (and round at an even pace: blended straight from pointing back over his shoulder to pointing forward, it turned
  // through the middle of that at twenty degrees a frame, thirty with the body turning, in every recovery)
  { u: 0.52, fill: true, dir: [-0.99, -0.11, -0.09] },
  { u: 0.62, R: [-0.12, 1.00, 0.26], L: [-0.16, 1.02, 0.30], dir: [-0.55, 0.05, 0.83], nrm: [0.83, 0, 0.55], twist: -0.45, lean: 0.26, crouch: 0.16, stance: 0.38, lgrip: 0.35, lgripAt: 0.115, shift: -0.02, hipTurn: 0.5 },
  { u: 0.80, R: [0.04, 0.98, 0.31], L: [0.04, 1.03, 0.43], dir: [0.0, 0.50, 0.87], nrm: [1.0, 0.0, 0.0], twist: 0, lean: 0.34, crouch: 0.19, stance: 0.36, lgrip: 0.5, lgripAt: 0.092, elbows: -0.40, elbowFwd: 0.95 },
]);
// One-handed backhand: the turn is made with both hands, the front foot steps across, the
// shoulders stay side-on through the hit while the arm swings out straight and the off arm
// goes back to hold the body closed; the finish is high.
const BACKHAND_1H_A = track([
  { u: -0.92, R: [0.04, 0.98, 0.31], L: [0.04, 1.03, 0.43], dir: [0.0, 0.50, 0.87], nrm: [1.0, 0.0, 0.0], twist: 0, lean: 0.34, crouch: 0.19, stance: 0.36, lgrip: 0.5, lgripAt: 0.092, elbows: -0.40, elbowFwd: 0.95 },
  { u: -0.56, R: [-0.20, 1.10, 0.14], L: [-0.26, 1.14, 0.10], dir: [-0.18, 0.80, -0.57], nrm: [-0.9, 0, 0.44], twist: -1.0, lean: 0.28, crouch: 0.20, stance: 0.40, lgrip: 0.5, shift: -0.04, footL: [-0.04, -0.05], hipTurn: 0.5 },
  { u: -0.36, R: [-0.36, 1.12, -0.06], L: [-0.40, 1.16, -0.12], dir: [-0.22, 0.58, -0.78], nrm: [-0.9, -0.1, 0.4], twist: -1.55, lean: 0.24, crouch: 0.22, stance: 0.40, lgrip: 0.5, shift: -0.06, footR: [-0.22, 0.16], footL: [-0.04, -0.06], hipTurn: 0.55 },
  { u: -0.14, R: [-0.42, 0.86, -0.16], L: [-0.40, 0.98, -0.24], dir: [-0.42, -0.30, -0.86], nrm: [-0.6, -0.6, 0.5], twist: -1.60, lean: 0.26, crouch: 0.27, stance: 0.40, lgrip: 0.4, shift: -0.02, fshift: 0.06, footR: [-0.26, 0.24], footL: [-0.04, -0.06], hipTurn: 0.5 },
  { u: 0.00, R: [-0.22, 0.94, 0.50], L: [-0.30, 0.92, -0.30], dir: [-0.84, 0.14, 0.30], nrm: [0.25, 0.05, 0.97], twist: -1.05, lean: 0.24, crouch: 0.20, stance: 0.40, lgrip: 0, shift: 0.02, fshift: 0.12, footR: [-0.26, 0.26], footL: [-0.04, -0.06], heelL: 0.05, hipTurn: 0.55 },
  { u: 0.14, R: [0.12, 1.36, 0.50], L: [-0.34, 0.78, -0.40], dir: [0.70, 0.55, 0.45], nrm: [0.55, -0.60, 0.58], twist: -0.75, lean: 0.20, crouch: 0.12, stance: 0.40, lgrip: 0, shift: 0.02, fshift: 0.14, footR: [-0.26, 0.26], footL: [-0.04, -0.06], heelL: 0.09, hipTurn: 0.5 },
  { u: 0.32, R: [0.34, 1.58, 0.22], L: [-0.34, 0.72, -0.42], dir: [0.75, 0.45, -0.48], nrm: [0.5, -0.8, 0.3], twist: -0.45, lean: 0.16, crouch: 0.08, stance: 0.40, lgrip: 0, fshift: 0.12, footR: [-0.24, 0.26], footL: [-0.02, -0.02], heelL: 0.10, hipTurn: 0.5 },
  { u: 0.55, R: [0.30, 1.30, 0.22], L: [-0.24, 0.88, 0.02], dir: [0.30, 0.85, -0.42], nrm: [0.8, 0, 0.6], twist: -0.2, lean: 0.24, crouch: 0.14, stance: 0.40, lgrip: 0, fshift: 0.06, footR: [-0.10, 0.12] },
  // (round at an even pace, as on the forehand)
  { u: 0.625, fill: true, dir: [0.58, 0.76, 0.30] },
  { u: 0.70, R: [0.16, 1.04, 0.28], L: [0.02, 1.04, 0.30], dir: [0.50, 0.20, 0.84], nrm: [0.86, 0, -0.51], twist: -0.05, lean: 0.28, crouch: 0.16, stance: 0.38, lgrip: 0.3, lgripAt: 0.115, fshift: 0.03 },
  { u: 0.85, R: [0.04, 0.98, 0.31], L: [0.04, 1.03, 0.43], dir: [0.0, 0.50, 0.87], nrm: [1.0, 0.0, 0.0], twist: 0, lean: 0.34, crouch: 0.19, stance: 0.36, lgrip: 0.5, lgripAt: 0.092, elbows: -0.40, elbowFwd: 0.95 },
]);
// Two-handed backhand: the off hand stays on the grip and drives through; the hips and
// shoulders open far more than on the one-hander, and the finish wraps over the hitting shoulder.
const BACKHAND_2H_A = track([
  { u: -0.92, R: [0.04, 0.98, 0.31], L: [0.04, 1.03, 0.43], dir: [0.0, 0.50, 0.87], nrm: [1.0, 0.0, 0.0], twist: 0, lean: 0.34, crouch: 0.19, stance: 0.36, lgrip: 0.5, lgripAt: 0.092, elbows: -0.40, elbowFwd: 0.95 },
  // (the hands carried round in front of the chest as the shoulders turn: twelve centimetres out from it, the arm across it was inside it)
  { u: -0.56, R: [-0.18, 1.06, 0.26], L: [-0.24, 1.10, 0.24], dir: [-0.28, 0.88, -0.38], nrm: [-0.9, 0, 0.44], twist: -0.9, lean: 0.28, crouch: 0.20, stance: 0.42, lgrip: 0.45, lgripAt: 0.105, shift: -0.04, hipTurn: 0.5 },
  { u: -0.36, R: [-0.30, 1.02, 0.00], L: [-0.36, 1.06, -0.04], dir: [-0.30, 0.78, -0.55], nrm: [-0.9, -0.1, 0.4], twist: -1.35, lean: 0.24, crouch: 0.22, stance: 0.44, lgrip: 0.45, lgripAt: 0.105, shift: -0.08, footR: [-0.16, 0.14], hipTurn: 0.55 },
  { u: -0.13, R: [-0.34, 0.80, -0.12], L: [-0.40, 0.84, -0.18], dir: [-0.45, -0.30, -0.84], nrm: [-0.6, -0.6, 0.5], twist: -1.40, lean: 0.26, crouch: 0.28, stance: 0.46, lgrip: 0.45, lgripAt: 0.105, shift: -0.06, fshift: 0.04, footR: [-0.20, 0.20], hipTurn: 0.4 },
  { u: 0.00, R: [-0.22, 0.94, 0.40], L: [-0.32, 0.96, 0.40], dir: [-0.90, 0.06, 0.20], nrm: [0.2, 0.05, 0.98], twist: -0.50, lean: 0.24, crouch: 0.18, stance: 0.46, lgrip: 0.45, lgripAt: 0.105, shift: 0, fshift: 0.10, footR: [-0.20, 0.22], heelL: 0.04, hipTurn: 0.9 },
  { u: 0.13, R: [0.06, 1.22, 0.46], L: [-0.02, 1.26, 0.48], dir: [-0.30, 0.86, 0.42], nrm: [0.85, 0.1, 0.5], twist: 0.25, lean: 0.20, crouch: 0.12, stance: 0.46, lgrip: 0.45, lgripAt: 0.105, shift: 0.04, fshift: 0.12, footR: [-0.20, 0.22], heelL: 0.10, hipTurn: 0.8 },
  { u: 0.30, R: [0.24, 1.44, 0.14], L: [0.20, 1.50, 0.12], dir: [0.45, 0.55, -0.70], nrm: [0.8, -0.2, 0.55], twist: 0.80, lean: 0.18, crouch: 0.10, stance: 0.44, lgrip: 0.45, lgripAt: 0.105, shift: 0.06, fshift: 0.10, footR: [-0.18, 0.20], footL: [0.06, 0.10], heelL: 0.12, hipTurn: 0.7 },
  { u: 0.52, R: [0.22, 1.26, 0.18], L: [0.14, 1.28, 0.20], dir: [0.20, 0.70, -0.3], nrm: [0.8, 0, 0.6], twist: 0.5, lean: 0.24, crouch: 0.14, stance: 0.40, lgrip: 0.45, lgripAt: 0.105, fshift: 0.04, footR: [-0.08, 0.10], heelL: 0.05 },
  // (round at an even pace, as on the forehand)
  { u: 0.6, fill: true, dir: [0.60, 0.68, 0.42] },
  { u: 0.68, R: [0.14, 1.04, 0.26], L: [0.10, 1.06, 0.30], dir: [0.55, 0.15, 0.82], nrm: [0.82, 0, -0.55], twist: 0.25, lean: 0.28, crouch: 0.16, stance: 0.38, lgrip: 0.45, lgripAt: 0.105, fshift: 0.02 },
  { u: 0.85, R: [0.04, 0.98, 0.31], L: [0.04, 1.03, 0.43], dir: [0.0, 0.50, 0.87], nrm: [1.0, 0.0, 0.0], twist: 0, lean: 0.34, crouch: 0.19, stance: 0.36, lgrip: 0.5, lgripAt: 0.092, elbows: -0.40, elbowFwd: 0.95 },
]);
// Backhand slice: racket set high behind the head, cut down and through, finish long and low.
const BH_SLICE = track([
  { u: -0.92, R: [0.04, 0.98, 0.31], L: [0.04, 1.03, 0.43], dir: [0.0, 0.50, 0.87], nrm: [1.0, 0.0, 0.0], twist: 0, lean: 0.34, crouch: 0.19, stance: 0.36, lgrip: 0.5, lgripAt: 0.092, elbows: -0.40, elbowFwd: 0.95 },
  // the turn: both hands take the racket up beside the far shoulder, hips and shoulders go side-on
  { u: -0.56, R: [-0.28, 1.16, 0.22], L: [-0.32, 1.22, 0.16], dir: [-0.15, 0.92, -0.35], nrm: [-0.85, 0.2, 0.5], twist: -1.0, lean: 0.26, crouch: 0.18, stance: 0.42, lgrip: 0.5, shift: -0.04, hipTurn: 0.45 },
  // set: hands at the far shoulder, racket head up and back, face a little open; the front foot steps across
  // (the hands in front of that shoulder, out along the turned chest: at it, the free hand on the racket's throat was on its own
  // shoulder joint, and its arm, folded shut, was swung over the top of the shoulder as the racket went back; and not behind the
  // middle of the body, which is behind that shoulder until the chest has turned: in a slice begun late, a third of a second
  // before contact, the hand on the throat went from in front of him through the shoulder joint to behind it in a few frames)
  { u: -0.36, R: [-0.42, 1.28, 0.03], L: [-0.48, 1.34, -0.03], dir: [-0.15, 0.90, -0.40], nrm: [-0.6, 0.35, 0.7], twist: -1.55, lean: 0.22, crouch: 0.18, stance: 0.44, lgrip: 0.45, shift: -0.06, footR: [-0.20, 0.18], hipTurn: 0.6 },
  // the cut: the hitting hand leads down and forward, the off hand lets go and goes back
  { u: -0.12, R: [-0.36, 1.18, 0.02], L: [-0.32, 1.22, -0.26], dir: [-0.55, 0.55, -0.62], nrm: [-0.3, 0.55, 0.78], twist: -1.40, lean: 0.24, crouch: 0.22, stance: 0.46, lgrip: 0, fshift: 0.04, footR: [-0.22, 0.22], hipTurn: 0.55 },
  { u: 0.00, R: [-0.32, 0.92, 0.44], L: [-0.24, 1.05, -0.30], dir: [-0.86, 0.02, 0.30], nrm: [0.2, 0.45, 0.87], twist: -1.15, lean: 0.26, crouch: 0.24, stance: 0.48, lgrip: 0, fshift: 0.08, footR: [-0.22, 0.24], hipTurn: 0.5 },
  // (on out toward the target and up, the arm long, to finish in front at the chest: finished at the waist, held by the hip,
  // from behind the racket arm was a hand on the hip)
  { u: 0.16, R: [-0.02, 0.84, 0.68], L: [-0.26, 0.92, -0.36], dir: [-0.40, 0.1, 0.9], nrm: [0.4, 0.85, 0.3], twist: -0.95, lean: 0.28, crouch: 0.24, stance: 0.48, lgrip: 0, fshift: 0.10, footR: [-0.22, 0.24], hipTurn: 0.45 },
  { u: 0.36, R: [0.24, 1.06, 0.58], L: [-0.26, 0.86, -0.3], dir: [0.3, 0.4, 0.85], nrm: [0.5, 0.8, 0.3], twist: -0.6, lean: 0.24, crouch: 0.18, stance: 0.44, lgrip: 0, fshift: 0.06, footR: [-0.18, 0.20], hipTurn: 0.4 },
  // (the free hand comes forward round the outside of the hip to the racket, and takes it only then: straight from behind him
  // to the grip, it passed across the small of his back, the elbow out, and from behind both hands were on his hips)
  { u: 0.58, R: [0.12, 0.93, 0.44], L: [-0.30, 0.95, 0.14], dir: [0.14, 0.46, 0.86], nrm: [0.78, 0.36, 0.14], twist: -0.27, lean: 0.29, crouch: 0.19, stance: 0.40, lgrip: 0, fshift: 0.03, footR: [-0.08, 0.09], hipTurn: 0.2 },
  { u: 0.80, R: [0.04, 0.98, 0.31], L: [0.04, 1.03, 0.43], dir: [0.0, 0.50, 0.87], nrm: [1.0, 0.0, 0.0], twist: 0, lean: 0.34, crouch: 0.19, stance: 0.36, lgrip: 0.5, lgripAt: 0.092, elbows: -0.40, elbowFwd: 0.95 },
]);
const FH_SLICE = track([
  { u: -0.60, R: [0.04, 0.98, 0.31], L: [0.04, 1.03, 0.43], dir: [0.0, 0.50, 0.87], nrm: [1.0, 0.0, 0.0], twist: 0, lean: 0.34, crouch: 0.19, stance: 0.36, lgrip: 0.5, lgripAt: 0.092, elbows: -0.40, elbowFwd: 0.95 },
  { u: -0.26, R: [0.44, 1.30, -0.04], L: [0.1, 1.15, 0.3], dir: [0.3, 0.9, -0.3], nrm: [0.5, 0.3, 0.8], twist: 1.1, lean: 0.24, crouch: 0.18, stance: 0.42, lgrip: 0, shift: 0.05, footL: [0.16, 0.14], hipTurn: 0.5 },
  // (the free arm out to its own side for balance, not across the chest: there, at the ball, its forearm went through the ribs)
  { u: 0.00, R: [0.46, 0.92, 0.40], L: [-0.36, 1.06, 0.22], dir: [0.86, 0.04, 0.3], nrm: [-0.2, 0.45, 0.87], twist: 0.35, lean: 0.26, crouch: 0.22, stance: 0.46, lgrip: 0, fshift: 0.06, footL: [0.16, 0.18], hipTurn: 0.5 },
  { u: 0.22, R: [0.12, 0.78, 0.62], L: [-0.38, 1.0, 0.10], dir: [0.3, 0.2, 0.93], nrm: [-0.4, 0.85, 0.3], twist: -0.3, lean: 0.26, crouch: 0.2, stance: 0.44, lgrip: 0 },
  { u: 0.70, R: [0.04, 0.98, 0.31], L: [0.04, 1.03, 0.43], dir: [0.0, 0.50, 0.87], nrm: [1.0, 0.0, 0.0], twist: 0, lean: 0.34, crouch: 0.19, stance: 0.36, lgrip: 0.5, lgripAt: 0.092, elbows: -0.40, elbowFwd: 0.95 },
], { hold: -0.26 });
// Lobs and drop shots begin as the drive does (a player hides them so: the same turn and take-back, which come from his own
// tracked drive, see ownClip), and only the swing at the ball is their own.
// Lob: the racket drops lower under the ball than for a drive, the face opens (about forty degrees at contact) and the
// swing goes up rather than across, the finish high over his head instead of wrapped over the far shoulder.
// The reactions played out, not held still: each a short run of keys from the moment it begins (seconds), the hand pumped twice,
// the vamos pulled down into the crouch and again, the fist up to the crowd shaken, the strings fiddled with. (Held as one pose
// blended in and out, every one of them was a statue that slid into place: the fist a racket held up by the face, the free fist
// laid on the far shoulder, the hands on the head brought down across the chest.) Racket hand R, free hand L, for a right-hander.
const HANG = { R: [0.27, 0.92, 0.12], dir: [0.15, -0.70, 0.70], nrm: [1, 0, 0] };
const REACT_ANIM = {
  fist: track([
    { u: 0.00, ...HANG, L: [-0.22, 1.18, 0.32], twist: 0.1, lean: 0.10, crouch: 0.05, stance: 0.26, lgrip: 0, head: 0.05 },
    { u: 0.16, ...HANG, L: [-0.24, 1.40, 0.34], twist: 0.12, lean: 0.08, crouch: 0.05, stance: 0.26, lgrip: 0, head: 0.12 },
    { u: 0.30, ...HANG, L: [-0.26, 1.10, 0.18], twist: 0.18, lean: 0.18, crouch: 0.10, stance: 0.27, lgrip: 0, head: 0.22 },
    { u: 0.46, ...HANG, L: [-0.24, 1.36, 0.33], twist: 0.12, lean: 0.12, crouch: 0.07, stance: 0.27, lgrip: 0, head: 0.15 },
    { u: 0.62, ...HANG, L: [-0.26, 1.08, 0.17], twist: 0.18, lean: 0.18, crouch: 0.10, stance: 0.27, lgrip: 0, head: 0.22 },
    { u: 0.95, ...HANG, L: [-0.24, 1.16, 0.24], twist: 0.12, lean: 0.12, crouch: 0.06, stance: 0.26, lgrip: 0, head: 0.10 },
    { u: 1.40, ...HANG, L: [-0.22, 0.95, 0.14], twist: 0.05, lean: 0.08, crouch: 0.03, stance: 0.24, lgrip: 0, head: 0.00 },
  ]),
  vamos: track([
    { u: 0.00, R: [0.24, 1.10, 0.34], L: [-0.22, 1.12, 0.34], dir: [0.35, 0.20, 0.90], nrm: [1, 0, 0], twist: 0.1, lean: 0.28, crouch: 0.12, stance: 0.36, lgrip: 0, head: 0.15 },
    { u: 0.14, R: [0.26, 0.96, 0.16], L: [-0.25, 0.95, 0.14], dir: [0.40, -0.30, 0.85], nrm: [1, 0, 0], twist: 0.12, lean: 0.42, crouch: 0.24, stance: 0.40, lgrip: 0, head: 0.30 },
    { u: 0.32, R: [0.25, 1.06, 0.28], L: [-0.23, 1.08, 0.28], dir: [0.38, 0.05, 0.90], nrm: [1, 0, 0], twist: 0.1, lean: 0.34, crouch: 0.18, stance: 0.40, lgrip: 0, head: 0.22 },
    { u: 0.48, R: [0.26, 0.94, 0.14], L: [-0.26, 0.92, 0.12], dir: [0.40, -0.35, 0.84], nrm: [1, 0, 0], twist: 0.14, lean: 0.44, crouch: 0.26, stance: 0.40, lgrip: 0, head: 0.32 },
    { u: 0.85, R: [0.26, 0.98, 0.18], L: [-0.25, 0.98, 0.18], dir: [0.35, -0.30, 0.88], nrm: [1, 0, 0], twist: 0.1, lean: 0.36, crouch: 0.20, stance: 0.38, lgrip: 0, head: 0.20 },
    { u: 1.20, ...HANG, L: [-0.22, 0.96, 0.14], twist: 0.05, lean: 0.16, crouch: 0.08, stance: 0.30, lgrip: 0, head: 0.05 },
  ]),
  free: track([
    { u: 0.00, ...HANG, L: [-0.26, 1.30, 0.30], twist: -0.25, lean: 0.08, crouch: 0.04, stance: 0.26, lgrip: 0, head: 0.10 },
    { u: 0.22, ...HANG, L: [-0.30, 1.80, 0.18], twist: -0.35, lean: 0.04, crouch: 0.02, stance: 0.26, lgrip: 0, head: 0.25 },
    { u: 0.40, ...HANG, L: [-0.30, 1.72, 0.22], twist: -0.35, lean: 0.05, crouch: 0.03, stance: 0.26, lgrip: 0, head: 0.22 },
    { u: 0.58, ...HANG, L: [-0.30, 1.82, 0.16], twist: -0.35, lean: 0.04, crouch: 0.02, stance: 0.26, lgrip: 0, head: 0.26 },
    { u: 0.76, ...HANG, L: [-0.30, 1.74, 0.22], twist: -0.35, lean: 0.05, crouch: 0.03, stance: 0.26, lgrip: 0, head: 0.22 },
    { u: 1.10, ...HANG, L: [-0.28, 1.48, 0.28], twist: -0.2, lean: 0.08, crouch: 0.03, stance: 0.26, lgrip: 0, head: 0.10 },
    { u: 1.40, ...HANG, L: [-0.22, 1.00, 0.18], twist: 0, lean: 0.08, crouch: 0.02, stance: 0.24, lgrip: 0, head: 0.00 },
  ]),
  raise: track([
    { u: 0.00, R: [0.24, 1.40, 0.32], L: [-0.22, 0.98, 0.14], dir: [0.20, 0.90, 0.30], nrm: [1, 0, 0], twist: 0.1, lean: 0.06, crouch: 0.03, stance: 0.26, lgrip: 0, head: 0.15 },
    { u: 0.30, R: [0.20, 1.98, 0.16], L: [-0.22, 0.98, 0.14], dir: [0.05, 0.98, 0.15], nrm: [1, 0, 0], twist: 0.1, lean: 0.04, crouch: 0.02, stance: 0.26, lgrip: 0, head: 0.30 },
    { u: 0.70, R: [0.24, 1.95, 0.18], L: [-0.22, 0.98, 0.14], dir: [0.18, 0.97, 0.10], nrm: [1, 0, 0], twist: 0.12, lean: 0.04, crouch: 0.02, stance: 0.26, lgrip: 0, head: 0.30 },
    { u: 1.00, R: [0.17, 1.98, 0.14], L: [-0.22, 0.98, 0.14], dir: [-0.06, 0.98, 0.15], nrm: [1, 0, 0], twist: 0.08, lean: 0.04, crouch: 0.02, stance: 0.26, lgrip: 0, head: 0.28 },
    { u: 1.35, R: [0.25, 1.45, 0.30], L: [-0.22, 0.98, 0.14], dir: [0.20, 0.60, 0.75], nrm: [1, 0, 0], twist: 0.05, lean: 0.06, crouch: 0.02, stance: 0.26, lgrip: 0, head: 0.10 },
    { u: 1.65, ...HANG, L: [-0.22, 0.96, 0.14], twist: 0, lean: 0.08, crouch: 0.02, stance: 0.24, lgrip: 0, head: 0.00 },
  ]),
  calm: track([
    { u: 0.00, ...HANG, L: [-0.22, 0.98, 0.16], twist: 0.05, lean: 0.08, crouch: 0.02, stance: 0.22, lgrip: 0, head: -0.05 },
    { u: 0.18, ...HANG, L: [-0.23, 1.08, 0.24], twist: 0.08, lean: 0.08, crouch: 0.03, stance: 0.22, lgrip: 0, head: 0.08 },
    { u: 0.32, ...HANG, L: [-0.24, 0.98, 0.13], twist: 0.10, lean: 0.12, crouch: 0.04, stance: 0.22, lgrip: 0, head: -0.14 },
    { u: 0.70, ...HANG, L: [-0.22, 0.95, 0.12], twist: 0.05, lean: 0.08, crouch: 0.02, stance: 0.22, lgrip: 0, head: -0.06 },
    { u: 1.10, ...HANG, L: [-0.21, 0.92, 0.10], twist: 0, lean: 0.06, crouch: 0.02, stance: 0.20, lgrip: 0, head: -0.10 },
  ]),
  down: track([
    { u: 0.00, R: [0.26, 0.80, 0.05], L: [-0.24, 0.82, 0.04], dir: [0.05, -0.85, 0.50], nrm: [1, 0, 0], twist: 0, lean: 0.15, crouch: 0.02, stance: 0.18, lgrip: 0, head: -0.20 },
    { u: 0.40, R: [0.25, 0.74, 0.02], L: [-0.24, 0.80, 0.02], dir: [0.05, -0.95, 0.30], nrm: [1, 0, 0], twist: 0, lean: 0.22, crouch: 0.03, stance: 0.16, lgrip: 0, head: -0.55 },
    { u: 0.80, R: [0.22, 0.76, 0.06], L: [-0.24, 0.80, 0.02], dir: [-0.15, -0.90, 0.40], nrm: [1, 0, 0], twist: -0.05, lean: 0.22, crouch: 0.03, stance: 0.16, lgrip: 0, head: -0.50 },
    { u: 1.20, R: [0.27, 0.74, 0.00], L: [-0.24, 0.80, 0.02], dir: [0.20, -0.95, 0.25], nrm: [1, 0, 0], twist: 0.05, lean: 0.20, crouch: 0.03, stance: 0.16, lgrip: 0, head: -0.45 },
    { u: 1.60, R: [0.26, 0.78, 0.04], L: [-0.24, 0.82, 0.04], dir: [0.05, -0.85, 0.50], nrm: [1, 0, 0], twist: 0, lean: 0.15, crouch: 0.02, stance: 0.18, lgrip: 0, head: -0.30 },
  ]),
  strings: track([
    { u: 0.00, R: [0.14, 1.12, 0.34], L: [0.00, 1.30, 0.42], dir: [-0.10, 0.90, 0.35], nrm: [0, -0.3, -0.95], twist: 0.15, lean: 0.06, crouch: 0.02, stance: 0.20, lgrip: 0, head: 0.15 },
    { u: 0.25, R: [0.12, 1.20, 0.30], L: [0.04, 1.52, 0.40], dir: [-0.10, 0.95, 0.30], nrm: [0, -0.3, -0.95], twist: 0.15, lean: 0.06, crouch: 0.02, stance: 0.20, lgrip: 0, head: 0.25 },
    { u: 0.45, R: [0.12, 1.20, 0.30], L: [0.08, 1.50, 0.40], dir: [-0.10, 0.95, 0.30], nrm: [0, -0.3, -0.95], twist: 0.15, lean: 0.06, crouch: 0.02, stance: 0.20, lgrip: 0, head: 0.25 },
    { u: 0.65, R: [0.12, 1.20, 0.30], L: [0.02, 1.54, 0.40], dir: [-0.10, 0.95, 0.30], nrm: [0, -0.3, -0.95], twist: 0.15, lean: 0.06, crouch: 0.02, stance: 0.20, lgrip: 0, head: 0.27 },
    { u: 0.85, R: [0.12, 1.20, 0.30], L: [0.07, 1.49, 0.41], dir: [-0.10, 0.95, 0.30], nrm: [0, -0.3, -0.95], twist: 0.15, lean: 0.06, crouch: 0.02, stance: 0.20, lgrip: 0, head: 0.25 },
    { u: 1.10, R: [0.12, 1.20, 0.30], L: [0.03, 1.52, 0.40], dir: [-0.10, 0.95, 0.30], nrm: [0, -0.3, -0.95], twist: 0.15, lean: 0.06, crouch: 0.02, stance: 0.20, lgrip: 0, head: 0.25 },
    { u: 1.40, R: [0.20, 1.00, 0.30], L: [-0.15, 1.10, 0.30], dir: [0.10, 0.30, 0.90], nrm: [1, 0, 0], twist: 0.05, lean: 0.08, crouch: 0.02, stance: 0.20, lgrip: 0, head: 0.00 },
  ]),
  hips: track([
    { u: 0.00, R: [0.21, 1.00, -0.02], L: [-0.21, 1.00, -0.02], dir: [0.20, -0.85, -0.45], nrm: [1, 0, 0], twist: 0, lean: 0.10, crouch: 0.0, stance: 0.24, lgrip: 0, head: -0.25 },
    { u: 0.50, R: [0.21, 1.00, -0.02], L: [-0.21, 1.00, -0.02], dir: [0.20, -0.85, -0.45], nrm: [1, 0, 0], twist: 0, lean: 0.14, crouch: 0.0, stance: 0.24, lgrip: 0, head: -0.38 },
    { u: 1.00, R: [0.21, 1.00, -0.02], L: [-0.21, 1.00, -0.02], dir: [0.20, -0.85, -0.45], nrm: [1, 0, 0], twist: 0, lean: 0.10, crouch: 0.0, stance: 0.24, lgrip: 0, head: -0.12 },
    { u: 1.50, R: [0.21, 1.00, -0.02], L: [-0.21, 1.00, -0.02], dir: [0.20, -0.85, -0.45], nrm: [1, 0, 0], twist: 0, lean: 0.12, crouch: 0.0, stance: 0.24, lgrip: 0, head: -0.28 },
  ]),
  // Wawrinka's: the index finger tapped to his temple, held, toward his box (the wrist in front of the ear and below the
  // temple, so the hand points up to it: set at the temple itself the hand sat behind the head and rose onto the top of it)
  temple: track([
    { u: 0.00, ...HANG, L: [-0.24, 1.25, 0.28], twist: -0.1, lean: 0.06, crouch: 0.02, stance: 0.22, lgrip: 0, head: 0.05 },
    { u: 0.22, ...HANG, L: [-0.21, 1.53, 0.11], twist: -0.15, lean: 0.05, crouch: 0.02, stance: 0.22, lgrip: 0, head: 0.15 },
    { u: 0.34, ...HANG, L: [-0.215, 1.54, 0.07], twist: -0.15, lean: 0.05, crouch: 0.02, stance: 0.22, lgrip: 0, head: 0.18 },
    { u: 0.46, ...HANG, L: [-0.22, 1.53, 0.08], twist: -0.15, lean: 0.05, crouch: 0.02, stance: 0.22, lgrip: 0, head: 0.18 },
    { u: 0.95, ...HANG, L: [-0.215, 1.54, 0.07], twist: -0.12, lean: 0.05, crouch: 0.02, stance: 0.22, lgrip: 0, head: 0.15 },
    { u: 1.25, ...HANG, L: [-0.22, 1.00, 0.16], twist: 0, lean: 0.06, crouch: 0.02, stance: 0.22, lgrip: 0, head: 0.0 },
  ]),
  hands: track([
    { u: 0.00, R: [0.24, 1.40, 0.32], L: [-0.24, 1.45, 0.34], dir: [0.20, 0.60, 0.75], nrm: [1, 0, 0], twist: 0, lean: 0.02, crouch: 0.0, stance: 0.22, lgrip: 0, head: 0.10 },
    { u: 0.25, R: [0.10, 1.84, 0.02], L: [-0.10, 1.86, 0.04], dir: [0.15, 0.35, -0.92], nrm: [1, 0, 0], twist: 0, lean: -0.04, crouch: 0.0, stance: 0.22, lgrip: 0, head: 0.22 },
    { u: 0.80, R: [0.10, 1.84, 0.02], L: [-0.10, 1.86, 0.04], dir: [0.15, 0.35, -0.92], nrm: [1, 0, 0], twist: 0, lean: -0.04, crouch: 0.0, stance: 0.22, lgrip: 0, head: 0.30 },
    { u: 1.05, R: [0.32, 1.50, 0.12], L: [-0.32, 1.52, 0.12], dir: [0.30, 0.20, 0.90], nrm: [1, 0, 0], twist: 0, lean: 0.02, crouch: 0.0, stance: 0.22, lgrip: 0, head: 0.10 },
    { u: 1.30, ...HANG, L: [-0.24, 1.00, 0.12], twist: 0, lean: 0.06, crouch: 0.0, stance: 0.22, lgrip: 0, head: 0.00 },
  ]),
};
// The touches between points (see the figure's update): a wipe of the forehead with the free hand's wristband, and a look
// down at the strings with the racket brought up, each a short run of keys from its start; and a twirl of the racket about its
// handle, one turn, which only turns the strings.
const TOUCH_KINDS = ['wipe', 'look', 'spin'];
const TOUCH_OFTEN = { Borg: 0.3, Lendl: 0.35, Sampras: 0.4, Nadal: 0.7, Djokovic: 0.6, Alcaraz: 0.6, Agassi: 0.55, McEnroe: 0.6, Connors: 0.6,
  Murray: 0.6, Medvedev: 0.4, Tsitsipas: 0.7, Roddick: 0.65, Kyrgios: 0.7, Monfils: 0.6, Edberg: 0.3, Wilander: 0.35, Hewitt: 0.6 };
const TOUCH_ANIM = {
  wipe: track([
    { u: 0.00, R: [0.27, 0.86, 0.08], L: [-0.24, 0.92, 0.10], dir: [0.10, -0.60, 0.80], nrm: [1, 0, 0], twist: 0, lean: 0.06, crouch: 0.02, stance: 0.16, lgrip: 0, head: -0.05 },
    { u: 0.28, R: [0.27, 0.86, 0.08], L: [-0.13, 1.79, 0.17], dir: [0.10, -0.60, 0.80], nrm: [1, 0, 0], twist: -0.05, lean: 0.04, crouch: 0.02, stance: 0.16, lgrip: 0, head: 0.10 },
    { u: 0.48, R: [0.27, 0.86, 0.08], L: [0.05, 1.84, 0.14], dir: [0.10, -0.60, 0.80], nrm: [1, 0, 0], twist: -0.08, lean: 0.04, crouch: 0.02, stance: 0.16, lgrip: 0, head: 0.14 },
    { u: 0.66, R: [0.27, 0.86, 0.08], L: [0.11, 1.80, 0.16], dir: [0.10, -0.60, 0.80], nrm: [1, 0, 0], twist: -0.06, lean: 0.04, crouch: 0.02, stance: 0.16, lgrip: 0, head: 0.10 },
    { u: 1.00, R: [0.27, 0.86, 0.08], L: [-0.24, 0.94, 0.12], dir: [0.10, -0.60, 0.80], nrm: [1, 0, 0], twist: 0, lean: 0.06, crouch: 0.02, stance: 0.16, lgrip: 0, head: -0.10 },
    { u: 1.20, R: [0.27, 0.84, 0.06], L: [-0.26, 0.86, 0.04], dir: [0.10, -0.60, 0.80], nrm: [1, 0, 0], twist: 0, lean: 0.06, crouch: 0.02, stance: 0.14, lgrip: 0, head: -0.15 },
  ]),
  look: track([
    { u: 0.00, R: [0.22, 1.00, 0.24], L: [-0.22, 0.92, 0.10], dir: [0.05, 0.40, 0.92], nrm: [0.2, 0, -0.98], twist: 0.05, lean: 0.06, crouch: 0.02, stance: 0.16, lgrip: 0, head: 0.00 },
    { u: 0.35, R: [0.12, 1.14, 0.30], L: [-0.05, 1.30, 0.40], dir: [-0.10, 0.88, 0.45], nrm: [0.1, -0.45, -0.89], twist: 0.10, lean: 0.06, crouch: 0.02, stance: 0.16, lgrip: 0, head: 0.18 },
    { u: 0.70, R: [0.12, 1.16, 0.30], L: [0.04, 1.44, 0.42], dir: [-0.10, 0.92, 0.38], nrm: [0.1, -0.38, -0.92], twist: 0.10, lean: 0.06, crouch: 0.02, stance: 0.16, lgrip: 0, head: 0.22 },
    { u: 1.00, R: [0.12, 1.16, 0.30], L: [0.08, 1.42, 0.42], dir: [-0.10, 0.92, 0.38], nrm: [0.1, -0.38, -0.92], twist: 0.10, lean: 0.06, crouch: 0.02, stance: 0.16, lgrip: 0, head: 0.20 },
    { u: 1.35, R: [0.24, 0.90, 0.14], L: [-0.24, 0.90, 0.08], dir: [0.10, -0.55, 0.83], nrm: [1, 0, 0], twist: 0, lean: 0.06, crouch: 0.02, stance: 0.14, lgrip: 0, head: -0.10 },
  ]),
};
// one turn of the racket about its handle, u seconds into it, over D seconds (eased in and out, as fingers roll a grip)
function spinRacket(pose, u, D) {
  if (u <= 0 || u >= D) return; const a = 2 * Math.PI * (u / D) * (u / D) * (3 - 2 * (u / D)), d = pose.dir, dl = Math.hypot(d[0], d[1], d[2]) || 1, dx = d[0] / dl, dy = d[1] / dl, dz = d[2] / dl, n = pose.nrm;
  const c = Math.cos(a), s = Math.sin(a), k = (dx * n[0] + dy * n[1] + dz * n[2]) * (1 - c);
  pose.nrm = [n[0] * c + (dy * n[2] - dz * n[1]) * s + dx * k, n[1] * c + (dz * n[0] - dx * n[2]) * s + dy * k, n[2] * c + (dx * n[1] - dy * n[0]) * s + dz * k];
}
const READY_K = { u: 0.80, R: [0.04, 0.98, 0.31], L: [0.04, 1.03, 0.43], dir: [0.0, 0.50, 0.87], nrm: [1.0, 0.0, 0.0], twist: 0, lean: 0.34, crouch: 0.19, stance: 0.36, lgrip: 0.5, lgripAt: 0.092, elbows: -0.40, elbowFwd: 0.95 };
const LOB_FH = track([
  ...FOREHAND_A.keys.filter(k => k.u <= -0.2).map(k => ({ ...k })),
  { u: -0.09, R: [0.50, 0.68, -0.14], L: [0.30, 1.12, 0.30], dir: [0.50, -0.50, -0.70], nrm: [0.25, -0.60, 0.76], twist: 0.95, lean: 0.22, crouch: 0.30, stance: 0.44, lgrip: 0, shift: 0.10, footR: [0.10, -0.10], hipTurn: 0.25 },
  { u: 0.00, R: [0.46, 0.90, 0.36], L: [-0.16, 1.06, 0.20], dir: [0.93, 0.13, 0.32], nrm: [-0.25, 0.62, 0.74], twist: -0.05, lean: 0.14, crouch: 0.16, stance: 0.44, lgrip: 0, footR: [0.10, -0.08], heelR: 0.03, hipTurn: 1 },
  { u: 0.10, R: [0.30, 1.40, 0.62], L: [-0.24, 1.02, 0.14], dir: [-0.20, 0.92, 0.33], nrm: [-0.50, -0.20, 0.84], twist: -0.40, lean: 0.10, crouch: 0.10, stance: 0.44, lgrip: 0, shift: -0.02, footR: [0.06, 0.0], heelR: 0.08, hipTurn: 0.8 },
  { u: 0.24, R: [0.08, 1.78, 0.42], L: [-0.26, 1.02, 0.14], dir: [-0.30, 0.85, -0.43], nrm: [-0.70, -0.10, 0.70], twist: -0.75, lean: 0.10, crouch: 0.08, stance: 0.42, lgrip: 0, shift: -0.06, footR: [0.0, 0.08], heelR: 0.10, hipTurn: 0.7 },
  { u: 0.44, R: [-0.10, 1.46, 0.30], L: [-0.22, 1.02, 0.18], dir: [-0.40, 0.55, -0.73], nrm: [-0.70, 0.10, 0.70], twist: -0.70, lean: 0.18, crouch: 0.12, stance: 0.40, lgrip: 0.15, shift: -0.04, footR: [-0.02, 0.10], heelR: 0.06, hipTurn: 0.6 },
  ...FOREHAND_A.keys.filter(k => k.u >= 0.6).map(k => ({ ...k })),
]);
const LOB_BH2 = track([
  ...BACKHAND_2H_A.keys.filter(k => k.u <= -0.36).map(k => ({ ...k })),
  { u: -0.13, R: [-0.34, 0.72, -0.12], L: [-0.40, 0.76, -0.18], dir: [-0.45, -0.38, -0.80], nrm: [-0.6, -0.65, 0.45], twist: -1.40, lean: 0.24, crouch: 0.30, stance: 0.46, lgrip: 0.45, lgripAt: 0.105, shift: -0.06, fshift: 0.04, footR: [-0.20, 0.20], hipTurn: 0.4 },
  { u: 0.00, R: [-0.22, 0.90, 0.40], L: [-0.32, 0.92, 0.40], dir: [-0.90, 0.14, 0.24], nrm: [0.2, 0.62, 0.76], twist: -0.50, lean: 0.16, crouch: 0.18, stance: 0.46, lgrip: 0.45, lgripAt: 0.105, fshift: 0.08, footR: [-0.20, 0.22], heelL: 0.04, hipTurn: 0.9 },
  { u: 0.12, R: [-0.02, 1.42, 0.50], L: [-0.08, 1.46, 0.50], dir: [0.15, 0.95, 0.27], nrm: [0.6, -0.2, 0.77], twist: 0.15, lean: 0.12, crouch: 0.10, stance: 0.46, lgrip: 0.45, lgripAt: 0.105, fshift: 0.10, footR: [-0.20, 0.22], heelL: 0.08, hipTurn: 0.8 },
  { u: 0.28, R: [0.12, 1.80, 0.25], L: [0.06, 1.84, 0.24], dir: [0.35, 0.80, -0.48], nrm: [0.8, -0.1, 0.6], twist: 0.55, lean: 0.10, crouch: 0.08, stance: 0.44, lgrip: 0.45, lgripAt: 0.105, fshift: 0.08, footR: [-0.18, 0.20], heelL: 0.10, hipTurn: 0.7 },
  { u: 0.50, R: [0.20, 1.40, 0.18], L: [0.12, 1.42, 0.20], dir: [0.25, 0.65, -0.55], nrm: [0.8, 0, 0.6], twist: 0.45, lean: 0.20, crouch: 0.12, stance: 0.40, lgrip: 0.45, lgripAt: 0.105, fshift: 0.04, footR: [-0.08, 0.10], heelL: 0.05 },
  ...BACKHAND_2H_A.keys.filter(k => k.u >= 0.68).map(k => ({ ...k })),
]);
// (the free hand leaves the throat by way of the side of the hip, not straight back behind it: let go of earlier for a lob, it
// was swung behind him in four frames)
const LOB_BH1 = track([
  ...BACKHAND_1H_A.keys.filter(k => k.u <= -0.36).map(k => ({ ...k })),
  { u: -0.14, R: [-0.42, 0.76, -0.16], L: [-0.38, 0.92, -0.06], dir: [-0.42, -0.40, -0.81], nrm: [-0.6, -0.65, 0.45], twist: -1.60, lean: 0.26, crouch: 0.30, stance: 0.40, lgrip: 0.4, shift: -0.02, fshift: 0.06, footR: [-0.26, 0.24], footL: [-0.04, -0.06], hipTurn: 0.5 },
  { u: 0.00, R: [-0.22, 0.90, 0.50], L: [-0.33, 0.90, -0.20], dir: [-0.88, 0.12, 0.26], nrm: [0.25, 0.62, 0.74], twist: -1.05, lean: 0.18, crouch: 0.18, stance: 0.40, lgrip: 0, shift: 0.02, fshift: 0.12, footR: [-0.26, 0.26], footL: [-0.04, -0.06], heelL: 0.05, hipTurn: 0.55 },
  { u: 0.14, R: [0.02, 1.50, 0.52], L: [-0.34, 0.80, -0.40], dir: [0.30, 0.90, 0.30], nrm: [0.6, -0.4, 0.7], twist: -0.80, lean: 0.12, crouch: 0.10, stance: 0.40, lgrip: 0, fshift: 0.14, footR: [-0.26, 0.26], footL: [-0.04, -0.06], heelL: 0.09, hipTurn: 0.5 },
  { u: 0.32, R: [0.20, 1.85, 0.25], L: [-0.34, 0.74, -0.42], dir: [0.40, 0.80, -0.45], nrm: [0.6, -0.5, 0.6], twist: -0.50, lean: 0.10, crouch: 0.08, stance: 0.40, lgrip: 0, fshift: 0.12, footR: [-0.24, 0.26], footL: [-0.02, -0.02], heelL: 0.10, hipTurn: 0.5 },
  { u: 0.55, R: [0.26, 1.40, 0.22], L: [-0.24, 0.88, 0.02], dir: [0.30, 0.85, -0.42], nrm: [0.8, 0, 0.6], twist: -0.25, lean: 0.22, crouch: 0.14, stance: 0.40, lgrip: 0, fshift: 0.06, footR: [-0.10, 0.12] },
  ...BACKHAND_1H_A.keys.filter(k => k.u >= 0.7).map(k => ({ ...k })),
]);
// Forehand drop shot: the take-back of a forehand, but the racket head kept up and the face opening as it comes forward;
// a short soft cut under the ball, the body hardly turning through it, and the finish held out in front, the face to
// the sky, before he recovers.
const DROP_FH = track([
  ...FOREHAND_A.keys.filter(k => k.u <= -0.56).map(k => ({ ...k })),
  { u: -0.36, R: [0.50, 1.24, -0.08], L: [0.58, 1.28, 0.20], dir: [0.25, 0.92, -0.30], nrm: [0.70, 0.30, 0.65], twist: 1.25, lean: 0.26, crouch: 0.22, stance: 0.42, lgrip: 0, shift: 0.10, footR: [0.10, -0.10], hipTurn: 0.5 },
  { u: -0.18, R: [0.50, 1.16, 0.06], L: [0.40, 1.22, 0.26], dir: [0.45, 0.70, -0.55], nrm: [0.20, 0.55, 0.81], twist: 1.0, lean: 0.26, crouch: 0.24, stance: 0.44, lgrip: 0, shift: 0.08, footR: [0.10, -0.10], hipTurn: 0.4 },
  { u: 0.00, R: [0.46, 0.94, 0.42], L: [0.00, 1.10, 0.26], dir: [0.84, 0.20, 0.42], nrm: [-0.15, 0.68, 0.72], twist: 0.40, lean: 0.30, crouch: 0.22, stance: 0.42, lgrip: 0, fshift: 0.06, footR: [0.10, -0.08], hipTurn: 0.5 },
  { u: 0.14, R: [0.34, 0.90, 0.60], L: [-0.10, 1.08, 0.20], dir: [0.45, 0.30, 0.84], nrm: [-0.25, 0.88, 0.40], twist: 0.15, lean: 0.30, crouch: 0.21, stance: 0.42, lgrip: 0, fshift: 0.08, footR: [0.10, -0.06], hipTurn: 0.45 },
  { u: 0.34, R: [0.30, 0.94, 0.56], L: [-0.10, 1.06, 0.22], dir: [0.40, 0.36, 0.84], nrm: [-0.25, 0.86, 0.44], twist: 0.10, lean: 0.30, crouch: 0.20, stance: 0.41, lgrip: 0, fshift: 0.06, footR: [0.08, -0.04], hipTurn: 0.4 },
  { u: 0.60, R: [0.10, 0.98, 0.36], L: [0.00, 1.03, 0.42], dir: [0.10, 0.55, 0.83], nrm: [0.95, 0.10, 0.30], twist: 0.04, lean: 0.32, crouch: 0.20, stance: 0.38, lgrip: 0.3, lgripAt: 0.115, fshift: 0.02 },
  { ...READY_K, u: 0.80 },
]);
// Backhand drop shot: the slice's high take-back and cut, but the swing stops short out in front, the face to the sky.
const DROP_BH = track([
  ...BH_SLICE.keys.filter(k => k.u <= 0.0).map(k => ({ ...k })),
  { u: 0.14, R: [-0.12, 0.92, 0.62], L: [-0.26, 1.00, -0.32], dir: [-0.50, 0.25, 0.83], nrm: [0.35, 0.85, 0.40], twist: -1.00, lean: 0.28, crouch: 0.26, stance: 0.48, lgrip: 0, fshift: 0.10, footR: [-0.22, 0.24], hipTurn: 0.45 },
  { u: 0.34, R: [-0.08, 0.95, 0.58], L: [-0.28, 0.98, -0.28], dir: [-0.45, 0.32, 0.83], nrm: [0.35, 0.84, 0.42], twist: -0.90, lean: 0.28, crouch: 0.24, stance: 0.46, lgrip: 0, fshift: 0.08, footR: [-0.20, 0.22], hipTurn: 0.4 },
  ...BH_SLICE.keys.filter(k => k.u >= 0.58).map(k => ({ ...k })),
]);
// Volleys: no backswing, a short punch out in front.
// (the free hand on the throat where the ready position holds it: left to follow from how much it holds, it was taken a quarter of
// his height up the racket, and as a volley began from the ready position that hand slid thirty centimetres up it in a frame or two)
const VOL_AT = globalThis.__volGripOld ? {} : { lgripAt: 0.092 };
const FH_VOLLEY = track([
  { u: -0.45, R: [0.14, 1.02, 0.36], L: [-0.08, 1.08, 0.42], dir: [-0.3, 0.75, 0.6], nrm: [0.75, 0, 0.66], twist: 0, lean: 0.3, crouch: 0.2, stance: 0.36, lgrip: 0.42, ...VOL_AT },
  // a short turn of the shoulders, the racket head up in front of the hitting shoulder (no further back than that: a volley
  // has no backswing), the off hand out in front
  { u: -0.16, R: [0.36, 1.22, 0.26], L: [0.04, 1.18, 0.40], dir: [0.32, 0.92, -0.10], nrm: [0.25, 0.25, 0.94], twist: 0.75, lean: 0.30, crouch: 0.22, stance: 0.40, lgrip: 0, shift: 0.04, footL: [0.06, 0.12], hipTurn: 0.45 },
  // the step in with the far foot and the punch, contact well out in front, wrist firm
  { u: 0.00, R: [0.42, 1.12, 0.56], L: [-0.10, 1.20, 0.36], dir: [0.68, 0.66, 0.30], nrm: [-0.2, 0.3, 0.93], twist: 0.35, lean: 0.36, crouch: 0.26, stance: 0.44, lgrip: 0, fshift: 0.12, footL: [0.10, 0.30], heelR: 0.05, hipTurn: 0.45 },
  { u: 0.18, R: [0.34, 1.00, 0.70], L: [-0.12, 1.16, 0.32], dir: [0.6, 0.55, 0.58], nrm: [-0.3, 0.5, 0.8], twist: 0.1, lean: 0.36, crouch: 0.24, stance: 0.44, lgrip: 0, fshift: 0.14, footL: [0.10, 0.30], heelR: 0.06, hipTurn: 0.4 },
  { u: 0.55, R: [0.14, 1.02, 0.36], L: [-0.08, 1.08, 0.42], dir: [-0.3, 0.75, 0.6], nrm: [0.75, 0, 0.66], twist: 0, lean: 0.3, crouch: 0.2, stance: 0.36, lgrip: 0.42, ...VOL_AT },
], { hold: -0.16 });
const BH_VOLLEY = track([
  { u: -0.45, R: [0.14, 1.02, 0.36], L: [-0.08, 1.08, 0.42], dir: [-0.3, 0.75, 0.6], nrm: [0.75, 0, 0.66], twist: 0, lean: 0.3, crouch: 0.2, stance: 0.36, lgrip: 0.42, ...VOL_AT },
  // the turn with both hands on the racket, racket head up by the far shoulder
  // (in front of that shoulder, out along the turned chest, as the slice's: at it, the free hand on the throat was on its own
  // shoulder joint and its elbow was thrown over the top as he ran in)
  { u: -0.16, R: [-0.34, 1.24, 0.21], L: [-0.38, 1.32, 0.15], dir: [-0.35, 0.90, -0.25], nrm: [-0.1, 0.25, 0.96], twist: -0.95, lean: 0.28, crouch: 0.22, stance: 0.40, lgrip: 0.5, shift: -0.04, footR: [-0.06, 0.12], hipTurn: 0.5 },
  // the step across with the hitting-side foot; the off hand lets go and goes back as the racket punches out
  // (the free hand lets go as the punch begins, a tenth of a second before the ball: let go only at contact, both arms were out
  // in front with the racket between them, a two-handed push)
  // (the free hand eased off the throat, not snatched back from it: gone fourteen centimetres back in the first twelfth of a
  // second, the arm turned thirty degrees in a frame as it let go)
  { u: -0.08, R: [-0.33, 1.19, 0.36], L: [-0.34, 1.25, 0.07], dir: [-0.55, 0.80, 0.05], nrm: [0.05, 0.27, 0.96], twist: -0.88, lean: 0.31, crouch: 0.24, stance: 0.42, lgrip: 0.0, fshift: 0.05, footR: [-0.08, 0.20], hipTurn: 0.5 },
  { u: 0.00, R: [-0.30, 1.12, 0.54], L: [-0.26, 1.12, -0.18], dir: [-0.70, 0.64, 0.30], nrm: [0.2, 0.3, 0.93], twist: -0.80, lean: 0.34, crouch: 0.26, stance: 0.44, lgrip: 0, fshift: 0.12, footR: [-0.10, 0.30], heelL: 0.05, hipTurn: 0.5 },
  { u: 0.18, R: [-0.16, 1.00, 0.68], L: [-0.32, 0.98, -0.38], dir: [-0.5, 0.5, 0.7], nrm: [0.3, 0.5, 0.8], twist: -0.65, lean: 0.34, crouch: 0.24, stance: 0.44, lgrip: 0, fshift: 0.14, footR: [-0.10, 0.30], heelL: 0.06, hipTurn: 0.45 },
  // (the free arm stays back for balance through the finish and comes in to the racket over a third of a second: brought from
  // behind him to its throat in a fifth, it was swung round past his hip at thirty to sixty degrees a frame)
  { u: 0.36, R: [-0.02, 1.01, 0.52], L: [-0.46, 0.99, -0.06], dir: [-0.4, 0.62, 0.65], nrm: [0.5, 0.25, 0.73], twist: -0.33, lean: 0.32, crouch: 0.22, stance: 0.40, lgrip: 0, fshift: 0.07, hipTurn: 0.22 },
  { u: 0.54, R: [0.06, 1.02, 0.46], L: [-0.44, 1.04, 0.22], dir: [-0.36, 0.68, 0.63], nrm: [0.62, 0.15, 0.70], twist: -0.16, lean: 0.31, crouch: 0.21, stance: 0.38, lgrip: 0, fshift: 0.04, hipTurn: 0.12 },
  { u: 0.68, R: [0.12, 1.02, 0.39], L: [-0.22, 1.06, 0.40], dir: [-0.32, 0.73, 0.60], nrm: [0.72, 0.04, 0.68], twist: -0.04, lean: 0.30, crouch: 0.20, stance: 0.37, lgrip: 0.12, hipTurn: 0.03 },
  { u: 0.82, R: [0.14, 1.02, 0.36], L: [-0.08, 1.08, 0.42], dir: [-0.3, 0.75, 0.6], nrm: [0.75, 0, 0.66], twist: 0, lean: 0.3, crouch: 0.2, stance: 0.36, lgrip: 0.42, ...VOL_AT },
], { hold: -0.16 });
// Overhead: he turns side-on as the lob goes up, the free hand points at the ball, the racket is taken
// up behind the head (the serve's trophy), falls behind the back and is thrown up to meet the ball out
// in front; the free arm pulls down to the chest and the racket finishes down across the body.
const SMASH = track([
  { u: -0.80, R: [0.14, 1.02, 0.36], L: [-0.08, 1.08, 0.42], dir: [-0.3, 0.75, 0.6], nrm: [0.75, 0, 0.66], twist: 0, lean: 0.24, crouch: 0.14, stance: 0.36, lgrip: 0.42, ...VOL_AT },
  { u: -0.48, R: [0.30, 1.62, -0.08], L: [-0.10, 2.02, 0.30], dir: [0.0, 0.86, -0.51], nrm: [0.9, 0.1, 0.4], twist: 1.5, lean: 0.06, crouch: 0.12, stance: 0.42, lgrip: 0, footR: [0.08, -0.26], hipTurn: 0.75 },
  { u: -0.18, R: [0.32, 1.60, -0.14], L: [-0.06, 1.98, 0.32], dir: [0.08, 0.72, -0.69], nrm: [0.95, 0.2, -0.1], twist: 1.45, lean: 0.04, crouch: 0.14, stance: 0.42, lgrip: 0, footR: [0.08, -0.26], hipTurn: 0.75 },   /* still up behind his head while the ball comes down: the drop is the last tenth of a second */
  { u: -0.07, R: [0.30, 1.72, -0.10], L: [-0.10, 1.62, 0.30], dir: [0.06, -0.92, -0.38], nrm: [0.9, 0, 0.42], twist: 0.80, lean: 0.04, crouch: 0.10, stance: 0.42, lgrip: 0, footR: [0.06, -0.20], hipTurn: 0.6 },
  { u: -0.047, fill: true, dir: [0.06, -0.39, -0.92] },         // the head comes up behind him, pointing back...
  { u: -0.022, fill: true, dir: [0.05, 0.62, -0.78] },          // ...and on up over his shoulder
  { u: 0.00, R: [0.20, 2.04, 0.36], L: [-0.24, 1.18, 0.22], dir: [0.05, 0.94, 0.33], nrm: [-0.05, -0.3, 0.95], twist: 0.10, lean: 0.10, crouch: 0.04, stance: 0.42, lgrip: 0, fshift: 0.06, hipTurn: 0.9 },
  { u: 0.16, R: [-0.14, 1.22, 0.46], L: [-0.10, 1.06, 0.30], dir: [-0.40, -0.60, 0.70], nrm: [-0.6, 0.4, 0.7], twist: -0.45, lean: 0.24, crouch: 0.10, stance: 0.42, lgrip: 0, fshift: 0.10, hipTurn: 0.8 },
  { u: 0.42, R: [-0.24, 0.86, 0.22], L: [-0.08, 1.04, 0.32], dir: [-0.22, -0.95, 0.22], nrm: [-0.9, 0, 0.4], twist: -0.55, lean: 0.24, crouch: 0.14, stance: 0.40, lgrip: 0, fshift: 0.06 },
  { u: 0.85, R: [0.14, 1.02, 0.36], L: [-0.08, 1.08, 0.42], dir: [-0.3, 0.75, 0.6], nrm: [0.75, 0, 0.66], twist: 0, lean: 0.3, crouch: 0.2, stance: 0.36, lgrip: 0.42, ...VOL_AT },
], { hold: -0.48 });
// Serve (and the overhead, which is its second half). Side-on with the weight rocking from the
// back foot to the front; the toss arm goes straight up and stays there, the knees sink as the
// racket comes up to the trophy position, the legs drive, the racket falls behind the back and
// is thrown up to full stretch; he lands on the front foot inside the court, the back leg
// kicking out behind.
const SERVE_A = track([
  { u: -1.50, R: [0.33, 0.98, 0.22], L: [0.28, 1.06, 0.36], dir: [0.50, 0.42, 0.76], nrm: [0.76, 0, -0.65], twist: 1.15, elbows: 0.3, lean: 0.12, crouch: 0.02, stance: 0.24, lgrip: 0.35, footL: [0.02, 0.14], footR: [0.06, -0.18], hipTurn: 0.85 },
  { u: -1.22, R: [0.34, 0.88, 0.14], L: [0.26, 1.00, 0.38], dir: [0.45, -0.20, 0.87], nrm: [0.85, 0, -0.5], twist: 1.2, lean: 0.16, crouch: 0.05, stance: 0.25, lgrip: 0.2, footL: [0.02, 0.14], footR: [0.06, -0.18], fshift: -0.05, shift: 0.03, hipTurn: 0.8 },
  { u: -0.96, R: [0.36, 0.86, -0.22], L: [0.10, 1.70, 0.40], dir: [0.3, -0.5, -0.81], nrm: [0.9, 0.2, 0.3], twist: 1.35, lean: 0.06, crouch: 0.08, stance: 0.26, lgrip: 0, footL: [0.02, 0.14], footR: [0.06, -0.18], fshift: 0.0, hipTurn: 0.8 },
  { u: -0.72, R: [0.46, 1.20, -0.30], L: [0.10, 2.04, 0.36], dir: [0.5, 0.5, -0.71], nrm: [0.7, -0.3, 0.6], twist: 1.50, lean: -0.04, crouch: 0.16, stance: 0.26, lgrip: 0, footL: [0.02, 0.14], footR: [0.06, -0.16], fshift: 0.05, hipTurn: 0.8, sideLean: -0.10 },
  { u: -0.50, R: [0.42, 1.62, -0.16], L: [0.08, 2.08, 0.32], dir: [-0.10, 0.96, -0.26], nrm: [0.8, 0.1, 0.6], twist: 1.62, lean: -0.12, crouch: 0.26, stance: 0.26, lgrip: 0, footL: [0.02, 0.14], footR: [0.06, -0.14], fshift: 0.08, hipTurn: 0.75, sideLean: -0.22 },
  { u: -0.27, R: [0.36, 1.64, -0.20], L: [0.00, 1.60, 0.30], dir: [-0.05, 0.92, -0.38], nrm: [0.9, 0.1, 0.4], twist: 1.20, lean: -0.10, crouch: 0.10, stance: 0.26, lgrip: 0, footL: [0.02, 0.14], footR: [0.06, -0.12], fshift: 0.10, heelL: 0.05, heelR: 0.07, hipTurn: 0.6, sideLean: -0.18 },
  { u: -0.13, R: [0.28, 1.76, -0.14], L: [-0.05, 1.40, 0.28], dir: [0.10, -0.94, -0.32], nrm: [0.9, 0.1, 0.4], twist: 0.80, lean: -0.04, crouch: 0.02, stance: 0.26, lgrip: 0, footL: [0.02, 0.15], footR: [0.06, -0.12], fshift: 0.13, heelL: 0.05, heelR: 0.08, hipTurn: 0.8, sideLean: 0.0 },
  { u: -0.085, fill: true, dir: [0.08, -0.47, -0.88] },        // the racket comes up out of the drop behind his back...
  { u: -0.04, fill: true, dir: [0.06, 0.53, -0.85] },           // ...and on up over the shoulder to the ball
  { u: 0.00, R: [0.24, 2.32, 0.38], L: [-0.16, 1.18, 0.20], dir: [0.04, 0.985, 0.17], nrm: [-0.1, -0.17, 0.98], twist: 0.20, lean: 0.14, crouch: -0.04, stance: 0.26, lgrip: 0, footL: [0.02, 0.16], footR: [0.06, -0.12], fshift: 0.16, heelL: 0.04, heelR: 0.08, hipTurn: 1, sideLean: 0.12 },
  { u: 0.14, R: [0.00, 1.70, 0.74], L: [-0.2, 1.1, 0.14], dir: [-0.2, -0.1, 0.97], nrm: [-0.5, 0.8, 0.3], twist: -0.40, lean: 0.34, crouch: 0.04, stance: 0.28, lgrip: 0, footL: [0.02, 0.30], footR: [0.08, -0.34], fshift: 0.30, heelR: 0.28, hipTurn: 0.8 },
  { u: 0.34, R: [-0.30, 0.92, 0.44], L: [-0.22, 1.04, 0.12], dir: [-0.5, -0.75, 0.43], nrm: [-0.7, 0.4, -0.5], twist: -0.90, lean: 0.36, crouch: 0.16, stance: 0.34, lgrip: 0, footL: [0.02, 0.32], footR: [0.06, -0.22], fshift: 0.32, heelR: 0.20, hipTurn: 0.7 },
  { u: 0.70, R: [0.04, 0.98, 0.31], L: [0.04, 1.03, 0.43], dir: [0.0, 0.50, 0.87], nrm: [1.0, 0.0, 0.0], twist: 0, lean: 0.34, crouch: 0.19, stance: 0.36, lgrip: 0.5, lgripAt: 0.092, elbows: -0.40, elbowFwd: 0.95 },
], { hold: -0.42 });

// ---------- measured strokes ----------
// The body's large motion — how far and when the shoulders turn, the crouch and rise through
// the ball, where both hands travel on the take-back and the finish — comes from the tracked
// footage. Footage at 15 frames a second cannot resolve the tenth of a second around contact,
// so through the hit the racket hand follows the authored path, and the racket's own
// orientation (which nobody tracked) is authored throughout.
function measured(D, A, o = {}) {
  const keys = [];
  const bell = u => { const a = o.zone || [-0.15, 0.11], e = 0.09; return u < a[0] - e || u > a[1] + e ? 0 : u < a[0] ? (u - (a[0] - e)) / e : u > a[1] ? 1 - (u - a[1]) / e : 1; };
  for (let i = 0; i < D.u.length; i++) {
    const u = D.u[i], a = A.at(u), w = sm(bell(u)), end = sm((u - (A.span[1] - 0.3)) / 0.3), start = 1 - sm((u - A.span[0]) / 0.18);
    const back = Math.max(end, start);                     // ease into and out of the ready position
    const mixv = (d, av, k) => [lerp(d[0], av[0], k), lerp(d[1], av[1], k), lerp(d[2], av[2], k)];
    const R = mixv(D.R[i], a.R, Math.max(w, back)), L = o.offHand === 'grip' ? a.L : mixv(D.L[i], a.L, Math.max(back, o.offAuthored ? o.offAuthored(u) : 0));
    keys.push({ u, R, L, dir: a.dir, nrm: a.nrm, twist: lerp(D.twist[i] * (o.twistK || 1), a.twist, back), lean: a.lean, crouch: lerp(clamp(0.985 - D.hipY[i], 0.04, 0.34), a.crouch, back * 0.6),
      stance: lerp(clamp(D.stance[i], 0.17, 0.46), a.stance, back), lgrip: a.lgrip, head: 0, sideLean: lerp(clamp(-D.tilt[i] * 0.35, -0.3, 0.3), 0, back) });
  }
  // the authored keys inside the contact zone keep their exact times
  for (const k of A.keys) if (k.u > (o.zone || [-0.15, 0.11])[0] - 0.02 && k.u < (o.zone || [-0.15, 0.11])[1] + 0.02) {
    const j = keys.findIndex(q => Math.abs(q.u - k.u) < 0.034); const base = j >= 0 ? keys[j] : null;
    const nk = { ...k, twist: base ? base.twist : k.twist, crouch: base ? base.crouch : k.crouch, stance: base ? base.stance : k.stance, L: base && o.offHand !== 'grip' ? base.L : k.L, sideLean: base ? base.sideLean : 0 };
    if (j >= 0) keys[j] = nk; else keys.push(nk);
  }
  keys.sort((a, b) => a.u - b.u);
  // close the loop on the ready position
  const first = A.keys[0], last = A.keys[A.keys.length - 1];
  const out = keys.filter(k => k.u > first.u + 0.02 && k.u < last.u - 0.02);
  return track([first, ...out, last], { hold: A.hold });
}
const SD = STROKE_DATA;
// The pooled tracks in strokedata.js (two wrists and a shoulder turn, averaged over hundreds of
// strokes filmed from behind) flatten every extreme of a swing, so they are no longer played:
// until a player's own full-body clip is in (see playermotion.js) the strokes are these keys.
void measured; void SD;
const FOREHAND = FOREHAND_A, BACKHAND_1H = BACKHAND_1H_A, BACKHAND_2H = BACKHAND_2H_A, SERVE = SERVE_A;

export { B as BODY };
