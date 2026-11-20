# For each arm spike in a steps_audit.mjs log run with SG=1 (and DUMPV=<deg>), print how far (cm) each stage of each arm
# moved between the last frames before it, and the blend weights that changed; pins a snap to the stage that made it.
#   python3 -I sgdiff.py <audit log> [only lines starting with this prefix, e.g. "P0"]
import json, math, sys

STAGES = ['tgt1', 'tP', 'tL', 'tZ', 'tS', 'tI', 'tgt2', 'hand', 'wr2', 'wrB', 'wrL', 'wr3', 'el']
SCAL = ['oneHW', 'twoHW', 'gripW', 'pointW', 'metW', 'cWA', 'armW', 'shD', 'clr', 'limF', 'tw', 'legRun']
pre = sys.argv[2] if len(sys.argv) > 2 else ''
cur = None
for line in open(sys.argv[1]):
    line = line.rstrip()
    if not line.strip().startswith('{'):
        if line.startswith(('P0', 'P1')):
            cur = [] if line.startswith(pre) else None
            if cur is not None:
                print(line)
        continue
    if cur is None:
        continue
    cur.append(json.loads(line.strip()))
    if len(cur) == 6:
        for a, b in zip(cur[-4:-1], cur[-3:]):
            sa, sb = a.get('sg'), b.get('sg')
            if not sa or not sb:
                continue
            parts = []
            for k in STAGES:
                if sa.get(k) and sb.get(k):
                    for i in (0, 1):
                        if sa[k][i] and sb[k][i]:
                            parts.append('%s%d %.0f' % (k, i, 100 * math.dist(sa[k][i], sb[k][i])))
            w = ' '.join('%s %s>%s' % (k, sa.get(k), sb.get(k)) for k in SCAL if sa.get(k) != sb.get(k))
            sh = ''
            if sa.get('sh') and sb.get('sh'):
                sh = ' sh0 %.0f sh1 %.0f' % (100 * math.dist(sa['sh'][0], sb['sh'][0]), 100 * math.dist(sa['sh'][1], sb['sh'][1]))
            print('   %.3f->%.3f  %s |%s %s' % (a['t'], b['t'], ' '.join(parts), sh, w))
        cur = None
