# Photo-scanned ground textures (Poly Haven, CC0) reduced to what the game needs: the grain
# of the surface as a neutral detail map (the court's colour is painted separately), plus
# the scan's normal and roughness maps.
import sys, numpy as np
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
for name, key in [('rubberized_track', 'hard'), ('baseball_playground', 'clay'), ('grass_ground', 'grass'), ('brushed_concrete', 'concrete')]:
    d = np.asarray(Image.open(f'{src}/{name}_diff.jpg').convert('RGB')).astype(np.float32) / 255
    lum = d @ np.array([0.3, 0.55, 0.15], np.float32)
    det = np.clip(lum / lum.mean() * 0.5, 0, 1)                       # 0.5 = leave the paint as it is
    Image.fromarray((det * 255).astype(np.uint8)).save(f'{out}/{key}_detail.jpg', quality=88, optimize=True)
    Image.open(f'{src}/{name}_nor_gl.jpg').convert('RGB').save(f'{out}/{key}_normal.jpg', quality=88, optimize=True)
    Image.open(f'{src}/{name}_rough.jpg').convert('L').save(f'{out}/{key}_rough.jpg', quality=85, optimize=True)
    r = np.asarray(Image.open(f'{src}/{name}_rough.jpg').convert('L')).astype(np.float32) / 255
    print(key, 'detail std %.3f' % det.std(), 'rough mean %.2f' % r.mean())
