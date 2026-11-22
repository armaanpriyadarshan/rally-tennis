# python -I tools/fuse_game.py <game clips js> <player> <key> <alt index | -> <back out.json> <back stroke> <out.json>
# A clip already in the game (PLAYER_MOTION in playermotion.js, or PLAYER_MOTION_ALTS[player][key][i] in playeralts.js) taken as
# the first camera of tools/player_motion.py's fuse(): from the back-camera clip only how far across the court the trunk, head and
# arms are; legs, travel, timing, height and depth stay the game clip's. Bones are set back to the game clip's own median lengths.
import sys, json, numpy as np
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
import player_motion as PM
js, player, key, alt, backf, bkey, outf = sys.argv[1:8]
s = open(js).read(); name = 'PLAYER_MOTION_ALTS' if alt != '-' else 'PLAYER_MOTION'; i = s.index('export const ' + name + ' = ')
D = json.loads(s[i + len('export const ' + name + ' = '):].strip().rstrip(';'))
c = D[player][key][int(alt)] if alt != '-' else D[player][key]
def arr(c):
    n = len(c['J']['pelvis']) // 3
    J = np.stack([np.array(c['J'][j], float).reshape(n, 3) for j in PM.JOINTS], 1)
    return dict(u0=float(c['u0']), J=J, root=np.array(c['root'], float).reshape(n, 2), yaw=np.array(c['yaw'], float), plant=np.array(c['plant']).reshape(n, 2))
A = arr(c); B = arr(json.load(open(backf))['clips'][player][bkey])
# optional 8th argument: from (s from contact) - the second camera's across-court place only from then on, blended in over 0.15 s;
# before it the first clip's own (two swings line up at contact, but a serve's ritual before the toss runs at its own pace: the
# back-view serve tossed 0.35 s earlier than the side one, and its arms, already apart, put the side clip's address in pieces)
if len(sys.argv) > 8:
    fr = float(sys.argv[8]); up = [PM.JI[k] for k in ('neck', 'head', 'lsho', 'rsho', 'lelb', 'relb', 'lwri', 'rwri', 'lhand', 'rhand')]
    for k in range(len(B['J'])):
        u = B['u0'] + k / 60; w = min(1.0, max(0.0, (u - (fr - 0.15)) / 0.15)); w = w * w * (3 - 2 * w)
        ka = int(round((u - A['u0']) * 60))
        if w >= 1 or ka < 0 or ka >= len(A['J']): continue
        ax = A['J'][ka, up, 0] - A['J'][ka, 0, 0]; bx = B['J'][k, up, 0] - B['J'][k, 0, 0]
        B['J'][k, up, 0] = B['J'][k, 0, 0] + (1 - w) * ax + w * bx
L = {}
for ch, pa, nm in PM.BONES: L.setdefault(nm, []).append(np.median(np.linalg.norm(A['J'][:, PM.JI[ch]] - A['J'][:, PM.JI[pa]], axis=1)))
L = {k: float(np.mean(v)) for k, v in L.items()}
F = PM.fuse(A, B, L, 0)
print('primary u', A['u0'], A['u0'] + (len(A['J']) - 1) / 60, ' back u', B['u0'], B['u0'] + (len(B['J']) - 1) / 60, ' fused u', F['u0'], F['u0'] + (len(F['J']) - 1) / 60)
r3 = lambda a: [round(float(v), 3) for v in np.asarray(a).reshape(-1)]
out = dict(c, u0=round(F['u0'], 4), J={n: r3(F['J'][:, k]) for k, n in enumerate(PM.JOINTS)}, root=r3(F['root']), yaw=r3(F['yaw']), plant=[int(v) for v in np.asarray(F['plant']).reshape(-1)])
d = np.abs(F['J'] - A['J'][int(round((F['u0'] - A['u0']) * 60)):][:len(F['J'])])
print('moved (m): mean x %.3f  max x %.3f  mean y %.3f mean z %.3f' % (d[..., 0].mean(), d[..., 0].max(), d[..., 1].mean(), d[..., 2].mean()))
json.dump(out, open(outf, 'w'))
