from pathlib import Path
import re

base = Path(r"D:\Seafile\中国历代行政区划和政治制度变迁\tools")
text = (base / "build_sui_data.py").read_text(encoding="utf-8")
text = text.replace("Build a Sui chapter from CHGIS V6 time-series prefecture polygons (600 CE).",
                    "Build a Western Han chapter from CHGIS V6 time-series prefecture polygons (110 BCE).")
text = text.replace("YEAR = 600", "YEAR = -110")
text = text.replace("YEAR_MIN, YEAR_MAX = 581, 618", "YEAR_MIN, YEAR_MAX = -202, 220")
circuits = '''CIRCUITS = [
    ("司隶", 108.5, 34.5), ("豫州", 114.0, 33.5), ("兖州", 116.5, 35.5),
    ("徐州", 118.0, 34.5), ("青州", 119.0, 36.5), ("凉州", 102.5, 37.0),
    ("并州", 112.5, 38.0), ("冀州", 115.5, 38.0), ("幽州", 116.5, 40.0),
    ("扬州", 119.0, 32.0), ("荆州", 112.0, 30.0), ("益州", 104.0, 30.0),
    ("交州", 108.0, 22.0),
]'''
text = re.sub(r"CIRCUITS = \[.*?\n\]", circuits, text, flags=re.S)
text = text.replace('"levelLabel": "道"', '"levelLabel": "州"')
text = text.replace('"name": "隋朝", "dynasty": "隋"', '"name": "汉朝", "dynasty": "汉"')
text = text.replace("sui-data.js", "han-data.js").replace("sui-chgis.js", "han-chgis.js").replace("sui-boundaries.js", "han-boundaries.js")
text = text.replace('"name": "隋"', '"name": "汉"').replace('"unitName": "隋"', '"unitName": "汉"').replace('"id": "sui"', '"id": "han"')
text = text.replace('"600"', '"-110"')
text = text.replace('"geometry": mapping(feature["geometry"])', '"geometry": mapping(feature["geometry"].simplify(0.03, preserve_topology=True))')
(base / "build_han_data.py").write_text(text, encoding="utf-8")
print("wrote han builder")
