Object.assign(globalThis, Object.fromEntries((process.env.FLAGS || '').split(',').filter(Boolean).map(k => ['__' + k, true])));
if (process.env.REACHPAD) globalThis.__reachPad = +process.env.REACHPAD;
await import('./classicbot.mjs');
