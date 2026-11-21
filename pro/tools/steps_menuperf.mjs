// Menu responsiveness: how long until the menu opens after the page loads, how long opening the player list blocks the page the
// first time (every card's portrait), and the longest frame in the seconds after while portraits are drawn in the background.
// env: FLAGS (a,b=1 → globalThis.__a ... set before the app boots, through ?flags= is not available: set on window early)
export default async function ({ ev }) {
  const E = process.env;
  const t = await ev(`(async () => { const t0 = performance.now(); for (let k = 0; k < 600; k++) { const A = window.__app; if (A && A.mode === 'menu' && document.querySelector('#wipe') && document.querySelector('#wipe').className === '' && A.ui.querySelector('.screen')) return Math.round(performance.now() - t0); await new Promise(r => setTimeout(r, 50)); } return -1; })()`);
  console.log('menu open after (ms since probe start):', t);
  const r = await ev(`(async () => { const A = window.__app; Object.assign(globalThis, ${JSON.stringify(Object.fromEntries((E.FLAGS || '').split(',').filter(Boolean).map(x => { const [k, v] = x.split('='); return ['__' + k, v === undefined ? true : +v]; })))});
    const frames = []; let last = performance.now(), on = true; const tick = now => { frames.push(now - last); last = now; if (on) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    await new Promise(r => setTimeout(r, 1500)); const pre = Math.max(...frames.splice(0));
    A.quick(); const t0 = performance.now(); A.pick(0, () => {}); const pickMs = performance.now() - t0;
    await new Promise(r => setTimeout(r, 4000)); on = false;
    const imgs = [...A.ui.querySelectorAll('.pl img')], drawn = imgs.filter(i => !i.dataset.blank).length;
    return JSON.stringify({ preMaxFrame: Math.round(pre), pickBlockMs: Math.round(pickMs), maxFrameAfter: Math.round(Math.max(...frames)), framesAfter: frames.length, cards: imgs.length, withPicture: drawn, queueLeft: (A.faceQ || []).length }); })()`);
  console.log('RESULT', r);
}
