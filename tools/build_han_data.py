"""Build a Western Han chapter from CHGIS V6 time-series prefecture polygons (110 BCE)."""

from __future__ import annotations

import json
import re
import shapefile
from collections import defaultdict
from pathlib import Path
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

ROOT = Path(r"D:\Seafile\中国历代行政区划和政治制度变迁")
SRC = ROOT / "vendor" / "historical-map-project" / "data" / "external" / "chgis_v6" / "v6_time_pref_pgn_utf_wgs84.shp"
OUT = ROOT / "app" / "data"
YEAR = -110
YEAR_MIN, YEAR_MAX = -202, 220

CIRCUITS = [
    ("司隶", 108.5, 34.5), ("豫州", 114.0, 33.5), ("兖州", 116.5, 35.5),
    ("徐州", 118.0, 34.5), ("青州", 119.0, 36.5), ("凉州", 102.5, 37.0),
    ("并州", 112.5, 38.0), ("冀州", 115.5, 38.0), ("幽州", 116.5, 40.0),
    ("扬州", 119.0, 32.0), ("荆州", 112.0, 30.0), ("益州", 104.0, 30.0),
    ("交州", 108.0, 22.0),
]
COLORS = ["#B5655D", "#A87935", "#3E5E54", "#58577F", "#356671", "#705A70", "#8C6E5D", "#71805E", "#5C7B92", "#9A6A55"]


def slug(value):
    return re.sub(r"[^A-Za-z0-9]+", "-", value or "").strip("-").lower() or "unit"


def closest_circuit(lon, lat):
    return min(CIRCUITS, key=lambda item: (item[1] - lon) ** 2 + (item[2] - lat) ** 2)[0]


def load_features():
    reader = shapefile.Reader(str(SRC))
    records = reader.records()
    features = []
    for index, (record, shp) in enumerate(zip(records, reader.shapes())):
        if record.BEG_YR is None or record.END_YR is None:
            continue
        if not (record.BEG_YR <= YEAR <= record.END_YR):
            continue
        geom = shape(shp.__geo_interface__)
        if not geom.is_valid:
            geom = geom.buffer(0)
        if geom.is_empty:
            continue
        point = geom.representative_point()
        name = record.NAME_CH or f"州{index}"
        circuit = closest_circuit(point.x, point.y)
        features.append({
            "id": str(record.SYS_ID or index), "name": name, "type": record.TYPE_CH or "州",
            "circuit": circuit, "beg": max(YEAR_MIN, record.BEG_YR), "end": min(YEAR_MAX, record.END_YR),
            "lon": point.x, "lat": point.y, "geometry": geom,
        })
    return features


def main():
    features = load_features()
    province_units = []
    province_by_name = {}
    for index, (name, lon, lat) in enumerate(CIRCUITS):
        pid = f"prov-{slug(name)}"
        province = {
            "id": pid, "name": name, "level": "province", "levelLabel": "州",
            "formalName": name, "seatName": name, "lon": lon, "lat": lat,
            "color": COLORS[index % len(COLORS)], "children": [], "counts": {},
            "validity": {"from": YEAR_MIN, "to": YEAR_MAX, "precision": "reconstructed"},
            "confidence": "reconstructed", "ancestry": [],
        }
        province_units.append(province)
        province_by_name[name] = province

    pref_units = []
    chgis_features = []
    for index, feature in enumerate(features):
        province = province_by_name[feature["circuit"]]
        uid = f"pref-{slug(feature['name'])}-{feature['id']}"
        level = "department" if "州" in feature["type"] else "prefecture"
        level_label = "州" if level == "department" else "府"
        unit = {
            "id": uid, "name": feature["name"], "level": level, "levelLabel": level_label,
            "formalName": feature["name"], "seatName": feature["name"],
            "lon": feature["lon"], "lat": feature["lat"], "provinceId": province["id"],
            "provinceName": province["name"], "parentId": province["id"],
            "children": [], "stats": [], "sources": [],
            "validity": {"from": feature["beg"], "to": feature["end"], "precision": "reconstructed"},
            "confidence": "reconstructed", "ancestry": [province],
        }
        pref_units.append(unit)
        province["children"].append(uid)
        chgis_features.append({
            "type": "Feature", "id": feature["id"], "geometry": mapping(feature["geometry"].simplify(0.03, preserve_topology=True)),
            "properties": {
                "id": feature["id"], "name": feature["name"], "type": feature["type"],
                "unitId": uid, "provinceId": province["id"], "beg": feature["beg"], "end": feature["end"],
                "labelAt": [feature["lon"], feature["lat"]], "colorSlot": index % 8,
            },
        })

    prov_features = []
    prov_geoms = []
    for province in province_units:
        group = [shape(f["geometry"]) for f in chgis_features if f["properties"]["provinceId"] == province["id"]]
        if not group:
            continue
        geom = unary_union(group)
        province["counts"] = {
            "prefecture": sum(1 for u in pref_units if u["provinceId"] == province["id"] and u["level"] == "prefecture"),
            "department": sum(1 for u in pref_units if u["provinceId"] == province["id"] and u["level"] == "department"),
            "county": 0,
        }
        prov_geoms.append(geom)
        point = geom.representative_point()
        prov_features.append({
            "type": "Feature", "id": province["id"], "geometry": mapping(geom),
            "properties": {"unitId": province["id"], "unitName": province["name"], "labelAnchor": [point.x, point.y]},
        })
    nation = unary_union(prov_geoms)
    boundaries = unary_union([shape(f["geometry"]).boundary for f in chgis_features])

    data = {
        "name": "汉朝", "dynasty": "汉", "year": YEAR,
        "provinces": province_units, "units": province_units + pref_units,
        "sources": [], "military": [], "jimi": [],
        "counts": {"prefecture": sum(1 for u in pref_units if u["level"] == "prefecture"),
                   "department": sum(1 for u in pref_units if u["level"] == "department"),
                   "county": 0, "military": 0, "jimi": 0},
    }
    OUT.joinpath("han-data.js").write_text(
        "window.__MING__ = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    boundary_fc = {"type": "FeatureCollection", "features": [{
        "type": "Feature", "id": "tang-boundaries", "geometry": mapping(boundaries),
        "properties": {"kind": "prefecture-boundaries"},
    }]}
    OUT.joinpath("han-chgis.js").write_text(
        "window.__CHGIS_MING__ = " + json.dumps({"type": "FeatureCollection", "features": chgis_features, "boundaries": boundary_fc}, ensure_ascii=False, separators=(",", ":")) + ";\n"
        + "window.__CHGIS_PROVINCES__ = " + json.dumps({"type": "FeatureCollection", "features": prov_features}, ensure_ascii=False, separators=(",", ":")) + ";\n"
        + "window.__CHGIS_NATION__ = " + json.dumps({"type": "FeatureCollection", "features": [{
            "type": "Feature", "id": "han", "geometry": mapping(nation),
            "properties": {"unitId": "tang", "unitName": "汉", "labelAnchor": [108, 34]},
        }]}, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8")
    snapshot = {"key": "-110", "from": YEAR_MIN, "to": YEAR_MAX,
                "counties": {"type": "FeatureCollection", "features": []},
                "prefectures": {"type": "FeatureCollection", "features": []},
                "boundaries": boundary_fc, "colorSlots": {}}
    OUT.joinpath("han-boundaries.js").write_text(
        "window.__BOUNDARIES__ = " + json.dumps({"snapshots": {"-110": snapshot}}, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8")
    print("features", len(features), "provinces", len(province_units), "prefectures", len(pref_units))


if __name__ == "__main__":
    main()
