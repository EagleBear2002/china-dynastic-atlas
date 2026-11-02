"""Build the standalone prototype's static data from the open-source Ming map data.

The source project is licensed for non-commercial academic/education use. This script
only reshapes its JSON into one browser-friendly file; attribution lives in the UI.
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(r"D:\Seafile\中国历代行政区划和政治制度变迁")
SRC = ROOT / "vendor" / "historical-map-project" / "data"
REF = ROOT / "vendor" / "historical-map-project" / "public" / "reference"
OUT = ROOT / "app" / "data"
OUT.mkdir(parents=True, exist_ok=True)

PROVINCE_COLORS = {
    "jingshi": "#A9584E",
    "henan": "#C18A45",
    "shandong": "#8B6C4F",
    "shanxi": "#656762",
    "shaanxi": "#3B3F3E",
    "sichuan": "#5B7D58",
    "yunnan": "#7D8D58",
    "guizhou": "#4B8078",
    "huguang": "#4B8190",
    "jiangxi": "#6E929F",
    "nanjing": "#8C617B",
    "zhejiang": "#A27082",
    "fujian": "#B5655D",
    "guangdong": "#C38459",
    "guangxi": "#95616E",
}

LEVEL_LABELS = {
    "capital-region": "京/留都",
    "province": "布政使司",
    "prefecture": "府",
    "department": "州",
    "county": "县",
    "military": "都司卫所",
    "jimi": "羁縻/土司",
}

TOP_LEVELS = {"capital-region", "province"}


def read_collections() -> dict[str, list]:
    manifest = json.load(open(SRC / "manifest.json", encoding="utf-8"))
    collections: dict[str, list] = defaultdict(list)
    for fragment in manifest["fragments"]:
        data = json.load(open(SRC / fragment["path"], encoding="utf-8"))
        collections[fragment["collection"]].extend(data)
    return collections


def build() -> None:
    collections = read_collections()
    units = collections["administrativeUnits"]
    places = {p["id"]: p for p in collections["places"]}
    names: dict[str, dict] = {}
    for n in collections["placeNames"]:
        current = names.get(n["placeId"])
        if current is None or (n.get("script") == "historical" and current.get("script") != "historical"):
            names[n["placeId"]] = n

    by_id = {u["id"]: u for u in units}

    def top_ancestor(unit: dict) -> dict:
        current = unit
        seen = set()
        while current.get("parentId") and current["parentId"] in by_id and current["id"] not in seen:
            seen.add(current["id"])
            current = by_id[current["parentId"]]
        return current

    def ancestry(unit: dict) -> list[dict]:
        chain = []
        current = unit
        seen = set()
        while current and current["id"] not in seen:
            seen.add(current["id"])
            chain.append({"id": current["id"], "name": current["name"], "level": current["level"]})
            current = by_id.get(current.get("parentId", ""))
        return list(reversed(chain))

    children = defaultdict(list)
    for unit in units:
        if unit.get("parentId"):
            children[unit["parentId"]].append(unit["id"])

    stats = defaultdict(list)
    for row in collections["statistics"]:
        stats[row["administrativeUnitId"]].append({
            "metric": row["metric"],
            "value": row["value"],
            "unit": row["unit"],
            "recordedYear": row.get("recordedYear"),
            "originalText": row.get("originalText"),
            "confidence": row.get("confidence"),
        })

    def point_for(unit: dict) -> tuple[float | None, float | None, str | None]:
        place = places.get(unit.get("seatPlaceId", ""))
        if not place:
            return None, None, None
        name = names.get(place["id"], {}).get("name")
        return place.get("longitude"), place.get("latitude"), name

    out_units = []
    for unit in units:
        lon, lat, seat_name = point_for(unit)
        top = top_ancestor(unit)
        out_units.append({
            "id": unit["id"],
            "name": unit["name"],
            "formalName": unit.get("formalName"),
            "level": unit["level"],
            "levelLabel": LEVEL_LABELS.get(unit["level"], unit["level"]),
            "parentId": unit.get("parentId"),
            "provinceId": top["id"],
            "provinceName": top["name"],
            "lon": lon,
            "lat": lat,
            "seatName": seat_name,
            "color": PROVINCE_COLORS.get(top["id"], "#81796e"),
            "validity": unit.get("validity"),
            "audit": unit.get("audit"),
            "children": children.get(unit["id"], []),
            "ancestry": ancestry(unit),
            "stats": stats.get(unit["id"], []),
            "confidence": unit.get("confidence"),
            "sources": unit.get("sources", []),
        })

    provinces = []
    for unit in units:
        if unit["level"] in TOP_LEVELS:
            lon, lat, seat_name = point_for(unit)
            child_units = [by_id[cid] for cid in children.get(unit["id"], []) if cid in by_id]
            counts = Counter(u["level"] for u in out_units if u["provinceId"] == unit["id"])
            provinces.append({
                "id": unit["id"],
                "name": unit["name"],
                "formalName": unit.get("formalName"),
                "level": unit["level"],
                "lon": lon,
                "lat": lat,
                "seatName": seat_name,
                "color": PROVINCE_COLORS.get(unit["id"], "#81796e"),
                "counts": {
                    "prefecture": counts.get("prefecture", 0),
                    "department": counts.get("department", 0),
                    "county": counts.get("county", 0),
                },
                "children": [c["id"] for c in child_units],
            })

    def compact_other(rows, domain):
        result = []
        for unit in rows:
            lon, lat, seat_name = point_for(unit)
            result.append({
                "id": unit["id"],
                "name": unit["name"],
                "formalName": unit.get("formalName"),
                "domain": domain,
                "kind": unit.get("militaryKind") or unit.get("officeKind"),
                "lon": lon,
                "lat": lat,
                "seatName": seat_name,
            })
        return result

    ming = {
        "meta": {
            "title": "大明舆图 · 交互原型",
            "baseYear": 1600,
            "yearFrom": 1368,
            "yearTo": 1644,
            "generatedFrom": "历史地图计划（Historical Map Project）数据快照",
            "licenseNote": "代码 Apache-2.0；历史数据为非商业学术研究与教育使用许可。",
        },
        "provinces": provinces,
        "units": out_units,
        "military": compact_other(collections["militaryUnits"], "military"),
        "jimi": compact_other(collections["jimiUnits"], "jimi"),
        "sources": collections["sources"],
        "counts": {
            "province": sum(1 for u in out_units if u["level"] == "province"),
            "prefecture": sum(1 for u in out_units if u["level"] == "prefecture"),
            "department": sum(1 for u in out_units if u["level"] == "department"),
            "county": sum(1 for u in out_units if u["level"] == "county"),
            "military": len(collections["militaryUnits"]),
            "jimi": len(collections["jimiUnits"]),
        },
    }

    reference = {
        "natural": json.load(open(REF / "natural-reference.geojson", encoding="utf-8")),
        "nationalOutline": json.load(open(REF / "national-outline-1600.geojson", encoding="utf-8")),
        "provinceBaseline": json.load(open(REF / "province-baseline.geojson", encoding="utf-8")),
    }

    (OUT / "ming-data.js").write_text(
        "window.__MING__ = " + json.dumps(ming, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    (OUT / "reference-data.js").write_text(
        "window.__REFERENCE__ = " + json.dumps(reference, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print("units", len(out_units), "provinces", len(provinces))
    print("counts", ming["counts"])
    print("ming-data.js", (OUT / "ming-data.js").stat().st_size)
    print("reference-data.js", (OUT / "reference-data.js").stat().st_size)


if __name__ == "__main__":
    build()
