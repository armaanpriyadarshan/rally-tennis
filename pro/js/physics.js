// Rally Pro — ball flight, bounce and the launch solver. Pure logic: no DOM, no three.js,
// so the same file runs in the browser and in the Node calibration harness.
//
// World frame (metres): x across the court, y up, z along it. The net stands on z = 0.
// Player 0 defends +z and hits toward -z; player 1 is the mirror image.

export const COURT = {
  halfLen: 11.885,        // baseline
  halfW: 4.115,           // singles sideline
  halfWD: 5.485,          // doubles sideline
  svc: 6.40,              // service line, from the net
  netH: 0.914,            // at the centre strap
  postH: 1.07,            // at the singles sticks / posts
  postX: 5.03,            // singles sticks: 0.914 m outside the singles line
  line: 0.05,             // line width; the baseline is drawn 0.10
  baseLine: 0.10,
};
export const BALL = { r: 0.0335, m: 0.0577 };
export const G = 9.81;
const AREA = Math.PI * BALL.r * BALL.r;
const INERTIA = 0.55;                    // I = 0.55·m·r² for a pressurised hollow ball (Cross)
export const RPM = Math.PI / 30;         // rpm → rad/s

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// ---- seedable randomness: the harness needs repeatable matches ----
export function makeRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  const u = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const g = () => { let a = 0, b = 0; while (a === 0) a = u(); b = u(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); };
  return { u, g, range: (a, b) => a + (b - a) * u(), pick: arr => arr[Math.floor(u() * arr.length)] };
}

// The net sags to 0.914 at the strap and rises linearly to 1.07 at the sticks.
export function netHeightAt(x) {
  return COURT.netH + (COURT.postH - COURT.netH) * Math.min(1, Math.abs(x) / COURT.postX);
}

// ---- playing conditions ----
// Surfaces are two numbers, as in the ITF court pace test: sliding friction and the
// vertical coefficient of restitution. Court Pace Rating = 100(1-mu) + 150(0.81-e).
export const SURFACES = {
  // `plow` is what a biting ball loses to the surface itself: loose clay gives way under it
  hard:  { name: 'Hard',  mu: 0.64, e: 0.790, noise: 0.000, lineMu: 0.60, plow: 0.025 },
  clay:  { name: 'Clay',  mu: 0.76, e: 0.845, noise: 0.006, lineMu: 0.48, plow: 0.085 },   // the tape is slick: a ball off the line skids
  grass: { name: 'Grass', mu: 0.56, e: 0.740, noise: 0.012, lineMu: 0.50, plow: 0.000 },
};

// Build an environment from venue facts. `pace` shifts the surface around its family
// default (positive = quicker court). Air density follows altitude and temperature,
// which is the whole reason the ball flies in Madrid.
export function makeEnv(o = {}) {
  const base = SURFACES[o.surface || 'hard'];
  const pace = o.pace || 0;                      // in CPR points relative to the family default
  const surf = { ...base, mu: clamp(base.mu - pace * 0.0065, 0.42, 0.9), e: clamp(base.e - pace * 0.0023, 0.66, 0.9), key: o.surface || 'hard' };
  const alt = o.altitude || 0, tempC = o.tempC == null ? 22 : o.tempC, hum = o.humidity == null ? 0.5 : o.humidity;
  // dry-air density with a small humidity correction (humid air is lighter)
  const rho = 1.225 * Math.exp(-alt / 8400) * (288.15 / (273.15 + tempC)) * (1 - 0.012 * hum * Math.exp((tempC - 15) / 16));
  return {
    surf, rho, tempC, alt, indoor: !!o.indoor,
    k: rho * AREA / (2 * BALL.m),               // multiplies Cd·v² and Cl·v²
    windBase: { x: o.windX || 0, z: o.windZ || 0 },
    gust: o.indoor ? 0 : (o.gust == null ? 0.35 : o.gust),
    wind: { x: o.windX || 0, z: o.windZ || 0 },
    windT: 0,
    flip: 1,                                     // -1 once the players have changed ends
    // a warm ball is livelier: about 0.5% of rebound per degree around 22 C
    ballLive: 1 + (tempC - 22) * 0.0022,
  };
}
// Slow gusting: two incommensurate sines per axis are plenty to make the wind feel alive
// without it ever being unfair inside one rally.
export function stepWind(env, dt) {
  if (env.indoor) { env.wind.x = env.wind.z = 0; return; }
  env.windT += dt;
  const t = env.windT, g = env.gust, b = env.windBase, m = Math.hypot(b.x, b.z);
  const a = 1 + g * (0.6 * Math.sin(t * 0.37) + 0.4 * Math.sin(t * 0.83 + 1.7));
  const sw = g * m * 0.5 * Math.sin(t * 0.21 + 0.6);
  env.wind.x = env.flip * (b.x * a + (m ? -b.z / m : 0) * sw);
  env.wind.z = env.flip * (b.z * a + (m ? b.x / m : 0) * sw);
}

// ---- flight ----
export function makeBall() { return { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0 }; }
export function copyBall(a, b) { b = b || {}; b.x = a.x; b.y = a.y; b.z = a.z; b.vx = a.vx; b.vy = a.vy; b.vz = a.vz; b.wx = a.wx; b.wy = a.wy; b.wz = a.wz; return b; }

// One step of free flight: gravity, quadratic drag against the moving air, and Magnus lift.
// Cl = 1/(2 + v/v_spin) is the standard fit for a tennis ball (Cross & Lindsey); drag
// rises a little with spin because a spinning ball's felt stands up.
export function flyStep(b, dt, env) {
  const rvx = b.vx - env.wind.x, rvz = b.vz - env.wind.z, rvy = b.vy;
  const v = Math.hypot(rvx, rvy, rvz);
  let ax = 0, ay = -G, az = 0;
  if (v > 1e-4) {
    const w = Math.hypot(b.wx, b.wy, b.wz), vs = BALL.r * w;
    const S = vs / v;
    const cd = 0.53 + 0.12 * Math.min(1, S * 2.2);
    const kd = env.k * cd * v;
    ax -= kd * rvx; ay -= kd * rvy; az -= kd * rvz;
    if (w > 1) {
      const cl = 1 / (2 + v / vs), km = env.k * cl * v / w;
      ax += km * (b.wy * rvz - b.wz * rvy);
      ay += km * (b.wz * rvx - b.wx * rvz);
      az += km * (b.wx * rvy - b.wy * rvx);
    }
    const sd = 1 - 0.035 * dt;                   // spin bleeds off slowly in the air
    b.wx *= sd; b.wy *= sd; b.wz *= sd;
  }
  b.vx += ax * dt; b.vy += ay * dt; b.vz += az * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
}

// Bounce off the court. The ball arrives sliding; friction mu·N acts against the motion of
// its contact patch until that patch stops (the ball "bites" and leaves rolling) or the
// bounce ends first (it skids). Fast flat balls and slices skid and stay low; loopy topspin
// bites and kicks. That one rule is the whole difference between grass and clay.
export function bounce(b, env, rng, onLine) {
  const s = env.surf;
  const vyIn = -b.vy;
  let e = s.e * env.ballLive - 0.0045 * Math.max(0, vyIn - 6);     // harder impacts lose more
  e = clamp(e, 0.5, 0.92);
  const mu = onLine ? s.lineMu : s.mu;
  // velocity of the contact patch across the surface
  const cx = b.vx + BALL.r * b.wz, cz = b.vz - BALL.r * b.wx;
  const c = Math.hypot(cx, cz);
  const gripF = 1 + 1 / INERTIA;                 // how fast the patch slows per unit of dv
  const slide = mu * (1 + e) * vyIn;             // the most friction can change v by
  let dvx = 0, dvz = 0, bit = false;
  if (c > 1e-6) {
    const need = c / gripF;
    const dv = Math.min(slide, need);
    bit = need <= slide;
    dvx = -cx / c * dv; dvz = -cz / c * dv;
  }
  b.vx += dvx; b.vz += dvz;
  b.wx += -dvz / (INERTIA * BALL.r);
  b.wz += dvx / (INERTIA * BALL.r);
  if (bit && s.plow && !onLine) { const k = 1 - s.plow; b.vx *= k; b.vz *= k; b.wx *= k; b.wz *= k; }
  b.wy *= 0.7;                                   // sidespin scrubs against the court
  b.vy = vyIn * e;
  // a clay or grass court is not a billiard table
  if (s.noise && rng) {
    const sp = Math.hypot(b.vx, b.vz);
    b.vx += rng.g() * s.noise * sp; b.vz += rng.g() * s.noise * sp * 0.5;
    b.vy *= 1 + rng.g() * s.noise * 2.2;
  }
  b.y = BALL.r;
  return { bit, e, vyIn };
}

// ---- prediction ----
// Fly a copy of the ball forward and report what happens. Used by the launch solver, by
// the AI's read of an incoming shot, and by the landing marker.
const _p = makeBall();
export function predict(b, env, o = {}) {
  const dt = o.dt || 1 / 180, maxT = o.maxT || 4, bounces = o.bounces == null ? 1 : o.bounces;
  copyBall(b, _p);
  const out = { land: null, land2: null, netY: null, netX: null, netT: null, T: 0, path: o.path ? [] : null, apex: _p.y };
  let t = 0, nb = 0, pz = _p.z, py = _p.y, px = _p.x;
  const wind0 = env.wind;                          // frozen for the look-ahead
  while (t < maxT) {
    px = _p.x; py = _p.y; pz = _p.z;
    flyStep(_p, dt, env); t += dt;
    if (_p.y > out.apex) out.apex = _p.y;
    if (out.netY == null && (pz > 0) !== (_p.z > 0) && nb === 0) {
      const f = pz / (pz - _p.z);
      out.netY = py + (_p.y - py) * f; out.netX = px + (_p.x - px) * f; out.netT = t - dt + f * dt;
    }
    if (_p.y <= BALL.r && _p.vy < 0) {
      const f = (py - BALL.r) / Math.max(1e-6, py - _p.y);
      const lx = px + (_p.x - px) * f, lz = pz + (_p.z - pz) * f;
      const sp = Math.hypot(_p.vx, _p.vz, _p.vy);
      if (nb === 0) out.land = { x: lx, z: lz, t: t - dt + f * dt, speed: sp, vy: _p.vy };
      else if (nb === 1) out.land2 = { x: lx, z: lz, t: t - dt + f * dt };
      nb++;
      if (nb > bounces) break;
      _p.x = lx; _p.z = lz;
      bounce(_p, env, null, false);
    }
    if (out.path) out.path.push(_p.x, _p.y, _p.z, t);
  }
  out.T = t; out.end = copyBall(_p);
  void wind0;
  return out;
}

// ---- the launch solver ----
// Spin for a ball leaving along horizontal heading (hx,hz): `top` rpm about the axis that
// makes it dip (negative = backspin), `side` rpm about vertical (positive curves to the
// hitter's left — a right-hander's slice).
export function spinVec(hx, hz, top, side) {
  const n = Math.hypot(hx, hz) || 1; hx /= n; hz /= n;
  // top-spin axis = y × h
  return { wx: hz * top * RPM, wy: side * RPM, wz: -hx * top * RPM };
}

function launch(p0, speed, el, az, top, side, out) {
  const ch = Math.cos(el), hx = Math.sin(az), hz = Math.cos(az);
  out.x = p0.x; out.y = p0.y; out.z = p0.z;
  out.vx = speed * ch * hx; out.vy = speed * Math.sin(el); out.vz = speed * ch * hz;
  const w = spinVec(hx, hz, top, side);
  out.wx = w.wx; out.wy = w.wy; out.wz = w.wz;
  return out;
}
const _l = makeBall();

// Find the elevation and heading that put a ball of the given pace and spin on (tx,tz),
// through this air, over this net. `high` selects the lob solution. Returns the launch
// state plus where it actually lands and how much net it clears. If the pace is too low to
// reach, or too high to get down, `ok` is false and `why` says which.
export function solveShot(p0, tx, tz, speed, top, side, env, high) {
  const dx = tx - p0.x, dz = tz - p0.z, dist = Math.hypot(dx, dz);
  const az0 = Math.atan2(dx, dz), s0 = Math.sin(az0), c0 = Math.cos(az0);
  let az = az0;
  let lo, hi, el = 0, res = null;
  const run = (e, a) => { launch(p0, speed, e, a, top, side, _l); return predict(_l, env, { bounces: 0, dt: 1 / 150, maxT: 7 }); };
  // progress toward the target and sideways miss are both measured against the line to it
  const along = r => r.land ? (r.land.x - p0.x) * s0 + (r.land.z - p0.z) * c0 : 1e9;
  for (let pass = 0; pass < 4; pass++) {
    // range rises with elevation up to a peak near 30-40 degrees, then falls
    if (!high) { lo = -0.6; hi = 0.62; } else { lo = 0.62; hi = 1.45; }
    // locate the peak coarsely so the bracket is monotonic
    if (pass === 0) {
      let best = -1, bestE = 0.5;
      for (let e = 0.25; e <= 0.95; e += 0.1) { const d = along(run(e, az)); if (d > best) { best = d; bestE = e; } }
      if (best < dist) return { ok: false, why: 'short', maxRange: best };
      if (!high) hi = bestE; else lo = bestE;
      solveShot._peak = bestE;
    } else { if (!high) hi = solveShot._peak; else lo = solveShot._peak; }
    for (let i = 0; i < 16; i++) {
      el = (lo + hi) / 2;
      res = run(el, az);
      const d = along(res);
      if ((d < dist) !== !!high) lo = el; else hi = el;
    }
    if (!res.land) return { ok: false, why: 'short' };
    // steer out the sideways drift from sidespin and wind
    const lat = (res.land.x - p0.x) * c0 - (res.land.z - p0.z) * s0;
    if (Math.abs(lat) < 0.03 || pass === 3) break;
    az -= Math.atan2(lat, dist);
  }
  const clear = res.netY == null ? 9 : res.netY - netHeightAt(res.netX || 0);
  return { ok: true, el, az, speed, top, side, land: res.land, netY: res.netY, netX: res.netX, clear, T: res.land.t, apex: res.apex };
}

// The same problem with the elevation fixed and the pace free: lobs, drop shots and
// anything else where the shape of the arc is the decision and the speed follows from it.
export function solveSpeed(p0, tx, tz, el, top, side, env) {
  const dx = tx - p0.x, dz = tz - p0.z, dist = Math.hypot(dx, dz);
  const az0 = Math.atan2(dx, dz), s0 = Math.sin(az0), c0 = Math.cos(az0);
  let az = az0, lo = 3, hi = 70, sp = 20, res = null;
  for (let pass = 0; pass < 4; pass++) {
    lo = 3; hi = 70;
    for (let i = 0; i < 17; i++) {
      sp = (lo + hi) / 2;
      launch(p0, sp, el, az, top, side, _l);
      res = predict(_l, env, { bounces: 0, dt: 1 / 150, maxT: 8 });
      const d = res.land ? (res.land.x - p0.x) * s0 + (res.land.z - p0.z) * c0 : 1e9;
      if (d < dist) lo = sp; else hi = sp;
    }
    if (!res.land) return { ok: false, why: 'short' };
    const lat = (res.land.x - p0.x) * c0 - (res.land.z - p0.z) * s0;
    if (Math.abs(lat) < 0.03 || pass === 3) break;
    az -= Math.atan2(lat, dist);
  }
  const clear = res.netY == null ? 9 : res.netY - netHeightAt(res.netX || 0);
  return { ok: true, el, az, speed: sp, top, side, land: res.land, netY: res.netY, netX: res.netX, clear, T: res.land.t, apex: res.apex };
}

// Turn a solved (or deliberately mis-hit) launch into a live ball.
export function fire(b, p0, speed, el, az, top, side) { return launch(p0, speed, el, az, top, side, b); }

// ---- court geometry helpers ----
// Is a landing point in? `side` is the half the ball must land in: -1 for z<0, +1 for z>0.
// A ball is in if any part of it touches the line, hence the radius.
export function inCourt(x, z, side) {
  const m = BALL.r * 0.9;
  if (Math.abs(x) > COURT.halfW + m) return false;
  const d = z * side;
  return d >= -m && d <= COURT.halfLen + m;
}
// Service box: `side` as above, `right` true for the box on the +x half.
export function inServiceBox(x, z, side, right) {
  const m = BALL.r * 0.9;
  const d = z * side;
  if (d < -m || d > COURT.svc + m) return false;
  if (right) return x >= -m && x <= COURT.halfW + m;
  return x <= m && x >= -COURT.halfW - m;
}
// Signed miss distance for the call graphic: how far outside the nearest boundary.
export function missBy(x, z, side, box) {
  const d = z * side;
  let over = 0;
  if (box) {
    over = Math.max(over, d - COURT.svc);
    if (box.right) over = Math.max(over, -x, x - COURT.halfW); else over = Math.max(over, x, -x - COURT.halfW);
  } else {
    over = Math.max(over, d - COURT.halfLen, Math.abs(x) - COURT.halfW);
  }
  return over - BALL.r * 0.9;
}
export function onALine(x, z) {
  const ax = Math.abs(x), az = Math.abs(z), w = COURT.line / 2 + BALL.r;
  if (Math.abs(ax - COURT.halfW) < w && az < COURT.halfLen + 0.1) return true;
  if (Math.abs(az - COURT.halfLen) < COURT.baseLine / 2 + BALL.r && ax < COURT.halfW + 0.05) return true;
  if (Math.abs(az - COURT.svc) < w && ax < COURT.halfW) return true;
  if (ax < w && az < COURT.svc) return true;
  return false;
}
