import json, math
import numpy as np
import mapbox_earcut as earcut
from shapely.geometry import LineString
from shapely.ops import unary_union, polygonize

BASE = r"G:/Samir/bablylone_exp_demo/Orbit_Jamnagr/orbit-babylon/public/"
T = 0.3  # facade thickness

with open(BASE + "building.json") as f:
    bd = json.load(f)
minX = minY = minZ = math.inf
maxX = maxY = maxZ = -math.inf
for m in bd["meshes"]:
    p = m["positions"]
    for i in range(0, len(p), 3):
        x, y, z = p[i], p[i+1], p[i+2]
        minX = min(minX, x); maxX = max(maxX, x)
        minY = min(minY, y); maxY = max(maxY, y)
        minZ = min(minZ, z); maxZ = max(maxZ, z)
cX = (minX + maxX) / 2
cZ = (minZ + maxZ) / 2

def make_map(kind, W):
    if kind == "front":
        return lambda h, v, d: (cX - W/2 + h, minY + v, (minZ - 0.3) + d)
    if kind == "left":
        return lambda h, v, d: ((minX - 0.3) + d, minY + v, cZ - W/2 + h)
    return lambda h, v, d: ((maxX + 0.3) - d, minY + v, cZ - W/2 + h)

def unit(a, b):
    v = [b[0]-a[0], b[1]-a[1], b[2]-a[2]]
    n = math.sqrt(sum(c*c for c in v)) or 1.0
    return [c/n for c in v]

def extrude_face(poly, mp):
    positions, normals, indices = [], [], []
    o = mp(0, 0, 0)
    hDir = unit(o, mp(1, 0, 0)); vDir = unit(o, mp(0, 1, 0)); dDir = unit(o, mp(0, 0, 1))
    outerN = [-c for c in dDir]; innerN = list(dDir)
    ext = list(poly.exterior.coords)[:-1]
    holes = [list(r.coords)[:-1] for r in poly.interiors]
    ring_v = ext + [p for h in holes for p in h]
    ring_ends, acc = [len(ext)], len(ext)
    for h in holes:
        acc += len(h); ring_ends.append(acc)
    arr = np.array(ring_v, dtype=np.float64).reshape(-1, 2)
    tri = earcut.triangulate_float64(arr, np.array(ring_ends, dtype=np.uint32))
    for d, nrm, flip in ((0.0, outerN, False), (T, innerN, True)):
        base = len(positions) // 3
        for (h, v) in ring_v:
            positions += list(mp(h, v, d)); normals += nrm
        seq = list(tri)[::-1] if flip else list(tri)
        for idx in seq:
            indices.append(base + int(idx))
    for ring in [poly.exterior, *poly.interiors]:
        cs = list(ring.coords)
        for (h0, v0), (h1, v1) in zip(cs, cs[1:]):
            dh, dv = h1 - h0, v1 - v0
            L = math.hypot(dh, dv)
            if L < 1e-9:
                continue
            nh, nv = dv / L, -dh / L
            wn = [nh*hDir[i] + nv*vDir[i] for i in range(3)]
            b = len(positions) // 3
            for (h, v, d) in [(h0, v0, 0), (h1, v1, 0), (h1, v1, T), (h0, v0, T)]:
                positions += list(mp(h, v, d)); normals += wn
            indices += [b, b+1, b+2, b, b+2, b+3]
    return positions, normals, indices

def is_opening(f, outer):
    if f.exterior.distance(outer) <= 0.03:
        return False
    minx, miny, maxx, maxy = f.bounds
    w = maxx - minx; h = maxy - miny
    asp = h / w if w > 1e-6 else 99
    nv = len(f.exterior.coords)
    if w < 0.55:
        return False
    if 0.6 <= f.area <= 9.0 and asp >= 1.0:
        return True
    if nv >= 10 and f.area <= 3.5:
        return True
    return False

JOBS = {"front": "front_elevation.json", "left": "left_elevation.json", "right": "right_elevation.json"}
out = {}
for kind, fname in JOBS.items():
    with open(BASE + fname) as f:
        d = json.load(f)
    lines = [LineString(pl) for pl in d["lines"] if len(pl) >= 2]
    faces = list(polygonize(unary_union(lines)))
    sil = unary_union(faces)
    geoms = sil.geoms if sil.geom_type == "MultiPolygon" else [sil]
    outer = unary_union([g.exterior for g in geoms])
    mp = make_map(kind, d["width"])
    tiles = []
    for f in faces:
        if f.area < 0.03:
            continue
        pos, nor, idx = extrude_face(f, mp)
        tiles.append({"p": [round(v, 3) for v in pos],
                      "n": [round(v, 3) for v in nor],
                      "i": idx,
                      "open": bool(is_opening(f, outer))})
    out[kind] = tiles
    print(f"{kind}: {len(tiles)} tiles, {sum(t['open'] for t in tiles)} default-open")

with open(BASE + "facade_tiles.json", "w") as f:
    json.dump(out, f)
print("wrote facade_tiles.json")
