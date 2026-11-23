// Rally Pro — the match engine: rules, scoring, players, contact and the error model.
// Pure logic. Rendering and audio only ever read this state and drain `match.events`.
import { COURT, BALL, clamp, lerp, makeRng, makeEnv, stepWind, makeBall, copyBall, flyStep, bounce, predict,
         solveShot, solveSpeed, fire, netHeightAt, inCourt, inServiceBox, missBy, onALine } from './physics.js';

export const STEP = 1 / 240;
const _carry = makeBall();                         // scratch ball for checking where a struck ball would come down
const PT = ['0', '15', '30', '40'];

// Stroke timing, seconds. Take-back and finish lengths are the medians measured from
// tracked broadcast footage of a tour forehand/backhand (0.6 s take-back, 0.4-0.6 s swing
// and finish, 0.5 s recovery); the forward swing itself is the last ~0.15 s before contact.
// The toss is an underhand lift with a straight arm: the ball travels on the arc the hand makes about the
// front shoulder, from low beside the front thigh up to full stretch in front of him, where it is let go.
// e runs 0 to 1 through the lift; the ball's position is written into `out`.
// (the arm lets go a little before it is straight up, still rising: it goes on up after the ball, see figure.js)
export function tossHand(sv, e, out) {
  const h = sv.prof.height, s = sv.sgn, hs = sv.hs, R = 0.36 * h, a = (-75 + 135 * e) * Math.PI / 180;
  const ax = sv.x - s * hs * 0.07, ay = 0.78 * h, az = sv.z - s * 0.19;           // his front shoulder as he stands side-on
  const fx = s * hs * 0.30, fz = -s * 0.95, fl = Math.hypot(fx, fz);               // toward the net and a little to his hitting side
  out.x = ax + R * Math.cos(a) * fx / fl; out.z = az + R * Math.cos(a) * fz / fl; out.y = ay + R * Math.sin(a);
  return out;
}
// Each player's routine before he serves: how many times he bounces the ball and how quickly, then a moment
// still at the address before the toss. One more or one fewer from point to point, as people are.
export const RITUAL = { Djokovic: [5, 0.38], Nadal: [3, 0.55], Federer: [2, 0.55], Sampras: [2, 0.55], Agassi: [3, 0.45], McEnroe: [1, 0.5],
  Lendl: [3, 0.5], Borg: [3, 0.5], Connors: [3, 0.45], Laver: [2, 0.5], Sinner: [3, 0.48], Alcaraz: [2, 0.5] };
export function ritualFor(name, u) {
  const r = RITUAL[name] || [3, 0.5], n = Math.max(1, r[0] + (u < 0.25 ? -1 : u > 0.8 ? 1 : 0)), t0 = 0.3;
  return { n, per: r[1], t0, end: t0 + n * r[1] + 0.5 };
}
// walking between points, as a share of top speed: about a metre and a half a second, a player's unhurried walk (at 0.3, nearly
// two metres a second, the gait went half way to a jog, knees bent, and he trotted back to the line)
export const WALK_K = 0.23;
export const TIMING = { prep: 0.90, swing: 0.15, follow: 0.42, recover: 0.38, serveSwing: 0.30, tossUp: 0.62, tossFly: 0.80 };

// Reach, metres from the body centre.
export const REACH = { ideal: 0.72, comfy: 1.15, max: 2.2, front: 1.25, back: 0.5, lo: 0.08, hi: 2.75, jump: 3.05 };

// Everything the calibration harness is allowed to turn. Angles in radians.
// the Perfect press, against the moment just before the ball reaches the racket (s): how early, how late (see resolveStroke)
const PF_EARLY = globalThis.__pfEarly ?? 0.07, PF_LATE = globalThis.__pfLate ?? 0.10;
export const TUNE = {
  sigEl: 0.0085, sigAz: 0.0200, sigV: 0.031,      // launch scatter of a neutral rally ball
  mis0: 0.018, misD: 0.070,                       // chance of a mistimed hit: base, and per unit of difficulty
  misLoss: 0.34, misDrop: 0.045,                  // what a mistimed hit costs in pace and launch angle
  retPen: 2.3,                                    // how much a big serve hurts the return
  runPen: 1.5, stretchPen: 3.2, pacePen: 1.2, powPen: 1.4,
  weakShort: 4.2, weakMid: 0.4,                   // a pressured ball lands this much shorter, and nearer the middle
  retWeak: 0.85, timPull: 0.5, timEl: 0.10,                                  // how much of the serve's sting carries into a weak return
  burst: 2.3,                                     // m/s gained from a well-timed split step
  lungeShank: 1.2,                                // at full stretch the frame finds the ball as often as the strings
  forced: 0.95,                                   // difficulty above which an error counts as forced
  // A better ball is harder to play: its quality (`threat`, 0..1: pace, spin, depth, width, struck cleanly) narrows a
  // person's timing window by up to this share, gives the computer a timing error of its own (s, at full threat), and
  // adds to the difficulty of the reply for both
  thrWin: 0.4, cpuTim: 0.05, thrPen: 0.45,
};

export const FORMATS = {
  atp3:  { key: 'atp3',  name: 'Best of 3 sets',  bestOf: 3, games: 6, tbAt: 6, tbTo: 7, finalTbTo: 7 },
  slam5: { key: 'slam5', name: 'Best of 5 sets',  bestOf: 5, games: 6, tbAt: 6, tbTo: 7, finalTbTo: 10 },
  short: { key: 'short', name: 'Short sets (first to 4)', bestOf: 3, games: 4, tbAt: 4, tbTo: 7, finalTbTo: 7 },
  one:   { key: 'one',   name: 'One set',         bestOf: 1, games: 6, tbAt: 6, tbTo: 7, finalTbTo: 7 },
  tb10:  { key: 'tb10',  name: 'Match tiebreak (first to 10)', bestOf: 1, games: 0, tbAt: 0, tbTo: 10, finalTbTo: 10 },
  // the original Rally's scoring (classic/index.html): one short set, first to three games by two, and at two all a tiebreak to seven
  // that decides the match (he asked for "a scoring setting on the games called classic based on the old game's scoring")
  classic: { key: 'classic', name: 'Classic (first to 3 games, tiebreak at 2-2)', bestOf: 1, games: 3, tbAt: 2, tbTo: 7, finalTbTo: 7 },
};

// A neutral tour-average profile; data.js builds real ones from player statistics.
export const BASE_PROFILE = {
  name: 'Player', lefty: false, oneHandBh: false, height: 1.85,
  s1Kmh: 195, s1Max: 220, s2Kmh: 160, firstIn: 0.62, secondIn: 0.905, wideBias: 0.5,
  fhKmh: 122, bhKmh: 114, fhRpm: 2800, bhRpm: 2300,
  speed: 6.1, accel: 6.8, react: 0.24,
  cons: 0.6, agg: 0.5, net: 0.12, sv: 0.02, drop: 0.03, slice: 0.12, volley: 0.6, ret: 0.6, touch: 0.6, flat: 0.25,
  fhBias: 0.35,
};

function newStats() {
  return { pts: 0, aces: 0, df: 0, s1In: 0, s1Tot: 0, s1Won: 0, s2Tot: 0, s2Won: 0, winners: 0, ue: 0, fe: 0,
           netPts: 0, netWon: 0, bpWon: 0, bpTot: 0, fastest: 0, s1Sum: 0, s1N: 0, s2Sum: 0, s2N: 0, dist: 0, shots: 0,
           fhW: 0, bhW: 0, retWon: 0, retTot: 0, maxRally: 0 };
}

function mkPlayer(i, prof) {
  const sgn = i === 0 ? 1 : -1;
  return {
    i, sgn, prof: { ...BASE_PROFILE, ...prof }, hs: prof && prof.lefty ? -1 : 1,
    x: 0, z: sgn * (COURT.halfLen + 1.2), vx: 0, vz: 0,
    move: { x: 0, z: 0 },            // desired velocity as a fraction of top speed, world axes
    walk: false,                     // between points: stroll, don't sprint
    stroke: null,                    // { wing, kind, t0, tc, done, hit, intent }
    lastStroke: null,
    split: -9,                       // time of the last split step
    spot: null,                      // where to stand before the point
    atNet: false, approach: false,
    mood: 0, moodT: -9,              // +1 fist pump / -1 head down, and when
    stats: newStats(),
    servePlan: null,
  };
}

export class Match {
  constructor(o = {}) {
    this.rng = makeRng(o.seed || (Date.now() & 0xffffff));
    // online (net.js, game.js): player 0 is the one at this keyboard, player 1 the one over the network. Each side
    // decides its own player's shots, and the side a ball is heading to decides what becomes of it.
    this.online = false; this.applying = false; this.onShot = null; this.onJudged = null; this.shotRng = null;
    this.env = makeEnv(o.env || {});
    this.fmt = FORMATS[o.format] || FORMATS.atp3;
    this.players = [mkPlayer(0, o.p0 || {}), mkPlayer(1, o.p1 || {})];
    this.ball = Object.assign(makeBall(), { live: false, lastHit: -1, bounces: 0, isServe: false, netTouched: false, visible: false, held: -1, lastSpeed: 0 });
    this.t = 0;
    this.events = [];
    this.ctl = [null, null];
    this.pace = o.pace == null ? 1 : o.pace;        // 1 = realistic time between points
    this.quick = !!o.quick;                          // no walk between points: a moment to see it land, a cut, and the next one is ready
    this.score = { sets: [], g: [0, 0], p: [0, 0], tb: false, setsWon: [0, 0], server: o.firstServer || 0, serveNum: 1, over: false, winner: -1, tbStart: 0, pointNo: 0 };
    if (this.fmt.tbAt === 0) { this.score.tb = true; this.score.tbStart = this.score.server; }
    this.rally = 0;
    this.phase = 'between';
    for (const p of this.players || []) p.walk = true;   /* (and they walk out to their places for the first point too: run there, they sprinted out sideways) */
    this.phaseT = 0;
    this.timer = 2.5;
    this.serveClock = 25;
    this.ends = 0;
    this.gamesInSet = 0;
    this.incoming = null;                            // prediction of the ball now in flight
    this.lastPoint = null;
    this.history = [];                               // per-point log
    this.contactInfo = null;
    this.shotLog = o.logShots ? [] : null;
    this.pointStart = 0;
    this.touchedBy = [false, false];
    this.calib = [calibrateServe(this.players[0].prof, this.env), calibrateServe(this.players[1].prof, this.env)];
    this.assist = o.assist == null ? 1 : o.assist;   // human footwork help: 0 none, 1 magnet, 2 full auto
    this.diffScale = [1, 1];                         // error multipliers (difficulty)
    this.cleanK = [1, 1]; this.mercy = [1, 1];                            // how much of a swing's spread a cleanly timed ball still gets (human only)
    this.aimSafe = [0, 0];                           // how much of the miss ring a human's target is kept inside the lines (0 none, 1 all of it)
    this.timingWindow = [0.03, 0.03];                // how far off the ideal moment a human's release can be and still count as clean (s)
    this.setSpots();
  }
  emit(type, d) { const e = d || {}; e.type = type; e.t = this.t; this.events.push(e); return e; }

  // ---------- scoring ----------
  get deuceSide() { const s = this.score; return ((s.p[0] + s.p[1]) % 2) === 0; }
  pointText() {
    const s = this.score, a = s.p[0], b = s.p[1];
    if (s.tb) return [String(a), String(b)];
    if (a >= 3 && b >= 3) { if (a === b) return ['40', '40']; return a > b ? ['AD', ''] : ['', 'AD']; }
    return [PT[Math.min(a, 3)], PT[Math.min(b, 3)]];
  }
  callText() {
    const s = this.score, a = s.p[s.server], b = s.p[1 - s.server];
    const W = ['Love', 'Fifteen', 'Thirty', 'Forty'];
    if (s.tb) { if (a === b) return `${a} all`; return a > b ? `${a} ${b}, ${this.players[s.server].prof.name}` : `${b} ${a}, ${this.players[1 - s.server].prof.name}`; }
    if (a >= 3 && b >= 3) { if (a === b) return 'Deuce'; return 'Advantage ' + this.players[a > b ? s.server : 1 - s.server].prof.name; }
    if (a === b) return W[a] + ' all';
    return W[a] + ' ' + W[b];
  }
  isBreakPoint() {
    const s = this.score; if (s.tb) return false;
    const r = 1 - s.server, a = s.p[r], b = s.p[s.server];
    return a >= 3 && a > b;
  }
  // would `who` win the set / match by taking this point?
  pointValue(who) {
    const s = this.score, f = this.fmt, o = 1 - who;
    let game = false;
    if (s.tb) { const to = this.tbTarget(); game = s.p[who] + 1 >= to && s.p[who] + 1 - s.p[o] >= 2; }
    else game = s.p[who] >= 3 && s.p[who] > s.p[o];
    if (!game) return 0;
    let set = s.tb || (s.g[who] + 1 >= f.games && s.g[who] + 1 - s.g[o] >= 2);
    if (!set) return 1;
    return s.setsWon[who] + 1 > f.bestOf / 2 ? 3 : 2;
  }
  tbTarget() { const s = this.score, f = this.fmt; const deciding = s.setsWon[0] + s.setsWon[1] === f.bestOf - 1; return deciding ? f.finalTbTo : f.tbTo; }

  awardPoint(w) {
    const s = this.score, f = this.fmt, l = 1 - w;
    if (s.server !== w && this.isBreakPoint()) this.players[w].stats.bpWon++;
    s.p[w]++; s.pointNo++;
    this.players[w].stats.pts++;
    let gameWon = false;
    if (s.tb) {
      const to = this.tbTarget();
      if (s.p[w] >= to && s.p[w] - s.p[l] >= 2) gameWon = true;
      else {
        const n = s.p[0] + s.p[1];
        if (n % 2 === 1) s.server = 1 - s.server;
        if (n % 6 === 0) this.changeEnds(false);
      }
    } else if (s.p[w] >= 4 && s.p[w] - s.p[l] >= 2) gameWon = true;
    if (!gameWon) return;
    const wasTb = s.tb, tbScore = [s.p[0], s.p[1]];
    s.g[w]++; s.p = [0, 0];
    this.emit('game', { winner: w, brk: !wasTb && s.server !== w, games: [s.g[0], s.g[1]] });
    let setWon = wasTb || (s.g[w] >= f.games && s.g[w] - s.g[l] >= 2);
    if (wasTb) { s.server = 1 - s.tbStart; s.tb = false; }
    else s.server = 1 - s.server;
    const total = s.g[0] + s.g[1];
    if (setWon) {
      s.sets.push({ g: [s.g[0], s.g[1]], tb: wasTb ? tbScore : null });
      s.setsWon[w]++; s.g = [0, 0];
      this.emit('set', { winner: w, sets: s.sets.length });
      if (s.setsWon[w] > f.bestOf / 2) { s.over = true; s.winner = w; this.emit('match', { winner: w }); return; }
      if (total % 2 === 1) this.changeEnds(true);
      else this.emit('setBreak', {});
      if (f.tbAt === 0) { s.tb = true; s.tbStart = s.server; }
    } else {
      if (total % 2 === 1) this.changeEnds(total > 1);
      if (!s.tb && s.g[0] === f.tbAt && s.g[1] === f.tbAt) { s.tb = true; s.tbStart = s.server; this.emit('tiebreak', {}); }
    }
  }
  changeEnds(sit) { this.ends++; this.env.flip = -this.env.flip; this.emit('changeEnds', { sit: !!sit }); }

  // ---------- point lifecycle ----------
  setSpots() {
    const s = this.score, srv = this.players[s.server], rcv = this.players[1 - s.server];
    const deuce = this.deuceSide;
    // from each player's own view the deuce court is on the right
    const side = deuce ? 1 : -1;
    const sx = (srv.servePlan && srv.servePlan.standX != null ? srv.servePlan.standX : 0.9) * side;
    srv.spot = { x: sx * srv.sgn, z: srv.sgn * (COURT.halfLen + 0.35) };
    const surf = this.env.surf.key, back = this.score.serveNum === 1 ? (surf === 'clay' ? 2.6 : surf === 'grass' ? 1.2 : 1.7) : 0.4;
    rcv.spot = { x: 3.3 * side * rcv.sgn, z: rcv.sgn * (COURT.halfLen + back) };
  }
  startBetween(dur) {
    this.phase = 'between'; this.phaseT = 0; this.timer = dur * this.pace;
    this.serveClock = 25;
    const b = this.ball; b.live = false;
    this.incoming = null;
    for (const p of this.players) { if (p.stroke && p.stroke.done) p.lastStroke = p.stroke; p.stroke = null; p.atNet = false; p.approach = false; p.walk = true; }   /* (a finish still being played out goes on in the figure) */
    this.setSpots();
  }
  beginReady() {
    this.phase = 'ready'; this.phaseT = 0;
    const b = this.ball, sv = this.players[this.score.server];
    b.held = sv.i; b.visible = true; b.live = false; b.bounces = 0; b.isServe = false; b.netTouched = false; b.lastHit = -1;
    b.vx = b.vy = b.vz = 0; b.wx = b.wy = b.wz = 0;
    this.ritual = ritualFor(sv.prof.name, this.rng.u());
    for (const p of this.players) p.walk = false;
    this.rally = 0; this.touchedBy = [false, false];
    this.emit('ready', { server: sv.i, serveNum: this.score.serveNum });
  }
  // The toss: released from the off hand at full stretch, peaking a little above contact.
  toss(i) {
    if (this.phase !== 'ready' || i !== this.score.server) return false;
    const p = this.players[i], b = this.ball, h = p.prof.height;
    const contactH = serveContactH(p.prof);
    // the motion starts now; the ball leaves the hand as the toss arm reaches full stretch
    const y0 = tossHand(p, 1, {}).y, apex = contactH + 0.42 + this.rng.range(-0.04, 0.04);
    const vy = Math.sqrt(2 * 9.81 * (apex - y0)), tUp = vy / 9.81, tDown = Math.sqrt(2 * (apex - contactH) / 9.81);
    this.tossRelease = this.t + TIMING.tossUp; this.tossVy = vy; this.tossY0 = y0;
    b.held = i; b.visible = true;
    this.phase = 'toss'; this.phaseT = 0;
    // when the ball comes back down to contact height
    this.tossIdeal = this.tossRelease + tUp + tDown;
    p.stroke = { wing: 'fh', kind: 'serve', t0: this.t, tc: null, done: false, hit: false, intent: null };
    this.emit('toss', { who: i });
    return true;
  }
  // The server commits. `it`: { tx, tz, type: 'flat'|'slice'|'kick', pace: 0..1 }
  serveSwing(i, it) {
    const p = this.players[i];
    if (this.phase !== 'toss' || i !== this.score.server || !p.stroke || p.stroke.tc != null) return false;
    p.stroke.tc = this.t + TIMING.serveSwing;
    p.stroke.intent = it;
    p.stroke.timing = p.stroke.tc - this.tossIdeal;       // + late (ball dropping), - early (still rising)
    // the receiver times his split step to the strike, whoever is serving
    this.players[1 - i].split = this.t + TIMING.serveSwing - 0.12;
    return true;
  }

  // ---------- a groundstroke / volley command ----------
  // Start the take-back. Returns false if a swing is already under way.
  prep(i, kind) {
    const p = this.players[i];
    if (this.phase !== 'live' || (p.stroke && !p.stroke.done && p.stroke.tc != null)) return false;
    if (p.stroke && !p.stroke.done) return true;
    const b = this.ball, lat = (b.x - p.x) * p.sgn * p.hs;
    if (p.stroke && p.stroke.done) p.lastStroke = p.stroke;          // (the stroke just played is still finishing: the figure plays that out)
    p.stroke = { wing: lat >= -0.15 ? 'fh' : 'bh', kind: kind || 'drive', t0: this.t, tc: null, done: false, hit: false, intent: null, auto: false };
    return true;
  }
  // How far off the ideal moment player i can let go and still be clean: less off a better ball
  windowFor(i) { const b = this.ball; return this.timingWindow[i] * (1 - TUNE.thrWin * (b.live && b.lastHit !== i ? (b.threat || 0) : 0)); }
  // Human release: decide when the racket meets the ball from where the ball will be.
  release(i, it) {
    const p = this.players[i], b = this.ball;
    if (this.phase !== 'live') return null;
    if (!p.stroke || p.stroke.done) this.prep(i, it.kind);
    const st = p.stroke; if (!st || st.tc != null) return null;
    // when does the ball reach the ideal contact plane, 0.4 m in front of the body?
    const cz = p.z - p.sgn * 0.42;
    let tau = null;
    // where the game's own legs are taking him (Auto footwork), the ball is met when they get him there
    if (it.tcAt != null && it.tcAt - this.t > -0.05 && it.tcAt - this.t < 0.9 && b.live && b.lastHit !== i) tau = Math.max(0, it.tcAt - this.t);
    else if (b.live && b.lastHit !== i) {
      const pr = predict(b, this.env, { bounces: 1, path: true, dt: 1 / 240, maxT: 0.7 });
      let best = 1e9;
      for (let k = 0; k < pr.path.length; k += 4) {
        const d = Math.abs(pr.path[k + 2] - cz);
        if (d < best) { best = d; tau = pr.path[k + 3]; }
      }
      if (best > 2.2) tau = null;
    }
    const want = TIMING.swing;
    let dt = want;
    if (tau != null) dt = clamp(tau, want - 0.06, want + 0.11);
    // The first game's swing connected on any frame the ball was within reach. Pressed as the ball arrives — or
    // just after it has gone by — the racket still gets there: at once, a little late, and never thin air.
    if (it.merciful) { dt = tau != null ? clamp(tau, 0.025, want + 0.11) : 0.025; st.merciful = true; }
    st.tc = this.t + dt;
    st.timing = tau == null ? null : tau - want;          // + early release, - late
    if (it.merciful && st.timing != null) { const w = this.timingWindow[i] * 1.5 + (globalThis.__pressureOld ? 0 : 0.06); st.timing = clamp(st.timing, -w, w); }   /* (with pressure timing a press well off the moment is that far off, and costs: kept within half a window more, timing hardly mattered) */
    // (With the first game's controls his timing is when he pressed against the moment a player would: just before the ball reaches
    // the racket, 0.08 s before contact - Perfect within 0.06 s of it, Good within 0.12. It was judged against the swing's start,
    // 0.15-0.24 s before contact: pressed as the ball came to him, he was a sixth of a second late, his shot came off weak, and a
    // touch later he missed it altogether - he said "the assist keeps setting up to miss shots". An early press is still held and
    // swung on time; the swing is as before. `__pressTimeOld`.)
    if (it.merciful && it.pressAt != null && st.tc != null && !globalThis.__pressTimeOld) {
      // (when the ball is at the racket: as the swing is set, or - pressed after it had come through - when it went by, from its
      // speed toward him; the swing itself may be later or sooner, a held early press or a late one)
      const toward = b.vz * p.sgn, tReach = tau != null && tau > 0.02 ? this.t + tau : this.t + (cz - b.z) * p.sgn / Math.max(1, toward);
      const e = it.pressAt - (tReach - (globalThis.__pressIdeal ?? 0.08)); st.pressE = e;
      st.timing = e <= 0 ? Math.min(0.25, -e) * (this.timingWindow[i] / 0.16) : -Math.min(0.25, e) * (this.timingWindow[i] / 0.17); }
    if (tau != null) { const pr2 = predict(b, this.env, { bounces: 1, dt: 1 / 240, maxT: dt }); st.cp = { x: pr2.end.x, y: pr2.end.y, z: pr2.end.z }; }
    st.intent = it; st.kind = it.kind || st.kind;
    st.held = this.t - st.t0;
    return st;
  }
  // The split step: a small hop that lands as the opponent strikes. Landing loaded, the
  // first step toward the ball comes for free. Too early or too late and it is just a hop.
  splitStep(i) {
    const p = this.players[i];
    if (this.t - p.split < 0.45) return;
    p.split = this.t; p.burstOK = true;
  }
  // Called by whoever steers the player once he knows which way to go.
  burst(i, dx, dz) {
    const p = this.players[i], age = this.t - p.split;
    if (!p.burstOK || age < -0.05 || age > 0.42) return false;
    const d = Math.hypot(dx, dz); if (d < 0.3) return false;
    const q = 1 - clamp((age - 0.22) / 0.2, 0, 1) * 0.6;
    p.vx += dx / d * TUNE.burst * q; p.vz += dz / d * TUNE.burst * q;
    p.burstOK = false;
    return true;
  }
  // How far the next ball from player i is likely to miss its target: the half-width and the
  // length of the zone nineteen in twenty land inside. The same scatter the shot will actually
  // be given, estimated before contact from the pace coming at him, how fast he is moving and
  // how hard he means to hit.
  missRing(i, kind, power) {
    const p = this.players[i], b = this.ball, prof = p.prof;
    const vNow = b.live && b.lastHit !== i ? Math.hypot(b.vx, b.vy, b.vz) : 20, vin = vNow * (b.bounces > 0 ? 0.92 : 0.62);
    const pSpeed = Math.hypot(p.vx, p.vz);
    const ret = b.live && b.isServe && b.lastHit !== i ? clamp((vin - 17) / 12, 0, 1.4) * lerp(1.15, 0.80, prof.ret) * TUNE.retPen : 0;
    const diff = clamp((vin - 12) / 22, 0, 1.4) * TUNE.pacePen + Math.pow(pSpeed / 5.5, 2) * TUNE.runPen + Math.max(0, (power || 0) - 0.78) * TUNE.powPen + ret;
    const R = ringOf(kind, prof, this.diffScale[i], diff);
    if (kind === 'drive') { const k = lerp(1, 0.82, loopW(power == null ? 0.6 : power)); R.x *= k; R.z *= k; }
    return R;
  }

  // AI / assist: book a stroke for a known contact time.
  schedule(i, wing, kind, tc, intent) {
    const p = this.players[i];
    p.stroke = { wing, kind, t0: this.t, tc, done: false, hit: false, intent, auto: true, timing: 0 };
  }

  // ---------- the step ----------
  // ---------- online ----------
  // whether this side calls what becomes of the ball: yes when it is coming to this side's player
  judgeHere() { return !this.online || this.ball.lastHit === 1; }
  // this side's player has just struck the ball: what it does from here is sent, with a seed for the court's small
  // randomness in its bounces, so the other side flies exactly the same ball
  shotOut(p, kind, wing, speed, diff, type) {
    const seed = 1 + Math.floor(this.rng.u() * 2147483000); this.shotRng = makeRng(seed);
    const b = this.ball;
    if (this.onShot) this.onShot({ t: this.t, kind, wing, type, speed, diff, seed, serve: kind === 'serve', serveNum: this.score.serveNum,
      thr: b.threat || 0, b: { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, wx: b.wx, wy: b.wy, wz: b.wz } });
  }
  // a new point started there before it did here: catch up
  catchUp() {
    if (this.phase === 'over' || this.phase === 'between') {
      if (this.score.over) return false;
      this.startBetween(0);
      for (const p of this.players) if (p.spot && !p.puppet) { p.x = p.spot.x; p.z = p.spot.z; p.vx = 0; p.vz = 0; p.stroke = null; }
      this.beginReady(); this.emit('placed', {});
    }
    return true;
  }
  // the other player struck the ball at their time `tAt` (already on this clock): take up its flight from then
  applyRemoteShot(s, tAt, mirror) {
    const b = this.ball, p = this.players[1];
    if (s.serve && !this.catchUp()) return;
    this.applying = true;
    try {
      if (p.stroke && !p.stroke.done) { p.stroke.done = true; p.stroke.tEnd = this.t; }
      Object.assign(b, mirror(s.b)); b.held = -1; b.visible = true; b.live = true; b.lastHit = 1; b.bounces = 0; b.isServe = !!s.serve; b.netTouched = false; b.lastSpeed = s.speed; b.threat = s.thr || 0;
      this.shotRng = makeRng(s.seed); this.touchedBy[1] = true;
      if (s.serve) {
        this.phase = 'live'; this.phaseT = 0; this.rally = 1; this.pointStart = tAt;
        const S = p.stats; if (this.score.serveNum === 1) S.s1Tot++; S.fastest = Math.max(S.fastest, s.speed * 3.6); S.shots++;
        this.contactInfo = { who: 1, diff: 0, wing: 'fh', kind: 'serve' };
      } else {
        if (this.phase !== 'live') { this.phase = 'live'; this.phaseT = 0; }
        this.rally++; p.stats.shots++;
        this.contactInfo = { who: 1, diff: s.diff || 0, wing: s.wing, kind: s.kind };
      }
      this.emit('hit', { who: 1, kind: s.kind, wing: s.wing, stype: s.type, speed: s.speed, x: b.x, y: b.y, z: b.z, serveNum: this.score.serveNum, remote: true });
    } finally { this.applying = false; }
    // it has been flying since then: fly it here too, calling it as it comes (the ball is coming to this side)
    let rem = Math.min(0.5, Math.max(0, this.t - tAt));
    const n = Math.floor(rem / STEP), first = rem - n * STEP;
    if (first > 1e-6 && this.phase === 'live') this.flyLive(first);
    for (let k = 0; k < n && this.phase === 'live'; k++) this.flyLive(STEP);
    if (this.phase === 'live') this.incoming = this.makeIncoming();
  }
  // a call made over there, on a ball that was going their way
  applyRemoteJudged(j, mirrorD) {
    if (j.type !== 'point' && !this.catchUp()) return;
    this.applying = true;
    try {
      if (j.type === 'point') { if (this.phase === 'over' || this.phase === 'done') return; this.endPoint(1 - j.w, j.why, mirrorD(j.d)); }
      else if (j.type === 'fault') this.fault(j.why, mirrorD(j.d));
      else if (j.type === 'let') this.let();
    } finally { this.applying = false; }
  }
  applyRemoteToss() {
    if (!this.catchUp()) return;
    if (this.phase === 'ready' && this.score.server === 1) { this.applying = true; try { this.toss(1); } finally { this.applying = false; } }
  }
  applyRemoteCatch() {
    const sv = this.players[1];
    if (this.phase === 'toss' && this.score.server === 1) { sv.stroke = null; this.phase = 'ready'; this.phaseT = 0; this.ball.held = 1; }
  }

  step(dt) {
    this.t += dt; this.phaseT += dt;
    stepWind(this.env, dt);
    for (let i = 0; i < 2; i++) if (this.ctl[i]) this.ctl[i].update(this, i, dt);
    for (const p of this.players) this.movePlayer(p, dt);
    const b = this.ball, s = this.score;
    switch (this.phase) {
      case 'between': {
        this.timer -= dt;
        const ready = this.players.every(p => !p.spot || Math.hypot(p.x - p.spot.x, p.z - p.spot.z) < 0.35);
        if (this.timer <= 0 && ready && !s.over) this.beginReady();
        if (this.timer < -12 && !s.over) { for (const p of this.players) if (p.spot) { p.x = p.spot.x; p.z = p.spot.z; } this.beginReady(); }
        this.deadBall(dt);
        break;
      }
      case 'ready': {
        this.serveClock -= dt;
        const sv = this.players[s.server], h = sv.prof.height;
        // bouncing the ball before the serve is animation; the ball rides the hand
        b.x = sv.x + sv.sgn * sv.hs * -0.28; b.z = sv.z - sv.sgn * 0.3; b.y = h * 0.52;
        break;
      }
      case 'toss': {
        const sv = this.players[s.server], st = sv.stroke;
        if (b.held >= 0) {
          // riding up in the toss hand
          // the arm speeds up all the way to the release (a toss is thrown, not placed): slow from the hang, fastest as it lets go
          const w = clamp(1 - (this.tossRelease - this.t) / TIMING.tossUp, 0, 1), e = w * w * (1.6 - 0.6 * w);
          tossHand(sv, e, b);
          if (this.t >= this.tossRelease) { b.held = -1; b.y = this.tossY0; b.vy = this.tossVy; b.vx = 0; b.vz = -sv.sgn * 0.12; b.wx = b.wy = b.wz = 0; }
        } else flyStep(b, dt, this.env);
        if (this.online && sv.i === 1) { if (st && st.tc != null && this.t >= st.tc && !st.done) { st.done = true; st.tEnd = this.t; } }
        else if (st && st.tc != null && this.t >= st.tc && !st.done) this.resolveServe(sv);
        else if (b.held < 0 && b.y < sv.prof.height * 0.6 && b.vy < 0) {          // let it drop: catch and go again
          sv.stroke = null; this.phase = 'ready'; this.phaseT = 0; b.held = sv.i; this.emit('tossCatch', { who: sv.i });
        }
        break;
      }
      case 'live': {
        this.flyLive(dt);
        for (const p of this.players) {
          const st = p.stroke;
          if (st && !st.done && st.tc != null && this.t >= st.tc) { if (this.online && p.i === 1) { st.done = true; st.tEnd = this.t; } else this.resolveStroke(p); }
        }
        break;
      }
      case 'over': {
        this.timer -= dt;
        this.deadBall(dt);
        for (const p of this.players) { const st = p.stroke; if (st && !st.done && st.tc != null && this.t >= st.tc) { st.done = true; st.tEnd = this.t; } }
        // quick play: the picture dips for an instant and both players are where the next point starts
        if (this.quick && this.nextGap === 0 && !s.over && !this.cutSent && this.timer <= 0.13) { this.cutSent = true; this.emit('cut', {}); }
        if (this.timer <= 0) {
          if (s.over) { this.phase = 'done'; break; }
          if (this.quick && this.nextGap === 0) {
            this.startBetween(0);
            for (const p of this.players) if (p.spot) { p.x = p.spot.x; p.z = p.spot.z; p.vx = 0; p.vz = 0; p.stroke = null; }
            this.beginReady(); this.emit('placed', {});
          } else this.startBetween(this.nextGap || 3);
        }
        break;
      }
    }
    for (const p of this.players) { const st = p.stroke; if (st && st.done && this.t > st.tEnd + TIMING.follow + TIMING.recover) { p.lastStroke = st; p.stroke = null; } }
  }

  movePlayer(p, dt) {
    if (p.puppet) return;                                     // the player over the network is placed by his own side
    const pr = p.prof, st = p.stroke;
    let top = pr.speed * (p.walk ? WALK_K : 1);
    // feet are planted through the hit
    if (st && st.tc != null && st.kind !== 'serve') {
      const u = this.t - st.tc;
      if (u > -0.16 && u < 0.2) top *= st.onRun ? 0.75 : 0.42;
    }
    if (st && st.kind === 'serve' && !(st.done && this.t > st.tEnd + 0.22)) top = 0;   // rooted until he lands from the serve
    if (this.phase === 'ready' && p.i === this.score.server) top = Math.min(top, p.srvFree ? 4.0 : 1.6);   /* (a person moving to where he will serve from goes at his ordinary pace, human.js) */
    let mx = p.move.x, mz = p.move.z; const m = Math.hypot(mx, mz);
    if (m > 1) { mx /= m; mz /= m; }
    // players move best forward and sideways; backpedalling is slower
    const back = mz * p.sgn > 0 ? 0.82 : 1;
    const tvx = mx * top, tvz = mz * top * back;
    const dvx = tvx - p.vx, dvz = tvz - p.vz, dv = Math.hypot(dvx, dvz);
    const braking = (tvx * p.vx + tvz * p.vz) < 0.5 * (p.vx * p.vx + p.vz * p.vz);
    const a = pr.accel * (braking ? (pr.brake || 1.35) : 1) * (p.walk ? 0.5 : 1);
    if (dv > 1e-6) { const k = Math.min(1, a * dt / dv); p.vx += dvx * k; p.vz += dvz * k; }
    // a server is carried into the court by his serve: he lands on the front foot about half a metre inside where he
    // stood, then comes back for the return (his tracked serve is kept centred on the hips, so this travel is the game's)
    if (st && st.kind === 'serve' && st.tc != null) { const su = this.t - st.tc; if (su >= 0 && su < 0.32) { p.vx = 0; p.vz = -p.sgn * 2.8 * (1 - su / 0.32); } }
    const ox = p.x, oz = p.z;
    // stay on your own side of the net and inside the arena
    const lim = this.bounds || { x: 9.5, z: 19 };
    // (braking into the limits as a player pulls up, not stopped dead at them: run into the back fence at eight metres a second, he
    // was stopped in a frame and his stride snapped, a foot thrown thirty centimetres)
    if (!globalThis.__wallBrakeOld) { const ab = pr.accel * (pr.brake || 1.35), vm = d => Math.sqrt(2 * ab * Math.max(0, d));
      const pzL = lim.pz != null ? lim.pz : lim.z, dB = pzL - p.z * p.sgn, dN = p.z * p.sgn - 0.6, dX = lim.x - Math.abs(p.x);
      if (p.vz * p.sgn > vm(dB)) p.vz = p.sgn * vm(dB);
      if (-p.vz * p.sgn > vm(dN)) p.vz = -p.sgn * vm(dN);
      if (p.vx * Math.sign(p.x || 1) > vm(dX)) p.vx = Math.sign(p.x || 1) * vm(dX);
      // (and into the rounded corners, against the corner's curve)
      if (lim.rc) { const cx = lim.hx - lim.rc, cz = lim.hz - lim.rc, ax = Math.abs(p.x), az = Math.abs(p.z);
        if (ax > cx && az > cz) { const dx = ax - cx, dz = az - cz, d = Math.hypot(dx, dz), mz = lim.pz != null ? Math.max(0.75, lim.hz - lim.pz) : 0.75, R = lim.rc * Math.cos(Math.PI / 4 / Math.max(1, lim.nc || 8)) - (0.75 + (mz - 0.75) * (d > 1e-6 ? dz / d : 0));
          if (d > 1e-6) { const nx = dx / d * Math.sign(p.x), nz = dz / d * Math.sign(p.z), vo = p.vx * nx + p.vz * nz, lv = vm(R - d); if (vo > lv) { p.vx -= (vo - lv) * nx; p.vz -= (vo - lv) * nz; } } } } }
    p.x += p.vx * dt; p.z += p.vz * dt;
    p.x = clamp(p.x, -lim.x, lim.x);
    if (p.z * p.sgn < 0.6) { p.z = p.sgn * 0.6; p.vz = 0; }
    { const pz = lim.pz != null ? lim.pz : lim.z; if (p.z * p.sgn > pz) { p.z = p.sgn * pz; p.vz = 0; } }
    // (and the corners are rounded, as the arena's walls are: held only to the rectangle, a player chasing a ball into a back
    // corner ran on up to a metre into the corner wall)
    if (lim.rc) { const cx = lim.hx - lim.rc, cz = lim.hz - lim.rc, ax = Math.abs(p.x), az = Math.abs(p.z);
      if (ax > cx && az > cz) { const dx = ax - cx, dz = az - cz, d = Math.hypot(dx, dz), mz = lim.pz != null ? Math.max(0.75, lim.hz - lim.pz) : 0.75, R = lim.rc * Math.cos(Math.PI / 4 / Math.max(1, lim.nc || 8)) - (0.75 + (mz - 0.75) * (d > 1e-6 ? dz / d : 0));   /* (the margin from the side's toward the back wall's as the corner turns: the wall rises there too) */
        if (d > R && d > 1e-6) { const nx = dx / d * Math.sign(p.x), nz = dz / d * Math.sign(p.z);
          p.x = Math.sign(p.x) * (cx + dx / d * R); p.z = Math.sign(p.z) * (cz + dz / d * R);
          const vo = p.vx * nx + p.vz * nz; if (vo > 0) { p.vx -= vo * nx; p.vz -= vo * nz; } } } }
    p.stats.dist += Math.hypot(p.x - ox, p.z - oz);
  }

  // ball in play
  flyLive(dt) {
    const b = this.ball, px = b.x, py = b.y, pz = b.z;
    flyStep(b, dt, this.env);
    // --- net ---
    if ((pz > 0) !== (b.z > 0) || b.z === 0) {
      const f = pz / ((pz - b.z) || 1e-9), y = py + (b.y - py) * f, x = px + (b.x - px) * f;
      if (Math.abs(x) < COURT.postX + 0.06) {
        const nh = netHeightAt(x), dir = Math.sign(b.vz) || 1;
        if (y - BALL.r < nh) {
          const sp = Math.hypot(b.vx, b.vy, b.vz);
          if (y > nh - 0.012) {
            // clipped the tape: it dribbles over, dead and unpredictable
            b.x = x; b.z = dir * 0.04; b.y = Math.max(y, nh + BALL.r * 0.6);
            const R = this.shotRng || this.rng, keep = R.range(0.18, 0.42);
            b.vz *= keep; b.vx *= keep; b.vy = Math.abs(b.vy) * 0.25 + R.range(0.6, 2.2);
            b.wx *= 0.3; b.wy *= 0.3; b.wz *= 0.3; b.netTouched = true;
            this.emit('netcord', { x, y: nh, speed: sp });
            this.incoming = this.makeIncoming();
          } else {
            b.x = x; b.z = -dir * 0.05; b.y = y;
            b.vz *= -0.05; b.vx *= 0.12; b.vy = b.vy * 0.2 - 0.3; b.wx = b.wy = b.wz = 0;
            this.emit('net', { x, y, speed: sp, who: b.lastHit });
            if (this.judgeHere()) { if (b.isServe) this.fault('net'); else this.endPoint(1 - b.lastHit, 'net'); }
            else b.live = false;
            return;
          }
        }
      }
    }
    // --- court ---
    if (b.y <= BALL.r && b.vy < 0) {
      const f = (py - BALL.r) / Math.max(1e-6, py - b.y);
      b.x = px + (b.x - px) * f; b.z = pz + (b.z - pz) * f;
      const sp = Math.hypot(b.vx, b.vy, b.vz), line = onALine(b.x, b.z);
      const x = b.x, z = b.z;
      const info = bounce(b, this.env, this.shotRng || this.rng, line);
      b.bounces++;
      const landSide = b.lastHit === 0 ? -1 : 1;
      let good = true, miss = 0;
      if (b.bounces === 1) {
        if (b.isServe) {
          const deuce = this.deuceSide, right = deuce ? landSide > 0 : landSide < 0;
          good = inServiceBox(x, z, landSide, right);
          miss = missBy(x, z, landSide, { right });
        } else { good = inCourt(x, z, landSide); miss = missBy(x, z, landSide, null); }
      }
      this.emit('bounce', { x, z, speed: sp, first: b.bounces === 1, good, miss, line, bit: info.bit, vy: info.vyIn, serve: b.isServe, who: b.lastHit });
      if (!this.judgeHere()) { if (b.bounces === 1 && this.incoming) this.incoming.bounced = true; this.arenaWalls(b); return; }   // the other side calls this one
      if (b.bounces === 1) {
        if (!good) {
          const long = Math.abs(z) > (b.isServe ? COURT.svc : COURT.halfLen) || z * landSide < 0;
          if (b.isServe) this.fault(long ? 'long' : 'wide', { x, z, miss });
          else this.endPoint(1 - b.lastHit, long ? 'long' : 'wide', { x, z, miss });
          return;
        }
        if (b.isServe && b.netTouched) { this.let(); return; }
        if (this.incoming) this.incoming.bounced = true;
      } else if (b.bounces >= 2) {
        const w = b.lastHit, l = 1 - w;
        let why = 'winner';
        if (this.rally <= 1) why = this.touchedBy[l] ? 'serviceWinner' : 'ace';
        this.endPoint(w, why, { x, z });
        return;
      }
    }
    this.arenaWalls(b);
  }
  arenaWalls(b) {
    const lim = this.bounds || { x: 9.5, z: 19 }, wx = lim.x + 0.6, wz = lim.z + 0.8;
    if (Math.abs(b.x) > wx) { b.x = Math.sign(b.x) * wx; b.vx *= -0.35; b.vz *= 0.7; b.vy *= 0.7; if (Math.abs(b.vx) > 1.5) this.emit('wall', { x: b.x, y: b.y, z: b.z, speed: Math.abs(b.vx) }); }
    if (Math.abs(b.z) > wz) { b.z = Math.sign(b.z) * wz; if (Math.abs(b.vz) > 1.5) this.emit('wall', { x: b.x, y: b.y, z: b.z, speed: Math.abs(b.vz) }); b.vz *= -0.35; b.vx *= 0.7; b.vy *= 0.7; }
  }
  // after the point: let the ball run out of energy
  deadBall(dt) {
    const b = this.ball; if (b.held >= 0 || !b.visible) return;
    const pz = b.z;
    flyStep(b, dt, this.env);
    if ((pz > 0) !== (b.z > 0) && b.y < netHeightAt(b.x) && Math.abs(b.x) < COURT.postX) { b.z = pz > 0 ? 0.05 : -0.05; b.vz *= -0.1; b.vx *= 0.3; }
    if (b.y <= BALL.r && b.vy < 0) {
      const sp = Math.hypot(b.vx, b.vy, b.vz);
      if (-b.vy > 0.9) { const x = b.x, z = b.z; bounce(b, this.env, null, false); this.emit('bounce', { x, z, speed: sp, first: false, good: true, dead: true, vy: 0 }); }
      else { b.y = BALL.r; b.vy = 0; const k = Math.max(0, 1 - 2.2 * dt); b.vx *= k; b.vz *= k; b.wx *= k; b.wz *= k; }
    }
    this.arenaWalls(b);
  }

  let() {
    if (this.online && !this.applying && this.onJudged) this.onJudged({ type: 'let' });
    this.emit('let', {});
    this.ball.live = false;
    this.phase = 'over'; this.timer = this.quick ? 0.8 : 1.6; this.nextGap = this.quick ? 0.2 : 1.5; this.phaseT = 0;
    const sv = this.players[this.score.server]; if (sv.stats.s1Tot > 0 && this.score.serveNum === 1) { /* first serve replayed: not counted */ }
    this.replayServe = true;
  }
  fault(why, d) {
    if (this.online && !this.applying && this.onJudged) this.onJudged({ type: 'fault', why, d });
    const was = this.applying; this.applying = true; try { this.faultIn(why, d); } finally { this.applying = was; }
  }
  faultIn(why, d) {
    const s = this.score, sv = this.players[s.server];
    this.ball.live = false;
    if (s.serveNum === 1) {
      s.serveNum = 2;
      this.emit('fault', { why, serveNum: 1, ...(d || {}) });
      this.phase = 'over'; this.timer = this.quick ? 0.8 : 1.3; this.nextGap = this.quick ? 0.2 : 1.6; this.phaseT = 0;
    } else {
      sv.stats.df++;
      this.emit('fault', { why, serveNum: 2, ...(d || {}) });
      this.endPoint(1 - s.server, 'doubleFault', d);
    }
  }
  endPoint(w, why, d) {
    if (this.online && !this.applying && this.onJudged) this.onJudged({ type: 'point', w, why, d });
    const s = this.score, b = this.ball, l = 1 - w, sv = s.server;
    b.live = false;
    const W = this.players[w], L = this.players[l];
    // attribute the point
    const ci = this.contactInfo;
    let cls = why;
    if (why === 'net' || why === 'long' || why === 'wide') {
      const forced = ci && ci.who === l && ci.diff >= TUNE.forced;
      cls = forced ? 'forced' : 'unforced';
      if (forced) L.stats.fe++; else L.stats.ue++;
    } else if (why === 'winner') { W.stats.winners++; if (ci && ci.who === w) { if (ci.wing === 'fh') W.stats.fhW++; else W.stats.bhW++; } }
    else if (why === 'ace') { W.stats.aces++; W.stats.winners++; }
    else if (why === 'serviceWinner') L.stats.fe++;
    else if (why === 'whiff') L.stats.fe++;
    // serve accounting
    const S = this.players[sv].stats, R = this.players[1 - sv].stats;
    if (why !== 'doubleFault') { if (s.serveNum === 1) { if (w === sv) S.s1Won++; } else { S.s2Tot++; if (w === sv) S.s2Won++; } }
    else S.s2Tot++;
    R.retTot++; if (w !== sv) R.retWon++;
    for (const p of this.players) { if (p.wentNet) { p.stats.netPts++; if (p.i === w) p.stats.netWon++; } p.wentNet = false; p.stats.maxRally = Math.max(p.stats.maxRally, this.rally); }
    const bp = this.isBreakPoint(); if (bp) this.players[1 - sv].stats.bpTot++;
    const val = this.pointValue(w);
    const rec = { winner: w, why, cls, rally: this.rally, server: sv, serveNum: s.serveNum, bp, val, t: this.t, dur: this.t - this.pointStart, x: d && d.x, z: d && d.z, miss: d && d.miss, lastHitter: b.lastHit, wing: ci && ci.wing, kind: ci && ci.kind, speed: b.lastSpeed };
    this.history.push(rec); this.lastPoint = rec;
    W.mood = val >= 1 || this.rally >= 7 || why === 'winner' ? 1 : 0.4; W.moodT = this.t;
    L.mood = cls === 'unforced' || why === 'doubleFault' ? -1 : -0.4; L.moodT = this.t;
    this.awardPoint(w);
    s.serveNum = 1;
    this.emit('point', rec);
    this.phase = 'over'; this.phaseT = 0;
    // a long rally earns a longer breather, as it does on tour
    this.timer = 2.4 + Math.min(1.6, this.rally * 0.12);
    this.nextGap = 4.5 + Math.min(4, this.rally * 0.3);
    if (this.quick) { this.timer = 1.25 + Math.min(0.5, this.rally * 0.04); this.nextGap = 0; this.cutSent = false; }
    this.replayServe = false;
  }

  // ---------- contact ----------
  makeIncoming() {
    const b = this.ball;
    const pr = predict(b, this.env, { bounces: 1, path: true, dt: 1 / 120, maxT: 4.5 });
    return { t0: this.t, land: pr.land, land2: pr.land2, path: pr.path, netY: pr.netY, from: b.lastHit, bounced: b.bounces > 0, apex: pr.apex };
  }

  resolveServe(p) {
    const b = this.ball, st = p.stroke, prof = p.prof, it = st.intent || {}, rng = this.rng, s = this.score;
    st.done = true; st.tEnd = this.t;
    const first = s.serveNum === 1;
    const type = it.type || (first ? 'flat' : 'kick');
    const contactH = serveContactH(prof);
    // how well the toss was met: the ball should be within a hand's width of ideal height
    const tim = st.timing || 0;                       // seconds off the ideal
    const dy = b.y - contactH;
    // 1 = on the button. A person's swing is clean anywhere inside the timing window.
    let q = st.auto ? clamp(1 - Math.abs(tim) / 0.16, 0, 1) : clamp(1 - Math.max(0, Math.abs(tim) - this.timingWindow[p.i]) / 0.14, 0, 1);
    if (b.y < prof.height * 1.1 || b.y > contactH + 0.5 || Math.abs(tim) > 0.26) {
      // swung at air: the toss drops, play it again
      this.emit('tossMiss', { who: p.i });
      p.stroke = null; this.phase = 'ready'; this.phaseT = 0; b.held = p.i;
      return;
    }
    st.hit = true;
    const spec = serveSpec(prof, type, first, it.pace == null ? 1 : it.pace, rng);
    // A Perfect serve (inside half the window) is near-perfect too (he said "the perfect shots should be like almost perfect,
    // especially serves"): to the line it was aimed along - the T or wide - deep in the box, 6% harder, a fifth of the scatter
    // (which otherwise keeps each man's first serves going in as often as his do). A person's only. `__perfectOld`.
    const swin = this.timingWindow[p.i], pf = !st.auto && !globalThis.__perfectOld ? 1 - clamp((Math.abs(tim) - swin * 0.5) / Math.max(0.005, swin * 0.5), 0, 1) : 0;
    let stx = it.tx, stz = it.tz;
    if (pf > 0) { const ax = Math.abs(stx), dz = Math.abs(stz), sg = Math.sign(stx) || 1;
      if (ax > COURT.halfW * 0.55) stx = sg * (ax + (COURT.halfW - (globalThis.__pfSrvX ?? 0.3) - ax) * pf);
      else if (ax < COURT.halfW * 0.35) stx = sg * (ax + ((globalThis.__pfSrvX ?? 0.3) - ax) * pf);
      stz = Math.sign(stz) * (dz + (COURT.svc - (globalThis.__pfSrvZ ?? 0.5) - dz) * pf); }
    let speed = spec.kmh / 3.6 * lerp(0.80, 1, q) * (1 + (globalThis.__pfSrvV ?? 0.06) * pf);
    const p0 = { x: b.x, y: clamp(b.y, contactH - 0.3, contactH + 0.15), z: p.z - p.sgn * 0.45 };
    const top = spec.top * lerp(0.8, 1, q), side = spec.side * p.hs;
    let sol = null;
    for (let k = 0; k < 22; k++) {
      sol = solveShot(p0, stx, stz, speed, top, side, this.env, false);
      if (!sol.ok) { speed *= 1.05; continue; }
      if (sol.clear < spec.minClear) { speed *= 0.972; continue; }
      break;
    }
    if (!sol || !sol.ok) sol = { el: -0.07, az: Math.atan2(stx - p0.x, stz - p0.z), speed, top, side };
    const cal = this.calib[p.i];
    const kq = (first ? cal.k1 : cal.k2) * lerp(2.4, 1, q) * (st.auto ? 1 : (it.sigma || 1)) * this.diffScale[p.i] * (spec.sig || 1) * (1 - (globalThis.__pfSrvAcc ?? 0.9) * pf);
    const el = sol.el + rng.g() * SERVE_SIG.el * kq - (dy < -0.12 ? (-dy - 0.12) * 0.12 : 0);
    const az = sol.az + rng.g() * SERVE_SIG.az * kq;
    const v = sol.speed * (1 + rng.g() * SERVE_SIG.v * kq);
    fire(b, p0, v, el, az, top * (1 + rng.g() * 0.06), side * (1 + rng.g() * 0.08));
    b.live = true; b.lastHit = p.i; b.bounces = 0; b.isServe = true; b.netTouched = false; b.lastSpeed = v;
    this.phase = 'live'; this.phaseT = 0; this.rally = 1; this.pointStart = this.t;
    const S = p.stats;
    if (first) { S.s1Tot++; }
    S.fastest = Math.max(S.fastest, v * 3.6); S.shots++;
    this.contactInfo = { who: p.i, diff: 0, wing: 'fh', kind: 'serve' };
    this.incoming = this.makeIncoming();
    { const L = this.incoming.land, ax = L ? Math.abs(L.x) : 2, az = L ? Math.abs(L.z) : 0;
      const corner = Math.max(clamp((ax - 2.7) / 1.3, 0, 1), clamp((0.7 - ax) / 0.7, 0, 1)) * clamp((az - 4.6) / 1.8, 0, 1);
      b.threat = clamp(0.7 * clamp((v * 3.6 - 165) / 55, 0, 1) + 0.4 * corner, 0, 1) * lerp(0.7, 1, q) * 0.85; }
    // count it as "in" on the bounce; pre-compute for stats
    const lz = this.incoming.land, landSide = p.i === 0 ? -1 : 1;
    const right = this.deuceSide ? landSide > 0 : landSide < 0;
    const willIn = lz && inServiceBox(lz.x, lz.z, landSide, right) && (this.incoming.netY == null || this.incoming.netY - BALL.r > netHeightAt(0) - 0.02);
    if (first && willIn) { S.s1In++; S.s1Sum += v * 3.6; S.s1N++; } else if (!first && willIn) { S.s2Sum += v * 3.6; S.s2N++; }
    this.emit('hit', { who: p.i, kind: 'serve', pf, stype: type, speed: v,   /* (stype: an event's own `type` is 'hit') */ x: p0.x, y: p0.y, z: p0.z, q, serveNum: s.serveNum, power: 1, top, side });
    if (this.online && p.i === 0) this.shotOut(p, 'serve', 'fh', v, 0, type);
    if (this.shotLog) this.shotLog.push({ who: p.i, kind: 'serve', type, first, kmh: v * 3.6, h: p0.y, top, land: lz, clear: sol.clear, willIn, tgt: [stx, stz], pf });
  }

  // The racket arrives. Is the ball there, and what comes off the strings?
  resolveStroke(p) {
    const b = this.ball, st = p.stroke, prof = p.prof, rng = this.rng, env = this.env;
    st.done = true; st.tEnd = this.t;
    if (!b.live || b.lastHit === p.i) return;
    if (b.isServe && b.bounces === 0) return;                 // the serve must bounce
    // geometry at contact
    const relX = (b.x - p.x) * p.sgn * p.hs;                  // + on the forehand side
    const relZ = (p.z - b.z) * p.sgn;                         // + in front of the body
    const lat = Math.abs(relX), h = b.y;
    const hiMax = b.bounces === 0 ? REACH.jump : REACH.hi;
    const reachMax = REACH.max * (prof.height / 1.85);
    const mer = st.merciful ? (this.mercy ? this.mercy[p.i] : 1) : 0;   // classic controls: a wider reach, most of all behind him (less of it on the harder levels)
    // (a late press with the first game's controls still meets a ball that has come through past him by up to two metres, at every
    // level: at Tour's 1.24 m, pressed as the ball reached him he swung at air one ball in six - "the assist keeps setting up to miss
    // shots". Late, it comes off weak; it is not missed. `__lateReachOld`)
    const merB = st.merciful && !globalThis.__lateReachOld ? Math.max(mer, 0.8) : mer;
    if (lat > reachMax * (1 + 0.12 * mer) || relZ < -(REACH.back + 2.1 * merB) || relZ > REACH.front + 0.35 * mer || h < REACH.lo || h > hiMax + 0.2 * mer || b.z * p.sgn < -0.25) {
      this.emit('whiff', { who: p.i, lat, relZ, h });
      return;
    }
    st.hit = true; this.touchedBy[p.i] = true;
    const it = st.intent || {};
    const wing = relX >= -0.05 ? 'fh' : 'bh'; st.hitWing = wing; if (!st.wing) st.wing = wing;   /* (the side the body is already swinging on stays: switched at contact, the whole stroke would jump) */
    const vin = Math.hypot(b.vx, b.vy, b.vz), volley = b.bounces === 0, thr = b.threat || 0;
    const spinIn = Math.hypot(b.wx, b.wz) / (Math.PI / 30);
    const pSpeed = Math.hypot(p.vx, p.vz);
    let kind = it.kind || 'drive';
    const D = b.z * p.sgn;                                    // depth of contact on my side
    if (volley && (h > 1.95 || (!st.auto && !globalThis.__lobAirOld && h > 1.6 && this.incoming && (this.incoming.apex || 0) > 4)) && kind !== 'lob' && kind !== 'drop') kind = 'smash';   /* (a person's lob taken out of the air from the height of his head is put away as an overhead) */
    // a slow, floating ball taken out of the air between the waist and the head from back in the court is not punched,
    // it is swung at: the swinging volley (a person always may; the computer if he is the attacking kind)
    else if (volley && kind !== 'lob' && kind !== 'drop' && kind !== 'smash') kind = h > 1.05 && h < 1.95 && vin < 24 && D > 6.0 && (!st.auto || prof.agg > 0.55) ? 'drive' : 'volley';
    const halfVolley = !volley && h < 0.30 && this.incoming && (this.t - (this.incoming.t0 + (this.incoming.land ? this.incoming.land.t : 0))) < 0.12;
    // ---- difficulty: everything that makes this ball hard to hit well ----
    const stretch = Math.max(0, lat - REACH.comfy) / (reachMax - REACH.comfy);
    const jam = lat < 0.28 ? (0.28 - lat) / 0.28 : 0;
    let hPen;
    if (kind === 'volley') hPen = h < 0.75 ? (0.75 - h) / 0.75 * 1.3 : h > 1.7 ? (h - 1.7) * 0.6 : 0;
    else if (kind === 'smash') hPen = h < 2.2 ? (2.2 - h) * 1.2 : 0;
    // a person set for a high ball can take it on up to the shoulders; above that, and for the computer's plan, it gets harder
    else { const hiAt = !st.auto ? 1.6 : wing === 'bh' && prof.oneHandBh ? 1.25 : lerp(1.42, 1.55, prof.agg); hPen = h < 0.55 ? (0.55 - h) / 0.55 * 1.0 : h > hiAt ? (h - hiAt) / 0.8 * 0.85 : 0; }
    const rushed = st.auto ? clamp((0.30 - (st.tc - st.t0)) / 0.30, 0, 1) : 0;
    // A ball that sits up between the waist and the chest, met by a person with time to set himself, is one to
    // go after: his drive off it goes harder and flatter, and the extra pace is not held against him.
    const power0 = clamp(it.power == null ? 0.6 : it.power, 0, 1);
    const upK = clamp((h - 0.98) / 0.35, 0, 1) * (1 - clamp((h - 1.7) / 0.3, 0, 1)), sitsUp = (!st.auto || it.state === 'attack') && !volley && (kind === 'drive' || kind === 'flat') ? upK * upK * (3 - 2 * upK) * (1 - clamp(stretch * 1.5, 0, 1)) * (1 - 0.5 * clamp(pSpeed / 5, 0, 1)) : 0;
    let power = Math.min(1, power0 + 0.26 * sitsUp);
    // a human's release is clean anywhere inside the timing window; only the excess counts against it
    // Pressure timing (as TopSpin 2K25's meter): a person's clean window is narrower against a fast ball, deep in a long rally and when
    // he is stretched or running, and wider off a slow ball that sits up for him; outside it the timing costs (below). He asked for it
    // after "all you do is hit the space bar and aim the shots ... it feels like you have little control of the game".
    const pressOn = !st.auto && !globalThis.__pressureOld;
    const prK = pressOn ? clamp(lerp(1.25, 0.6, clamp((vin - 14) / 22, 0, 1)) * lerp(1, 0.75, clamp((this.rally - 4) / 12, 0, 1)) * (1 - 0.45 * clamp(stretch * 1.2 + Math.pow(pSpeed / 6, 2) * 0.5, 0, 1)) * (1 + 0.35 * sitsUp), 0.4, 1.6) : 1;
    const timRaw = st.timing == null ? 0 : st.timing, win = pressOn ? this.timingWindow[p.i] * prK : this.windowFor(p.i);
    // the computer's timing is perfect off an ordinary ball; a better one makes him a little early or late too
    const aTim = st.auto ? rng.g() * TUNE.cpuTim * thr * lerp(1.25, 0.75, prof.cons) : 0;
    const tim = st.auto ? aTim : Math.sign(timRaw) * Math.max(0, Math.abs(timRaw) - win);
    const timAbs = Math.abs(tim);
    // An easy ball - coming slowly (at contact a rally ball comes at a median 48 km/h; full under 34, none over 49), met nearly standing still, not stretched or jammed, between the knee and the shoulder - well
    // timed, is one a tour player puts away: harder, flatter, lower over the net and nearer where he meant it. (Playing Nadal he said
    // "even the easy balls dont go fast or accurate ... or flat": off easy balls a person's drives went 128-135 km/h whoever he was,
    // landed a median 0.86 m from his aim, 8% missed; only a ball above 0.98 m counted as sitting up.) A person's only; the more
    // easy and the cleaner the timing (inside half the window all of it, none at its edge), the more. `__easyOld`.
    const easyT = !st.auto && !volley && (kind === 'drive' || kind === 'flat') && !globalThis.__easyOld
      ? clamp(((globalThis.__easyV ?? 13.5) - vin) / (globalThis.__easyW ?? 4), 0, 1) * (1 - clamp(stretch * 2, 0, 1)) * (1 - clamp((pSpeed - 1) / 2, 0, 1)) * clamp((h - 0.45) / 0.25, 0, 1) * (1 - clamp((h - 1.7) / 0.3, 0, 1)) * (1 - jam) * (1 - clamp((Math.abs(timRaw) - win * 0.5) / Math.max(0.005, win * 0.5), 0, 1))
      : 0;
    if (easyT > 0) power = Math.min(1, power + (globalThis.__easyPow ?? 0.25) * easyT);
    st.easy = easyT;
    // Perfect (inside half the timing window, as the game calls it; fading out to the window's edge) is near-perfect: he said "the
    // perfect shots should be like almost perfect" and "im playing perfectly with nadal and still not hammering it close to the line
    // pulling the opponent out of the court". It went where a Good one went, 0.65 m inside the sideline at the widest he could aim and
    // 1.7 m inside the baseline at the deepest, with 60% of the scatter at Tour. Now: to the line he aims at, a full angle across court
    // short and wide, harder and lower over the net, a fraction of the scatter. A person's only. `__perfectOld`.
    // (With the first game's controls a press made early is held and the swing goes on the moment, so it always measured Perfect:
    // 98% of the test bot's shots. Perfect is a press made on the moment - within 0.09 s before it, fading out by 0.18 s; one made
    // earlier plays as before, Good.)
    const lead = st.pressE != null ? 0 : (it.pressLead || 0), pfLead = 1 - clamp((lead - (globalThis.__pfLead ?? 0.09)) / 0.09, 0, 1);
    // (volleys and overheads too: he said "the assist keeps mistiming net shots and volleys" - timed within 0.06 s, no volley was ever
    // Perfect, so every one read Good, Early or Late and played as an ordinary volley. `__volPfOld`)
    const pf = !st.auto && !globalThis.__perfectOld && (!volley || !globalThis.__volPfOld) && (kind === 'drive' || kind === 'flat' || kind === 'loop' || kind === 'slice' || kind === 'volley' || kind === 'smash') ? (st.pressE != null ? 1 - clamp(((st.pressE < 0 ? -st.pressE - PF_EARLY : st.pressE - PF_LATE)) / 0.02, 0, 1) : (1 - clamp((Math.abs(timRaw) - win * 0.5) / Math.max(0.005, win * 0.5), 0, 1)) * pfLead) : 0;
    if (pf > 0 && kind !== 'slice') power = Math.min(1, power + 0.12 * pf);
    st.perfect = pf;
    const retPen = b.isServe ? clamp((vin - 17) / 12, 0, 1.4) * lerp(1.15, 0.80, prof.ret) * TUNE.retPen : 0;
    let diff = clamp((vin - 12) / 22, 0, 1.4) * TUNE.pacePen + hPen + Math.pow(pSpeed / 5.5, 2) * TUNE.runPen * (volley ? 0.55 : 1) + stretch * stretch * TUNE.stretchPen + jam * 0.6
             + rushed * 0.7 + Math.max(0, power0 - 0.78) * TUNE.powPen + (halfVolley ? 0.8 : 0) + spinIn / 4000 * 0.22 + retPen
             + (st.bad || 0) + clamp(timAbs / 0.07, 0, 2.2) * 0.75 + thr * TUNE.thrPen;
    // taken on the rise, straight off the bounce, there is no time to read it
    const sinceB = !volley && this.incoming && this.incoming.land ? this.t - (this.incoming.t0 + this.incoming.land.t) : 1;
    if (!volley && sinceB < 0.2 && !halfVolley) diff += (0.2 - sinceB) / 0.2 * 0.55;
    if (relZ < 0.05) diff += Math.min(st.merciful ? 0.5 : 9, (0.05 - relZ) * 1.6);             // caught late, beside or behind the body
    st.onRun = pSpeed > 2.8;
    // ---- what the player is trying to do ----
    const wingKmh = wing === 'fh' ? prof.fhKmh : prof.bhKmh, wingRpm = wing === 'fh' ? prof.fhRpm : prof.bhRpm;
    const weak = clamp(stretch * 1.1 + Math.pow(pSpeed / 7, 2) * 0.5 + rushed * 0.5 + jam * 0.4 + (relZ < 0 ? 0.3 : 0) + retPen * TUNE.retWeak, 0, 1);
    // ---- a person's groundstroke (he said "rework the entire shooting system - i hate it right now. i feel completely powerless even
    // with good aim and perfect strokes even though i should be smashing through players"). Its quality Q is how well he met it:
    // his timing - Perfect 1, Good 0.72 falling to 0.5 at the window's edge, off the window down to 0.15 - less what the ball did to
    // him (stretched, jammed, running, dug out low), and a little more off an easy ball. Q, not a chosen power, sets how hard the
    // racket comes through: the pace (from his own average up to 1.36 times it - 170 km/h off Nadal's 127), the spin that comes with
    // it and keeps a hard ball in, how low over the net, how near his aim, and how hard it is to send back. (Before, the pace was the
    // game's choice and was then cut until the ball cleared the net by its margin, so a perfect stroke went about as fast as any.)
    // `__strikeOld`.
    const strike = !st.auto && !globalThis.__strikeOld && !volley && (kind === 'drive' || kind === 'flat' || kind === 'loop');
    let Q = 0;
    if (strike) { const ta = Math.abs(timRaw), half = win * 0.5;
      // (Perfect from 0.07 s early to 0.10 s late: what he sees and presses reaches the game 30-80 ms after it happens - the screen's
      // and the keyboard's delay - and at ±0.06 he said "still cant get any perfects")
      const e = st.pressE, tq = e != null
        ? (e <= 0 ? (-e <= PF_EARLY ? 1 : -e <= 0.16 ? lerp(1, 0.72, (-e - PF_EARLY) / (0.16 - PF_EARLY)) : lerp(0.72, 0.45, clamp((-e - 0.16) / 0.2, 0, 1)))       // early: held and swung on time, a little less each tenth
                  : (e <= PF_LATE ? 1 : e <= 0.17 ? lerp(1, 0.6, (e - PF_LATE) / (0.17 - PF_LATE)) : lerp(0.6, 0.15, clamp((e - 0.17) / 0.1, 0, 1))))     // late: it gets past him
        : ta <= half ? lerp(0.72, 1, pfLead) : ta <= win ? lerp(0.72, 0.5, (ta - half) / Math.max(1e-3, half)) : lerp(0.5, 0.15, clamp((ta - win) / 0.07, 0, 1));
      const dq = 1 - clamp(weak * 0.75 + jam * 0.3 + (h < 0.45 ? (0.45 - h) * 1.2 : 0), 0, 0.75);
      Q = clamp(tq * dq + 0.12 * easyT, 0, 1); }
    st.q = Q;
    let v, top, side = 0, minClear, sig = 1, mode = 'speed', el = 0;
    let tx = it.tx == null ? 0 : it.tx, tz = it.tz == null ? -p.sgn * 9 : it.tz;
    // on the easier levels the target is kept far enough inside the lines for this particular ball
    if (!st.auto && this.aimSafe[p.i] > 0 && kind !== 'drop' && kind !== 'lob') {
      const R = ringOf(kind === 'drive' && (it.kind === 'flat') ? 'flat' : kind, prof, this.diffScale[p.i], diff), a = this.aimSafe[p.i];
      const mx = Math.max(0.2, COURT.halfW - R.x * a), mz = Math.max(COURT.svc - 0.5, COURT.halfLen - R.z * a);
      tx = clamp(tx, -mx, mx); if (Math.abs(tz) > mz) tz = Math.sign(tz) * mz;
    }
    const lineK = strike ? clamp((Q - 0.55) / 0.4, 0, 1) : pf;   // (the better struck, the nearer the line he aims at)
    if (lineK > 0) { const pf = lineK;
      const ax = Math.abs(tx), dz = Math.abs(tz), lineX = COURT.halfW - (globalThis.__pfLineX ?? 0.3), lineZ = COURT.halfLen - (globalThis.__pfLineZ ?? 0.75);
      if (ax > 1.0) tx = Math.sign(tx) * (ax + (lineX - ax) * pf * clamp((ax - 1.0) / 1.5, 0, 1));          // an angle aimed goes to the line
      const cross = ax > 2.8 && Math.sign(tx) === -Math.sign(b.x || 1e-6) && Math.abs(b.x) > 0.6;
      if (cross && dz < 9.8) tz = Math.sign(tz) * lerp(dz, globalThis.__pfAngleZ ?? 10.2, 0.7 * pf);                 // across court as wide as it goes: to the deep corner by the sideline, out wide after it bounces (aimed short, at 8 m, it could not be hit hard: 95-115 km/h)
      else if (dz > 8.5) tz = Math.sign(tz) * (dz + (lineZ - dz) * pf);                                          // deep goes to the baseline
    }
    const forceBlock = !volley && (stretch > 0.75 || (weak > 0.8 && kind !== 'lob'));
    if (forceBlock && kind !== 'lob') kind = kind === 'slice' || wing === 'bh' ? 'slice' : 'block';
    // Under pressure the ball does not go where it was meant to: it drops short and drifts
    // toward the middle. This is what hands the other player the next shot.
    if (kind !== 'lob' && kind !== 'drop' && kind !== 'smash' && weak > 0.05) {
      const depth = Math.abs(tz), shorter = Math.max(Math.min(depth, 5.2), depth - weak * TUNE.weakShort);
      tz = Math.sign(tz) * shorter; tx *= 1 - TUNE.weakMid * weak;
    }
    // (and off the window the ball goes off line: early, the racket comes round sooner and pulls it - a forehand across his body, a backhand
    // the other way; late, it is pushed the other way. About 0.7 m for three hundredths of a second, at most 1.6 m.)
    if (pressOn && tim !== 0 && kind !== 'drop' && kind !== 'lob' && !volley) { const fhX = (p.hs || 1) * p.sgn; tx += (wing === 'fh' ? -1 : 1) * Math.sign(tim) * fhX * Math.min(1.6, Math.abs(tim) * 22); }
    let dropEl0 = 0;
    switch (kind) {
      case 'flat':  v = wingKmh / 3.6 * lerp(0.98, 1.34, power); top = wingRpm * 0.5; minClear = 0.22; sig = 1.25; break;
      case 'loop':  v = wingKmh / 3.6 * lerp(0.66, 0.84, power); top = wingRpm * 1.25; minClear = 1.15; sig = 0.8; break;
      case 'slice': v = lerp(19.5, 28.5, power) + vin * 0.06; top = -lerp(1700, 3100, prof.touch) * lerp(0.9, 1.1, power); side = (wing === 'fh' ? -1 : 1) * 350 * p.hs; minClear = 0.14; sig = 0.82; break;
      case 'block': v = 12.5 + vin * 0.38; top = -700; minClear = 0.4; sig = 1.0; break;
      // From further back a drop shot is played flatter, as low over the net as he dares (below): sent up at the same 30-36
      // degrees from the baseline as from the service line, the ball looped, came down steeply and sat up a metre and a half
      // after its bounce, an easy ball for anyone to run down.
      case 'drop':  mode = 'el'; el = lerp(0.5, 0.62, clamp((1.2 - h) / 1.2, 0, 1)) + (D < 6 ? -0.12 : 0); dropEl0 = el; el -= (globalThis.__dropElOld ? 0 : (globalThis.__dropDeep ?? 0.25) * clamp((D - 7) / 5, 0, 1)); top = -lerp(2200, 3400, prof.touch); minClear = 0.2; sig = 1.25 - prof.touch * 0.4; break;
      case 'lob':   mode = 'el'; el = lerp(0.66, 0.86, clamp(power, 0, 1)); top = weak > 0.5 ? -600 : wingRpm * 0.85; minClear = 2; sig = 1.15; break;
      case 'volley':v = (lerp(14, 27, power) + vin * 0.22) * (1 + 0.15 * pf); top = -lerp(600, 1500, 1 - power); minClear = 0.14; sig = lerp(1.25, 0.8, prof.volley); break;   // (a Perfect volley punched crisper)
      case 'smash': v = lerp(36, 49, power) * lerp(0.9, 1.02, prof.volley) * (1 + 0.08 * pf); top = 700; minClear = 0.12; sig = 0.95; break;
      // a rally drive goes well over the net and comes down steep enough to kick up (tour forehands clear it by
      // about a metre); only a ball struck to finish the point is driven low and flat
      default:      kind = 'drive'; v = wingKmh / 3.6 * lerp(0.80, 1.20, power); top = wingRpm * lerp(1.06 + 0.16 * clamp((wingRpm - 2600) / 700, 0, 1), 0.92, power); /* a heavy-topspin player's rally ball carries more than his average, his drive less */ minClear = lerp(0.86, 0.32, clamp((power - 0.55) / 0.45, 0, 1)); sig = 1;
    }
    // In a person's hands the length of the hold shapes the topspin shot: a short tap is the
    // rally ball — slower, heavier, well over the net — and a long hold flattens it into a drive.
    if (!st.auto && kind === 'drive') { const w = loopW(power); v *= lerp(1, 0.86, w); top *= lerp(1, 1.2, w); minClear = lerp(0.28, 1.05, w); sig = lerp(1, 0.82, w); if (w > 0.6) st.loop = true; }
    // His own arc: a flat hitter (Connors, Agassi) drives the ball low over the net at his own pace and it skids through;
    // a heavy topspin player keeps his margin and it kicks up. The court shifts everyone (more margin on clay, less on grass).
    if ((kind === 'drive' || kind === 'loop')) minClear *= clamp(1 + (wingRpm - 2500) / 2000 * 0.75, 0.7, 1.15) * (prof.arcS || 1);
    if (pf > 0 && (kind === 'drive' || kind === 'flat')) { v *= 1 + 0.04 * pf; top *= 1 - 0.12 * pf; minClear *= 1 - (globalThis.__pfClr ?? 0.3) * pf; }   // (Perfect: harder, lower)
    if (easyT > 0 && (kind === 'drive' || kind === 'flat')) { v *= 1 + 0.06 * easyT; top *= 1 - (globalThis.__easyTop ?? 0.3) * easyT; minClear *= 1 - (globalThis.__easyClr ?? 0.45) * easyT; }   // (harder, flatter, lower: the easy ball, above)
    // a faster incoming ball comes back faster; a stretched or late one comes back softer
    if (mode === 'speed' && kind !== 'slice' && kind !== 'block' && kind !== 'volley') { v *= 1 + clamp((vin - 14) / 60, -0.06, 0.12); v *= 1 - 0.34 * weak; top *= 1 - 0.3 * weak; }
    // low balls cannot be ripped: the strings can only lift so much
    if (kind === 'drive' || kind === 'flat') { const low = clamp((0.5 - h) / 0.5, 0, 1); v *= 1 - 0.22 * low; top *= 1 + 0.12 * low; }
    let topMax = top;
    if (strike) { const loopy = kind === 'loop' || !!st.loop;
      { const sH0 = kind === 'flat' || globalThis.__shapeOld ? 0 : clamp((wingRpm - 2900) / 700, 0, 1), dz0 = Math.abs(tz); if (sH0 > 0 && dz0 > 8.5) tz = Math.sign(tz) * (dz0 - (globalThis.__shDepth ?? 0.8) * sH0); }
      // (each man's own shape: a heavy topspin hitter - Nadal, the more so on clay, where he spins it most - gives up a little pace for
      // much more spin and a higher arc, so the ball dives and kicks up off the court; he said "nadals balls dont feel the same,
      // especially on clay, not enough bounce or topspin feel": struck alike, everyone's went fast and low. And the top pace a little
      // lower: "the speed boost is lowk too much", 1.36 times his average at Perfect, now 1.27)
      const sH = kind === 'flat' || globalThis.__shapeOld ? 0 : clamp((wingRpm - 2900) / 700, 0, 1);
      v = wingKmh / 3.6 * lerp(0.92, globalThis.__strikeTop ?? 1.27, Q) * (kind === 'flat' ? 1.06 : 1) * (loopy ? 0.82 : 1) * (1 - 0.18 * clamp((0.5 - h) / 0.5, 0, 1)) * (1 - (globalThis.__shV ?? 0.12) * sH);
      top = kind === 'flat' ? wingRpm * lerp(0.45, 0.6, Q) : Math.min(globalThis.__topCap ?? 4500, wingRpm * lerp(1.0, 1.22, Q) * (1 + (globalThis.__shTop ?? 0.32) * sH) * (loopy ? 1.15 : 1));
      minClear = (loopy ? lerp(1.4, 1.0, Q) : lerp(1.0, globalThis.__strikeClr ?? 0.3, Q) + (globalThis.__shClr ?? 0.9) * sH * lerp(1, 0.8, Q)) * (prof.arcS || 1);
      topMax = kind === 'flat' ? top * 1.25 : Math.max(top, Math.min(5000, top * 1.45)); }   /* (5000 rpm at most: as hard as Nadal ever spun one, he said) */   // (to keep a hard ball in, more spin before less pace)
    if (globalThis.__dbgStrike && strike && (globalThis.__dbgN = (globalThis.__dbgN || 0) + 1) < 12) globalThis.__dbgL = (globalThis.__dbgL || []).concat([{ wing, kind, Q: +Q.toFixed(2), wingRpm: Math.round(wingRpm), v: +(v * 3.6).toFixed(0), top: Math.round(top), minClear: +minClear.toFixed(2), tz: +tz.toFixed(2) }]);
    const p0 = { x: b.x, y: b.y, z: b.z };
    let sol = null;
    if (mode === 'el') {
      sol = solveSpeed(p0, tx, tz, el, top, side, env);
      // (the flatter drop shot from the back still has to clear the net by enough that his usual miss does not find the tape)
      for (let k = 0; k < 10 && kind === 'drop' && el < dropEl0 && (!sol || !sol.ok || sol.clear < (globalThis.__dropClr ?? 0.3)); k++) { el = Math.min(dropEl0, el + 0.03); sol = solveSpeed(p0, tx, tz, el, top, side, env); }
    }
    else {
      for (let k = 0; k < 34; k++) {
        sol = solveShot(p0, tx, tz, v, top, side, env, false);
        if (!sol.ok) { v *= 1.06; continue; }
        if (sol.clear < minClear) { if (top < topMax - 1) { top = Math.min(topMax, top * 1.1); continue; } v *= 0.965; continue; }
        break;
      }
    }
    if (!sol || !sol.ok) sol = { el: 0.25, az: Math.atan2(tx - p0.x, tz - p0.z), speed: v || 18, top, side, clear: 0, land: null };
    if (globalThis.__dbgStrike && strike && globalThis.__dbgL && globalThis.__dbgL.length && !globalThis.__dbgL[globalThis.__dbgL.length - 1].out) globalThis.__dbgL[globalThis.__dbgL.length - 1].out = { v: +(sol.speed * 3.6).toFixed(0), top: Math.round(sol.top), clear: +(sol.clear || 0).toFixed(2), ok: sol.ok };
    // ---- execution: the swing is never exactly the one intended ----
    // A person's timing is his own: the random spread of a swing stands for the misjudgements a computer
    // player is not otherwise charged for, so a ball he times cleanly gets only part of it (the level sets
    // how much); a ball he times badly gets all of it, besides what the timing itself does to the shot.
    // what the game calls Perfect (inside half the window) gets the level's clean share; Good fades to all of it at the window's edge
    const clean = st.auto ? 1 : lerp(this.cleanK[p.i], 1, clamp((Math.abs(timRaw) - win * 0.5) / Math.max(0.005, win * 0.5), 0, 1));
    const steady = lerp(1.28, 0.92, prof.cons) * this.diffScale[p.i] * (it.sigma || 1) * clean;
    // a clean swing takes the level's share off the routine part of the spread only: off an easy ball it goes where it
    // was sent, while what makes a ball hard (pace, width, running, a stretch) is still all there
    const k = strike ? sig * this.diffScale[p.i] * (it.sigma || 1) * lerp(1.15, 0.9, prof.cons) * (0.12 + 1.3 * Math.pow(1 - Q, 1.2)) * (1 + 0.5 * clamp(diff / 1.5, 0, 1))
      : (st.auto ? sig * steady * (1 + diff) : sig * (steady / clean) * (clean + diff)) * (1 - (globalThis.__easyAcc ?? 0.4) * easyT) * (1 - (globalThis.__pfAcc ?? 0.82) * pf * (1 - 0.5 * clamp(diff / 1.5, 0, 1)));   // (and nearer his aim; Perfect most of all, less so off a hard ball)
    // timing drags the ball: early pulls it across the body, late pushes it wide
    const pull = -clamp(tim, -0.11, 0.13) * TUNE.timPull * (relX >= 0 ? 1 : -1) * p.hs * p.sgn;
    let outEl = sol.el + rng.g() * TUNE.sigEl * k - clamp(tim, -0.1, 0.1) * TUNE.timEl;
    const outAz = sol.az + rng.g() * TUNE.sigAz * k + pull;
    let outV = sol.speed * (1 + rng.g() * TUNE.sigV * k);
    if (!st.auto && !strike && timAbs > 0.03) outV *= 1 - clamp((timAbs - 0.03) * 2.2, 0, 0.25);
    // Off-centre contact: the ball comes off dead and low. This is where most balls in
    // the net come from -- a clean swing that is a few centimetres out on the strings.
    let mistimed = false;
    // (a person's mishits come from his timing: a ball he meets cleanly is seldom off the middle of the strings)
    const misK = st.auto ? 1 : lerp(0.35, 1.25, clamp(timAbs / Math.max(0.01, win), 0, 1));
    if (rng.u() < (TUNE.mis0 + TUNE.misD * diff) * steady * misK * (kind === 'slice' || kind === 'block' ? 0.6 : 1)) {
      mistimed = true; const u = rng.u();
      outV *= 1 - TUNE.misLoss * (0.35 + 0.65 * u); outEl -= TUNE.misDrop * u;
    }
    // a true shank off the frame when everything goes wrong at once
    let shank = false;
    if (rng.u() < clamp((diff - 1.7) * 0.16 + Math.max(0, stretch - 0.45) * TUNE.lungeShank, 0, 0.75) * steady) { shank = true; }
    const fEl = shank ? outEl + rng.g() * 0.12 + 0.05 : outEl, fAz = shank ? outAz + rng.g() * 0.14 : outAz;
    if (shank) outV *= rng.range(0.55, 0.85);
    // A ball struck at all reaches the net: one that would die on the striker's own side of it (a dead, low
    // mishit) is lifted just enough to carry there, so a miss is a ball into the net, not one that never gets to it.
    // And a ball that goes into the net goes in the way a real one does: struck too flat, hitting the net high up near
    // the tape, not lobbing up and dying into the bottom of it, which from behind looks like a ball that fell short.
    let fEl2 = fEl; const vCap = Math.max(outV, sol.speed) * 1.3;    // never past what the swing could put on it
    for (let k = 0; k < 24; k++) {
      fire(_carry, p0, outV, fEl2, fAz, sol.top, sol.side);
      const pr = predict(_carry, this.env, { bounces: 0, dt: 1 / 120, maxT: 3 });
      if (!pr.end) break;
      if (pr.netY == null && Math.sign(pr.end.z) === Math.sign(p0.z)) { fEl2 += 0.012; outV = Math.min(vCap, outV * 1.03); continue; }   // short of the net: more of everything
      if (pr.netY != null && pr.netY < netHeightAt(pr.netX || 0) - BALL.r && pr.netY < 0.58) { if (outV >= vCap) { fEl2 += 0.01; continue; } outV = Math.min(vCap, outV * 1.06); fEl2 -= 0.006; continue; }   // low into the net: flatter and harder (then higher)
      break;
    }
    fire(b, p0, outV, fEl2, fAz, sol.top * (1 + rng.g() * 0.07), sol.side);
    const wasServe = b.isServe;
    b.lastHit = p.i; b.bounces = 0; b.isServe = false; b.netTouched = false; b.lastSpeed = outV;
    this.rally++;
    p.stats.shots++;
    if (D < 6.2) p.wentNet = true;
    this.contactInfo = { who: p.i, diff, wing, kind, weak, stretch, h, vin, timing: timRaw, power, shank };
    this.incoming = this.makeIncoming();
    b.threat = shotThreat(outV, sol.top, this.incoming.land, diff, kind); if (strike && b.threat > 0) b.threat = clamp(b.threat + (globalThis.__strikeThr ?? 0.45) * Q * Q, 0, 1);   /* (a ball struck well is hard to send back: the other man's timing and footing suffer) */
    const q = st.auto ? 1 : clamp(1 - timAbs / 0.10, 0, 1);
    this.emit('hit', { who: p.i, kind, wing, speed: outV, x: p0.x, y: p0.y, z: p0.z, q, timing: st.auto ? null : timRaw, window: win, power, diff, shank, volley, ret: wasServe, top: sol.top, vin, pf: st.auto || globalThis.__perfectOld ? null : (st.perfect || 0), press: st.auto ? null : (st.pressE ?? null) });
    if (this.online && p.i === 0) this.shotOut(p, kind, wing, outV, diff);
    if (this.shotLog) this.shotLog.push({ who: p.i, kind, wing, kmh: outV * 3.6, h, diff, D, top: sol.top, land: this.incoming.land, clear: this.incoming.netY == null ? null : this.incoming.netY - netHeightAt(0), tgt: [tx, tz], vin: vin * 3.6, lat: relX, relZ, ret: wasServe, volley, state: it.state, slack: it.slack, rally: this.rally, pt: this.history.length, weak, pSpeed, mistimed, perfect: !st.auto && Math.abs(timRaw) < win * 0.5, pf: st.perfect || 0, q: st.q || 0, easy: st.easy || 0, power });
  }
}

// How good a ball is to have to play, 0..1: its pace, its spin, how deep and how wide it lands, and how cleanly it was
// struck. A drop shot or a lob is not measured this way: what makes those hard is the running.
function shotThreat(v, top, land, diff, kind) {
  if (kind === 'drop' || kind === 'lob' || kind === 'block' || !land) return 0;
  const ax = Math.abs(land.x), az = Math.abs(land.z);
  if (ax > COURT.halfW + 0.05 || az > COURT.halfLen + 0.05) return 0;
  const pace = clamp((v - 24) / 16, 0, 1), heavy = clamp((top - 2300) / 1700, 0, 1), deep = clamp((az - 8.2) / 3.4, 0, 1), wide = clamp((ax - 2.7) / 1.3, 0, 1);
  return clamp((0.5 * pace + 0.22 * heavy + 0.38 * deep + 0.32 * wide) * (1 - clamp(diff / 1.8, 0, 0.6)), 0, 1);
}

// ---- serve model ----
const SERVE_SIG = { el: 0.0078, az: 0.0125, v: 0.018 };
export function serveContactH(prof) { return prof.height * 1.50 + 0.03; }

// What each delivery is: pace from the player's measured averages, spin from the type.
export function serveSpec(prof, type, first, pace, rng) {
  const g = rng ? rng.g() : 0;
  if (type === 'flat') {
    const kmh = clamp(prof.s1Kmh * 1.03 + g * 7, prof.s1Kmh * 0.86, prof.s1Max) * lerp(0.86, 1, pace);
    return { kmh, top: 1100, side: 500, minClear: 0.07, sig: 1 };
  }
  if (type === 'slice') {
    const kmh = clamp(prof.s1Kmh * 0.93 + g * 6, prof.s2Kmh, prof.s1Max * 0.95) * lerp(0.88, 1, pace);
    return { kmh, top: 900, side: 2500, minClear: 0.10, sig: 0.93 };
  }
  // kick: heavy topspin with the sidespin reversed, so it jumps up and away
  const kmh = clamp(prof.s2Kmh + g * 5, prof.s2Kmh * 0.88, prof.s2Kmh * 1.12) * lerp(0.9, 1.04, pace);
  return { kmh, top: 3600, side: -1500, minClear: 0.38, sig: 0.8 };
}

// Where a serve is aimed. `spot`: 'T' | 'wide' | 'body'. Returns world coordinates.
// Size of the 19-in-20 landing zone for a shot of this kind and difficulty, measured from
// the engine's own scatter (a routine drive: 1.3 m either side, 2.5 m long).
// how much of a looped rally ball a human's topspin shot is, from the power of the hold
export const loopW = power => clamp((0.64 - power) / 0.30, 0, 1);
const RING_SIG = { flat: 1.25, loop: 0.8, slice: 0.82, block: 1.0, drop: 1.1, lob: 1.15, volley: 1.0, smash: 0.95, drive: 1 };
export function ringOf(kind, prof, scale, diff) {
  const k = (RING_SIG[kind] || 1) * lerp(1.28, 0.92, prof.cons) * (scale || 1) * (1 + diff);
  return { x: 1.0 * k, z: 1.92 * k, diff };
}

export function serveTarget(sgn, deuce, spot, margin) {
  // receiver's box, in the server's frame: far side, D negative; deuce box is on X<0 (cross-court)
  const m = margin == null ? 0.55 : margin;
  const sideX = deuce ? -1 : 1;
  let X;
  if (spot === 'T') X = sideX * (0.0 + m);
  else if (spot === 'wide') X = sideX * (COURT.halfW - m);
  else X = sideX * COURT.halfW * 0.5;
  const D = -(COURT.svc - (spot === 'body' ? 1.1 : 0.55 + m * 0.5));
  return { x: X * sgn, z: D * sgn };
}

// Scale the serve scatter so a player's first and second serves go in as often as his
// real ones do. Uses the local sensitivity of the landing point to launch error, so it is
// a few hundred multiplications rather than a few thousand ball flights.
export function calibrateServe(prof, env) {
  const rng = makeRng(12345);
  const draws = []; for (let i = 0; i < 220; i++) draws.push([rng.g(), rng.g(), rng.g()]);
  const H = serveContactH(prof), b = makeBall();
  const fit = (first, type, want) => {
    const spec = serveSpec(prof, type, first, 1, null);
    const cases = [];
    for (const spot of ['T', 'wide', 'body']) {
      const tg = serveTarget(1, true, spot, first ? lerp(0.62, 0.36, prof.aceAim == null ? 0.4 : prof.aceAim) : 0.95), p0 = { x: 0.9, y: H, z: COURT.halfLen - 0.1 };
      let v = spec.kmh / 3.6, sol = null;
      for (let k = 0; k < 22; k++) { sol = solveShot(p0, tg.x, tg.z, v, spec.top, spec.side, env, false); if (!sol.ok) { v *= 1.05; continue; } if (sol.clear < spec.minClear) { v *= 0.972; continue; } break; }
      if (sol && sol.ok) cases.push({ p0, sol });
    }
    if (!cases.length) return 1;
    // the same random draws at every scale, so the fraction that lands in is smooth in k
    const pIn = k => {
      let n = 0, tot = 0; const kk = k * spec.sig;
      for (const c of cases) for (const g of draws) {
        fire(b, c.p0, c.sol.speed * (1 + g[2] * SERVE_SIG.v * kk), c.sol.el + g[0] * SERVE_SIG.el * kk, c.sol.az + g[1] * SERVE_SIG.az * kk, spec.top, spec.side);
        const r = predict(b, env, { bounces: 0, dt: 1 / 160, maxT: 2 });
        tot++;
        if (r.land && r.netY != null && r.netY - netHeightAt(r.netX) > BALL.r && inServiceBox(r.land.x, r.land.z, -1, false)) n++;
      }
      return n / tot;
    };
    let lo = 0.1, hi = 7;
    for (let i = 0; i < 11; i++) { const m = (lo + hi) / 2; if (pIn(m) > want) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };
  // the AI meets the toss within a hundredth of a second, which costs about 8% of scatter
  return { k1: fit(true, 'flat', prof.firstIn) * 0.97, k2: fit(false, 'kick', prof.secondIn) * 0.80 };
}

export { COURT, clamp, lerp };
