import ezdxf, json
from ezdxf import path as ezpath

DXF = r"G:/Samir/bablylone_exp_demo/Orbit_Jamnagr/F.F.SLAB DETAIL - OCEAN SQUARE.dxf"
BASE = r"G:/Samir/bablylone_exp_demo/Orbit_Jamnagr/orbit-babylon/public/"

# Side elevation windows (from the three titles: LEFT ~[8328,79], RIGHT ~[8374,79])
JOBS = {
    "left_elevation.json":  (8307, 8357, 80.0, 110.0),
    "right_elevation.json": (8358, 8402, 80.0, 110.0),
}
SKIP = {'DIM', 'Dimention', 'Title', 'text', 'Defpoints', 'BEAM TEXT', 'Column Number'}

doc = ezdxf.readfile(DXF)
msp = doc.modelspace()

def polylines(e):
    t = e.dxftype()
    try:
        if t == 'LINE':
            return [[(e.dxf.start.x, e.dxf.start.y), (e.dxf.end.x, e.dxf.end.y)]]
        if t in ('LWPOLYLINE', 'POLYLINE', 'ARC', 'CIRCLE', 'ELLIPSE', 'SPLINE'):
            pts = [(v.x, v.y) for v in ezpath.make_path(e).flattening(0.25)]
            return [pts] if len(pts) >= 2 else None
    except Exception:
        return None
    return None

# pre-collect once
cands = []
for e in msp:
    if e.dxf.layer in SKIP:
        continue
    pls = polylines(e)
    if pls:
        cands.extend(pls)

for fname, (X0, X1, Y0, Y1) in JOBS.items():
    inwin = lambda p: X0 <= p[0] <= X1 and Y0 <= p[1] <= Y1
    raw, xs, ys = [], [], []
    for pts in cands:
        if len(pts) >= 2 and all(inwin(p) for p in pts):
            raw.append(pts)
            for (x, y) in pts:
                xs.append(x); ys.append(y)
    if not xs:
        print(fname, "EMPTY"); continue
    minx, miny, maxx, maxy = min(xs), min(ys), max(xs), max(ys)
    lines = [[[round(x - minx, 3), round(y - miny, 3)] for (x, y) in pts] for pts in raw]
    data = {"unit": "m", "width": round(maxx - minx, 3), "height": round(maxy - miny, 3),
            "count": len(lines), "lines": lines}
    with open(BASE + fname, "w") as f:
        json.dump(data, f)
    print(f"{fname}: {len(lines)} polylines, {data['width']} x {data['height']} m")
