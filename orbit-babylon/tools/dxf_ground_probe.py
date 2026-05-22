import ezdxf
from ezdxf import path as ezpath
from collections import Counter

DXF = r"G:/Samir/bablylone_exp_demo/Orbit_Jamnagr/F.F.SLAB DETAIL - OCEAN SQUARE.dxf"
# Candidate Ground-floor window (metres), generous margin
X0, X1 = 8255, 8330
Y0, Y1 = 224, 270

doc = ezdxf.readfile(DXF)
msp = doc.modelspace()

def seg_from(e):
    """Return list of (x,y) polylines for an entity, else None."""
    t = e.dxftype()
    try:
        if t == 'LINE':
            return [[(e.dxf.start.x, e.dxf.start.y), (e.dxf.end.x, e.dxf.end.y)]]
        if t in ('LWPOLYLINE','POLYLINE','ARC','CIRCLE','ELLIPSE','SPLINE'):
            p = ezpath.make_path(e)
            pts = [(v.x, v.y) for v in p.flattening(0.5)]
            return [pts] if len(pts) >= 2 else None
    except Exception:
        return None
    return None

def in_window(pts):
    return all(X0 <= x <= X1 and Y0 <= y <= Y1 for (x, y) in pts)

layer_counts = Counter()
kept = []
allxs, allys = [], []
for e in msp:
    polys = seg_from(e)
    if not polys:
        continue
    for pts in polys:
        if in_window(pts):
            layer_counts[e.dxf.layer] += 1
            kept.append((e.dxf.layer, pts))
            for (x, y) in pts:
                allxs.append(x); allys.append(y)

print("=== layers in Ground window ===")
for l, c in layer_counts.most_common():
    print(f"  {l}: {c}")
print(f"\nkept polylines: {len(kept)}")
if allxs:
    print(f"tight bbox: X[{min(allxs):.1f},{max(allxs):.1f}] Y[{min(allys):.1f},{max(allys):.1f}]  "
          f"size {max(allxs)-min(allxs):.1f} x {max(allys)-min(allys):.1f}")

# Quick PNG to verify visually
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(10, 7))
    for layer, pts in kept:
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        ax.plot(xs, ys, '-', lw=0.4, color='black')
    ax.set_aspect('equal'); ax.set_title('Ground-floor window (raw DXF)')
    fig.savefig(r"G:/Samir/bablylone_exp_demo/Orbit_Jamnagr/orbit-babylon/tools/ground_probe.png", dpi=130, bbox_inches='tight')
    print("PNG saved: tools/ground_probe.png")
except Exception as ex:
    print("matplotlib unavailable:", ex)
