// Rally Pro — what goes on in a player's head and legs over a match, so the computer plays like a person and not a machine
// (he asked "is there anyway to make the computer feel more human?", then for all of it: guessing, learning his game, patterns,
// nerves and momentum, fatigue - "fatigue into a rally would be good too" - and the odd misjudgement, and "it should be clear
// in-game how these factors are working too"). One Mind per player, owned by the Match (sim.js) so the test harnesses play with it.
//
//   fatigue   both men: a rally's own (running and hitting; mostly back between points) and the match's (a little of every
//             rally kept, more each set); slower to the ball, slower off the mark, more errors, a little less pace
//   momentum  the computer: a run of points won loosens him, a run lost shakes him (a wobble for a few points)
//   nerves    the computer: a big point - break point against him, serving for a set or the match, a late tiebreak - tightens a
//             man who is not clutch (STYLE clutch, data.js) and steadies one who is
//   scouting  the computer about the man across the net: where he misses (wing, height, on the run) and where he hits from where,
//             so it plays to his weakness and guesses where his next ball is going
//   tactic    the computer changes its game when it is losing (more net, more margin, more pressure)
//   pattern   the computer builds points as its man did: serve and the first ball to the open court, the inside-out forehand,
//             the backhand crosscourt until a short ball, and so on
// Every factor leaves a line in `log` for the HUD (app.js insights) and counts in `stat` for the stats panel.
import { clamp, lerp } from './physics.js';

// How long each man lasted (his recovery between points and how he held up in long matches), and how much he read the game - how
// early and how far he leant toward where he expected the ball (both 0..1-ish; estimates from his reputation and his record in long
// matches and on return, not measurements).
const STAMINA = { Djokovic: 1.3, Nadal: 1.3, Murray: 1.25, Hewitt: 1.2, Borg: 1.3, Lendl: 1.2, Wilander: 1.2, Medvedev: 1.2, Alcaraz: 1.2,
  Sinner: 1.15, Thiem: 1.15, Federer: 1.15, Agassi: 1.1, Connors: 1.15, Zverev: 1.05, Monfils: 1.0, Wawrinka: 1.0, Tsitsipas: 1.0, Kuerten: 1.0,
  Laver: 1.1, Edberg: 1.05, Becker: 1.0, McEnroe: 1.0, Roddick: 0.95, Sampras: 0.95, 'del Potro': 0.9, Ivanisevic: 0.9, Kyrgios: 0.85 };
const READ = { Djokovic: 0.95, Agassi: 0.9, Murray: 0.9, Medvedev: 0.9, Nadal: 0.85, Federer: 0.85, Hewitt: 0.85, Alcaraz: 0.85, Sinner: 0.8,
  Borg: 0.8, Connors: 0.85, Lendl: 0.75, Wilander: 0.85, McEnroe: 0.8, Edberg: 0.75, Sampras: 0.65, Becker: 0.7, Laver: 0.8, Zverev: 0.65,
  Thiem: 0.65, Tsitsipas: 0.6, Monfils: 0.7, Wawrinka: 0.6, Kuerten: 0.65, Roddick: 0.55, 'del Potro': 0.55, Ivanisevic: 0.5, Kyrgios: 0.6 };
// The patterns each man built his points with, and how often (per point, roughly). srv1: serve and send the first ball to the
// open court; sv: serve and volley; io: run round the backhand for the inside-out forehand; bhx: backhand crosscourt until the ball
// lands short, then down the line; heavy: heavy topspin crosscourt into the backhand, again and again; drop: push him back,
// then the drop shot; net: come in behind a deep approach.
const PATTERNS = {
  Federer: { srv1: 0.5, io: 0.35, net: 0.12, drop: 0.05 }, Nadal: { heavy: 0.5, io: 0.3, srv1: 0.3 }, Djokovic: { bhx: 0.4, srv1: 0.3, io: 0.1 },
  Alcaraz: { drop: 0.25, srv1: 0.35, io: 0.3, net: 0.12 }, Sinner: { bhx: 0.35, srv1: 0.35, io: 0.15 }, Sampras: { sv: 0.55, srv1: 0.4, io: 0.25, net: 0.2 },
  Agassi: { bhx: 0.3, srv1: 0.2, io: 0.25 }, Lendl: { io: 0.45, srv1: 0.3 }, Borg: { heavy: 0.4, bhx: 0.2 }, McEnroe: { sv: 0.6, net: 0.35, srv1: 0.2 },
  Connors: { bhx: 0.35, net: 0.15, srv1: 0.15 }, Laver: { sv: 0.4, net: 0.3, srv1: 0.2 }, Murray: { bhx: 0.35, srv1: 0.2, drop: 0.08 },
  Wawrinka: { bhx: 0.3, srv1: 0.25, io: 0.15 }, Zverev: { bhx: 0.35, srv1: 0.35 }, Thiem: { heavy: 0.35, bhx: 0.2, srv1: 0.2 },
  Medvedev: { bhx: 0.4, srv1: 0.25 }, Tsitsipas: { io: 0.35, srv1: 0.35, net: 0.12 }, 'del Potro': { io: 0.4, srv1: 0.35 },
  Roddick: { srv1: 0.6, io: 0.2 }, Kyrgios: { srv1: 0.55, drop: 0.15, io: 0.15 }, Monfils: { heavy: 0.2, drop: 0.08, bhx: 0.2 },
  Becker: { sv: 0.5, srv1: 0.35, net: 0.2 }, Edberg: { sv: 0.65, net: 0.4 }, Ivanisevic: { sv: 0.45, srv1: 0.55 }, Wilander: { bhx: 0.4, heavy: 0.2 },
  Kuerten: { heavy: 0.35, bhx: 0.25, srv1: 0.2 }, Hewitt: { bhx: 0.4, srv1: 0.15 },
};
export const PATTERN_NAME = { srv1: 'Serve +1', sv: 'Serve and volley', io: 'Inside-out forehand', bhx: 'Backhand crosscourt', heavy: 'Heavy to the backhand', drop: 'The drop shot', net: 'Approach and volley' };
// what a tactic does to the computer's game: how often it comes in, how much margin it leaves, how hard it goes
export const TACTIC = {
  base:   { name: '', net: 1, margin: 1, push: 0 },
  net:    { name: 'Coming forward', net: 2.4, margin: 1, push: 0.05 },
  safe:   { name: 'More margin', net: 0.7, margin: 1.35, push: -0.08 },
  press:  { name: 'Taking it to him', net: 1.2, margin: 0.85, push: 0.1 },
};

export class Mind {
  constructor(m, i) {
    this.i = i; const p = m.players[i], nm = (p.prof && p.prof.name) || '';
    this.name = nm; this.stam = STAMINA[nm] || 1.0; this.read = READ[nm] ?? 0.6; this.pat = PATTERNS[nm] || { srv1: 0.25, bhx: 0.2 };
    this.clutch = clamp((p.prof && p.prof.style && p.prof.style.clutch) || 0, -1, 1);
    // fatigue: R the rally's own, M the match's (E = 1 - R - M, 1 fresh)
    this.R = 0; this.M = 0; this.inPt = false; this.runV = 0;
    // momentum and the run of points, the wobble after a bad run, the nerves of this point
    this.mom = 0; this.run = 0; this.wobble = 0; this.nerves = 0;
    // what this man has seen of the other: his shots and misses by kind, his directions by wing and side
    this.sc = { fh: [0, 0, 0], bh: [0, 0, 0], high: [0, 0, 0], low: [0, 0, 0], run: [0, 0, 0], set: [0, 0, 0] };   // [shots, errors, winners]
    this.dir = { fh: [3, 1, 1.4], bh: [3, 1, 1.4] };   // crosscourt, down the line, through the middle (a prior: crosscourt most)
    this.oppLast = null;   // the other man's last shot, until it is judged
    this.tactic = 'base'; this.ptWon = []; this.patNow = null; this.patStep = 0;
    this.guess = null;     // the current read of the other man's next ball
    this.log = []; this.stat = { reads: 0, readsRight: 0, wrongFooted: 0, patterns: {}, patternsWon: {}, misjudged: 0, lateSplit: 0, tactic: [] };
  }
  get E() { return clamp(1 - this.R - this.M, 0, 1); }
  // multipliers the match and the computer read
  speedK() { return 1 - 0.17 * (1 - this.E); }
  accelK() { return 1 - 0.24 * (1 - this.E); }
  reactK() { return 1 + 0.28 * (1 - this.E) + 0.12 * this.nerves; }
  paceK() { return 1 - 0.06 * (1 - this.E); }
  // how much wider a swing goes: fatigue for both men; momentum, the wobble and nerves for the computer only (his own are his own)
  errK(cpu) {
    let k = 1 + 0.55 * (1 - this.E);
    if (cpu) k *= (1 - 0.16 * this.mom) * (1 + 0.28 * this.wobble) * (1 + 0.45 * this.nerves) * (1 - 0.14 * (this.P || 0) * Math.max(0, this.clutch));
    return k;
  }
  say(m, kind, text, sub, pri = 1) { this.log.push({ t: m.t, kind, text, sub: sub || '', pri, who: this.i }); if (this.log.length > 40) this.log.shift(); }

  // ---- every step ----
  tick(m, dt) {
    const p = m.players[this.i], live = m.phase === 'live';
    if (live) {
      // running costs breath by how hard he runs (the share of his top speed, squared)
      const v = Math.hypot(p.vx, p.vz), top = Math.max(3, (p.prof.speed || 6)), u = clamp(v / top, 0, 1.2);
      const d = 0.026 * u * u * dt / this.stam; this.R += d; this.M += 0.028 * d; this.inPt = true;
    } else {
      // between points the rally's tiredness goes, most of it in the first few seconds (each rally of the match still leaves its bit)
      this.R *= Math.exp(-dt / 5.5);
    }
    this.R = clamp(this.R, 0, 0.55); this.M = clamp(this.M, 0, 0.4);
  }
  // ---- this man's own shot ----
  onOwnHit(m, info) { this.lastOppCtx = null; this.R += (info.kind === 'serve' ? 0.005 : 0.011) / this.stam * (m.rally > 6 ? 1.5 : 1); this.patStep++; }
  // ---- the other man's shot, as it leaves his racket ----
  onOppHit(m, info) {
    if (info.kind === 'serve') { this.oppLast = null; return; }
    const ctx = [info.wing === 'bh' ? 'bh' : 'fh']; if (info.h > 1.3) ctx.push('high'); if (info.h < 0.6) ctx.push('low'); if (info.pSpeed > 2.5) ctx.push('run'); else ctx.push('set');
    for (const c of ctx) this.sc[c][0]++;
    this.oppLast = { ctx, wing: info.wing === 'bh' ? 'bh' : 'fh', x: info.x, z: info.z, sgn: info.sgn, t: m.t }; this.lastOppCtx = ctx;
  }
  // ---- the first bounce of the other man's shot: which way did it go ----
  onOppBounce(m, e) {
    const o = this.oppLast; if (!o) return;
    // in the hitter's own frame: X to his right; crosscourt goes to the side opposite to where he hit from
    const hx = o.x * o.sgn, lx = e.x * o.sgn, side = Math.abs(hx) < 0.8 ? 0 : Math.sign(hx);
    // (crosscourt and down the line only mean something from out on one side: from the middle nothing is learnt or guessed)
    if (side === 0) { this.oppLast = null; if (this.guess && !this.guess.judged) this.guess.judged = true; return; }
    const d = Math.sign(lx) === -side && Math.abs(lx) > 1.0 ? 0 : Math.sign(lx) === side && Math.abs(lx) > 1.0 ? 1 : 2;   // crosscourt, down the line, middle
    this.dir[o.wing][d] += 1;
    const g = this.guess;
    if (g && !g.judged) { g.judged = true; const right = (g.d === d) || (g.d !== 2 && d !== 2 && Math.sign(lx) === Math.sign(g.lx));
      this.stat.reads++; if (right) { this.stat.readsRight++; g.right = true; } else if (g.lean > 0.35) { this.stat.wrongFooted++; g.wrong = true; } }
    this.oppLast = null;
  }
  // ---- the point is over ----
  onPoint(m, rec, cpu) {
    const won = rec.winner === this.i, big = (rec.val || 0) >= 1 || rec.bp;
    // the other man's last shot, if it was his error or his winner
    const opp = 1 - this.i, last = this.lastOppCtx;
    if (rec.lastHitter === opp && last) {
      if (rec.why === 'net' || rec.why === 'long' || rec.why === 'wide') for (const c of last) this.sc[c][1]++;
      else if (rec.why === 'winner') for (const c of last) this.sc[c][2]++;
    }
    this.lastOppCtx = null;
    // momentum: each point moves it, a big one more; it settles as points go by
    this.mom = clamp(this.mom * 0.82 + (won ? 0.16 : -0.16) * (big ? 1.5 : 1), -1, 1);
    this.run = won ? Math.max(1, this.run + 1) : Math.min(-1, this.run - 1);
    if (cpu) {
      if (this.run <= -3 && this.wobble < 0.5) { this.wobble = 1; this.say(m, 'wobble', 'Rattled', `${-this.run} points in a row lost`, 2); }
      else this.wobble = Math.max(0, this.wobble - (won ? 0.5 : 0.2));
      if (this.run >= 4 && this.mom > 0.5) this.say(m, 'roll', 'On a roll', `${this.run} points in a row`, 1);
      // a pattern that won the point
      if (this.patNow && this.patStep > 0) { const k = this.patNow; this.stat.patterns[k] = (this.stat.patterns[k] || 0) + 1; if (won) this.stat.patternsWon[k] = (this.stat.patternsWon[k] || 0) + 1;
        if (won && rec.rally <= 7) this.say(m, 'pattern', PATTERN_NAME[k], `${this.stat.patternsWon[k]} of ${this.stat.patterns[k]} won`, 1); }
      this.ptWon.push(won ? 1 : 0); if (this.ptWon.length > 14) this.ptWon.shift();
      this.reconsider(m);
    }
    this.patNow = null; this.patStep = 0; this.guess = null; this.nerves = 0; this.P = 0;
    // the match wears on: each game a little, each set more
    this.M += 0.0006 / this.stam;
  }
  noteSet(m) { this.M += 0.022 / this.stam; }
  // ---- the computer: change what is not working ----
  reconsider(m) {
    this.since = (this.since || 0) + 1;
    if (this.ptWon.length < 12 || this.since < 12) return;   // (a tactic is given a dozen points before it is judged)
    const rate = this.ptWon.reduce((a, b) => a + b, 0) / this.ptWon.length, p = m.players[this.i], prof = p.prof;
    let want = this.tactic;
    if (rate < 0.36) want = this.tactic === 'base' ? ((prof.net || 0) > 0.06 || (prof.volley || 0) > 0.6 ? 'net' : 'safe') : this.tactic === 'safe' ? 'press' : this.tactic === 'net' ? 'safe' : 'base';
    else if (rate > 0.58 && this.tactic !== 'base' && this.since > 24) want = 'base';
    if (want !== this.tactic) { this.tactic = want; this.since = 0; this.ptWon = this.ptWon.slice(-4); this.stat.tactic.push(want);
      if (want !== 'base') this.say(m, 'tactic', TACTIC[want].name, 'Losing the rallies, he changes his game', 2); }
  }
  // ---- the computer, before a point: the pressure on it, and the pattern it means to play ----
  beginPoint(m, cpu) {
    if (!cpu) return;
    const s = m.score, me = this.i, srv = s.server === me;
    let P = 0;
    if (!s.tb) { if (m.isBreakPoint() && srv) P = 0.7; if (Math.max(m.pointValue(me), m.pointValue(1 - me)) >= 2) P = Math.max(P, m.pointValue(1 - me) >= 2 ? 0.8 : 0.6); }
    else { const a = s.p[me], b = s.p[1 - me]; if (a + b >= 10) P = 0.6; }
    if (srv && !s.tb && s.p[me] === 0 && s.p[1 - me] === 0 && m.pointValue && this.servingForSet(m)) P = Math.max(P, 0.5);
    // the clutch steady themselves; the rest tighten
    this.P = P; this.nerves = P * clamp(0.6 - 0.5 * this.clutch, 0, 1.1);
    if (this.nerves > 0.35) this.say(m, 'nerves', 'Tight', srv ? 'Serving under pressure' : 'A big point against him', 2);
    // a pattern for this point, by how often his man played each (serving patterns only on serve)
    const opts = Object.entries(this.pat).filter(([k]) => srv ? true : (k !== 'srv1' && k !== 'sv')); let tot = 0;
    for (const [, w] of opts) tot += w;
    this.patNow = null; this.patStep = 0;
    if (tot > 0 && m.rng.u() < clamp(tot, 0, 0.85)) { let u = m.rng.u() * tot; for (const [k, w] of opts) { u -= w; if (u <= 0) { this.patNow = k; break; } } }
  }
  servingForSet(m) { const s = m.score, f = m.fmt, me = this.i; return s.g[me] + 1 >= f.games && s.g[me] + 1 - s.g[1 - me] >= 2; }
  // ---- the computer's scouting: how much weaker the other man is on his backhand than his forehand (-1..1), and on high balls,
  // on the run (0..1) - his miss rates against a prior, so a few points say little ----
  rate(c) { const [n, e] = this.sc[c]; return (e + 1.2) / (n + 12); }
  weakBh() { return clamp((this.rate('bh') - this.rate('fh')) / 0.09, -1, 1); }
  weakHigh() { return clamp((this.rate('high') - this.rate('set')) / 0.1, 0, 1); }
  weakRun() { return clamp((this.rate('run') - this.rate('set')) / 0.1, 0, 1); }
  // where the other man sends the ball from this wing, as shares (crosscourt, down the line, middle)
  dirOf(wing) { const d = this.dir[wing] || this.dir.fh, t = d[0] + d[1] + d[2]; return [d[0] / t, d[1] / t, d[2] / t]; }
}
