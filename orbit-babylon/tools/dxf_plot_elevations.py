import ezdxf
from ezdxf import path as ezpath
from collections import Counter
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt

DXF = r"G:/Samir/bablylone_exp_demo/Orbit_Jamnagr/F.F.SLAB DETAIL - OCEAN SQUARE.dxf"
# Region below the floor plans where the elevation titles sit (Y~79)
X0, X1, Y0, Y1 = 8230, 8410, 55, 130

doc = ezdxf.readfile(DXF)
msp = doc.modelspace()

def polys(e):
    t = e.dxftype()
    try:
        if t == 'LINE':
            return [[(e.dxf.start.x, e.dxf.start.y), (e.dxf.end.x, e.dxf.end.y)]]
        if t in ('LWPOLYLINE', 'POLYLINE', 'ARC', 'CIRCLE', 'ELLIPSE', 'SPLINE'):
            pts = [(v.x, v.y) for v in ezpath.make_path(e).flattening(0.5)]
            return [pts] if len(pts) >= 2 else None
    except Exception:
        return None
    return None

inwin = lambda p: X0 <= p[0] <= X1 and Y0 <= p[1] <= Y1
layers = Counter()
kept = []
xs_all, ys_all = [], []
for e in msp:
    pl = polys(e)
    if not pl: continue
    for pts in pl:
        if all(inwin(p) for p in pts):
            kept.append(pts); layers[e.dxf.layer] += 1
            for (x, y) in pts: xs_all.append(x); ys_all.append(y)

print("layers in elevation region:", dict(layers.most_common(12)))
print("polylines:", len(kept))
if xs_all:
    print(f"bbox X[{min(xs_all):.1f},{max(xs_all):.1f}] Y[{min(ys_all):.1f},{max(ys_all):.1f}]")

fig, ax = plt.subplots(figsize=(16, 7))
for pts in kept:
    ax.plot([p[0] for p in pts], [p[1] for p in pts], '-', lw=0.4, color='black')
# mark the elevation title anchors
for (x, y, lab) in [(8272,79,'FRONT'),(8328,79,'LEFT'),(8374,79,'RIGHT')]:
    ax.plot(x, y, 'ro'); ax.annotate(lab, (x, y), color='red', fontsize=8)
ax.set_aspect('equal'); ax.set_title('Elevation region (raw DXF)')
fig.savefig(r"G:/Samir/bablylone_exp_demo/Orbit_Jamnagr/orbit-babylon/tools/elevations.png", dpi=130, bbox_inches='tight')
print("saved tools/elevations.png")
