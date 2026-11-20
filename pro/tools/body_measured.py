# Limb girth measured from photographs and slow-motion footage (/tmp/rally-work/body/proportions.json, written by
# the tracking tools) turned into multipliers the game's body builder takes. Only measurements marked trusted are
# used; each is clamped to a plausible range, since a mask cut across a limb can still swap sides or catch a sleeve.
#   python3 -I tools/body_measured.py <proportions.json> js/bodydata.js
import json, sys
d = json.load(open(sys.argv[1])); out = {}
MAP = {'upperL': 'armL', 'upperR': 'armR', 'foreL': 'foreL', 'foreR': 'foreR', 'calfL': 'calf', 'calfR': 'calf', 'thighL': 'legs', 'thighR': 'legs'}
for name, P in d.items():
    if name.startswith('_'): continue
    W = P.get('widths', {}); acc = {}
    for k, key in MAP.items():
        w = W.get(k)
        if not w or not w.get('trust') or w.get('rel') is None: continue
        acc.setdefault(key, []).append(min(1.15, max(0.88, w['rel'])))
    if acc: out[name] = {k: round(sum(v) / len(v), 3) for k, v in acc.items()}
with open(sys.argv[2], 'w') as f:
    f.write('// Limb girth per player against the roster, measured (tools/body_measured.py). Only trusted readings, clamped\n'
            '// to 0.88-1.15; looks.js averages them with the judged build.\n')
    f.write('export const BODY_MEASURED = ' + json.dumps(out, separators=(',', ':')) + ';\n')
print(json.dumps(out))
