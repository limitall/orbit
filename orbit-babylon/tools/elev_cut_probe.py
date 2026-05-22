import json
from shapely.geometry import LineString
from shapely.ops import unary_union, polygonize
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MplPoly

DATA = r"G:/Samir/bablylone_exp_demo/Orbit_Jamnagr/orbit-babylon/public/front_elevation.json"
with open(DATA) as f:
    d = json.load(f)

lines = [LineString(pl) for pl in d["lines"] if len(pl) >= 2]
faces = list(polygonize(unary_union(lines)))
sil = unary_union(faces)
geoms = sil.geoms if sil.geom_type == 'MultiPolygon' else [sil]
outer = unary_union([g.exterior for g in geoms])

def metrics(f):
    minx, miny, maxx, maxy = f.bounds
    w = maxx - minx; h = maxy - miny
    asp = h / w if w > 1e-6 else 99
    return w, h, asp, len(f.exterior.coords)

# WINDOW opening: interior face that is either a tall window body OR a curved
# arch cap. Unioning the two merges each window into a full capsule shape.
def is_opening(f):
    if f.exterior.distance(outer) <= 0.03:
        return False
    w, h, asp, nv = metrics(f)
    if w < 0.55:          # thin piers / witness lines stay as wall
        return False
    if 0.6 <= f.area <= 9.0 and asp >= 1.0:   # window body
        return True
    if nv >= 10 and f.area <= 3.5:            # arched cap (completes the window top)
        return True
    return False

open_faces = [f for f in faces if is_opening(f)]
rej_interior = [f for f in faces
                if f.exterior.distance(outer) > 0.03 and f not in open_faces]
openings = unary_union(open_faces)
wall = sil.difference(openings)
print(f"faces={len(faces)} openings={len(open_faces)} rejected_interior={len(rej_interior)}")
print(f"sil={sil.area:.0f} wall={wall.area:.0f} open={openings.area:.0f}")

fig, ax = plt.subplots(figsize=(18, 10))
wpolys = list(wall.geoms) if wall.geom_type == 'MultiPolygon' else [wall]
for p in wpolys:
    ax.add_patch(MplPoly(list(p.exterior.coords), closed=True, facecolor='#9aa', edgecolor='#234', lw=0.4))
    for h in p.interiors:
        ax.add_patch(MplPoly(list(h.coords), closed=True, facecolor='white', edgecolor='#d22', lw=0.8))
# show rejected interior faces (yellow) to judge what we missed
for f in rej_interior:
    ax.add_patch(MplPoly(list(f.exterior.coords), closed=True, facecolor='none', edgecolor='#e8a200', lw=0.6))
ax.set_aspect('equal'); ax.autoscale_view()
ax.set_title('wall=gray, cut openings=white(red edge), rejected interior=yellow')
fig.savefig(r"G:/Samir/bablylone_exp_demo/Orbit_Jamnagr/orbit-babylon/tools/elev_cut.png", dpi=120, bbox_inches='tight')
print("saved tools/elev_cut.png")
