import json, random
from shapely.geometry import LineString
from shapely.ops import unary_union, polygonize
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MplPoly

DATA = r"G:/Samir/bablylone_exp_demo/Orbit_Jamnagr/orbit-babylon/public/front_elevation.json"
with open(DATA) as f:
    d = json.load(f)

lines = [LineString(pl) for pl in d["lines"] if len(pl) >= 2]
merged = unary_union(lines)
faces = list(polygonize(merged))
print("lines:", len(lines), " polygonized faces:", len(faces))

areas = sorted((f.area for f in faces), reverse=True)
print("largest face areas:", [round(a, 2) for a in areas[:10]])
print("total silhouette area:", round(unary_union(faces).area, 1),
      " bbox:", [round(v, 1) for v in unary_union(faces).bounds])

# classify: interior faces (not touching outer boundary) = candidate openings
sil = unary_union(faces)
outer = sil.exterior if sil.geom_type == 'Polygon' else max(sil.geoms, key=lambda g: g.area).exterior
n_interior = 0
fig, ax = plt.subplots(figsize=(14, 8))
for f in faces:
    touches = f.exterior.distance(outer) < 0.05
    color = '#dddddd' if touches else '#ff6644'
    if not touches:
        n_interior += 1
    ax.add_patch(MplPoly(list(f.exterior.coords), closed=True, facecolor=color, edgecolor='#333', lw=0.3))
print("interior (candidate opening) faces:", n_interior)
ax.set_aspect('equal'); ax.autoscale_view()
ax.set_title('front elevation faces: gray=touches boundary, red=interior(openings?)')
fig.savefig(r"G:/Samir/bablylone_exp_demo/Orbit_Jamnagr/orbit-babylon/tools/elev_faces.png", dpi=130, bbox_inches='tight')
print("saved tools/elev_faces.png")
