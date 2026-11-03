from pathlib import Path
import re

base = Path(r"D:\Seafile\中国历代行政区划和政治制度变迁\tools")
text = (base / "build_sui_data.py").read_text(encoding="utf-8")
text = text.replace("Build a Yuan chapter from CHGIS V6 time-series prefecture polygons (1300 CE).",
                    "Build a Sui chapter from CHGIS V6 time-series prefecture polygons (600 CE).")
text = text.replace("YEAR = 1300", "YEAR = 600")
text = text.replace("YEAR_MIN, YEAR_MAX = 1271, 1368", "YEAR_MIN, YEAR_MAX = 581, 618")
circuits = '''CIRCUITS = [
    ("关中", 108.5, 34.5), ("河南", 113.5, 34.5), ("河东", 112.0, 37.5),
    ("河北", 115.5, 38.5), ("山东", 118.5, 36.5), ("淮北", 117.2, 33.5),
    ("淮南", 118.5, 31.5), ("江南", 119.5, 30.0), ("荆州", 112.0, 30.5),
    ("益州", 104.0, 30.5), ("岭南", 111.5, 23.5), ("河西", 102.0, 37.5),
]'''
text = re.sub(r"CIRCUITS = \[.*?\n\]", circuits, text, flags=re.S)
text = text.replace('"levelLabel": "行省"', '"levelLabel": "道"')
text = text.replace('"name": "元朝", "dynasty": "元"', '"name": "隋朝", "dynasty": "隋"')
text = text.replace("yuan-data.js", "sui-data.js").replace("yuan-chgis.js", "sui-chgis.js").replace("yuan-boundaries.js", "sui-boundaries.js")
text = text.replace('"name": "元"', '"name": "隋"').replace('"unitName": "元"', '"unitName": "隋"').replace('"id": "yuan"', '"id": "sui"')
text = text.replace('"1300"', '"600"')
text = text.replace('"geometry": mapping(feature["geometry"])', '"geometry": mapping(feature["geometry"].simplify(0.03, preserve_topology=True))')
(base / "build_sui_data.py").write_text(text, encoding="utf-8")
print("fixed sui builder")
