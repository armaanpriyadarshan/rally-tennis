# like filmtrace.py, but every frame from u >= U0, 12 per row, two rows per stroke
import json, sys, glob
from PIL import Image, ImageDraw
log, pre, U0 = sys.argv[1], sys.argv[2], float(sys.argv[3])
strokes, cur = [], []
for l in open(log):
    l = l.strip()
    if l.startswith('filmed'): strokes.append(cur); cur = []; continue
    if l.startswith('{'): cur.append(json.loads(l))
W, H = 150, 200
for s, rows in enumerate(strokes):
    fr = rows[::3]; fs = sorted(glob.glob('%s_%d_*.jpg' % (pre, s)))
    pick = [i for i in range(min(len(fs), len(fr))) if fr[i]['u'] is not None and fr[i]['u'] >= U0][:24]
    sh = Image.new('RGB', (W * 12, H * 2))
    for j, i in enumerate(pick):
        d = fr[i]; im = Image.open(fs[i]); w, h = im.size; c = im.crop((w // 2 - 300, h // 2 - 250, w // 2 + 300, h // 2 + 550)).resize((W, H))
        ImageDraw.Draw(c).text((2, 2), 'u%.2f v%.1f' % (d['u'], d['spd']), fill=(255, 255, 0)); sh.paste(c, ((j % 12) * W, (j // 12) * H))
    sh.save('%s_V%d.jpg' % (pre, s), quality=85)
