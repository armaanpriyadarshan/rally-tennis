# per filmed frame (every STEP debug lines): u, plW, lead, speed, lateral fraction; and a sheet per stroke with those labels
import json, sys, glob
from PIL import Image, ImageDraw
log, pre, step = sys.argv[1], sys.argv[2], int(sys.argv[3])
strokes, cur = [], []
for l in open(log):
    l = l.strip()
    if l.startswith('filmed'): strokes.append(cur); cur = []; continue
    if l.startswith('{'): cur.append(json.loads(l))
W, H = 230, 290
for s, rows in enumerate(strokes):
    fr = rows[::step]; fs = sorted(glob.glob('%s_%d_*.jpg' % (pre, s)))
    pick = [i for i in range(len(fs)) if i < len(fr) and fr[i]['u'] is not None and -0.35 <= fr[i]['u'] <= 0.35][::2][:12]
    sh = Image.new('RGB', (W * 6, H * 2))
    for j, i in enumerate(pick):
        d = fr[i]; im = Image.open(fs[i]); w, h = im.size; c = im.crop((w // 2 - 330, h // 2 - 250, w // 2 + 330, h // 2 + 580)).resize((W, H))
        ImageDraw.Draw(c).text((3, 3), 'u%.2f %s pl%.1f L%s v%.1f lat%.1f' % (d['u'], d['kind'][:5], d['plW'], d['lead'], d['spd'], d['latK']), fill=(255, 255, 0)); sh.paste(c, ((j % 6) * W, (j // 6) * H))
    sh.save('%s_T%d.jpg' % (pre, s), quality=85)
    print(s, rows[0]['kind'] if rows else None, 'plant' if any(r['plW'] > 0 for r in rows) else 'no plant', 'max spd %.1f' % max(r['spd'] for r in rows))
