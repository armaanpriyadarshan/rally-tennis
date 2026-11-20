# Tile audit SNAPAT pictures (tv, behind, front per moment) into one sheet: python3 -I snapsheet.py DIR OUT
import sys, glob
from PIL import Image, ImageDraw
d, out = sys.argv[1], sys.argv[2]
fs = sorted(glob.glob(d + '/[0-9]*.jpg')); labels = {}
for l in open(d + '/labels.txt') if __import__('os').path.exists(d + '/labels.txt') else []: k, lab = l.rstrip('\n').split(' ', 1); labels[int(k)] = lab
rows = []
for k in range(0, len(fs), 3):
    tiles = []
    for q, f in enumerate(fs[k:k + 3]):
        im = Image.open(f); w, h = im.size
        c = im.crop((int(w * 0.2), int(h * 0.3), int(w * 0.8), h)) if q == 0 else im.crop((int(w * 0.3), 0, int(w * 0.7), h))
        c = c.resize((int(c.width * 360 / c.height), 360)); ImageDraw.Draw(c).text((6, 6), labels.get(k + q, ''), fill=(255, 255, 0)); tiles.append(c)
    W = sum(t.width for t in tiles); r = Image.new('RGB', (W, 360)); x = 0
    for t in tiles: r.paste(t, (x, 0)); x += t.width
    rows.append(r)
W = max(r.width for r in rows); S = Image.new('RGB', (W, 360 * len(rows)))
for i, r in enumerate(rows): S.paste(r, (0, 360 * i))
S.save(out, quality=85); print(S.size)
