// Rally Pro — tournaments and the season. Draws, simulated matches built from each
// player's real hold and break percentages, ranking points by round, and the save file.
import { PLAYERS, TOURNAMENTS, ROUND_NAME, eventRate, isElite, ELITE_SIM, pickField } from './data.js';

export function rng(seed) { let s = (seed >>> 0) || 1; return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// ---------- one simulated match ----------
// Service games are decided by the server's hold rate against the returner's break rate,
// both shifted by how each man does on the surface. That is where the scores come from:
// big servers play tiebreaks, returners break.
function gameProb(a, b, surface, key) {
  const A = PLAYERS[a], B = PLAYERS[b];
  // his record at this event where there is one, on its surface where not
  const adv = id => eventRate(id, key, surface).rate - PLAYERS[id].overall;
  const el = id => isElite(id) ? ELITE_SIM : 0;   // (the five above the rest, data.js ELITE_K)
  const hold = A.hold + adv(a) * 0.35 + el(a), brk = B.brk + adv(b) * 0.35 + el(b);
  // tour average: 81 % of service games held, 19 % broken
  return clamp((hold + (100 - brk)) / 2 + (hold - 81) * 0.25 - (brk - 19) * 0.25, 45, 97) / 100;
}
function tiebreak(pa, pb, first, to, r) {
  // point-level: a server wins roughly hold^0.28 of his service points
  const sa = Math.pow(pa, 0.28) * 0.82, sb = Math.pow(pb, 0.28) * 0.82;
  let a = 0, b = 0, srv = first, n = 0;
  for (;;) { const p = srv === 0 ? sa : 1 - sb; if (r() < p) a++; else b++; n++; if (n % 2 === 1) srv = 1 - srv; if ((a >= to || b >= to) && Math.abs(a - b) >= 2) return [a, b]; }
}
export function simMatch(a, b, T, r, o = {}) {
  const surface = T.surface, pa = gameProb(a, b, surface, T.key), pb = gameProb(b, a, surface, T.key);
  const bestOf = o.bestOf || T.bestOf || 3, need = (bestOf + 1) / 2, games = o.games || 6;
  const sets = []; let wa = 0, wb = 0, srv = r() < 0.5 ? 0 : 1;
  while (wa < need && wb < need) {
    let ga = 0, gb = 0, tb = null;
    for (;;) {
      const hold = r() < (srv === 0 ? pa : pb);
      if ((srv === 0) === hold) ga++; else gb++;
      srv = 1 - srv;
      if ((ga >= games || gb >= games) && Math.abs(ga - gb) >= 2) break;
      if (ga === games && gb === games) {
        const deciding = wa + wb === bestOf - 1, to = deciding && bestOf === 5 ? 10 : 7;
        tb = tiebreak(pa, pb, srv, to, r); if (tb[0] > tb[1]) ga++; else gb++; srv = 1 - srv; break;
      }
    }
    sets.push({ g: [ga, gb], tb }); if (ga > gb) wa++; else wb++;
  }
  return { winner: wa > wb ? a : b, loser: wa > wb ? b : a, sets, a, b };
}
export function scoreLine(res, forId) {
  const flip = forId != null && res.b === forId;
  return res.sets.map(s => { const x = flip ? s.g[1] : s.g[0], y = flip ? s.g[0] : s.g[1]; return `${x}-${y}` + (s.tb ? `(${Math.min(s.tb[0], s.tb[1])})` : ''); }).join(' ');
}

// ---------- a draw ----------
// Standard seeding: 1 and 2 in opposite halves, 3-4 in opposite quarters, and so on.
function seedSlots(n) { let s = [1, 2]; while (s.length < n) { const m = s.length * 2 + 1, t = []; for (const x of s) t.push(x, m - x); s = t; } return s; }
export class Draw {
  // entrants: player ids in ranking order (best first)
  constructor(T, entrants, humanId, seed) {
    this.T = T; this.human = humanId; this.r = rng(seed || 1); this.seedNo = {};
    const n = T.draw, e = entrants.slice(0, n);
    if (n === 12) {
      // twelve players: seeds 1-4 wait in the quarter-finals, 5-12 play in
      e.forEach((id, i) => { if (i < 8) this.seedNo[id] = i + 1; });
      this.byes = [e[0], e[3], e[2], e[1]];
      this.rounds = [[[7, 8], [4, 11], [5, 10], [6, 9]].map(([a, b]) => ({ a: e[a], b: e[b], res: null }))];
      this.round = 0; this.champion = null; this.out = {};
      return;
    }
    // the top quarter of the field is seeded; the rest are drawn at random into the gaps
    const seeded = Math.max(2, n / 4), order = seedSlots(n), slots = new Array(n).fill(null);
    const rest = e.slice(seeded); for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(this.r() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    let k = 0;
    for (let i = 0; i < n; i++) { const sd = order[i]; if (sd <= seeded) { slots[i] = e[sd - 1]; this.seedNo[e[sd - 1]] = sd; } else slots[i] = rest[k++]; }
    this.rounds = [];                               // rounds[r] = [{ a, b, res }]
    const first = []; for (let i = 0; i < n; i += 2) first.push({ a: slots[i], b: slots[i + 1], res: null });
    this.rounds.push(first); this.round = 0; this.champion = null; this.out = {};   // out[id] = round name he lost in
  }
  get roundName() { return this.T.rounds[this.round]; }
  humanMatch() { if (this.champion != null) return null; return this.rounds[this.round].find(m => !m.res && (m.a === this.human || m.b === this.human)) || null; }
  alive(id) { return !(id in this.out); }
  hasBye(id) { return !!this.byes && this.round === 0 && this.byes.includes(id); }
  // record a played match
  report(match, res) { match.res = res; this.out[res.loser] = this.T.rounds[this.round]; this.advance(); }
  // simulate every other match of the round; the human's waits unless `all`
  simRound(all) {
    for (const m of this.rounds[this.round]) if (!m.res && (all || (m.a !== this.human && m.b !== this.human))) { m.res = simMatch(m.a, m.b, this.T, this.r); this.out[m.res.loser] = this.T.rounds[this.round]; }
    this.advance();
  }
  advance() {
    const cur = this.rounds[this.round]; if (cur.some(m => !m.res)) return false;
    if (cur.length === 1) { this.champion = cur[0].res.winner; return true; }
    const next = [];
    if (this.byes && this.round === 0) cur.forEach((m, i) => next.push({ a: this.byes[i], b: m.res.winner, res: null }));
    else for (let i = 0; i < cur.length; i += 2) next.push({ a: cur[i].res.winner, b: cur[i + 1].res.winner, res: null });
    this.rounds.push(next); this.round++; return true;
  }
  simAll() { let g = 0; while (this.champion == null && g++ < 12) this.simRound(true); }
  // points every entrant leaves with
  points() { const P = {}; for (const id in this.out) P[id] = this.T.points[this.out[id]] || 0; if (this.champion != null) P[this.champion] = this.T.points.W; return P; }
  resultFor(id) { return this.champion === id ? 'W' : this.out[id] || null; }
  toJSON() { return { key: this.T.key, human: this.human, rounds: this.rounds, round: this.round, champion: this.champion, out: this.out, seedNo: this.seedNo, byes: this.byes || null }; }
  static from(j, seed) { const T = TOURNAMENTS.find(t => t.key === j.key), d = Object.create(Draw.prototype); Object.assign(d, { T, human: j.human, rounds: j.rounds, round: j.round, champion: j.champion, out: j.out, seedNo: j.seedNo || {}, byes: j.byes || null, r: rng(seed || 7) }); return d; }
}

// ---------- the season ----------
const KEY = 'rallypro.season.v2';
export class Season {
  constructor(humanId, o = {}) {
    this.human = humanId; this.seed = o.seed || (Date.now() & 0xfffff); this.r = rng(this.seed);
    this.ev = 0;                                    // index into TOURNAMENTS of the next event
    this.pts = {}; for (const p of PLAYERS) this.pts[p.id] = 0;
    this.results = [];                              // { key, champion, human: 'QF' | 'W' | null, pts }
    this.draw = null;
    this.pool = o.pool || 'all';                    // 'all' | 'active'
    this.base = this.baseOrder();
  }
  field() { return PLAYERS.filter(p => this.pool === 'all' || p.active || p.id === this.human).map(p => p.id); }
  // before any points exist, order by career win rate; real rankings for the active players break ties
  // (before any points exist: career strength, with this season's form on top, so each season opens with its own order)
  baseOrder() { const r = rng(this.seed ^ 0x5eed5), g = () => { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
    const s = {}; for (const id of this.field()) { const w = Math.min(0.93, PLAYERS[id].overall / 100); s[id] = Math.log(w / (1 - w)) + 0.3 * g(); }
    return this.field().sort((a, b) => s[b] - s[a]); }
  ranking() { const base = this.base; return this.field().sort((a, b) => (this.pts[b] - this.pts[a]) || (base.indexOf(a) - base.indexOf(b))); }
  rankOf(id) { return this.ranking().indexOf(id) + 1; }
  get event() { return TOURNAMENTS[this.ev] || null; }
  get done() { return this.ev >= TOURNAMENTS.length; }
  // who plays this week
  entrants(T) {
    const rank = this.ranking();
    if (T.level === 'finals') return rank.slice(0, 8);
    if (T.draw >= rank.length) return rank;
    return pickField(rank, T, this.r, this.human);
    // smaller events: the top players pick and choose; the human always enters
    const e = []; for (const id of rank) { if (id === this.human) { e.push(id); continue; } if (e.length < T.draw && this.r() < 0.74) e.push(id); }
    for (const id of rank) if (e.length < T.draw && !e.includes(id)) e.push(id);
    if (!e.includes(this.human)) e[e.length - 1] = this.human;
    return rank.filter(id => e.includes(id)).slice(0, T.draw);
  }
  qualified(T) { return T.level !== 'finals' || this.ranking().slice(0, 8).includes(this.human); }
  open() { const T = this.event; if (!T) return null; if (!this.draw || this.draw.T.key !== T.key) this.draw = new Draw(T, this.entrants(T), this.human, (this.seed + this.ev * 977) | 0); return this.draw; }
  // bank the finished event and move to the next week
  close() {
    const d = this.draw, T = d.T, P = d.points();
    for (const id in P) this.pts[id] = (this.pts[id] || 0) + P[id];
    this.results.push({ key: T.key, champion: d.champion, human: d.resultFor(this.human), pts: P[this.human] || 0 });
    this.draw = null; this.ev++; this.save();
  }
  simEvent() { const d = this.open(); d.simAll(); this.close(); }
  save() { try { localStorage.setItem(KEY, JSON.stringify({ human: this.human, seed: this.seed, ev: this.ev, pts: this.pts, results: this.results, pool: this.pool, draw: this.draw ? this.draw.toJSON() : null })); } catch (e) { /* private mode */ } }
  static load() {
    try {
      const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (!j) return null;
      const s = new Season(j.human, { seed: j.seed, pool: j.pool }); s.ev = j.ev; s.pts = j.pts; s.results = j.results || [];
      if (j.draw) s.draw = Draw.from(j.draw, (j.seed + j.ev * 977) | 0);
      return s;
    } catch (e) { return null; }
  }
  static clear() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
}
export { ROUND_NAME };
