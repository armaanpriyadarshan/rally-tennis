// Rally Pro — how each ground looks. Court, surround, wall, seat and structure colours were
// sampled from photographs of the real centre courts in sunlight (see the project notes for
// the photo list); the layouts follow their architecture: Ashe's steep octagon under its
// roof opening, Chatrier's rectangular beige stands, Centre Court's dark green under a low
// roof, the roofless desert bowl at Indian Wells, Monte-Carlo open to the sea.
// Signage is the venue's own words and invented partner names — no real brands.
import * as THREE from 'three';

// (an exhibition away from the tour's courts: the tour's own partners, as the ATP's boards show them; every event has its own, BRANDS below)
const PARTNERS = ['ATP TOUR', 'Emirates', 'LEXUS', 'Lavazza', 'Infosys', 'PIF', 'Peroni', 'Hublot'];

// A photograph shows a sunlit surface after the camera's exposure and tone curve. The
// renderer does the same to whatever colour a surface is given, so the sampled colour is
// taken back to the paint underneath: darker, and a little more saturated.
function paint(hex, k = 0.80, sat = 1.08) {
  if (!hex) return hex;
  const c = new THREE.Color(hex), hsl = {}; c.getHSL(hsl, THREE.SRGBColorSpace);
  const o = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * sat), hsl.l * k, THREE.SRGBColorSpace);
  return '#' + o.getHexString(THREE.SRGBColorSpace);
}

const BASE = {
  surface: 'hard', court: '#478dd7', surround: '#97bf7e', back: 8.2, side: 5.6, corner: 5, cornerSeg: 8,
  wall: '#14315c', wallText: '#ffffff', wallH: 1.1, wallBackH: 2.4,
  seat: '#2d4f86', tread: '#3a3f47', fascia: '#16223a', concrete: '#8c8f93',
  tiers: [{ depth: 10, angle: 23 }, { gap: 1.4, lift: 3.0, depth: 13, angle: 31 }],
  rimH: 3, fill: 0.92, boards: PARTNERS, backdrop: 'city',
  netPost: '#1b1e23', netTape: '#f4f5f2', chair: '#1b2f52', umpire: '#1c2b47',
  light: { sunAz: 62 },
};
// a smaller ground for the 500s: one main tier and a few rows above
const SMALL = { tiers: [{ depth: 9, angle: 24 }, { gap: 1.2, lift: 2.2, depth: 6, angle: 30 }], back: 7.4, side: 5.0, rimH: 2.4, wallBackH: 2.0 };
const HALL = { indoor: true, roof: { type: 'ring', closed: true, lift: 9, under: '#07080b' }, backdrop: 'none', fascia: '#0b0d12', tread: '#17191e', concrete: '#2a2c31' };

export const VENUES = {
  default: {},
  // ---- the majors ----
  ao: { kidTop: '#2a6fc0', kidShorts: '#1a2c4a', kidCap: '#2a6fc0', umpire: '#1f3f73', umpireLegs: '#d9d2bf', fill: 0.86, fillTop: 0.8, city: 'MELBOURNE', court: '#4499c4', surround: '#37a9e3', wall: '#2e2d2c', wallCap: '#1a1a1c', seat: '#386899', fascia: '#111926', corner: 7, cornerSeg: 10, groundText: 'MELBOURNE',
    tiers: [{ depth: 12, angle: 26 }, { gap: 1.6, lift: 2.6, depth: 13, angle: 31 }], rimH: 3.5,
    // the two roof panels park over the ends, leaving a wide slot of sky across the court
    roof: { type: 'ring', openX: 30, openZ: 19.5, openR: 4, lift: 3, under: '#1e2937', truss: '#fbf9f1', edge: '#262d36', trusses: 0, thick: 2.4, cap: 0.6, capCol: '#4a5058' }, chair: '#0e529c', netPost: '#05080d', backdrop: 'none', light: { sunAz: 80 } },
  rg: { kidTop: '#c8643c', kidShorts: '#2d4a3e', kidCap: '#f1f1ec', umpire: '#e9e4d6', umpireLegs: '#2d4a3e', fill: 0.9, city: 'PARIS', backText: ['PARIS'], court: '#d4693a', surround: '#d46636', lines: '#f6dccb', wall: '#214440', wallCap: '#1a3835', seat: '#a09b86', tread: '#6f6a5c', fascia: '#e9e4d6', concrete: '#c4c3b6', corner: 1.5, cornerSeg: 2,
    // a big lower stand of boxes, then the motto and the upper stand; one end is a glass block (landmarks.js)
    tiers: [{ depth: 9.5, angle: 23 }, { gap: 0.8, lift: 1.0, depth: 6.5, angle: 27, ribbon: false }, { gap: 1.2, lift: 2.4, depth: 10, angle: 32 }], rimH: 2.4, wallBackH: 2.9, ribbonBg: '#ece8dc', ribbonFg: '#214440', ribbonText: 'LA VICTOIRE APPARTIENT AU PLUS OPINIÂTRE',
    backBand: { bg: '#e2dee6', fg: '#1d4a43', h: 0.44 },
    roof: { type: 'ring', openX: 31, openZ: 40, openR: 3, lift: 2.2, under: '#e2dac8', truss: '#efe9da', edge: '#ebe5d6', trusses: 90, trussSize: [0.45, 0.16], thick: 1.3 }, chair: '#1a4e49', netPost: '#b45c26', backdrop: 'none', light: { sunAz: 100 } },
  wim: { kidTop: '#1a2444', kidShorts: '#1a2444', kidCap: '#1a2444', umpire: '#1a2444', umpireLegs: '#e9e7e0', fill: 0.985, city: 'LONDON', backText: ['THE CHAMPIONSHIPS'], backTextSize: 36, boards: [''], court: '#9cac4c', surround: '#a4b457', earth: '#cac281', wear: 0.85, lines: '#edf2cd', wall: '#1c3933', wallCap: '#152c28', boardBg: '#1c3933', seat: '#2c5554', tread: '#1d3a38', fascia: '#1f3b35', concrete: '#717975', corner: 6, cornerSeg: 2, back: 7.2, side: 5.4,
    tiers: [{ depth: 10, angle: 26 }, { gap: 1.0, lift: 1.8, depth: 9, angle: 31 }], rimH: 2.2, wallBackH: 2.5, ribbon: false,
    // the fixed roof runs all the way round over the upper tier; its fascia leans out, pale grey-green
    roof: { type: 'ring', openX: 20.5, openZ: 27.5, openR: 4, lift: 0.8, under: '#8e968c', truss: '#f2f4f0', edge: '#a3ad9f', trusses: 0, thick: 2.6, flare: 2.6, cap: 1.2, capCol: '#7f877c' }, chair: '#1c3933', netPost: '#997647', backdrop: 'none', hats: 0.35, light: { sunAz: 70 } },
  us: { kidTop: '#1c2a4a', kidShorts: '#1c2a4a', kidCap: '#f1f1ec', umpire: '#1c2a4a', umpireLegs: '#c9bfa6', fill: 0.74, fillTop: 0.55, city: 'NEW YORK', backText: ['NEW YORK'], court: '#478dd7', surround: '#6b9f58', wall: '#142559', wallLit: '#25409a', clockCol: '#103329', seat: '#366588', fascia: '#a8766a', corner: 8, cornerSeg: 2, back: 8.6, side: 6.4,
    // lower bowl, two rings of suites, a loge, then the steep upper deck; the roof floats above a band of sky
    tiers: [{ depth: 11, angle: 22 }, { gap: 1.2, lift: 7.2, depth: 6, angle: 29, suites: 2 }, { gap: 1.0, lift: 3.0, depth: 24, angle: 37, seat: '#2a4670' }], rimH: 3, wallBackH: 2.9, ribbonBg: '#0a1a3a', ribbonFg: '#bfe9ff', ribbonText: 'ARTHUR ASHE STADIUM',
    roof: { type: 'ring', openX: 33, openZ: 41, openR: 12, lift: 8, under: '#c8c4ba', truss: '#f4f6f6', edge: '#e4eae9', trusses: 64, trussSize: [1.0, 0.35], thick: 2.2 }, chair: '#12244b', netPost: '#05060f', backdrop: 'none', light: { sunAz: 75 } },
  // ---- the Masters ----
  iw: { city: 'INDIAN WELLS', court: '#5a5aa0', surround: '#779b77', wall: '#1f3a2c', seat: '#2c4a38', fascia: '#2f6a4c', concrete: '#a89f94', corner: 9, cornerSeg: 2, back: 8.4, side: 6.2,
    tiers: [{ depth: 11, angle: 22 }, { gap: 1.4, lift: 3.4, depth: 17, angle: 31, seat: '#35553f' }], rimH: 2.5, wallBackH: 3, backdrop: 'hills', trees: false, chair: '#3b474e', light: { sunAz: 55 } },
  // Hard Rock Stadium since 2019: a temporary stadium on the football field (lower stand, boxes, upper stand) with the
  // Laykold blue-on-aqua court, inside the NFL bowl, whose teal upper deck is draped; the stadium's pale canopy covers
  // its seats and is open over the field, hung from four white corner masts (landmarks.js)
  mia: { city: 'MIAMI', court: '#3f71a6', surround: '#36aac6', wall: '#272d56', boardBg: '#272d56', seat: '#2f8c93', tread: '#5c6268', fascia: '#1d2850', concrete: '#a9adb1', corner: 6, cornerSeg: 3, back: 8.4, side: 6.2,
    tiers: [{ depth: 10, angle: 24 }, { gap: 0.8, lift: 3, suites: 1, depth: 7, angle: 30 }, { gap: 9, lift: 7, suites: 2, depth: 24, angle: 33, seat: '#0f4b54', fill: 0 }], rimH: 4,
    roof: { type: 'ring', openX: 41, openZ: 50, openR: 30, lift: 5, under: '#d8d6ce', truss: '#f0f1ee', edge: '#e6e7e3', trusses: 48, trussSize: [1.2, 0.4], thick: 2.2 }, backdrop: 'none', light: { sunAz: 65 } },
  mc: { city: 'MONTE-CARLO', backText: ['MONTE-CARLO'], court: '#de714a', surround: '#e28434', lines: '#f8dcc4', wall: '#1b3a2a', seat: '#1f3d33', tread: '#8a7a66', fascia: '#c98f72', concrete: '#ad8d6a', corner: 3, cornerSeg: 2, back: 7.2, side: 5.2,
    tiers: [{ depth: 7, angle: 20 }, { gap: 1.2, lift: 1.4, depth: 4, angle: 24, seat: '#3d6fa8' }], rimH: 1.2, wallBackH: 2.2, ribbon: false, backdrop: 'sea', seaAz: 180, chair: '#182926', netPost: '#3a3a36', hats: 0.4, light: { sunAz: 60 } },
  mad: { city: 'MADRID', court: '#e88048', surround: '#de7d4e', lines: '#fbd2aa', wall: '#1a1e36', seat: '#8c9eb5', tread: '#6c7078', fascia: '#9aa4b0', concrete: '#8c9eb5', corner: 1.2, cornerSeg: 1,
    tiers: [{ depth: 7, angle: 24, seat: '#7c8794' }, { gap: 1.0, lift: 2.2, depth: 13, angle: 33, seat: '#a62f3f' }], rimH: 3,
    roof: { type: 'ring', openX: 22, openZ: 31, openR: 0.5, lift: 3, under: '#43403f', truss: '#8c9eb5', edge: '#c7ced6', trusses: 14, thick: 1.4 }, chair: '#e8e4dc', backdrop: 'none', light: { sunAz: 85 } },
  rom: { city: 'ROMA', backText: ['ROMA'], groundText: 'ROMA', court: '#c26637', surround: '#b76032', lines: '#feead9', wall: '#181818', wallCap: '#2f5a2c', seat: '#55575c', fascia: '#e6e4dc', concrete: '#c1c0b6', corner: 10, cornerSeg: 10,
    tiers: [{ depth: 8, angle: 27 }, { gap: 2.4, lift: 1.4, depth: 10, angle: 22, seat: '#8a8a8d' }], rimH: 1.4, wallBackH: 2.5, ribbon: false, backdrop: 'hills', chair: '#f4f2ec', netPost: '#3d4246', light: { sunAz: 70 } },
  can: { city: 'MONTRÉAL', groundText: 'MONTRÉAL', court: '#658eba', surround: '#77a893', wall: '#202c53', seat: '#8b9097', fascia: '#1c2b4e', concrete: '#8ea3b6', corner: 6, cornerSeg: 2,
    tiers: [{ depth: 12, angle: 27 }, { gap: 1.2, lift: 3.2, depth: 6, angle: 30, glass: true }], rimH: 2.5, chair: '#506f77', light: { sunAz: 60 } },
  // repainted for 2025: navy inside the lines, bright cerulean outside, navy boards
  cin: { city: 'CINCINNATI', court: '#163c6e', surround: '#0a86dc', wall: '#0d3466', seat: '#1f3049', fascia: '#ced0cd', concrete: '#b8bab8', corner: 3, cornerSeg: 2,
    tiers: [{ depth: 9, angle: 25 }, { gap: 1.6, lift: 2.4, depth: 10, angle: 30 }], rimH: 2.5, backdrop: 'city', chair: '#161723', light: { sunAz: 95 } },
  sha: { city: 'SHANGHAI', court: '#5054a6', surround: '#5a9a70', wall: '#384678', seat: '#394774', fascia: '#304163', corner: 14, cornerSeg: 12, back: 8.4, side: 8.4,
    tiers: [{ depth: 9, angle: 20 }, { gap: 1.4, lift: 3.4, depth: 12, angle: 31 }], rimH: 3,
    roof: { type: 'ring', openX: 21, openZ: 21, openR: 21, lift: 5, under: '#d8d4cc', truss: '#f2f2ee', edge: '#ada09a', trusses: 8, thick: 2.4, glow: '#2a4fc0', glowI: 0.12 }, chair: '#444f33', backdrop: 'none', light: { sunAz: 60 } },
  // Paris La Défense Arena since 2025 (Bercy before): the pale green court with a charcoal surround that Paris has
  // played on since 2017, dark green boards, black seats, a ring of glazed boxes between the tiers, all blacked out
  par: { ...HALL, city: 'PARIS', backText: ['PARIS'], groundText: 'PARIS', court: '#99b08c', surround: '#5c5c5b', wall: '#1d4034', wallLit: '#1f4a3b', boardBg: '#1d4236', boardFg: '#ffffff', seat: '#1b1c20', corner: 4, cornerSeg: 2, back: 9, side: 7,
    tiers: [{ depth: 13, angle: 27 }, { gap: 1.2, lift: 4.6, depth: 16, angle: 34, suites: 1 }], rimH: 4, wallH: 1.0, wallBackH: 1.2, ribbonBg: '#030405', ribbonFg: '#ffffff', light: { lampCol: '#f6f8ff', expose: 1.05 } },
  // a dark slate-blue court on a bright light-blue surround, ringed by LED boards in the ATP's blue
  fin: { ...HALL, city: 'TORINO', backText: ['THE FINALS'], court: '#3e5c7e', surround: '#4fa6dc', wall: '#1f3f9a', wallText: '#ffffff', boardBg: '#1f3f9a', boardFg: '#ffffff', glowWall: 1.6, seat: '#22262e', corner: 5, cornerSeg: 2, back: 8.6, side: 6.6,
    tiers: [{ depth: 9, angle: 20 }, { gap: 1.4, lift: 2.6, depth: 13, angle: 32 }], rimH: 4, wallH: 0.9, wallBackH: 1.0, ribbonBg: '#06204a', ribbonFg: '#ffffff', light: { lampCol: '#eef4ff', expose: 1.05 } },
  // ---- the 500s ----
  rot: { ...SMALL, ...HALL, city: 'ROTTERDAM', court: '#9fae98', surround: '#7a7b7e', wall: '#0f2426', seat: '#2b2c28' },
  dal: { ...SMALL, ...HALL, city: 'DALLAS', court: '#2a4f8c', surround: '#8a939c', wall: '#101a30', seat: '#1c2536' },
  doh: { ...SMALL, city: 'DOHA', court: '#2f74bd', surround: '#5aa6dc', wall: '#5a1f3a', seat: '#7a2a48', backdrop: 'city', light: { sunAz: 60 } },
  rio: { ...SMALL, city: 'RIO DE JANEIRO', backText: ['RIO'], court: '#c9633a', surround: '#c05c36', lines: '#f6dccb', wall: '#0e3a2c', seat: '#1f5a44',
    // one temporary tier round the clay, and over it Corcovado with the statue on its summit
    tiers: [{ depth: 12, angle: 24 }], rimH: 1.6, backdrop: 'hills', peak: { az: 24, h: 96, statue: true }, light: { sunAz: 60 } },
  dub: { ...SMALL, city: 'DUBAI', court: '#3a5f9c', surround: '#5f9a6c', wall: '#2c4a78', seat: '#5d6d88', concrete: '#9d8d7e', backdrop: 'city', light: { sunAz: 70 } },
  aca: { ...SMALL, city: 'ACAPULCO', court: '#6a6172', surround: '#5f9a92', wall: '#344aa6', seat: '#c0b4a4', backdrop: 'sea', seaAz: 90, light: { sunAz: 60 } },
  bar: { ...SMALL, city: 'BARCELONA', court: '#cc6a34', surround: '#b05c38', lines: '#ead2c1', wall: '#142a5c', seat: '#233661', backdrop: 'city', light: { sunAz: 70 } },
  mun: { ...SMALL, city: 'MÜNCHEN', court: '#cf6e3c', surround: '#c56636', lines: '#f6dccb', wall: '#1d2a44', seat: '#24272c', backdrop: 'hills', light: { sunAz: 70 } },
  ham: { ...SMALL, city: 'HAMBURG', court: '#e8875a', surround: '#de7c50', lines: '#fcd7b8', wall: '#2e1618', seat: '#2e3035',
    roof: { type: 'ring', openX: 22, openZ: 30, openR: 12, lift: 6, under: '#f2f2ee', truss: '#ffffff', edge: '#e8e8e4', trusses: 12 }, backdrop: 'none', light: { sunAz: 70 } },
  hal: { ...SMALL, city: 'HALLE', court: '#a8b676', surround: '#b6c282', earth: '#cfc890', wear: 0.5, lines: '#f2f3da', wall: '#2a7a66', seat: '#1f3625',
    roof: { type: 'ring', openX: 20, openZ: 28, openR: 3, lift: 3, under: '#fdfefd', truss: '#ffffff', edge: '#e8ece8', trusses: 16 }, backdrop: 'none', light: { sunAz: 70 } },
  que: { ...SMALL, city: 'LONDON', backText: ["QUEEN'S CLUB"], court: '#5d7f33', surround: '#58782e', earth: '#b9b27a', wear: 0.45, lines: '#e4ead8', wall: '#8e2b2d', wallCap: '#3a5a2e', seat: '#333338', concrete: '#582d1f',
    tiers: [{ depth: 8, angle: 24 }, { gap: 1, lift: 1.4, depth: 4, angle: 28 }], backdrop: 'city', hats: 0.35, light: { sunAz: 70 } },
  // a low park stadium: white chairs in the courtside boxes, red seats above
  was: { ...SMALL, city: 'WASHINGTON', court: '#507096', surround: '#688666', wall: '#24345a', seat: '#dcdcd6', backdrop: 'city',
    tiers: [{ depth: 9, angle: 22 }, { gap: 0.8, lift: 1.2, depth: 6, angle: 26, seat: '#b5363c' }], light: { sunAz: 70 } },
  // two blues, and every seat the court's blue
  tok: { ...SMALL, city: 'TOKYO', court: '#617bb4', surround: '#7298df', wall: '#303bc9', seat: '#3a5cb0',
    roof: { type: 'ring', openX: 22, openZ: 30, openR: 4, lift: 4, under: '#2a2c30', truss: '#55585e', edge: '#1a1b1e', trusses: 14 }, backdrop: 'none', light: { sunAz: 70 } },
  bei: { ...SMALL, city: 'BEIJING', court: '#3566b0', surround: '#58986a', wall: '#1d2a50', seat: '#3a4a78', corner: 12, cornerSeg: 10,
    roof: { type: 'ring', openX: 22, openZ: 22, openR: 22, lift: 5, under: '#d6d2ca', truss: '#eeeeea', edge: '#7a7063', trusses: 12 }, backdrop: 'none', light: { sunAz: 70 } },
  bas: { ...SMALL, ...HALL, city: 'BASEL', court: '#5c6366', surround: '#8fb0c3', wall: '#0a0f22', seat: '#1a1b20', light: { lampCol: '#e4ecff' } },
  // since 2023 a stronger blue inside the lines on a grey surround, blue boards
  vie: { ...SMALL, ...HALL, city: 'WIEN', court: '#2357a8', surround: '#8a9097', wall: '#1d5fc0', glowWall: 1.2, seat: '#7a1410', light: { lampCol: '#f2f6ff' } },
};

// Where and when each event is played: latitude, and the day of the year of its middle
// weekend. The sun's height over the court follows from those two numbers.
const PLACE = { ao: [-37.8, 25], rot: [51.9, 43], dal: [33.1, 43], doh: [25.3, 50], rio: [-22.9, 50], dub: [25.2, 57], aca: [16.8, 57], iw: [33.7, 68], mia: [26.0, 82],
  mc: [43.75, 99], bar: [41.4, 106], mun: [48.1, 106], mad: [40.4, 116], rom: [41.9, 130], ham: [53.6, 141], rg: [48.85, 151], hal: [52.06, 169], que: [51.49, 169],
  wim: [51.43, 186], was: [38.95, 211], can: [45.5, 218], cin: [39.35, 225], us: [40.75, 249], tok: [35.7, 274], bei: [40.0, 274], sha: [31.0, 281], bas: [47.5, 302], vie: [48.2, 302], par: [48.9, 309], fin: [45.0, 323] };
// Solar elevation in degrees, `hours` after local solar noon.
export function sunElevation(key, hours) {
  const p = PLACE[key]; if (!p) return null;
  const R = Math.PI / 180, lat = p[0] * R, dec = -23.44 * R * Math.cos(2 * Math.PI * (p[1] + 10) / 365), H = hours * 15 * R;
  return Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H)) / R;
}

// What each event really shows round its show court, 2025-26 (he said "from stadium to stadium the logos are all the same and generic and
// fake instead of looking like that stadium"; a research pass over Tennis TV stills, tournament photographs and partner pages, in
// ~/.cache/rally-research/branding.md). Most courts are now LED walls in one colour with every partner in white; a few boards keep
// their own colours (Emirates white on red, Rolex white on its green). `back`: the word on the wall behind the baseline; `side`: the
// partners along the walls, most prominent first; `wall`: where the wall colour differed (kept a shade darker, as the photographed
// walls are, in shade); `clock`: the clock's maker; `drink`: the players' fridge; `ground`: a name painted behind the baseline.
const E = { t: 'Emirates', fg: '#ffffff', bg: '#d71921', font: 'Georgia, "Times New Roman", serif', weight: 'italic 700' };
const RX = { t: 'ROLEX', fg: '#ffffff', bg: '#006039', font: 'Georgia, "Times New Roman", serif', spacing: 8 };
const w = t => ({ t });
const BRANDS = {
  ao:  { back: w('KIA'), side: ['KIA', E, 'INFOSYS', 'DUNLOP', 'CyberCX', 'NB', 'GUOJIAO 1573'], clock: 'ROLEX', ribbon: 'AUSTRALIAN OPEN' },
  rot: { back: w('ROTTERDAM'), side: ['ABN·AMRO', 'LEXUS', 'ABN·AMRO', 'ROTTERDAM'], wall: '#0d0d10' },
  dal: { back: w('NEXO DALLAS OPEN'), side: ['NEXO', 'Baker Tilly', 'SUB-ZERO', 'WOLF', 'COVE', 'LEXUS'], wall: '#2f2c2a', ground: 'DALLAS' },
  doh: { back: w('ExxonMobil'), side: ['ExxonMobil', RX, 'Doha Bank', 'FIFTY ONE EAST', 'fnac'], wall: '#23479b', clock: 'ROLEX' },
  rio: { back: w('Claro'), side: [{ t: 'Claro', fg: '#ffffff', bg: '#da291c' }, 'RIO OPEN', 'Seara', 'LIDER', 'XP', 'Mubadala', 'Shell', 'ENGIE'], wall: '#14223c' },
  dub: { back: w('Dubai Duty Free'), side: ['Dubai Duty Free', E, 'J.P. Morgan', RX, 'Mercedes-Benz', 'evian'], wall: '#1d3a8f', clock: 'ROLEX' },
  aca: { back: w('telcel'), side: ['telcel', 'HSBC', 'PEPSI', 'GNP', 'SEARS', 'OPPO', 'Haier', 'GATORADE'], ground: 'ACAPULCO' },
  iw:  { back: w('BNP PARIBAS'), side: ['BNP PARIBAS', RX, E, 'BMW', 'PIF', 'HOLOGIC', 'motorola', 'FAGE'], clock: 'ROLEX', ground: 'INDIAN WELLS' },
  mia: { back: w('Cadillac'), side: ['Itaú', 'Cadillac', 'PIF', 'PIRELLI', 'LACOSTE', 'PARMIGIANO REGGIANO', 'betway'], wall: '#10152a' },
  mc:  { back: RX, side: ['BNP PARIBAS', E, 'MONACO TELECOM', 'DUNLOP', 'MALONGO', 'YOKOHAMA', 'GENERALI', 'LANSON'], wall: '#0c4d31', clock: 'ROLEX' },
  bar: { back: w('Sabadell'), side: ['Sabadell', 'MANGO', 'LA VANGUARDIA', 'DUNLOP', 'nilox', 'VEOLIA', 'CEPSA'] },
  mun: { back: w('BMW OPEN by bitpanda'), side: ['bitpanda', 'Allianz', 'RADO', 'KoRo', 'Stadtsparkasse München', 'DAIKIN'], clock: 'RADO' },
  mad: { back: w('MUTUA MADRID OPEN'), side: ['Mutua', E, 'Mercedes-Benz', 'Estrella Damm', 'COSENTINO', 'HOLOGIC', 'PIF', 'LACOSTE'], wall: '#b8392a', ground: 'MADRID' },
  rom: { back: w('BNL BNP PARIBAS'), side: ['REALE MUTUA', 'EA7 EMPORIO ARMANI', 'BMW', 'Frecciarossa', E, RX, 'Peroni'], wall: '#3a4455', clock: 'ROLEX' },
  ham: { back: w('BITPANDA HAMBURG OPEN'), side: ['bitpanda', 'Unzer', 'MB Energy', E] },
  rg:  { back: w('BNP PARIBAS'), side: ['ISDIN', 'Renault', 'ALL ACCOR', E, 'ENGIE', 'Infosys'], clock: 'ROLEX', drink: 'Perrier', drinkCol: '#0a7a3c' },
  hal: { back: w('bwin'), side: ['terra', 'WORTMANN AG', 'bwin', { t: 'HYLO', fg: '#2c8a3e', bg: '#e4e6e8' }, 'bitpanda', 'VELTINS', 'ROBINSON'], wall: '#1b473b' },
  que: { back: w('HSBC CHAMPIONSHIPS'), side: ['HSBC', 'LEXUS', 'Infosys', 'Schweppes', 'Haier', 'LTA'], wall: '#b0141d' },
  wim: { clock: 'ROLEX', drink: 'evian', drinkCol: '#e4007c' },
  was: { back: w('MUBADALA DC OPEN'), side: ['MUBADALA', 'Har-Tru', 'MUBADALA', 'DC OPEN'] },
  can: { back: w('NATIONAL BANK OPEN'), side: ['National Bank', 'Rogers', 'Mercedes-Benz', 'Sobeys', 'IRIS', 'Stella Artois', 'Canadian Tire', 'Wilson'] },
  cin: { back: w('CINCINNATI OPEN'), side: ['Credit One Bank', 'Secret', 'Fifth Third Bank', 'DOBEL', E, 'Cadillac', 'Western & Southern'], wall: '#26348f', clock: 'ROLEX' },
  us:  { back: w('US OPEN'), side: ['CHASE', 'J.P. Morgan', E, 'AMERICAN EXPRESS', 'IBM', RX, 'Cadillac'], clock: 'ROLEX' },
  tok: { back: w('KINOSHITA GROUP JAPAN OPEN'), side: ['EQT', E, 'LAND ROVER', 'Lavazza', 'YONEX', 'asics', 'FILA', 'AMERICAN EXPRESS'] },
  bei: { back: w('CHINA OPEN'), side: ['Mercedes-Benz', 'CITIC BANK', 'Lenovo ThinkPad', 'Casarte', 'luckin coffee', 'FILA'], ground: 'BEIJING' },
  sha: { back: RX, side: [{ t: 'Heineken', fg: '#ffffff', bg: '#00843d' }, 'Mercedes-Benz', { t: 'AMERICAN EXPRESS', fg: '#ffffff', bg: '#006fcf' }, 'ROYAL CARIBBEAN', 'SHUI JING FANG'], clock: 'ROLEX' },
  bas: { back: w('SWISS INDOORS BASEL'), side: [E, { t: 'SHARP', fg: '#e60012', bg: '#ffffff' }, { t: 'IWB', fg: '#0060a9', bg: '#ffffff' }, 'PEUGEOT', 'J. SAFRA SARASIN', 'bitpanda', 'evian'], clock: 'RADO', ground: 'BASEL' },
  vie: { back: w('ERSTE BANK OPEN'), side: ['ERSTE BANK', 'WIENER STÄDTISCHE', 'win2day', 'BMW', 'RADO', 'Red Bull'], clock: 'RADO' },
  par: { back: RX, side: ['VEOLIA', 'Haier', 'LEXUS', 'LACOSTE', 'evian', E], clock: 'ROLEX', ribbon: '#ROLEXPARISMASTERS' },
  fin: { back: w('NITTO ATP FINALS'), side: ['Nitto', 'Intesa Sanpaolo', E, 'Lavazza', 'LEXUS', 'EA7', 'Haier', 'Red Bull'], wall: '#0f1526' },
};
export function venueSpec(key, weather, surface) {
  const v = VENUES[key] || VENUES.default;
  const out = { ...BASE, ...v, weather: weather || 'clear', key };
  out.light = { ...(BASE.light || {}), ...(v.light || {}) };
  if (surface) out.surface = surface;
  out.sunAt = PLACE[key] ? hours => sunElevation(key, hours) : null;
  const grassy = out.surface === 'grass';
  out.inner = paint(out.court, 0.80, grassy ? 0.96 : 1.08); out.outer = paint(out.surround, 0.80, grassy ? 0.96 : 1.08);
  out.own = !!v.court;
  out.city = out.city || 'RALLY';
  if (!out.backText) out.backText = [out.city];
  // (its own partners, wordmark, wall colour, clock and drink: BRANDS above)
  const B = BRANDS[key];
  if (B) {
    if (B.side) out.boards = B.side.map(b => typeof b === 'string' ? b : { ...b });
    if (B.back) { out.backText = [{ ...B.back }]; delete out.backTextSize; }
    if (B.wall) out.wall = B.wall;
    if (B.ribbon) out.ribbonText = B.ribbon;
    if (B.ground) out.groundText = B.ground;
    if (B.clock) out.clockBrand = B.clock;
    if (B.drink) { out.drink = B.drink; out.drinkCol = B.drinkCol; }
  }
  return out;
}
