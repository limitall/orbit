import ezdxf, json
from ezdxf import path as ezpath

DXF = r"G:/Samir/bablylone_exp_demo/Orbit_Jamnagr/F.F.SLAB DETAIL - OCEAN SQUARE.dxf"
OUT = r"G:/Samir/bablylone_exp_demo/Orbit_Jamnagr/orbit-babylon/public/ground_plan.json"

# Ground-floor plan window (metres). Drop the title/furniture strip below Y=227.
X0, X1 = 8260, 8326
Y0, Y1 = 227, 270
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

def inside(pts):
    return all(X0 <= x <= X1 and Y0 <= y <= Y1 for (x, y) in pts)

raw = []
xs, ys = [], []
for e in msp:
    if e.dxf.layer not in LAYERS:
        continue
    polys = polylines(e)
    if not polys:
        continue
    for pts in polys:
        if len(pts) < 2 or not inside(pts):
            continue
        raw.append(pts)
        for (x, y) in pts:
            xs.append(x); ys.append(y)

minx, miny = min(xs), min(ys)
maxx, maxy = max(xs), max(ys)

# translate so plan min-corner = (0,0); keep metres, keep DXF orientation (x->X, y->Z)
lines = [[[round(x - minx, 3), round(y - miny, 3)] for (x, y) in pts] for pts in raw]

data = {
    "unit": "m",
    "width": round(maxx - minx, 3),
    "height": round(maxy - miny, 3),
    "count": len(lines),
    "lines": lines,
}
with open(OUT, "w") as f:
    json.dump(data, f)

print(f"polylines: {len(lines)}")
print(f"plan size: {data['width']} x {data['height']} m")
print(f"wrote {OUT}")
