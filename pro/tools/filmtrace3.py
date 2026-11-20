# film sheet labelled with the ball's lateral offset (relX, + forehand side) and depth (relZ, + in front)
import json, sys, glob
from PIL import Image, ImageDraw
log, pre = sys.argv[1], sys.argv[2]
strokes, cur = [], []
for l in open(log):
    l = l.strip()
    if l.startswith('filmed'): strokes.append(cur); cur = []; continue
    if l.startswith('{'): cur.append(json.loads(l))
W, H = 230, 290
for s, rows in enumerate(strokes):
    fr = rows[::3]; fs = sorted(glob.glob('%s_%d_*.jpg' % (pre, s)))
    pick = [i for i in range(min(len(fs), len(fr))) if fr[i]['u'] is not None and -0.3 <= fr[i]['u'] <= 0.3][::2][:6]
    c0 = min(rows, key=lambda d: abs(d['u'] or 9))
    sh = Image.new('RGB', (W * 6, H))
    for j, i in enumerate(pick):
        d = fr[i]; im = Image.open(fs[i]); w, h = im.size; c = im.crop((w // 2 - 330, h // 2 - 300, w // 2 + 330, h // 2 + 530)).resize((W, H))
        ImageDraw.Draw(c).text((3, 3), 'u%.2f %s x%.2f z%.2f' % (d['u'], d['kind'][:5], c0['relX'], c0['relZ']), fill=(255, 255, 0)); sh.paste(c, (j * W, 0))
    sh.save('%s_J%d.jpg' % (pre, s), quality=85)
    print(pre.split('/')[-1], s, c0['kind'], c0['wing'], 'contact relX %.2f relZ %.2f' % (c0['relX'], c0['relZ']))
