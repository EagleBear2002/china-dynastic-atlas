from pathlib import Path
import re

base = Path(__file__).parent
text = (base / "build_song_data.py").read_text(encoding="utf-8")
text = text.replace("Build a Song chapter from CHGIS V6 time-series prefecture polygons (1100 CE).",
                    "Build a Yuan chapter from CHGIS V6 time-series prefecture polygons (1300 CE).")
text = text.replace("YEAR = 1100", "YEAR = 1300")
text = text.replace("YEAR_MIN, YEAR_MAX = 960, 1279", "YEAR_MIN, YEAR_MAX = 1271, 1368")
circuits = '''CIRCUITS = [
    ("中书省", 116.0, 39.0), ("辽阳行省", 123.5, 41.5), ("河南江北行省", 114.5, 33.5),
    ("陕西行省", 108.5, 34.5), ("四川行省", 104.0, 30.5), ("甘肃行省", 103.0, 37.5),
    ("云南行省", 102.0, 25.0), ("江浙行省", 119.5, 30.0), ("江西行省", 115.5, 27.5),
    ("湖广行省", 112.0, 29.0),
]'''
text = re.sub(r"CIRCUITS = \[.*?\n\]", circuits, text, flags=re.S)
text = text.replace('"levelLabel": "路"', '"levelLabel": "行省"')
text = text.replace('"name": "宋朝", "dynasty": "宋"', '"name": "元朝", "dynasty": "元"')
text = text.replace("song-data.js", "yuan-data.js").replace("song-chgis.js", "yuan-chgis.js").replace("song-boundaries.js", "yuan-boundaries.js")
text = text.replace('"name": "宋"', '"name": "元"').replace('"unitName": "宋"', '"unitName": "元"').replace('"id": "song"', '"id": "yuan"')
text = text.replace('"1100"', '"1300"')
text = text.replace('"geometry": mapping(feature["geometry"])', '"geometry": mapping(feature["geometry"].simplify(0.03, preserve_topology=True))')
(base / "build_yuan_data.py").write_text(text, encoding="utf-8")
print("wrote", base / "build_yuan_data.py")
