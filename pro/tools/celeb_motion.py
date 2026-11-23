# Celebrations at the end of a match, as full-body clips tracked from real footage of them (he said "the celebration animations
# fucking suck bro get real ones and mocap them"): the same reconstruction as a player's strokes (player_motion.py), without the
# arm handling that only a stroke needs, on the clip's own clock from its first frame. Written as js/celebmotion.js in the format
# of js/playermotion.js (fps 60, u0, J[joint] per frame for a 1.85 m man, root, yaw, plant), one clip per kind of celebration.
#   python -I celeb_motion.py manifest.json ../js/celebmotion.js [--sheets dir]
# manifest: {"celebrations": [{"kind": "arms", "player": "Murray", "video": ..., "track": ..., "t0": s, "t1": s, "hand": "R",
#   "src": "..."}]}
import sys, os, json, math, argparse
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import player_motion as PM

ap = argparse.ArgumentParser(); ap.add_argument('manifest'); ap.add_argument('js'); ap.add_argument('--sheets'); A = ap.parse_args()
man = json.load(open(A.manifest)); out = {}; log = []
PM.WIN['celeb'] = (0.0, 30.0)
for e in man['celebrations']:
    d = np.load(e['track']); e = dict(e, stroke='celeb', lift=False)
    sel = (d['t'] >= e['t0']) & (d['t'] <= e['t1'])
    # one man's bones, from the frames used
    J0, _ = PM.from_mp(d['world'][sel].astype(np.float64)); L = PM.bone_lengths(J0 - J0[:, :1])
    # the longest unbroken stretch of him (reconstruct's choice with no contact given); the clip's clock starts at its first frame
    e.pop('contact', None)
    R = PM.reconstruct(d, e, L)
    if R is None: log.append(dict(kind=e['kind'], result='too short')); continue
    R['d'] = d
    e['contact'] = float(R['t'][0] * float(e.get('slow', 1)))
    C = PM.to_court(R, e, 'celeb', e.get('hand', 'R')); clip = PM.resample(C, 'celeb')
    r3 = lambda a: [round(float(v), 3) for v in np.asarray(a).reshape(-1)]
    out[e['kind']] = dict(fps=PM.FPS, u0=round(clip['u0'], 4), src=e.get('src', ''), player=e['player'], hand=e.get('hand', 'R'),
                          J={n: r3(clip['J'][:, i]) for i, n in enumerate(PM.JOINTS)}, root=r3(clip['root']), yaw=r3(clip['yaw']), plant=[int(v) for v in np.asarray(clip['plant']).reshape(-1)])
    log.append(dict(kind=e['kind'], player=e['player'], frames=len(clip['J']), secs=round((len(clip['J']) - 1) / PM.FPS, 2), psi=round(C['psi'], 1)))
    if A.sheets:
        import cv2; PM.sheet(os.path.join(A.sheets, f"celeb_{e['kind']}.jpg"), clip, e, R, C, cv2)
head = ("// Celebrations at the end of a match, tracked from footage of the real ones (tools/celeb_motion.py, tracks by tools/track.py):\n"
        "// the format of playermotion.js, u0 = 0 at the first frame. arms: Murray, Wimbledon 2013; fists: Nadal, US Open; crowd: Federer,\n"
        "// Australian Open 2017. Played by figure.js from the moment the match is won (game.js endSequence).\n")
open(A.js, 'w').write(head + 'export const CELEB_MOTION = ' + json.dumps(out, separators=(',', ':')) + ';\n')
print(json.dumps(log))
