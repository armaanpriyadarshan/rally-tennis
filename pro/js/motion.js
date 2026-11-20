// Rally Pro — how a body moves over the ground: motion capture, mixed by where the player is
// going. A pose here is the 3D position of nineteen joints in the body's own frame (metres for a
// 1.85 m man; x to his right, y up from the ground, z the way he faces; the origin under his
// hips). The figure turns a pose into bone directions on whatever body it has.
import { LOCO, LOCO_JOINTS, LOCO_FPS } from './locodata.js';

export const JOINTS = LOCO_JOINTS, NJ = JOINTS.length, N3 = NJ * 3;
export const J = Object.fromEntries(JOINTS.map((n, i) => [n, i]));
export const ANKLE_H = 0.095;                       // an ankle's height in these clips with the foot flat on the ground

const CL = {};
for (const k in LOCO) { const c = LOCO[k], sp = Math.hypot(c.v[0], c.v[1]), dur = c.n / LOCO_FPS; CL[k] = { n: c.n, v: c.v, speed: sp, dur, stride: sp * dur, F: c.J.map(f => Float32Array.from(f)) }; }
// A tennis player's side shuffle, not the captured one: that was a sideways gallop, the feet clicked together to thirteen
// centimetres and then both left the court together, the hips riding higher than in his ready stance, so every step to a
// ball a metre or two away was a skip on straight legs, the feet slapped together under him. Here, in each frame of the two
// shuffle clips the feet are kept at least a
// third of a metre apart (each moved out from their middle), and the hips and everything above them sat lower, into the
// athletic stance he moves in. (globalThis.__shuffleOld before load: the captured gallop.)
const SHUF = (globalThis.location && new URLSearchParams(globalThis.location.search).get('shuf')) || '';   // (tools: ?shuf=old|drop|nolow|nosep picks a variant)
if (!globalThis.__shuffleOld && SHUF !== 'old') for (const k of ['shuffleR', 'shuffleL']) { const c = CL[k]; if (!c) continue;
  const legL = ['lknee', 'lankle', 'ltoe'], legR = ['rknee', 'rankle', 'rtoe'], low = new Set(['lknee', 'lankle', 'ltoe', 'rknee', 'rankle', 'rtoe']);
  for (const a of c.F) {
    const ly = a[J.lankle * 3 + 1], ry = a[J.rankle * 3 + 1], drop = SHUF !== 'drop' ? 0 : Math.max(0, Math.min(ly, ry) - ANKLE_H);   /* (the flight kept: let down onto the lower foot every frame, the swinging foot passed the planted one low, shin against shin, four times as often) */
    for (let j = 0; j < NJ; j++) a[j * 3 + 1] -= drop;
    const dx = a[J.rankle * 3] - a[J.lankle * 3], need = 0.34; if (SHUF !== 'nosep' && Math.abs(dx) < need) { const sg = dx >= 0 ? 1 : -1, d = (need - Math.abs(dx)) / 2; for (const n of legL) if (J[n] != null) a[J[n] * 3] -= sg * d * (n === 'lknee' ? 0.6 : 1); for (const n of legR) if (J[n] != null) a[J[n] * 3] += sg * d * (n === 'rknee' ? 0.6 : 1); }
    if (SHUF !== 'nolow') for (let j = 0; j < NJ; j++) if (!low.has(JOINTS[j])) a[j * 3 + 1] -= 0.05; } }
export const CLIPS = CL;

// the pose at phase `ph` (0..1) of a clip that closes on itself
// Between captured frames a joint follows a smooth curve through them (Catmull-Rom), not a straight line from one to the
// next: in a straight line its motion turns a corner at every frame, which nobody sees at full speed and everyone sees
// slowed down in a replay.
const cr = (p0, p1, p2, p3, t, t2, t3) => 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
export function sampleLoop(c, ph, out) {
  if (c.n === 1) { out.set(c.F[0]); return out; }
  const n = c.n, x = (((ph % 1) + 1) % 1) * n, i = Math.floor(x) % n, w = x - Math.floor(x), w2 = w * w, w3 = w2 * w;
  const A = c.F[(i + n - 1) % n], B = c.F[i], C = c.F[(i + 1) % n], D = c.F[(i + 2) % n];
  for (let k = 0; k < N3; k++) out[k] = cr(A[k], B[k], C[k], D[k], w, w2, w3);
  return out;
}
export function mix(out, b, w) { if (w <= 0) return out; for (let k = 0; k < N3; k++) out[k] += (b[k] - out[k]) * w; return out; }

// ---------- a player's own strokes ----------
// A tracked clip is the same nineteen joints through one stroke, timed from contact. It is kept
// centred under the hips frame by frame (the game moves the player; the clip moves his body),
// and mirrored for a player of the other hand.
// Tracking from broadcast video shakes: a joint jumps a few centimetres from one frame to the next, and
// now and then a whole frame is wrong. Each track is first cleared of single wrong frames (the middle of
// five), then smoothed both ways in time so nothing is delayed: hard where the joint is slow, so a stance
// stops shaking, and lightly where it is fast, so a swing keeps its whip. The hips are smoothed before the
// clip is centred on them, or their shake would pass into every other joint.
function median5(src, n) { const out = new Float32Array(src.length), b = [0, 0, 0, 0, 0];
  for (let f = 0; f < n; f++) for (let c = 0; c < 3; c++) { for (let k = -2; k <= 2; k++) b[k + 2] = src[Math.max(0, Math.min(n - 1, f + k)) * 3 + c]; b.sort((x, y) => x - y); out[f * 3 + c] = b[2]; } return out; }
function gauss(src, n, sig) { const out = new Float32Array(src.length), R = Math.ceil(sig * 3), w = []; let ws = 0; for (let k = -R; k <= R; k++) { const v = Math.exp(-k * k / (2 * sig * sig)); w.push(v); ws += v; }
  for (let f = 0; f < n; f++) for (let c = 0; c < 3; c++) { let s = 0; for (let k = -R; k <= R; k++) { let g = f + k; if (g < 0) g = -g; if (g > n - 1) g = 2 * (n - 1) - g; s += src[Math.max(0, Math.min(n - 1, g)) * 3 + c] * w[k + R]; } out[f * 3 + c] = s / ws; } return out; }
function steady(src0, n, sLo, sHi, vRef) {
  if (n < 7) return src0;
  const src = median5(src0, n), H = gauss(src, n, sHi), L = gauss(src, n, sLo), out = new Float32Array(src.length);
  for (let f = 0; f < n; f++) { const a = Math.max(0, f - 1), b = Math.min(n - 1, f + 1), v = Math.hypot(H[b * 3] - H[a * 3], H[b * 3 + 1] - H[a * 3 + 1], H[b * 3 + 2] - H[a * 3 + 2]) / (b - a), t = Math.min(1, v / vRef);
    for (let c = 0; c < 3; c++) out[f * 3 + c] = H[f * 3 + c] + (L[f * 3 + c] - H[f * 3 + c]) * t; }
  return out;
}
const ARMJ = /^[lr](wri|elb|hand)$/, _steady = new WeakMap();
function steadyTracks(c) {
  if (_steady.has(c)) return _steady.get(c);
  // the racket arm keeps its whip; the free arm, whose tracking is the noisier (it crosses the body and is often
  // hidden behind it) and whose exact path matters less, is smoothed harder
  const n = c.J.pelvis.length / 3, out = {}, offSide = c.hand === 'L' ? 'r' : 'l';
  for (const k in c.J) out[k] = ARMJ.test(k) ? (k[0] === offSide ? steady(c.J[k], n, 2.2, 4.0, 0.25) : steady(c.J[k], n, 1.0, 3.0, 0.12)) : steady(c.J[k], n, 2.0, 3.5, 0.05);
  _steady.set(c, out); return out;
}

// Tracking loses an arm, or swaps or squeezes the shoulders, for a few frames where an arm crosses the face or the body
// (most of all in the serve, just before contact). Those frames are found by what no body can do: a shoulder line that
// turns or narrows faster than a trunk can, an upper arm or forearm that swings further in a frame than an arm swings.
// A glitch is usually a jump in, a few consistently wrong frames and a jump out, so everything between two such jumps
// close together is taken as wrong too. The wrong stretch is rebuilt from the good frames either side (smoothly, at the
// speeds it had going in and coming out), the shoulders against the hips and each elbow and wrist against the joint above
// it, so the bones keep their length.
const RPR = { sh: 16, up: 30, fo: 34 }, RPR_SRV = { sh: 24, up: 44, fo: 50 };
function repairClip(F, n, fps, serve) {
  if (n < 8) return 0;
  const L = serve ? RPR_SRV : RPR, per = 60 / fps;                     // limits are per 1/60 s
  const dir = (f, a, b, o) => { const x = F[f][b * 3] - F[f][a * 3], y = F[f][b * 3 + 1] - F[f][a * 3 + 1], z = F[f][b * 3 + 2] - F[f][a * 3 + 2], l = Math.hypot(x, y, z) || 1; o[0] = x / l; o[1] = y / l; o[2] = z / l; return l; };
  const A = [0, 0, 0], B = [0, 0, 0];
  const turn = (f, a, b) => { dir(f - 1, a, b, A); dir(f, a, b, B); return Math.acos(Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]))) * 57.3 / per; };
  // frames between a jump in and a jump out, or around a lone jump
  const mark = (spikes) => { const bad = new Uint8Array(n); for (let i = 0; i < spikes.length; i++) { const f = spikes[i], g = spikes[i + 1];
    if (g != null && g - f <= Math.round(12 / per)) { for (let h = f; h < g; h++) bad[h] = 1; i++; } else { bad[f] = 1; if (f > 0) bad[f - 1] = 1; } } return bad; };
  // rebuild joint j over the bad frames as its offset from `par` (the joint above it; -1 = the hips' origin)
  const rebuild = (bad, j, par, len) => { let f = 0, fixed = 0;
    while (f < n) { if (!bad[f]) { f++; continue; } let g = f; while (g + 1 < n && bad[g + 1]) g++;
      const a = f - 1, b = g + 1, off = (h, c) => F[h][j * 3 + c] - (par >= 0 ? F[h][par * 3 + c] : 0);
      // a bone of known length is turned from its direction going in to its direction coming out (along the great circle,
      // eased), never blended straight across, which could pass close to nothing and flip it
      if (len && par >= 0 && a >= 0 && b < n) {
        const da = [0, 1, 2].map(c => off(a, c)), db = [0, 1, 2].map(c => off(b, c)), la = Math.hypot(...da) || 1, lb = Math.hypot(...db) || 1;
        for (let c = 0; c < 3; c++) { da[c] /= la; db[c] /= lb; }
        const cos = Math.max(-1, Math.min(1, da[0] * db[0] + da[1] * db[1] + da[2] * db[2])), om = Math.acos(cos), so = Math.sin(om);
        for (let h = f; h <= g; h++) { const t0 = (h - a) / (b - a), t = t0 * t0 * (3 - 2 * t0), wa = so > 1e-4 ? Math.sin((1 - t) * om) / so : 1 - t, wb = so > 1e-4 ? Math.sin(t * om) / so : t;
          for (let c = 0; c < 3; c++) F[h][j * 3 + c] = F[h][par * 3 + c] + (da[c] * wa + db[c] * wb) * len; fixed++; }
        f = g + 1; continue;
      }
      for (let h = f; h <= g; h++) { const t = a < 0 ? 1 : b >= n ? 0 : (h - a) / (b - a), t2 = t * t, t3 = t2 * t;
        for (let c = 0; c < 3; c++) { let v;
          if (a < 0) v = off(b, c); else if (b >= n) v = off(a, c);
          else { const p0 = off(a, c), p1 = off(b, c), m0 = a > 0 ? (off(a, c) - off(a - 1, c)) * (b - a) : 0, m1 = b < n - 1 ? (off(b + 1, c) - off(b, c)) * (b - a) : 0;
            v = (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1; }
          F[h][j * 3 + c] = v + (par >= 0 ? F[h][par * 3 + c] : 0); }
        // (a rebuilt bone keeps its usual length)
        if (len && par >= 0) { const x = F[h][j * 3] - F[h][par * 3], y = F[h][j * 3 + 1] - F[h][par * 3 + 1], z = F[h][j * 3 + 2] - F[h][par * 3 + 2], l = Math.hypot(x, y, z);
          if (l > 1e-4) { const k = len / l; F[h][j * 3] = F[h][par * 3] + x * k; F[h][j * 3 + 1] = F[h][par * 3 + 1] + y * k; F[h][j * 3 + 2] = F[h][par * 3 + 2] + z * k; } }
        fixed++; }
      f = g + 1; }
    return fixed; };
  let fixed = 0;
  // the shoulders: turning too fast, or squeezed together
  { const w = []; for (let f = 0; f < n; f++) w.push(dir(f, J.lsho, J.rsho, A)); const med = w.slice().sort((x, y) => x - y)[n >> 1];
    const sp = []; for (let f = 1; f < n; f++) if (turn(f, J.lsho, J.rsho) > L.sh) sp.push(f);
    const bad = mark(sp); for (let f = 0; f < n; f++) if (Math.abs(w[f] - med) > 0.22 * med) bad[f] = 1;
    fixed += rebuild(bad, J.lsho, -1); rebuild(bad, J.rsho, -1); }
  // each arm: a wrong elbow throws both its segments, a wrong wrist only the forearm; and a bone that is suddenly much
  // longer or shorter than it is the rest of the stroke is the tracker guessing the depth wrong
  for (const S of ['l', 'r']) {
    const sh = J[S + 'sho'], el = J[S + 'elb'], wr = J[S + 'wri'], hd = J[S + 'hand'];
    const lu = [], lf = []; for (let f = 0; f < n; f++) { lu.push(dir(f, sh, el, A)); lf.push(dir(f, el, wr, A)); }
    const mu = lu.slice().sort((x, y) => x - y)[n >> 1], mf = lf.slice().sort((x, y) => x - y)[n >> 1];
    const spU = [], spF = []; for (let f = 1; f < n; f++) { if (turn(f, sh, el) > L.up) spU.push(f); else if (turn(f, el, wr) > L.fo) spF.push(f); }
    const bu = mark(spU), bf = mark(spF);
    for (let f = 0; f < n; f++) { if (Math.abs(lu[f] - mu) > 0.18 * mu) bu[f] = 1; else if (Math.abs(lf[f] - mf) > 0.18 * mf) bf[f] = 1; }
    // (the forearm and hand go with a rebuilt elbow, kept at the angle they had to it)
    fixed += rebuild(bu, el, sh, mu); rebuild(bu, wr, el, mf); if (hd != null) rebuild(bu, hd, wr);
    fixed += rebuild(bf, wr, el, mf); if (hd != null) rebuild(bf, hd, wr);
  }
  return fixed;
}

// A groundstroke is played over the ball, not leaning away from it: where a clip has the trunk leaning back more than a
// few degrees (the camera's angle read as lean: Nadal's backhand take-back came out 16 degrees back), the upper body is
// turned forward about the hips, most of the excess but not all, eased over a tenth of a second either way so it
// cannot pop. Serves and overheads lean back for real and are left alone.
const UPPER = ['neck', 'head', 'lsho', 'rsho', 'lelb', 'relb', 'lwri', 'rwri', 'lhand', 'rhand'];
function uprightClip(F, n, fps) {
  const lean = []; for (let f = 0; f < n; f++) { const P = F[f]; lean.push(Math.atan2(P[J.neck * 3 + 2] - P[J.pelvis * 3 + 2], P[J.neck * 3 + 1] - P[J.pelvis * 3 + 1])); }
  const lim = -4 / 57.3, keep = 0.3, corr = lean.map(a => a < lim ? (lim + (a - lim) * keep) - a : 0);
  if (!corr.some(c => c > 1e-3)) return;
  // eased in time: a gaussian of a tenth of a second over the correction
  const sig = Math.max(1, fps * 0.05), R = Math.ceil(sig * 3), sm = corr.map((_, f) => { let s = 0, w = 0; for (let k = -R; k <= R; k++) { const g = Math.min(n - 1, Math.max(0, f + k)), q = Math.exp(-k * k / (2 * sig * sig)); s += corr[g] * q; w += q; } return s / w; });
  const idx = UPPER.map(nm => J[nm]).filter(j => j != null);
  for (let f = 0; f < n; f++) { const a = sm[f]; if (Math.abs(a) < 1e-4) continue; const c = Math.cos(a), s = Math.sin(a), P = F[f], py = P[J.pelvis * 3 + 1], pz = P[J.pelvis * 3 + 2];
    for (const j of idx) { const y = P[j * 3 + 1] - py, z = P[j * 3 + 2] - pz; P[j * 3 + 1] = py + y * c - z * s; P[j * 3 + 2] = pz + y * s + z * c; } }
}

// Each frame's chest: middle of the shoulders, right, up, forward. Which way is forward (the plane of the shoulders and the
// spine fixes it only up to a sign) is decided once for the clip, by the way the knees bend over all its frames, and then
// kept turning smoothly from frame to frame: decided frame by frame from nearly straight knees it flipped, and anything
// rebuilt in that frame flipped with it.
function chestFrames(F, n) {
  const dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2], nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const out = []; let vote = 0;
  for (let f = 0; f < n; f++) { const a = F[f], g = j => [a[j * 3], a[j * 3 + 1], a[j * 3 + 2]], ls = g(J.lsho), rs = g(J.rsho), pel = g(J.pelvis), nk = g(J.neck);
    const up = nrm([nk[0] - pel[0], nk[1] - pel[1], nk[2] - pel[2]]); let rt = [rs[0] - ls[0], rs[1] - ls[1], rs[2] - ls[2]]; const k = dot(rt, up); rt = nrm([rt[0] - up[0] * k, rt[1] - up[1] * k, rt[2] - up[2] * k]);
    let fw = [up[1] * rt[2] - up[2] * rt[1], up[2] * rt[0] - up[0] * rt[2], up[0] * rt[1] - up[1] * rt[0]];
    if (f > 0 && dot(fw, out[f - 1].fw) < 0) { fw = fw.map(x => -x); rt = rt.map(x => -x); }
    const kf = [0, 0, 0]; for (const sd of ['l', 'r']) { const h = g(J[sd + 'hip']), kn = g(J[sd + 'knee']), an = g(J[sd + 'ankle']); for (let c = 0; c < 3; c++) kf[c] += kn[c] - (h[c] + an[c]) / 2; }
    vote += dot(fw, kf);
    out.push({ o: [(ls[0] + rs[0]) / 2, (ls[1] + rs[1]) / 2, (ls[2] + rs[2]) / 2], rt, up, fw }); }
  if (vote < 0) for (const fr of out) { fr.fw = fr.fw.map(x => -x); fr.rt = fr.rt.map(x => -x); }
  // (right is the shoulders' own right again: only forward needed the sign; right x up = backward keeps the frame proper)
  for (let f = 0; f < n; f++) { const a = F[f], d = [a[J.rsho * 3] - a[J.lsho * 3], a[J.rsho * 3 + 1] - a[J.lsho * 3 + 1], a[J.rsho * 3 + 2] - a[J.lsho * 3 + 2]]; if (dot(out[f].rt, d) < 0) out[f].rt = out[f].rt.map(x => -x); }
  return out;
}
// A forehand's free arm is in front of him from the take-back to contact: it points across at the ball, then folds in
// to the chest. One camera cannot tell in front from behind, and where the tracker put that arm behind his back
// (Djokovic's: up and back, so the game had to fold it in round his head, the hand on top of it and the elbow out) it
// is mirrored through the plane of his shoulders onto the front, where it really was. Forward is the way his knees bend.
function frontOffArm(F, n, fps, u0, lefty) {
  const off = lefty ? 'r' : 'l', S = J[off + 'sho'], arm = [J[off + 'elb'], J[off + 'wri'], J[off + 'hand']], W = J[off + 'wri'];
  const g = (a, j) => [a[j * 3], a[j * 3 + 1], a[j * 3 + 2]], dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  // forward: square to the shoulders and the spine, on the side his knees bend toward, decided once for the whole clip
  // (chestFrames). Decided frame by frame it turned round wherever his knees were straight (Djokovic's forehand from 0.4 s
  // before contact, as he rose into it; most forehands after contact): the arm truly in front was taken to be behind and
  // reflected behind his back, and where the test turned again, thrown back to the front in a frame.
  const CF = chestFrames(F, n);
  for (let f = 0; f < n; f++) {
    const u = u0 + f / fps, fade = 1 - sm((u - 0.25) / 0.3); if (fade <= 0) break;
    const a = F[f], fw = CF[f].fw;
    const sh = g(a, S), wr = g(a, W), rel = [wr[0] - sh[0], wr[1] - sh[1], wr[2] - sh[2]];
    const L = Math.hypot(a[arm[0] * 3] - sh[0], a[arm[0] * 3 + 1] - sh[1], a[arm[0] * 3 + 2] - sh[2]) + Math.hypot(wr[0] - a[arm[0] * 3], wr[1] - a[arm[0] * 3 + 1], wr[2] - a[arm[0] * 3 + 2]);
    // the hand behind the shoulders by more than a twentieth of the arm's length: the whole arm is reflected (all of it a
    // quarter of an arm back; part of it in between, so nothing jumps), which keeps its lengths
    const w = fade * sm((-dot(rel, fw) / Math.max(1e-3, L) - 0.05) / 0.2); if (w <= 0) continue;
    for (const j of arm) { const z = (a[j * 3] - sh[0]) * fw[0] + (a[j * 3 + 1] - sh[1]) * fw[1] + (a[j * 3 + 2] - sh[2]) * fw[2]; for (let c = 0; c < 3; c++) a[j * 3 + c] -= 2 * w * z * fw[c]; }
  }
}
// A two-handed backhand's hands are in front of him from the take-back to contact: by the back hip but in front of it,
// the bottom arm lying across the front of the chest. Where one camera has put them behind his shoulders (Nadal's: the
// whole take-back 20 to 40 cm behind; the game's arm then went straight through his chest to reach them), both arms are
// mirrored together through the plane of the shoulders onto the front. Only a two-hander's (his hands within a hand's
// breadth of each other at contact), and only up to just after contact: a finish wraps round behind the neck.
// ...and where the free hand comes across the chest it is in front of it. The tracker, which cannot see how far in front of
// him a hand is, put Djokovic's left hand at his right shoulder after contact, level with his shoulders, which is inside his
// chest, for half a second (and others' for a few frames as the hand comes in to the body). The game pushed it out of the
// trunk again every frame, and the elbow, kept clear of the body, swung round to the other side of the arm to follow it: the
// free arm flicked through fifty degrees in a frame. After contact a hand between his shoulders is kept a hand's thickness in
// front of the chest (the shoulders' plane and 16 cm), eased in as it comes across, and the elbow nearly as far, so the forearm
// keeps its line. (Not before contact: Alcaraz tucks his left fist in hard against the front of his shoulder as he hits, and
// pushed out from there the elbow folded thirty degrees in a frame.)
function freeHandInFront(F, n, fps, u0, lefty) {
  const CF = chestFrames(F, n), off = lefty ? 'r' : 'l', S = J[off + 'sho'], E = J[off + 'elb'], hs = lefty ? -1 : 1, Z0 = 0.16;
  const dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  const P = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    const u = u0 + f / fps, wu = sm((u - 0.02) / 0.1) * (1 - sm((u - 0.6) / 0.2)); if (wu <= 0) continue;
    const a = F[f], fr = CF[f], d = [a[J[off + 'wri'] * 3] - a[S * 3], a[J[off + 'wri'] * 3 + 1] - a[S * 3 + 1], a[J[off + 'wri'] * 3 + 2] - a[S * 3 + 2]];
    const x = dot(d, fr.rt) * hs, z = dot(d, fr.fw), across = sm((x - 0.02) / 0.1) * (1 - sm((x - 0.55) / 0.12)), def = Z0 - z;
    P[f] = wu * across * 0.5 * (def + Math.sqrt(def * def + 0.0016));
  }
  // (the push is spread over the frames around it and eased: worked out frame by frame, a hand sweeping in across the chest
  // in a few frames, Alcaraz's just before contact, was shoved out fifteen centimetres within two)
  const R = Math.round(0.07 * fps), M = P.map((_, f) => { let m = 0; for (let k = -R; k <= R; k++) m = Math.max(m, P[Math.min(n - 1, Math.max(0, f + k))]); return m; });
  const sg = 0.05 * fps, G = Math.ceil(3 * sg), Q = M.map((_, f) => { let a = 0, w = 0; for (let k = -G; k <= G; k++) { const e = Math.exp(-k * k / (2 * sg * sg)); a += M[Math.min(n - 1, Math.max(0, f + k))] * e; w += e; } return a / w; });
  for (let f = 0; f < n; f++) { const push = Q[f], a = F[f], fr = CF[f]; if (push < 1e-4) continue;
    for (const [j, k] of [[J[off + 'wri'], 1], [J[off + 'hand'], 1], [E, 0.8]]) for (let c = 0; c < 3; c++) a[j * 3 + c] += fr.fw[c] * push * k; }
}
// The racket hand in a forehand's finish, too, is not behind his back at the height of his shoulders. Agassi's clip, which
// ends a third of a second after contact and is held there, has his racket hand coming across toward his left shoulder as it
// should but a third of a metre behind the shoulders' plane (the footage has it by his left ear): held there, the game found
// the forearm cut through his neck and pulled the wrist onto the shoulder, and the elbow, the arm folded shut, swung round in
// a frame. After contact the hand is kept no more than 8 cm behind the shoulders' plane, and further only as it goes up over
// the shoulder (Nadal's lasso finish takes it up and back over his head, where it may be a quarter of a metre behind);
// spread and eased over the frames around, the elbow most of the way with it.
function hitHandFinish(F, n, fps, u0, lefty) {
  const CF = chestFrames(F, n), hs = lefty ? 'l' : 'r', S = J[hs + 'sho'], W = J[hs + 'wri'];
  const dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2], P = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    const u = u0 + f / fps, wu = sm((u - 0.05) / 0.1); if (wu <= 0) continue;
    const a = F[f], fr = CF[f], d = [a[W * 3] - a[S * 3], a[W * 3 + 1] - a[S * 3 + 1], a[W * 3 + 2] - a[S * 3 + 2]];
    const y = dot(d, fr.up), z = dot(d, fr.fw), zMin = -0.08 - 1.6 * Math.max(0, y - 0.12), def = zMin - z;
    P[f] = wu * 0.5 * (def + Math.sqrt(def * def + 0.0016));
  }
  const R = Math.round(0.07 * fps), M = P.map((_, f) => { let m = 0; for (let k = -R; k <= R; k++) m = Math.max(m, P[Math.min(n - 1, Math.max(0, f + k))]); return m; });
  const sg = 0.05 * fps, G = Math.ceil(3 * sg), Q = M.map((_, f) => { let a = 0, w = 0; for (let k = -G; k <= G; k++) { const e = Math.exp(-k * k / (2 * sg * sg)); a += M[Math.min(n - 1, Math.max(0, f + k))] * e; w += e; } return a / w; });
  for (let f = 0; f < n; f++) { const push = Q[f], a = F[f], fr = CF[f]; if (push < 1e-4) continue;
    for (const [j, k] of [[W, 1], [J[hs + 'hand'], 1], [J[hs + 'elb'], 0.7]]) for (let c = 0; c < 3; c++) a[j * 3 + c] += fr.fw[c] * push * k; }
}
// ...and with both hands on the racket, the grip crossing the middle of the body is in front of the chest, never in it: the
// trackers put Connors' and Nadal's (and some of Alcaraz's and Sinner's) a few centimetres off the shoulders' plane, or behind
// it, as the racket came through and round. The game pushed both hands out of the chest frame by frame, up to ten centimetres a
// frame, and both arms flicked fifty degrees. Across the middle, from the take-back to the finish, the grip is kept 22 cm in
// front of the shoulders' plane (less as it rises past the chin, where the head is, and not at all off to the sides), the push
// spread and eased over the frames around it; the elbows go most of the way with the hands.
function twoHandsInFront(F, n, fps, u0) {
  const CF = chestFrames(F, n), dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2], P = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    const u = u0 + f / fps, wu = sm((u + 0.5) / 0.12) * (1 - sm((u - 0.6) / 0.15)); if (wu <= 0) continue;
    const a = F[f], fr = CF[f], mid = [0, 1, 2].map(c => (a[J.lsho * 3 + c] + a[J.rsho * 3 + c]) / 2), hm = [0, 1, 2].map(c => (a[J.lwri * 3 + c] + a[J.rwri * 3 + c]) / 2 - mid[c]);
    const x = dot(hm, fr.rt), y = dot(hm, fr.up), z = dot(hm, fr.fw);
    const across = 1 - sm((Math.abs(x) - 0.22) / 0.12), band = sm((y + 0.65) / 0.12) * (1 - sm((y - 0.2) / 0.15)), Z0 = 0.22 - 0.08 * sm((y - 0.05) / 0.15), def = Z0 - z;
    P[f] = wu * across * band * 0.5 * (def + Math.sqrt(def * def + 0.0016));
  }
  const R = Math.round(0.07 * fps), M = P.map((_, f) => { let m = 0; for (let k = -R; k <= R; k++) m = Math.max(m, P[Math.min(n - 1, Math.max(0, f + k))]); return m; });
  const sg = 0.05 * fps, G = Math.ceil(3 * sg), Q = M.map((_, f) => { let a = 0, w = 0; for (let k = -G; k <= G; k++) { const e = Math.exp(-k * k / (2 * sg * sg)); a += M[Math.min(n - 1, Math.max(0, f + k))] * e; w += e; } return a / w; });
  for (let f = 0; f < n; f++) { const push = Q[f], a = F[f], fr = CF[f]; if (push < 1e-4) continue;
    for (const [j, k] of [[J.lwri, 1], [J.rwri, 1], [J.lhand, 1], [J.rhand, 1], [J.lelb, 0.7], [J.relb, 0.7]]) for (let c = 0; c < 3; c++) a[j * 3 + c] += fr.fw[c] * push * k; }
}
function frontTwoHands(F, n, fps, u0) {
  const g = (a, j) => [a[j * 3], a[j * 3 + 1], a[j * 3 + 2]], dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const f0 = Math.max(0, Math.min(n - 1, Math.round(-u0 * fps))), a0 = F[f0];
  if (Math.hypot(...[0, 1, 2].map(c => a0[J.lwri * 3 + c] - a0[J.rwri * 3 + c])) > 0.2) return false;
  const arms = ['lelb', 'lwri', 'lhand', 'relb', 'rwri', 'rhand'].map(k => J[k]);
  // (forward decided once for the whole clip, as for the forehand's free arm above)
  const CF = chestFrames(F, n);
  for (let f = 0; f < n; f++) {
    // (eased out over the finish rather than stopped: stopped dead a moment after contact with the grip still behind
    // him, the arms snapped back through the body in one frame)
    const u = u0 + f / fps, fade = 1 - sm((u - 0.1) / 0.35); if (fade <= 0) break;
    const a = F[f], ls = g(a, J.lsho), rs = g(a, J.rsho), mid = [(ls[0] + rs[0]) / 2, (ls[1] + rs[1]) / 2, (ls[2] + rs[2]) / 2], fw = CF[f].fw;
    const hm = [(a[J.lwri * 3] + a[J.rwri * 3]) / 2 - mid[0], (a[J.lwri * 3 + 1] + a[J.rwri * 3 + 1]) / 2 - mid[1], (a[J.lwri * 3 + 2] + a[J.rwri * 3 + 2]) / 2 - mid[2]];
    const w = fade * sm((-dot(hm, fw) + 0.02) / 0.15); if (w <= 0) continue;
    for (const j of arms) { const z = (a[j * 3] - mid[0]) * fw[0] + (a[j * 3 + 1] - mid[1]) * fw[1] + (a[j * 3 + 2] - mid[2]) * fw[2]; if (z >= 0) continue; for (let c = 0; c < 3; c++) a[j * 3 + c] -= 2 * w * z * fw[c]; }
  }
  return true;
}
// A joint of the arm that leaves the line through the frames either side of it by more than 8 cm, and comes straight back,
// is the tracker losing it for a frame (a hand behind the body, a ball across the wrist), not the arm moving: it is put
// back between its neighbours. (A real swing, even at contact, bends its path far less than that within a frame.)
function despikeArms(F, n) {
  const js = ['lelb', 'lwri', 'lhand', 'relb', 'rwri', 'rhand'].map(k => J[k]);
  for (let pass = 0; pass < 2; pass++) for (let f = 1; f < n - 1; f++) for (const j of js) {
    const a = F[f - 1], b = F[f], c = F[f + 1];
    const mx = (a[j * 3] + c[j * 3]) / 2, my = (a[j * 3 + 1] + c[j * 3 + 1]) / 2, mz = (a[j * 3 + 2] + c[j * 3 + 2]) / 2;
    const dev = Math.hypot(b[j * 3] - mx, b[j * 3 + 1] - my, b[j * 3 + 2] - mz), span = Math.hypot(c[j * 3] - a[j * 3], c[j * 3 + 1] - a[j * 3 + 1], c[j * 3 + 2] - a[j * 3 + 2]);
    if (dev > 0.08 && dev > span * 0.9) { b[j * 3] = mx; b[j * 3 + 1] = my; b[j * 3 + 2] = mz; }
  }
}
// Where the tracker lost the hands as they crossed in front of him and picked them up again on the other side (Nadal's
// backhand: both arms a metre across in one frame, 0.12 s after contact), the frames between are made again: the arms go
// round the front of the body from where they were to where they are found, over about a fifth of a second, as hands do
// in a finish. (Taken about the middle of the shoulders, in each frame's own chest, angle and distance and height eased
// across; the angle passes through "in front", never round the back.)
function bridgeArmJumps(F, n, fps) {
  const js = ['lelb', 'lwri', 'lhand', 'relb', 'rwri', 'rhand'].map(k => J[k]), K = Math.max(3, Math.round(0.1 * fps));
  const dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2], nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const CF = chestFrames(F, n), frame = a => CF[F.indexOf(a)];
  const toL = (fr, p) => { const d = [p[0] - fr.o[0], p[1] - fr.o[1], p[2] - fr.o[2]], x = dot(d, fr.rt), z = dot(d, fr.fw); return { th: Math.atan2(x, z), r: Math.hypot(x, z), y: dot(d, fr.up) }; };
  for (let f = 1; f < n; f++) {
    let jump = 0; for (const j of [J.lwri, J.rwri]) jump = Math.max(jump, Math.hypot(F[f][j * 3] - F[f - 1][j * 3], F[f][j * 3 + 1] - F[f - 1][j * 3 + 1], F[f][j * 3 + 2] - F[f - 1][j * 3 + 2]));
    if (jump < 0.3) continue;
    const a0 = Math.max(0, f - K), b0 = Math.min(n - 1, f + K - 1); if (b0 - a0 < 2) continue;
    const FA = frame(F[a0]), FB = frame(F[b0]);
    const ends = js.map(j => ({ j, A: toL(FA, [F[a0][j * 3], F[a0][j * 3 + 1], F[a0][j * 3 + 2]]), B: toL(FB, [F[b0][j * 3], F[b0][j * 3 + 1], F[b0][j * 3 + 2]]) }));
    for (let g = a0 + 1; g < b0; g++) { const t = (g - a0) / (b0 - a0), e = t * t * (3 - 2 * t), Fr = frame(F[g]);
      for (const { j, A, B } of ends) { const th = A.th + (B.th - A.th) * e, r = A.r + (B.r - A.r) * e, y = A.y + (B.y - A.y) * e, x = Math.sin(th) * r, z = Math.cos(th) * r;
        for (let c = 0; c < 3; c++) F[g][j * 3 + c] = Fr.o[c] + Fr.rt[c] * x + Fr.up[c] * y + Fr.fw[c] * z; } }
    f = b0;
  }
}
// A serve's racket arm the tracker lost for a moment before the swing and caught up with in two or three frames (McEnroe's,
// as his hands part from their place together at the start: the wrist across his body, forty-five centimetres, in three
// frames, nine metres a second where the rest of his wind-up moves at one or two): over the stretch round the jump the arm
// keeps the path it was tracked along but is taken along it at an even pace, in the chest's own frame. (Nothing is invented:
// the arm goes through the same places, only not most of the way in one frame.)
function evenServeArm(F, n, fps, u0, lefty) {
  const s = lefty ? 'l' : 'r', js = ['elb', 'wri', 'hand'].map(k => J[s + k]), W = J[s + 'wri'], CF = chestFrames(F, n);
  const dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2], last = Math.min(n - 1, Math.floor((-0.58 - u0) * fps));
  for (let f = 1; f <= last; f++) {
    const sp = Math.hypot(F[f][W * 3] - F[f - 1][W * 3], F[f][W * 3 + 1] - F[f - 1][W * 3 + 1], F[f][W * 3 + 2] - F[f - 1][W * 3 + 2]);
    if (sp < 0.15) continue;
    let e = f; while (e + 1 <= last && Math.hypot(F[e + 1][W * 3] - F[e][W * 3], F[e + 1][W * 3 + 1] - F[e][W * 3 + 1], F[e + 1][W * 3 + 2] - F[e][W * 3 + 2]) > 0.08) e++;
    const a0 = Math.max(0, f - Math.round(0.12 * fps)), b0 = Math.min(last, e + Math.round(0.08 * fps)); if (b0 - a0 < 4) { f = e; continue; }
    const loc = []; for (let g = a0; g <= b0; g++) { const fr = CF[g]; loc.push(js.map(j => { const d = [F[g][j * 3] - fr.o[0], F[g][j * 3 + 1] - fr.o[1], F[g][j * 3 + 2] - fr.o[2]]; return [dot(d, fr.rt), dot(d, fr.up), dot(d, fr.fw)]; })); }
    const cum = [0]; for (let k = 1; k < loc.length; k++) cum.push(cum[k - 1] + Math.hypot(loc[k][1][0] - loc[k - 1][1][0], loc[k][1][1] - loc[k - 1][1][1], loc[k][1][2] - loc[k - 1][1][2]));
    const tot = cum[cum.length - 1]; if (tot < 1e-3) { f = b0; continue; }
    for (let g = a0 + 1; g < b0; g++) { const want = tot * (g - a0) / (b0 - a0); let m = 0; while (m < cum.length - 2 && cum[m + 1] < want) m++;
      const fr0 = cum[m + 1] - cum[m] > 1e-6 ? (want - cum[m]) / (cum[m + 1] - cum[m]) : 0, Fr = CF[g];
      js.forEach((j, q) => { const A = loc[m][q], B = loc[m + 1][q], x = A[0] + (B[0] - A[0]) * fr0, y = A[1] + (B[1] - A[1]) * fr0, z = A[2] + (B[2] - A[2]) * fr0;
        for (let c = 0; c < 3; c++) F[g][j * 3 + c] = Fr.o[c] + Fr.rt[c] * x + Fr.up[c] * y + Fr.fw[c] * z; }); }
    f = b0;
  }
}
// A racket arm the tracker folded flat in the wind-up, the forearm laid back along the upper arm (bent past 150 degrees,
// which no elbow does): Djokovic's forehand as the racket crosses his chest in the turn, the wrist put four centimetres
// from the shoulder. The game opens a fold too tight in the plane of the arm's own bend, and a forearm laid straight back
// has none: the wrist flipped from below the shoulder to above it within two frames, and the racket it carries swung round
// over his head. Over the fold (out to where the elbow is bent less than 130 degrees again) the arm is made again from
// its two ends, as an arm moves: the upper arm turned from the one way to the other, the elbow's bend and the way the
// forearm turns about the upper arm eased across, all in the chest's own frame. (Each joint carried round the chest on its
// own, the elbow and the wrist took different ways round and the arm folded flat again half way.)
function bridgeFoldedArm(F, n, fps, u0, lefty) {
  const s = lefty ? 'l' : 'r', S = J[s + 'sho'], E = J[s + 'elb'], W = J[s + 'wri'], H = J[s + 'hand'];
  const dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2], len = v => Math.hypot(v[0], v[1], v[2]);
  const nrm = v => { const l = len(v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }, cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const at = (f, j) => [F[f][j * 3], F[f][j * 3 + 1], F[f][j * 3 + 2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const bend = f => { const ud = sub(at(f, E), at(f, S)), fd = sub(at(f, W), at(f, E)); return dot(ud, fd) / (len(ud) * len(fd) || 1); };
  let CF = null;
  const loc = (fr, v) => [dot(v, fr.rt), dot(v, fr.up), dot(v, fr.fw)];
  // the way the forearm turns about the upper arm, measured from the chest's up (its forward where the upper arm is upright)
  const basis = U => { const r0 = Math.abs(U[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0], k = dot(r0, U), ref = nrm([r0[0] - U[0] * k, r0[1] - U[1] * k, r0[2] - U[2] * k]); return [ref, cross(U, ref)]; };
  const ends = f => { const fr = CF[f], ud = loc(fr, sub(at(f, E), at(f, S))), fd = loc(fr, sub(at(f, W), at(f, E))), U = nrm(ud), Fd = nrm(fd), [ref, side] = basis(U);
    return { U, lu: len(ud), lf: len(fd), lh: len(sub(at(f, H), at(f, W))), th: Math.acos(Math.max(-1, Math.min(1, dot(U, Fd)))), ph: Math.atan2(dot(Fd, side), dot(Fd, ref)) }; };
  for (let f = 0; f < n && u0 + f / fps < -0.05; f++) {
    if (bend(f) > -0.87) continue;
    let a0 = f, b0 = f; while (a0 > 0 && bend(a0) < -0.64) a0--; while (b0 < n - 1 && bend(b0) < -0.64) b0++;
    a0 = Math.max(0, a0 - 2); b0 = Math.min(n - 1, b0 + 2);
    if (b0 - a0 < 3) { f = b0; continue; }
    CF = CF || chestFrames(F, n);
    const A = ends(a0), B = ends(b0), om = Math.acos(Math.max(-1, Math.min(1, dot(A.U, B.U))));
    const Ue = e => { if (om < 1e-3) return A.U; const sa = Math.sin((1 - e) * om) / Math.sin(om), sb = Math.sin(e * om) / Math.sin(om); return nrm([A.U[0] * sa + B.U[0] * sb, A.U[1] * sa + B.U[1] * sb, A.U[2] * sa + B.U[2] * sb]); };
    const fore = (U, th, ph) => { const [ref, side] = basis(U); return [0, 1, 2].map(c => U[c] * Math.cos(th) + (ref[c] * Math.cos(ph) + side[c] * Math.sin(ph)) * Math.sin(th)); };
    // (the forearm turns about the upper arm whichever way round keeps the hand in front of him: the shorter way took Djokovic's
    // round behind his back)
    let dph = Math.atan2(Math.sin(B.ph - A.ph), Math.cos(B.ph - A.ph)); const alt = dph - Math.sign(dph || 1) * 2 * Math.PI;
    { let fA = 0, fB = 0; for (const e of [0.25, 0.5, 0.75]) { const U = Ue(e), th = A.th + (B.th - A.th) * e;
        fA += U[2] * A.lu + fore(U, th, A.ph + dph * e)[2] * A.lf; fB += U[2] * A.lu + fore(U, th, A.ph + alt * e)[2] * A.lf; }
      if (fB > fA + 0.05) dph = alt; }
    for (let g = a0 + 1; g < b0; g++) {
      const t = (g - a0) / (b0 - a0), e = t * t * (3 - 2 * t), fr = CF[g], U = Ue(e);
      const th = A.th + (B.th - A.th) * e, Fd = fore(U, th, A.ph + dph * e);
      const lu = A.lu + (B.lu - A.lu) * e, lf = A.lf + (B.lf - A.lf) * e, lh = A.lh + (B.lh - A.lh) * e, sh = at(g, S);
      const put = (j, l) => { for (let c = 0; c < 3; c++) F[g][j * 3 + c] = sh[c] + fr.rt[c] * l[0] + fr.up[c] * l[1] + fr.fw[c] * l[2]; };
      const el = U.map(x => x * lu), wr = el.map((x, c) => x + Fd[c] * lf), hd = wr.map((x, c) => x + Fd[c] * lh);
      put(E, el); put(W, wr); put(H, hd);
    }
    f = b0;
  }
}
// A one-handed backhand's racket arm crosses the body IN FRONT of the chest on the way back (the racket over the other
// shoulder, the free hand on its throat). One camera behind him put McEnroe's behind his back instead: from behind, his
// forearm lay across the small of his back. The racket arm alone is mirrored through the plane of the shoulders where its
// hand is behind it, up to contact and fading out after (his free arm goes back behind him in the finish, as it should).
function frontOneHand(F, n, fps, u0, lefty) {
  const CF = chestFrames(F, n), hs = lefty ? 'l' : 'r', arm = ['elb', 'wri', 'hand'].map(k => J[hs + k]), W = J[hs + 'wri'];
  const dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  for (let f = 0; f < n; f++) {
    const u = u0 + f / fps, fade = 1 - sm((u - 0.05) / 0.3); if (fade <= 0) break;
    const a = F[f], fr = CF[f], rel = [a[W * 3] - fr.o[0], a[W * 3 + 1] - fr.o[1], a[W * 3 + 2] - fr.o[2]];
    const w = fade * sm((-dot(rel, fr.fw) + 0.02) / 0.15); if (w <= 0) continue;
    for (const j of arm) { const z = (a[j * 3] - fr.o[0]) * fr.fw[0] + (a[j * 3 + 1] - fr.o[1]) * fr.fw[1] + (a[j * 3 + 2] - fr.o[2]) * fr.fw[2]; if (z >= 0) continue; for (let c = 0; c < 3; c++) a[j * 3 + c] -= 2 * w * z * fr.fw[c]; }
  }
}
const _strokes = new Map();
export function strokeClip(lib, name, key, lefty) {
  const id = name + '/' + key + '/' + (lefty ? 'L' : 'R'); if (_strokes.has(id)) return _strokes.get(id);
  const c = (lib[name] && lib[name][key]) || (lib._pooled && lib._pooled[key]) || null; let out = null;
  if (c && c.J && c.J.pelvis) {
    const n = c.J.pelvis.length / 3, flip = (c.hand === 'L') !== !!lefty, F = [], TJ = steadyTracks(c);
    for (let f = 0; f < n; f++) {
      const a = new Float32Array(N3), px = TJ.pelvis[f * 3], pz = TJ.pelvis[f * 3 + 2];
      for (let j = 0; j < NJ; j++) {
        let nm = JOINTS[j]; if (flip && (nm[0] === 'l' || nm[0] === 'r') && J[(nm[0] === 'l' ? 'r' : 'l') + nm.slice(1)] != null) nm = (nm[0] === 'l' ? 'r' : 'l') + nm.slice(1);
        const src = TJ[nm] || TJ[nm === 'ltoe' ? 'lankle' : nm === 'rtoe' ? 'rankle' : nm === 'lhand' ? 'lwri' : nm === 'rhand' ? 'rwri' : 'pelvis'];
        a[j * 3] = (src[f * 3] - px) * (flip ? -1 : 1); a[j * 3 + 1] = src[f * 3 + 1]; a[j * 3 + 2] = src[f * 3 + 2] - pz;
      }
      F.push(a);
    }
    // two passes: rebuilding one joint can show up the next glitch along the arm
    for (let pass = 0; pass < 2; pass++) if (!repairClip(F, n, c.fps || 60, key === 'serve' || key === 'smash')) break;
    if (key !== 'serve' && key !== 'smash') { uprightClip(F, n, c.fps || 60); bridgeFoldedArm(F, n, c.fps || 60, c.u0 || 0, lefty); }
    if (key === 'serve' && !globalThis.__srvPaceOld) evenServeArm(F, n, c.fps || 60, c.u0 || 0, lefty);
    if (key === 'fh') { frontOffArm(F, n, c.fps || 60, c.u0 || 0, lefty); freeHandInFront(F, n, c.fps || 60, c.u0 || 0, lefty); hitHandFinish(F, n, c.fps || 60, c.u0 || 0, lefty); }
    if (key === 'bh') { if (!frontTwoHands(F, n, c.fps || 60, c.u0 || 0)) frontOneHand(F, n, c.fps || 60, c.u0 || 0, lefty); else twoHandsInFront(F, n, c.fps || 60, c.u0 || 0); }
    if (key !== 'serve' && key !== 'smash') { despikeArms(F, n); bridgeArmJumps(F, n, c.fps || 60); }
    // A groundstroke is played from the ground: where the tracking has him hanging in the air (a hop into
    // the ball, or a ground line misjudged behind the net), the whole body is brought down onto its lower foot.
    if (key !== 'serve' && key !== 'smash') {
      const lift = F.map(a => Math.max(0, Math.min(a[J.lankle * 3 + 1], a[J.rankle * 3 + 1]) - ANKLE_H));
      for (let f = 0; f < n; f++) { let d = 0, w = 0; for (let k = -2; k <= 2; k++) { const g = Math.min(n - 1, Math.max(0, f + k)); d += lift[g]; w++; } d /= w; for (let j = 0; j < NJ; j++) F[f][j * 3 + 1] -= d; }
    }
    out = { id, n, fps: c.fps || 60, u0: c.u0 || 0, F, span: [c.u0 || 0, (c.u0 || 0) + (n - 1) / (c.fps || 60)], ok: c.ok };
  }
  _strokes.set(id, out); return out;
}
// the pose `u` seconds from contact
export function sampleAt(c, u, out) {
  const x = Math.min(c.n - 1, Math.max(0, (u - c.u0) * c.fps)), i = Math.min(c.n - 2, Math.floor(x)), w = x - i, w2 = w * w, w3 = w2 * w;
  const A = c.F[Math.max(0, i - 1)], B = c.F[i], C = c.F[i + 1], D = c.F[Math.min(c.n - 1, i + 2)];
  for (let k = 0; k < N3; k++) out[k] = cr(A[k], B[k], C[k], D[k], w, w2, w3);
  return out;
}

const sm = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
// a critically damped spring toward `target` (see figure.js): the gait weights set off and settle without a kick
function ease(o, key, target, w, dt) {
  const vk = key + 'V'; const x = o[key] == null ? target : o[key], v = o[vk] || 0, d = x - target, e = Math.exp(-w * dt), k = (v + w * d) * dt;
  o[key] = target + (d + k) * e; o[vk] = (v - w * k) * e; return o[key];
}
const c01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const FWD = ['walk', 'jog', 'run', 'sprint'].map(k => CL[k]);

// One body's movement: keeps where each cycle has got to, and how much of each kind of movement
// is in the mix, so a change of direction is a change of weight and not a jump.
// Every gait is played on one clock, each clip shifted so that its left foot comes down at the same moment of the cycle.
// (The clips were filmed separately and start anywhere in their cycles: the backwards gait had its left foot down half a
// cycle from the forward run's, and the sideways shuffle ran on a clock of its own, so wherever two were blended, turning
// from backing up into a run or moving on a diagonal, a foot coming down was averaged with one in the air and the legs
// floated, both feet off the court together at a jog.)
const GAIT_OFF = new Map();
function gaitOff(c) {
  if (GAIT_OFF.has(c)) return GAIT_OFF.get(c);
  const out = new Float32Array(N3); let best = 9, at = 0;
  for (let i = 0; i < 200; i++) { sampleLoop(c, i / 200, out); const y = out[J.lankle * 3 + 1]; if (y < best) { best = y; at = i / 200; } }
  GAIT_OFF.set(c, at); return at;
}
const at = (c, ph) => globalThis.__noSync ? ph : ((ph + gaitOff(c) - gaitOff(CL.run)) % 1 + 1) % 1;
// (and the backwards gait stands on its own ground: tracked, its planted ankle is six centimetres below where every other
// gait's is, so most of its swing was taken for a foot still on the court, the foot never lifted of itself, and every
// step was a catch-up step forced on it, arced high as for a long stride: from the side he kicked each foot up behind him to
// the height of the other shin. Its feet are brought up onto the same ground, the toe only once the foot is off it, and
// its lift is then lowered: backing up is done in short low steps on the balls of the feet.)
let BACK_MIN = null;
function lowLift(P, k) {
  if (!BACK_MIN) { const o = new Float32Array(N3); BACK_MIN = [9, 9]; for (let i = 0; i < 200; i++) { sampleLoop(CL.back, i / 200, o); BACK_MIN[0] = Math.min(BACK_MIN[0], o[J.lankle * 3 + 1]); BACK_MIN[1] = Math.min(BACK_MIN[1], o[J.rankle * 3 + 1]); } }
  for (const [ja, jt, i] of [[J.lankle, J.ltoe, 0], [J.rankle, J.rtoe, 1]]) {
    const y0 = P[ja * 3 + 1], off = globalThis.__noSync ? 0 : ANKLE_H - BACK_MIN[i], sT = c01((y0 - BACK_MIN[i]) / 0.04);
    const ya = y0 + off, d = Math.max(0, ya - ANKLE_H) * (1 - k);
    P[ja * 3 + 1] = ya - d; P[jt * 3 + 1] += off * sT - d;
  }
  return P;
}
export class Loco {
  constructor() {
    this.P = new Float32Array(N3); this.A = new Float32Array(N3); this.B = new Float32Array(N3);
    this.FW = new Float32Array(N3); this.FW2 = new Float32Array(N3);   /* FW2: the same half a stride on (a left-hander's racket arm swings with the other leg) */                      // the forward gait alone (a run's arms pump; a shuffle's hang)
    this.phF = Math.random(); this.phS = Math.random();
    this.w = { go: 0, f: 1, b: 0, r: 0, l: 0, up: 0 };
  }
  // vR, vF: velocity to the body's right and the way it faces (m/s, for a 1.85 m body); upright: strolling between points
  update(dt, vR, vF, speed, upright) {
    const w = this.w;
    const a = Math.atan2(vR, vF), c = Math.cos(a), s = Math.sin(a), mv = speed > 0.12 ? 1 : 0;
    // (springs, not first-order lags: a split step's burst or a sudden change of direction changes what the legs should
    // be doing at once, and a lag would start the change at full speed in one frame)
    w.go = c01(ease(w, 'go', sm((speed - 0.15) / 0.75), 30, dt));
    // (quicker at a run: the body turns to run in a sixth of a second, and eased at the walking rate the legs went on shuffling
    // sideways under a body already turned, three or four frames of a gallop at five metres a second)
    const wr = globalThis.__gaitRateOld ? 19 : 19 + 14 * c01((speed - 2.6) / 1.2);
    w.f = c01(ease(w, 'f', mv ? Math.max(0, c) ** 2 : w.f, wr, dt)); w.b = c01(ease(w, 'b', mv ? Math.max(0, -c) ** 2 : w.b, wr, dt));
    w.r = c01(ease(w, 'r', mv ? Math.max(0, s) ** 2 : w.r, wr, dt)); w.l = c01(ease(w, 'l', mv ? Math.max(0, -s) ** 2 : w.l, wr, dt));
    // into the athletic stance quickly when a point starts; out of it slowly, as a player relaxes after one
    w.up = c01(ease(w, 'up', upright ? 1 : 0, upright ? 7 : 15, dt));   /* (up out of the crouch in about half a second once the point is over: at the slower rate he walked back to the line still half in his ready stance) */
    // the forward gait for this speed: the two measured gaits either side of it
    let i = 0; while (i < FWD.length - 2 && speed > FWD[i + 1].speed) i++;
    const fa = FWD[i], fb = FWD[i + 1], t = sm((speed - fa.speed) / (fb.speed - fa.speed)), strideF = fa.stride + (fb.stride - fa.stride) * t;
    const sum = w.f + w.b + w.r + w.l + 1e-6, side = (w.r + w.l) / sum;
    // the one cycle runs at the rate that covers the ground he is really covering: the blended pose's feet travel, in a cycle,
    // the gaits' strides averaged by how much each is played, so that is the stride (by their rates averaged instead, the short
    // shuffle's counted for too much, a diagonal run cycled too fast for the ground, and the toe pushing off slid along it)
    // Walking upright between points (or to his mark to serve) slower than the filmed walker, the steps get shorter rather than
    // quicker, as a person's do: the cycle was held to a jog's least rate of over three steps a second, which at a stroll's
    // pace is a quick shuffle of quarter-metre steps, the legs reaching for a full stride and caught by the planted feet. The
    // stride shortens with the pace (to about four-fifths at 0.8 m/s, at a person's one and a half steps a second) and the
    // legs' reach is drawn in to match it (below), so the feet still cover the ground they stand on.
    const upF = globalThis.__walkStrideOld ? 0 : c01(w.up) * w.f * (fa === CL.walk ? 1 - t : 0), kSa = globalThis.__walkKSa ?? 1, kS = 1 + (Math.min(1, Math.max(0.5, kSa + (1 - kSa) * speed / CL.walk.speed)) - 1) * upF
      // (and faster than the filmed walkers walk, longer steps, not quicker ones, as a person's are: their stride, a little over a
      // metre and a fifth at a metre and a seventh a second, played at the game's walk of nearly a metre and a half a second was a
      // march of a hundred and thirty steps a minute)
      + (globalThis.__walkLongOld ? 0 : (Math.min(1.25, Math.pow(Math.max(1, speed / CL.walk.speed), 0.6)) - 1) * upF);
    const strideM = (w.f * strideF * kS + w.b * CL.back.stride + (w.r + w.l) * CL.shuffleR.stride) / sum, rateF = speed / Math.max(0.3, strideM);
    if (globalThis.__noSync) { this.phF = (this.phF + dt * Math.min(3.2, speed * ((w.f / strideF) + (w.b / CL.back.stride)) / Math.max(1e-6, w.f + w.b))) % 1; this.phS = (this.phS + dt * Math.min(3.4, speed / CL.shuffleR.stride)) % 1; }
    // (and never slower than a little over three steps a second while he is moving at all: slowing in proportion to his speed,
    // the cycle all but stopped as he pulled up, with a foot caught in the air half way through a step, held there floating
    // while he stopped under it; a player pulling up takes quick short steps)
    else { const rMin = globalThis.__noMinRate ? 0 : 1.6 * c01((speed - 0.3) / 0.5) * (1 - upF) + 0.6 * c01((speed - 0.1) / 0.3) * upF; this.phF = (this.phF + dt * Math.min(3.3, Math.max(rateF, rMin))) % 1; this.phS = this.phF; }
    const P = this.P, A = this.A, B = this.B;
    // standing: low and ready in a point, upright between points
    sampleLoop(CL.ready, 0, P); if (w.up > 0.001) mix(P, sampleLoop(CL.stand, 0, B), w.up);
    if (w.go > 0.001) {
      const ph = this.phF;
      sampleLoop(fa, at(fa, ph), A); if (t > 0.001) mix(A, sampleLoop(fb, at(fb, ph), B), t);
      if (w.up > 0.001 && fa !== CL.walk) mix(A, sampleLoop(CL.walk, at(CL.walk, ph), B), w.up * 0.7);
      if (kS < 0.999 || kS > 1.001) for (const j of [J.lknee, J.rknee, J.lankle, J.rankle, J.ltoe, J.rtoe]) A[j * 3 + 2] *= kS;
      this.FW.set(A);
      if (!globalThis.__strollClipOld && w.up > 0.3) { const p2 = (ph + 0.5) % 1; sampleLoop(fa, at(fa, p2), this.FW2); if (t > 0.001) mix(this.FW2, sampleLoop(fb, at(fb, p2), B), t); }
      let acc = w.f;
      if (w.b > 0.001) { acc += w.b; mix(A, lowLift(sampleLoop(CL.back, at(CL.back, ph), B), globalThis.__backLift ?? 0.7), w.b / acc); }
      const phS = globalThis.__noSync ? this.phS : ph;
      if (w.r > 0.001) { acc += w.r; mix(A, sampleLoop(CL.shuffleR, at(CL.shuffleR, phS), B), w.r / acc); }
      if (w.l > 0.001) { acc += w.l; mix(A, sampleLoop(CL.shuffleL, at(CL.shuffleL, phS), B), w.l / acc); }
      mix(P, A, w.go);
      // Slow steps are low. The gaits were filmed at a jog and faster and keep their height whatever the pace: played at a
      // shuffle or while pulling up, both feet were off the court together for half of every step, and blended, a foot coming
      // down averaged with one in the air was down in neither. Below about three metres a second the feet are lifted less,
      // to under half at a walk, so one of them is always on the court.
      // (but not the walk itself, filmed at a walk: lowered, the stroll to the line was a shuffle with the feet scraping the court)
      const kL = globalThis.__noLow ? 1 : 1 - (1 - c01(0.45 + 0.55 * (speed - 0.8) / 2.4)) * w.go * (1 - upF);
      if (kL < 0.999) for (const [ja, jt] of [[J.lankle, J.ltoe], [J.rankle, J.rtoe]]) { const y = P[ja * 3 + 1]; if (y > ANKLE_H) { const d = (y - ANKLE_H) * (1 - kL); P[ja * 3 + 1] -= d; P[jt * 3 + 1] -= d; } }
    }
    this.side = side;
    return P;
  }
}
