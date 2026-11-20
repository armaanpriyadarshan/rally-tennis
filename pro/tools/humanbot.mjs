// A stand-in for a person at the keyboard and mouse, playing through the same controller
// the browser uses (js/human.js). It reacts late, lets go of the button a little early or
// late, and misses its aim by a metre or so — three presets of how much. Used to check that
// each difficulty setting is winnable by the kind of player it is meant for.
//   node tools/humanbot.mjs [points=600] [skill=casual|decent|sharp] [diff=0|1|2] [assist=0|1|2] [p0=Alcaraz] [p1=Sinner] [surface=hard]
import { Match, STEP, TIMING } from '../js/sim.js';
import { AI } from '../js/ai.js';
import { Human } from '../js/human.js';
import { COURT, makeRng } from '../js/physics.js';
import { PLAYERS, profileFor, DIFFICULTY, playerByName } from '../js/data.js';

export const SKILL = {
  casual: { react: 0.34, sigT: 0.075, sigAim: 0.80, margin: 1.7, split: 0.05, ringK: 1.0, defend: 0.1, hold: [0.20, 0.50], stopR: 0.7, sigServe: 0.060, serveMargin: 0.95, recover: 0.45 },
  decent: { react: 0.26, sigT: 0.050, sigAim: 0.55, margin: 1.3, split: 0.45, ringK: 1.0, defend: 0.5, hold: [0.30, 0.60], stopR: 0.5, sigServe: 0.040, serveMargin: 0.75, recover: 0.30 },
  sharp:  { react: 0.20, sigT: 0.030, sigAim: 0.35, margin: 1.0, split: 0.85, ringK: 0.9, defend: 0.9, hold: [0.35, 0.70], stopR: 0.4, sigServe: 0.025, serveMargin: 0.60, recover: 0.22 },
  elite:  { react: 0.17, sigT: 0.022, sigAim: 0.25, margin: 0.9, split: 0.95, ringK: 0.9, defend: 1.0, hold: [0.35, 0.70], stopR: 0.4, sigServe: 0.018, serveMargin: 0.45, recover: 0.20 },
};

class Bot {
  constructor(skill, seed, opts = {}) {
    this.S = skill; this.noKeys = !!opts.noKeys; this.rnd = makeRng(seed || 11).u;
    this.keys = new Set(); this.edges = []; this.pressed = new Set(); this.mv = { x: 0, y: 0 }; this.aimWant = null;
    this.btn = false; this.shot = null; this.lastInc = null; this.timings = []; this.swings = 0; this.noSwing = 0;
    const self = this;
    this.input = {
      takeMouse() { return self.mouse || { x: 0, y: 0 }; }, move() { return self.mv; }, down(c) { return self.keys.has(c); },
      takeEdges() { const e = self.edges; self.edges = []; return e; }, takePressed() { const p = self.pressed; self.pressed = new Set(); return p; },
    };
    this.game = { input: this.input, opts: { assist: opts.assist == null ? 2 : opts.assist, aimSens: 1, markers: true }, audio: null };
    this.human = new Human(this.game);
  }
  gauss() { const r = this.rnd; return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }
  update(m, i, dt) { this.think(m, i, dt); this.human.update(m, i, dt); }
  think(m, i, dt) {
    const S = this.S, H = this.human, p = m.players[i], o = m.players[1 - i], s = p.sgn, b = m.ball, ph = m.phase, r = this.rnd;
    const serving = m.score.server === i;
    this.mv = { x: 0, y: 0 }; this.mouse = { x: 0, y: 0 };
    const aimTo = (X, D) => { this.mouse = { x: (X - H.aim.X) / 0.0105, y: (D - H.aim.D) / 0.0105 }; };
    const press = () => { if (!this.btn) { this.btn = true; this.edges.push({ type: 'down', b: this.kindBtn || 0 }); } };
    const let_go = () => { if (this.btn) { this.btn = false; this.edges.push({ type: 'up', b: this.kindBtn || 0 }); } };
    const keysToward = (wx, wz, stop) => {
      const dx = (wx - p.x) * s, df = -(wz - p.z) * s, d = Math.hypot(dx, df);
      if (d < stop || this.noKeys) return false;
      this.mv = { x: Math.abs(dx) > 0.3 ? Math.sign(dx) : 0, y: Math.abs(df) > 0.3 ? Math.sign(df) : 0 };
      const n = Math.hypot(this.mv.x, this.mv.y); if (n > 1) { this.mv.x /= n; this.mv.y /= n; }
      return true;
    };
    if (ph !== 'live') { this.shot = null; this.lastInc = null; if (ph !== 'toss') let_go(); }
    if (ph !== 'ready' && ph !== 'toss') this.srv = null;                 // a let or a new game starts the routine again
    // ---- serving ----
    if (serving && ph === 'ready') {
      if (!this.srv || this.srv.no !== m.score.pointNo || this.srv.n !== m.score.serveNum || (this.srv.tossed && m.phaseT < 0.2)) {
        const side = m.deuceSide ? -1 : 1, first = m.score.serveNum === 1, wide = r() < 0.5, mg = S.serveMargin * (first ? 1 : 1.5);
        const X = side * (wide ? COURT.halfW - mg : mg * 0.9) + this.gauss() * S.sigAim * 0.3, D = -(COURT.svc - mg * (first ? 1 : 1.3)) + this.gauss() * S.sigAim * 0.3;
        this.srv = { no: m.score.pointNo, n: m.score.serveNum, X, D, wait: 0.7 + r() * 0.8, eps: this.gauss() * S.sigServe, swung: false, tossed: false };
      }
      aimTo(this.srv.X, this.srv.D);
      if (m.phaseT > this.srv.wait && !this.srv.tossed) { this.srv.tossed = true; this.edges.push({ type: 'down', b: 0 }, { type: 'up', b: 0 }); }
      return;
    }
    if (serving && ph === 'toss') {
      if (this.srv) { aimTo(this.srv.X, this.srv.D); if (!this.srv.swung && b.held < 0 && m.tossIdeal != null && m.t >= m.tossIdeal - TIMING.serveSwing + this.srv.eps) { this.srv.swung = true; this.edges.push({ type: 'down', b: 0 }, { type: 'up', b: 0 }); } }
      return;
    }
    if (ph !== 'live') return;
    // ---- rally ----
    const inc = m.incoming;
    if (b.live && b.lastHit !== i && inc) {
      if (this.lastInc !== inc) {
        // a new ball coming: read it late, pick a target on the open side, decide how hard and how well timed
        this.lastInc = inc;
        const open = (o.x * s) > 0 ? -1 : 1, cross = r() < 0.65 ? open : -open;
        // he can see the size of the miss ring, and keeps it inside the lines with a little to spare
        // he sees the miss ring for this ball at the pace he means to hit it, and keeps it inside the lines
        const hold = S.hold[0] + r() * (S.hold[1] - S.hold[0]), power = Math.min(1, 0.30 + hold / 0.72 * 0.70), R = m.missRing(i, 'drive', power);
        const X = cross * Math.max(0, COURT.halfW - R.x * S.ringK) + this.gauss() * S.sigAim, D = -Math.max(COURT.svc, COURT.halfLen - R.z * S.ringK) + this.gauss() * S.sigAim * 1.2;
        this.shot = { reactAt: m.t + S.react * (0.85 + 0.3 * r()), X, D, eps: this.gauss() * S.sigT, hold, split: r() < S.split, done: false };
        this.kindBtn = 0;
        // a quick ball, or one he is running for: a short tap for the safe, loopy rally shot
        if (R.diff > 0.7 && r() < S.defend) { const Rl = m.missRing(i, 'drive', 0.4); this.shot.hold = 0.08 + r() * 0.08; this.shot.X = cross * Math.max(0, COURT.halfW - Rl.x * 1.1) + this.gauss() * S.sigAim; this.shot.D = -Math.max(COURT.svc, COURT.halfLen - Rl.z * 1.0) + this.gauss() * S.sigAim; }
        // a ball he can see is trouble: the better players chip it back deep through the middle instead of swinging
        if (R.diff > 1.15 && r() < S.defend) { const Rs = m.missRing(i, 'slice', 0.5); this.kindBtn = 2; this.shot.hold = 0.2; this.shot.X = cross * Math.max(0, COURT.halfW - Rs.x * 1.3) * 0.5 + this.gauss() * S.sigAim; this.shot.D = -Math.max(COURT.svc, COURT.halfLen - Rs.z * 1.1) + this.gauss() * S.sigAim; }
      }
      const sh = this.shot;
      if (sh && !sh.done) {
        aimTo(sh.X, sh.D);
        if (m.t >= sh.reactAt) {
          const plan = H.plan;
          if (plan && !plan.leave) keysToward(plan.S.x, plan.S.z, S.stopR);
        }
        const tau = H.tau;
        if (tau != null) {
          if (!this.btn && tau <= sh.hold && m.t >= sh.reactAt) press();
          if (this.btn && tau <= sh.eps) { let_go(); sh.done = true; this.swings++; this.recoverAt = m.t + S.recover; }
        }
      }
    } else {
      // my ball is on its way: get back toward the middle, and split as he swings
      if (this.btn) let_go();
      const st = o.stroke;
      if (this.shot && this.shot.split && st && st.tc != null && st.tc - m.t < 0.10 && st.tc - m.t > 0 && !this.shot.splitDone) { this.shot.splitDone = true; this.pressed.add('Space'); }
      if (b.lastHit === i && m.t >= (this.recoverAt || 0)) keysToward(0, s * (COURT.halfLen + 0.7), 0.9);
    }
  }
}

export function play(o = {}) {
  const S = SKILL[o.skill || 'decent'], D = DIFFICULTY[o.diff == null ? 1 : o.diff], surf = o.surface || 'hard';
  const a = playerByName(o.p0 || 'Alcaraz'), b = playerByName(o.p1 || 'Sinner');
  const p0 = profileFor(a.id, surf), p1 = profileFor(b.id, surf);
  p1.speed *= D.speed; p1.react *= D.react; p1.s1Kmh *= D.pace; p1.s1Max *= D.pace; p1.s2Kmh *= D.pace; p1.fhKmh *= D.pace; p1.bhKmh *= D.pace;
  const m = new Match({ env: { surface: surf }, format: 'slam5', p0, p1, seed: o.seed || 3, firstServer: 0, pace: 0.05, logShots: true });
  m.diffScale[1] = D.err; m.diffScale[0] = D.aid; m.timingWindow[0] = D.window; m.aimSafe[0] = D.aimSafe;
  const assist = o.assist == null ? 2 : o.assist, bot = new Bot(S, (o.seed || 3) * 7 + 1, { assist, noKeys: o.noKeys == null ? assist >= 2 : o.noKeys });
  bot.human.safe = D.safe; bot.human.srvSafe = D.srvSafe;
  if (o.setup) o.setup(m, bot); m.ctl = [bot, new AI()];
  const pts = []; let g = 0; const N = o.points || 600; const tim = [];
  while (pts.length < N && g++ < 6e8) {
    m.step(STEP);
    if (m.events.length) { for (const e of m.events) { if (e.type === 'point') pts.push(e); if (e.type === 'hit' && e.who === 0 && e.timing != null) tim.push(e.timing); } m.events.length = 0; }
    if (m.phase === 'done') { m.score = { sets: [], g: [0, 0], p: [0, 0], tb: false, setsWon: [0, 0], server: pts.length % 2, serveNum: 1, over: false, winner: -1, tbStart: 0, pointNo: 0 }; m.startBetween(0.1); }
  }
  const n = pts.length, pc = (x, y) => y ? 100 * x / y : 0, err = p => ['net', 'long', 'wide'].includes(p.why);
  const mine = pts.filter(p => p.server === 0), his = pts.filter(p => p.server === 1);
  const won = pts.filter(p => p.winner === 0).length;
  const sw = pc(mine.filter(p => p.winner === 0).length, mine.length) / 100, rw = pc(his.filter(p => p.winner === 0).length, his.length) / 100;
  // chance of holding serve from the chance of winning a point on it
  const hold = q => { const d = q * q / (1 - 2 * q * (1 - q)); return q ** 4 * (1 + 4 * (1 - q) + 10 * (1 - q) ** 2) + 20 * q ** 3 * (1 - q) ** 3 * d; };
  const hA = hold(sw), hB = hold(1 - rw);
  // a set, then best of three, by simulation from the two hold rates
  let rr = makeRng(99).u, matchW = 0; const T = 20000;
  const set = first => { let x = 0, y = 0, sv = first; for (;;) { const aWins = sv === 0 ? rr() < hA : rr() >= hB; if (aWins) x++; else y++; sv = 1 - sv; if ((x >= 6 || y >= 6) && Math.abs(x - y) >= 2) return x > y; if (x === 6 && y === 6) return rr() < 0.5 + (sw + rw - 1) * 1.6; } };
  for (let k = 0; k < T; k++) { let A = 0, B = 0; while (A < 2 && B < 2) { if (set((A + B) % 2)) A++; else B++; } if (A === 2) matchW++; }
  const st = m.players[0].stats, so = m.players[1].stats;
  const rl = pts.map(p => p.rally - (err(p) ? 1 : 0));
  const my = k => pts.filter(p => p.cls === k && ((k === 'winner' || k === 'ace') ? p.winner === 0 : p.winner === 1)).length;
  tim.sort((x, y) => x - y);
  return { n, won: pc(won, n), sw: sw * 100, rw: rw * 100, hold: hA * 100, brk: (1 - hB) * 100, match: 100 * matchW / T, rally: rl.reduce((x, y) => x + y, 0) / n,
    aces: pc(my('ace'), mine.length), df: pc(pts.filter(p => p.cls === 'doubleFault' && p.server === 0).length, mine.length), winners: pc(my('winner'), n), ue: pc(my('unforced'), n), fe: pc(my('forced'), n),
    shots: (() => { const q = (w, k) => { const a = m.shotLog.filter(x => x.who === w && x.kind !== 'serve' && x[k] != null).map(x => Math.abs(x[k])).sort((x, y) => x - y); return a.length ? [a[a.length >> 1], a[Math.floor(a.length * 0.9)]] : [0, 0]; }; return ['diff', 'weak', 'pSpeed', 'lat', 'relZ', 'kmh'].map(k => k + ' me ' + q(0, k).map(v => v.toFixed(2)).join('/') + ' him ' + q(1, k).map(v => v.toFixed(2)).join('/')).join(' | '); })(),
    in1: pc(st.s1In, st.s1Tot), oppAce: pc(pts.filter(p => p.cls === 'ace' && p.server === 1).length, his.length), swings: bot.swings, timSd: tim.length ? Math.sqrt(tim.reduce((x, y) => x + y * y, 0) / tim.length) : 0, timN: tim.length, whys: pts.reduce((acc, p) => { const k = (p.winner === 0 ? '+' : '-') + p.why; acc[k] = (acc[k] || 0) + 1; return acc; }, {}) };
}
export const line = r => `points won ${r.won.toFixed(0)}%  on serve ${r.sw.toFixed(0)}%  on return ${r.rw.toFixed(0)}%  -> holds ${r.hold.toFixed(0)}% breaks ${r.brk.toFixed(0)}%  wins a best-of-3 ${r.match.toFixed(0)}%  | rally ${r.rally.toFixed(1)}  my aces ${r.aces.toFixed(0)}% DF ${r.df.toFixed(0)}% 1st in ${r.in1.toFixed(0)}%  his aces ${r.oppAce.toFixed(0)}%  my W/UE/FE per 100 pts ${r.winners.toFixed(0)}/${r.ue.toFixed(0)}/${r.fe.toFixed(0)}  timing sd ${(r.timSd * 1000).toFixed(0)} ms (${r.timN})`;
if (process.argv[1].endsWith('humanbot.mjs')) {
  const a = Object.fromEntries(process.argv.slice(2).map(x => x.split('=')));
  const skills = a.skill ? [a.skill] : ['casual', 'decent', 'sharp'], diffs = a.diff != null ? [+a.diff] : [0, 1, 2];
  for (const sk of skills) for (const d of diffs) { const r = play({ points: +(a.points || 600), skill: sk, diff: d, p0: a.p0, p1: a.p1, surface: a.surface, seed: +(a.seed || 3), assist: a.assist == null ? undefined : +a.assist, noKeys: a.nokeys == null ? undefined : a.nokeys === '1' }); console.log(`${sk.padEnd(7)} v ${DIFFICULTY[d].name.padEnd(10)} ${line(r)}`); if (a.why) console.log('   ', JSON.stringify(r.whys)); if (a.shots) console.log('    median/p90:', r.shots); }
}
