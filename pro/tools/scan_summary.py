# Summarise tools/scan.sh output: python3 -I tools/scan_summary.py TAG
import sys, re, json, glob
T = sys.argv[1]; R = '/tmp/rally-work2'
SKIP = {('Federer','fh','alt1'), ('Alcaraz','fh','alt1'), ('Djokovic','fh','alt0'), ('Federer','fh','alt0'), ('Sinner','bh','alt3'), ('Djokovic','bh','alt4')}
bad = []; n = 0
for f in sorted(glob.glob(f'{R}/lc{T}/*.txt')):
    for l in open(f):
        m = re.match(r'(\S+) (\S+) (\S+) (\S+) pen (\[.*?\]) gap (\[.*?\]) rate (\{.*\})', l.strip())
        if not m: continue
        n += 1
        name, kind, wing, clip = m.group(1, 2, 3, 4); pen = json.loads(m.group(5)); gap = json.loads(m.group(6)); rate = json.loads(m.group(7))
        if (name, wing, clip.split('/')[0]) in SKIP or '(off)' in clip: continue
        flags = []
        if pen[0] > 0.05: flags.append('PEN %.1fcm@%s %s' % (pen[0]*100, pen[1], pen[2]))
        if gap[0] > 0.06: flags.append('GAP %.1fcm@%s' % (gap[0]*100, gap[1]))
        for k in ('hit', 'free'):
            if rate[k][0] > 30: flags.append('%s %.1fdeg@%s' % (k, rate[k][0], rate[k][1]))
        if rate.get('rkR', [0])[0] > 25: flags.append('RACKET %.1fdeg@%s' % tuple(rate['rkR']))
        if flags: bad.append('%-9s %-6s %s %-14s %s' % (name, kind, wing, clip, ' | '.join(flags)))
if n: print(n, 'combos;', len(bad), 'flagged'); print('\n'.join(bad))
rows = {}
for f in sorted(glob.glob(f'{R}/fa{T}/aud_*.txt')):
    cur = None
    for line in open(f):
        m = re.match(r'^== (.+?) \((human|computer)\)', line)
        if m: cur = m.group(1); rows[cur] = {}; continue
        m = re.match(r'^  (.+?)\s+([\d.]+)%\s+\((\d+) of (\d+)\)', line)
        if cur and m: rows[cur][m.group(1).strip()] = float(m.group(2))
keys = ['arm > 30 deg/frame in prepared strokes', 'arm > 30 deg/frame in RUSHED strokes', 'arm swing > 35 deg/frame (free)', 'arm swing > 35 deg/frame (hit)', 'arm inside trunk > 5 cm', 'hitting hand off the handle > 4 cm', 'off hand off the racket > 6 cm (gripping)', 'ready position, standing > 0.3 s: off hand > 8 cm off the racket', 'flat foot skating > 1 m/s', 'foot into the court', 'knees knocked together (X legs)', 'legs crossed (> 8 cm)', 'racket turn > 30 deg/frame outside the swing', 'racket inside the trunk or head > 3 cm', 'legs through each other (< 9 cm apart)']
if rows:
    ps = sorted(rows)
    print('%-52s %s' % ('', ' '.join('%5s' % p[:5] for p in ps)))
    for k in keys: print('%-52s %s' % (k[:52], ' '.join('%5.2f' % rows[p].get(k, 0) for p in ps)))
