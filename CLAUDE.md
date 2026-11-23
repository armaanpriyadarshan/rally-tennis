# rally-tennis

- The site, https://playrally.vercel.app, deploys with `npx vercel` from the repo root.
  `vercel.json` makes Rally Pro (`pro/`) the default: `/` and every path not under
  `/classic/`, `/pro/` or `/audio/` is served from `pro/` (it still answers at `/pro/` too).
  `.vercelignore` keeps `ml/` out of deploys. Normal rules here — implement, fix, ship as asked.

- `classic/` — the original Rally (`index.html` + `peerjs.min.js`), at `/classic/`
  (moved there from the root on 2026-11-23). `audio/` stays at the root: both games load
  their sounds from it (Pro by `../../audio/` from `pro/js/`, classic by `../audio/`).

- `pro/` — Rally Pro Tour, the first-person 3D version (three.js vendored under
  `pro/vendor/`, ES modules, no build step). Sources for its player/tournament numbers
  and third-party assets are in `pro/NOTES.md`. `pro/dev.html` is a developer viewer
  (pose lab, empty stadium, AI-vs-AI demo).

- `ml/` — Armaan's ML learning project (Tennis Match Charting Project data).
  For ALL work under `ml/`, the **AI Agent Guidelines in `ml/CLAUDE.md` are the
  primary instructions** — follow them over any default behavior: teaching
  assistant, not code generator.
