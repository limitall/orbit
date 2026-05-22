import ezdxf, json
from ezdxf import path as ezpath

DXF = r"G:/Samir/bablylone_exp_demo/Orbit_Jamnagr/F.F.SLAB DETAIL - OCEAN SQUARE.dxf"
OUT = r"G:/Samir/bablylone_exp_demo/Orbit_Jamnagr/orbit-babylon/public/floor_plans.json"

# Plan windows (metres) in the DXF. 2 columns (left/right) x 3 rows.
# Derived from the FF reference (X[8438,8493] Y[229,267]) + per-floor grid offsets,
# confirmed by the floor-title MTEXT positions. Title/furniture strip is below each plan.
WINDOWS = {
    "Ground": (8260, 8327, 227.0, 270.0),
    "First":  (8331, 8398, 227.0, 270.0),
    "Second": (8260, 8327, 175.5, 218.0),
    "Third":  (8331, 8398, 175.5, 218.0),
    "Fourth": (8260, 8327, 132.0, 174.5),
    "Fifth":  (8331, 8398, 131.0, 173.5),
}
LAYERS = {'0', 'Columns'}

doc = ezdxf.readfile(DXF)
msp = doc.modelspace()

def polylines(e):
    t = e.dxftype()
    try:
        if t == 'LINE':
            return [[(e.dxf.start.x, e.dxf.start.y), (e.dxf.end.x, e.dxf.end.y)]]
        if t in ('LWPOLYLINE', 'POLYLINE', 'ARC', 'CIRCLE', 'ELLIPSE', 'SPLINE'):
            p = ezpath.make_path(e)
            pts = [(v.x, v.y) for v in p.flattening(0.4)]
            return [pts] if len(pts) >= 2 else None
    except Exception:
        return None
    return None

# Pre-collect candidate polylines once
cands = []
for e in msp:
    if e.dxf.layer not in LAYERS:
        continue
    polys = polylines(e)
    if not polys:
        continue
    for pts in polys:
        if len(pts) >= 2:
            cands.append(pts)

out = {}
for floor, (X0, X1, Y0, Y1) in WINDOWS.items():
    raw, xs, ys = [], [], []
    for pts in cands:
        if all(X0 <= x <= X1 and Y0 <= y <= Y1 for (x, y) in pts):
            raw.append(pts)
            for (x, y) in pts:
                xs.append(x); ys.append(y)
    if not xs:
        print(f"{floor}: EMPTY"); continue
    minx, miny, maxx, maxy = min(xs), min(ys), max(xs), max(ys)
    lines = [[[round(x - minx, 3), round(y - miny, 3)] for (x, y) in pts] for pts in raw]
    out[floor] = {"width": round(maxx - minx, 3), "height": round(maxy - miny, 3),
                  "count": len(lines), "lines": lines}
    print(f"{floor}: {len(lines)} polylines, {out[floor]['width']} x {out[floor]['height']} m")

with open(OUT, "w") as f:
    json.dump({"unit": "m", "floors": out}, f)
print("wrote", OUT)
