# Rally Pro Tour — notes

First-person 3D version of Rally. Static files, no build step: open `index.html` from any
web server (`npx vercel` from the repo root deploys it at `/pro/`).

`dev.html` is a developer view, not part of the game:
`?game=1&demo=1` watches two computer players, `?lab=fh|bh|serve&p=Name&view=front|top|side`
scrubs one stroke, `?venue=<key>&weather=<key>&cam=fp|tv|high` shows an empty stadium.

## Where the numbers come from

- **Players** (`js/playerdata.js`): career serve and return statistics from the ATP stats
  tables and Tennis Abstract match data; serve speeds from Tennis Abstract's Slam radar
  tables; forehand/backhand pace and spin from Hawk-Eye / TennisViz reporting; net, slice,
  drop-shot and serve-direction rates from the Match Charting Project. `null` means no
  credible figure exists; `est` lists the fields that are estimates. For Lendl, McEnroe,
  Connors, Borg and Laver the ATP tables only cover the end of their careers, so
  `js/data.js` substitutes era-typical values (the `ERA` table). Playing weights in
  `js/data.js` (`FRAME`) are from public bios and approximate for older players.
- **Tournaments** (`js/tourdata.js`): 2026 calendar, draws and points from the ATP schedule;
  Court Pace Index from published Tennis TV readings (courtspeed.com), old readings for the
  Slams; ace rate and surface speed from Tennis Abstract; weather from Open-Meteo history
  for each event's dates; altitude from elevation data. The hex colours there are estimates.
- **Venue looks** (`js/venues.js`): court, surround, wall and seat colours sampled from
  photographs of each centre court (mostly Wikimedia Commons). Several venues only had old
  photos; Turin and Beijing had almost none and are approximations. Signage uses the
  venue's own words and invented partner names, not real sponsors.
  Revised in November 2026 against each event's 2025/2026 edition (2023–26 Commons photos,
  official sites, ATP 2026 media guide, surface makers' colour names, news reports):
  - Paris moved to Paris La Défense Arena in 2025 and kept its green court on charcoal.
  - Miami's court is Laykold's two blues inside Hard Rock Stadium, under the NFL canopy and
    its masts.
  - Cincinnati was repainted navy on cerulean in 2025, and Queen's has had red walls since 2025.
  - Basel, Vienna, Rotterdam, Tokyo, Acapulco and Turin have their measured court colours.
  - Still unconfirmed: Beijing (2014 photos only), Acapulco after its 2026 resurfacing, Dallas
    (which part is blue, which silver), Shanghai, and Halle's and Hamburg's walls.
- **Strokes** (`js/strokedata.js`): contact-aligned averages of 232 forehands, 210 backhands
  and 168 serves from the joint tracks published with offpolicyinc.com/work/federer
  (17 keypoints at 15 Hz, tracked from broadcast footage). Arms were lifted to 3D with bone
  lengths. Footage at 15 Hz cannot resolve the hit itself, so the racket hand follows an
  authored path for about a tenth of a second either side of contact, and racket
  orientation is authored throughout. There is no tracked two-handed backhand: it borrows
  the one-hander's turn and timing.
- **Footwork** (`GAIT` in `js/figure.js`): from the same joint tracks, about 600 seconds of
  sideways movement phase-aligned on the ankles (`tools/gait.py`). Step rate against speed,
  where each foot lands and leaves relative to the hips, ankle lift, the rise and fall of the
  hips through a step, lean into the run, the speed at which the shoulders turn and the arms
  start to pump, and the height, length and landing of the split step are measured. Seen from
  behind, running toward or away from the net is foreshortened, so running straight is measured
  from 3D motion capture instead: 14 runs and two walks by four people from the CMU Graphics
  Lab Motion Capture Database (mocap.cs.cmu.edu; `tools/gait_run.py`), rescaled to a 1.85 m
  player — step rate, ground contact and the moment in the air, where the foot lands and
  leaves, heel lift, track width and hip rise. Those are runners, not tennis players, and none
  carries a racket: arm carriage and lean stay with the tennis footage. Backing up is stepped
  like the sideways shuffle; nothing measures it. Heights in the tennis footage are relative —
  its picture scale is not a true body scale — so how deep the ready crouch is remains a
  judgement.
- **Sound**: checked by recording what the page actually sends to the speakers while points
  are played (`tools/audio_capture.mjs`) and measuring it against the log of sounds the game
  asked for (`tools/audio_check.py`). That found and fixed a second "pock" a quarter of a
  second after every racket hit (the recorded sample opens with 280 ms of silence) and a
  crowd bed that swelled and dropped out every seven seconds (a fading sample on a loop). As
  measured now on hard and clay: racket hits 15 dB above the crowd, the first bounce 14-16 dB,
  nothing trailing a hit, applause 12-14 dB above the hush during a point, no clipping. The
  chair umpire uses the browser's speech voice and was not captured. No one has listened to it.
- **Back walls**: dressed after court-level photographs of Arthur Ashe — the venue's word large
  on the wall, dark camera slots at its foot, a partner's block, and a clock cabinet whose serve
  clock is the match's own. Names are invented. Wall paint is lightened from the sampled colour,
  because the samples were taken in shade (New York uses its floodlit sample instead).
- **Lens**: the stands beyond the far baseline are softened by a depth-of-field pass (strongest
  through the broadcast camera, slight in first person), and the foot of the walls and the
  seating bowl are darkened where they see less sky. Both are approximations chosen by eye.
- **Venue light**: the sun's height is computed from each venue's latitude and the event's
  dates for the hour the weather names (`PLACE` in `js/venues.js`); the sky photograph is tilted
  to agree, by no more than 24 degrees.
- **Difficulty** (`DIFFICULTY` in `js/data.js`): set with `tools/humanbot.mjs`, a bot that plays
  through the real controls with a person's reaction time (0.20-0.34 s), release timing
  (30-75 ms standard deviation) and aiming error. With the default footwork help a "decent" bot
  (50 ms timing) wins about 71% of points on Club, 50% on Challenger and 42% on Tour; a "sharp"
  one (30 ms) 75%, 53% and 47%; a "casual" one (75 ms) 65%, 39% and 30%. Steering the feet by
  hand cost the bot 13-16 points of those percentages. The bot is a model of a player, not a
  player: nobody has yet played these levels by hand.
- **Engine calibration**: two computer players of tour-average ability on a hard court
  produce a 4.3-shot mean rally, 57% of points over within three shots, 64% first serves
  in, 10% aces, and errors split roughly 46/36/18 between net, long and wide — against
  4.1, 60%, 63%, 9% and 42/33/26 in the Match Charting Project. First-serve points won is
  low (67% against 73%).

## The 2026-11-10 rebuild: players, motion, graphics

- **Roster**: the twelve players of the original game, no others (`ROSTER` in `js/data.js`).
- **Look** (`js/looks.js`): each player's haircut (lengths in centimetres, texture, fringe, how far
  the hairline has gone back), headwear, racket and five outfits (ordinary events and each major)
  were described from photographs of him in the year named. The photographs were for looking at
  only; none is in the repository. Makers' logos are left off. Items the research could not
  confirm from a photograph (several older players' sock and shoe details, some wristband widths)
  were filled with the era's ordinary kit.
- **Hair** (`js/hair.js`): grown from those measurements on the model's own scalp — the head is
  measured by casting rays from the middle of the skull — in three or four layers of strands.
  Headbands, bandanas and caps are fitted to the same scalp. It is a generated haircut, not a
  scan of the man's hair.
- **Faces**: each player wears the head of whichever man in the avatar library is nearest his type
  (`HEAD_OF`), moved onto the athletic body, tinted to his skin, with brows and stubble in his
  colours and the bone structure pushed toward his (`face` measures: jaw, chin, nose, cheeks, brow,
  ears). These are likenesses of type judged by eye, not portraits and not scans. Five heads serve
  twelve players for now.
- **Build** (`body` in `js/looks.js`): girth of each arm and forearm, legs, chest and shoulder
  width per player, judged from photographs (Nadal's and Laver's hitting arms, Sinner's narrow
  frame). Limb lengths are still the model's, scaled by height. Measured widths are to replace the
  judged ones.
- **Movement** (`js/motion.js`, `js/locodata.js`): walking, jogging, running, sprinting, backing up
  and the side shuffle are 3D motion capture from the CMU Graphics Lab Motion Capture Database
  (trials 16_15, 16_36, 127_07, 143_01, 143_39 and the basketball defensive slides 78_30), cut to
  one cycle each and rescaled to a 1.85 m body by `tools/mocap_clips.py`. The shuffle and the ready
  stance come from a basketball defender, who slides bent far lower than a tennis player: the
  trunk was stood up and the hips raised by hand. Each cycle is played at the rate that covers the
  ground the player is actually covering.
- **Strokes**: the earlier tracks (two wrists and a shoulder turn, averaged over hundreds of strokes
  filmed from behind at 15 frames a second) flattened every extreme — the serve's wrist peaked at
  1.67 m where a real one reaches about 2.4 m — and are no longer played. Forehand, both backhands
  and the serve are whole-body key poses written by hand (hips, feet, both arms, racket) until each
  player's own clips are tracked from close slow-motion footage (`js/playermotion.js`, empty when
  this was written). Slices and volleys still use the older hand-and-racket keys on the new legs.
  So the strokes are generic, the same for every player of the same hand and backhand: they are
  not yet the man's own motion.
- **Between points**: no walk, cutaway or replay; the picture dips for an instant and the next
  point is ready (`quick`). The cutaways and replays still exist behind `cfg.cuts`.
- **Controls**: the default is the first game's — arrows or WASD to move, Space to toss, serve and
  hit, an arrow held at the swing to aim. A bot playing that way with 50 ms timing error wins 71%,
  49% and 34% of points on Club, Challenger and Tour (`tools/classicbot.mjs`); nobody's hands have
  confirmed those levels. The mouse scheme is still there under Settings.
- **Graphics over the match**: laid out from frames of the ATP world feed's 2026 package (measured
  positions, cell sizes and colours; the font is Outfit, the nearest open face to the tour's) and
  from one frame each of the four majors' own score bugs. Seen in frames: the score bug and its
  states, the lime row tab, the statistic add-on, the lower third. Not seen in any 2026 frame and
  therefore designed to match rather than copied: set/match-point tabs, the serve-speed read-out,
  the statistics panel, the match strap and the wipe. No tour or sponsor marks are used.

- **Faces (update)**: nine players — Federer, Nadal, Alcaraz, Djokovic, Sampras, Agassi, Lendl, Borg,
  McEnroe — wear a face baked from one freely licensed photograph each (`tools/face_bake.py`,
  `js/facedata.js`, sources and licences in `assets/people/faces/SOURCES.md`). Seven of the nine
  textures are CC BY-SA because their photographs are: credit them wherever the game is published.
  Sinner, Connors and Laver have no usable free photograph and keep a library head.
- **Light**: the picture goes through AgX rather than ACES (true clay and grass, highlights rolling off
  like a camera's), and clear and fair days are set in mid-afternoon, when the stadium's own shadow
  lies across part of the court as it does on television.

- **Borrowed swings**: a player without a tracked stroke of his own that passes inspection borrows the
  closest real one — same hand where possible, same kind of backhand — mirrored to his side
  (`DONORS` in `js/figure.js`): Federer's forehand, one-handed backhand and serve for right-handers,
  Nadal's forehand and serve for left-handers. Two-handed backhands stay hand-made until one passes.
  So most players' strokes are real tennis motion, but not yet each man's own.
- **Ball kids**: built on the athletic player body at teenage size, in the event's shirt (collar and
  sleeve trim in the cap colour), shorts, white ankle socks and shoes, with a fitted cap and one of the
  library's children's faces; they watch the ball.
- **Night**: under floodlights the run-off falls away from the court toward the walls, the seats are
  darker, lamp banks glow along the rim of open bowls, and the camera is exposed for the court.

## 2026-11-11: surfaces, smoothness, cost

- **Who is better where** (`surfaceEdge`, `profileFor` in `js/data.js`): a player's career win rate on the
  surface over his overall rate (the `win` table in `js/playerdata.js`), capped at 0.8–1.15. That edge
  now moves consistency, top speed, acceleration, reaction, groundstroke and first-serve pace and first
  serves in; a clay specialist's ball is also heavier on clay. The sizes of those effects are my
  judgement, not measured. The edge is shown on player cards and in an event's field.
- **How a surface is played** (`SURFACE_PLAY`): footing (`grip`, `brake`: players slide on clay and can
  stop less sharply) and how often serve-and-volley, the net, the slice and the drop shot are chosen.
  The direction of each follows the tour (serve-and-volley and slice on grass, drop shots and patience on
  clay); the numbers are judged, not fitted. The ball itself already differed by surface through the ITF
  friction and restitution figures and each event's court pace.
- **Court in shade**: the sun test the shaders make is also made in `buildLighting` over the court; the
  exposure and a white balance follow the part of the court in sun, as a broadcast camera does, so a late
  afternoon with the court under the stand no longer turns it dark and blue. Hard courts are a little
  greyer and glossier than their venue swatch (measured against broadcast stills), clay a little more orange.
- **Smoothness**: the match is simulated at 240 Hz and now drawn between its last two steps; the tracked
  swings are cleared of single bad frames and smoothed both ways in time (hard where a joint is slow, light
  where it is fast); a foot lifting off its planted spot eases away instead of snapping.
- **Cost**: frames are capped near 60 Hz on fast screens (every second refresh, so still even), the match
  behind the menus is drawn at 30 Hz and not at all under a full-screen menu; the automatic resolution
  only ever steps down; two floodlight shadows instead of four; menu portraits release their textures.
- **The racket meets the ball**: measured at contact, the middle of the strings had been 25-67 cm from the ball. Around
  contact the hand now goes toward the struck ball as far as the arm reaches and the wrist angles the racket (in the
  plane of its strings, a little out of it) for the rest: about 10-15 cm, inside the face. A low ball is played with
  the legs: the hips go down with the contact height (0.65 m for a ball below the knee).
- **Swing blur**: the band the racket head swept over the last two frames, faint and fading, only above about 7 m/s.
- **Skin and cloth**: skin wraps warm where it turns from the sun and is a little damp (smoother); cloth brightens at
  glancing angles toward the light.
- **Footwork**: the split step lands 7 cm wider each side; pulling up hard from a run the hips drop into a braking
  stance, and the first driving steps of a run are low; on clay a player braking from a run slides, the leading foot
  gliding on with the body, wide, throwing clay dust and leaving its streak in the court.
- **Review method**: every key moment of play is frozen from five angles (front, both sides, behind, above)
  with `/tmp/rally-work/steps_review.mjs`, the pose lab is scrubbed through each stroke from four
  (`steps_lab.mjs`), and hands and feet are checked close up (`steps_close.mjs`). What that found and fixed:
  hands now close round the handle (finger curl about 60/80/55 degrees, not an open palm); sprinting arms come
  from the forward run (the free arm pumps bent; a sideways run's own capture had it hanging); the slices and
  volleys turn the shoulders and hips and step in with the front foot; the overhead has its own keys
  (side-on, free hand at the ball, racket behind the head, thrown up to contact) instead of reusing the serve's;
  after a point the legs straighten as he reacts, and the reaction keeps the arms; long hair swings (a
  pendulum per player in the vertex shader: it falls the right way when he bends and lags as he moves).
  The eyes finish the head's turn to the ball (the head turns 85% of the way, the eyes the rest, faster), and the
  jaw opens on the breath out through the hit, wide in a shout after a point won with feeling. (Blinking was
  tried and dropped: the grafted heads carry almost no weight on the eyelid bones, so a blink was a twitch.)
- **The serve** (2026-11-11, from his notes on the toss, the pre-serve and the legs): each player has a routine
  (`RITUAL` in `js/sim.js`: bounces and pace, one more or fewer from point to point; Djokovic bounces five times,
  Federer twice) and then stands at the address, racket at the waist pointing at the box with the ball against it.
  The ball is drawn on the posed palm. The toss is thrown with a straight arm (the collarbone's shrug adds reach
  instead of folding the elbow), the hand lets go rising and follows the ball up, then pulls down across the body.
  On landing he is carried half a metre into the court; the back leg kicks up to about knee height and comes down;
  knees never fall in toward each other (tracked knees do).
- **Your shots** are chosen by the game at the swing (the computer's `decide()`): moonballs and slices when pushed
  back or stretched, lobs over a man at the net, drop shots now and then, approaches that the footwork follows in to
  volley, swinging volleys on a floating ball from mid-court, drives otherwise. The timing circle follows the footwork's
  planned contact while it can get him there; high balls up to the shoulders are taken on and can be driven hard.
- **Arms**: the racket hand never comes closer to its shoulder than about half the arm's length (tracked clips fold it
  shut in finishes), the clip's own elbow direction counts only as far as its arm is bent, and the elbow direction is
  smoothed after everything that moves it.
- **Reactions** (`REACT`, `REACT_STYLE`, `pickReaction` in `js/figure.js`): several per outcome, weighted per player,
  kept for points that mattered, never the same twice running, and often none at all.
- **Sweat**: the shirt darkens down the chest, across the upper back and under the arms as games are played, faster
  in the heat and hardly under a roof (`uSweat`, set in `game.js`).
- **Hair**: on top of the layered mass, a few hundred locks — strips rooted inside the mass, lying the way
  the cut goes, thinning to both edges and the tip — break its outline, hang where the hair is long, and
  turn as they go where it is curly.

## 2026-11-11: each player's own groundstrokes

- **Who has his own**: Djokovic's forehand and backhand and Nadal's backhand are now tracked from his own
  slow-motion footage (`js/playermotion.js`, `ok: true`), beside the earlier Federer forehand, backhand and serve,
  Nadal forehand and serve, and the Alcaraz, Sinner and Djokovic serves. A right-handed two-hander without his own
  backhand now borrows Djokovic's, a left-handed one Nadal's (`DONORS` in `js/figure.js`); nothing needs hand-made
  arms at contact any more (`PARTIAL` is empty). This supersedes "Two-handed backhands stay hand-made" above.
- **How**: two cameras of the same player's practice, each a front or rear quarter, are fused over the ground — each
  measures the direction across its own picture and the trunk and arms go where both agree (`fuse` axis `tri` in
  `tools/player_motion.py`); one camera where no second one exists, the depth of the arms then coming from their
  lengths. Each clip was compared in the game with the frames of the camera it came from at 6-8 instants (and with
  the second camera where there is one). The racket's angle in the take-back is not tracked: where the shared keys,
  carried by the tracked forearm, put it somewhere the footage does not, `RACKET_OVR` in `js/figure.js` holds key
  directions solved to match the frames (`tools/racket_ovr.py`).
- **Speed**: the Essential Tennis 2013 shoots run about 9x (the ball toss of the same series measured 9.0-9.7x; a ball
  in flight beside Djokovic's forehand fits 8.5-9.2x). "Slow motion" uploads from Courtside Tennis Highlights repeat
  every frame four times: 30-frames-a-second footage at quarter speed, so the arms are blurred through the hit and
  were not used for it.
- **Not yet his own**: Sinner's and Alcaraz's groundstrokes (the slow-motion footage found is filmed from straight
  behind or in front, with cuts mid-stroke, repeated frames or an unknown slow-down; nothing passed), and every
  stroke of Sampras, Agassi, Lendl, Borg, McEnroe, Connors and Laver (the footage found is broadcast, archive
  360-480p, or senior-event film from raised seats; nothing court-level and slow enough to pass). They borrow.
- **Footage** (YouTube, analysed locally to derive joint motion only; nothing of it is kept in or shipped with the
  game): Essential Tennis, "Novak Djokovic Forehand and Backhand In Super Slow Motion - 2013 Cincinnati Open"
  (youtube.com/watch?v=wIU_3TIUzDo) and "... In Super Slow Motion 2 - 2013 Cincinnati Open" (watch?v=k8B5Hqvx8kA);
  "Rafael Nadal Forehand and Backhand In Super Slow Motion 2 - 2013 Cincinnati Open" (watch?v=OVFqDqxcJC4);
  "Rafael Nadal Backhand in Super Slow Motion - BNP Paribas Open 2013" (watch?v=xm2zi36uZEg). The earlier clips came
  from the same channel's Federer serve (watch?v=FBkFgS3e4QY), forehands (watch?v=TViGEogv3rc, watch?v=BFHvsskH7_k)
  and backhand (watch?v=LA7B-M-kOrw), Nadal forehand (watch?v=fRxJk1omIm4) and serve (watch?v=VXTxuWxafKg), and from
  Slow-Mo Tennis's Alcaraz (watch?v=rxo1uEdLouY), Sinner (watch?v=_wut0HlifLQ) and serve-compilation
  (watch?v=fhn2ANDE4kA) videos.

## 2026-11-11: each player's own body

- **How**: `tools/body_shapes.py` sets MakeHuman's body (the CC0 base mesh, targets and default-rig weights, read
  straight from the MPFB 2.0.18 extension's `data/` folder; none of MPFB's code is run) to each man: muscle judged from
  freely licensed Wikimedia Commons photographs (viewed only; none kept), weight solved so that MakeHuman's body at his
  height weighs his listed playing weight (`FRAME` in `js/data.js`; density 1.04 kg/l), then his own traits as
  MakeHuman modifiers on top of a shared tour-player base (a playing forearm about 2 cm bigger round, runner's thighs
  and calves). That body is laid onto the game model's skeleton segment by segment and each vertex of the game body is
  moved by how the player's body differs, there, from a reference one matching the model; bare skin (forearms, legs
  below the shorts, arms of a sleeveless shirt) is laid on his MakeHuman surface itself, the model's own thick
  forearms and calves dropped. Wider shoulders move the arm bones out. The result (`assets/people/m04_shapes.bin`,
  `BODY_SHAPES` and girths in `BODY_INFO` in `js/bodydata.js`) is added to each player's copy of the mesh at load:
  no cost per frame. The kit is drawn on the body as built (`aBind`), so it sits the same on every frame.
- **Judged, not measured**: muscle levels and traits are judgement from photographs. The listed weights were kept
  except McEnroe (listed 75 kg, as now; built 70 kg, as slim as his playing-years photographs) and Sinner (built 76 kg
  of 77). MakeHuman girths at his height (cm, upper arm L/R, forearm L/R): Nadal 40/37, 31/27; Federer 36/37, 28/31;
  Laver 35/32, 33/25 (his left forearm, 13 inches round as his autobiography gives it, is the one girth set to a
  published figure). Limb lengths are still the model's.
- To rebuild: download MPFB 2.0.18 from extensions.blender.org, extract its `data/` folder, and run
  `python3 -I tools/body_shapes.py <extracted folder>`.
- **Shorts shorter than the model's**: under the model's own shorts lie three sheets (its leg skin, which goes on up
  under the cloth to about 0.68 m; the shorts' shell, down to their hem at about 0.59 m; and the lining turned in
  there). For a shorter hem the outside is kept as the model built it: shell on the surface down to 0.59 m, leg skin
  below, everything else 8 mm under the surface. All of it takes the reference surface's normals, and a seam's copies
  of a vertex always move together, so no ring or crack shows at the old hem. The skin there is drawn plain at the
  bare leg's brightness (the shorts' folds, seams, grey edge texels and baked shade no longer show as a band or pale
  patches). Ball kids, who have no body shape of their own, keep a faint lighter band in strong sun.

## Third-party material

- three.js r187 — MIT (`vendor/three/LICENSE`).
- Player, umpire, ball-kid and crowd figures are built from a Microsoft Rocketbox avatar
  — MIT (`assets/people/LICENSE-Rocketbox.md`). Its textures were reprocessed: clothing is
  stored as neutral folds and coloured per player, skin and face detail deliberately
  smoothed.
- Court and concrete grain are Poly Haven texture scans — CC0 (`assets/surface/*`: a
  rubberised track for acrylic hard courts, baseball infield clay for clay, turf for
  grass, brushed concrete for the stands). Only the grain is used; court colours are the
  sampled venue colours.
- Sky panoramas are Poly Haven "pure sky" HDRIs — CC0. Sun direction and sun-to-sky
  strength were measured from the HDR originals (`js/skies.js`).
- Motion capture in `js/locodata.js` was obtained from mocap.cs.cmu.edu, the CMU Graphics Lab Motion
  Capture Database (created with funding from NSF EIA-0196217); the database is free for any use.
- Type is Outfit — SIL Open Font License (`assets/fonts/OFL-Outfit.txt`). The Barlow files beside
  it are no longer loaded.
- The heads of five further Rocketbox avatars (`assets/people/crowd-src/*`, `assets/people/staff/*`)
  are used for the players' faces — MIT, as above.
- `../audio/*` are the samples the original game already uses.
- The players' body shapes (`assets/people/m04_shapes.bin`) are derived from MakeHuman's base mesh, targets and rig
  weights as shipped in the MPFB 2.0.18 Blender extension (extensions.blender.org/add-ons/mpfb) — CC0 ("All core
  assets are shared under Creative Commons, CC0", static.makehumancommunity.org/about/license.html); MPFB's own code
  is GPL-3.0 and is not used or included (`assets/people/LICENSE-MakeHuman.md`).

## 2026-11-11: each player's record at each event (`js/eventrecords.js`)

- Career win–loss for the twelve players at each of the 30 events, counted from Jeff Sackmann's tennis_atp tour-level
  match files (Tennis Abstract, CC BY-NC-SA 4.0). His GitHub repository was no longer public on 2026-11-11; the files
  came from a public copy that keeps the repository's history (github.com/zvonimir-rezo/tennis_atp; the data files
  were last committed by Sackmann on 2026-05-06), and the 2020 file was checked match for match against a Wayback
  Machine copy of the original.
- The data ends with the 2026 Madrid Masters (early May 2026): Rome 2026 onward is missing, which matters for
  Alcaraz, Sinner and Djokovic. It starts in 1968, so Laver's records are Open era only.
- Only editions on the court the game uses are counted (the file's header gives each event's cut-off, e.g. hard-court
  Australian Opens from 1988); walkovers are left out, retirements and defaults counted.
- Checked against published records: Nadal at Roland Garros 112–4, Federer at Wimbledon 105–14, Djokovic at the
  Australian Open 104–11 (through his 2026 final), Djokovic at Beijing 29–0, Nadal at Monte-Carlo 73–6, Sampras at
  Wimbledon 63–7.
- How the game uses them (`eventRate`/`eventEdge` in `js/data.js`): with at least 6 matches at an event, his win rate
  there is pulled toward his record on its surface by 14 matches' worth of that record (so Nadal's 112–4 at Roland
  Garros counts almost as it stands and a 3–0 debut barely moves him); with fewer, his surface record alone. That rate
  sets his edge in the match (`profileFor`), in simulated draws (`js/season.js`) and on the player cards.

## 2026-11-11: spin by player and court

- Each player's forehand and backhand spin are the measured rates already in `js/playerdata.js` (Hawk-Eye / TennisViz
  reporting) or, for the wooden-racket era, the estimates in `ERA` (`js/data.js`). John Yandell's high-speed filming at
  the 1997 US Open put Sampras and Agassi at about 1800–2000 rpm on the forehand (Sampras over 2000 and Agassi about
  1700 on the backhand, as in the game's data) and Bruguera above 3000, then thought of as a clay-court ball
  (tennisplayer.net: "Modern Tennis: what have we learned" and "The Heavy Ball in Modern Tennis").
- No published source gives average spin or net clearance by surface. The game's assumption, from how the courts play:
  on clay players brush up more and play with more margin (topspin ×1.06, net clearance ×1.08), on grass they flatten
  the ball (×0.93, ×0.88) because a topspin ball sits up there (`SURFACE_PLAY` in `js/data.js`).
- A rally drive's net clearance follows the player's own spin (`resolveStroke` in `js/sim.js`): a flat hitter drives
  low at his own pace and the ball skids, a heavy topspin player keeps his margin and it kicks. Measured in the engine
  (`/tmp` harness, 200 points a match, forehands landing deep): on hard Nadal ~3100 rpm, ball rising to 0.98 m after
  the bounce; Federer ~2500 rpm, 0.90 m; Agassi ~1600 rpm, 0.82 m; Connors ~1100 rpm, 0.81 m. Clay lifts all of them
  to 1.05–1.18 m, grass flattens them to 0.70–0.79 m.

## 2026-11-19: sixteen more players

Murray, Wawrinka, Zverev, Thiem, Medvedev, Tsitsipas, del Potro, Roddick, Kyrgios, Monfils, Becker, Edberg, Ivanišević,
Wilander, Kuerten and Hewitt are playable (`ROSTER` in `js/data.js`, appended so existing ids and saved seasons keep).
- **Statistics** (`js/playerdata.js`; Murray, Zverev, Medvedev, Becker and Edberg were already there as tour opponents):
  career serve and return from Tennis Abstract's tour-level match lists, checked against ATP's figures (atptour.com
  itself sits behind a bot challenge, so where its pages could not be read, archived copies were used); serve speeds
  from Tennis Abstract's Slam radar tables; forehand/backhand speed and spin from ATP/Infosys and Hawk-Eye reporting
  where any exists (Tsitsipas, Thiem, Wawrinka's backhand, Kyrgios's forehand); serve direction, rally length, shot mix,
  net and serve-volley rates and the rally aggression score from the Match Charting Project's career rows. Monfils and
  Wawrinka retired in autumn 2026, so they carry no current rank. Wilander's serve and return tables cover only
  1991-96, past his best (`rep: false`): his prime is estimated in `ERA`, with every speed and spin that no source gives
  (estimates, as before for the older players).
- **Event records** (`js/eventrecords.js`): rebuilt with `tools/event_wl.py` from Sackmann's match files (the original
  repository is no longer public; the copies used are named at the top of that file). The script reproduces the earlier
  table for the eight players inside the old dataset (one Borg match at Barcelona aside).
- **Bodies** (`tools/body_shapes.py`, MPFB 2.0.18 data): judged from freely licensed photographs and listed playing
  weights; Hewitt built at about 72 kg (his listed 77 is from his later years), Kuerten at 80 (rail-thin in his prime).
- **Looks** (`js/looks.js`): colours and kits judged from descriptions of each man's best-known outfits (dated per kit);
  Hewitt's and Kyrgios's caps are worn backwards (`head.back`, new in `js/hair.js`).
- **Faces** (`js/facedata.js`, `assets/people/faces/SOURCES.md`): eleven painted from freely licensed photographs with
  `tools/face_bake.py`, all sixteen. Kuerten (Agência Brasil, CC BY 3.0 BR) and Edberg (a 2012 press portrait, CC BY 3.0)
  are from Commons; the rest from Flickr originals. Most are si.robi's tournament photographs (CC BY-SA 2.0), taken from his Flickr originals because Wikimedia's
  file server was refusing this machine; each is also on Commons. Heads were chosen by matching the face's landmarks and
  skin to every library head; Monfils wears `heads/Male_Adult_12` (cut by `tools/rb_head.py` with its normal map; see 2026-11-20 below), the
  rest share the nine heads already shipped. Eye colours were judged by eye from the photographs, not measured (squinting
  in sunlight, the measured irises came out near black). `face_bake.py` gained `--mouthw` (how far past an open mouth's
  corners the head keeps its own lips) and `--crease` (the size of the shadows closed over at the mouth's corners: the
  default left round dark spots on both cheeks of a bearded, open-mouthed, turned face, mirrored to both sides).
  For the older men only later photographs are freely licensed, so the bake was told to make them younger: Wilander (2010)
  and Edberg (2012) with the lines of age turned down (`--fine`, `--mid`); Becker (2017, bearded; he played clean-shaven)
  painted from the photograph only down to just below the nose, the head's own mouth and chin below that (`--bottom`,
  new). Ivanišević's is from 2010. Becker's Commons picture (1994) was too small to use (a 56-pixel face), and its Flickr
  page now shows a non-commercial licence; it was not used. Flickr photographs were taken only from their
  photographers' own pages under CC BY or CC BY-SA, never from accounts that post other people's pictures as CC0.
- **Strokes**: none has his own tracked clips yet; each borrows the nearest real swing (`DONORS` in `js/figure.js`:
  Federer's for a right-handed one-hander, Djokovic's for a two-hander, Nadal's backhand for Ivanišević). All passed the
  clip check (`tools/scan_new.sh`).
- **Celebrations** (`REACT_STYLE`): from what each is known for; Wawrinka's finger to the temple is a reaction of its own.
- **Wawrinka's temple tap** first put his hand on top of his head, then in his eye: the keys set the wrist at the temple,
  and the tracked arms' elbow for a hand there is out at the side, which lays the forearm across the face. A reaction
  can now say where its free elbow goes (`poleL` in `REACT`) and hold the index finger out (`point`, through
  `Person.setFingers`); the wrist sits in front of the ear below the temple, so the finger reaches up to it. Arm-in-body
  frames for him in the seeded audit went from 0.14% to 0.01%.
- **Replays opened cold.** The replay of a great winner runs its figures unseen through the moments before it, to warm the
  springs that keep an arm out of the body; but the frames it was given started where the replay does, so that run-in never
  ran, and a figure caught mid-swing at the replay's first frame put his arm 11 cm into his stomach (Kuerten, seeded audit,
  147.2 s). The frames now start half a second earlier (`REPLAY_PRE` in `js/game.js`; about 40 ms of work, at the cut).
- **A necklace above the collar.** `heads/Male_Adult_06`'s texture has a cord necklace painted round the base of the neck,
  and it showed above the shirt of every man baked onto that head (Borg, Murray, Thiem, Kuerten). `tools/unneck.py` fills
  dark marks in that band of a face texture from the skin round them; run on those four.
- **Late blocks.** A ball on a player with too little time for a groundstroke is met with a block (the volley's keys). A
  block booked a fifth of a second out still played the keys' full shoulder turn, held from a sixth of a second before
  contact, so the turn came in two or three frames and the hitting arm moved 35-39 degrees a frame (Kuerten, Murray in the
  seeded audit). The racket now goes more nearly straight from where it was to the contact, the turn scaled with the time
  there is (all of it from about 0.38 s), eased in from the frame the contact's time is known; and a stroke counts as late
  from 0.37 s, not 0.30. Kuerten's worst frame went from 39 to 27 degrees.
- **The off hand put back on the handle from the wrong shoulder.** The last pass of every frame re-solves the off arm so its
  palm is on the racket; it laid the arm in the right directions but from the shoulder worked out earlier for the arms,
  which as the trunk turns and bobs at a run is a few centimetres from where the skeleton's shoulder joint now is. The hand
  landed that far off the handle, and the same however often it was solved again. Solved from the joint itself: off hand
  more than 6 cm off the racket while gripping went from 0.42% to 0.03% (Ivanišević) and 0.22% to 0.17% (Nadal), and arm
  inside the trunk fell too (Alcaraz 0.17% to 0.03%, Sinner 0.11% to 0).
- **The racket's turn outside the swing is limited.** Between two poses whose rackets point nearly opposite ways (a
  take-back let go of after the point, for the racket hanging by the side; Nadal's finish over his head, for the run back)
  the blend flipped the racket 35-57 degrees in a frame. Turning it evenly between the two (slerp) only moved the fault: at
  nearly opposite directions the way round jumped from one side to the other between frames. Instead, outside the swing at
  the ball (more than 0.4 s before contact or 0.35 s after; 0.75/0.5 for a serve) the racket turns against the body no
  faster than 20 degrees a frame.
- Late strokes (above): the scaled-down take-back also applies to slices and drop shots booked late, and its span was
  widened (full take-back from about 0.44 s); Tsitsipas' late slice had the upper arm move 31 degrees in a frame.
- **Feet at the change from walking between points to the stance.** Found by photographing every player's worst flagged
  frame of each arm and foot measure (214 moments): Laver, stopping on his mark to serve, had a foot jump 15-27 cm in a
  frame. Causes and fixes in `js/figure.js`:
  - the stance itself (the walk's pose, then the pre-serve or ready pose) was switched in a frame, and a foot still coming
    down from a step was sent straight to its new place: the base pose is now crossfaded over a quarter of a second when
    its kind changes;
  - out of play the body turned to face where he was walking even at a tenth of a metre a second, so as he slowed the body
    and both feet swung round 100 degrees in five frames: out of play the body now turns no faster than 5 degrees a frame;
  - (tried and taken out again: easing the pass that keeps the shins apart to 4 cm a frame. Legs come together faster than
    that in a crossover, and legs passing through each other doubled across the roster.)
  With the first two, Laver's worst foot near the court moved 6 m/s there instead of 16.
- **A sprinting man's body spun as a stroke came on.** Turned side-on to run, a player was let out of that turn in the frame
  the stroke's weight passed 0.3, and the body spun 50 degrees in three frames to face the net; every hand target swung
  round with it, the arm went 11 cm into his chest and the racket was flung over 115 degrees (Ivanišević, a slice at 6.4
  m/s). In play, while a stroke is coming on, the body now turns no faster than 7 degrees a frame.
- Checked across the whole roster after these: each of the 14 seeded pairs audited in full, and every player's worst frame
  of every arm and foot measure photographed from behind and in front (about 220 moments). What is still flagged is a real
  shape (a forehand's finish over the shoulder, a slice's take-back with the free hand on the throat, hands on hips after
  the point, a serve's landing with the back leg kicked up) or a single fast frame at the most violent part of a swing.
- **A foot dragged along the court at the end of a step.** A stepping foot follows the clip's ankle to the step's end; one
  already on the court was dragged with it as that ankle drifted, two or three centimetres a frame (Laver). The step now ends,
  and the foot is set down, once it is down in the last eighth of it. Planted-foot sliding fell for almost every player
  (Kyrgios 2.0% to 1.3%, Medvedev 1.6% to 1.1%) and flat-foot skating to none.
- **The racket's escape from the body or head is capped at 28 degrees a frame** (it was unlimited): Nadal's racket coming
  down past his head after his finish over it was flicked 45 degrees; now 35, with the frame a few centimetres in the hair
  for one frame.
- **A crossing landing.** A foot carried round the planted one by the pass that keeps the shins apart landed where the stride
  had it, not where it was drawn, a third of a metre back across; and the planted foot, now stepping out, was shoved the whole
  way in the frame it lifted (Kuerten, a forehand at contact, seeded audit 20.23 s: both feet jumped about 30 cm in one frame).
  A foot now lands where it was drawn, and a foot only lifting to step out goes out over the first third of its step. Both
  feet there now move at a step's pace (12 cm a frame at most); legs passing through each other across the roster unchanged
  (0.049% to 0.052% on average; Kuerten 0.14% to 0.08%).
- **Feet thrown in a frame: a detector, and four causes.** `tools/steps_audit.mjs` now measures every frame for a foot near the
  court moving faster against the hips than any stride moves one (foot jump), and for a one-frame spike much faster than the
  frames either side (foot pop), and logs each player's chicken-wing frames by phase (WINGBY). Over all 28 players it found:
  - players stopped dead at the arena's limits: running into the back fence at 8 m/s, a player was stopped in a frame. They
    now brake into the limits, and into the rounded corners, over a real stopping distance (`js/sim.js`; no seeded match's
    points changed);
  - the split step's first step (`burst`, 2.3 m/s added in a frame) and those stops reversed or collapsed the stride at once:
    the body now reads the player's velocity as it changes no faster than 18 m/s² (`js/figure.js`; where he is stays the game's);
  - the pass that keeps the shins apart shared its push half and half with both feet up and all to the moving foot with one
    down, and the pass that carries a foot round a planted one worked only while the other was down; as a foot landed or lifted
    the other was thrown up to 33 cm. Both now go by how planted each foot is, eased over a few frames, and a push no longer
    needed is let go of at about 7 cm a frame (taken up at once: a capped push let the shins through each other, tried and
    taken out);
  Across the roster: foot pops 0.033% to 0.022% of frames, foot jumps 0.037% to 0.020% (McEnroe 0.36% to 0.06%), legs passing
  through each other 0.052% to 0.040%, planted-foot sliding 3.56% to 3.64%. The ten largest pops left (10-14 m/s) were
  filmed frame by frame from the broadcast and behind cameras: each is a fast, continuous step (a lunge, a serve's landing
  swing, a crossover), no foot seen to jump.
- **Chicken-wing frames by phase** (Djokovic, Connors, Monfils about 0.9%): after the point with hands on hips or a fist,
  the forehand's finish and recovery over the shoulder, the slice and drop shot's take-back with the free hand on the throat,
  and Connors' and McEnroe's elbow-out forehands; samples of each filmed frame by frame, all natural.
- **A re-read of the contact time under 0.04 s was jumped, not worked off**: the wind-up, and with it both feet, skipped two
  frames (Zverev, a foot thrown 23 cm, seeded audit 114.22 s). Any re-read over half a frame is now worked off like the larger
  ones.
- **Chicken-wing split** (`steps_audit.mjs`): the measure fires on any elbow-out, hand-in pose; it now also counts the frames
  outside the shapes that are meant to look like that (after the point, a stroke's finish or recovery, the free hand on the
  throat in a slice or drop shot's take-back, the free arm folding in through a forehand). Each kind of frame left (forehand
  take-backs with the elbow up and out, Connors's and McEnroe's elbow-out forehands, the free arm in a one-handed backhand)
  was filmed frame by frame from the broadcast and behind cameras: all natural.
- **More feet thrown in a frame, traced to the engine** (each found by tracing a "fast step" the audit flagged, comparing how
  far the source clip moved the foot with how far it was drawn): the rule that keeps the stance a minimum width switched off in
  a frame as a serve began and as a player crossed a third of a metre a second (it counts how sideways he is going only from
  there), moving a foot 10-14 cm (Sinner's toss, Alcaraz, Djokovic): its weight is now eased over a tenth of a second. A serve
  whose waiting pose comes from later in the clip than the toss begins jumped back to the clip's start: now crossfaded over a
  fifth of a second, as one stroke into another is. Foot pops 0.020% to 0.016% of frames. What is left of 10 m/s or more is
  the clip's own motion (McEnroe's serve, the back foot swung through on landing; Medvedev's backhand set-up) or a sudden need
  to keep the shins apart, met at once on purpose (capping that push, even at 11 cm a frame, made legs pass through each other
  half as often again).
- **And three more**: the split step's wider landing (7% of height) was dropped in the frame the hop's time ran out, pulling a
  foot 13 cm in (Becker); the sliding lead foot's reach out (10%) was set and cleared in a frame; both are now eased over about a
  tenth of a second. The rule that carries a moving foot round a planted one read the way the foot was going including its own
  last push, so a foot hovering by the other was pushed one way, read as going that way and pushed back, flicking 15 cm every
  frame (McEnroe standing ready); it now reads the stride's own motion. Foot pops 0.016% to 0.009% of frames. Left at 10 m/s or
  more: the clip's own motion (McEnroe's serve landing, Medvedev's set-up) and a foot that has crossed to the other's side being
  put back on its own through the other leg (McEnroe, Edberg, Borg): moving it out on the side it is on instead only moved the
  jump a frame, because which side it is on flips as it crosses; tried and taken out.
  (Also tried: turning the crossed foot's way out from sideways to fore and aft, chosen once per crossing. It took the three
  crossings' jumps away but tripled legs passing through each other across the roster; taken out.)
- **Crossed feet put back through the other leg** (McEnroe, Edberg, Borg): while a foot is on the other's side, the push that
  puts it back on its own now comes on at most 15 cm a frame (`__crossCap`, 0.08 of height), not in one. At 11 cm a frame legs
  passed through each other 40% more often; at 15 cm, 7% more (0.042% to 0.045%, within the original players' range). Foot pops
  0.009% to 0.007%; the only ones of 9 m/s or more left are the clips' own motion (McEnroe's serve landing, the back foot swung
  through; Medvedev's backhand set-up).
  (Also tried: holding back a push that would make a fast-moving foot's step faster than its own stride's. It took out
  McEnroe's serve-landing spike, but legs passed through each other nearly twice as often across the roster; taken out. Every
  way of slowing the push that keeps the shins apart has cost that.)
- **Feet kept from crossing over in the first place** (`js/figure.js`, before the passes): the sideways gap between the stride's
  feet is held to at least about a tenth of his height by a smooth curve of where the stride puts them, taken up by the feet off
  the court (a foot coming down or lifting takes little of it), and let go of over a tenth of a second around a serve, whose stance
  brings the feet together on purpose. Running across his body the stride crossed one foot over the other, and the passes then put
  it back through the other leg. Across the roster: legs passing through each other 0.045% to 0.016% of frames, feet through each
  other 0.134% to 0.058%, legs crossed 0.085% to 0.055%, foot jumps 0.014% to 0.011%; planted-foot sliding 3.62% to 3.68%.
  (Without the serve fade it threw the feet in Djokovic's and Alcaraz's serve set-ups; without favouring the airborne foot,
  planted feet slid 7% more.)
  And a foot down on the court is never moved by the passes, even while its weight eases in after landing (Djokovic's foot just
  set down slid 25 cm in a frame): planted-foot sliding back to 3.61%, legs through each other 0.020%. The only foot spikes of
  9 m/s or more left across the roster are McEnroe's serve landing (his tracked back-foot swing) and Medvedev's sideways stride.
  (Measured the other way too: the moving foot taking the whole push at once while the other is planted. Across the roster it
  is the same to within noise: legs through each other 0.019% against 0.020%, foot jumps 0.013% against 0.011%. Kept as is.)
  (Tried: the feet-apart limit back on from a quarter of a second after a serve's contact. It took McEnroe's serve-landing
  spike away but his legs came within 9 cm of each other four times as often (0.10% to 0.37%), his back foot swung through
  across the front; taken out.)


## 2026-11-20: walking to serve

- **The walk along the baseline to his mark** (`js/figure.js`): the server moving sideways before his serve kept the
  ready-to-serve pose (ball held up in front, racket across the body) on legs that walked, which looked like a man shuffling
  with his arms set. Now, as his walking speed comes up, the pose blends into the ordinary walk between points: arms down,
  swinging a little, the racket carried in his hitting hand and the ball in the other; standing still at the mark he is back
  in his routine. `__srvStrollOld` for the old one. Lab film: `tools/steps_labsrvwalk.mjs`. Across the roster's audit
  nothing moved beyond noise.

## 2026-11-20: drop shots and short balls

Measured with a stand-in for a person on the classic controls (Space on time, ↓ held for a drop shot on a quarter of
balls, WASD toward the ball 0.4 s after the other man's hit), 400 points at Challenger, against the tour: the Match
Charting Project's 41,400 men's drop shots since 2015 are about half returned, a third winners or forced errors, 18% the
dropper's own misses, and the dropper wins 55% of those points (5 more than his average).

- **The swing the assist times** (`js/human.js`): the assist's legs ran a person up to a drop shot, but his swing was only
  timed to the game's plan if four-fifths of his top speed could get him there; a drop shot he was being run to failed that
  test, the swing was timed to the ball crossing just in front of where he stood, went off at once into the air, and the
  drop shot bounced twice. Now the plan is trusted wherever it says the ball can be reached, as the computer's swing is.
- **Assist footwork runs down short balls** (`js/human.js`): with Assist the game's legs only took over in the last five
  metres. A drop shot is a nine or ten metre run up from the baseline, and by the time a person has seen it and pressed a
  key (three or four tenths of a second) the legs that take over at five metres can no longer make it up: he returned 1 of
  23 of the computer's drop shots. A ball that will be met more than three metres in front of him is now the game's to run
  down from his reaction time, as with Auto: 48-60% returned.
- **Drop shots from the back are played flatter** (`js/sim.js`): sent up at the same 30-36° from the baseline as from the
  service line, the ball looped and sat up a metre and a half after its bounce. Now up to 0.25 rad lower from twelve metres
  back, but never lower than clears the net by 30 cm, so a usual miss still finds the tape some of the time.
- **A drop shot is read later** (`js/ai.js`): it starts out looking like the drive it is not. The computer read it like any
  other ball and returned 84% of the baseline drop shots it was sent. Now he sees it for what it is 0.02-0.22 s later than a
  drive (random each time, longer against better hands, 0.12 s on average). Yours against him: 58% returned, 29% outright,
  13% your own errors, and you win 60% of those points against 58% overall (before: 86% returned, 5% outright, 37% of points).
  The computer against the computer is now on the strong side (40-46% returned) as he picks his moments better than the
  stand-in does.
- Across the roster's animation audit (one seeded match per pair, human against computer): nothing else moved beyond noise;
  one more crossover in a forehand's finish after the assist ran Djokovic in to a short ball (the feet shuffling past each
  other at a standstill, the kind the crossover work is about).
- Switches for before/after: `__canMakeOld`, `__shortRunOld`, `__dropElOld`, `__dropRead=0`.

## 2026-11-20: heads from behind, caps, the walk between points

- **Monfils had no back to his head** (`assets/people/heads/Male_Adult_12.glb`, `js/facedata.js`): the library man he was
  painted on, Male_Adult_18, keeps his skull and scalp in the body's material, not the head's, so the head cut out of him was
  a face and nothing behind it: from behind or the side the hair floated over an open shell and the inside of the face showed.
  Every head now shipped was checked for a whole skull (depth back to about -0.1 m and the crown up to 1.8 m). He is painted
  again on Male_Adult_12 (the nearest dark-skinned head with a whole skull by the same landmark and skin measure: shape
  0.046, colour difference 8, against 0.037 and 7), cut with its normal map from the Rocketbox repository's own files. The
  old head file is no longer used and is removed.
- **Kyrgios's back of the head** (`js/looks.js`): hair a third of a centimetre at the sides and half at the back faded the
  head's own painted hair to bare skin in a band right under his cap, with the cap's ragged edge of strands over it; from the
  behind-the-player camera it read as a bald ring. 1 cm at the sides and 1.4 at the back: short dark hair under the cap,
  thinning to skin only at the neck, as a fade does.
- **Caps** (`js/hair.js`): locks rooted just inside a cap's edge stand two centimetres off the scalp and the cap only one,
  and came out through its crown as dark flecks above the peak (Kyrgios, Hewitt, Roddick, Sinner): no lock grows under a cap
  now, and the hair's own surface is cut off a couple of degrees below the cap's line. `__capCutOld` for the old.
- **The walk between points** (`js/figure.js`): the hips between points are carried on the planted leg, and that leg was
  held to 0.982 of its length: the knee stayed bent about twenty degrees under the weight, and every player walked back to
  the line on bent knees, like a man creeping (the filmed walk itself is on 21-30 degree knees throughout). At 0.995 the knee
  under the weight is about seven degrees, the hips rising and falling over it as the other foot lands ahead. The arms swing
  as the filmed walker's do, each against the opposite leg, a little wider than his (he swings about a sixth of a metre front
  to back), the racket hand less than the free one: driven by a sine of the step's clock they had kept their own time. Old:
  `__walkStraightOld`, `__strollArmOld`.
- (Tried and taken out: leaving a stroke's own crossed feet alone. The stance-widening and the soft separation measure across
  the body's frame, which does not turn with the hips in a stroke, so a closed-stance backhand reads as a deep crossing and
  both pull the feet back toward "their" sides, in Djokovic's backhand finish through each other. Left alone in or just out of
  a stroke, that finish was clean, but the figure's hips do not turn as far as the tracked player's did, the legs stood in an
  X instead: across six pairs McEnroe's legs crossed by more than 8 cm in 61 frames against none, Alcaraz's 9 against 3, and
  the feet then swapped sides through each other on the way out of it. The crossing belongs to the crossover-step work.)
- **Kits for the sixteen** (`js/looks.js`): they had an ordinary kit and Wimbledon whites (Zverev and Roddick one more), six of
  the ordinary ones plain white, so at most events they looked alike. Each now has the five the original twelve have
  (ordinary events, and each major), each the outfit he wore at that event in a dated year, from fashion round-ups of the
  event, the makers' own announcements, retailer listings of the player's match kit, auction descriptions, contemporary
  reports and, for some, the colours read off event photographs. Low-confidence pieces, as the research had them: Murray's
  ordinary and Australian kits (colours from text, panel layout guessed), Wawrinka's ordinary kit layout, Thiem's ordinary kit
  (inferred from the range), Tsitsipas's ordinary and US kits, del Potro's US trim, Roddick's except Roland Garros and
  Wimbledon, Wilander's Roland Garros, Kuerten's US shorts, Hewitt's ordinary and Roland Garros kits. Kuerten's Roland Garros
  kit is his 1997 blue-and-yellow one (his 2000 and 2001 ones were white); Hewitt won Wimbledon 2002 in a headband, not his
  cap; Wawrinka's Roland Garros is the 2015 grey-and-red polo with the checked shorts.
  Kyrgios plays in a basketball singlet over a tee (red over black at Miami and Melbourne 2022, the same season's kit; his
  own navy jersey with red borders at the US Open), bare-headed early in 2022 and in a white cap worn backwards from the grass
  on (the red cap at Wimbledon was only for walking on). Becker's ordinary, Australian and Roland Garros kits, and Edberg's
  ordinary, Roland Garros and US kits, are placeholders drawn from their makers' documented colours for them that season (no
  description of those shirts was found); Becker's Wimbledon 1989 colours and US Open sleeve stripe, and Edberg's 1990
  Australian Open shirt (white below, marbled grey with lightning streaks above), are from descriptions of those events.

## 2026-11-20 (later): the walk, filmed in a match

"the walking animation still looks terrible ... the arms hang back and the steps look really unnatural". Filmed in a
real match (`tools/steps_walkfilm.mjs`: the human server walking along his baseline, every few frames from three sides,
with DBG=1 the speed, knee angles, hands and blend weights), not in the pose lab, whose samples each start from a standstill:

- **The steps** (`js/motion.js`): at the 0.8 m/s of a walk along the line, the gait clock was held to a jog's least rate of
  1.6 cycles a second (over three steps a second, quarter-metre steps) while the legs reached for the filmed walker's full
  stride, and below 3 m/s the feet were lifted to under half: a quick shuffle with the feet scraping the court, the planted
  feet forcing catch-up steps. Walking upright (between points, to his mark), the stride now shortens with the pace (about
  four-fifths at 0.8 m/s, about one and a half steps a second), the legs' reach is drawn in to match so the feet still cover
  the ground, the least rate is a walker's, and the walk keeps its own lift. `__walkStrideOld` for the old.
- **The arms** (`js/figure.js`, `stroll`): both hands hung about the line of the hips and swung as far back as forward, so
  half of every step they were behind him and the racket trailed behind; they now hang a little in front, where a relaxed arm
  hangs, and the racket hand swings back half as far as forward. `__strollFwdOld`.
- **The ball** (`js/figure.js`, `js/game.js`): his routine at the line ran on the phase's clock while he walked, so the ball
  was bounced in mid-stride and dropped to the court at his feet. His routine now waits for him to stop (`Figure.ritT`),
  then starts again; walking, he holds the ball. `__ritWalkOld`.

## 2026-11-20: legs crossing in an X

The last of the crossovers, traced at Djokovic's 103 s: the feet were apart (a third of a metre) and on their own sides
across the body's frame, but the stroke's clip, coming in, had turned his hips more than ninety degrees, so across his own
hips the feet were crossed by 43 cm and each leg ran from its hip to a foot on the other side: an X. Before that, three things
were tried and taken out: the stance-widening and soft separation left alone in strokes (above), a guard that moved the foot
in the air clear of the other shin (the legs closed faster than it could move a foot, and it was knees and thighs that met),
and a rule sending a crossing foot round in front of the other leg (measured against hips turned that far, "in front" was
sideways). What works (`js/figure.js`, where the pelvis is oriented): the hips are never turned more than about eighty degrees
from the line between the feet, about as far as hips turn over planted feet, and not at all when the feet are too close
together for their line to mean much. Across the roster (seeded audit, one match per pair): legs crossed by more than 8 cm
0.085% of frames to 0.003%, legs through each other 0.035% to 0.016%, knees bent backwards 0.206% to 0.196%, foot jumps
0.013% to 0.011%; nothing else moved. `__hipClampOld`, `__hipClampDeg`.
(Also tried after it: keeping two feet that are both off the court at once at least 14 cm apart, the higher one moved. Feet
through each other fell a little in three pairs (13 to 9, 18 to 15) but foot pops and jumps rose, the push being taken up in a
frame; taken out.) Eased in at a step's pace instead (1 m/s), it did next to nothing (feet through each other 18 to 15 in one pair, none
elsewhere) and still added a pop; also taken out. What is left of the feet passing close is a foot landing while the other is
still in the air, both in a stroke's finish, for two or three frames.
- The second leg's knee, turned out round its own hip-to-ankle line to keep the shins apart, may now turn as far as ninety
  degrees at up to nine a frame (it was sixty, at six): a stroke's finish with both feet off the court still brought the shins
  together. Legs through each other 0.016% to 0.014% across the roster, nothing else moved. `__legSepNarrowOld`.
- A hand across the body is put in front of the trunk out to 22 cm past its side, not 10: a two-hander's take-back with the
  hands by the other hip just outside the old limit had the upper arm across the inside of the chest (Murray, the elbow at
  the breastbone). Arm inside the trunk 0.017% to 0.014% across the roster (Murray 8 frames to 3); one frame more of
  Agassi's off hand off the handle, one fewer chicken wing. `__frontWide=0.1` for the old.
- The elbow's way out of the trunk is eased about three times quicker within a tenth of a second of contact, where the arm
  is moving at twenty metres a second: eased as everywhere else, the elbow went through the side of the chest on the swing at
  the ball (Medvedev, Zverev). Arm inside the trunk 0.014% to 0.012%; one frame more of Ivanisevic's arm turning fast near
  contact, one fewer of McEnroe's free arm in a smash finish. `__elbowFastOld`.

## 2026-11-20 (evening): runs to far balls, drop shots, the broadcast camera, the walk's stride

- **The broadcast camera at Wimbledon after a change of ends** (`js/game.js`): the stadium is turned round for a change of
  ends, and Wimbledon's far upper tier front (8.5 m up, 26 m out) then stood just under the camera's line: a dark band across
  the middle of the picture where the net should be. The crane that lifted the camera over the stands for a player gone deep
  now also keeps the middle of the court (just past the net, the net, both baselines) and the near player in view at all
  times; checked at every venue from both ends, only Wimbledon turned round needed it (the camera goes to 13.2 m there).
  `__craneCourtOld`.
- **Drop shots shown as drop shots** (`js/human.js`): with the classic controls the shot is the player's (↓ held as he
  swings) only as he lets go, a sixth of a second before contact, and by then the figure keeps the swing it has begun: every
  drop shot and lob of his was drawn as the drive the game had prepared. The prepared stroke now takes the kind of the key he
  is holding from the start of the wind-up (judged with the ball's speed after its bounce, as it will be when he meets it).
  `__ownKindOld`.
- **Running to a ball far from him** (`js/figure.js`): a stroke is booked nine-tenths of a second ahead, and its take-back
  came in at once and held the body facing the net: he shuffled sideways at a sprint with the racket out. Running hard to a
  ball over half a second away he now runs, the take-back eased in over the last steps (`__prepLateOld`); he turns and runs
  from 2.5 m/s, not 3.2, and pumps his arms from 3 m/s, not 3.8, sooner after setting off (`__turnOld`, `__pumpOld`); and the
  racket is carried low and pointing ahead, the racket arm swinging less than the free one, instead of held up at the chest
  and swung up behind his head (`__runCarryOld`).
- **The walk's stride**: shortened with the pace, the walk along the line was a tiptoe of steps a fifth of a metre long on
  bent knees. The filmed walker's own stride is kept, played at a walker's slower rate. `__walkKSa` (0.45 for the shortened).
- The hips' clamp against the line of the feet now counts the turn the shoulders' twist adds to the hips (it was added after
  the clamp): a drop shot's take-back, its twist large, still turned the hips past the feet and crossed del Potro's legs (14
  frames) and Kyrgios's (5). Both to none, nothing else moved in four pairs. `__hipTwLateOld`.

## 2026-11-20 (night): the walk from the players' own footage, moving with the arrows, the elbow in a wide forehand

- **The walk between points is now the players' own** (`js/locodata.js` clip `walk`, `tools/walk_footage.py`,
  `tools/walk_into_loco.py`). It was a motion-capture lab walk (CMU 16_15). Court-level footage of tour players walking back
  to the line was scanned with the pose tracker (`tools/track.py --big`, 10 Hz), the stretches where a player crosses the
  picture side-on at a walking pace with the nose leading picked out, tracked again at 30 Hz, cut at each left heel strike
  into strides, and the strides at a walking pace (0.7-1.6 m/s) that agree averaged per phase: 29 strides from five videos
  (Djokovic and Medvedev, Kyrgios and Dzumhur, Alcaraz and Ruud, Sinner and his practice partner, Fognini and Wawrinka;
  the tracker follows whichever of the two is walking, all right-handed). Measured: a stride of 1.07 s at 1.12 m/s (the
  lab walker's 1.17 s at 1.22 m/s), the standing knee at 173°, the hips rising and falling 5 cm, the racket elbow bent 27°
  and the free elbow 42° (a lab walker's 20-30°), the racket hand carried a little in front of the thigh.
  - The way he walks is read from the feet, not the hips: the axis the ankles swing along about the hips, signed by the
    swinging foot travelling forward. The tracker's line through the hips is unsure of its depth and turned with it.
  - What the footage cannot say is set, not guessed: side-on, a foot's distance across the body is the tracker's guess at
    depth (0.26-0.28 m step width), so the legs' sideways places are scaled to a 14 cm step width; the elbows are bent as
    much as the picture shows side-on (the free elbow 42° in the picture, 56° in the 3D guess); each arm is taken from the
    strides where it was clearly visible; the far shoulder, guessed 10 cm low, is levelled with the near one.
- **The hands while strolling** come from that cycle at the legs' phase (`stroll` in `js/figure.js`; a left-hander's half a
  stride on, so his racket arm too swings with the other leg); the elbows go back as the players' do, not out to the side
  (from behind, the free hand at the waist was a hand on the hip); the racket hangs head down. `__strollClipOld`,
  `__strollElbOld`.
- **Faster than the filmed walkers** (the game walks back at about 1.45 m/s) the stride lengthens, as a person's does,
  instead of the same steps going quicker (stride ∝ speed^0.6, at most a quarter longer; it was 130 steps a minute).
  `__walkLongOld`.
- **Moved with the arrows** (`js/figure.js`; checked with `tools/steps_manfilm.mjs` and `MANUAL=1|2` in
  `tools/steps_audit.mjs`, which moves the human with the arrows as a person does: eight ways, a reaction time late,
  overshooting, back to the middle after each shot). The turn to run waited for a steady 0.14 s above 2.5 m/s, and a person
  changes arrow every third of a second: he went sideways and back at 3-4 m/s square to the net, the legs a jumping jack with
  both feet off the court. He now turns on speed alone from 3 m/s (it was 4.2), and going straight back faster than 2.6 m/s
  he drops a foot back and turns side-on to run (to his forehand side unless already going across). `__keyTurnOld`.
  - Tried and taken out: under a stroke's take-back (which holds the body square to the net) the gait chosen against a leg
    heading turned toward the run, so a run round the ball is a running stride and not a gallop. It looked right in the film
    of the human, but across four pairs legs through each other went from 0.005% to 0.022% (computer strokes taken at
    3.5-5.8 m/s), with the whole lower body committed to the turn as well. The gallop under a held take-back at speed remains.
- **The elbow in a wide forehand** (`js/figure.js`): the clip's elbow was followed as measured against the clip's own arm,
  from shoulder to the clip's hand; where the stroke had brought the hand in front of the stomach and the clip's was still
  out at the side, that elbow lay on the inside of this arm and went through the stomach (Zverev, Medvedev, Kyrgios,
  Monfils, Becker, Kuerten, del Potro, all a drive's forward swing). It is now aimed from the middle of this arm at where the
  clip's elbow is. Arm inside the trunk 0.012% to 0.003% across the roster, none deeper than 8 cm. `__elClipOld`.
- **Footage for the walk** (YouTube, analysed locally to derive joint motion only; nothing of it is kept in or shipped with
  the game): "Djokovic vs. Medvedev | 2026 Indian Wells Court Level Practice Match | 4K" (watch?v=NsZUdm4O94o); "Nick
  Kyrgios v. Damir Dzumhur (Court Level View) 60FPS HD | Miami Open 2017 R2" (watch?v=KPQbQOHFlKs); "Carlos Alcaraz & Casper
  Ruud Court Level Practice | Pointplay 2024" (watch?v=EjHCdOpGBgc); "Jannik Sinner Returns to Indian Wells | 2026 Court
  Level Practice Match | 4K" (watch?v=B2gE3TZSCB8); "[TRAINING] Fognini - Wawrinka (COURT LEVEL VIEW)" (watch?v=9BHPLO-4PM0).
  Also scanned, no walking stride kept: "Roland-Garros 2019 : Federer - Schwartzman practice points" (watch?v=vkGwyke5jDU).
- **Sideways at speed** (`js/figure.js`, `js/ai.js`, `js/motion.js`; the audit now counts "sideways gallop": on the side
  shuffle faster than 2.8 m/s with both feet off the court). It is 2-4.5% of every player's frames, mostly the take-back,
  finish or recovery of a stroke holding the body square while he still runs. Three changes kept, each checked not to add
  legs through each other: a run the game's legs know to be more than a few metres long turns as it sets off (`goDist` from
  `goTo`, animation only; `__farTurnOld`); the gait follows the body's turn faster above 3 m/s (`__gaitRateOld`); running
  faster than 2.8 m/s toward the side a stroke is played on, more than 0.3 s before contact, or from 0.15 s after it, the run's
  turn overrides the stroke's hold and the turn-rate limit brings him round into the swing (`__runHoldOld`). Gallop frames
  fell by about a tenth to a fifth. Tried and taken out, each adding legs through each other (0.002% to 0.010-0.012%): turning
  from 2.6 m/s, and never holding square at a sprint (over 4.3 m/s). Looked at from the broadcast and behind cameras, the
  computer's counted gallops at about 3 m/s are side steps out of a finish into a turn and read as such; the one that reads
  as a jumping jack is the run round the ball with an arrow held, at 3-3.6 m/s, still there.

## 2026-11-21: a standard walk, played as it is; menus that do not freeze; drop shots you call; replays

- **The walk back between points is a standard motion-capture walk, played as it is** (`js/locodata.js` clip `stroll`,
  `js/motion.js`, `js/figure.js`). "The new ones are trash too": the lab walk and the footage walk had both gone through the
  footwork kept for play, and it was that as much as the data. The stroll is CMU 35_01, an ordinary walk at 1.41 m/s (the game
  strolls at about 1.45; the old 16_15's knee never straightened past 158 degrees), raised so its flat ankle is at `ANKLE_H`.
  It is its own clip, used only on the walk back (`strollK`: the 'between' phase, walking, not running, not to serve); play
  keeps its slowest gait (`walk`) and its footwork as they were. Strolling:
  - the feet are the walk's own ankles, not play's locks and catch-up steps (run through those, the walker's planted foot was
    held a beat long, the hips sank to reach it and a short low step of the game's own took over); a foot that comes down once
    he is walking stays where it landed until the walk lifts it (followed exactly, the walker's heel still travelling as it
    touched down slid it 10 cm), let go of whenever he is not strolling; play's locks are kept where the feet are, so play takes
    over cleanly; the soft separation and the pass-around are off;
  - the cycle runs at the pace its planted foot covers the ground (its hips rock within each step: timed by their average speed
    it ran 8% slow) and at the figure's size (`walkScale`, the legs about 0.86 of the clip's);
  - the hips stay as high as the planted legs allow counting a foot up on its toes behind him (left out, the hips rode too
    high for it to be reached as it pushed off, and it was dragged along).
  Measured on a walk back: one foot always down, the standing knee 161-173 degrees, the hips rising and falling 4-5 cm, a planted
  foot still. Flags `__strollFaithOld`, `__strollPlantOld`, `__walkScaleOld`, `__strollToeOld`, `__strollClipOld2`.
  Got wrong on the way (each caught by the roster audit): switching the clip by being upright (that includes waiting to serve
  and serving: under play's footwork the new clip's feet jumped), switching on as the point ended while still running, and a
  plant left set from the last walk back (the next began by dragging a foot half a metre).
- **The walk, again** ("the elbows invert and each step looks like two"): the stroll clip is now kept in a frame moving at its
  steady speed (`stroll`, built with its root motion: its hips surge 4 cm within each step and its planted foot is still on the
  court with the body moving evenly), so the feet follow it exactly with no plant and no catch-up: the plant's catch-up as a
  foot lifted was the second step. One movement per foot per stride now. The walk-to-jog blend is measured from the stroll's
  own speed (from the play walk's, 7% of the jog's stride came in at the stroll's pace). The elbows: the walk's arms are nearly
  straight, and the rules made for a stroke's arms let the elbow come round in front as the hand swung back, the forearm folded
  backwards; strolling, the elbow is kept behind the line from shoulder to hand, applied last and every frame (applied only when
  it had strayed, it fought the arm's easing and saw-toothed). And the racket is carried head forward and down: hung straight
  down, its head reached the court, the rule that keeps it off the court lifted the hand thirty centimetres and the racket arm
  walked bent and flared, from behind an elbow turned out the wrong way. Measured on a walk back: both elbows fold forward
  throughout (free 18-31 degrees, racket arm 50-57), steady. Flags `__strollElbBackOld`, `__strollRkOld`; the plant and the
  foot-timed stride stay available as `__strollPlantOn`, `__strollFootTimeOn`.
- **The run round the ball**: holding sideways speed away from a prepared stroke to a side-step's 2.9 m/s (`js/sim.js`) was
  tried twice and taken out: even for the player alone, eased in, it did not reduce the gallop measured with the arrows
  (3.9% of frames either way) and added legs through each other. The gallop there remains.
- **Menu portraits are baked** (`tools/steps_bakeportraits.mjs` → `assets/portraits/<name>-<kit>.webp`, `js/portraitfiles.js`,
  140 pictures, 3 MB). Opening the player list the first time drew every card's portrait in the event's kit there and then:
  a figure built, posed for 120 frames and read back, for each, 6.7 s of a frozen page. Now the menus load pictures (the list
  opens in 3 ms), the figure for drawing any portrait not baked is loaded behind the menu, and those are drawn a few a frame
  (`pumpFaces`). The loading screen no longer waits for 28 portraits either. Bake again whenever a look, kit, face or body
  changes. `__faceSyncOld` for the old way.
- **Drop shots called with ↓ as he swings are shown as drop shots** (`js/figure.js`, `js/human.js`): the shot shown was
  locked a third of a second before the ball, and ↓ pressed with the swing comes later, so 11 of 15 such drops were swung as
  drives. A change to a drop or a lob is now shown until a tenth of a second before contact, eased across from the swing
  begun. With ↓ pressed only at the swing: 12 of 14 shown as drops (one as a slice, one pressed too late). And a drop the
  wind-up already showed stays a drop when the press judges the ball's speed again. `__dkLateOld`.
- **Replays no longer open on a yellow streak** (`js/game.js`): the ball's streak was drawn through the last places it had in
  the live point. It starts afresh as a replay begins and ends. `__repStreakOld`.
- **On a Mac**: checked in WebKit 26 (Safari's engine, run here from Playwright with three Ubuntu libraries unpacked into its
  own folder, no system changes): the page loads, the menu opens, the 3D scene renders (WebGL 2), portraits load (WebP), no
  console errors. Headless WebKit's screenshots of WebGL come out black; read the pixels instead.
- The clip's elbow is followed only as far as it stands off this arm's line (Becker's elbow through his chest). `__elOffOld`.
- Tools: `tools/roster_audit.sh OUT [FLAGS]`, `tools/audit_cmp.py A B`, `tools/steps_menuperf.mjs` (menu open time, list
  opening block, frames after), `tools/steps_droptest.mjs` (called drops: kind played against kind shown).
- **The walk along the line to serve** ("the walk side to side before the serve is still fucked"). Measured every frame by
  `tools/steps_srvwalkprobe.mjs` (six players, the arrows held in a script of long walks, short taps, stops and reversals both
  ways): the walk there was play's footwork on the footage walk, catch-up steps and all; given the stroll as it was, the feet
  slid (the lower toe, always a planted contact in a walk, moved at a median 0.45 m/s against 0.11 in the clip itself). Causes
  and fixes, each behind a flag:
  - the stroll covers walking to serve too, and walking slower than the clip the steps get shorter (to about three quarters at
    0.8 m/s), not slower (`__srvStrollFaithOld`, `__strollShortOld`);
  - the walk is laid out the way he is going, not the way he faces, and the body turns over it: turning a quarter turn to walk
    along the line, the walk's feet laid out the way he faced were swept round with him, the planted one at 2-4 m/s
    (`__strollTravelOld`); turned through the angle between, and not at all stepping back facing the net (that stays play's
    backpedal: a short step back after a point, the walk laid out the opposite way to his facing spun half round under him in a
    sixth of a second, the shins through each other; `__strollBackOld`);
  - a foot the walk sets down stays where it is until the walk lifts it, judged by its height and its speed in the walk's own
    frame (so the heel, still travelling as it touches, comes to rest first); what it and the walk drift apart by is taken up
    over the next swing, in the air; and the walk starts from where the feet are (`__strollLockOld`);
  - setting off sideways from a standstill, the foot on the side he is going steps first (the far foot went first half the
    time, across the near one, the shins through each other) (`__walkLeadOld`);
  - the foot is pitched as the walker's was, against his own flat foot, so he lands on his heel and rolls onto the sole (laid
    flat whenever it was near the court, the heel still travelling as it came down was drawn as a flat shoe sliding a hand's
    length) (`__strollPitchOld`);
  - play's locks are set to the feet only once the walk has all but taken over (at half, a step under way was cut off and the
    foot jumped 15 cm in a frame) (`__strollResetOld`).
  Six players, before → after: legs through each other 0-6 → 0-1 frames, foot pops 0-1 → 0-1, the lower toe's median speed
  walking 0.21-0.24 → 0.15-0.19 m/s; the stops settle in 1-3 steps either way, with fewer frames of the shoes together.
  Between points the same changes take the planted toe's median from 0.15-0.18 to 0.09-0.11 m/s (p90 0.4 → 0.3-0.37).
  `tools/steps_strollskate.mjs` measures that; `tools/steps_walkfilm.mjs` now takes VIEWS (low: the feet at shin height) and FLAGS.
- **Nadal's forehand finished over his head** (`lassoFinish` in `js/motion.js`, the racket in `js/figure.js`): his reverse
  (buggy-whip) finish, on the run and moving in, came out as the arm straight up half a metre out to the side with the racket
  pointing away from his head, like a man hailing a taxi. Those clips were filmed side-on, so how far out the hand was could
  not be seen, and the racket's angle is not tracked at all. Where a forehand's hand rises above the head after contact, the
  hand is brought over the top of the head (a little behind it), the elbow folded at forehead height in front and out on the
  hitting side, and the racket hung behind his head pointing back, as the Cincinnati 2013 practice footage (Essential Tennis)
  has it. Finishes across the body are untouched. `__lassoOld`.
- **The racket raised to the crowd and the fist pump, redone** (`REACT_ANIM.raise`, `.fist`; "look terrible"). The raise was the
  forearm folded up in front of the face, the racket out of sight, the free hand on the hip with the elbow out: now the arm goes
  up nearly straight over the shoulder, strings to the crowd, sways once, the other arm hanging loose. The fist pump was a fist
  held out at the stomach, forearm level, moving a hand's breadth: now the fist comes up to the chin with the elbow down by the
  ribs and is pulled hard to the front of the hip, the trunk crunching into it, twice (in 0.12 s; its first pump had been lost in
  the 0.25 s fade-in). Two things had flattened every reaction's hands: the hanging-arm rule still letting go on its own spring
  (8 cm off a raised hand) and the arms' loosening after the rally (4 cm); both now give way with the reaction's weight.
  `__raiseOld`, `__fistOld` (before load), `__reactHangOld`. `tools/steps_reactprobe.mjs` prints the reaction's hand targets
  against the drawn hands; `tools/steps_film.mjs` takes RSEED (the same strokes every run).
- **The racket in a celebration hangs relaxed** (`HANG`, `REACT_ANIM.vamos`; "the racket is held weirdly during the
  celebrations"): the racket hand of the fist pump, the calm nod, the fist in the air and the end of every reaction held it out
  from the leg and half way to level, 45 degrees forward and tipped out, a cocked wrist; it now hangs nearly upright down the
  leg, its head a little forward. In the vamos it pointed straight out in front at waist height like a sword; now down and
  forward. `__hangOld` (before load).
- **Running, and moving with the arrows (Manual footwork)** ("absolutely terrible and unnatural", "the running animation in general
  is terrible even when going to the net": sideways running, sliding feet, stiff posture, spinning). Found with a new movement
  lab, `tools/steps_labmove.mjs` (the player in a live point with no ball, moved by an arrow script with the sim's own
  acceleration and braking, filmed from behind, the side or the broadcast angle, logging gait, yaw and hand swing):
  - the arms: a sprint at 6 m/s was run with the racket held out in front and the free hand a hand's breadth in front of the
    stomach, both hands swinging 5-7 cm: the free hand was kept 22 cm in front of the shoulders and drawn in toward the middle
    (for a hanging arm that had looked like a hand on the hip), and the last rule, keeping hands out of the trunk with a 5 cm
    margin, sent any hand behind the middle of him forward again. Running, the free hand now swings back past the hip at the
    width of the shoulder (from 26 cm in front to just behind the hip), the trunk margin a centimetre for it; the racket arm
    carries a little more of the run's swing (0.42 of it, was 0.32). The audit's "free hand on hip while running" (hand back by
    the hip, elbow back and out 5 cm) now counts the backswing, 0.16% → 1.9%; from behind the elbows stay in by the body.
    `__armSwingOld`;
  - the pump starts at 2 m/s (full by 3.4; was 3 and 4.4), and running to the net the racket is only brought up in front
    inside the service line (it was from the baseline on). `__pump2Old`;
  - at a jog with the racket in front, the shoulders turn against the hips with each stride and the hands ride with them (they
    were held dead still over running legs). `__pump2Old`;
  - going forward and across at once from 1.5 m/s, he turns into the diagonal and runs it (square to the net below 2.5 m/s the
    legs played half a run and half a shuffle). `__diagTurnOld`;
  - with the arrows pointing at where the ball is to be met, the figure is told how far that is, as Auto's legs tell it, so a
    long run starts with a turn. `__manGoOld` (in `js/human.js`).
  Still to do: a run round the ball for a forehand is shuffled sideways square to the net with the racket back, on every
  footwork setting; the turn to run and back again on short arrow presses; and the feet at quick reversals.
  `tools/steps_audit.mjs` counts the run-shuffle blend (by direction, stroke and turn).
  - pulling up out of a run he turned for, he stays turned the way he is going until nearly stopped (under about 1.5 m/s) and comes
    round to the net with his last steps; let go of under 2.5 m/s, the body swung back to the net while still going sideways at
    three, and every run ended in a sideways slide into a wide stance. `__yawHoldOld`;
  - with the arrows and no ball to run to, he turns to run only after keeping the same way for about 0.4 s (or at over 4 m/s):
    a half-second press turned him side-on as he let go and straight back, a spin on every short press. `__commitOld`.
  Measured in the movement lab: frames moving on two planted feet 11% → 4.5%; presses of 0.35-0.5 s stay shuffles, a 0.9 s run
  turns at 0.6 s and pulls up turned. The roster audit (three pairs, one with Manual footwork): legs through each other 0.033% →
  0.032%, feet through each other 0.082% → 0.065%, arm in trunk 0.005% → 0.002%.
- **Two-handed backhands finish over the far shoulder** (`twoHandWrap` in `js/motion.js`, the racket in `js/figure.js`): Nadal's
  finished with both hands in the middle in front of his face and the racket standing straight up (side-on clips: how far across
  the hands were was not seen). From when the hands come up to the shoulders after contact (in a match the whole swing is moved
  up to a higher ball), they are taken across to the far shoulder, 20 cm over and 20 cm up, elbows up in front, the racket up and
  back over that shoulder behind the head, as the Cincinnati 2013 footage has him. Applies to every two-hander whose clip finishes
  that high (most of Nadal's and Djokovic's). The audit's "chicken wing" (an elbow out with the forearm folded in) now counts the
  top arm folded across the chest in that finish, 0.46% → 0.65%; arm in trunk unchanged. `__bhWrapOld`.
- Nadal's serve was checked against the footage from the side and behind (trophy, racket drop, contact, landing) and left as is.
- **The run round the ball**: running away from the side he will hit on, the take-back now waits for the last 0.3 s (it waited
  for the last 0.5 s only on a run to the stroke's own side), so a long run-around is run and pivoted out of. Most run-arounds
  last about 0.6 s, too short to turn and turn back; those stay a closed-stance side step into a wide last step, which is what a
  player does in that time. Audit (three pairs): legs through each other 0.033% → 0.028%, sideways gallop 2.83% → 2.75%, arm in
  trunk 0.017% → 0.023%. `__runAroundOld`.
- **Settled by the full roster audit** (14 pairs, against this morning's): the running free arm's trunk margin is 3 cm (at 1.2 the
  upper arm grazed the side at a sprint, Medvedev 0.16% of frames), so it swings back to the hip but not past it; the racket
  arm's share of the run's swing is back to 0.32; the run-around's late take-back is off (`__runAroundOn`: begun that late it
  swung the racket arm through the body, McEnroe's lob); the celebration's hanging hand is back out from the hip (the racket
  angle stays relaxed). Roster: foot pops 0.014% → 0.005%, legs through each other 0.014% → 0.009%, feet through each other
  0.085% → 0.075%, sideways gallop 2.82% → 2.71%, arm in trunk 0.003% → 0.008% (the rest: serve and forehand finishes as before,
  and an overhead prepared as a point ended, McEnroe backing off the net, the free arm 7.7 cm in for two frames).
- **A forehand's free arm folds in front of the chest** (`js/figure.js`, `__foldCapOld`): through contact and the finish the free
  wrist is kept a little under the shoulders and at least 24 cm in front of the chest. A drive shown for a late block (del Potro,
  102.4 s of the audit match) folded it up at the neck, forearm across the throat, ten centimetres into the chest for five frames;
  gone (his arm in trunk 0.07% → 0.01%). Federer's finishes, filmed from the front, unchanged to the eye (the free forearm across
  the stomach under the racket).
- **Every player looked at, broadcast and behind** (`tools/steps_rosterfilm.mjs`: a seeded computer match per pair, every 0.7 s of
  live play the game's broadcast frame cropped about each player and a camera 3.4 m behind him; 28 players x 12 shots each way).
  No arm or foot error seen. The one thing that stands out in stills is the walk back's swinging foot early in its swing, heel up
  and sole to the camera (Becker, Zverev, Kyrgios): it is the captured walk's own (knee bent, shank back, ankle neutral).
- The audit's remaining "arm inside trunk" frames, photographed (`steps_audit.mjs PENPIC=0.05` lowers the picture threshold from
  8 cm): McEnroe's serve finishes (the racket forearm brushing his stomach, 5-6 cm) and an overhead's free arm bent in front of the
  chest as a point ended (7.7 cm) are not visible from behind or the side. The racket-hand-on-hip count's rise (0.84% → 1.06%)
  photographed: forehand take-backs and recoveries while running, the racket back by the hip, as a take-back is.
- **Djokovic** ("djokovics animations are also pretty weird"), filmed in play from the front and behind:
  - his forehands had been given Nadal's over-the-head finish (any clip whose hand rose above the head after contact), the racket
    hung behind his head; that finish is now Nadal's alone (`LASSO_OWN` in `js/motion.js`, `__lassoAllOld`), and any other
    player's forehand finishing high in the middle or on its own side is taken across to the far shoulder (`crossFinish`,
    `__crossFinOld`), as his do;
  - his running backhand clip (alt 1) is retired (`ALT_BAD`): the tracker lost both hands after contact, which drop to the knees
    and drift a metre off, so it finished with the racket pointing at his feet in a crouch. Running backhands use his others;
  - his serve and his slices (the shared keys; low balls finish lower) were checked and left as they are.
  Note for bisecting: these act when clips are built and when the game loads, before the audit sets its flags, so test them by
  reverting the file; and any change to what a figure does shifts the audit match's rallies (the serve ritual's timing), so a
  pair's counts move with it: Djokovic's arm-in-trunk 3 → 17 frames here are other rallies, a topspin forehand finishing with
  both hands up over his head (the free hand catching the racket), not these changes.
- **Feet checked frame by frame** (the audit's "planted foot sliding" at 3.5% of frames, questioned):
  - that count takes any foot near the court; frame-by-frame films (`steps_audit.mjs SNAPAT=i:t,...`, broadcast, behind and front)
    of its worst cases show a side step's foot coming down fast (13 m/s for the two frames before it lands, then still);
  - so the audit now counts a foot the figure holds on the court (its lock on, not stepping, heel and toe both moving, the ankle
    on the court): **held foot sliding on the court > 0.5 m/s**, broken down by cause. Held feet moving at a sprint turned out to
    be the foot leaving the court at push-off (the drawn ankle rising 13 → 35 cm while its lock still held it). On the court: the
    first server 0.03-0.19% of frames, the other 0.9-1.4%, almost all the deliberate pull-up slide (the front foot carried on up to
    0.9 m/s as he stops, 10-15 cm); the rest is the walk back fading out as he stops (each foot easing 6-8 cm onto where its lock
    holds it, about a dozen frames a match) and heels starting to lift. In the movement lab: none in 405 frames of shuffling.
  - tried and taken out: a foot the leg cannot reach steps (6.8% → 6.4% in the lab, nothing in play), and the lock taking the foot
    where it stands as the walk fades (its own foot is still moving: 23 → 160 frames).
- **The receiver walks to his place** (`js/figure.js`, `__rcvWalkOld`): before the serve, the receiver moving (0.45-3.5 m/s) walks
  upright with the walk, turned the way he goes, and settles into his stance as he stops; counted as play, he went there crouched
  in the ready stance on play's footwork (in the lab, frames gliding on both planted feet 9% → 5%). Roster (four pairs, off → on):
  neutral within noise. `tools/steps_labmove.mjs` takes PHASE and SERVER.
- **The two-hander's finish brought out in front** (`twoHandWrap`, `__bhWrapFwOld`): the hands go to the far shoulder 22 cm in front of
  the shoulders, not 8 (and 16 cm up, not 20). At 8, running out of a backhand, Djokovic's top arm crossed his throat six
  centimetres in front, inside the chest: the 17 arm-in-trunk frames of his audit match (a backhand finish at 6 m/s, not the
  forehand it was first taken for). Djokovic's pair: arm in trunk 17 → 1 frame, chicken wing 1.50% → 0.76%; Nadal's: 0 → 0 and
  0.83% → 0.78%. Filmed: both finish over the far shoulder with the arms across the front of the face.
- **The receiver's walk switched off again** (`__rcvWalkOn`): the full roster audit found it skating a flat foot 1.6-2.3 m/s for a
  few frames as the receiver stops (the walk fading onto play's locks; Alcaraz's pair 0.03% → 0.12% of frames), the audit's
  strictest foot fault. Two ways to hand the walk's feet to the locks as it fades were tried and both made it worse. The crouched
  approach it replaced glides a little more (both feet held while he moves) but does not skate.
- Final roster audit (14 pairs, against this morning's): foot pops 0.014% → 0.005%, legs through each other 0.014% → 0.008%,
  feet through each other 0.085% → 0.069%, knee bent backwards max 0.76% → 0.48%, arm in trunk 0.003% → 0.005% (a few 5-7 cm
  touches, photographed, not visible), held feet sliding on the court 0-0.3% for the first server and 0.9-1.7% for the other, almost
  all the deliberate pull-up slide.
- **The walk's fade, measured and left** (`tools/steps_labmove.mjs` TOP and the fade/fadeIn numbers, feet on the court while the walk
  fades out or in): walking back at 1.45 m/s and stopping, feet on the court move up to 1.8 m/s as the walk fades out (16 of 171
  foot-frames over 0.5 m/s) and up to 3.3 m/s as it fades in, setting off (45 of 84). Pinning a foot on the court through the fade
  fixed both in the lab (16 → 1-4, 45 → 6), but in play it held feet together mid-stride (shins through each other) and threw a
  pinned foot as the walk lifted it (one-frame pops, up to 32 m/s when eased); four versions, all reverted. The serve walk is not
  affected (pinned there, short taps left a foot behind).
- The running free arm's "hand on hip" count (1.5%) photographed again: the back of the arm swing, elbow back and a little out, by
  the hip; the audit's test (hand out from the hip at hip height, elbow back and over 5 cm out) is the back of any runner's swing.
  Pointing the elbow straight back changed nothing (1.57% → 1.52%) and was taken out.
- **Setting off on the walk back, the standing foot held** (`js/figure.js`, `__fadeInHoldOld`): while the walk fades in, its plant
  holds a foot until the walk clearly lifts it (5.5 cm off, not 1.9). At the first slow steps the walker's standing heel is up a
  centimetre or two as it rolls; the plant let go of it, and the foot, half play's and half the walk's, slid along the court after
  the walk's drifting foot. Measured (`steps_labmove.mjs` fade/fadeIn, now feet flat on the court with heel and toe both moving, so
  a pivot on the toe as he turns to walk is not counted): frames over 0.5 m/s setting off Federer 13 → 9, Sinner 22 → 7-8;
  stopping 10 → 6. Walk back only (the walk along the line to serve picked up a frame of shins together). Four-pair audit:
  neutral to slightly better (legs through each other 0.015% → 0.013%). Also tried and reverted: switching the feet to the walk in a
  frame as he sets off (worse: 15 → 37).
- **The free elbow tucked by the side when running** (`js/figure.js`, `__runElbOld`): filmed frame by frame from behind (Murray running
  on after a point, the case the audit flagged), the free hand came down to the waist with the elbow out to the side, a hand on the
  hip for a third of a second. Running over 2.3 m/s with the free hand down at the waist and no stroke under way (or one over half a
  second past contact), the elbow is pointed back and a little out, applied last; and after the point is over too (the case was
  running on in the 'over' phase, which a first version left out, so nothing changed). Refilmed: the elbow stays by his side.
  Not in a take-back or an early recovery (tucked there, the forearm went into the hip: arm in trunk 0.003% → 0.015%; away from
  strokes 0.007%, the rest photographed, not visible). The audit's hand-on-hip test counts an elbow back and 5 cm out, which this
  is, so its number does not fall (1.41% → 1.48%); the pictures are what changed.
- **Setting off on the walk back, a foot leaving its spot lifts** (`js/figure.js`, `__fadeLiftOld`): traced in play (every frame of the
  walk's fade-in, both players of a seeded match), the sliding foot was always one play's footwork still held on the court while the
  walk, fading in, already carried it low: the blend dragged it along the court at 1-2.8 m/s for a tenth of a second. Now, while the
  walk fades in, such a foot is lifted by how far it has moved from its held spot (0.6 x the distance, at most 11 cm), so it steps;
  the lift is let down over a twentieth of a second when the walk takes the foot (dropped in a frame, it popped). Federer-Sinner,
  300 s, both players: foot-frames sliding on the court in the fade 88 → 23, pops 0 → 0. Serve walk and four-pair audit unchanged. The lift is 1.2 x the distance (`__fadeLiftK`), not 0.6: at 0.6 a foot moved five centimetres before it cleared the court; slides 23 → 10 in the same 300 s, no pops (2 x brought pops back); four-pair audit unchanged.
- **A step no faster than a foot is carried** (`js/figure.js`, `__stepVcapOld`): the full roster audit's pictures of every arm and foot
  fault (PENPIC 5 cm, 14 pairs) showed Zverev pulling up out of a sideways run as a point ended, his right foot thrown out 1.7 m in
  seven frames into the splits, forty centimetres in one (16 m/s against the hips). The stop's plant sent the foot's place a metre
  out after its step had begun, and a step follows its place: the foot was dragged after it. A step's foot now moves at most 12 m/s
  over the court (2.2 x his speed if faster), and the step goes on until it has caught up (ended short, the foot was thrown the rest
  of the way in a frame: pops up to 47 m/s). Refilmed: the foot steps out over the frames into a stance 0.57 m wide, not 1.08.
  Four pairs: foot jumps 0.013% → 0.007%, feet through each other 0.059% → 0.045%, legs through each other 0.013% → 0.011%, pops
  unchanged. The other pictures (serve foot pops at the trophy, 5-8 cm arm touches) look normal from behind and the side.
- **The sideways run: legs along the way he goes, feet down where the run puts them, trunk into the run** (`js/figure.js`; he said
  "running with the legs lagging behind, even the normal side to side run looks pretty bad", and "the shuffle isnt what im complaining
  about, its the run"). Three causes, measured in the lab (`dev.html?lab=fh`, `tools/steps_labmove.mjs`, Manual keys at 6 m/s):
  - The body turns at most 1.15 rad to run across the court, so the run's feet, laid out the way he faced, went about 24 degrees off the
    way he was going, mixed with a fifth of the side shuffle. Running hard (over 3 m/s, turned near that limit) the gait is now laid
    out along his travel (`__runTravelOld`). It comes in gradually: faded out between 63 and 86 degrees between facing and going, the
    turn eased in over a tenth of a second (`__runTravelCut` = the first version's hard cut-off at 75 degrees, which threw a foot up to
    half a metre in the frame it switched on: foot pops 0 → 3 per match at 4-6 m/s; with the fade, back to before).
  - A running foot was held on the court the moment the gait's foot came low, while the gait still swept it forward: pinned 30-50 cm
    short of where the stride puts it, the leg trailed. Now a foot is held only once its own target moves slower than 1.8 + 0.25 x speed
    m/s (`__runPlantOld`): lag behind the gait 0.16 → 0.04 m mean (max 0.51 → 0.18), held-foot slip share 0.079 → 0.06. The audit's
    loose "planted foot sliding" count (any foot with the toe under 11 cm moving) rises 3.2% → 5.0%: measured in the lab by toe height,
    all the extra frames are a foot 6-11 cm up in mid-stride; none has the toe within 2 cm of the court (flat-foot skating stays 0).
  - The run clips are joggers' motion capture, the trunk 8-9 degrees forward at 6 m/s. Running, it now leans the way he goes, from the
    hips (the pelvis half as far): up to 7 degrees more for speed and 6 more while speeding up, a little back while pulling up, faded by
    the stroke's own weight (`__runLeanOld`, `__runLeanK`; by the stroke's share of the pose instead, `__runLeanSk`, running into a
    take-back at 7 m/s leant the chest into the racket arm). Trunk 8.7 → 14.5 degrees at 6 m/s, 17 while accelerating.
  Filmed from behind and the broadcast camera: the trailing leg folds and comes through, the feet land under him. Four-pair audit: free
  hand on the hip while running 1.48% → 0.83%, racket hand 0.68% → 0.57%, sideways gallop 2.68% → 2.46%, both feet up at < 3 m/s
  2.28% → 1.91%; pops, jumps, held-foot slides unchanged.
- **Nadal's serve and forehand re-tracked across the court from a camera behind him** (he said "i want you to retrack ... find good
  footage", then "just nadal"). His serve and first forehand were tracked from one side-on camera, so how far across the court the
  arms are (what the broadcast and behind cameras show) was the pose model's guess. New footage, filmed from behind (all downloaded with
  `yt-dlp --ignore-config`, kept local in `~/.cache/rally-motion-footage/nb_*`):
  - forehand: youtube XJ7fWm1gPtY, Essential Tennis "Rafael Nadal Crushing his Forehand from Back Perspective - BNP Paribas" (Indian
    Wells 2013 practice, back fence, 1080p 24 fps at about real speed: the ball's fall between bounce and contact gives 0.9-1x);
    camera angle psi -10 from the vanishing point of the court lines; the forehand at 5.34 s.
  - serve: youtube MGXLV5uwWHM, "Rafa Nadal Serve Practice Slow Motion 0.2X 0.5X (back view)" (US Open practice; 30 fps with every
    picture shown twice; 1.55x slow MEASURED from the toss, a parabola through 23 ball positions); the serve at 7.43 s.
  Tracked with track.py --big, built by player_motion.py (sheets checked at 8 phases against the frames), and fused into the clips in
  the game with `tools/fuse_game.py` (player_motion's fuse, axis x): his main serve, main forehand and second forehand (Cincinnati,
  backing up) keep their side camera's legs, timing, height and depth and take how far across the court the trunk, head and arms are
  from behind (mean shift 7-9 cm, up to 0.7 m for an arm). The serve's finish: both cameras lose the racket hand once it crosses in
  front of him, and both had it end on his left side; the back footage shows the racket brought down through the middle and held by
  his right hip from +0.39 s, and `tools/serve_finish_nadal.py` sets the hand's across-court path to that (the elbow kept at least 0.2 m
  out in front of the line of his spine: halfway across at the clip's own depth it sat in his belly). His first forehand is off
  `MAIN_WEAK` (`__nadFhWeak` puts it back). Filmed from behind: the forehand takes the racket up on his left with the right arm across,
  loops it down and finishes with the lasso over his head; the serve ends by his right hip as on the footage. Other side-camera tracks
  that were tried: Indian Wells 2013 serve 2 (youtube 53ow0zuH6BM, 9.8x by its toss) cuts away 0.35 s after each contact, too short
  to replace the serve clip.
- **Nadal's forehand: the coil, the load and drive, the take-back racket, the follow-through** (he said "the takeback, forehand, and
  takeback into the forehand still kinda suck. his animations dont exude the same kind of power they do in real life", "his footwork and
  body on that stroke also dont look accurate", "his recovery from his forehand is pretty unnatural too"). Measured with
  `tools/steps_fhpower.mjs` (his strokes in a match, frame by frame: shoulder and hip turn, pelvis height, stance, hand and racket-head
  speed, drawn against the clip at the same moment, and filmed from a camera like the footage's) and put beside the back-fence footage
  (youtube XJ7fWm1gPtY) at the same instants:
  - The clips the game picked were his weakest. Forehands 3 and 4 (Indian Wells, filmed from in front) turn the shoulders 38-43 degrees
    before contact against 110-133 in his side-camera clips and 111-131 in Federer's, Alcaraz's, Sinner's and Djokovic's: from in front
    the tracker cannot see how far they turn away. Number 4 was his set forehand. Number 2, the attacking one, is a ball run in to: feet
    closing to 23 cm at contact, wrist 9.4 m/s against 13.7 in his first clip; it was played for three forehands in four, standing still
    too. All three are in `ALT_BAD` (`__nadFh34On` brings them back); his first clip (110 degree coil, 0.86 m stance, the pelvis down to
    0.80 m in the load and up to 1.00 at contact) now takes set, attacking and low balls.
  - Braking into the ball let the hips down 15 cm through contact (`brakeK`), on top of the clip's own load: he was at his lowest at
    contact, where the man drives up 20 cm through it. The braking and driving dips are now faded out under a tracked stroke
    (`__dipClipOld`): lowest pelvis in a stroke 0.62-0.70 → 0.81 m, the clip's load-and-drive shows.
  - The first take-back racket key (`RACKET_OVR` 'Nadal/fh' at -0.70) held the racket out flat to his side until half a second before
    contact; the footage has it up beside his head, tip up, by -0.7 s. Re-set from the footage (`__nadOvrOld` for the old key).
  - Running out of the finish, the run's hip correction turned his shoulders back with the hips (35 % of it), and his finish wrapped
    about half as far as the clip's (21-42 against 44-71 degrees). From contact on the shoulders keep the stroke's whole turn
    (`__finRunOld`).
  - Recovery: the computer runs back to its spot at full speed the moment it hits, so a recovery of a couple of metres is a turned run at
    4 m/s, where the man side-steps facing the net. Pacing the recovery to the time before the reply (with or without a 3 m/s cap, and
    with more margin) shortened rallies by 0.2-0.3 shots on every seed and surface tried (hard 3.21-3.35 → 3.02-3.11), the computer
    caught out of position more: not kept. The recovery's look within that movement is still open.
- **Nadal's forehand follow-through, his right leg, his pre-serve stance, and the choice of main forehand** (he said "theres a weird pause
  after his follow through on the forehand instead of transitioning naturally", "why does he lift up his right leg on the forehands so
  much", "his preserve stance still looks really weird", "can you choose a better main forehand clip"):
  - The pause: the clip holds the lasso over his head from +0.2 to +0.45 s, as the man does, and lowers the racket over the next half
    second; the game let go of the clip with the stroke's weight, which falls over a quarter of a second from +0.45 s, so the racket
    hung still and was then thrown down to the ready pose at 10-13 m/s. After contact a groundstroke's clip now plays out to its own end
    and fades into the next pose over its own last third of a second (`__finSwOld`): peak hand speed in the exit 12.8 → 5-8 m/s, no stop.
    For every player's groundstrokes (four-pair audit: Becker's arm-in-trunk count 3 → 7 frames; the worst, pictured from behind and in
    front, is a two-handed carry into a lob, not into his body).
  - The right leg: his first clip lifts the right foot 11-16 cm from 0.2 s before contact to 0.25 s after; on the back-fence film both feet
    are down while he loads and the right leg swings up only as he hits. A groundstroke's free foot, the other one down, is now kept to
    8.5 cm above flat until contact and 14 cm after, the rest eased to a quarter (`__gsLiftOld`); faded out as the other foot lifts, and
    not below the lock's 7.8 cm (at 5 cm a swinging foot was taken for set down and popped free: Edberg's pops 1 → 3, back to 1).
  - The pre-serve stance: the waiting pose is taken from the serve clip's first moment, where Nadal's feet are 0.5 m apart but exactly in
    line, one in front of the other, knees together. It is now taken 0.25 s later, just before the toss, feet 0.38 m apart along the line
    and knees bent (`ADDR_U`, `__addrOld`). And the serve's back-view fusion now starts at the trophy (0.8 s before contact): the back
    serve tosses 0.35 s earlier relative to contact, and before that its arms do not belong to the side clip's address.
  - A new main forehand was looked for: the two side-on-looking Indian Wells 2013 forehand videos (youtube YnYvRrTWRFw, 0E4piBeUKAE) were
    tracked and five full forehands built (contacts found frame by frame with the ball on the strings). With the ground pinned (the camera's
    tilt floated the whole body 0.3-0.7 m), one (0E4piBeUKAE 10.78 s) keeps both feet down and has a 97 degree coil and a full finish, but
    the camera is a front quarter (105-127 degrees by where his face points) and the take-back has the racket hand in front of his hips: the
    tracker cannot see how far back the arm goes from in front, the fault that made forehands 3 and 4 useless. The three fastest (22 m/s
    at the wrist) end 0.3-0.45 s after contact, which would be frozen on their last frame. His first clip stays.
- **Nadal's forehand no longer hangs at the top** (he said "his forehand still hangs too long at the top"): his clips hold the lasso over
  the head from +0.2 to +0.45 s (the back-fence film holds it to about +0.7 s), and in the game the racket read as hanging there. A
  finish can now be played faster than filmed from just after contact to the end of its hang (`FINISH_RATE`: Nadal's forehand 1.6 x up to
  0.45 s of the clip; `__finRateOld`): the hand keeps moving through the top (3.4-4.9 m/s, against near-still before) and comes down
  0.15 s sooner, at its filmed speed (played faster all the way, it was thrown down at 10 m/s). The fade into the next pose keeps its own
  length in the clip's time, so the lasso itself is not faded.
- **Take-backs start later: he moves to the ball first** (he said "take backs start too early. like as soon as the other players hits it
  the takeback is already starting instead of moving to the ball"): the computer books a groundstroke 0.9 s before contact, which on a
  quick ball is the moment the other man hits it, and the stroke came in from then. The figure now holds the take-back until 0.75 s before
  contact, full by 0.55 s, at any pace (it had only done so above 2.2 m/s; `__prepMoveOld` for that, `__prepStand 0` to keep a standing
  player's early turn). The booking itself, and so the computer's choice of shot, is unchanged. Measured (`tools/steps_fhpower.mjs`
  TAKEBACK): the stroke's weight passes a half 0.48-0.56 s before contact, against 0.6-0.73; the coil still reaches 88-125 degrees
  (his clip 104-106). Filmed from behind: he runs with the racket in front and takes it back from about -0.53 s. Five-pair audit: no
  fault rate up (arm in trunk 0.027 → 0.019 %, foot pops 0.008 → 0.005 %).
- **Aim keys are no longer dropped** (he said "sometimes the fucking aiming on the stroke doesnt listen to keypresses"): with the classic
  controls the aim was read only from the arrow held at the instant the swing fired, about a sixth of a second before contact; Space is
  usually pressed earlier and remembered, so an arrow pressed with it and let go of in between, or tapped after it, was ignored and the
  ball went where the game chose. Now, once Space has armed the swing for this ball, the last arrow held or tapped (taps between frames
  count) until the swing fires is the aim, ↑/↓ (lob, drop) likewise, and the same for the serve between the press and the swing; an arrow
  held as it fires still wins (`__aimLatchOld`). Scripted test (Space with an arrow 0.3-0.45 s before the ball, arrow let go 0.2 s later):
  aimed as pressed 11 of 18 → 18 of 18.
- Serves: measured through the classic controls with no ↑/↓ held, first serves are flat (median 188-197 km/h for Federer, Nadal and
  Sinner) and second serves kick (157-164 km/h). ↑ held at the swing makes any serve a kick and ↓ a slice. The speed readout labelled kick
  and slice serves but not flat ones; flat ones now say "Flat".
- **Replays in the broadcast style** (he asked "can you make the replays the same style as actual atp tennis?"): a broadcast goes into
  and out of a replay behind its own animated wipe, shows the shot in super slow motion from its slow-motion camera at the side of the
  court, tight on the player, and often a second angle on the ball. Now: the existing slab wipe (`ui.sting`, unused since straight cuts
  came in between points) closes over the live picture, the replay starts behind it and it opens on the shot; it closes again over the
  replay's last moment and the next point comes up behind it (`__repStingOld`). The wipe takes the event's colours (the tour's blue, the
  slams' own) with the game's mark, no real logos. The shot is shown at 0.28 x from a court-level camera 6 m to the side and a little in
  front of the hitter on a long lens framing about 3.5 m (`__repCamOld`), from 0.65 s before contact; from 0.42 s after it, the reverse
  angle low behind the beaten player follows the ball to its bounce at 0.5 x. Between ordinary points it is still a straight cut.
  `tools/steps_replayfilm.mjs` films a replay with the page's graphics.
- **Gameplay: pressure timing and timed aim** (he said "i really want to revamp the gameplay cuz its really boring rn, like all you do is
  hit the space bar and aim the shots"; rejected shot-type keys with charge, a serve meter, "footwork matters" and a steered aim marker;
  after a survey of twelve tennis games - TopSpin 2K25, Virtua Tennis, Tennis World Tour 2, AO Tennis 2, Matchpoint, Tennis Elbow 4,
  Mario Tennis, Switch Sports, VR and mobile ones - he chose these two, both keeping the swing and the shot choice automatic):
  - Pressure timing (TopSpin 2K25's meter, `__pressureOld`): his clean window is the level's times 1.25 off a slow ball down to 0.6 off a
    fast one, 0.75 deep in a long rally, down to 0.55 stretched or running, and up to 1.35 off a ball that sits up (bounded 0.4-1.6 x);
    it had only narrowed by up to 40 % against a threatening ball. The classic controls' "merciful" clamp kept a mistimed press within half
    a window of the clean one, so timing hardly counted; it now allows 0.06 s more, and outside the window the ball goes off line: early
    pulls it (a forehand across his body, a backhand the other way), late pushes it, about 0.7 m per 0.03 s, at most 1.6 m, on top of the
    loss of quality timing already cost. The Perfect / Good / Early / Late read-out is judged against the same window. His shots only; the
    computer's are unchanged (AI-v-AI statistics unaffected).
  - Timed aim (Tennis Elbow 4's, `__timedAimOld`): how long ← or → has been held for this ball sets the angle, kept after it is let go
    until the swing: a tap 1.3 m off the middle, 0.15 s 1.9 m, 0.3 s 2.9 m, 0.4 s or more to 0.3 m inside the level's margin (3.46 m on
    Tour, against the old fixed 3.0 m), so more winners and more outs.
  Difficulty (classicbot, Auto footwork, 400 points): timing like his (sig 0.02) Club 78 → 82 %, Challenger 69 → 71 %, Tour 59 → 58 %;
  looser timing (sig 0.04) Tour 53 → 53 %, Challenger 66 → 71 %.
- **You can see where you are aiming** (he said "you should be able to see where youre aiming, where the ball is going as its mid air and
  how your aiming controls it"): with the classic controls the only marker had been where the other man's ball would land. Now, while a
  ball is coming to him, a lime target marks where his shot is aimed as the swing would aim it now: the game's own choice with no arrow
  held, sliding out toward the line as ← or → is held (the timed aim), deep with ↑, short with ↓, amber within 0.6 m of a line; it stays
  where he aimed while his ball flies, and his ball's landing spot is marked as it flies, so aim and landing can be compared (an early or
  late swing pulls it off). On the far court a ring on the ground is a few pixels high from the low cameras and half hidden by the net
  tape (the old aim ring was 8 % of its radius thick: under a pixel), so the target is a bold ring plus a 0.85 m target standing above
  the spot facing the camera (`__aimMarkOld` for the old markers; the Aim ring setting turns them off).
  Then (he said "i dont want aim line maybe just like a circle or something"): on the far court the markers are only circles standing
  just above the court and facing the camera - lime (amber near a line) where he is aiming, a smaller white one where his ball will land;
  no ring on the ground there (foreshortened, it read as a line).
- **Feet under the body when running, and set as he hits** (he said "the footwork is still weird. a lot of times the feet look like theyre
  lagging behind the torso and dont set properly when running or before shots"). Measured in matches (`tools/steps_feetlag.mjs`): the
  hips' point on the ground ran ahead of the middle of the feet at every speed and never behind it, 0.11-0.12 m at 1.5-3 m/s and
  0.17-0.20 m above 3 m/s; in the lab the run's own motion capture (a jogger's long, back-kicking stride) has the hips 0.19-0.20 m ahead
  of its ankles on average, and the game drew exactly that, the trunk now leant into the run making it read worse.
  - Running, the feet come forward along the gait's direction, up to 0.1 m from 1.5 to 4 m/s, none under a tracked stroke's legs
    (`__feetFwdOld`, `__feetFwdK`): hips ahead of the feet 0.11 m at every speed band (lab forward run at 5 m/s 0.21 → 0.12 m); a held
    foot is set down where its target is, so nothing slides (lab held-foot slips 3.5 % → 0.9 %).
  - Into a groundstroke on the move, the run's cycle is quickened or slowed by at most about a fifth over the last 0.08-0.7 s so that
    contact falls in the middle of a stance (`Loco.stanceNear`, from each gait clip's own ankle heights; `__stepTimeOld`): frames in the
    last quarter second with both feet clear of the court (ankles over 13 cm and toes over 5 cm) 13 % → 8 %.
  And then (he said "i meant like on the court. and just one circle. like similar to one when youre receiving the ball just make both of
  them lime"): no standing circles; his shot has one flat ring on the court in the look of the receiving ring (2.1 x its size, to read
  at the far end), lime, at where he aims while the ball comes (amber within 0.6 m of a line) and, once hit, at where it will land; the
  receiving ring is lime too (`ballfx.showMine`).
- **Circle precise and on the serve; Tour harder** (he said "circle should me more precise and apply to the serve also. also it feels too
  easy now"): the circle is now the receiving ring's size 1.3 x and still (it was 2.1 x and pulsing, half a metre either side of the
  spot); waiting to serve and through the toss it sits where the serve is placed (the box's T, body or wide by the arrow held or pressed
  with Space), and the serve's landing is shown as it flies. Tour: the computer's errors 0.72 → 0.62 of the measured rates and the
  spread of his own shots 0.95 → 1.12 (the timed aim lets him go 0.45 m nearer the lines, and arrows are no longer dropped, so it had
  become easy): classicbot with timing like his (sig 0.02, Auto footwork, 500 points) Tour 57 → 45 % of points won (49 % with the spread
  alone, 52 % with the errors alone, 43 % at 1.25 / 0.6). His first serves go in less often (75 → 63 %), as the spread covers serves too.

## 2026-11-22: speed (he said "bro the game is still remarkably slow, there must be optimizations you can make")
- **Where the time went** (his laptop: Intel Iris Xe, 1920 x 1080 at 60 Hz, Firefox): the broadcast camera's crane check (game.js,
  since 2026-11-20 run for the court's middle at every moment, not only with the near player deep) asked three.js's raycaster, ten
  times a second, whether anything stood between the camera and up to eleven points of the court, and the raycaster tested every
  triangle of the merged stands (85,000 to 200,000) and every one of the crowd's 8,260 cards for each line: 36 lines took 170-200 ms
  in Firefox, and in a match the slowest tenth of frames averaged 49 ms (42 of them in the camera), worst 116 ms. Under the menus the
  attract match uses the same camera, so they stuttered too.
  Now `js/sight.js` files the stadium's fixed triangles and the crowd's cards once (36 ms in Firefox, 4-7 MB) under the 2 m squares of
  ground each covers, in the stadium's own frame, and a line tests only what lies under it; what moves (ball kids, line judges, their
  balls) still goes to the raycaster. Same answers: `tools/steps_sightcheck.mjs` asked 40,320 lines both ways in all 30 venues, both
  ends, before and after a change of ends, and none differed; 98.6 s of raycasting became 2.5 s (Chrome). In Firefox the slowest
  tenth of frames: 49 → 13.6 ms, camera 41.9 → 0.27 ms. (`__craneRayOld` brings back the raycaster.)
- **Resolution follows the frame rate again**: the frame time it was held to was the average gap between frames, which grew with the
  late frames themselves, so a match at 40 fps on a 60 Hz screen was never thought slow and the resolution never came down. Now it is
  the screen's measured refresh (no faster than 15 ms, so a 144 Hz screen is not chased), it steps down after about 40 late frames
  (was 90) as far as two thirds of the setting's resolution (was four fifths), and comes back up a step after ten seconds with no late
  frame, but not for a minute to a step that was tried and came late. Headless Firefox at 2560 x 1440: 1.0 → 0.67 in three seconds,
  where before it stayed at 1.0. (`__expectOld`, `__autoOld`.)
- Measured and left: uncapped, Chrome on this laptop draws High at 1080p at about 100 fps when nothing else uses the graphics
  (36 fps while his Firefox was drawing the game at the same time); headless Firefox 50-60 (it copies every frame back for its
  headless window). Anti-aliasing is the dearest part of the picture (High without it +20-30 %), the depth of field costs little,
  the shadow map little (five-tap PCF in three r187), a packed 32-bit HDR buffer instead of half floats no measurable gain (kept the
  half floats). Draw calls: 180 a frame (47 into the shadow map, 94 of the stadium). Two pytest runs of his were taking four of the
  twelve cores and a quarter of the memory while he played; the integrated graphics share the CPU's power and memory.
- Tools: `tools/ff.mjs` (headless Firefox over WebDriver BiDi, runs the same steps modules as shot.mjs; serve the repo over http),
  `steps_fpsfree.mjs` (frame rate with the refresh cap off: Chromium `--disable-gpu-vsync --disable-frame-rate-limit`, Firefox
  `FFPREFS=layout.frame_rate=0`), `steps_gpucost.mjs` (each feature's cost, frames drawn and waited for, settings interleaved),
  `steps_autoscale.mjs` (the resolution scale second by second on the page's own loop), `steps_sightcheck.mjs`.
