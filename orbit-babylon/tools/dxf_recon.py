import ezdxf
from collections import Counter

DXF = r"G:/Samir/bablylone_exp_demo/Orbit_Jamnagr/F.F.SLAB DETAIL - OCEAN SQUARE.dxf"

doc = ezdxf.readfile(DXF)
msp = doc.modelspace()

print("=== LAYERS ===")
for l in doc.layers:
    print(" ", l.dxf.name)

types = Counter(e.dxftype() for e in msp)
print("\n=== MODELSPACE ENTITY TYPES ===")
for t, c in types.most_common():
    print(f"  {t}: {c}")

# Overall extents
xs, ys = [], []
def acc(p):
    xs.append(p[0]); ys.append(p[1])
for e in msp:
    try:
        if e.dxftype() == 'LINE':
            acc(e.dxf.start); acc(e.dxf.end)
        elif e.dxftype() in ('TEXT','MTEXT','INSERT','CIRCLE','ARC'):
            acc(e.dxf.insert if e.dxftype() in ('TEXT','MTEXT','INSERT') else e.dxf.center)
    except Exception:
        pass
if xs:
    print(f"\n=== EXTENTS ===\n  X[{min(xs):.1f}, {max(xs):.1f}]  Y[{min(ys):.1f}, {max(ys):.1f}]")

# Floor labels
print("\n=== TEXT/MTEXT with floor keywords ===")
KW = ('GROUND','FIRST','SECOND','THIRD','FOURTH','FIFTH','BASEMENT','TERRACE','PLAN','FLOOR')
def text_of(e):
    if e.dxftype()=='TEXT': return e.dxf.text
    if e.dxftype()=='MTEXT': return e.text
    return ''
for e in msp:
    if e.dxftype() in ('TEXT','MTEXT'):
        t = (text_of(e) or '').upper()
        if any(k in t for k in KW):
            try:
                ins = e.dxf.insert
                print(f"  [{ins[0]:.1f}, {ins[1]:.1f}] h={getattr(e.dxf,'height',0):.1f}  {text_of(e)[:60]!r}")
            except Exception:
                print(f"  (no insert) {text_of(e)[:60]!r}")
