# Tools

Not part of the game; excluded from deploys.

- `harness.mjs` — two tour-average computer players, headless: `node harness.mjs points=1500 surface=clay`.
  Prints rally length, serve and error statistics against Match Charting Project targets.
- `harness-players.mjs` — the same with real player profiles at real venues.
- `humanbot.mjs` — a stand-in for a person: plays through the real controller (`js/human.js`) with human
  reaction time, timing error and aiming error, against each difficulty. `node humanbot.mjs points=400`
  prints points won, hold and break rates for a casual, a decent and a sharp player on every level.
- `shot.mjs` — drives headless Chromium over the DevTools protocol: `node shot.mjs <url> out.png [--steps file.mjs]`.
- `audio_capture.mjs`, `audio_check.py` — record the sound the page really produces while points are played,
  and measure it against the log of sounds the game asked for (levels over the crowd, echoes, dropouts).
- `mocap_clips.py` — builds the movement clips (`js/locodata.js`) from CMU motion-capture trials:
  `python3 -I tools/mocap_clips.py js/locodata.js <dir with NN.asf / NN_TT.amc> [more dirs]`.
- `classicbot.mjs` — the same idea as `humanbot.mjs` for the classic controls (Space and arrows).
- `gait_run.py` — measures running straight from CMU motion-capture files (step rate, ground contact, heel lift).
- `strokes.py` — builds the measured stroke tracks (`js/strokedata.js`) from tracked joint data.
- `track.py`, `player_motion.py` — each player's own strokes: track a court-level slow-motion clip
  (`track.py --big`), then build full-body clips from a manifest of single strokes, fusing two cameras where
  there are two (`js/playermotion.js`, with verification sheets). `racket_ovr.py` solves `RACKET_OVR` key
  directions so a tracked stroke's racket ends where the footage has it.
- `gait.py` — measures footwork from the same data (cadence, foot paths, hip rise, lean, the split step);
  the `GAIT` numbers in `js/figure.js` are read off its tables.
- `gen_players.py`, `gen_tour.py` — build `js/playerdata.js` and `js/tourdata.js` from the research JSON.
- `rb_export.py` (Blender), `rb_textures.py` — turn a Rocketbox avatar into `assets/people/*`.
- `sky_analyze.py` — measures each sky panorama and writes `assets/sky/*`.

The Python scripts take their input and output paths as arguments; read the top of each.
