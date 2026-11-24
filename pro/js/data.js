// Rally Pro — players and tournaments as the game uses them. The numbers come from
// playerdata.js / tourdata.js (researched career statistics and venue facts); this file
// turns them into what the engine needs and adds the things statistics do not record:
// what a player wears.
import { PLAYER_FACTS } from './playerdata.js';
import { lookFor } from './looks.js';
import { TOUR_FACTS } from './tourdata.js';
import { EVENT_WL } from './eventrecords.js';
import { BASE_PROFILE } from './sim.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const norm = (v, a, b) => clamp((v - a) / (b - a), 0, 1);
const or = (v, d) => v == null ? d : v;

// Kit and colouring. Generic athletic figures: build, skin tone, hair and colours only.
const LOOKS = {
  'Alcaraz':  { beard: 0.3, skin: '#c98a55', hair: '#15100a', top: '#12b981', shorts: '#0e1014', band: '#ffffff', rk: { frame: '#1b1f27', grip: '#f2f2ee' } },
  'Sinner':   { cap: true, capCol: '#f2f2ee', bigHair: true, skin: '#ecc6a0', hair: '#c8602a', top: '#12833f', shorts: '#101010', band: '#ffffff', rk: { frame: '#1a1c20', grip: '#26282c' } },
  'Djokovic': { beard: 0.15, skin: '#d9a878', hair: '#241a10', top: '#1746a0', shorts: '#f1f1ee', band: '#cfd6e0', rk: { frame: '#101216', grip: '#1c1e22' } },
  'Nadal':    { beard: 0.25, skin: '#c79862', hair: '#1f160d', top: '#1aa3d6', shorts: '#0b2e6b', band: '#ffffff', sleeveless: true, longHair: true, headband: true, rk: { frame: '#0f1a3a', grip: '#f4d03f' } },
  'Federer':  { skin: '#e8bd8f', hair: '#5a3d24', top: '#b03030', shorts: '#1a1a1a', band: '#ffffff', headband: true, rk: { frame: '#0e0e10', grip: '#1a1a1c' } },
  'Sampras':  { skin: '#d6a779', hair: '#1a1208', top: '#f0f0ee', shorts: '#f0f0ee', band: '#ffffff', rk: { frame: '#1d2a4a', grip: '#101010', head: 0.86 } },
  'Agassi':   { skin: '#d9a06a', hair: '#c9a36a', top: '#ff2d7a', shorts: '#101010', band: '#1aa0d0', longHair: true, headband: true, rk: { frame: '#c9302c', grip: '#1a1a1a' } },
  'Lendl':    { skin: '#e0bd96', hair: '#3a2a1a', top: '#6a6f78', shorts: '#c0392b', band: '#ffffff', rk: { frame: '#2b2f36', grip: '#141414', head: 0.88 } },
  'Borg':     { beard: 0.55, skin: '#e8c79c', hair: '#caa24a', top: '#f0efe8', shorts: '#f0efe8', band: '#d8b24a', longHair: true, headband: true, rk: { frame: '#7a5a2e', grip: '#3a2a18', head: 0.74, string: 'rgba(230,220,196,0.95)' } },
  'McEnroe':  { skin: '#e8c4a0', hair: '#7a4a28', top: '#f0f0f0', shorts: '#1f3f8a', band: '#c0392b', longHair: true, headband: true, rk: { frame: '#6f5330', grip: '#2a1e12', head: 0.78, string: 'rgba(230,220,196,0.95)' } },
  'Connors':  { skin: '#e0b48a', hair: '#3a2a18', top: '#f0f0f0', shorts: '#2a4d9a', band: '#c0392b', rk: { frame: '#b8bec7', grip: '#1a1a1a', head: 0.70 } },
  'Laver':    { skin: '#e6c69a', hair: '#b5562a', top: '#f0efe2', shorts: '#d8d8cc', band: '#b22222', rk: { frame: '#6b4a24', grip: '#2e1f10', head: 0.66, string: 'rgba(221,210,180,0.95)' } },
  'Murray':   { beard: 0.25, skin: '#e9c3a0', hair: '#5a3a22', top: '#e9e9e4', shorts: '#1c2430', band: '#ffffff', rk: { frame: '#15171c', grip: '#f1f1ec' } },
  'Edberg':   { skin: '#ecc9a4', hair: '#d2b060', top: '#f1f1ee', shorts: '#2a55a0', band: '#ffffff', rk: { frame: '#16181d', grip: '#f1f1ec', head: 0.84 } },
  'Becker':   { skin: '#eac4a2', hair: '#c97a3a', top: '#f1f1ee', shorts: '#f1f1ee', band: '#c0392b', rk: { frame: '#2a2d33', grip: '#141414', head: 0.86 } },
  'Zverev':   { beard: 0.35, skin: '#e6bf98', hair: '#b08a4a', top: '#f08a2c', shorts: '#16181d', band: '#ffffff', longHair: true, headband: true },
  'Shelton':  { beard: 0.3, bigHair: true, skin: '#b9825a', hair: '#1c1410', top: '#3fb8e8', shorts: '#12141a', band: '#ffffff', sleeveless: true },
  'Medvedev': { beard: 0.2, skin: '#e6c3a0', hair: '#6a4a2c', top: '#2c3a6a', shorts: '#e8e8e4', band: '#ffffff' },
  'Cobolli':  { skin: '#d8ac80', hair: '#2a1c12', top: '#e23a3a', shorts: '#12141a', band: '#ffffff' },
  'Fils':     { beard: 0.5, skin: '#8a5a3c', hair: '#141010', top: '#f2d23a', shorts: '#12141a', band: '#ffffff' },
  'Tiafoe':   { beard: 0.6, headband: true, skin: '#7a4e34', hair: '#141010', top: '#8a3ad0', shorts: '#16181d', band: '#ffffff', sleeveless: true },
  'de Minaur':{ cap: true, capCol: '#f2f2ee', skin: '#ddb088', hair: '#3a2818', top: '#e6e63a', shorts: '#1a2a5a', band: '#ffffff' },
  'Fritz':    { skin: '#e4bc94', hair: '#6a4a2a', top: '#f1f1ee', shorts: '#1f4fa0', band: '#ffffff', longHair: true, headband: true },
  'Jodar':    { skin: '#d6aa7e', hair: '#241810', top: '#2aa87a', shorts: '#f1f1ee', band: '#ffffff' },
  'Paul':     { skin: '#e2ba92', hair: '#7a5a34', top: '#1c2a4a', shorts: '#c0392b', band: '#ffffff' },
  'Auger-Aliassime': { beard: 0.35, skin: '#9a6a48', hair: '#161010', top: '#f1f1ee', shorts: '#16181d', band: '#ffffff' },
  'Lehecka':  { skin: '#e4be98', hair: '#4a3420', top: '#2a6ad0', shorts: '#12141a', band: '#ffffff' },
  'Mensik':   { skin: '#e6c09a', hair: '#3a2a1a', top: '#3ad0b0', shorts: '#16181d', band: '#ffffff' },
  'Davidovich Fokina': { beard: 0.3, skin: '#e0b88e', hair: '#c9a060', top: '#e86a2a', shorts: '#f1f1ee', band: '#ffffff', longHair: true },
  'Ruud':     { cap: true, capCol: '#1c2430', skin: '#e8c4a0', hair: '#8a6a3a', top: '#c8e03a', shorts: '#1c2430', band: '#ffffff' },
  'Nakashima':{ skin: '#d8ae84', hair: '#16100c', top: '#f1f1ee', shorts: '#2a2d33', band: '#ffffff' },
  'Cerundolo':{ beard: 0.3, skin: '#d2a67a', hair: '#1c140e', top: '#5ab8e8', shorts: '#f1f1ee', band: '#ffffff' },
};
// Listed playing weight in kg (public player bios; approximate for older players), and how
// each man wears his hair. With height these set the body: lean or powerful, long-limbed or compact.
const FRAME = {
  'Alcaraz': { kg: 74, arms: 1.07, legs: 1.06, hair: 'short' }, 'Sinner': { kg: 77, arms: 0.96, legs: 0.97, hair: 'curly' }, 'Djokovic': { kg: 77, hair: 'short' },
  'Nadal': { kg: 85, arms: 1.12, legs: 1.05, hair: 'long' }, 'Federer': { kg: 85, hair: 'mid' }, 'Sampras': { kg: 77, hair: 'short' }, 'Agassi': { kg: 80, hair: 'long' },
  'Lendl': { kg: 79, hair: 'short' }, 'Borg': { kg: 72, hair: 'long' }, 'McEnroe': { kg: 75, hair: 'curly' }, 'Connors': { kg: 70, hair: 'mid' }, 'Laver': { kg: 68, arms: 1.06, hair: 'short' },
  'Murray': { kg: 82, hair: 'mid' }, 'Edberg': { kg: 77, hair: 'short' }, 'Becker': { kg: 85, legs: 1.05, hair: 'short' }, 'Zverev': { kg: 90, hair: 'long' }, 'Shelton': { kg: 88, arms: 1.06, hair: 'curly' },
  'Medvedev': { kg: 83, arms: 0.96, hair: 'thin' }, 'Cobolli': { kg: 77, hair: 'short' }, 'Fils': { kg: 85, arms: 1.06, legs: 1.05, hair: 'buzz' }, 'Tiafoe': { kg: 86, arms: 1.06, hair: 'curly' },
  'de Minaur': { kg: 69, hair: 'short' }, 'Fritz': { kg: 86, hair: 'long' }, 'Jodar': { kg: 80, hair: 'short' }, 'Paul': { kg: 82, hair: 'mid' }, 'Auger-Aliassime': { kg: 88, hair: 'buzz' },
  'Wawrinka': { kg: 81, arms: 1.06, legs: 1.05, hair: 'short' }, 'Thiem': { kg: 79, arms: 1.04, legs: 1.05, hair: 'short' }, 'Tsitsipas': { kg: 90, hair: 'long' }, 'del Potro': { kg: 97, hair: 'short' },
  'Roddick': { kg: 88, hair: 'short' }, 'Kyrgios': { kg: 85, hair: 'buzz' }, 'Monfils': { kg: 85, hair: 'buzz' }, 'Ivanisevic': { kg: 82, hair: 'short' }, 'Wilander': { kg: 77, hair: 'mid' }, 'Kuerten': { kg: 80, hair: 'curly' }, 'Hewitt': { kg: 72, hair: 'short' },
  'Lehecka': { kg: 80, hair: 'short' }, 'Mensik': { kg: 85, hair: 'short' }, 'Davidovich Fokina': { kg: 80, hair: 'long' }, 'Ruud': { kg: 77, hair: 'short' }, 'Nakashima': { kg: 79, hair: 'short' }, 'Cerundolo': { kg: 77, hair: 'mid' },
};
function buildFor(name, cm) {
  const f = FRAME[name] || { kg: 80 }, h = cm / 100, bmi = f.kg / (h * h);
  const g = Math.min(1.10, Math.max(0.92, 1 + (bmi - 22.6) * 0.024));       // girth against a tour-average frame
  return { arms: g * (f.arms || 1), legs: g * (f.legs || 1), chest: 1 + (g - 1) * 0.7, depth: 1 + (g - 1) * 0.9, shoulders: (g - 1) * 0.12 + (h - 1.85) * 0.02, kg: f.kg, bmi };
}

// Where radar and tracking did not exist, the pace of the era stands in.
const ERA = {
  'Laver':   { s1: 165, s2: 135, max: 185, fh: 104, bh: 98,  fhRpm: 1300, bhRpm: 1100, s1In: 62, df: 3.0, hold: 84, brk: 30 },
  'Borg':    { s1: 172, s2: 140, max: 190, fh: 110, bh: 106, fhRpm: 2400, bhRpm: 2200, s1In: 62, df: 2.4, hold: 85, brk: 33 },
  'Connors': { s1: 162, s2: 135, max: 185, fh: 114, bh: 114, fhRpm: 1200, bhRpm: 1100, s1In: 65, df: 2.5, hold: 82, brk: 32 },
  'McEnroe': { s1: 172, s2: 142, max: 190, fh: 106, bh: 102, fhRpm: 1300, bhRpm: 1100, s1In: 57, df: 4.0, hold: 86, brk: 29 },
  'Lendl':   { s1: 186, s2: 150, max: 210, fh: 120, bh: 108, fhRpm: 2300, bhRpm: 1800, s1In: 56, df: 2.7, hold: 86, brk: 31 },
  'Edberg':  { s1: 178, s2: 152, max: 205, fh: 110, bh: 108, fhRpm: 1700, bhRpm: 1700 },
  'Becker':  { s1: 196, s2: 160, max: 227, fh: 118, bh: 106, fhRpm: 1800, bhRpm: 1600 },
  'Agassi':  { s1: 180, s2: 148, max: 209, fh: 124, bh: 120 },
  'Sampras': { fh: 122, bh: 106 },
  'Murray':  { bh: 114, bhRpm: 1700 },
  'Jodar':   { s1: 188, s2: 154, max: 215 },
  'Nakashima': { fh: 121, bh: 114, fhRpm: 2500, bhRpm: 1600 },
  // (the 2026-11 additions' missing speeds and spins: era- and style-typical estimates, as above; Wilander's serve and return
  // tables cover only 1991-96, past his best, so his prime is estimated too)
  'del Potro': { bh: 112, fhRpm: 2700, bhRpm: 1600 }, 'Roddick': { fh: 124, bh: 108, fhRpm: 2600, bhRpm: 1600 }, 'Kyrgios': { bh: 112, fhRpm: 2700, bhRpm: 1700 },
  'Monfils': { fh: 122, bh: 116, fhRpm: 2600, bhRpm: 1800 }, 'Ivanisevic': { fh: 115, bh: 108, fhRpm: 2000, bhRpm: 1500 }, 'Hewitt': { fh: 116, bh: 116, fhRpm: 2100, bhRpm: 1800 },
  'Kuerten': { s1: 192, s2: 156, max: 214, fh: 124, bh: 118, fhRpm: 2800, bhRpm: 2200 },
  'Wilander': { s1: 168, s2: 140, max: 188, fh: 108, bh: 108, fhRpm: 2100, bhRpm: 1900, s1In: 64, df: 2.3, hold: 80, brk: 34 },
};

// The tour is the twelve from the original Rally: three of today's best and nine from the game's history.
// (the 2026-11 additions go on the end: a player's id is his place in this list, and saved seasons keep ids)
export const ROSTER = ['Alcaraz', 'Sinner', 'Djokovic', 'Nadal', 'Federer', 'Sampras', 'Agassi', 'Lendl', 'Borg', 'McEnroe', 'Connors', 'Laver',
  'Murray', 'Wawrinka', 'Zverev', 'Thiem', 'Medvedev', 'Tsitsipas', 'del Potro', 'Roddick', 'Kyrgios', 'Monfils', 'Becker', 'Edberg', 'Ivanisevic', 'Wilander', 'Kuerten', 'Hewitt'];
// A forehand played as a weapon, whatever the man's aggression overall (ai.js decide): Nadal's measured aggression is the lowest
// on the tour (Tennis Abstract's, which counts the whole of his game), and his forehand, the shot he won with, came out of it a
// slow loop - he said "the topspin makes rafas forehand so slow and so high instead of it being a lethal weapon like it is irl".
const FH_AGG = { Nadal: 0.7 };
export const PLAYERS = ROSTER.map(n => PLAYER_FACTS.find(f => f.name === n)).filter(Boolean).map((f, id) => {
  const e = ERA[f.name] || {};
  const rep = f.rep !== false;                         // false: the stat tables only cover the end of the career
  const s1In = or(rep ? f.s1In : e.s1In, or(f.s1In, 61));
  const dfs = or(rep ? f.dfs : e.df, or(f.dfs, 2.8));
  const hold = or(rep ? f.hold : e.hold, or(f.hold, 82)), brk = or(rep ? f.brk : e.brk, or(f.brk, 25));
  const s1Kmh = or(f.s1Kmh, or(e.s1, 185)), s2Kmh = or(f.s2Kmh, or(e.s2, Math.round(s1Kmh * 0.82)));
  const sMax = Math.max(or(f.sMax, or(e.max, s1Kmh + 26)), s1Kmh + 16);
  const fhKmh = or(f.fhKmh, or(e.fh, 122)), bhKmh = or(f.bhKmh, or(e.bh, 113));
  const fhRpm = or(f.fhRpm, or(e.fhRpm, 2500)), bhRpm = or(f.bhRpm, or(e.bhRpm, 1750));
  const win = f.win || {};
  const overall = or(win.overall, 60);
  // second serves that go in, from double faults per match (about 80 service points a match)
  const secondIn = clamp(1 - dfs / (80 * (1 - s1In / 100)), 0.84, 0.965);
  const look = { ...(lookFor(f.name, 'default') || LOOKS[f.name] || { skin: '#dcb088', hair: '#2a1c12', top: '#f1f1ee', shorts: '#16181d', band: '#ffffff' }), lefty: f.lefty, oneHandBh: f.oneHandBh, height: f.cm / 100 };
  // His body: his own shape where tools/body_shapes.py has built one (`shape`, in assets/people/m04_shapes.bin:
  // his height, listed weight, muscle and build from MakeHuman's body). The radial numbers below are only the
  // fallback for a player without one, or when that file cannot be loaded.
  look.build = { shape: f.name, ...buildFor(f.name, f.cm), ...(look.body || {}) }; look.hairStyle = (FRAME[f.name] || {}).hair || 'short';
  // Fallback only: the measured differences between the men read smaller on a screen than they look in life, and
  // the library's body is slighter through the arms than a tour player: shown half as large again.
  for (const k of ['arms', 'armL', 'armR', 'foreL', 'foreR', 'chest', 'depth', 'legs', 'calf']) if (look.build[k] != null) look.build[k] = 1 + (look.build[k] - 1) * 1.5 + (/arm|fore/.test(k) ? 0.04 : 0);
  if (look.build.shoulders != null) look.build.shoulders *= 1.5;
  const base = {
    name: f.name, lefty: !!f.lefty, oneHandBh: !!f.oneHandBh, height: f.cm / 100,
    s1Kmh, s1Max: sMax, s2Kmh, firstIn: s1In / 100, secondIn,
    wideD: or(f.wideD, 48) / 100, wideA: or(f.wideA, 48) / 100, wideBias: (or(f.wideD, 48) + or(f.wideA, 48)) / 200 + 0.02,
    fhKmh, bhKmh, fhRpm, bhRpm,
    // movement is not a published number: breaks of serve and second-serve return points
    // won are the cleanest measures of how much court a player covers
    speed: lerp(5.75, 6.45, norm(brk, 15, 33) * 0.6 + norm(or(f.r2Won, 51), 46, 56) * 0.4),
    accel: lerp(6.2, 7.4, norm(brk, 15, 33)),
    react: lerp(0.265, 0.215, norm(or(f.r1Won, 30), 25, 35)),
    cons: clamp(0.25 + 0.4 * norm(or(f.rallyLen, 4), 2.9, 5.0) + 0.4 * norm(overall, 54, 83), 0.2, 0.95),
    agg: clamp(0.5 + or(f.aggr, 0) / 210, 0.08, 0.95),
    net: or(f.netPct, 10) / 100, sv: or(f.svPct, 2) / 100, drop: or(f.dropPct, 1) / 100, slice: or(f.slicePct, 14) / 100,
    volley: norm(or(f.netWon, 68), 62, 75), ret: norm(or(f.r1Won, 30), 25, 35),
    touch: clamp(0.35 + norm(or(f.dropPct, 1), 0, 3) * 0.35 + norm(or(f.netWon, 68), 62, 75) * 0.3, 0, 1),
    flat: clamp(0.12 + norm(3200 - fhRpm, 0, 1900) * 0.5, 0.1, 0.65),
    fhBias: lerp(0.05, 0.65, norm(or(f.fhShare, 49), 39, 55)),
    aceAim: norm(or(f.aces, 5), 2, 11),
    fhAgg: FH_AGG[f.name] != null ? FH_AGG[f.name] : null,
  };
  return { id, facts: f, look, base, hold, brk, overall, win, active: f.rank != null };
});
export const playerByName = n => PLAYERS.find(p => p.facts.name === n);
// What a player wears at an event: his kit for that major, or his ordinary one.
// Players wear a season's collection through that season's events, not one kit all year: the Australian Open kit
// through the early hard courts and the spring, the French Open kit through the clay and onto the grass before
// Wimbledon, whites at Wimbledon, the US Open kit through the summer hard courts and the autumn.
const KIT_SEASON = { ao: 'ao', rot: 'ao', dal: 'ao', doh: 'ao', rio: 'ao', dub: 'ao', aca: 'ao', iw: 'ao', mia: 'ao',
  mc: 'rg', bar: 'rg', mun: 'rg', mad: 'rg', rom: 'rg', ham: 'rg', rg: 'rg', hal: 'rg', que: 'rg', wim: 'wim',
  was: 'us', can: 'us', cin: 'us', us: 'us', tok: 'us', bei: 'us', sha: 'us', bas: 'us', vie: 'us', par: 'us', fin: 'us' };
export const kitEvent = key => KIT_SEASON[key] || 'default';
export function lookAt(id, eventKey) { const P = PLAYERS[id]; return { ...P.look, ...(lookFor(P.facts.name, kitEvent(eventKey)) || {}) }; }

// How each surface is played, whoever is playing on it. `grip` is how well a shoe holds the court
// (on clay a player slides into the ball and takes longer to stop; grass is slick, worst when worn);
// `brake` how hard he can pull up against his run; the rest scale how often a style is chosen there:
// serve-and-volley and the low slice live on grass, the drop shot and the long patient rally on clay.
export const SURFACE_PLAY = {
  hard:  { grip: 1.00, brake: 1.35, net: 1.00, sv: 1.0, drop: 1.0, slice: 1.00, agg: 0.00, spin: 1.00, arc: 1.00, about: 'True bounce · even pace' },
  clay:  { grip: 0.86, brake: 1.02, net: 0.60, sv: 0.4, drop: 1.7, slice: 0.85, agg: -0.07, spin: 1.06, arc: 1.08, about: 'Slow · high bounce · players slide' },
  grass: { grip: 0.90, brake: 1.15, net: 1.55, sv: 2.2, drop: 0.7, slice: 1.40, agg: 0.07, spin: 0.93, arc: 0.88, about: 'Fast · low skid · serve rules' },
};
// (spin, arc: on clay everyone brushes up more and plays with more margin over the net, the court rewarding height and
// kick; on grass a topspin ball sits up to be hit, so the ball is flattened and kept low. `arc` scales the net clearance
// of a rally drive, `spin` its topspin.)
// How much better or worse a player is on a surface than on the tour as a whole, from his career win
// rate there against his overall rate: Nadal on clay, Sampras and Federer on grass, Borg on hard courts.
export function surfaceEdge(id, surface) {
  const P = PLAYERS[id], w = P.win[surface] || P.overall, adv = clamp(w / P.overall, 0.8, 1.15);
  return { adv, pct: Math.round((adv - 1) * 100) };
}
// His win rate at one event: his career record there (eventrecords.js) where he has played it enough, pulled toward his
// record on its surface by as many matches again as he is short of a full sample (so a 3-0 debut moves him little and
// Nadal's 112-4 at Roland Garros counts almost as it stands); his surface record alone where he has hardly played it.
const EV_MIN = 6, EV_PRIOR = 14;
export function eventRate(id, key, surface) {
  const P = PLAYERS[id], surf = P.win[surface] || P.overall, wl = key && EVENT_WL[P.facts.name] && EVENT_WL[P.facts.name][key];
  if (!wl || wl[0] + wl[1] < EV_MIN) return { rate: surf, wl: wl || null, src: 'surface' };
  return { rate: (wl[0] + EV_PRIOR * surf / 100) / (wl[0] + wl[1] + EV_PRIOR) * 100, wl, src: 'event' };
}
// How much better or worse he is at this event than on the tour as a whole (the surface where the event has no record).
export function eventEdge(id, key, surface) {
  const P = PLAYERS[id], r = eventRate(id, key, surface), adv = clamp(r.rate / P.overall, 0.8, 1.18);
  return { adv, pct: Math.round((adv - 1) * 100), src: r.src, wl: r.wl };
}
// A player's profile on a given surface: the surface's own way of playing, and his edge there (at the event when it is
// known, from his record at it), which makes him steadier, quicker about the court, harder hitting and surer on serve.
export function profileFor(id, surface, key) {
  const P = PLAYERS[id], b = { ...BASE_PROFILE, ...P.base }, S = SURFACE_PLAY[surface] || SURFACE_PLAY.hard;
  const { adv } = key ? eventEdge(id, key, surface) : surfaceEdge(id, surface), k = adv - 1;
  b.cons = clamp(b.cons + k * 1.1, 0.1, 0.98);
  b.speed *= 1 + k * 0.35; b.accel *= (1 + k * 0.5) * S.grip; b.brake = S.brake;
  b.react *= 1 - k * 0.4;
  b.fhKmh *= 1 + k * 0.4; b.bhKmh *= 1 + k * 0.4;
  b.s1Kmh *= 1 + k * 0.25; b.firstIn = clamp(b.firstIn + k * 0.12, 0.45, 0.8);
  if (surface === 'clay' && k > 0) { b.fhRpm *= 1 + k * 0.6; b.bhRpm *= 1 + k * 0.6; }        // the clay-courter's heavier ball
  b.fhRpm *= S.spin; b.bhRpm *= S.spin; b.arcS = S.arc;
  b.net = clamp(b.net * S.net, 0, 0.9); b.sv = clamp(b.sv * S.sv, 0, 0.9); b.drop = clamp(b.drop * S.drop, 0, 0.2); b.slice = clamp(b.slice * S.slice, 0, 0.6);
  b.agg = clamp(b.agg + S.agg, 0.05, 0.97); if (b.fhAgg != null) b.fhAgg = clamp(b.fhAgg + S.agg, 0.05, 0.97);
  b.adv = adv;
  // The five he wants above everyone (he said "alcaraz, sinner, federer, djokovic, and nadal in general should just be above the
  // rest"): steadier, quicker to the ball and off the mark, and a little more pace, on top of their own numbers. Their numbers alone
  // put Federer and Alcaraz behind Medvedev, Zverev and Agassi (the bot at Tour won 48% and 51% of points from them, 42-43% from
  // those three). ELITE_K scales each man's edge so that all five come out hardest.
  const eK = ELITE_K[P.facts.name];
  if (eK) { b.cons = clamp(b.cons + 0.07 * eK, 0.1, 0.98); b.speed *= 1 + 0.03 * eK; b.accel *= 1 + 0.04 * eK; b.react *= 1 - 0.06 * eK;
    b.fhKmh *= 1 + 0.025 * eK; b.bhKmh *= 1 + 0.025 * eK; b.s1Kmh *= 1 + 0.015 * eK; b.firstIn = clamp(b.firstIn + 0.02 * eK, 0.45, 0.8); }
  return b;
}
const ELITE_K = { Alcaraz: 1, Sinner: 1.6, Djokovic: 1.3, Nadal: 2.2, Federer: 2.5 };   // (the bot at Tour then wins 33-37% of points from them, 42% from Medvedev, the hardest of the rest)
// and in simulated matches and seeding (season.js gameProb, eventSeeding): percentage points more service games held and broken
export const isElite = id => PLAYERS[id] && ELITE_K[PLAYERS[id].facts.name] != null;
export const ELITE_SIM = 4;
// Who plays an event (he said "rn for some reason some players never enter tournaments": the field was the twelve strongest at each
// event, and Wawrinka, Ivanisevic, Monfils and Kyrgios were in 2-4% of the fields, Thiem 6%, Kuerten 10%). `order`: everyone, best
// first (strength at the event, or the season's ranking). The human always plays; at a Slam or a Masters 1000 the five do too (they
// are compulsory for the top men, as on the tour), at a 500 each about half the time; the other places are drawn, the stronger more
// likely, every man with a real chance. The Finals are the top eight.
export function pickField(order, T, rnd, me) {
  const n = T.draw;
  if (T.level === 'finals') { const f = order.slice(0, n); if (me != null && !f.includes(me)) f[n - 1] = me; return order.filter(id => f.includes(id)); }
  const f = new Set(me != null ? [me] : []), big = T.level === 'slam' || T.level === 'm1000';
  for (const id of order) if (f.size < n && isElite(id) && (big || rnd() < 0.5)) f.add(id);
  // (drawn by weight without putting back: each man's key is u^(1/w), the highest keys play; w falls from 1 for the strongest left
  // to about a fifth for the weakest at a big event, a third at a 500)
  const rest = order.filter(id => !f.has(id)).map((id, i) => ({ id, k: Math.pow(Math.max(1e-9, rnd()), 1 + i / (big ? 5.5 : 9)) }));
  rest.sort((a, b) => b.k - a.k); for (const r of rest) { if (f.size >= n) break; f.add(r.id); }
  return order.filter(id => f.has(id));
}
// Strength for simulated matches: career win rate on the surface, as odds.
export function strength(id, surface, key) { const w = clamp(eventRate(id, key, surface).rate / 100, 0.3, 0.93); return w / (1 - w); }
// Seeding for an event: how strong each man is here (his record at this event, or on this surface where he has none),
// with this week's form on top (a log-odds wobble, `form` wide), best first. The same field seeds differently from one
// entry to the next, and by the event: Nadal at Roland Garros, the grass players at Wimbledon. `rnd` gives 0..1.
export function eventSeeding(ids, T, rnd, form = 0.35) {
  const g = () => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
  // (his win rate here as it is, up to 98.5%: the match model caps it at 93%, which would rank Nadal at Roland Garros, 112-4,
  // level with anyone else above 93)
  const lo = id => { const w = clamp(eventRate(id, T.key, T.surface).rate / 100, 0.3, 0.985); return Math.log(w / (1 - w)) + (isElite(id) ? 0.8 : 0); };
  return ids.map(id => ({ id, s: lo(id) + form * g() })).sort((a, b) => b.s - a.s).map(x => x.id);
}

// ---------- tournaments ----------
const LEVEL_NAME = { slam: 'Grand Slam', m1000: 'Masters 1000', finals: 'Tour Finals', '500': 'ATP 500' };
// draws are played from this many players; real points for the rounds that exist
// Every event takes all twelve: the top four seeds have a bye, the other eight play for the
// remaining quarter-final places. The Finals take the top eight.
const DRAW = { slam: 12, m1000: 12, '500': 12, finals: 8 };
const ROUNDS = { 12: ['R16', 'QF', 'SF', 'F'], 8: ['QF', 'SF', 'F'] };
const ROUND_NAME = { R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarter-final', SF: 'Semi-final', F: 'Final', W: 'Champion' };
export { ROUND_NAME, LEVEL_NAME };

export const TOURNAMENTS = TOUR_FACTS.map((t, id) => {
  const draw = DRAW[t.level], rounds = ROUNDS[draw];
  const pts = t.pts || {};
  // points for losing in each round, and for the title
  const table = t.level === 'finals'
    ? { QF: 200, SF: 600, F: 1000, W: 1500 }
    : Object.fromEntries([...rounds.map(r => [r, or(pts[r], 0)]), ['W', or(pts.W, 500)]]);
  // court pace relative to the surface family: published CPI where there is one, otherwise
  // Tennis Abstract's ace-based surface speed rating
  const ref = { hard: 39, clay: 24.5, grass: 37 }[t.surface];
  const pace = t.cpi != null ? clamp(t.cpi - ref, -9, 12) : clamp((or(t.speed, 1) - 1) * 22, -7, 9);
  return {
    id, key: t.key, name: t.name, city: t.city, country: t.country, level: t.level, levelName: LEVEL_NAME[t.level], month: t.month,
    surface: t.surface, indoor: t.indoor, court: t.court, cap: t.cap, roof: t.roof, night: !!t.night,
    draw, rounds, points: table, bestOf: t.bestOf === 5 ? 5 : 3,
    cpi: t.cpi, speed: t.speed, pace, alt: or(t.alt, 0), temp: or(t.temp, 22), hum: or(t.hum, 50), windKmh: t.indoor ? 0 : or(t.windKmh, 8),
    inner: t.inner, outer: t.outer, balls: t.balls, backdrop: t.backdrop, stats: { ace: t.ace, rally: t.rallyLen, hold: t.hold },
  };
});

// Playing conditions for the physics. Wind inside a bowl is a fraction of the open-field
// reading the weather stations give.
export function envFor(T, session, rnd) {
  const r = rnd || Math.random;
  const shelter = T.cap > 12000 ? 0.22 : T.cap > 8000 ? 0.3 : 0.4;
  const w = (T.windKmh / 3.6) * shelter * (0.6 + r() * 0.8), a = r() * Math.PI * 2;
  const night = session === 'night';
  return { surface: T.surface, pace: T.pace, altitude: T.alt, tempC: T.temp - (night ? 4 : 0), humidity: T.hum / 100, indoor: T.indoor, windX: Math.cos(a) * w, windZ: Math.sin(a) * w };
}

// Besides the opponent's handicap, each level sets how forgiving the game is to the person
// playing: `window` is how far off the ideal moment a release may be and still count as
// clean (s), `aid` scales the scatter on your shots, `safe` keeps the aim marker that far
// inside the sideline and baseline (m), `aimSafe` is how much of the miss ring the target is
// kept inside the lines once the ball is actually struck, `srvSafe` the same for the serve. Checked with
// tools/humanbot.mjs, a bot that plays through the real controls with human reaction time,
// timing and aiming error.
// (every level's opponent a notch stronger on 2026-11-23 - he said "also make the opponent slightly better": 15% fewer errors, 3% quicker
// round the court, 4% quicker to react, 2% more pace than before)
export const DIFFICULTY = [
  { key: 'club',   name: 'Club',       err: 1.28, speed: 0.89, react: 1.25, pace: 0.88, window: 0.070, aid: 0.88, clean: 0.4, mercy: 1, safe: [1.1, 2.2], aimSafe: 1.0, srvSafe: 0.85, desc: 'Slower ball, slower opponent, more mistakes from the other side. Generous timing, and your aim is kept well inside the lines.' },
  { key: 'pro',    name: 'Challenger', err: 0.81, speed: 0.99, react: 1.04, pace: 0.98, window: 0.050, aid: 0.95, clean: 0.5, mercy: 0.65, safe: [0.8, 1.6], aimSafe: 0.75, srvSafe: 0.65, desc: 'A proper match. The opponent misses when pushed; you have some margin for error.' },
  { key: 'tour',   name: 'Tour',       err: 0.53, speed: 1.03, react: 0.96, pace: 1.02, window: 0.035, aid: 1.12, clean: 0.6, mercy: 0.35, safe: [0.35, 0.9], aimSafe: 0.35, srvSafe: 0.35, desc: 'His real numbers: serve speed, spin, consistency, court coverage. You can aim at the lines, and miss them.' },
];
