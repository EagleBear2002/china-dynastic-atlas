from pathlib import Path

base = Path(r"D:\Seafile\中国历代行政区划和政治制度变迁\app")
text = (base / "index.html").read_text(encoding="utf-8")
text = text.replace("明代卷", "隋代卷")
text = text.replace("洪武元年—崇祯十七年 · 1368—1644", "开皇元年—大业十四年 · 581—618")
text = text.replace(">朙</button>", ">隋</button>")
for old, new in [
    ("data/ming-data.js", "data/sui-data.js"),
    ("data/events.js", "data/sui-events.js"),
    ("data/figures.js", "data/sui-figures.js"),
    ("data/county-polygons.js", "data/sui-boundaries.js"),
    ("data/chgis-ming-1600.js", "data/sui-chgis.js"),
]:
    text = text.replace(old, new)
text = text.replace('  <script src="data/chgis-ming-provinces.js"></script>\n', "")
text = text.replace('  <script src="data/chgis-ming-nation.js"></script>\n', "")
text = text.replace('min="1368" max="1644" value="1600"', 'min="581" max="618" value="600"')
text = text.replace('title="回到 1600 年">1600</button>', 'title="回到 600 年">600</button>')
config = (base / "data/sui-config.js").read_text(encoding="utf-8")
if "window.__DEFAULT_YEAR__ = 600" not in text:
    text = text.replace("<script src=\"app.js\"></script>", "<script src=\"data/sui-config.js\"></script>\n  <script>\n" + config + "\n  </script>\n  <script src=\"app.js\"></script>")
(base / "sui.html").write_text(text, encoding="utf-8")
for path, old, new in [
    (base / "app.js", 'const destinations = { ming: "index.html?year=1600", qing: "qing.html?year=1820", tang: "tang.html?year=740", song: "song.html?year=1100", yuan: "yuan.html?year=1300" };', 'const destinations = { ming: "index.html?year=1600", qing: "qing.html?year=1820", tang: "tang.html?year=740", song: "song.html?year=1100", yuan: "yuan.html?year=1300", sui: "sui.html?year=600" };'),
    (base / "chapters.js", 'ming: "index.html", qing: "qing.html?year=1820", tang: "tang.html?year=740", song: "song.html?year=1100", yuan: "yuan.html?year=1300"', 'ming: "index.html", qing: "qing.html?year=1820", tang: "tang.html?year=740", song: "song.html?year=1100", yuan: "yuan.html?year=1300", sui: "sui.html?year=600"'),
]:
    content = path.read_text(encoding="utf-8").replace(old, new)
    path.write_text(content, encoding="utf-8")
print("ok")
