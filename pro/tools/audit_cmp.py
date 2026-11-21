# Compare two folders of steps_audit.mjs outputs (aud_*.txt, one per match): each foot/leg/arm fault rate as the mean and the
# worst over every player in the folder.   python3 -I audit_cmp.py <before dir> <after dir>
import re, glob, sys
def load(d):
    out = {}
    for f in glob.glob(d + '/aud_*.txt'):
        cur = None
        for l in open(f):
            m = re.match(r'^== (.+?) \((human|computer)\)', l)
            if m: cur = m.group(1); out[cur] = {}; continue
            m = re.match(r'^  (.+?)\s+([0-9.]+)%\s+\((\d+) of (\d+)\)', l)
            if cur and m: out[cur][m.group(1).strip()] = float(m.group(2))
    return out
A, B = load(sys.argv[1]), load(sys.argv[2])
ks = ['foot pop (one frame much faster than both neighbours, > 4 + speed m/s)', 'foot jump (> 7 + 1.5 x speed m/s against the hips, near the court)',
      'legs through each other (< 9 cm apart)', 'feet through each other (< 10 cm apart)', 'legs crossed (> 8 cm)', 'planted foot sliding > 0.8 m/s',
      'flat foot skating > 1 m/s', 'both feet up at < 3 m/s', 'arm inside trunk > 5 cm', 'knees knocked together (X legs)', 'knee bent backwards',
      'sideways gallop (shuffle > 2.8 m/s, both feet off)', 'chicken wing', 'racket hand on hip while running', 'free hand on hip while running']
for k in ks:
    a = [A[n].get(k, 0) for n in A]; b = [B[n].get(k, 0) for n in B]
    if not a or not b: continue
    print('%-46s A mean %.3f max %.2f | B mean %.3f max %.2f' % (k[:46], sum(a) / len(a), max(a), sum(b) / len(b), max(b)))
