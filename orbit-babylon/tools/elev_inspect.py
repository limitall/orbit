import ezdxf
from ezdxf import path as ezpath
from collections import Counter
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt

DXF = r"G:/Samir/bablylone_exp_demo/Orbit_Jamnagr/F.F.SLAB DETAIL - OCEAN SQUARE.dxf"
X0, X1, Y0, Y1 = 8250, 8306, 78, 110   # front elevation region

doc = ezdxf.readfile(DXF)
msp = doc.modelspace()
inwin = lambda p: X0 <= p[0] <= X1 and Y0 <= p[1] <= Y1

by_layer = Counter()
by_type = Counter()
fig, ax = plt.subplots(figsize=(18, 11))
COLORS = {'LINE': 'black', 'ARC': 'red', 'CIRCLE': 'red', 'ELLIPSE': 'red',
          'SPLINE': 'magenta', 'LWPOLYLINE': 'blue', 'POLYLINE': 'blue'}

for e in msp:
    t = e.dxftype()
    try:
        if t == 'LINE':
            pts = [(e.dxf.start.x, e.dxf.start.y), (e.dxf.end.x, e.dxf.end.y)]
        elif t in ('LWPOLYLINE', 'POLYLINE', 'ARC', 'CIRCLE', 'ELLIPSE', 'SPLINE'):
            pts = [(v.x, v.y) for v in ezpath.make_path(e).flattening(0.2)]
        else:
            continue
    except Exception:
        continue
    if len(pts) < 2 or not all(inwin(p) for p in pts):
        continue
    by_layer[e.dxf.layer] += 1
    by_type[t] += 1
    ax.plot([p[0] for p in pts], [p[1] for p in pts], '-', lw=0.6, color=COLORS.get(t, 'green'))

print("=== entity types in front elevation (in-window) ===")
for t, c in by_type.most_common():
    print(f"  {t}: {c}")
print("=== layers ===")
for l, c in by_layer.most_common():
    print(f"  {l}: {c}")

ax.set_aspect('equal'); ax.set_title('FRONT elevation by type: black=LINE, red=ARC/CIRCLE, blue=POLYLINE, magenta=SPLINE')
ax.grid(True, lw=0.2)
fig.savefig(r"G:/Samir/bablylone_exp_demo/Orbit_Jamnagr/orbit-babylon/tools/elev_inspect.png", dpi=120, bbox_inches='tight')
print("saved tools/elev_inspect.png")
