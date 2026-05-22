import json

F = r"G:/Samir/bablylone_exp_demo/Orbit_Jamnagr/orbit-babylon/public/facade_tiles.json"

# user-selected cut openings (tile indices per facade)
CUTS = {"front":[6,7,8,9,10,11,12,16,18,22,25,28,31,38,41,46,49,55,58,63,66,71,74,79,82,87,90,95,98,103,106,111,114,119,120,158,160,161,167,170,171,172,176,180,181,182,185,190,191,192,195,197,198,200,202,207,209,211,213,218,219,221,223,226,236,237,238,246,252,254,259,260,261,263,265,266,268,269,270,271,272,280,281,286,287,291,292,295,296,297,298,300,302,303,304,305,307,308,309,310,312,314,319,320,323,324,325,328,333,336,337,338,339,340],
        "left":[], "right":[]}

d = json.load(open(F))
for kind in ("front", "left", "right"):
    openset = set(CUTS.get(kind, []))
    tiles = d.get(kind, [])
    for i, t in enumerate(tiles):
        t["open"] = (i in openset)
    print(f"{kind}: {len(tiles)} tiles, {len(openset)} marked open")

json.dump(d, open(F, "w"))
print("patched", F)
