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
// Return numbers the stat tables lack for the two oldest careers (the Match Charting Project's charted matches: Borg won 39% of points
// against first serves and 54% against second in 34 matches, taken a little lower for the small sample; Laver estimated), so their
// court coverage is not the tour average by default
const FILL = { Borg: { r1Won: 36, r2Won: 54, aces: 4 }, Laver: { r1Won: 33, r2Won: 53, aces: 6 } };
export const PLAYERS = ROSTER.map(n => PLAYER_FACTS.find(f => f.name === n)).filter(Boolean).map(f0 => ({ ...f0, ...Object.fromEntries(Object.entries(FILL[f0.name] || {}).filter(([k]) => f0[k] == null)) })).map((f, id) => {
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
// o.own: the man a person is playing - his record at the event counts half (he said, as Thiem against Sinner at the Finals, "it was
// impossible to get a winner": Thiem's record indoors there took 16% off him, his pace and steadiness, on top of Sinner's best event)
export function profileFor(id, surface, key, o = {}) {
  const P = PLAYERS[id], b = { ...BASE_PROFILE, ...P.base }, S = SURFACE_PLAY[surface] || SURFACE_PLAY.hard;
  const { adv } = key ? eventEdge(id, key, surface) : surfaceEdge(id, surface), k = (adv - 1) * (o.own ? 0.5 : 1);
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
  // His level (LEVEL below): steadier, quicker to the ball and off the mark, a little more pace and a surer first serve the higher it
  // is - the same for every man, a unit for every five points of level from the middle of the tour (84)
  { const u = clamp((courtLevelOf(id) - 84) / 5, -2.4, 3);   /* (not below a level of 72 in a match: a man with no major is still a tour player) */
    b.cons = clamp(b.cons + 0.07 * u, 0.1, 0.98); b.speed *= 1 + 0.015 * u; b.accel *= 1 + 0.02 * u; b.react *= 1 - 0.03 * u;
    b.fhKmh *= 1 + 0.025 * u; b.bhKmh *= 1 + 0.025 * u; b.s1Kmh *= 1 + 0.015 * u; b.firstIn = clamp(b.firstIn + 0.02 * u, 0.45, 0.8); }
  // (and none of it beyond what a man can be: no one steadier than 0.95 - at the old ceiling, 0.98, Sinner at the Finals all but never
  // missed, the bot won 37% of the points from him - nor quicker than the quickest, nor slower to react than the slowest)
  b.speed = clamp(b.speed, 5.4, 7.0); b.accel = clamp(b.accel, 4.9, 8.2); b.react = clamp(b.react, 0.19, 0.28);
  b.cons = Math.min(b.cons, 0.95);
  b.tempo = tempoOf(P.facts.name); b.style = styleOf(P.facts.name);
  return b;
}
// How long each man takes between points, from the end of one to his serve (seconds): measured at the Australian Opens of 2014-16
// for Monfils 14.1, Kyrgios 14.9, Federer 17.3, Djokovic 21.3, Murray 24.0 and Nadal 24.9; the rest estimated from how they are
// known to play (Agassi and Edberg quick, Zverev, Tsitsipas and Medvedev slow). The serve clock goes by it (sim.js beginReady).
const TEMPO = { Monfils: 14.1, Kyrgios: 14.9, Federer: 17.3, Djokovic: 21.3, Murray: 24.0, Nadal: 24.9, Alcaraz: 19.5, Sinner: 20.5, Sampras: 17.5, Agassi: 16.5,
  Lendl: 21.5, Borg: 17.5, McEnroe: 18.5, Connors: 19.5, Laver: 15.5, Wawrinka: 22.0, Zverev: 23.0, Thiem: 21.5, Medvedev: 21.0, Tsitsipas: 23.0, 'del Potro': 22.0,
  Roddick: 16.5, Becker: 20.0, Edberg: 15.5, Ivanisevic: 17.0, Wilander: 19.0, Kuerten: 19.0, Hewitt: 20.0 };
export const tempoOf = name => TEMPO[name] || 20;
// How each man plays, from the Match Charting Project (Tennis Abstract, every charted match of his career) and the ATP's numbers
// (he asked for "more unique attributes and playstyles reminiscent of how they actually play"):
//   sv / sv2: where his first and second serves go, deuce court [wide, body, T] then ad court, in % (Nadal's lefty slice wide in the
//     ad court 56%, Kuerten's second serve there 75%, Kyrgios down the T 54% in both courts);
//   r1 / r2: where he stands to return a first and a second serve on a hard court, metres behind the baseline (Medvedev 4.1 and 2.7,
//     measured; Federer 0.2, measured; Agassi and Connors on it, inside against a second); clay puts everyone further back;
//   rd: where he rallies from, metres behind the baseline (Agassi on it, Nadal two back, Thiem and Monfils three and more);
//   fh / bh: share of his forehands, backhands, hit crosscourt (with the inside-out forehand) and down the line (with inside-in);
//   lob: lobs per hundred shots (Laver 5.1, McEnroe and Connors 2.7, Sinner 0.55); clutch: how he plays break points against his
//     usual serving, -1 to 1 (Zverev and Tsitsipas save about nine points fewer than they should, Kuerten served better on them);
//   sv2k: how often he serves and volleys behind a second serve, against his first (Edberg as often); sabr: Federer's charge on a
//   second serve. Positions marked estimated in the research are judgements from how they are known to play.
const STYLE = {
  Alcaraz:  { sv: [48, 19, 33, 47, 17, 36], sv2: [33, 23, 44, 61, 20, 19], r1: 1.7, r2: 0.3, rd: 0.9, fh: [0.65, 0.16], bh: [0.56, 0.13], lob: 2.0, clutch: 0 },
  Sinner:   { sv: [46, 12, 41, 56, 10, 34], sv2: [25, 50, 25, 38, 50, 12], r1: 2.0, r2: 0.3, rd: 0.5, fh: [0.62, 0.12], bh: [0.51, 0.15], lob: 0.55, clutch: -0.1 },
  Djokovic: { sv: [48, 11, 41, 47, 10, 42], sv2: [43, 30, 27, 35, 32, 33], r1: 1.5, r2: 0.0, rd: 0.8, fh: [0.63, 0.13], bh: [0.48, 0.15], lob: 1.0, clutch: 0.1 },
  Nadal:    { sv: [37, 12, 51, 56, 10, 34], sv2: [13, 41, 46, 45, 44, 11], r1: 3.6, r2: 2.6, rd: 2.0, fh: [0.68, 0.14], bh: [0.44, 0.19], lob: 0.9, clutch: 0.05 },
  Federer:  { sv: [48, 9, 43, 52, 7, 41], sv2: [35, 24, 41, 52, 25, 23], r1: 0.3, r2: -0.4, rd: 0.4, fh: [0.61, 0.12], bh: [0.45, 0.17], lob: 1.2, clutch: 0, sabr: 0.1 },
  Sampras:  { sv: [47, 7, 47, 41, 7, 52], sv2: [34, 32, 34, 34, 32, 34], r1: 1.0, r2: 0.0, rd: 1.4, fh: [0.66, 0.14], bh: [0.54, 0.13], lob: 0.6, clutch: -0.2, sv2k: 0.7 },
  Agassi:   { sv: [54, 10, 36, 58, 5, 37], sv2: [35, 35, 30, 72, 18, 10], r1: 0.0, r2: -0.6, rd: 0.1, fh: [0.65, 0.12], bh: [0.63, 0.16], lob: 1.2, clutch: 0.4 },
  Lendl:    { sv: [51, 9, 40, 55, 7, 38], sv2: [27, 46, 27, 69, 20, 11], r1: 1.5, r2: 0.8, rd: 1.5, fh: [0.63, 0.12], bh: [0.50, 0.15], lob: 2.1, clutch: 0.2 },
  Borg:     { sv: [63, 10, 27, 39, 10, 51], sv2: [25, 52, 23, 25, 50, 25], r1: 2.5, r2: 1.5, rd: 2.5, fh: [0.60, 0.10], bh: [0.54, 0.14], lob: 2.35, clutch: 0.2 },
  McEnroe:  { sv: [38, 21, 41, 56, 10, 34], sv2: [27, 43, 30, 55, 25, 20], r1: -0.2, r2: -0.8, rd: 0.5, fh: [0.60, 0.14], bh: [0.38, 0.20], lob: 2.7, clutch: -0.15, sv2k: 0.9 },
  Connors:  { sv: [30, 12, 58, 60, 10, 30], sv2: [33, 34, 33, 50, 30, 20], r1: -0.1, r2: -0.6, rd: 0.2, fh: [0.62, 0.13], bh: [0.50, 0.17], lob: 2.7, clutch: 0.1 },
  Laver:    { sv: [35, 15, 50, 44, 20, 36], sv2: [24, 20, 56, 62, 18, 20], r1: 1.0, r2: 0.4, rd: 1.2, fh: [0.58, 0.14], bh: [0.50, 0.18], lob: 5.1, clutch: 0.1, sv2k: 0.8 },
  Murray:   { sv: [53, 9, 38, 41, 8, 51], sv2: [25, 45, 30, 47, 33, 20], r1: 1.5, r2: 0.5, rd: 2.0, fh: [0.65, 0.12], bh: [0.54, 0.15], lob: 2.0, clutch: 0 },
  Wawrinka: { sv: [47, 10, 42, 49, 6, 45], sv2: [30, 35, 35, 60, 25, 15], r1: 3.0, r2: 2.0, rd: 2.5, fh: [0.63, 0.13], bh: [0.54, 0.21], lob: 1.0, clutch: 0.38 },
  Zverev:   { sv: [49, 6, 45, 44, 6, 50], sv2: [17, 37, 46, 41, 35, 24], r1: 3.5, r2: 1.5, rd: 3.0, fh: [0.60, 0.12], bh: [0.55, 0.18], lob: 1.0, clutch: -1 },
  Thiem:    { sv: [49, 7, 45, 53, 8, 39], sv2: [33, 34, 33, 49, 30, 21], r1: 4.0, r2: 2.5, rd: 3.5, fh: [0.66, 0.13], bh: [0.50, 0.21], lob: 1.0, clutch: -0.36 },
  Medvedev: { sv: [53, 8, 39, 42, 8, 50], sv2: [45, 25, 30, 35, 30, 35], r1: 4.1, r2: 2.7, rd: 3.0, fh: [0.62, 0.13], bh: [0.58, 0.12], lob: 1.0, clutch: -0.49 },
  Tsitsipas:{ sv: [48, 7, 44, 47, 8, 45], sv2: [28, 44, 28, 30, 41, 29], r1: 3.0, r2: 1.5, rd: 2.0, fh: [0.68, 0.14], bh: [0.48, 0.14], lob: 1.0, clutch: -0.96 },
  'del Potro': { sv: [40, 10, 50, 44, 11, 45], sv2: [25, 51, 24, 33, 34, 33], r1: 2.5, r2: 1.5, rd: 2.0, fh: [0.64, 0.17], bh: [0.50, 0.10], lob: 0.8, clutch: -0.2 },
  Roddick:  { sv: [52, 6, 42, 40, 6, 54], sv2: [35, 35, 30, 64, 20, 16], r1: 2.0, r2: 1.0, rd: 2.0, fh: [0.66, 0.12], bh: [0.50, 0.12], lob: 0.8, clutch: -0.27 },
  Kyrgios:  { sv: [38, 8, 54, 39, 8, 53], sv2: [30, 21, 49, 54, 20, 26], r1: 1.5, r2: 1.0, rd: 1.6, fh: [0.63, 0.14], bh: [0.50, 0.16], lob: 0.6, clutch: 0.3 },
  Monfils:  { sv: [47, 9, 44, 46, 6, 48], sv2: [47, 28, 25, 40, 30, 30], r1: 4.0, r2: 3.0, rd: 3.8, fh: [0.62, 0.14], bh: [0.49, 0.12], lob: 1.0, clutch: 0.2 },
  Becker:   { sv: [43, 11, 45, 47, 14, 39], sv2: [33, 34, 33, 48, 32, 20], r1: 1.0, r2: 0.5, rd: 1.5, fh: [0.62, 0.16], bh: [0.45, 0.24], lob: 2.2, clutch: -0.1, sv2k: 0.45 },
  Edberg:   { sv: [40, 24, 36, 54, 12, 34], sv2: [30, 40, 30, 55, 25, 20], r1: 1.0, r2: 0.0, rd: 1.2, fh: [0.55, 0.12], bh: [0.48, 0.20], lob: 2.1, clutch: -0.1, sv2k: 1.0 },
  Ivanisevic: { sv: [36, 10, 54, 56, 10, 34], sv2: [33, 30, 37, 50, 25, 25], r1: 1.0, r2: 0.5, rd: 1.6, fh: [0.60, 0.14], bh: [0.50, 0.15], lob: 0.8, clutch: 0.18 },
  Wilander: { sv: [48, 4, 48, 48, 4, 48], sv2: [28, 44, 28, 28, 44, 28], r1: 1.0, r2: 0.3, rd: 1.5, fh: [0.55, 0.12], bh: [0.51, 0.14], lob: 2.2, clutch: 0.2 },
  Kuerten:  { sv: [38, 10, 52, 65, 8, 27], sv2: [35, 35, 30, 75, 15, 10], r1: 2.5, r2: 1.5, rd: 2.5, fh: [0.65, 0.12], bh: [0.56, 0.20], lob: 1.0, clutch: 1 },
  Hewitt:   { sv: [57, 8, 35, 43, 8, 49], sv2: [48, 27, 25, 62, 22, 16], r1: 0.7, r2: 0.2, rd: 0.8, fh: [0.68, 0.12], bh: [0.68, 0.16], lob: 0.8, clutch: -0.05 },
};
export const styleOf = name => STYLE[name] || null;
// How good each man was at his best, one number (the middle of the tour 84, a unit every five points): from his career - majors, titles,
// weeks at No. 1, win rate - with the five he named highest (he said "alcaraz, sinner, federer, djokovic, and nadal in general should
// just be above the rest" - Federer, Nadal and Djokovic level with each other, "fed nadal djok should all be same ovr" - and "the big five shouldnt have boosts this way... just bake it into whatever player attribute / adv
// system we have"). It goes into his attributes in a match (profileFor), his service games held and broken in simulated matches
// (season.js) and his seeding, the same way for everyone. Careers count win rate over a whole career, early and late years with the
// best, so a level is what his career says he was at his peak.
const LEVEL = { Djokovic: 95, Federer: 95, Nadal: 95, Alcaraz: 93, Sinner: 93 };
// (everyone else's from his career, by one rule: majors, whether he reached No. 1 (or the top three), titles and win rate - he asked
// "why is medvedev rated so highly... same with tsitsipas": set by hand, Medvedev had stood level with Wilander's seven majors and
// Tsitsipas with Roddick. By it Sampras, Borg and Laver are 88-89, Medvedev 79, Tsitsipas 74.)
const careerLevel = P => { const f = P.facts; return Math.round(70 + 4.0 * Math.log(1 + (f.slams || 0)) + (f.high === 1 ? 1.5 : f.high <= 3 ? 0.5 : 0) + 1.3 * Math.log(1 + (f.titles || 0)) + 0.12 * (P.overall - 70)); };
export const levelOf = id => { const P = PLAYERS[id]; return P ? LEVEL[P.facts.name] ?? careerLevel(P) : 80; };
// How his game, built from his statistics, plays in a match against his level, measured and taken out (tools/classicbot.mjs: the bot as
// Murray against each man at Miami, at the Tour level, 300 points each, with no correction; the points the bot won against what his
// level says - 1.3 points in a hundred for every point of level - three quarters of the difference corrected, at about 1.2 points of
// the bot's wins a level point, at most six either way: a big server is hard to break whatever his level, and that is his). Measured
// again whenever the levels or the way the computer plays change (on 2026-11-24, when they came to be worked out from careers; on
// 2026-11-25, when the computer's groundstrokes came to be struck as a person's are and it came to put short balls away, sim.js
// CPU_HIT and ai.js decide: three ladders of 300 points
// each, seed=5, 11 and 23, averaged; one alone is good to about two points of level either way). /tmp/rally-work/tour/ladder.sh.
const CAL = { Sampras: 4.8, Federer: 3.5, Sinner: -0.9, Agassi: 0.5, Nadal: 3.8, Alcaraz: 2.8, Djokovic: 2, McEnroe: 6, Wawrinka: 1.3, Laver: 6, Zverev: -5, Borg: 0.7, Connors: 6, Lendl: -1.4, Tsitsipas: -4.7, Thiem: -2.2, Roddick: -5.2, Kyrgios: -6, Monfils: -6, Medvedev: -6, "del Potro": -6, Ivanisevic: 0.3, Hewitt: 0.4, Edberg: 3.7, Kuerten: -2.3, Becker: 5.1, Wilander: -1.5 };
export const courtLevelOf = id => levelOf(id) + ((PLAYERS[id] && CAL[PLAYERS[id].facts.name]) || 0);
// His ratings for the menus, as a football game shows them (he said "attributes n stuff should be visible on a player in the menu like
// fifa style"): overall is his level; the six from his real numbers, each against the other 27 men (a standard deviation is nine
// points about 80) and a third his level - serve from his holds, aces and pace; return from breaks and points won against first and
// second serves; forehand and backhand from their pace and spin; movement from how much court his returning says he covers and how
// quick the research found him; net from points won there and how often he goes.
const MOVE = { Alcaraz: 4, Djokovic: 4, Nadal: 4, Borg: 4, Murray: 4, Monfils: 4, Hewitt: 4, Laver: 4, Sinner: 3, Federer: 3, Connors: 3, Sampras: 3, Zverev: 3, Thiem: 3, Medvedev: 3,
  Edberg: 3, Wilander: 3, Lendl: 3, Agassi: 2, McEnroe: 2, Wawrinka: 2, Tsitsipas: 2, Kuerten: 2, Roddick: 2, Becker: 2, Ivanisevic: 2, Kyrgios: 2, 'del Potro': 1 };
// (each man's weapon and weakness, as the charting research names them, five points either way: pace and spin alone rate Federer's
// forehand below Thiem's, and Djokovic's return below Borg's)
const SHOTS = { Alcaraz: ['fh mov'], Sinner: ['bh'], Djokovic: ['ret bh'], Nadal: ['fh'], Federer: ['fh srv'], Sampras: ['srv net'], Agassi: ['ret'], Lendl: ['fh'],
  McEnroe: ['net'], Connors: ['ret', 'fh'], Laver: ['bh net'], Murray: ['ret bh', 'srv'], Wawrinka: ['bh'], Zverev: ['bh srv', 'fh'], Thiem: ['fh bh'], Medvedev: ['ret bh'],
  Tsitsipas: ['fh', 'bh ret'], 'del Potro': ['fh', 'bh'], Roddick: ['srv fh', 'bh net'], Kyrgios: ['srv'], Monfils: ['mov'], Becker: ['srv net'], Edberg: ['net', 'fh'],
  Ivanisevic: ['srv'], Wilander: ['ret'], Kuerten: ['bh'], Hewitt: ['mov ret'] };
let RATE = null;
export function ratingsOf(id) {
  if (!RATE) {
    const vals = PLAYERS.map(P => { const f = P.facts, b = P.base;
      return { srv: [P.hold, or(f.aces, 5), b.s1Kmh], ret: [P.brk, or(f.r1Won, 30), or(f.r2Won, 51)], fh: [b.fhKmh, b.fhRpm, or(f.fhShare, 49)], bh: [b.bhKmh, b.bhRpm], mov: [MOVE[f.name] || 2, b.speed], net: [or(f.netWon, 68), or(f.netPct, 10), or(f.svPct, 2)] }; });
    const W = { srv: [0.5, 0.3, 0.2], ret: [0.4, 0.3, 0.3], fh: [0.55, 0.25, 0.2], bh: [0.6, 0.4], mov: [0.65, 0.35], net: [0.3, 0.4, 0.3] };
    // (pace and spin against his own era's: the wooden and early metal rackets of Laver, Connors, Borg and McEnroe hit slower than any
    // modern one, which says nothing of how good their forehands were)
    const era = P => (P.facts.born || 1980) < 1961 ? 0 : P.facts.born < 1977 ? 1 : 2, ERA_K = { srv: [2], fh: [0, 1], bh: [0, 1] };
    const z = {}; for (const k in W) { z[k] = vals.map(() => 0); W[k].forEach((w, j) => {
      const xs = vals.map(v => v[k][j]), byEra = ERA_K[k] && ERA_K[k].includes(j);
      const stat = sel => { const ys = xs.filter((x, i) => sel(i)), m = ys.reduce((t, x) => t + x, 0) / ys.length, sd = Math.sqrt(ys.reduce((t, x) => t + (x - m) ** 2, 0) / ys.length) || 1; return [m, sd]; };
      xs.forEach((x, i) => { const [m, sd] = byEra ? stat(q => era(PLAYERS[q]) === era(PLAYERS[i])) : stat(() => true); z[k][i] += w * (x - m) / sd; }); }); }
    RATE = PLAYERS.map((P, i) => { const L = levelOf(P.id), o = { ovr: L }, sh = SHOTS[P.facts.name] || [], up = (sh[0] || '').split(' '), dn = (sh[1] || '').split(' ');
      for (const k in W) o[k] = Math.round(clamp(0.7 * (80 + 10 * z[k][i]) + 0.3 * L + (up.includes(k) ? 5 : 0) - (dn.includes(k) ? 5 : 0), 50, 99)); return o; });
  }
  return RATE[id];
}
// in simulated matches, points of service games held and broken per point of level above the tour's middle
export const LEVEL_SIM = 0.45;
// ---------- who plays where ----------
// Each man plans his year as the top men do (he said "all the big 5 players shouldnt have to play in every tournament, make the
// schedules more realistic"): the four majors; the Masters 1000s, compulsory for the top men, though a top-30 man misses about two of
// the twelve big events a year (Sackmann's match data, 2015-25: median 1, a third miss none) - Monte-Carlo, not compulsory, mostly by
// those who like clay; and five to seven of the sixteen 500s (four are required of the top 30; with no 250s here, a little more), the ones he likes: where he has played
// most (his career matches there), on a surface that suits him, at home. Injuries take him out of some of them (season.js).
const HOME = { Australia: 'AUS', Netherlands: 'NED', 'United States': 'USA', USA: 'USA', Qatar: 'QAT', Brazil: 'BRA', 'United Arab Emirates': 'UAE', Mexico: 'MEX', Monaco: 'MON',
  Spain: 'ESP', Germany: 'GER', Italy: 'ITA', France: 'FRA', 'United Kingdom': 'GBR', 'Great Britain': 'GBR', England: 'GBR', Canada: 'CAN', Japan: 'JPN', China: 'CHN', Switzerland: 'SUI', Austria: 'AUT', Sweden: 'SWE', Argentina: 'ARG' };
export function eventPull(id, T) {
  const P = PLAYERS[id], wl = EVENT_WL[P.facts.name] && EVENT_WL[P.facts.name][T.key], n = wl ? wl[0] + wl[1] : 0;
  const aff = clamp((P.win[T.surface] || P.overall) / P.overall, 0.82, 1.15), home = HOME[T.country] && HOME[T.country] === P.facts.country ? 2.2 : 1;
  return (1 + Math.min(n, 40) / 8) * Math.pow(aff, 4) * home;
}
// one man's year: the keys of the events he means to play (`rnd` 0..1)
export function planSeason(id, rnd) {
  const P = PLAYERS[id], plan = new Set(), risk = injuryRisk(id);
  for (const T of TOURNAMENTS) {
    if (T.level === 'slam' && rnd() < 0.985) plan.add(T.key);
    if (T.level === 'm1000') { const aff = clamp((P.win[T.surface] || P.overall) / P.overall, 0.85, 1.12);
      const p = T.key === 'mc' ? 0.5 * Math.pow(aff, 6) : clamp(0.93 * Math.pow(aff, 2) - 0.04 * (risk - 1), 0.55, 0.97); if (rnd() < p) plan.add(T.key); }
  }
  // the 500s: drawn by how much he likes each, without putting back (each one's key u^(1/w), the highest k play)
  const k = 5 + Math.floor(rnd() * 3), five = TOURNAMENTS.filter(T => T.level === '500').map(T => ({ T, key: Math.pow(Math.max(1e-9, rnd()), 1 / eventPull(id, T)) }));
  five.sort((x, y) => y.key - x.key); for (const f of five.slice(0, k)) plan.add(f.T.key);
  return plan;
}
// How likely each man is to be hurt, against the tour's rate (about 0.8 injuries or illnesses a season that cost a top-30 man an event
// or a match), and where it tends to be: from their histories (Nadal's left foot and knees, del Potro's wrists and knee, Murray's hip,
// Thiem's wrist, Kuerten's hip, Agassi's and Lendl's backs; Edberg played 54 majors in a row).
const INJURY = {
  Alcaraz: [1.1, ['wrist', 'abdomen', 'thigh']], Sinner: [1.0, ['hip', 'knee', 'elbow']], Djokovic: [1.0, ['elbow', 'knee', 'thigh', 'shoulder']], Nadal: [1.7, ['foot', 'knee', 'wrist', 'abdomen']],
  Federer: [0.75, ['back', 'knee']], Sampras: [1.05, ['back', 'thigh', 'leg']], Agassi: [1.25, ['back', 'wrist']], Lendl: [0.95, ['back']], Borg: [0.6, []], McEnroe: [0.8, ['back']],
  Connors: [0.6, ['wrist']], Laver: [0.6, []], Murray: [1.4, ['hip', 'back', 'ankle']], Wawrinka: [1.05, ['knee', 'foot']], Zverev: [1.0, ['ankle', 'foot']], Thiem: [1.4, ['wrist']],
  Medvedev: [0.85, ['hip', 'thigh']], Tsitsipas: [1.05, ['elbow', 'shoulder', 'back']], 'del Potro': [2.1, ['wrist', 'knee']], Roddick: [1.05, ['shoulder', 'hip', 'thigh']],
  Kyrgios: [1.6, ['knee', 'wrist', 'hip']], Monfils: [1.6, ['knee', 'ankle', 'foot', 'wrist']], Becker: [1.05, ['knee', 'wrist', 'thigh']], Edberg: [0.45, []], Ivanisevic: [1.05, ['shoulder']],
  Wilander: [0.65, []], Kuerten: [1.4, ['hip']], Hewitt: [1.25, ['hip', 'foot']],
};
export const injuryRisk = id => (INJURY[PLAYERS[id].facts.name] || [1])[0];
export const injurySpots = id => (INJURY[PLAYERS[id].facts.name] || [1, []])[1];
// The field for an event: `order` is everyone, best first (strength at the event, or the season's ranking); `plan(id)` says whether
// he is playing it (his season's plan, fit); the human always plays when he enters. The Finals are the top eight who can play.
// With no plan given (a single tournament), each man's is drawn now, and a few are out hurt.
export function pickField(order, T, rnd, me, plan) {
  const n = T.draw;
  const plays = plan || (() => { const P = {}; for (const id of order) P[id] = planSeason(id, rnd).has(T.key) && rnd() > 0.05 * injuryRisk(id); return id => P[id]; })();
  if (T.level === 'finals') { const f = order.filter(id => id === me || plays(id) !== false).slice(0, n); if (me != null && !f.includes(me)) f[n - 1] = me; return order.filter(id => f.includes(id)); }
  const f = order.filter(id => id === me || plays(id)).slice(0, n);
  if (me != null && !f.includes(me)) { f[n - 1] = me; }
  return order.filter(id => f.includes(id));
}
// Strength for simulated matches: career win rate on the surface, as odds.
export function strength(id, surface, key) { const w = clamp(eventRate(id, key, surface).rate / 100, 0.3, 0.93); return w / (1 - w); }
// Seeding for an event: how strong each man is here (his record at this event, or on this surface where he has none),
// with this week's form on top (a log-odds wobble, `form` wide), best first. The same field seeds differently from one
// entry to the next, and by the event: Nadal at Roland Garros, the grass players at Wimbledon. `rnd` gives 0..1.
export function eventSeeding(ids, T, rnd, form = 0.35) {
  const g = () => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
  // (by his level, then how much better or worse he does at this event than anywhere - Nadal at Roland Garros, the grass players at
  // Wimbledon, a quarter of a level point a percent - and this week's form; it went by career win rate, and he said "thiem should not
  // be below kyrgios")
  const lv = id => levelOf(id) + 0.25 * eventEdge(id, T.key, T.surface).pct;
  return ids.map(id => ({ id, s: lv(id) + 4 * form * g() })).sort((a, b) => b.s - a.s).map(x => x.id);
}

// ---------- tournaments ----------
const LEVEL_NAME = { slam: 'Grand Slam', m1000: 'Masters 1000', finals: 'Tour Finals', '500': 'ATP 500' };
// draws are played from this many players; real points for the rounds that exist
// (he said "there should be rounds preceding the ones in the tournaments, i swear some players i just never even see their names":
// every event was twelve men, the top four straight into the quarter-finals. Now a major or a Masters is a draw of 32 - nearly
// everyone, the top seeds' byes where the field is short - a 500 of 16, and the Finals two round-robin groups of four.)
const DRAW = { slam: 32, m1000: 32, '500': 16, finals: 8 };
const ROUNDS = { 32: ['R32', 'R16', 'QF', 'SF', 'F'], 16: ['R16', 'QF', 'SF', 'F'], 8: ['RR', 'SF', 'F'] };
const ROUND_NAME = { R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarter-final', SF: 'Semi-final', F: 'Final', RR: 'Round robin', W: 'Champion' };
export { ROUND_NAME, LEVEL_NAME };

export const TOURNAMENTS = TOUR_FACTS.map((t, id) => {
  const draw = DRAW[t.level], rounds = ROUNDS[draw];
  const pts = t.pts || {};
  // points for losing in each round, and for the title
  // (the Finals: 200 a round-robin win, 400 more for winning the semi-final, 500 for the final - 1,500 for an unbeaten champion)
  const table = t.level === 'finals'
    ? { RR: 200, SF: 400, F: 500, W: 0, finals: true }
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
  { key: 'tour',   name: 'Tour',       err: 0.53, speed: 1.03, react: 0.96, pace: 1.02, window: 0.035, aid: 1.12, strike: 2.6, clean: 0.6, mercy: 0.35, safe: [0.2, 0.7], aimSafe: 0, srvSafe: 0.35, desc: 'His real numbers: serve speed, spin, consistency, court coverage. You can aim at the lines, and miss them.' },
];
