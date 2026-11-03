"""Build approximate but irregular county/prefecture polygons for the Ming prototype.

Method:
1. Match each 1600 county seat to the modern county polygon that contains it
   (geoBoundaries CHN ADM2, ODC PDDL 1.0).
2. Use the modern county polygon as the outer shape. If several historical county
   seats fall in one modern county, split that polygon with a Voronoi diagram.
3. Dissolve county polygons into prefecture polygons for the second-level colour bands.
4. Store era snapshots for the few provincial changes the prototype can model.

This is a visual reconstruction, not a scholarly boundary; the UI must say so.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

from shapely.geometry import MultiPoint, Point, mapping, shape
from shapely.ops import polygonize, unary_union, voronoi_diagram
from shapely.prepared import prep
from shapely.strtree import STRtree

ROOT = Path(r"D:\Seafile\中国历代行政区划和政治制度变迁")
APP = ROOT / "app"
SRC = ROOT / "vendor" / "historical-map-project"
MODERN = SRC / "data" / "external" / "geoBoundaries-CHN-ADM2_simplified.geojson"
OUT = APP / "data"

SNAPSHOTS = [
    {"key": "1368", "from": 1368, "to": 1381, "excludeProvince": ["yunnan", "guizhou"], "excludeParent": ["yunyang-prefecture"], "label": "洪武初年"},
    {"key": "1382", "from": 1382, "to": 1412, "excludeProvince": ["guizhou"], "excludeParent": ["yunyang-prefecture"], "label": "云南建省后"},
    {"key": "1413", "from": 1413, "to": 1475, "excludeProvince": [], "excludeParent": ["yunyang-prefecture"], "label": "贵州建省后"},
    {"key": "1476", "from": 1476, "to": 1644, "excludeProvince": [], "excludeParent": [], "label": "郧阳设府后"},
]


def load_data():
    text = (OUT / "ming-data.js").read_text(encoding="utf-8")
    data = json.loads(text[text.index("{"): text.rindex("}") + 1])
    baseline = json.load(open(SRC / "public" / "reference" / "province-baseline.geojson", encoding="utf-8"))
    modern = json.load(open(MODERN, encoding="utf-8"))
    return data, baseline, modern


def round_coords(value, digits=4):
    if isinstance(value, float):
        return round(value, digits)
    if isinstance(value, (list, tuple)):
        return [round_coords(item, digits) for item in value]
    if isinstance(value, dict):
        return {key: round_coords(item, digits) for key, item in value.items()}
    return value


def load_modern(modern):
    geoms, props, preps = [], [], []
    for feature in modern["features"]:
        geom = shape(feature["geometry"])
        if not geom.is_valid:
            geom = geom.buffer(0)
        geoms.append(geom)
        props.append(feature.get("properties", {}))
        preps.append(prep(geom))
    tree = STRtree(geoms)
    return geoms, props, preps, tree


def nearest_modern_index(point, geoms, preps, tree, max_distance=0.18):
    for position in tree.query(point):
        index = int(position)
        if preps[index].contains(point):
            return index
    position = int(tree.nearest(point))
    if geoms[position].distance(point) <= max_distance:
        return position
    return None


def county_prefecture_id(unit):
    chain = [item for item in unit.get("ancestry", []) if item.get("level") not in ("province", "capital-region")]
    return chain[0]["id"] if chain else unit.get("parentId")


def planarize_county_features(features):
    """Split the county polygons into a single non-overlapping planar partition.

    The original county polygons can overlap because several historical seats share a
    modern county, or because a fallback territory polygon overlaps a seat polygon.
    We dissolve all boundaries, polygonize the resulting line network, and assign each
    face to the smallest containing source polygon. The resulting fills never overlap.
    """
    geoms = []
    for feature in features:
        geom = shape(feature["geometry"])
        if not geom.is_valid:
            geom = geom.buffer(0)
        geoms.append(geom)
    if not geoms:
        return features
    linework = unary_union([geom.boundary for geom in geoms])
    faces = [face for face in polygonize(linework) if face.area > 0.000001]
    if not faces:
        return features
    tree = STRtree(geoms)
    assigned = defaultdict(list)
    for face in faces:
        point = face.representative_point()
        candidates = [int(index) for index in tree.query(point)]
        containing = [index for index in candidates if geoms[index].covers(point)]
        if not containing:
            continue
        # Prefer the smallest containing source polygon, which is normally the
        # explicit county rather than a broad fallback territory.
        chosen = min(containing, key=lambda index: geoms[index].area)
        assigned[chosen].append(face)
    output = []
    for index, face_group in assigned.items():
        merged = unary_union(face_group)
        if merged.is_empty:
            continue
        source = features[index]
        properties = dict(source["properties"])
        output.append({
            "type": "Feature",
            "id": source["id"],
            "geometry": round_coords(mapping(merged), 5),
            "properties": properties,
        })
    return output


def build_snapshot(data, baseline, modern_geoms, modern_props, modern_preps, modern_tree, snapshot):
    units = data["units"]
    by_id = {unit["id"]: unit for unit in units}
    provinces = {unit["id"]: unit for unit in units if unit["level"] in ("province", "capital-region")}
    counties = [
        unit for unit in units
        if unit["level"] == "county"
        and unit["provinceId"] not in snapshot["excludeProvince"]
        and unit["parentId"] not in snapshot["excludeParent"]
    ]
    province_geoms = {}
    for feature in baseline["features"]:
        unit_id = feature["properties"].get("unitId")
        if unit_id in provinces:
            province_geoms[unit_id] = shape(feature["geometry"])

    county_features = []
    for province_id, province_geom in province_geoms.items():
        rows = [unit for unit in counties if unit["provinceId"] == province_id]
        if not rows:
            continue
        groups = defaultdict(list)
        for unit in rows:
            point = Point(unit["lon"], unit["lat"])
            index = nearest_modern_index(point, modern_geoms, modern_preps, modern_tree)
            if index is not None:
                groups[index].append(unit)

        for modern_index, group in groups.items():
            base = modern_geoms[modern_index].intersection(province_geom)
            if base.is_empty:
                continue
            if not base.is_valid:
                base = base.buffer(0)
            if base.is_empty:
                continue
            if len(group) == 1:
                pieces = [(group, base)]
            else:
                # Split the modern county among co-located historical seats by Voronoi.
                grouped = defaultdict(list)
                for unit in group:
                    key = (round(unit["lon"], 4), round(unit["lat"], 4))
                    grouped[key].append(unit)
                reps = [Point(key[0], key[1]) for key in grouped]
                try:
                    vor = voronoi_diagram(MultiPoint(reps), envelope=base.envelope.buffer(0.2), edges=False)
                    cells = [poly for poly in vor.geoms if poly.geom_type == "Polygon"]
                except Exception:
                    cells = []
                pieces = []
                for key, clustered in grouped.items():
                    point = Point(key[0], key[1])
                    cell = next((poly for poly in cells if poly.covers(point)), None) if cells else None
                    clipped = (cell.intersection(base) if cell is not None else base)
                    if clipped.is_empty:
                        continue
                    if not clipped.is_valid:
                        clipped = clipped.buffer(0)
                    pieces.append((clustered, clipped))

            for clustered, geometry in pieces:
                geometry = geometry.simplify(0.012, preserve_topology=True)
                if geometry.is_empty:
                    continue
                first = clustered[0]
                pref_id = county_prefecture_id(first)
                pref = by_id.get(pref_id, {})
                county_features.append({
                    "type": "Feature",
                    "id": first["id"],
                    "geometry": round_coords(mapping(geometry), 4),
                    "properties": {
                        "id": first["id"],
                        "ids": [unit["id"] for unit in clustered],
                        "names": [unit["name"] for unit in clustered],
                        "name": first["name"],
                        "level": "county",
                        "provinceId": province_id,
                        "prefId": pref_id,
                        "prefName": pref.get("name", ""),
                    },
                })

        # Modern counties without an explicit Ming county seat still need a fill and a
        # click target. Assign them to the nearest prefecture/department of the same
        # province; clicking that area opens the upper-level unit, not a fake county.
        assigned = set(groups.keys())
        pref_candidates = [
            unit for unit in units
            if unit["provinceId"] == province_id
            and unit["level"] in ("prefecture", "department")
            and unit.get("lon") is not None
        ]
        fallback = [by_id[province_id]] if province_id in by_id else []
        for modern_index, modern_geom in enumerate(modern_geoms):
            if modern_index in assigned:
                continue
            base = modern_geom.intersection(province_geom)
            if base.is_empty:
                continue
            if not base.is_valid:
                base = base.buffer(0)
            if base.is_empty:
                continue
            point = base.representative_point()
            candidates = pref_candidates or fallback
            if not candidates:
                continue
            pref_target = min(candidates, key=lambda unit: (unit["lon"] - point.x) ** 2 + (unit["lat"] - point.y) ** 2)
            county_target = min(rows, key=lambda unit: (unit["lon"] - point.x) ** 2 + (unit["lat"] - point.y) ** 2)
            distance_to_county = ((county_target["lon"] - point.x) ** 2 + (county_target["lat"] - point.y) ** 2) ** 0.5
            # Urban districts around a historical county seat should read as county-level
            # territory; remote districts without any county seat go to the upper unit.
            target = county_target if distance_to_county <= 0.42 else pref_target
            target_is_county = target is county_target
            pref_id = county_prefecture_id(target) if target_is_county else target["id"]
            pref = by_id.get(pref_id, {})
            base = base.simplify(0.015, preserve_topology=True)
            county_features.append({
                "type": "Feature",
                "id": f"territory-{province_id}-{modern_index}",
                "geometry": round_coords(mapping(base), 4),
                "properties": {
                    "id": f"territory-{province_id}-{modern_index}",
                    "ids": [],
                    "names": [],
                    "name": target["name"],
                    "level": "territory",
                    "provinceId": province_id,
                    "prefId": pref_id,
                    "prefName": pref.get("name", ""),
                    "targetUnitId": target["id"],
                    "targetType": "county" if target_is_county else "prefecture",
                },
            })

    county_features = planarize_county_features(county_features)

    # Dissolve counties into the second-level (prefecture/department) polygons.
    pref_groups = defaultdict(list)
    for feature in county_features:
        pref_groups[feature["properties"]["prefId"]].append(shape(feature["geometry"]))
    prefecture_features = []
    for pref_id, geometries in pref_groups.items():
        cleaned = []
        for geometry in geometries:
            if not geometry.is_valid:
                geometry = geometry.buffer(0)
            if not geometry.is_empty:
                cleaned.append(geometry)
        if not cleaned:
            continue
        union = unary_union(cleaned)
        if union.is_empty:
            continue
        union = union.simplify(0.015, preserve_topology=True)
        pref = by_id.get(pref_id, {})
        province_id = pref.get("provinceId", "")
        prefecture_features.append({
            "type": "Feature",
            "id": pref_id,
            "geometry": round_coords(mapping(union), 4),
            "properties": {"id": pref_id, "name": pref.get("name", ""), "provinceId": province_id},
        })

    # Build one boundary network before filling. Each shared edge is dissolved and
    # drawn once, instead of being stroked twice by two adjacent polygons.
    boundary_parts = []
    for feature in county_features:
        geom = shape(feature["geometry"])
        if not geom.is_valid:
            geom = geom.buffer(0)
        if not geom.is_empty:
            boundary_parts.append(geom.boundary)
    boundary_geom = unary_union(boundary_parts).simplify(0.004, preserve_topology=True)
    boundary_features = [{
        "type": "Feature",
        "id": f"boundary-{snapshot['key']}",
        "geometry": round_coords(mapping(boundary_geom), 4),
        "properties": {"kind": "county-boundaries"},
    }]

    # Greedy graph-colouring for the second-level units, so adjacent prefectures
    # inside one province never receive the same shade.
    by_province = defaultdict(list)
    for feature in prefecture_features:
        by_province[feature["properties"]["provinceId"]].append(feature)
    color_slots = {}
    for province_id, features in by_province.items():
        geoms = []
        for feature in features:
            geom = shape(feature["geometry"])
            geoms.append(geom if geom.is_valid else geom.buffer(0))
        neighbors = {feature["id"]: set() for feature in features}
        for index, feature in enumerate(features):
            for other_index in range(index + 1, len(features)):
                other = features[other_index]
                if geoms[index].distance(geoms[other_index]) < 0.004:
                    neighbors[feature["id"]].add(other["id"])
                    neighbors[other["id"]].add(feature["id"])
        for feature in sorted(features, key=lambda item: item["id"]):
            used = {color_slots[n] for n in neighbors[feature["id"]] if n in color_slots}
            slot = next((candidate for candidate in range(8) if candidate not in used), 0)
            color_slots[feature["id"]] = slot

    print(snapshot["key"], "counties", len(county_features), "prefectures", len(prefecture_features))
    return {
        **snapshot,
        "counties": {"type": "FeatureCollection", "features": county_features},
        "prefectures": {"type": "FeatureCollection", "features": prefecture_features},
        "boundaries": {"type": "FeatureCollection", "features": boundary_features},
        "colorSlots": color_slots,
    }


def main():
    data, baseline, modern = load_data()
    modern_geoms, modern_props, modern_preps, modern_tree = load_modern(modern)
    snapshots = {}
    for snapshot in SNAPSHOTS:
        snapshots[snapshot["key"]] = build_snapshot(
            data, baseline, modern_geoms, modern_props, modern_preps, modern_tree, snapshot
        )
    payload = {
        "meta": {
            "method": "Ming county seats matched to geoBoundaries CHN ADM2 (2017), split by Voronoi where necessary; dissolved to prefecture polygons for colour bands.",
            "modernSource": "geoBoundaries CHN ADM2, ODC PDDL 1.0",
            "warning": "视觉重建，不是逐县逐年考证边界；仅用于交互演示。",
        },
        "snapshots": snapshots,
    }
    text = "window.__BOUNDARIES__ = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n"
    path = OUT / "county-polygons.js"
    path.write_text(text, encoding="utf-8")
    print("wrote", path, path.stat().st_size)


if __name__ == "__main__":
    main()
