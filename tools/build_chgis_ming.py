"""Turn CHGIS V6 1600 prefecture polygons into a non-overlapping planar partition."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

from shapely import set_precision
from shapely.geometry import MultiPolygon, Polygon, mapping, shape
from shapely.ops import polygonize, unary_union
from shapely.strtree import STRtree

ROOT = Path(r"D:\Seafile\中国历代行政区划和政治制度变迁")
INPUT = ROOT / "app" / "data" / "chgis-ming-1600.js"
OUT = ROOT / "app" / "data"


def rnd(value, digits=5):
    if isinstance(value, float):
        return round(value, digits)
    if isinstance(value, (list, tuple)):
        return [rnd(item, digits) for item in value]
    if isinstance(value, dict):
        return {key: rnd(item, digits) for key, item in value.items()}
    return value


def fill_holes(geom):
    """Keep the outer shell only; data gaps inside prefecture shells read as holes on the map."""
    if geom.geom_type == "Polygon":
        return Polygon(geom.exterior)
    if geom.geom_type == "MultiPolygon":
        return MultiPolygon([Polygon(part.exterior) for part in geom.geoms])
    return geom


def planarize(features):
    geoms = []
    for feature in features:
        geom = shape(feature["geometry"])
        if not geom.is_valid:
            geom = geom.buffer(0)
        # Snap all boundaries to one precision grid before polygonizing. This is the
        # "merge nearby vertices, then connect the shared points into faces" step.
        geom = set_precision(geom, 0.01, mode="valid_output")
        geoms.append(geom)
    linework = unary_union([geom.boundary for geom in geoms])
    faces = [face for face in polygonize(linework) if face.area > 0.000001]
    tree = STRtree(geoms)
    assigned = defaultdict(list)
    for face in faces:
        point = face.representative_point()
        candidates = [int(index) for index in tree.query(point)]
        containing = [index for index in candidates if geoms[index].covers(point)]
        if not containing:
            continue
        chosen = min(containing, key=lambda index: geoms[index].area)
        assigned[chosen].append(face)
    result = []
    for index, group in assigned.items():
        merged = unary_union(group)
        if not merged.is_valid:
            merged = merged.buffer(0)
        if merged.is_empty:
            continue
        merged = fill_holes(merged)
        source = features[index]
        result.append({
            "type": "Feature",
            "id": source["id"],
            "geometry": rnd(mapping(merged)),
            "properties": dict(source["properties"]),
        })
    return result


def main():
    text = INPUT.read_text(encoding="utf-8")
    data = json.loads(text[text.index("{"): text.rindex("}") + 1])
    features = planarize(data["features"])
    boundary_parts = []
    for feature in features:
        geom = shape(feature["geometry"])
        if not geom.is_valid:
            geom = geom.buffer(0)
        if not geom.is_empty:
            boundary_parts.append(geom.boundary)
    boundaries = unary_union(boundary_parts).simplify(0.004, preserve_topology=True)
    boundary_collection = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "id": "chgis-ming-boundaries",
            "geometry": rnd(mapping(boundaries)),
            "properties": {"kind": "prefecture-boundaries"},
        }],
    }

    payload = {
        "type": "FeatureCollection",
        "features": features,
        "boundaries": boundary_collection,
    }
    (OUT / "chgis-ming-1600.js").write_text(
        "window.__CHGIS_MING__ = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )

    grouped = defaultdict(list)
    for feature in features:
        geom = shape(feature["geometry"])
        if not geom.is_valid:
            geom = geom.buffer(0)
        grouped[feature["properties"]["provinceId"]].append(fill_holes(geom))
    provinces = []
    for province_id, geoms in grouped.items():
        union = unary_union(geoms)
        if not union.is_valid:
            union = union.buffer(0)
        if union.is_empty:
            continue
        point = union.representative_point()
        provinces.append({
            "type": "Feature",
            "id": province_id,
            "geometry": rnd(mapping(union)),
            "properties": {
                "unitId": province_id,
                "unitName": province_id,
                "labelAnchor": [point.x, point.y],
                "source": "CHGIS V6 1600 prefecture polygons planar union",
            },
        })
    (OUT / "chgis-ming-provinces.js").write_text(
        "window.__CHGIS_PROVINCES__ = " + json.dumps(
            {"type": "FeatureCollection", "features": provinces}, ensure_ascii=False, separators=(",", ":")
        ) + ";\n",
        encoding="utf-8",
    )
    nation = unary_union([shape(feature["geometry"]) for feature in provinces])
    if not nation.is_valid:
        nation = nation.buffer(0)
    nation_point = nation.representative_point()
    (OUT / "chgis-ming-nation.js").write_text(
        "window.__CHGIS_NATION__ = " + json.dumps(
            {"type": "FeatureCollection", "features": [{
                "type": "Feature", "id": "ming-chgis", "geometry": rnd(mapping(nation)),
                "properties": {"unitId": "ming", "unitName": "大明", "labelAnchor": [nation_point.x, nation_point.y]},
            }]}, ensure_ascii=False, separators=(",", ":")
        ) + ";\n",
        encoding="utf-8",
    )
    print("chgis features", len(features), "provinces", len(provinces))
    print("files", (OUT / "chgis-ming-1600.js").stat().st_size, (OUT / "chgis-ming-provinces.js").stat().st_size)


if __name__ == "__main__":
    main()
