// Rally Pro — what each of the twelve wears and how his hair sits, from photographs of him in
// the year named (sources and what could not be confirmed are in the project notes). Each has
// one outfit for ordinary events and one for each major he is pictured at; Wimbledon is his own
// all-white kit. Makers' logos are left off; a plain patch stands where one is a large part of
// the look.
//
// His body itself is built by tools/body_shapes.py (MakeHuman's body set to his height, listed weight,
// muscle and build; shipped as assets/people/m04_shapes.bin, see js/bodydata.js). `body` here is only the
// fallback when that file is missing: his build against the model's (1 = the model), girth of each upper
// arm and forearm, thighs and calves, the chest's width and depth, and how far each shoulder sits out (m).
// `face` reshapes the model's one face toward the man's own (see Person.fitFace): each measure
// runs about -1..1 from the model's face, judged from photographs — these are likenesses of
// bone structure (jaw, nose, brow, cheeks), not portraits.
//
// A shirt is a base colour and up to six drawn layers, laid out on the body (see kitLayer in
// people.js). Heights are fractions from hip (0) to the base of the neck (1): waistband 0.14,
// navel 0.27, mid-chest 0.57, armpit 0.70, shoulder 0.85. Sleeve positions are fractions of the
// arm from shoulder (0) to wrist (1); a short sleeve ends near 0.40. The wearer's left is +x.
//   ['collar', colour, from]                    ['placket', colour, halfWidth, from, x]
//   ['pin', colour, spacing, width, from, frontOnly, x0, x1]
//   ['hbands', colour, period, share, offset, from, to, frontOnly, sleevesToo]
//   ['band', colour, from, to, wave, sleeveFrom, sleeveTo, waveFreq]
//   ['yoke', colour, from, dropPerMetre, side, sleevesToo]   ['sides', colour, fromX, to, side, from]
//   ['sleeve', colour, from, to]                ['fade', colour, from, to, strength]
//   ['diag', colour, period, share, angle, from, to, frontOnly, fadeUp]
//   ['grid', colour, spacing, width]            ['patch', colour, x, height, halfWidth, halfHeight]
//   ['shoulder', colour, z, width, spacing, stripesEachSide, sleeveTo]
//   ['argyle', colour, cellWidth, height, halfHeight, phase]
import { FACES } from './facedata.js';
import { BODY_MEASURED } from './bodydata.js';
const W = '#f4f3ee';
const whites = (o = {}) => ({ shirt: W, shorts: { c: W, len: 'short', ...(o.shorts || {}) }, socks: { c: W }, shoes: { c: '#f2f2ee', c2: '#f2f2ee' }, ...o });

export const LOOKBOOK = {
  Alcaraz: {
    year: 2025, skin: '#c98a55', beard: 0.35,
    body: { arms: 1.10, legs: 1.10, calf: 1.08, chest: 1.04, depth: 1.04, shoulders: 0.012 },
    face: { faceW: 0.6, faceL: -0.2, jawW: 0.8, chinL: 0.3, chinP: 0.4, noseL: 0.2, noseW: 0.7, noseP: 0.4, cheek: 0.3, brow: 0.7, deep: 0.3, lips: 0.4 },
    hair: { top: 4, sides: 0.4, back: 0.5, tex: 'straight', fringe: 0.25, recede: 0, ears: false, c: '#2b201c' },
    rk: { frame: '#1c1c1e', frame2: '#e2f866', grip: '#f5f5f5', string: '#2a2a2c', head: 1.0 },
    kits: {
      default: { year: 2026, shirt: '#4a2a1c', sleeveless: true, layers: [['fade', '#cfc9b8', 0.36, -0.12, 1], ['collar', '#eef2f3', 0.94]],
        shorts: { c: '#5a3620', len: 'short', hem: '#e6e0cf' }, socks: { c: '#e6e6d6' }, shoes: { c: '#eaedda', c2: '#43402b' }, wb: { R: ['#e6e0cf', 8] } },
      ao: { year: 2025, shirt: '#4a8083', sleeveless: true, layers: [['sides', '#b5c8c9', 0.085, 0.12, -1, -0.3]],
        shorts: { c: '#427679', len: 'mid' }, socks: { c: '#f2f2f2' }, shoes: { c: '#f2f2f2', c2: '#4a8083' }, wb: { R: ['#f2f2f2', 8] } },
      rg: { year: 2025, shirt: '#f0e9dc', layers: [['hbands', '#111113', 0.19, 0.58, -0.10, -0.14, 0.76, 1, 0]],
        shorts: { c: '#1b1c1e', len: 'mid' }, socks: { c: '#f2f2f2' }, shoes: { c: '#373d3d', c2: '#10b5d0' }, wb: { R: ['#0aaed3', 8] } },
      wim: { year: 2025, shirt: '#f4f4f1', layers: [['patch', '#1a1a1a', 0.075, 0.80, 0.015, 0.024]],
        shorts: { c: '#f4f4f1', len: 'mid' }, socks: { c: '#f4f4f1' }, shoes: { c: '#f2f0ec', c2: '#dfd9d2' }, wb: { R: ['#f4f4f1', 8] } },
      us: { year: 2025, shirt: '#de68a6', sleeveless: true, layers: [['pin', '#d45c9b', 0.012, 0.004, -1]],
        shorts: { c: '#6b1f33', len: 'mid' }, socks: { c: '#f2f2f2' }, shoes: { c: '#e879ad', c2: '#f2f2f2' }, wb: { R: ['#6e2d58', 8] } },
    },
  },
  Sinner: {
    year: 2025, skin: '#ecc6a0', beard: 0,
    body: { arms: 0.93, legs: 0.95, calf: 0.95, chest: 0.97, depth: 0.95, shoulders: 0.004 },
    face: { faceW: -0.7, faceL: 0.6, jawW: -0.6, chinL: 0.1, chinP: -0.2, noseL: 0.6, noseW: -0.5, noseP: 0.3, cheek: 0.2, hollow: 0.3, brow: -0.2, ears: 0.6, lips: -0.3, freckle: 0.8 },
    hair: { top: 10, sides: 4.5, back: 6, tex: 'curly', fringe: 0.6, recede: 0, ears: false, c: '#b0592c', c2: '#8e4421' },
    rk: { frame: '#1a1a1c', frame2: '#f0f0ec', grip: '#f5f5f5', string: '#c9ccd0', head: 1.0 },
    kits: {
      default: { year: 2025, shirt: '#ad421f', layers: [['hbands', '#9c3b1c', 0.22, 0.5, 0, -0.2, 0.92, 0, 1], ['placket', '#7f3016', 0.012, 0.76], ['collar', '#a03d1c', 0.93]],
        shorts: { c: '#a03a1a', len: 'mid' }, socks: { c: '#f2f2f2' }, shoes: { c: '#f2f2f2', c2: '#ad421f' }, head: { type: 'cap', c: '#f3f5ee' } },
      ao: { year: 2026, shirt: '#d9a520', layers: [['collar', '#c9981c', 0.93], ['placket', '#b98a16', 0.012, 0.76]],
        shorts: { c: '#5d6b3a', len: 'mid' }, socks: { c: '#f2f2f2' }, shoes: { c: '#f2f2f2', c2: '#5d6b3a' }, wb: { R: ['#d9a520', 7] } },
      rg: { year: 2025, shirt: '#2e9d77', layers: [['collar', '#f4f4ec', 0.93], ['placket', '#f4f4ec', 0.014, 0.74]],
        shorts: { c: '#3a3e9c', len: 'mid' }, socks: { c: '#f2f2f2' }, shoes: { c: '#3b3a8c', c2: '#e8562a' }, wb: { R: ['#5557b3', 7] }, head: { type: 'cap', c: '#3a3e9c' } },
      wim: { year: 2026, shirt: '#f4f4f1', layers: [['patch', '#d6362b', 0.075, 0.80, 0.012, 0.02]],
        shorts: { c: '#f4f4f1', len: 'mid' }, socks: { c: '#f4f4f1' }, shoes: { c: '#f4f4f1', c2: '#1f2a44' } },
    },
  },
  Djokovic: {
    year: 2024, skin: '#d9a878', beard: 0.3,
    body: { arms: 0.96, legs: 0.98, calf: 0.98, chest: 0.98, depth: 0.96, shoulders: 0.004 },
    face: { faceW: -0.5, faceL: 0.5, jawW: -0.3, chinL: 0.5, chinP: 0.5, noseL: 0.7, noseW: -0.4, noseP: 0.6, cheek: 0.7, hollow: 0.5, brow: 0.5, deep: 0.5, ears: 0.4, lips: -0.2 },
    hair: { top: 2.5, sides: 1, back: 1, tex: 'straight', fringe: 0, recede: 0.25, ears: false, c: '#33241f' },
    rk: { frame: '#17171a', frame2: '#f2f2f2', grip: '#f5f5f5', string: '#d8d4c4', head: 0.98 },
    kits: {
      default: { year: 2025, shirt: '#5c954f', layers: [['fade', '#275c26', 0.62, 0.44, 1], ['fade', '#4f8747', 0.40, -0.1, 1], ['collar', '#55894a', 0.93]],
        shorts: { c: '#38472f', len: 'mid' }, socks: { c: '#f2f2f2' }, shoes: { c: '#f2f2f2', c2: '#2a2f2a' }, wb: { R: ['#f2f2f2', 9], L: ['#57a24c', 7] } },
      ao: { year: 2023, shirt: '#1f4fa3', layers: [['pin', '#4a78c8', 0.03, 0.007, -1], ['collar', '#1b4690', 0.93]],
        shorts: { c: '#1f4fa3', len: 'mid' }, socks: { c: '#f2f2f2' }, shoes: { c: '#1f4fa3', c2: '#f08a24' }, wb: { R: ['#f2f2f2', 9], L: ['#1f4fa3', 7] } },
      rg: { year: 2023, shirt: '#f26965', layers: [['yoke', '#de4a46', 0.86, 0.2, 0, 1], ['collar', '#e85f5b', 0.93]],
        shorts: { c: '#1e1c33', len: 'mid' }, socks: { c: '#f2f2f2' }, shoes: { c: '#c33535', c2: '#f2f2f2' }, wb: { R: ['#f5f5f8', 9], L: ['#ec2f25', 7] } },
      wim: { year: 2023, shirt: '#f4f4f1', shorts: { c: '#f4f4f1', len: 'mid' }, socks: { c: '#f4f4f1' }, shoes: { c: '#f4f4f1', c2: '#f4f4f1' }, wb: { R: ['#f4f4f1', 9], L: ['#f4f4f1', 7] } },
      us: { year: 2023, shirt: '#1e57b3', layers: [['collar', '#1a4c9c', 0.93]],
        shorts: { c: '#1e57b3', len: 'mid', side: '#4f86d6' }, socks: { c: '#f2f2f2' }, shoes: { c: '#214a98', c2: '#cfe04a' }, wb: { R: ['#f2f2f2', 9], L: ['#f2f2f2', 9] } },
    },
  },
  Nadal: {
    year: 2008, skin: '#c79862', beard: 0.12,
    body: { armL: 1.24, foreL: 1.18, armR: 1.10, foreR: 1.06, legs: 1.10, calf: 1.10, chest: 1.07, depth: 1.06, shoulders: 0.014 },
    face: { faceW: 0.4, faceL: 0.1, jawW: 0.9, chinL: 0.4, chinP: 0.5, noseL: 0.4, noseW: 0.6, noseP: 0.5, cheek: 0.2, brow: 0.9, deep: 0.6, lips: 0.5 },
    hair: { top: 16, sides: 18, back: 23, tex: 'wavy', fringe: 0, recede: 0, ears: false, c: '#3a2a22' },
    rk: { frame: '#f2d21c', frame2: '#161616', grip: '#f3f3f1', string: '#f0f0f0', head: 1.0 },
    kits: {
      default: { year: 2008, shirt: '#f3f3f1', sleeveless: true, layers: [['yoke', '#0562bf', 0.87, 0.3, 0, 0], ['band', '#393561', 0.79, 0.85], ['sides', '#0562bf', 0.15, 0.72, 1, -0.3]],
        shorts: { c: '#131c33', len: 'capri', side: '#1a6fd0' }, socks: { c: '#f3f3f1' }, shoes: { c: '#ebeaef', c2: '#303a59' }, wb: { L: ['#0876cd', 8], R: ['#0876cd', 8] }, head: { type: 'bandana', c: '#1a2340', w: 6 } },
      ao: { year: 2008, shirt: '#b83410', sleeveless: true, layers: [['yoke', '#7a6a5e', 0.85, 0.2, 0, 0], ['band', '#b8aca6', 0.63, 0.75]],
        shorts: { c: '#786c5e', len: 'capri', hem: '#b83410' }, socks: { c: '#f3f3f1' }, shoes: { c: '#f0f0f0', c2: '#1c1c1c' }, wb: { L: ['#bb3006', 8], R: ['#605148', 10] }, head: { type: 'bandana', c: '#aa1003', w: 6 } },
      rg: { year: 2008, shirt: '#4fbf6c', sleeveless: true, layers: [['sides', '#73c98f', 0.13, 0.76, 0, -0.3], ['yoke', '#3fa55b', 0.87, 0.3, 1, 0]],
        shorts: { c: '#6b6054', len: 'capri' }, socks: { c: '#e6e6ea' }, shoes: { c: '#e2e2ea', c2: '#5cc878' }, wb: { R: ['#4fb062', 9], L: ['#5b6053', 8] }, head: { type: 'bandana', c: '#6fb680', w: 6 } },
      wim: { year: 2008, shirt: '#f3f3f1', sleeveless: true,
        shorts: { c: '#f3f3f1', len: 'capri' }, socks: { c: '#f3f3f1' }, shoes: { c: '#f0f0ee', c2: '#222222' }, wb: { L: ['#f3f3f1', 9], R: ['#f3f3f1', 9] }, head: { type: 'bandana', c: '#f3f3f1', w: 6 } },
      us: { year: 2008, shirt: '#0a1a80', sleeveless: true, layers: [['patch', '#e8e8f0', -0.07, 0.17, 0.07, 0.035], ['patch', '#e8e8f0', 0.10, 0.50, 0.035, 0.022]],
        shorts: { c: '#eeeef0', len: 'capri' }, socks: { c: '#f3f3f1' }, shoes: { c: '#f0eaea', c2: '#1c1c1c' }, wb: { L: ['#15192f', 9], R: ['#15192f', 9] }, head: { type: 'bandana', c: '#f3f3f1', w: 6 } },
    },
  },
  Federer: {
    year: 2009, skin: '#e8bd8f', beard: 0,
    body: { armR: 1.06, foreR: 1.10, armL: 0.99, foreL: 0.98, legs: 1.04, calf: 1.03, chest: 1.02, depth: 1.02, shoulders: 0.006 },
    face: { faceW: 0.1, faceL: 0.3, jawW: 0.4, chinL: 0.3, chinP: 0.3, noseL: 0.8, noseW: 0.3, noseP: 0.9, cheek: 0.1, brow: 0.8, deep: 0.5, lips: 0.1 },
    hair: { top: 11, sides: 7, back: 9, tex: 'wavy', fringe: 0.6, recede: 0.1, ears: true, c: '#35231c' },
    rk: { frame: '#161616', frame2: '#c8202c', grip: '#f3f3f1', string: '#f0efe8', head: 0.92 },
    kits: {
      default: { year: 2008, shirt: '#f3f3f1', layers: [['placket', '#0e1116', 0.014, 0.70]],
        shorts: { c: '#12141c', len: 'mid' }, socks: { c: '#f3f3f1' }, shoes: { c: '#f3f3f1', c2: '#c9cbe3' }, wb: { R: ['#14164a', 9] }, head: { type: 'headband', c: '#3a2a8c', w: 5 } },
      ao: { year: 2009, shirt: '#1a1a8c', layers: [['placket', '#f3f3f1', 0.012, 0.76], ['sleeve', '#f3f3f1', 0.392, 0.405], ['collar', '#18187c', 0.93]],
        shorts: { c: '#f3f3f1', len: 'mid', side: '#1a1a4a' }, socks: { c: '#f3f3f1' }, shoes: { c: '#f0f0f0', c2: '#1a1a8c' }, wb: { R: ['#14144a', 8] }, head: { type: 'headband', c: '#14143c', w: 5 } },
      rg: { year: 2009, shirt: '#4f96cb', layers: [['collar', '#1b2e47', 0.93], ['placket', '#1b2e47', 0.014, 0.70]],
        shorts: { c: '#141a2c', len: 'mid' }, socks: { c: '#f3f3f1' }, shoes: { c: '#f0f0f4', c2: '#7d8fb0' }, wb: { R: ['#2b2a45', 8] }, head: { type: 'headband', c: '#1f1f35', w: 5 } },
      wim: { year: 2009, shirt: '#f3f3f1', layers: [['pin', '#e4e2da', 0.008, 0.0016, -1], ['placket', '#b49a79', 0.006, 0.74]],
        shorts: { c: '#f3f3f1', len: 'mid', side: '#b89b5e' }, socks: { c: '#f3f3f1' }, shoes: { c: '#f3f3f1', c2: '#b89b5e' }, wb: { R: ['#f3f3f1', 8] }, head: { type: 'headband', c: '#f3f3f1', w: 5 } },
      us: { year: 2009, shirt: '#1a1a1a', layers: [['collar', '#e0353b', 0.93], ['placket', '#e0353b', 0.014, 0.70]],
        shorts: { c: '#1a1a1a', len: 'mid' }, socks: { c: '#1a1a1a' }, shoes: { c: '#1a1a1a', c2: '#e0353b' }, wb: { R: ['#e8404a', 8] }, head: { type: 'headband', c: '#1a1a1a', w: 5 } },
    },
  },
  Sampras: {
    year: 1995, skin: '#d6a779', beard: 0.2,
    body: { armR: 1.03, foreR: 1.06, armL: 0.98, foreL: 0.97, legs: 1.02, calf: 1.0, chest: 1.0, depth: 1.0, shoulders: 0.004 },
    face: { faceW: -0.1, faceL: 0.6, jawW: 0.2, chinL: 0.6, chinP: 0.4, noseL: 0.8, noseW: 0.4, noseP: 0.7, brow: 0.9, deep: 0.6, lips: 0.3 },
    hair: { top: 4, sides: 2, back: 2.5, tex: 'curly', fringe: 0, recede: 0.15, ears: false, c: '#1e1917' },
    rk: { frame: '#141414', frame2: '#c8202c', grip: '#1a1a1a', string: '#eaeaea', head: 0.86 },
    kits: {
      default: { year: 1996, shirt: '#f3f3f1', loose: 1, layers: [['collar', '#6e717b', 0.93], ['sleeve', '#6e717b', 0.36, 0.41], ['patch', '#8a3a3a', 0.075, 0.78, 0.015, 0.024]],
        shorts: { c: '#1d3a30', len: 'mid' }, socks: { c: '#f3f3f1' }, shoes: { c: '#f3f3f1', c2: '#1c1c1c' } },
      ao: { year: 1995, shirt: '#f3f3f1', loose: 1, layers: [['collar', '#344155', 0.94], ['sleeve', '#344155', 0.385, 0.40]],
        shorts: { c: '#495673', len: 'mid' }, socks: { c: '#f3f3f1' }, shoes: { c: '#f3f3f1', c2: '#1c2740' } },
      rg: { year: 1995, shirt: '#f3f3f1', loose: 1, layers: [['collar', '#3f6a55', 0.945], ['sleeve', '#3f6a55', 0.385, 0.40], ['patch', '#8a3a3a', 0.075, 0.78, 0.015, 0.024]],
        shorts: { c: '#476357', len: 'mid' }, socks: { c: '#f3f3f1' }, shoes: { c: '#f3f3f1', c2: '#1c2740' }, wb: { R: ['#f3f3f1', 7] } },
      wim: { year: 1995, shirt: '#f3f3f1', loose: 1, layers: [['grid', '#2a3350', 0.055, 0.0026], ['patch', '#8a3a3a', 0.075, 0.78, 0.015, 0.024]],
        shorts: { c: '#f3f3f1', len: 'mid' }, socks: { c: '#f3f3f1' }, shoes: { c: '#f3f3f1', c2: '#f3f3f1' } },
      us: { year: 1995, shirt: '#f3f3f1', loose: 1, layers: [['pin', '#e0e0dc', 0.01, 0.0022, -1], ['collar', '#8a2f2f', 0.955], ['patch', '#8a3a3a', 0.075, 0.78, 0.015, 0.024]],
        shorts: { c: '#56669b', len: 'mid' }, socks: { c: '#f3f3f1' }, shoes: { c: '#f3f3f1', c2: '#1c2740' } },
    },
  },
  Agassi: {
    year: 1990, skin: '#d9a06a', beard: 0.35,
    body: { arms: 1.04, legs: 1.06, calf: 1.04, chest: 1.03, depth: 1.04, shoulders: 0.004 },
    face: { faceW: 0.4, faceL: -0.3, jawW: 0.3, chinL: -0.1, chinP: 0.1, noseL: -0.3, noseW: 0.1, noseP: -0.2, cheek: 0.4, brow: 0.6, deep: 0.2, lips: 0.2 },
    hair: { top: 10, sides: 9, back: 28, tex: 'straight', fringe: 0.8, recede: 0, ears: true, c: '#b09a6c', c2: '#4a3a2a' },
    rk: { frame: '#d9bf43', frame2: '#1b1b22', grip: '#1a1a1a', string: '#ffffff', head: 1.06 },
    kits: {
      default: { year: 1990, shirt: '#f2efe8', layers: [['diag', '#d5425a', 0.09, 0.42, 0.6, 0.04, 0.50, 1, 0], ['sides', '#1a1c16', 0.11, 0.76, 1, -0.3]],
        shorts: { c: '#1a1c16', len: 'short', hem: '#d5425a' }, socks: { c: '#f0ece8' }, shoes: { c: '#eeeae6', c2: '#d5425a' }, head: { type: 'headband', c: '#d9475a', w: 6 } },
      ao: { year: 1995, shirt: '#f7f4f7', loose: 1, layers: [['hbands', '#893448', 0.055, 0.14, 0, -0.2, 0.92, 0, 1], ['collar', '#893448', 0.93], ['sleeve', '#893448', 0.36, 0.41]],
        shorts: { c: '#4f4352', len: 'mid' }, socks: { c: '#f5f5f5' }, shoes: { c: '#f5f5f5', c2: '#1a1a1a' }, head: { type: 'bandana', c: '#6e3340', w: 7 } },
      rg: { year: 1990, shirt: '#f3f1f4', layers: [['diag', '#d5425a', 0.055, 0.5, 0.6, 0.46, 0.74, 1, 1], ['band', '#16101a', 0.38, 0.455]],
        shorts: { c: '#1c1b1f', len: 'short', hem: '#d5425a' }, socks: { c: '#f0ece8' }, shoes: { c: '#eeeae6', c2: '#d5425a' }, head: { type: 'headband', c: '#d9475a', w: 6 } },
      wim: { year: 1992, shirt: '#f4f4f2', layers: [['patch', '#12202d', 0.075, 0.78, 0.012, 0.02]],
        shorts: { c: '#f2f2f0', len: 'short' }, socks: { c: '#f2f2f0' }, shoes: { c: '#f2f2ee', c2: '#e0deda' }, head: { type: 'cap', c: '#f2f2f0' } },
      us: { year: 1990, shirt: '#f5f6f0', layers: [['yoke', '#c8dc6a', 0.84, 0.9, 0, 1], ['collar', '#1a8fa8', 0.93], ['placket', '#c8dc6a', 0.008, 0.74]],
        shorts: { c: '#2b2f36', len: 'short', hem: '#c8dc6a' }, socks: { c: '#f2f2f0' }, shoes: { c: '#f2f2ee', c2: '#c8dc6a' }, head: { type: 'headband', c: '#1a1a1e', w: 6 } },
    },
  },
  Lendl: {
    year: 1986, skin: '#e0bd96', beard: 0,
    body: { armR: 1.0, foreR: 1.04, armL: 0.96, foreL: 0.96, legs: 1.0, calf: 1.0, chest: 1.0, depth: 0.98, shoulders: 0.006 },
    face: { faceW: -0.4, faceL: 0.7, jawW: -0.1, chinL: 0.6, chinP: 0.3, noseL: 0.5, noseW: -0.2, noseP: 0.4, cheek: 0.9, hollow: 1.0, brow: 0.6, deep: 0.9, lips: -0.6 },
    hair: { top: 5, sides: 2, back: 3, tex: 'straight', fringe: 0, recede: 0.3, ears: false, c: '#3d2c22', up: 1 },
    rk: { frame: '#b8bece', frame2: '#84909f', grip: '#141414', string: '#e8e8e8', head: 0.80 },
    kits: {
      default: { year: 1985, shirt: '#f3f5f8', tucked: true, layers: [['diag', '#1d2f55', 3.0, 0.012, -0.72, 0.30, 0.92, 1, 0], ['argyle', '#2d4ca6', 0.085, 0.50, 0.075, 0], ['diag', '#9bbbdf', 0.034, 0.5, 1.25, 0.66, 0.74, 1, 0]],
        shorts: { c: '#f3f5f8', len: 'short' }, socks: { c: '#f3f5f8' }, shoes: { c: '#f2f2ee', c2: '#27305a' }, wb: { L: ['#f3f5f8', 9], R: ['#f3f5f8', 9] } },
      ao: { year: 1987, shirt: '#f4f5f7', tucked: true, layers: [['band', '#cf2a14', 0.690, 0.708, 0, 0.20, 0.225], ['band', '#0a2f96', 0.655, 0.678, 0, 0.245, 0.275]],
        shorts: { c: '#f4f5f7', len: 'short' }, socks: { c: '#f4f5f7' }, shoes: { c: '#f2f2ee', c2: '#27305a' }, wb: { L: ['#f4f5f7', 10], R: ['#f4f5f7', 10] } },
      rg: { year: 1984, shirt: '#f1f1f6', tucked: true, layers: [['argyle', '#0b3a57', 0.07, 0.62, 0.085, 0], ['argyle', '#3e92bc', 0.07, 0.62, 0.085, 1]],
        shorts: { c: '#f1f1f6', len: 'short' }, socks: { c: '#f1f1f6' }, shoes: { c: '#f2f2ee', c2: '#27305a' }, wb: { L: ['#f1f1f6', 8], R: ['#f1f1f6', 8] } },
      wim: { year: 1987, shirt: '#f2f2ee', tucked: true, layers: [['band', '#c82e12', 0.705, 0.745, 0.012, 0.17, 0.215, 42], ['band', '#b3a78f', 0.675, 0.705, 0.012, 0.215, 0.245, 42], ['band', '#28517b', 0.635, 0.675, 0.012, 0.245, 0.29, 42], ['band', '#2c2c2f', 0.600, 0.608, 0.012, 0, 0, 42]],
        shorts: { c: '#f2f2ee', len: 'short' }, socks: { c: '#f2f2ee' }, shoes: { c: '#f2f2ee', c2: '#5b5b61' }, wb: { L: ['#f2f2ee', 10], R: ['#f2f2ee', 10] } },
      us: { year: 1986, shirt: '#f0f3f4', tucked: true, layers: [['band', '#c82e12', 0.705, 0.745, 0.012, 0.17, 0.215, 42], ['band', '#b3a78f', 0.675, 0.705, 0.012, 0.215, 0.245, 42], ['band', '#28517b', 0.635, 0.675, 0.012, 0.245, 0.29, 42], ['band', '#2c2c2f', 0.600, 0.608, 0.012, 0, 0, 42]],
        shorts: { c: '#f0f3f4', len: 'short' }, socks: { c: '#f0f3f4' }, shoes: { c: '#f2f2ee', c2: '#27305a' }, wb: { L: ['#f0f3f4', 9], R: ['#f0f3f4', 9] } },
    },
  },
  Borg: {
    year: 1980, skin: '#e8c79c', beard: 0.1,
    body: { arms: 0.97, legs: 1.04, calf: 1.04, chest: 0.98, depth: 0.97, shoulders: 0 },
    face: { faceW: -0.6, faceL: 0.5, jawW: -0.2, chinL: 0.4, chinP: 0.4, noseL: 0.7, noseW: -0.6, noseP: 0.5, cheek: 0.6, hollow: 0.6, brow: 0.5, deep: 0.8, lips: -0.5 },
    hair: { top: 14, sides: 20, back: 26, tex: 'straight', fringe: 0, recede: 0, ears: true, c: '#a08460' },
    rk: { frame: '#1c1917', frame2: '#d2603a', grip: '#3a2a18', string: '#e6dcc4', head: 0.72 },
    kits: {
      default: { year: 1979, shirt: '#f3f0e8', tucked: true, layers: [['pin', '#181f2d', 0.0225, 0.002, -1], ['collar', '#151b2b', 0.93], ['placket', '#151b2b', 0.013, 0.72]],
        shorts: { c: '#f3f0e8', len: 'short', pin: 0.0225, pinC: '#181f2d' }, socks: { c: '#f2f2f0', top: 'ankle' }, shoes: { c: '#f0f0ec', c2: '#23252b' }, wb: { L: ['#23233a', 7], R: ['#23233a', 7] }, head: { type: 'headband', c: '#f0e6e0', c2: '#b8303a', w: 5 } },
      ao: { year: 1974, shirt: '#f6f6ee', tucked: true, layers: [['collar', '#d4647a', 0.93], ['placket', '#d4647a', 0.013, 0.72], ['sleeve', '#d4647a', 0.355, 0.41]],
        shorts: { c: '#f6f6ee', len: 'short' }, socks: { c: '#f6f6ee' }, shoes: { c: '#f4f4f0', c2: '#f4f4f0' }, wb: { L: ['#c95c6a', 6], R: ['#c95c6a', 6] } },
      rg: { year: 1980, shirt: '#f4f4f2', tucked: true, layers: [['placket', '#1e1a2c', 0.016, 0.66], ['sleeve', '#1e1a2c', 0.376, 0.386]],
        shorts: { c: '#f2f2f0', len: 'short' }, socks: { c: '#f2f2f0', top: 'ankle' }, shoes: { c: '#f0f0ec', c2: '#23252b' }, wb: { L: ['#23233a', 7], R: ['#23233a', 7] }, head: { type: 'headband', c: '#f0e6e0', c2: '#b8303a', w: 5 } },
      wim: { year: 1980, beard: 0.6, shirt: '#f1eef2', tucked: true, layers: [['pin', '#3d4a45', 0.02, 0.0018, -1], ['collar', '#2a272b', 0.93], ['placket', '#2f5a44', 0.012, 0.72]],
        shorts: { c: '#efeff3', len: 'short' }, socks: { c: '#f0f2f2', top: 'ankle' }, shoes: { c: '#f0f0ec', c2: '#23252b' }, wb: { L: ['#23233a', 7], R: ['#23233a', 7] }, head: { type: 'headband', c: '#f0e6e0', c2: '#b8303a', w: 5 } },
      us: { year: 1980, shirt: '#f2f3ef', tucked: true, layers: [['placket', '#23233a', 0.016, 0.66], ['sleeve', '#23233a', 0.376, 0.386]],
        shorts: { c: '#f0f0ec', len: 'short' }, socks: { c: '#f2f2f0', top: 'ankle' }, shoes: { c: '#f0f0ec', c2: '#23252b' }, wb: { L: ['#23233a', 7], R: ['#23233a', 7] }, head: { type: 'headband', c: '#1d1a26', w: 5 } },
    },
  },
  McEnroe: {
    year: 1981, skin: '#e8c4a0', beard: 0,
    body: { armL: 0.96, foreL: 1.0, armR: 0.92, foreR: 0.93, legs: 0.97, calf: 0.97, chest: 0.96, depth: 0.96, shoulders: -0.006 },
    face: { faceW: 0.3, faceL: -0.4, jawW: 0.0, chinL: -0.3, chinP: -0.2, noseL: -0.5, noseW: 0.0, noseP: -0.3, cheek: 0.1, brow: -0.2, lips: -0.4, freckle: 0.5 },
    hair: { top: 9, sides: 8, back: 10, tex: 'curly', fringe: 0.6, recede: 0, ears: true, c: '#66493b' },
    rk: { frame: '#c9a873', frame2: '#a03028', grip: '#2a1e12', string: '#e6dcc4', head: 0.70 },
    kits: {
      default: { year: 1979, shirt: W, tucked: true, layers: [['sleeve', '#2f5a8a', 0.22, 0.34], ['shoulder', '#2f5a8a', -0.005, 0.015, 0.027, 0.5, 0.22]],
        shorts: { c: W, len: 'short', side: '#2f5a8a', hem: '#2f5a8a' }, socks: { c: W }, shoes: { c: '#f2f2ee', c2: '#2d6f9a' }, head: { type: 'headband', c: '#cf2a1e', w: 4.5 } },
      ao: { year: 1983, shirt: W, tucked: true, shorts: { c: '#668abc', len: 'short' }, socks: { c: W }, shoes: { c: '#f2f2ee', c2: '#1e2230' } },
      rg: { year: 1984, shirt: W, tucked: true, layers: [['yoke', '#1b2540', 0.91, 0.42, 0, 0]],
        shorts: { c: W, len: 'short', hem: '#1b2540' }, socks: { c: W }, shoes: { c: '#f2f2ee', c2: '#1e2230' } },
      wim: { year: 1981, shirt: W, tucked: true, layers: [['band', '#34508a', 0.66, 0.77, 0, 0.14, 0.30], ['band', '#34508a', 0.62, 0.636, 0, 0.33, 0.346]],
        shorts: { c: W, len: 'short' }, socks: { c: W }, shoes: { c: '#f2f2ee', c2: '#6a86c4' }, head: { type: 'headband', c: '#cf2a1e', w: 4.5 } },
      us: { year: 1981, shirt: W, layers: [['placket', '#b0362c', 0.02, 0.84], ['band', '#232b45', 0.69, 0.706]],
        shorts: { c: W, len: 'short', side: '#141d33' }, socks: { c: W }, shoes: { c: '#f2f2ee', c2: '#3d5a9c' } },
    },
  },
  Connors: {
    year: 1978, skin: '#e0b48a', beard: 0,
    body: { armL: 1.0, foreL: 1.04, armR: 0.95, foreR: 0.95, legs: 1.0, calf: 1.0, chest: 0.99, depth: 1.0, shoulders: -0.002 },
    face: { faceW: 0.7, faceL: -0.5, jawW: 0.5, chinL: -0.2, chinP: 0.0, noseL: -0.4, noseW: 0.6, noseP: -0.1, cheek: 0.5, brow: 0.1, lips: 0.2 },
    hair: { top: 14, sides: 11, back: 12, tex: 'straight', fringe: 1, recede: 0, ears: true, c: '#5c3e28', helmet: 1 },
    rk: { frame: '#c9c9cc', frame2: '#2a2a2e', grip: '#1a1a1a', string: '#dedede', head: 0.68, round: 1 },
    kits: {
      default: { year: 1978, shirt: W, tucked: true, layers: [['collar', '#0f1f4d', 0.93], ['placket', '#0f1f4d', 0.022, 0.80], ['sleeve', '#0f1f4d', 0.36, 0.41], ['shoulder', '#a8382a', -0.005, 0.03, 0.2, 0, 0.2], ['shoulder', '#0f1f4d', -0.005, 0.014, 0.2, 0, 0.2]],
        shorts: { c: W, len: 'short' }, socks: { c: W, top: 'high', ring: '#a8382a' }, shoes: { c: W, c2: '#2a2a30' }, wb: { L: [W, 8] } },
      ao: { year: 1974, ...whites(), tucked: true, wb: { L: [W, 8] } },
      rg: { year: 1981, shirt: W, tucked: true, layers: [['pin', '#b33a3a', 0.02, 0.003, -1, 1, 0.05, 0.095]],
        shorts: { c: W, len: 'short', side: '#b33a3a' }, socks: { c: W }, shoes: { c: W, c2: '#2a2a30' }, wb: { L: [W, 8], R: [W, 8] } },
      wim: { year: 1978, shirt: '#f4f1ee', tucked: true, layers: [['yoke', '#0f1f4d', 0.91, 0.42, 0, 0], ['shoulder', '#a8382a', -0.04, 0.008, 0.2, 0, 0.1]],
        shorts: { c: '#f4f1ee', len: 'short' }, socks: { c: '#f4f1ee' }, shoes: { c: '#f7f3f0', c2: '#f7f3f0' }, wb: { L: ['#f4f1ee', 8], R: ['#f4f1ee', 8] } },
      us: { year: 1982, shirt: W, tucked: true, layers: [['pin', '#6d3038', 0.008, 0.003, -1, 1, 0.055, 0.097], ['sleeve', '#6d3038', 0.392, 0.404]],
        shorts: { c: W, len: 'short', side: '#b0404a' }, socks: { c: W }, shoes: { c: '#f2f2f4', c2: '#3d3a55' }, wb: { L: [W, 8], R: [W, 8] } },
    },
  },
  Laver: {
    year: 1969, skin: '#e6c69a', beard: 0,
    body: { armL: 1.10, foreL: 1.30, armR: 0.92, foreR: 0.94, legs: 1.0, calf: 1.02, chest: 0.97, depth: 0.97, shoulders: -0.008 },
    face: { faceW: -0.3, faceL: 0.3, jawW: -0.2, chinL: 0.3, chinP: 0.4, noseL: 0.4, noseW: -0.2, noseP: 0.6, cheek: 0.5, hollow: 0.6, brow: 0.2, deep: 0.3, ears: 0.7, lips: -0.5, freckle: 1.0 },
    hair: { top: 5, sides: 2, back: 2.5, tex: 'straight', fringe: 0, recede: 0.7, ears: false, c: '#8a543a' },
    rk: { frame: '#c9a873', frame2: '#8d483f', grip: '#2e1f10', string: '#ddd2b4', head: 0.66 },
    kits: {
      default: { year: 1970, shirt: '#f1f1ee', tucked: true, layers: [['sleeve', '#1d1b22', 0.396, 0.403], ['collar', '#e6e6e2', 0.935]],
        shorts: { c: W, len: 'short' }, socks: { c: W }, shoes: { c: '#f1f1e6', c2: '#f1f1e6' }, wb: { L: [W, 8], R: [W, 8] } },
      ao: { year: 1969, ...whites(), tucked: true, wb: { L: [W, 8], R: [W, 8] } },
      rg: { year: 1969, ...whites(), tucked: true },
      wim: { year: 1969, ...whites(), tucked: true, wb: { L: [W, 8], R: [W, 8] } },
      us: { year: 1969, ...whites(), tucked: true, wb: { L: [W, 8], R: [W, 8] } },
    },
  },
  // ---- added 2026-11: colours judged from descriptions of each man's best-known kits (NOTES.md); each kit dated ----
  Murray: {
    year: 2016, skin: '#e9c3a0', beard: 0.35,
    body: { arms: 1.0, legs: 1.0, calf: 1.0, chest: 1.0, depth: 0.99, shoulders: 0.004 },
    face: { faceL: 0.4, jawW: 0.2, chinL: 0.3, noseL: 0.5, brow: 0.4, deep: 0.4 },
    hair: { top: 3.5, sides: 1.2, back: 1.5, tex: 'straight', fringe: 0.2, recede: 0.15, ears: false, c: '#4a3020' },
    rk: { frame: '#e8761e', frame2: '#1c1c1c', grip: '#f2f2f2', string: '#e8e8e8', head: 1.0 },
    kits: {
      default: { year: 2016, shirt: '#1f3d7a', layers: [['collar', '#f2f2f2', 0.93]], shorts: { c: '#f2f2f2', len: 'mid' }, socks: { c: '#f2f2f2' }, shoes: { c: '#f2f2f2', c2: '#1f3d7a' }, wb: { L: ['#f2f2f2', 8], R: ['#f2f2f2', 8] } },
      wim: { year: 2016, shirt: '#f4f4f1', shorts: { c: '#f4f4f1', len: 'mid' }, socks: { c: '#f4f4f1' }, shoes: { c: '#f2f0ec', c2: '#e2ded8' }, wb: { L: ['#f4f4f1', 8], R: ['#f4f4f1', 8] } },
    },
  },
  Wawrinka: {
    year: 2016, skin: '#d9a888', beard: 0.55,
    body: { arms: 1.08, legs: 1.08, calf: 1.06, chest: 1.06, depth: 1.05, shoulders: 0.010 },
    face: { faceW: 0.4, jawW: 0.5, faceL: -0.1, noseW: 0.3, brow: 0.4, cheek: 0.3 },
    hair: { top: 1.6, sides: 0.5, back: 0.6, tex: 'straight', fringe: 0, recede: 0.2, ears: false, c: '#3a2b22' },
    rk: { frame: '#1b1b1b', frame2: '#d0202e', grip: '#f2f2f2', string: '#e8e8e8', head: 1.0 },
    kits: {
      default: { year: 2016, shirt: '#c2185b', layers: [['sides', '#e8628f', 0.085, 0.12, -1, -0.3]], shorts: { c: '#141414', len: 'mid' }, socks: { c: '#f2f2f2' }, shoes: { c: '#f2f2f2', c2: '#c2185b' }, wb: { R: ['#141414', 8] } },
      wim: { year: 2015, shirt: '#f4f4f1', shorts: { c: '#f4f4f1', len: 'mid' }, socks: { c: '#f4f4f1' }, shoes: { c: '#f2f0ec', c2: '#e2ded8' } },
    },
  },
  Zverev: {
    year: 2026, skin: '#e6bf98', beard: 0.3,
    body: { arms: 0.97, legs: 0.98, calf: 0.98, chest: 0.98, depth: 0.96, shoulders: 0.002 },
    face: { faceL: 0.6, faceW: -0.3, jawW: 0.1, chinL: 0.4, noseL: 0.5, brow: 0.2 },
    hair: { top: 12, sides: 16, back: 22, tex: 'wavy', fringe: 0.2, recede: 0, ears: false, c: '#b08a4a', c2: '#8e6c36' },
    rk: { frame: '#1a1a1c', frame2: '#d6262e', grip: '#f2f2f2', string: '#e6e6e6', head: 1.0 },
    kits: {
      default: { year: 2026, shirt: '#1d2a4a', layers: [['collar', '#f2f2f2', 0.93]], shorts: { c: '#f2f2f2', len: 'mid' }, socks: { c: '#f2f2f2' }, shoes: { c: '#f2f2f2', c2: '#1d2a4a' }, head: { type: 'headband', c: '#f2f2f2', w: 4 } },
      us: { year: 2026, shirt: '#f2b7c6', shorts: { c: '#f4f4f1', len: 'mid' }, socks: { c: '#f4f4f1' }, shoes: { c: '#f4f4f1', c2: '#f2b7c6' }, head: { type: 'headband', c: '#f4f4f1', w: 4 } },
      wim: { year: 2026, shirt: '#f4f4f1', shorts: { c: '#f4f4f1', len: 'mid' }, socks: { c: '#f4f4f1' }, shoes: { c: '#f2f0ec', c2: '#e2ded8' }, head: { type: 'headband', c: '#f4f4f1', w: 4 } },
    },
  },
  Thiem: {
    year: 2019, skin: '#e2b597', beard: 0.15,
    body: { arms: 1.05, legs: 1.06, calf: 1.05, chest: 1.04, depth: 1.03, shoulders: 0.008 },
    face: { faceL: 0.2, jawW: 0.3, chinL: 0.1, noseL: 0.3, brow: 0.3 },
    hair: { top: 7, sides: 1.0, back: 1.5, tex: 'straight', fringe: 0, recede: 0, ears: false, c: '#3d2b1f' },
    rk: { frame: '#f2f2f2', frame2: '#1a1a1a', grip: '#1a1a1a', string: '#e8e8e8', head: 1.0 },
    kits: {
      default: { year: 2019, shirt: '#5b9bd5', shorts: { c: '#1f2a44', len: 'mid' }, socks: { c: '#f2f2f2' }, shoes: { c: '#f2f2f2', c2: '#5b9bd5' }, wb: { R: ['#f2f2f2', 7] } },
      wim: { year: 2019, shirt: '#f4f4f1', shorts: { c: '#f4f4f1', len: 'mid' }, socks: { c: '#f4f4f1' }, shoes: { c: '#f2f0ec', c2: '#e2ded8' } },
    },
  },
  Medvedev: {
    year: 2021, skin: '#e6c4a6', beard: 0.15,
    body: { arms: 0.92, legs: 0.94, calf: 0.94, chest: 0.94, depth: 0.93, shoulders: -0.004 },
    face: { faceL: 0.7, faceW: -0.5, jawW: -0.2, chinL: 0.4, noseL: 0.6, noseW: -0.2, brow: 0.2, hollow: 0.4 },
    hair: { top: 3.0, sides: 1.0, back: 1.2, tex: 'straight', fringe: 0.4, recede: 0.1, ears: false, c: '#4a3a2c' },
    rk: { frame: '#f2f2f2', frame2: '#1d4e9e', grip: '#f2f2f2', string: '#e8e8e8', head: 1.0 },
    kits: {
      default: { year: 2021, shirt: '#2a62b0', layers: [['collar', '#f2f2f2', 0.93]], shorts: { c: '#f4f4f1', len: 'mid' }, socks: { c: '#f4f4f1' }, shoes: { c: '#f4f4f1', c2: '#2a62b0' }, wb: { R: ['#f4f4f1', 7] } },
      wim: { year: 2021, shirt: '#f4f4f1', shorts: { c: '#f4f4f1', len: 'mid' }, socks: { c: '#f4f4f1' }, shoes: { c: '#f2f0ec', c2: '#e2ded8' } },
    },
  },
  Tsitsipas: {
    year: 2021, skin: '#d4a27f', beard: 0.45,
    body: { arms: 1.02, legs: 1.02, calf: 1.0, chest: 1.02, depth: 1.0, shoulders: 0.008 },
    face: { faceL: 0.4, jawW: 0.2, noseL: 0.4, brow: 0.3, cheek: 0.2 },
    hair: { top: 14, sides: 18, back: 24, tex: 'wavy', fringe: 0, recede: 0, ears: false, c: '#7a5a3c', c2: '#5e4430' },
    rk: { frame: '#2f4f3a', frame2: '#151515', grip: '#f2f2f2', string: '#e6e6e6', head: 1.0 },
    kits: {
      default: { year: 2021, shirt: '#f5f5f5', shorts: { c: '#f5f5f5', len: 'mid' }, socks: { c: '#f5f5f5' }, shoes: { c: '#f5f5f5', c2: '#1a1a1a' }, head: { type: 'headband', c: '#ffffff', w: 4 } },
      wim: { year: 2023, shirt: '#f4f4f1', shorts: { c: '#f4f4f1', len: 'mid' }, socks: { c: '#f4f4f1' }, shoes: { c: '#f2f0ec', c2: '#e2ded8' }, head: { type: 'headband', c: '#ffffff', w: 4 } },
    },
  },
  'del Potro': {
    year: 2018, skin: '#d6a585', beard: 0.45,
    body: { arms: 1.04, legs: 1.0, calf: 1.0, chest: 1.04, depth: 1.04, shoulders: 0.004 },
    face: { faceL: 0.6, faceW: 0.2, jawW: 0.4, chinL: 0.3, noseL: 0.6, noseW: 0.3, brow: 0.4 },
    hair: { top: 5, sides: 1.5, back: 2.5, tex: 'wavy', fringe: 0, recede: 0.1, ears: false, c: '#2e221b' },
    rk: { frame: '#141414', frame2: '#f2f2f2', grip: '#f2f2f2', string: '#e6e6e6', head: 1.0 },
    kits: {
      default: { year: 2018, shirt: '#f26a21', layers: [['collar', '#1f4e9c', 0.93]], shorts: { c: '#1c2233', len: 'mid' }, socks: { c: '#f2f2f2' }, shoes: { c: '#f2f2f2', c2: '#f26a21' }, wb: { R: ['#f2f2f2', 8] } },
      wim: { year: 2018, shirt: '#f4f4f1', shorts: { c: '#f4f4f1', len: 'mid' }, socks: { c: '#f4f4f1' }, shoes: { c: '#f2f0ec', c2: '#e2ded8' } },
    },
  },
  Roddick: {
    year: 2003, skin: '#e8b896', beard: 0.1,
    body: { arms: 1.02, legs: 1.05, calf: 1.03, chest: 1.03, depth: 1.02, shoulders: 0.010 },
    face: { faceL: 0.3, jawW: 0.4, chinL: 0.3, noseL: 0.2, brow: 0.3 },
    hair: { top: 3, sides: 1.5, back: 2, tex: 'straight', fringe: 0, recede: 0, ears: false, c: '#5a3e2b' },
    rk: { frame: '#1e4fa0', frame2: '#111111', grip: '#f2f2f2', string: '#e8e8e8', head: 1.0 },
    kits: {
      default: { year: 2003, shirt: '#f6f6f2', shorts: { c: '#f6f6f2', len: 'mid' }, socks: { c: '#f6f6f2' }, shoes: { c: '#f6f6f2', c2: '#1f2d4d' }, head: { type: 'cap', c: '#f6f6f2' } },
      ao: { year: 2007, shirt: '#1f2d4d', layers: [['collar', '#f2f2f2', 0.93]], shorts: { c: '#1f2d4d', len: 'mid' }, socks: { c: '#f2f2f2' }, shoes: { c: '#f2f2f2', c2: '#1f2d4d' }, head: { type: 'cap', c: '#f6f6f2' } },
      wim: { year: 2004, shirt: '#f4f4f1', shorts: { c: '#f4f4f1', len: 'mid' }, socks: { c: '#f4f4f1' }, shoes: { c: '#f2f0ec', c2: '#e2ded8' }, head: { type: 'cap', c: '#f4f4f1' } },
    },
  },
  Kyrgios: {
    year: 2022, skin: '#c99a72', beard: 0.2,
    body: { arms: 1.02, legs: 0.99, calf: 0.99, chest: 1.02, depth: 0.99, shoulders: 0.010 },
    face: { faceL: 0.4, jawW: 0.3, chinL: 0.2, noseL: 0.4, noseW: 0.2, brow: 0.4 },
    hair: { top: 5, sides: 0.3, back: 0.5, tex: 'straight', fringe: 0, recede: 0, ears: false, c: '#1c1410' },
    rk: { frame: '#1d4e9e', frame2: '#151515', grip: '#f2f2f2', string: '#e6e6e6', head: 1.0 },
    kits: {
      default: { year: 2022, shirt: '#151515', shorts: { c: '#151515', len: 'mid' }, socks: { c: '#f2f2f2' }, shoes: { c: '#151515', c2: '#c8102e' }, head: { type: 'cap', c: '#c8102e', back: true } },
      wim: { year: 2022, shirt: '#f4f4f1', shorts: { c: '#f4f4f1', len: 'mid' }, socks: { c: '#f4f4f1' }, shoes: { c: '#f2f0ec', c2: '#e2ded8' }, head: { type: 'cap', c: '#f4f4f1', back: true } },
    },
  },
  Monfils: {
    year: 2016, skin: '#5c3a24', beard: 0.5,
    body: { arms: 1.0, legs: 0.98, calf: 0.97, chest: 0.98, depth: 0.96, shoulders: 0.004 },
    face: { faceL: 0.5, jawW: 0.2, chinL: 0.3, noseW: 0.5, lips: 0.5, brow: 0.3 },
    hair: { top: 1.0, sides: 0.3, back: 0.4, tex: 'curly', fringe: 0, recede: 0, ears: false, c: '#141010' },
    rk: { frame: '#111111', frame2: '#3aa655', grip: '#f2f2f2', string: '#e6e6e6', head: 1.0 },
    kits: {
      default: { year: 2016, shirt: '#1e5bc6', shorts: { c: '#111111', len: 'mid' }, socks: { c: '#f2f2f2' }, shoes: { c: '#f2f2f2', c2: '#1e5bc6' }, wb: { L: ['#111111', 8], R: ['#111111', 8] } },
      wim: { year: 2016, shirt: '#f4f4f1', shorts: { c: '#f4f4f1', len: 'mid' }, socks: { c: '#f4f4f1' }, shoes: { c: '#f2f0ec', c2: '#e2ded8' } },
    },
  },
  Becker: {
    year: 1989, skin: '#f0c8a8', beard: 0.15,
    body: { arms: 1.03, legs: 1.06, calf: 1.04, chest: 1.03, depth: 1.03, shoulders: 0.006 },
    face: { faceL: 0.2, faceW: 0.3, jawW: 0.3, chinL: 0.2, noseL: 0.3, brow: 0.2, freckle: 0.5 },
    hair: { top: 7, sides: 6, back: 7, tex: 'wavy', fringe: 0.5, recede: 0, ears: true, c: '#c8794a', c2: '#a8603a' },
    rk: { frame: '#1d2a5c', frame2: '#c8202e', grip: '#f2f2f2', string: '#e8e8e8', head: 0.86 },
    kits: {
      default: { year: 1989, shirt: '#f4f4f1', tucked: true, layers: [['collar', '#1d2a5c', 0.93], ['placket', '#c8202e', 0.013, 0.72]], shorts: { c: '#f4f4f1', len: 'short' }, socks: { c: '#f4f4f1' }, shoes: { c: '#f4f4f1', c2: '#1d2a5c' }, wb: { R: ['#f4f4f1', 7] } },
      wim: { year: 1989, shirt: '#f4f4f1', tucked: true, shorts: { c: '#f4f4f1', len: 'short' }, socks: { c: '#f4f4f1' }, shoes: { c: '#f2f0ec', c2: '#e2ded8' }, wb: { R: ['#f4f4f1', 7] } },
    },
  },
  Edberg: {
    year: 1991, skin: '#f0caa8', beard: 0,
    body: { arms: 0.98, legs: 0.99, calf: 0.99, chest: 0.98, depth: 0.97, shoulders: 0.002 },
    face: { faceL: 0.5, faceW: -0.3, jawW: 0.1, chinL: 0.3, noseL: 0.4, brow: 0.2 },
    hair: { top: 6, sides: 3, back: 4, tex: 'straight', fringe: 0.6, recede: 0, ears: false, c: '#d8b878', c2: '#b8985c' },
    rk: { frame: '#1a1a1a', frame2: '#c8202e', grip: '#f2f2f2', string: '#e8e8e8', head: 0.86 },
    kits: {
      default: { year: 1991, shirt: '#f4f4f1', tucked: true, layers: [['hbands', '#2a4ea0', 0.19, 0.58, -0.10, -0.14, 0.76, 1, 0], ['collar', '#5a3a8c', 0.93]], shorts: { c: '#f4f4f1', len: 'short' }, socks: { c: '#f4f4f1' }, shoes: { c: '#f4f4f1', c2: '#2a4ea0' } },
      wim: { year: 1990, shirt: '#f4f4f1', tucked: true, shorts: { c: '#f4f4f1', len: 'short' }, socks: { c: '#f4f4f1' }, shoes: { c: '#f2f0ec', c2: '#e2ded8' } },
    },
  },
  Ivanisevic: {
    year: 2001, skin: '#d7a882', beard: 0.25,
    body: { arms: 0.98, legs: 0.97, calf: 0.97, chest: 0.97, depth: 0.96, shoulders: 0.008 },
    face: { faceL: 0.6, faceW: -0.2, jawW: 0.3, chinL: 0.4, noseL: 0.6, brow: 0.4, hollow: 0.3 },
    hair: { top: 3, sides: 1.5, back: 2, tex: 'straight', fringe: 0, recede: 0.1, ears: false, c: '#2b1d16' },
    rk: { frame: '#1c1c1c', frame2: '#f2f2f2', grip: '#f2f2f2', string: '#e8e8e8', head: 0.95 },
    kits: {
      default: { year: 2001, shirt: '#f6f6f2', layers: [['collar', '#c8202e', 0.93]], shorts: { c: '#f6f6f2', len: 'mid' }, socks: { c: '#f6f6f2' }, shoes: { c: '#f6f6f2', c2: '#1c1c1c' } },
      wim: { year: 2001, shirt: '#f4f4f1', shorts: { c: '#f4f4f1', len: 'mid' }, socks: { c: '#f4f4f1' }, shoes: { c: '#f2f0ec', c2: '#e2ded8' } },
    },
  },
  Wilander: {
    year: 1988, skin: '#efc6a6', beard: 0,
    body: { arms: 0.98, legs: 1.0, calf: 1.0, chest: 0.97, depth: 0.96, shoulders: 0 },
    face: { faceL: 0.3, faceW: -0.2, jawW: -0.1, chinL: 0.2, noseL: 0.4, brow: 0.2 },
    hair: { top: 7, sides: 6, back: 8, tex: 'wavy', fringe: 0.5, recede: 0, ears: true, c: '#9a7650' },
    rk: { frame: '#2a2a2a', frame2: '#c8202e', grip: '#f2f2f2', string: '#e8e8e8', head: 0.82 },
    kits: {
      default: { year: 1988, shirt: '#f7f7f4', tucked: true, layers: [['collar', '#1d2b4f', 0.93], ['placket', '#c8202e', 0.013, 0.72]], shorts: { c: '#f7f7f4', len: 'short' }, socks: { c: '#f7f7f4' }, shoes: { c: '#f4f4f0', c2: '#1d2b4f' } },
      wim: { year: 1988, shirt: '#f7f7f4', tucked: true, shorts: { c: '#f7f7f4', len: 'short' }, socks: { c: '#f7f7f4' }, shoes: { c: '#f2f0ec', c2: '#e2ded8' } },
    },
  },
  Kuerten: {
    year: 2000, skin: '#e3b48e', beard: 0.1,
    body: { arms: 0.95, legs: 0.96, calf: 0.96, chest: 0.95, depth: 0.94, shoulders: -0.002 },
    face: { faceL: 0.6, faceW: -0.2, jawW: 0.1, chinL: 0.3, noseL: 0.6, noseW: 0.2, lips: 0.3 },
    hair: { top: 10, sides: 6, back: 8, tex: 'curly', fringe: 0.3, recede: 0, ears: true, c: '#5a3d26' },
    rk: { frame: '#1c1c1c', frame2: '#f2f2f2', grip: '#f2f2f2', string: '#e8e8e8', head: 0.95 },
    kits: {
      default: { year: 1997, shirt: '#f2cf1d', layers: [['collar', '#1d4fa3', 0.93]], shorts: { c: '#1d4fa3', len: 'mid' }, socks: { c: '#f2f2f2' }, shoes: { c: '#f2f2f2', c2: '#1d4fa3' } },
      wim: { year: 2000, shirt: '#f4f4f1', shorts: { c: '#f4f4f1', len: 'mid' }, socks: { c: '#f4f4f1' }, shoes: { c: '#f2f0ec', c2: '#e2ded8' } },
    },
  },
  Hewitt: {
    year: 2002, skin: '#e6b48f', beard: 0,
    body: { arms: 0.99, legs: 1.02, calf: 1.02, chest: 0.98, depth: 0.97, shoulders: 0 },
    face: { faceL: 0.2, faceW: -0.1, jawW: 0.1, chinL: 0.2, noseL: 0.3, brow: 0.3 },
    hair: { top: 3, sides: 1.5, back: 2.5, tex: 'straight', fringe: 0, recede: 0, ears: false, c: '#8a6a45' },
    rk: { frame: '#1a1a2e', frame2: '#f2f2f2', grip: '#f2f2f2', string: '#e8e8e8', head: 0.95 },
    kits: {
      default: { year: 2002, shirt: '#f6f6f2', shorts: { c: '#f6f6f2', len: 'knee' }, socks: { c: '#f6f6f2' }, shoes: { c: '#f6f6f2', c2: '#1a1a2e' }, head: { type: 'cap', c: '#f6f6f2', back: true } },
      wim: { year: 2002, shirt: '#f4f4f1', shorts: { c: '#f4f4f1', len: 'knee' }, socks: { c: '#f4f4f1' }, shoes: { c: '#f2f0ec', c2: '#e2ded8' }, head: { type: 'cap', c: '#f4f4f1', back: true } },
    },
  },
};

// The look a player takes onto court at an event: his kit for that major, or his ordinary one.
// Whose head each player wears: the man in the avatar library nearest his type (see people.js).
export const HEAD_OF = { Alcaraz: 'crowd-src/Male_Adult_02', Sinner: 'staff/Sports_Male_02', Djokovic: 'staff/Sports_Male_02', Nadal: 'crowd-src/Male_Adult_02', Federer: 'staff/Business_Male_01', Sampras: 'crowd-src/Male_Adult_02',
  Agassi: 'crowd-src/Male_Adult_06', Lendl: 'staff/Business_Male_01', Borg: 'crowd-src/Male_Adult_06', McEnroe: 'crowd-src/Male_Adult_01', Connors: 'crowd-src/Male_Adult_01', Laver: 'staff/Sports_Male_02',
  Murray: 'crowd-src/Male_Adult_02', Wawrinka: 'crowd-src/Male_Adult_04', Zverev: 'crowd-src/Male_Adult_02', Thiem: 'crowd-src/Male_Adult_02', Medvedev: 'crowd-src/Male_Adult_01', Tsitsipas: 'crowd-src/Male_Adult_02', 'del Potro': 'crowd-src/Male_Adult_04',
  Roddick: 'staff/Sports_Male_02', Kyrgios: 'crowd-src/Male_Adult_04', Monfils: 'crowd-src/Male_Adult_06', Becker: 'staff/Business_Male_01', Edberg: 'crowd-src/Male_Adult_06', Ivanisevic: 'crowd-src/Male_Adult_06', Wilander: 'crowd-src/Male_Adult_01', Kuerten: 'crowd-src/Male_Adult_06', Hewitt: 'staff/Sports_Male_02' };
export const ALL_HEADS = [...new Set(Object.values(HEAD_OF))];
// the ball kids wear the library's children's faces
export const KID_HEADS = ['staff/Male_Child_01', 'staff/Female_Child_01', 'staff/Male_Child_02'];
export function lookFor(name, eventKey) {
  const P = LOOKBOOK[name]; if (!P) return null;
  const kit = P.kits[eventKey] || P.kits.default;
  // his own painted face where there is one; its measured proportions are averaged with the judged ones
  const F = FACES[name], face = { ...(P.face || {}) }; if (F && F.face) for (const k in F.face) face[k] = ((face[k] || 0) + F.face[k]) / 2;
  // his build: the judged values, averaged with what was measured where a measurement can be trusted
  const body = { ...(P.body || {}) }, Mb = BODY_MEASURED[name] || {};
  for (const k in Mb) { const j = body[k] != null ? body[k] : k === 'armL' || k === 'armR' ? body.arms : k === 'foreL' || k === 'foreR' ? body.arms : null; body[k] = j != null ? (j + Mb[k]) / 2 : Mb[k]; }
  return { name, skin: P.skin, face, head: F ? 'face:' + name : HEAD_OF[name] || null, headFallback: HEAD_OF[name] || null, body, beard: kit.beard != null ? kit.beard : P.beard, hairSpec: P.hair, hair: P.hair.c, headwear: kit.head || null, kit, rk: P.rk, top: kit.shirt, shorts: kit.shorts.c, sleeveless: !!kit.sleeveless, kitYear: kit.year };
}
