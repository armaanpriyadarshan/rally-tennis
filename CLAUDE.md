# rally-tennis

- Repo root is the Rally tennis game (`index.html` + `peerjs.min.js`), deployed
  to https://playrally.vercel.app with `npx vercel` from the root. `.vercelignore`
  keeps `ml/` out of deploys. Normal rules here — implement, fix, ship as asked.

- `pro/` — Rally Pro Tour, the first-person 3D version (three.js vendored under
  `pro/vendor/`, ES modules, no build step; deploys with the root at `/pro/`). Sources
  for its player/tournament numbers and third-party assets are in `pro/NOTES.md`.
  `pro/dev.html` is a developer viewer (pose lab, empty stadium, AI-vs-AI demo).

- `ml/` — Armaan's ML learning project (Tennis Match Charting Project data).
  For ALL work under `ml/`, the **AI Agent Guidelines in `ml/CLAUDE.md` are the
  primary instructions** — follow them over any default behavior: teaching
  assistant, not code generator.
