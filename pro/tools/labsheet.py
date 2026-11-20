# Tile pose-lab strips into one sheet: python3 -I labsheet.py out.jpg label1=glob1 label2=glob2 ... (one row per glob,
# frames cropped to the middle of the picture, where the lab's camera keeps the player)
import sys, glob
from PIL import Image, ImageDraw
out, rows = sys.argv[1], [a.split('=', 1) for a in sys.argv[2:]]
strips = [(lab, sorted(glob.glob(g))) for lab, g in rows]
n = max(len(f) for _, f in strips); W = 150; Hh = 230
sheet = Image.new('RGB', (W * n + 90, Hh * len(strips)), 'white'); d = ImageDraw.Draw(sheet)
for r, (lab, fs) in enumerate(strips):
    d.text((4, r * Hh + 4), lab, fill='black')
    for c, f in enumerate(fs):
        im = Image.open(f); w, h = im.size; cw, ch = int(h * 0.62), int(h * 0.95)
        sheet.paste(im.crop(((w - cw) // 2, (h - ch) // 2, (w + cw) // 2, (h + ch) // 2)).resize((W, Hh)), (90 + c * W, r * Hh))
sheet.save(out, quality=88); print(out, sheet.size)
