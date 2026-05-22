import ezdxf, math
from ezdxf import path as ezpath
from collections import Counter, defaultdict

DXF = r"G:/Samir/bablylone_exp_demo/Orbit_Jamnagr/F.F.SLAB DETAIL - OCEAN SQUARE.dxf"
doc = ezdxf.readfile(DXF)
msp = doc.modelspace()

def text_of(e):
    if e.dxftype() == 'TEXT': return e.dxf.text
    if e.dxftype() == 'MTEXT': return e.text
    return ''

# 1) Look for elevation / section / facade labels anywhere
KW = ('ELEVATION', 'SECTION', 'FRONT', 'REAR', 'SIDE', 'EXTERIOR', 'FACADE',
      'ELEV', 'SEC ', 'A-A', 'B-B', 'C-C', 'X-X', 'Y-Y')
print("=== labels mentioning elevation/section/exterior ===")
hits = 0
for e in msp:
    if e.dxftype() in ('TEXT', 'MTEXT'):
        raw = (text_of(e) or '')
        t = raw.upper()
        if any(k in t for k in KW):
            ins = e.dxf.insert
            # strip MTEXT formatting braces for readability
            clean = raw.replace('\\P', ' ')
            print(f"  [{ins[0]:.0f},{ins[1]:.0f}] {clean[:70]!r}")
            hits += 1
print(f"  ({hits} matches)")

# 2) Geometry on SECTION / STEEL / RCC layers and their extents
print("\n=== extents of structural/section layers ===")
layer_pts = defaultdict(list)
for e in msp:
    lyr = e.dxf.layer
    if lyr not in ('SECTION', 'STEEL', 'RCC Footing', 'PCC', 'Wall', 'SLAB', 'STEP-PLINTH'):
        continue
    try:
        if e.dxftype() == 'LINE':
            layer_pts[lyr] += [(e.dxf.start.x, e.dxf.start.y), (e.dxf.end.x, e.dxf.end.y)]
        elif e.dxftype() in ('LWPOLYLINE', 'POLYLINE', 'ARC', 'CIRCLE'):
            pts = [(v.x, v.y) for v in ezpath.make_path(e).flattening(1.0)]
            layer_pts[lyr] += pts
    except Exception:
        pass
for lyr, pts in layer_pts.items():
    if not pts: continue
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    print(f"  {lyr:14s} n={len(pts):6d} X[{min(xs):.0f},{max(xs):.0f}] Y[{min(ys):.0f},{max(ys):.0f}]")

# 3) Cluster ALL geometry along X to find distinct 'views' on the sheet,
#    and report each cluster's vertical extent (tall clusters => elevations/sections)
print("\n=== geometry density by X-band (width ~200 units) ===")
band = defaultdict(lambda: [math.inf, -math.inf, 0])  # ymin, ymax, count
for e in msp:
    try:
        if e.dxftype() == 'LINE':
            ps = [(e.dxf.start.x, e.dxf.start.y), (e.dxf.end.x, e.dxf.end.y)]
        elif e.dxftype() in ('LWPOLYLINE', 'POLYLINE', 'ARC', 'CIRCLE', 'INSERT', 'TEXT', 'MTEXT'):
            if e.dxftype() in ('INSERT', 'TEXT', 'MTEXT'):
                ins = e.dxf.insert; ps = [(ins[0], ins[1])]
            else:
                ps = [(v.x, v.y) for v in ezpath.make_path(e).flattening(2.0)]
        else:
            continue
    except Exception:
        continue
    for (x, y) in ps:
        b = int(x // 200) * 200
        d = band[b]
        d[0] = min(d[0], y); d[1] = max(d[1], y); d[2] += 1
print("  Xband  yMin  yMax  ySpan  count")
for b in sorted(band):
    ymin, ymax, c = band[b]
    if c < 50: continue
    print(f"  {b:5d}  {ymin:5.0f} {ymax:5.0f}  {ymax-ymin:5.0f}  {c}")
