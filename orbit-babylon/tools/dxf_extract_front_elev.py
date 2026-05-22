import ezdxf, json
from ezdxf import path as ezpath

DXF = r"G:/Samir/bablylone_exp_demo/Orbit_Jamnagr/F.F.SLAB DETAIL - OCEAN SQUARE.dxf"
OUT = r"G:/Samir/bablylone_exp_demo/Orbit_Jamnagr/orbit-babylon/public/front_elevation.json"

# FRONT elevation drawing (leftmost of the three; title 'FRONT' anchor ~[8272,79])
X0, X1, Y0, Y1 = 8250, 8306, 80.0, 110.0
SKIP_LAYERS = {'DIM', 'Dimention', 'Title', 'text', 'Defpoints', 'BEAM TEXT', 'Column Number'}

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

inwin = lambda p: X0 <= p[0] <= X1 and Y0 <= p[1] <= Y1
raw, xs, ys = [], [], []
for e in msp:
    if e.dxf.layer in SKIP_LAYERS:
        continue
    pls = polylines(e)
    if not pls:
        continue
    for pts in pls:
        if len(pts) >= 2 and all(inwin(p) for p in pts):
            raw.append(pts)
            for (x, y) in pts:
                xs.append(x); ys.append(y)

minx, miny, maxx, maxy = min(xs), min(ys), max(xs), max(ys)
lines = [[[round(x - minx, 3), round(y - miny, 3)] for (x, y) in pts] for pts in raw]
data = {"unit": "m", "width": round(maxx - minx, 3), "height": round(maxy - miny, 3),
        "count": len(lines), "lines": lines}
with open(OUT, "w") as f:
    json.dump(data, f)
print(f"polylines: {len(lines)}  size: {data['width']} x {data['height']} m")
print("wrote", OUT)
