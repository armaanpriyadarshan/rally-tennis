// Rally Pro — tournaments and the season. Draws, simulated matches built from each
// player's real hold and break percentages, ranking points by round, and the save file.
import { PLAYERS, TOURNAMENTS, ROUND_NAME, eventRate, levelOf, LEVEL_SIM, pickField, planSeason, injuryRisk, injurySpots } from './data.js';

export function rng(seed) { let s = (seed >>> 0) || 1; return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const gauss = r => { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
const name = id => PLAYERS[id] ? PLAYERS[id].facts.name : '?';

// ---------- one simulated match ----------
// Service games are decided by the server's hold rate against the returner's break rate,
// both shifted by how each man does on the surface. That is where the scores come from:
// big servers play tiebreaks, returners break.
// The court itself moves every hold: the tour holds 75.5% of service games on clay, 79.9% on outdoor hard courts, 81.2% indoors and
// 83.4% on grass, and more in thin air (Madrid, 650 m: +4.5 points; Sackmann's match data 2015-25), so that grass has its tiebreaks
// (a quarter of sets) and clay its breaks (one set in six goes to a tiebreak).
const SURF_HOLD = { hard: 1.6, clay: -2.6, grass: 6.6 };
const ADV = 0.35;
function gameProb(a, b, T, da = 0, db = 0) {
  const A = PLAYERS[a], B = PLAYERS[b], surface = T.surface, key = T.key;
  // his record at this event where there is one, on its surface where not
  const adv = id => eventRate(id, key, surface).rate - PLAYERS[id].overall;
  const el = id => (levelOf(id) - 84) * LEVEL_SIM;   // (his level: data.js LEVEL, the five highest)
  const env = (SURF_HOLD[surface] || 0) + (T.indoor ? 1.3 : 0) + (T.alt || 0) * 0.007;
  const hold = A.hold + adv(a) * ADV + el(a) + da, brk = B.brk + adv(b) * ADV + el(b) + db;
  // tour average: 81 % of service games held, 19 % broken
  return clamp((hold + (100 - brk)) / 2 + (hold - 81) * 0.25 - (brk - 19) * 0.25 + env, 45, 97) / 100;
}
function tiebreak(pa, pb, first, to, r) {
  // point-level: a server wins roughly hold^0.28 of his service points
  const sa = Math.pow(pa, 0.28) * 0.82, sb = Math.pow(pb, 0.28) * 0.82;
  let a = 0, b = 0, srv = first, n = 0;
  for (;;) { const p = srv === 0 ? sa : 1 - sb; if (r() < p) a++; else b++; n++; if (n % 2 === 1) srv = 1 - srv; if ((a >= to || b >= to) && Math.abs(a - b) >= 2) return [a, b]; }
}
// A man's day: how much better or worse than his record he plays this match (in points of service games held and broken). Without
// it every match between two of these men was close - 45% of best-of-three matches went to a third set and a third of best-of-five
// to a fifth, where the tour's are 37% and 20% - and a 6-1 or a 6-0 set was rare.
const DAY = 8.5;
// Walkovers and retirements (Sackmann's match data 2015-25: a top-30 man gives a walkover in 0.45% of his matches and retires in
// 1.24%; retirements are half as common again in best of five), each scaled by how injury-prone he is (data.js injuryRisk).
const WO = 0.003, RET = { 3: 0.0124, 5: 0.019 };
// o: { da, db } each man's form and freshness, in the same points; risk: [a's, b's] injury proneness (0: never hurt, the human);
// day: false for no day-to-day swing
export function simMatch(a, b, T, r, o = {}) {
  // (smaller over five sets: a long match lets the better man's level show - favourites at the majors are about one and a half times
  // as sure in log-odds as at the Masters: a man ranked twice as high wins 63% there, 59% at a Masters)
  const day = o.day === false ? 0 : DAY * ((o.bestOf || T.bestOf) === 5 ? 0.62 : 1), da = (o.da || 0) + day * gauss(r), db = (o.db || 0) + day * gauss(r);
  const pa = gameProb(a, b, T, da, db), pb = gameProb(b, a, T, db, da);
  const bestOf = o.bestOf || T.bestOf || 3, need = (bestOf + 1) / 2, games = o.games || 6, risk = o.risk || [0, 0];
  // a walkover: one of them cannot start
  if (risk[0] || risk[1]) { const wa = r() < WO * risk[0], wb = !wa && r() < WO * risk[1]; if (wa || wb) return { winner: wa ? b : a, loser: wa ? a : b, sets: [], a, b, wo: true, min: 0 }; }
  // a retirement: one of them stops part of the way through (by how many games are played: about 10 a set)
  let retBy = null, retAt = 1e9; const rr = RET[bestOf] || RET[3];
  if (risk[0] && r() < rr * risk[0]) retBy = a; else if (risk[1] && r() < rr * risk[1]) retBy = b;
  if (retBy != null) retAt = Math.floor(r() * 10 * (bestOf === 5 ? 3.6 : 2.3));
  const sets = []; let wa = 0, wb = 0, srv = r() < 0.5 ? 0 : 1, played = 0, pts = 0;
  while (wa < need && wb < need) {
    let ga = 0, gb = 0, tb = null;
    for (;;) {
      if (played >= retAt) { sets.push({ g: [ga, gb], tb: null, part: true }); return done(true); }
      const hold = r() < (srv === 0 ? pa : pb); played++; pts += 6.1;
      if ((srv === 0) === hold) ga++; else gb++;
      srv = 1 - srv;
      if ((ga >= games || gb >= games) && Math.abs(ga - gb) >= 2) break;
      if (ga === games && gb === games) {
        const deciding = wa + wb === bestOf - 1, to = deciding && bestOf === 5 ? 10 : 7;
        tb = tiebreak(pa, pb, srv, to, r); pts += tb[0] + tb[1]; if (tb[0] > tb[1]) ga++; else gb++; srv = 1 - srv; break;
      }
    }
    sets.push({ g: [ga, gb], tb }); if (ga > gb) wa++; else wb++;
  }
  return done(false);
  // (about 43 seconds a point all told, changeovers included: 107 minutes for the tour's 148-point best of three on clay)
  function done(ret) {
    const min = Math.round(pts * 0.72);
    if (ret) return { winner: retBy === a ? b : a, loser: retBy, sets, a, b, ret: true, min };
    return { winner: wa > wb ? a : b, loser: wa > wb ? b : a, sets, a, b, min };
  }
}
export function scoreLine(res, forId) {
  if (res.wo) return 'w/o';
  const flip = forId != null && res.b === forId;
  return res.sets.map(s => { const x = flip ? s.g[1] : s.g[0], y = flip ? s.g[0] : s.g[1]; return `${x}-${y}` + (s.tb ? `(${Math.min(s.tb[0], s.tb[1])})` : ''); }).join(' ') + (res.ret ? ' ret.' : '');
}
// Form and freshness as points of service games (see DAY): a man in form by one unit of log-odds plays like one 0.4 better (about
// 60-40 against his equal, where his records would make it even); after a long match he is worse for the next (at the majors a man
// who played four hours or more the round before wins 7.5 points less often than expected, one under two hours 4 more).
export const FORM_PP = 9;
export function freshPP(min) { return min == null ? 0 : min > 240 ? -2.6 : min > 180 ? -1.3 : min < 90 ? 0.6 : 0; }

// ---------- a draw ----------
// Standard seeding: 1 and 2 in opposite halves, 3-4 in opposite quarters, and so on.
function seedSlots(n) { let s = [1, 2]; while (s.length < n) { const m = s.length * 2 + 1, t = []; for (const x of s) t.push(x, m - x); s = t; } return s; }
// A knockout draw of 32 or 16, the best men placed by the seeding and given the byes where the field is short; or the Finals, two
// round-robin groups of four whose top two play the semi-finals. ctx (from the season): mod(id) his form in points, risk(id) how
// injury-prone, after(res) told of every result.
export class Draw {
  // entrants: player ids in ranking order (best first)
  constructor(T, entrants, humanId, seed, ctx) {
    this.T = T; this.human = humanId; this.r = rng(seed || 1); this.seedNo = {}; this.ctx = ctx || null; this.lastMin = {};
    const n = T.draw, e = entrants.slice(0, n);
    this.round = 0; this.champion = null; this.out = {}; this.rounds = [];
    if (T.level === 'finals') {
      // two groups: 1, 4, 5 and 8; 2, 3, 6 and 7. Three days of the round robin, everyone once against the other three
      e.forEach((id, i) => { this.seedNo[id] = i + 1; });
      this.rr = true; this.groups = [[e[0], e[3], e[4], e[7]], [e[1], e[2], e[5], e[6]]].map(g => g.filter(x => x != null));
      this.names = ['RR', 'RR', 'RR', 'SF', 'F'];
      this.rounds.push(this.rrDay(0));
      return;
    }
    // (a field too small for its draw plays a smaller one: nine men at a 500 make a draw of 16 with seven byes, seven make one of 8)
    let n2 = n; while (n2 > 4 && n2 / 2 >= e.length) n2 /= 2;
    this.names = T.rounds.slice(T.rounds.length - Math.round(Math.log2(n2)));
    return this.knockout(e, n2);
  }
  knockout(e, n) {
    // the top quarter seeded; the byes, where there are fewer men than places, to the best of them; the rest drawn at random
    const nSeed = n / 4, nBye = n - e.length, placed = Math.max(nSeed, nBye), order = seedSlots(n), slots = new Array(n).fill(undefined);
    for (let i = 0; i < n; i++) if (order[i] <= placed && order[i] <= e.length) { slots[i] = e[order[i] - 1]; if (order[i] <= nSeed) this.seedNo[e[order[i] - 1]] = order[i]; }
    for (let k = 1; k <= nBye; k++) { const i = order.indexOf(k); slots[i ^ 1] = null; }
    const rest = e.slice(placed); for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(this.r() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    let k = 0; for (let i = 0; i < n; i++) if (slots[i] === undefined) slots[i] = rest[k++] ?? null;
    const first = []; for (let i = 0; i < n; i += 2) first.push(this.pair(slots[i], slots[i + 1]));
    this.rounds.push(first);
    this.advance();
  }
  // a match, or a bye where one side is empty
  pair(a, b) { const m = { a: a ?? null, b: b ?? null, res: null }; if (m.a == null || m.b == null) m.res = { winner: m.a ?? m.b, loser: null, bye: true, sets: [] }; return m; }
  rrDay(d) {
    const P = [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]][d], out = [];
    for (const [gi, g] of this.groups.entries()) { if (g[P[0]] != null && g[P[1]] != null) out.push({ a: g[P[0]], b: g[P[1]], res: null, g: gi }); if (g[P[2]] != null && g[P[3]] != null) out.push({ a: g[P[2]], b: g[P[3]], res: null, g: gi }); }
    return out;
  }
  // a group's table: wins, then (two level) who beat whom, then share of sets, then of games
  standings(gi) {
    const g = this.groups[gi], T = {}; for (const id of g) T[id] = { id, w: 0, l: 0, sw: 0, sl: 0, gw: 0, gl: 0 };
    for (const r of this.rounds.slice(0, 3)) for (const m of r) if (m.g === gi && m.res && !m.res.bye) {
      const W = T[m.res.winner], L = T[m.res.loser]; W.w++; L.l++;
      for (const s of m.res.sets) { const ga = s.g[0], gb = s.g[1], A = T[m.a], B = T[m.b]; A.gw += ga; A.gl += gb; B.gw += gb; B.gl += ga; if (!s.part) { if (ga > gb) { A.sw++; B.sl++; } else { B.sw++; A.sl++; } } }
    }
    const beat = (x, y) => this.rounds.slice(0, 3).some(r => r.some(m => m.res && m.res.winner === x && m.res.loser === y));
    const pc = (a, b) => a + b ? a / (a + b) : 0;
    return Object.values(T).sort((x, y) => (y.w - x.w) || (beat(x.id, y.id) ? -1 : beat(y.id, x.id) ? 1 : 0) || (pc(y.sw, y.sl) - pc(x.sw, x.sl)) || (pc(y.gw, y.gl) - pc(x.gw, x.gl)) || (this.seedNo[x.id] - this.seedNo[y.id]));
  }
  get roundName() { return this.names[this.round]; }
  humanMatch() { if (this.champion != null) return null; return this.rounds[this.round].find(m => !m.res && (m.a === this.human || m.b === this.human)) || null; }
  alive(id) { return !(id in this.out); }
  hasBye(id) { return !this.rr && this.round === 0 && this.rounds[0].some(m => m.res && m.res.bye && m.res.winner === id); }
  // how strong a man is for this match, beyond his record: his form, how fresh he is, and the round (the later the round, the harder
  // the man still in it plays: he asked for the difficulty to go "by how deep in the tournament we are")
  strengthFor(id) {
    const f = (this.ctx && this.ctx.mod ? this.ctx.mod(id) : 0) + freshPP(this.lastMin[id]);
    const ri = this.rr ? (this.round < 3 ? 2 : this.round) : this.round + (5 - this.names.length);
    return f / FORM_PP + 0.05 * ri;
  }
  sim(m) {
    const c = this.ctx, mod = id => (c && c.mod ? c.mod(id) : 0) + freshPP(this.lastMin[id]), risk = id => c && c.risk ? c.risk(id) : (id === this.human ? 0 : injuryRisk(id));
    return simMatch(m.a, m.b, this.T, this.r, { da: mod(m.a), db: mod(m.b), risk: [risk(m.a), risk(m.b)] });
  }
  // record a played match
  report(match, res) { match.res = res; this.note(match); this.advance(); }
  note(m) {
    const res = m.res; if (!res || res.bye) return;
    if (!this.rr || this.round >= 3) this.out[res.loser] = this.names[this.round];
    this.lastMin[res.winner] = res.min; this.lastMin[res.loser] = res.min;
    if (this.ctx && this.ctx.after) this.ctx.after(res, this);
  }
  // simulate every other match of the round; the human's waits unless `all`
  simRound(all) {
    for (const m of this.rounds[this.round]) if (!m.res && (all || (m.a !== this.human && m.b !== this.human))) { m.res = this.sim(m); this.note(m); }
    this.advance();
  }
  advance() {
    for (;;) {
      const cur = this.rounds[this.round]; if (cur.some(m => !m.res)) return false;
      if (this.rr && this.round < 2) { this.rounds.push(this.rrDay(this.round + 1)); this.round++; continue; }
      if (this.rr && this.round === 2) {
        // the round robin over: the top two of each group into the semi-finals, crossed (A1 v B2, B1 v A2); the rest go out
        const A = this.standings(0), B = this.standings(1);
        for (const s of [...A.slice(2), ...B.slice(2)]) this.out[s.id] = 'RR';
        this.rounds.push([{ a: A[0].id, b: B[1] ? B[1].id : null, res: null }, { a: B[0].id, b: A[1] ? A[1].id : null, res: null }]); this.round++;
        for (const m of this.rounds[this.round]) if (m.b == null) m.res = { winner: m.a, loser: null, bye: true, sets: [] };
        return true;
      }
      if (cur.length === 1) { this.champion = cur[0].res.winner; return true; }
      const next = []; for (let i = 0; i < cur.length; i += 2) next.push(this.pair(cur[i].res.winner, cur[i + 1].res.winner));
      this.rounds.push(next); this.round++;
      if (next.every(m => m.res)) continue;
      return true;
    }
  }
  simAll() { let g = 0; while (this.champion == null && g++ < 12) this.simRound(true); }
  // points every entrant leaves with
  points() {
    const P = {}, T = this.T;
    if (this.rr) {
      // 200 a round-robin win, 400 for the semi-final won, 500 for the final
      for (const g of this.groups) for (const id of g) P[id] = 0;
      this.rounds.forEach((r, ri) => { for (const m of r) if (m.res && !m.res.bye && !m.res.wo && m.res.winner != null) P[m.res.winner] += ri < 3 ? T.points.RR : ri === 3 ? T.points.SF : T.points.F; });
      return P;
    }
    for (const id in this.out) P[id] = T.points[this.out[id]] || 0;
    if (this.champion != null) P[this.champion] = T.points.W;
    return P;
  }
  resultFor(id) { return this.champion === id ? 'W' : this.out[id] || null; }
  entrantIds() { const s = new Set(); for (const m of this.rounds[0]) { if (m.a != null) s.add(m.a); if (m.b != null) s.add(m.b); } if (this.rr) for (const g of this.groups) for (const id of g) s.add(id); return [...s]; }
  toJSON() { return { key: this.T.key, human: this.human, rounds: this.rounds, round: this.round, champion: this.champion, out: this.out, seedNo: this.seedNo, names: this.names, rr: !!this.rr, groups: this.groups || null, lastMin: this.lastMin }; }
  static from(j, seed, ctx) { const T = TOURNAMENTS.find(t => t.key === j.key), d = Object.create(Draw.prototype); Object.assign(d, { T, human: j.human, rounds: j.rounds, round: j.round, champion: j.champion, out: j.out, seedNo: j.seedNo || {}, names: j.names || T.rounds, rr: !!j.rr, groups: j.groups || null, lastMin: j.lastMin || {}, r: rng(seed || 1), ctx: ctx || null }); return d; }
}

// ---------- injuries ----------
// Where, and for how long (ATP top 50, 2018-22, 267 conditions: median days out 17, mean 33; by area below; one in sixteen needs
// surgery, a median two months out). Half the time it is the place he was always hurt.
const PARTS = [['shoulder', 10, 16], ['back', 9, 8], ['leg', 9, 14], ['foot', 9, 12], ['knee', 8, 22], ['thigh', 7, 18], ['ankle', 7, 14], ['abdomen', 6, 29], ['wrist', 6, 27], ['hip', 5, 27], ['illness', 18, 10], ['elbow', 6, 20]];
const MED = Object.fromEntries(PARTS.map(p => [p[0], p[2]]));
function pickInjury(id, r) {
  const own = injurySpots(id); let part;
  if (own.length && r() < 0.5) part = own[Math.floor(r() * own.length)];
  else { let u = r() * PARTS.reduce((t, p) => t + p[1], 0); for (const p of PARTS) { u -= p[1]; if (u <= 0) { part = p[0]; break; } } part = part || 'back'; }
  const surgery = part !== 'illness' && r() < 0.06;
  const days = surgery ? 45 + r() * 130 : (MED[part] || 15) * Math.exp(0.85 * gauss(r));
  return { part, days: Math.max(4, Math.round(days)), surgery };
}

// ---------- the season ----------
const KEY = 'rallypro.season.v3';
export class Season {
  constructor(humanId, o = {}) {
    this.human = humanId; this.seed = o.seed || (Date.now() & 0xfffff); this.r = rng(this.seed);
    this.ev = 0;                                    // index into TOURNAMENTS of the next event
    this.pts = {}; for (const p of PLAYERS) this.pts[p.id] = 0;
    this.results = [];                              // { key, champion, human: 'QF' | 'W' | null, pts, out: [ids withdrawn] }
    this.draw = null;
    this.pool = o.pool || 'all';                    // 'all' | 'active'
    // each man's plan for the year (data.js planSeason), his form (log-odds about his record: a season starts some men hot, some
    // cold), who is hurt and until when (the event he is back for), and what has happened
    this.plan = {}; this.form = {}; this.inj = {}; this.news = []; this.ready = -1;
    { const r = rng(this.seed ^ 0x91a5); for (const p of PLAYERS) { this.plan[p.id] = p.id === humanId ? [] : [...planSeason(p.id, r)]; this.form[p.id] = 0.18 * gauss(r); } }
    this.base = this.baseOrder();
  }
  field() { return PLAYERS.filter(p => this.pool === 'all' || p.active || p.id === this.human).map(p => p.id); }
  // before any points exist: career strength, with this season's form on top, so each season opens with its own order
  // (by his level - data.js LEVEL - and the season's form, not his career win rate: by that Kyrgios opened above Thiem)
  baseOrder() { const s = {}; for (const id of this.field()) s[id] = levelOf(id) + 6 * (this.form[id] || 0);
    return this.field().sort((a, b) => s[b] - s[a]); }
  ranking() { const base = this.base; return this.field().sort((a, b) => (this.pts[b] - this.pts[a]) || (base.indexOf(a) - base.indexOf(b))); }
  rankOf(id) { return this.ranking().indexOf(id) + 1; }
  get event() { return TOURNAMENTS[this.ev] || null; }
  get done() { return this.ev >= TOURNAMENTS.length; }
  fit(id, ev = this.ev) { const j = this.inj[id]; return !j || j.back <= ev; }
  plays(id, T) { return id !== this.human && this.plan[id] && this.plan[id].includes(T.key) && this.fit(id); }
  // the week's late withdrawals, once: a planned man pulls out with a niggle or an illness and misses just this event
  prepare() {
    const T = this.event; if (!T || this.ready === this.ev) return; this.ready = this.ev;
    for (const id of this.field()) if (this.plays(id, T) && this.r() < 0.02 * injuryRisk(id)) { const j = pickInjury(id, this.r); j.days = Math.min(j.days, 9); this.hurt(id, j, 'withdrew'); }
  }
  // who plays this week (the human too, unless he sits it out)
  entrants(T, withHuman = true) {
    this.prepare();
    const rank = this.ranking().filter(id => withHuman || id !== this.human);
    if (T.level === 'finals') return rank.filter(id => id === this.human || this.fit(id)).slice(0, 8);
    return pickField(rank, T, this.r, withHuman ? this.human : null, id => this.plays(id, T));
  }
  qualified(T) { return T.level !== 'finals' || this.ranking().filter(id => id === this.human || this.fit(id)).slice(0, 8).includes(this.human); }
  // what the draw needs from the season: form, injury risk, and every result as it happens
  ctx() {
    return {
      mod: id => FORM_PP * (this.form[id] || 0),
      risk: id => id === this.human ? 0 : injuryRisk(id),
      after: res => {
        const w = res.winner, l = res.loser; if (l == null) return;
        if (res.wo || res.ret) { if (l !== this.human) this.hurt(l, pickInjury(l, this.r), res.wo ? 'walkover' : 'retired'); }
        if (res.wo) return;
        // form: the winner up and the loser down by how unexpected it was (against their records here and their form)
        const T = this.event || this.draw && this.draw.T, lo = id => { const q = clamp(eventRate(id, T.key, T.surface).rate / 100, 0.3, 0.95); return Math.log(q / (1 - q)) + (this.form[id] || 0); };
        const pw = 1 / (1 + Math.exp(-(lo(w) - lo(l)))), k = 0.14 * (1 - pw);
        this.form[w] = clamp((this.form[w] || 0) + k, -0.7, 0.7); this.form[l] = clamp((this.form[l] || 0) - k, -0.7, 0.7);
      },
    };
  }
  // a man hurt: out until the first event at least `days` later (by the weeks of the calendar)
  hurt(id, j, how) {
    const T = TOURNAMENTS[this.ev] || TOURNAMENTS[TOURNAMENTS.length - 1], wk = T.week + j.days / 7;
    let back = this.ev + 1; while (back < TOURNAMENTS.length && TOURNAMENTS[back].week < wk) back++;
    if (how === 'withdrew') back = Math.max(back, this.ev + 1);
    const cur = this.inj[id]; if (cur && cur.back >= back) return;
    this.inj[id] = { back, part: j.part, surgery: !!j.surgery, since: this.ev, how };
    const wks = Math.max(1, Math.round(j.days / 7)), what = j.part === 'illness' ? 'illness' : `${j.surgery ? 'surgery on his ' : 'a '}${j.part}${j.surgery ? '' : ' injury'}`;
    const at = how === 'retired' ? `retired hurt at ${T.name}` : how === 'walkover' ? `gave a walkover at ${T.name}` : how === 'withdrew' ? `withdrew from ${T.name}` : 'is injured';
    const missed = back - this.ev - 1;   // (events after this one)
    this.say(`${name(id)} ${at} (${what})` + (missed > 0 ? `; out for about ${wks} week${wks > 1 ? 's' : ''}` : ''), id, 'out');
  }
  say(text, id, kind) { this.news.unshift({ ev: this.ev, text, id, kind }); if (this.news.length > 14) this.news.length = 14; }
  open() { const T = this.event; if (!T) return null; if (!this.draw || this.draw.T.key !== T.key) this.draw = new Draw(T, this.entrants(T), this.human, (this.seed + this.ev * 977) | 0, this.ctx()); return this.draw; }
  // bank the finished event and move to the next week: points, the result, who got hurt along the way, who is back, form settling
  bank(d, skipped) {
    const T = d.T, P = d.points();
    for (const id in P) this.pts[id] = (this.pts[id] || 0) + P[id];
    const planned = this.field().filter(id => this.plan[id] && this.plan[id].includes(T.key)), entered = new Set(d.entrantIds());
    const out = planned.filter(id => !entered.has(id));
    // (the whole draw kept, to be looked at again from the calendar - he said "after a tournament is finished you should be able to
    // click on it and see what happened")
    this.results.push({ key: T.key, champion: d.champion, human: skipped ? null : d.resultFor(this.human), skipped: !!skipped, pts: skipped ? 0 : P[this.human] || 0, out, draw: d.toJSON() });
    if (d.champion != null) this.say(`${name(d.champion)} won ${T.name}`, d.champion, 'win');
    // the wear of a week's matches: a man who played can come out of it hurt (more matches, more risk)
    const played = {}; for (const r of d.rounds) for (const m of r) if (m.res && !m.res.bye && !m.res.wo) { played[m.a] = (played[m.a] || 0) + 1; played[m.b] = (played[m.b] || 0) + 1; }
    for (const id in played) if (+id !== this.human && this.fit(+id, this.ev + 1) && this.r() < (0.008 + 0.004 * played[id]) * injuryRisk(+id)) this.hurt(+id, pickInjury(+id, this.r), 'injured');
    this.draw = null; this.ev++;
    // back from injury: rusty for his first few matches (Sackmann: the first match back goes about a quarter worse than his rating said)
    for (const id in this.inj) if (this.inj[id].back <= this.ev) { const j = this.inj[id]; delete this.inj[id]; if (this.ev < TOURNAMENTS.length && this.ev - j.since > 1) { this.form[id] = clamp((this.form[id] || 0) - 0.25, -0.7, 0.7); this.say(`${name(+id)} is back from his ${j.part === 'illness' ? 'illness' : j.part + ' injury'}`, +id, 'back'); } }
    for (const id in this.form) this.form[id] *= 0.93;
    this.save();
  }
  close() { this.bank(this.draw, false); }
  simEvent() { const d = this.open(); d.simAll(); this.close(); }
  // sit an event out (he said "there should be a way not to enter in an event"): it is played without him - its field drawn from
  // everyone else, its matches simulated - and he takes nothing from it
  skipEvent() {
    const T = this.event; if (!T || this.draw) return;
    const d = new Draw(T, this.entrants(T, false), -1, (this.seed + this.ev * 977) | 0, this.ctx()); d.simAll();
    this.bank(d, true);
  }
  // how long a man is out, for the screens: null if fit, otherwise { part, events (how many more he misses), back (the event) }
  injury(id) { const j = this.inj[id]; if (!j || j.back <= this.ev) return null; return { part: j.part, surgery: j.surgery, events: j.back - this.ev, back: TOURNAMENTS[j.back] ? TOURNAMENTS[j.back].name : 'next year' }; }
  save() { try { localStorage.setItem(KEY, JSON.stringify({ human: this.human, seed: this.seed, ev: this.ev, pts: this.pts, results: this.results, pool: this.pool, plan: this.plan, form: this.form, inj: this.inj, news: this.news, ready: this.ready, draw: this.draw ? this.draw.toJSON() : null })); } catch (e) { /* private mode */ } }
  static load() {
    try {
      const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (!j) return null;
      const s = new Season(j.human, { seed: j.seed, pool: j.pool }); s.ev = j.ev; s.pts = j.pts; s.results = j.results || [];
      if (j.plan) s.plan = j.plan; if (j.form) s.form = j.form; s.inj = j.inj || {}; s.news = j.news || []; s.ready = j.ready ?? -1;
      // (the random stream picks up from the week, not from the start: a season reloaded mid-year does not replay its first weeks' luck)
      s.r = rng((j.seed + j.ev * 7919) | 0);
      if (j.draw) s.draw = Draw.from(j.draw, (j.seed + j.ev * 977) | 0, s.ctx());
      return s;
    } catch (e) { return null; }
  }
  static clear() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
}
export { ROUND_NAME };
