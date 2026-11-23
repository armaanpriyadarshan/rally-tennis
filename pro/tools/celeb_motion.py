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
def build(d, e, L):
    # one unbroken piece onto the game's clock, from its own first frame
    e = dict(e); e.pop('contact', None); R = PM.reconstruct(d, e, L)
    if R is None: return None, None, None
    R['d'] = d; e['contact'] = float(R['t'][0] * float(e.get('slow', 1))); C = PM.to_court(R, e, 'celeb', e.get('hand', 'R')); return PM.resample(C, 'celeb'), R, C
def join(A, B, gap):
    # B after A: B turned to A's last heading and moved to its last place over the ground, the gap filled frame by frame
    ya, yb = A['yaw'][-1], B['yaw'][0]; d = ya - yb; c, s_ = math.cos(d), math.sin(d)
    turn = lambda P: np.stack([P[..., 0] * c + P[..., 2] * s_, P[..., 1], -P[..., 0] * s_ + P[..., 2] * c], -1)
    BJ = turn(B['J']); Broot = turn(np.stack([B['root'][:, 0], np.zeros(len(B['root'])), B['root'][:, 1]], 1))[:, [0, 2]]
    off = A['root'][-1] - Broot[0]; Broot = Broot + off; BJ = BJ + np.array([off[0], 0, off[1]])
    n = max(1, int(round(gap * PM.FPS))); w = np.linspace(0, 1, n + 2)[1:-1]; w = w * w * (3 - 2 * w)
    fill = lambda a, b: np.array([a + (b - a) * x for x in w])
    return dict(u0=A['u0'], J=np.concatenate([A['J'], fill(A['J'][-1], BJ[0]), BJ]), root=np.concatenate([A['root'], fill(A['root'][-1], Broot[0]), Broot]),
                yaw=np.concatenate([A['yaw'], fill(A['yaw'][-1], B['yaw'][0] + d), B['yaw'] + d]), plant=np.concatenate([A['plant'], np.repeat(A['plant'][-1:], n, 0), B['plant']]))
for e in man['celebrations']:
    d = np.load(e['track']); e = dict(e, stroke='celeb', lift=False)
    if e.get('pieces'):
        sel = np.zeros(len(d['t']), bool)
        for a, b in e['pieces']: sel |= (d['t'] >= a) & (d['t'] <= b)
        J0, _ = PM.from_mp(d['world'][sel].astype(np.float64)); L = PM.bone_lengths(J0 - J0[:, :1]); clip = None; R0 = C0 = None
        for (a, b) in e['pieces']:
            c2, R, C = build(d, dict(e, t0=a, t1=b), L)
            if c2 is None: continue
            if clip is None: clip, R0, C0 = c2, R, C
            else: clip = join(clip, c2, max(0.0, float(R['t'][0]) - float(prev_end)))
            prev_end = R['t'][-1]
        if clip is None: log.append(dict(kind=e['kind'], result='too short')); continue
        r3 = lambda a: [round(float(v), 3) for v in np.asarray(a).reshape(-1)]
        out[e['kind']] = dict(fps=PM.FPS, u0=round(clip['u0'], 4), src=e.get('src', ''), player=e['player'], hand=e.get('hand', 'R'),
                              J={n: r3(clip['J'][:, i]) for i, n in enumerate(PM.JOINTS)}, root=r3(clip['root']), yaw=r3(clip['yaw']), plant=[int(v) for v in np.asarray(clip['plant']).reshape(-1)])
        log.append(dict(kind=e['kind'], player=e['player'], pieces=len(e['pieces']), frames=len(clip['J']), secs=round((len(clip['J']) - 1) / PM.FPS, 2)))
        if A.sheets:
            import cv2; PM.sheet(os.path.join(A.sheets, f"celeb_{e['kind']}.jpg"), clip, e, R0, C0, cv2)
        continue
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
