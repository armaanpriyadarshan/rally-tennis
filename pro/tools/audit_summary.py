# Summarise a folder of steps_audit.mjs logs (one per match): a table of the key rates per player and role, the maximum
# of each, and every arm frame at or above MIN degrees with its stroke context.
#   python3 -I audit_summary.py <dir of *.log> [MIN=45]
import glob, json, re, sys

d = sys.argv[1]
MIN = int(sys.argv[2]) if len(sys.argv) > 2 else 45
rows = {}
for fn in sorted(glob.glob(d + '/*.log')):
    cur = None
    for line in open(fn):
        m = re.match(r'^== (\w+) \((human|computer)\)', line)
        if m:
            cur = m.group(1) + ('(H)' if m.group(2) == 'human' else '(C)')
            rows.setdefault(cur, {})
            continue
        m = re.match(r'^  (.+?)\s{2,}([\d.]+)%', line)
        if cur and m:
            rows[cur][m.group(1).strip()] = float(m.group(2))
keys = [('arm swing > 35 deg/frame (free)', 'sw35F'), ('arm swing > 35 deg/frame (hit)', 'sw35H'),
        ('free hand on hip while running', 'hipF'), ('racket hand on hip while running', 'hipR'),
        ('chicken wing', 'wing'), ('arm inside trunk > 5 cm', 'trunk'), ('both feet down < 8 cm apart', 'feetTog'),
        ('flat foot skating > 1 m/s', 'skate'), ('racket into the court (< 1 cm)', 'rkCourt'), ('foot into the court', 'ftCourt')]
print('%-12s' % '', ' '.join('%7s' % k[1] for k in keys))
for p in sorted(rows):
    print('%-12s' % p, ' '.join('%7.2f' % rows[p].get(k[0], 0) for k in keys))
if rows:
    print('%-12s' % 'MAX', ' '.join('%7.2f' % max(rows[p].get(k[0], 0) for p in rows) for k in keys))
big = []
for fn in sorted(glob.glob(d + '/*.log')):
    L = open(fn).read().split('\n')
    for i, line in enumerate(L):
        m = re.match(r'^(P[01]) (free|hit) (\d+) deg at', line)
        if m and int(m.group(3)) >= MIN:
            r = [x for x in L[i + 1:i + 8] if x.strip().startswith('{')]
            h = json.loads(r[-1].strip()) if r else {}
            big.append('%s %s | %s %s u%s spd%s %s' % (fn.split('/')[-1][:-4], line.strip(), h.get('kind'), h.get('wing'), h.get('u'), h.get('spd'), h.get('ph')))
print(len(big), 'arm frames >=', MIN, 'deg in', len(glob.glob(d + '/*.log')), 'matches')
for b in big:
    print(' ', b)
