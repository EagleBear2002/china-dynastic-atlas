"""Repair Qing 1820 CHGIS prefecture polygons into a clean planar partition."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

from shapely.geometry import Polygon, mapping, shape
from shapely.ops import polygonize, unary_union
from shapely.strtree import STRtree

ROOT = Path(r"D:\Seafile\中国历代行政区划和政治制度变迁")
DATA = ROOT / "app" / "data"


def load_line(prefix: str):
    for line in (DATA / "qing-chgis.js").read_text(encoding="utf-8").splitlines():
        if line.startswith(prefix):
            return json.loads(line[line.index("{"): line.rindex("}") + 1])
    raise RuntimeError(prefix)


def fill_holes(geom):
    if geom.geom_type == "Polygon":
        return Polygon(geom.exterior)
    if geom.geom_type == "MultiPolygon":
        return type(geom)([Polygon(part.exterior) for part in geom.geoms])
    return geom


def keep_major(geom, min_area=0.20):
    parts = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
    if not parts:
        return geom
    largest = max(part.area for part in parts)
    kept = [part for part in parts if part.area >= max(min_area, largest * 0.02)]
    return type(geom)(kept) if len(kept) > 1 else kept[0]


def planarize(features, mask):
    geoms = []
    for feature in features:
        geom = shape(feature["geometry"])
        if not geom.is_valid:
            geom = geom.buffer(0)
        if not geom.is_empty:
            geoms.append(geom)
    linework = unary_union([geom.boundary for geom in geoms] + [mask.boundary])
    faces = [face for face in polygonize(linework) if face.area > 0.000001]
    tree = STRtree(geoms)
    assigned = defaultdict(list)
    for face in faces:
        point = face.representative_point()
        if not mask.covers(point):
            continue
        candidates = [int(i) for i in tree.query(point)]
        containing = [i for i in candidates if geoms[i].covers(point)]
        if containing:
            chosen = min(containing, key=lambda i: geoms[i].area)
        else:
            chosen = min(range(len(geoms)), key=lambda i: geoms[i].distance(point))
        assigned[chosen].append(face)
    out = []
    for index, group in assigned.items():
        merged = unary_union(group)
        if not merged.is_valid:
            merged = merged.buffer(0)
        if merged.is_empty:
            continue
        source = features[index]
        out.append({
            "type": "Feature",
            "id": source["id"],
            "geometry": mapping(merged),
            "properties": dict(source["properties"]),
        })
    return out


def color_slots(features):
    groups = defaultdict(list)
    for feature in features:
        groups[feature["properties"].get("provinceId")].append(feature)
    for group in groups.values():
        units = defaultdict(list)
        for feature in group:
            key = feature["properties"].get("unitId") or feature["properties"].get("name") or feature["id"]
            units[key].append(feature)
        geoms = {key: unary_union([shape(f["geometry"]) for f in rows]) for key, rows in units.items()}
        assigned = {}
        for key in sorted(geoms, key=lambda k: geoms[k].area, reverse=True):
            used = {assigned[o] for o in assigned if geoms[key].buffer(0.008).intersects(geoms[o])}
            slot = next((i for i in range(8) if i not in used), 0)
            assigned[key] = slot
            for feature in units[key]:
                feature["properties"]["colorSlot"] = slot


def main():
    chgis = load_line("window.__CHGIS_MING__ =")
    provinces = load_line("window.__CHGIS_PROVINCES__ =")
    features = chgis["features"]
    prov_geoms = [shape(f["geometry"]) for f in provinces["features"] if shape(f["geometry"]).is_valid or not shape(f["geometry"]).is_empty]
    mask = unary_union([g.buffer(0) if not g.is_valid else g for g in prov_geoms])
    clean = planarize(features, mask)
    color_slots(clean)
    boundaries = unary_union([shape(f["geometry"]).boundary for f in clean])

    grouped = defaultdict(list)
    for feature in clean:
        grouped[feature["properties"].get("provinceId")].append(shape(feature["geometry"]))
    new_provs = []
    for pid, geoms in grouped.items():
        u = unary_union(geoms)
        if not u.is_valid:
            u = u.buffer(0)
        u = keep_major(fill_holes(u))
        rp = u.representative_point()
        new_provs.append({
            "type": "Feature", "id": pid, "geometry": mapping(u),
            "properties": {"unitId": pid, "unitName": pid, "labelAnchor": [rp.x, rp.y]},
        })
    nation = unary_union([shape(f["geometry"]) for f in new_provs])
    nation = fill_holes(nation) if not nation.is_valid else nation

    boundary_fc = {"type": "FeatureCollection", "features": [{
        "type": "Feature", "id": "qing-boundaries", "geometry": mapping(boundaries),
        "properties": {"kind": "prefecture-boundaries"},
    }]}
    DATA.joinpath("qing-chgis.js").write_text(
        "window.__CHGIS_MING__ = " + json.dumps({"type": "FeatureCollection", "features": clean, "boundaries": boundary_fc}, ensure_ascii=False, separators=(",", ":")) + ";\n"
        + "window.__CHGIS_PROVINCES__ = " + json.dumps({"type": "FeatureCollection", "features": new_provs}, ensure_ascii=False, separators=(",", ":")) + ";\n"
        + "window.__CHGIS_NATION__ = " + json.dumps({"type": "FeatureCollection", "features": [{
            "type": "Feature", "id": "qing", "geometry": mapping(nation),
            "properties": {"unitId": "qing", "unitName": "清", "labelAnchor": [104, 35]},
        }]}, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    snapshot = {
        "key": "1820", "from": 1644, "to": 1912,
        "counties": {"type": "FeatureCollection", "features": []},
        "prefectures": {"type": "FeatureCollection", "features": []},
        "boundaries": boundary_fc, "colorSlots": {},
    }
    DATA.joinpath("qing-boundaries.js").write_text(
        "window.__BOUNDARIES__ = " + json.dumps({"snapshots": {"1820": snapshot}}, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print("clean features", len(clean), "provinces", len(new_provs))
    print("sizes", DATA.joinpath("qing-chgis.js").stat().st_size, DATA.joinpath("qing-boundaries.js").stat().st_size)


if __name__ == "__main__":
    main()
