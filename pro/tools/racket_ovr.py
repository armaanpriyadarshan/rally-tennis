# The key directions for RACKET_OVR (js/figure.js) that put a tracked stroke's racket where the footage has it.
#
#   python -I racket_ovr.py '[{"u": -0.54, "D1": [...], "F1": [...], "D2": [...], "F2": [...], "W": [...]}, ...]'
#
# In the game a tracked groundstroke's racket is the shared keys' racket direction, turned by however far the
# tracked arm is from the keys' arm at that instant. Where the two arms differ a lot (Djokovic's racket held high
# behind his head) the turned racket can point somewhere the man's never does. For each instant u: D1 is the keys'
# direction there (fig.strokeKeys(kind, wing).at(u).dir in pro/dev.html?lab=...) and F1 the racket's direction the
# game then draws (fig.rk.dir in the lab, in the same right-hander's terms: x hitting side, y up, z forward); D2/F2
# the same with a trial override (say [1, 0, 0]) in RACKET_OVR. The two pairs fix the turn; W is the direction read
# off the footage; printed is the override that ends at W, and how well the turn explained the trial (degrees).
import sys, json, numpy as np
def frame(a, b):
    a = a / np.linalg.norm(a); c = np.cross(a, b); c /= np.linalg.norm(c); return np.stack([a, np.cross(c, a), c], 1)
for r in json.loads(sys.argv[1]):
    D1, F1, D2, F2, W = [np.array(r[k], float) for k in ('D1', 'F1', 'D2', 'F2', 'W')]
    R = frame(F1, F2) @ frame(D1, D2).T
    D = R.T @ (W / np.linalg.norm(W)); err = np.degrees(np.arccos(np.clip((R @ D1) @ (F1 / np.linalg.norm(F1)), -1, 1)))
    print(f"{{ u: {r['u']:.2f}, dir: [{D[0]:.2f}, {D[1]:.2f}, {D[2]:.2f}] }}  (fit {err:.1f} deg)")
