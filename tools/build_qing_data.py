"""Build Qing (1820 CHGIS) data bundles for the atlas prototype."""

from __future__ import annotations

import json
import re
import shapefile
from pathlib import Path
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

ROOT = Path(r"D:\Seafile\中国历代行政区划和政治制度变迁")
SRC = ROOT / "vendor" / "historical-map-project" / "data" / "external" / "chgis_1820"
OUT = ROOT / "app" / "data"

COLORS = [
    "#B5655D", "#A87935", "#3E5E54", "#58577F", "#356671", "#705A70",
    "#8C6E5D", "#71805E", "#8A7A95", "#4C7A78", "#9A6A55", "#6E7391",
    "#A36B7A", "#668A6B", "#8A7655", "#5C7B92", "#826A72", "#9B8765",
    "#60766E", "#7F6C8B", "#A27B5C", "#5C6C86",
]
PREF_PALETTE = ["#B5655D", "#A87935", "#3E5E54", "#58577F", "#356671", "#705A70", "#8C6E5D", "#71805E"]


def rnd(value, digits=3):
    if isinstance(value, float): return round(value, digits)
    if isinstance(value, (list, tuple)): return [rnd(v, digits) for v in value]
    if isinstance(value, dict): return {k: rnd(v, digits) for k, v in value.items()}
    return value


def slug(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9]+", "-", value or "").strip("-").lower()
    return value or "unit"


def point_from_record(record):
    x = float(record.X_COORD or 0)
    y = float(record.Y_COORD or 0)
    return x, y


def main():
    prov_reader = shapefile.Reader(str(next((SRC / "prov").glob("*.shp"))), encoding="gbk", encodingErrors="replace")
    pref_reader = shapefile.Reader(str(next((SRC / "pref").glob("*.shp"))), encoding="gbk", encodingErrors="replace")
    cnty_reader = shapefile.Reader(str(next((SRC / "cnty").glob("*.shp"))), encoding="gbk", encodingErrors="replace")

    provinces = []
    province_by_name = {}
    for index, (record, shp) in enumerate(zip(prov_reader.records(), prov_reader.shapes())):
        name = record.NAME_CH or f"省{index}"
        pid = f"prov-{slug(record.NAME_PY)}-{index}"
        x, y = point_from_record(record)
        province = {
            "id": pid, "name": name, "level": "province", "levelLabel": "省",
            "formalName": name, "seatName": name, "lon": x, "lat": y,
            "color": COLORS[index % len(COLORS)], "children": [], "counts": {},
            "validity": {"from": 1644, "to": 1912, "precision": "reconstructed"},
            "confidence": "reconstructed", "ancestry": [],
        }
        provinces.append(province)
        province_by_name[name] = province

    pref_units = []
    pref_by_name = {}
    pref_features = []
    pref_polygons = []
    for index, (record, shp) in enumerate(zip(pref_reader.records(), pref_reader.shapes())):
        name = record.NAME_CH or f"府{index}"
        province_name = record.LEV1_CH or ""
        province = province_by_name.get(province_name)
        province_id = province["id"] if province else f"prov-unknown"
        if not province:
            # Some 1820 layers include broad frontier regions as pref polygons.
            province = {
                "id": province_id, "name": province_name or name, "level": "province", "levelLabel": "地区",
                "formalName": province_name or name, "seatName": name, "lon": float(record.X_COORD or 0), "lat": float(record.Y_COORD or 0),
                "color": COLORS[index % len(COLORS)], "children": [], "counts": {},
                "validity": {"from": 1644, "to": 1912, "precision": "reconstructed"},
                "confidence": "reconstructed", "ancestry": [],
            }
            provinces.append(province); province_by_name[province["name"]] = province
        unit_type = record.TYPE_CH or "府"
        level = "department" if ("州" in unit_type or "厅" in unit_type) else "prefecture"
        label = "州" if level == "department" else "府"
        x, y = float(record.X_COORD or 0), float(record.Y_COORD or 0)
        uid = f"pref-{slug(record.NAME_PY)}-{record.SYS_ID or index}"
        unit = {
            "id": uid, "name": name, "level": level, "levelLabel": label,
            "formalName": name, "seatName": name, "lon": x, "lat": y,
            "provinceId": province_id, "provinceName": province["name"],
            "parentId": province_id, "children": [], "stats": [], "sources": [],
            "validity": {"from": 1644, "to": 1912, "precision": "reconstructed"},
            "confidence": "reconstructed", "ancestry": [province],
        }
        pref_units.append(unit)
        pref_by_name.setdefault((name, province_id), []).append(unit)
        province["children"].append(uid)
        geom = shape(shp.__geo_interface__)
        if not geom.is_valid:
            geom = geom.buffer(0)
        if geom.is_empty:
            continue
        pref_polygons.append(geom)
        pref_features.append({
            "type": "Feature", "id": str(record.SYS_ID or index),
            "geometry": rnd(mapping(geom.simplify(0.35, preserve_topology=True)),1),
            "properties": {
                "id": str(record.SYS_ID or index), "name": name, "type": unit_type,
                "unitId": uid, "provinceId": province_id, "beg": 1820, "end": 1820,
                "labelAt": [x, y], "colorSlot": index % 8,
            },
        })

    county_units = []
    for index, record in enumerate(cnty_reader.records()):
        name = record.NAME_CH or f"县{index}"
        province_name = record.LEV1_CH or ""
        province = province_by_name.get(province_name)
        province_id = province["id"] if province else ""
        pref_name = record.LEV2_CH or ""
        candidates = pref_by_name.get((pref_name, province_id), [])
        parent = candidates[0] if candidates else None
        x, y = point_from_record(record)
        uid = f"cnty-{record.SYS_ID or index}"
        unit = {
            "id": uid, "name": name, "level": "county", "levelLabel": "县",
            "formalName": name, "seatName": name, "lon": x, "lat": y,
            "provinceId": province_id, "provinceName": province["name"] if province else province_name,
            "parentId": parent["id"] if parent else province_id,
            "children": [], "stats": [], "sources": [],
            "validity": {"from": 1644, "to": 1912, "precision": "reconstructed"},
            "confidence": "reconstructed",
            "ancestry": [province, parent] if parent else ([province] if province else []),
        }
        county_units.append(unit)
        if parent:
            parent["children"].append(uid)

    # Province polygon GeoJSON and national outline.
    prov_features = []
    prov_geoms = []
    for index, (record, shp) in enumerate(zip(prov_reader.records(), prov_reader.shapes())):
        name = record.NAME_CH or f"省{index}"
        province = province_by_name.get(name)
        if not province:
            continue
        geom = shape(shp.__geo_interface__)
        if not geom.is_valid:
            geom = geom.buffer(0)
        if geom.is_empty:
            continue
        prov_geoms.append(geom)
        prov_features.append({
            "type": "Feature", "id": province["id"], "geometry": rnd(mapping(geom.simplify(0.35, preserve_topology=True)),1),
            "properties": {"unitId": province["id"], "unitName": name, "labelAnchor": [province["lon"], province["lat"]]},
        })
    nation_geom = unary_union(prov_geoms)
    nation = {"type": "FeatureCollection", "features": [{
        "type": "Feature", "id": "qing", "geometry": rnd(mapping(nation_geom),3),
        "properties": {"unitId": "qing", "unitName": "清", "labelAnchor": [104, 35]},
    }]}
    boundaries = unary_union([geom.boundary for geom in pref_polygons])
    boundary_fc = {"type": "FeatureCollection", "features": [{
        "type": "Feature", "id": "qing-boundaries", "geometry": rnd(mapping(boundaries),3),
        "properties": {"kind": "prefecture-boundaries"},
    }]}

    units = provinces + pref_units + county_units
    counts = {
        "prefecture": sum(1 for u in pref_units if u["level"] == "prefecture"),
        "department": sum(1 for u in pref_units if u["level"] == "department"),
        "county": len(county_units), "military": 0, "jimi": 0,
    }
    for province in provinces:
        province["counts"] = {
            "prefecture": sum(1 for u in pref_units if u["provinceId"] == province["id"] and u["level"] == "prefecture"),
            "department": sum(1 for u in pref_units if u["provinceId"] == province["id"] and u["level"] == "department"),
            "county": sum(1 for u in county_units if u["provinceId"] == province["id"]),
        }

    qing = {
        "name": "清朝", "dynasty": "清", "year": 1820,
        "provinces": provinces, "units": units, "sources": [], "counts": counts,
        "military": [], "jimi": [],
    }
    (OUT / "qing-data.js").write_text(
        "window.__MING__ = " + json.dumps(qing, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    (OUT / "qing-chgis.js").write_text(
        "window.__CHGIS_MING__ = " + json.dumps({"type": "FeatureCollection", "features": pref_features, "boundaries": boundary_fc}, ensure_ascii=False, separators=(",", ":")) + ";\n"
        + "window.__CHGIS_PROVINCES__ = " + json.dumps({"type": "FeatureCollection", "features": prov_features}, ensure_ascii=False, separators=(",", ":")) + ";\n"
        + "window.__CHGIS_NATION__ = " + json.dumps(nation, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    snapshot = {
        "key": "1820", "from": 1644, "to": 1912,
        "counties": {"type": "FeatureCollection", "features": []},
        "prefectures": {"type": "FeatureCollection", "features": []},
        "boundaries": boundary_fc, "colorSlots": {},
    }
    (OUT / "qing-boundaries.js").write_text(
        "window.__BOUNDARIES__ = " + json.dumps({"snapshots": {"1820": snapshot}}, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print("provinces", len(provinces), "prefectures", len(pref_units), "counties", len(county_units))
    print("files", (OUT / "qing-data.js").stat().st_size, (OUT / "qing-chgis.js").stat().st_size)


if __name__ == "__main__":
    main()
