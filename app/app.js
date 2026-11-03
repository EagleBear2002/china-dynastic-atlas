(() => {
  "use strict";

  const MING = window.__MING__;
  const REF = window.__REFERENCE__;
  const EVENTS = window.__EVENTS__.slice().sort((a, b) => a.year - b.year);
  const OFF = window.__OFFICIALDOM__;
  const BOUNDARIES = window.__BOUNDARIES__ || { snapshots: {} };
  const MOUNTAINS = window.__MOUNTAINS__ || [];
  const FIGURES = window.__FIGURES__ || [];
  const MODERN_CHINA = window.__MODERN_CHINA__ || { type: "FeatureCollection", features: [] };
  const CHGIS_MING = window.__CHGIS_MING__ || { type: "FeatureCollection", features: [] };
  const CHGIS_BOUNDARIES = CHGIS_MING.boundaries || { type: "FeatureCollection", features: [] };
  const CHGIS_PROVINCES = window.__CHGIS_PROVINCES__ || REF.provinceBaseline;

  // Deliberately more saturated/distinct than the source palette, so neighbouring
  // provinces never read as the same colour at county level.
  const PROVINCE_COLORS = {
    jingshi: "#B64D42",
    nanjing: "#76558C",
    shandong: "#3F78A8",
    shanxi: "#6B8C45",
    henan: "#CF8F3C",
    shaanxi: "#6E5A43",
    sichuan: "#C9B44A",
    huguang: "#3E95A5",
    jiangxi: "#8C4F65",
    zhejiang: "#7D86C5",
    fujian: "#C66A45",
    guangdong: "#8F9C3B",
    guangxi: "#A56C43",
    yunnan: "#4F8F5F",
    guizhou: "#6B70B5",
    "liaodong-dusi": "#5B4B3A",
  };
  for (const unit of MING.units) unit.color = PROVINCE_COLORS[unit.provinceId] || "#81796e";
  for (const province of MING.provinces) province.color = PROVINCE_COLORS[province.id] || "#81796e";

  function darkenHex(hex, factor = 0.72) {
    const value = hex.replace("#", "");
    const r = Math.round(parseInt(value.slice(0, 2), 16) * factor);
    const g = Math.round(parseInt(value.slice(2, 4), 16) * factor);
    const b = Math.round(parseInt(value.slice(4, 6), 16) * factor);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function hexToHsl(hex) {
    const value = hex.replace("#", "");
    const r = parseInt(value.slice(0, 2), 16) / 255;
    const g = parseInt(value.slice(2, 4), 16) / 255;
    const b = parseInt(value.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const delta = max - min;
      s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
      if (max === r) h = (g - b) / delta + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / delta + 2;
      else h = (r - g) / delta + 4;
      h /= 6;
    }
    return [h * 360, s * 100, l * 100];
  }

  function prefectureColor(baseHex, index) {
    const [h, s] = hexToHsl(baseHex);
    const lightnessSteps = [0.34, 0.43, 0.52, 0.61, 0.38, 0.47, 0.56, 0.65];
    const slot = index % lightnessSteps.length;
    const hue = h + ((slot % 3) - 1) * 2.6;
    const saturation = Math.max(28, Math.min(68, s * (0.82 + 0.16 * ((slot % 4) / 3))));
    return `hsl(${hue.toFixed(1)}, ${saturation.toFixed(1)}%, ${(lightnessSteps[slot] * 100).toFixed(1)}%)`;
  }

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
  const fmt = (value) => new Intl.NumberFormat("zh-CN").format(value);
  const ICONS = window.__ICONS__ || {};
  const EVENT_TYPE_KEYS = {
    "区划": "event-zone",
    "政治": "event-politics",
    "军事": "event-military",
    "官制": "event-office",
    "经济": "event-economy",
    "文化": "event-culture",
    "外交": "event-diplomacy",
  };
  const EVENT_ICON_KEYS = {
    "区划": "zone",
    "政治": "politics",
    "军事": "military",
    "官制": "office",
    "经济": "economy",
    "文化": "culture",
    "外交": "diplomacy",
  };
  const MAJOR_EVENT_IDS = new Set([
    "1368-founding", "1376-three-commissions", "1380-abolish-chancellor", "1399-jingnan",
    "1402-yongle", "1405-zhenghe", "1407-jiaozhi", "1413-guizhou", "1421-capitals",
    "1449-tumubao", "1457-duomen", "1519-ningwang", "1521-jiajing", "1550-gengxu",
    "1567-haijin", "1571-altan", "1581-yitiaobian", "1592-korea", "1600-bozhou",
    "1616-houjin", "1618-sarhu", "1644-fall",
  ]);

  function eventTypeColor(type) {
    return {
      "区划": "#7a3027",
      "政治": "#a87935",
      "军事": "#3e5e54",
      "官制": "#58577f",
      "经济": "#356671",
      "文化": "#705a70",
      "外交": "#705a70",
    }[type] || "#705a70";
  }

  function eventIconSvg(type) {
    return ICONS[EVENT_ICON_KEYS[type]] || ICONS.politics || "";
  }

  const units = MING.units;
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const provinceById = new Map(MING.provinces.map((province) => [province.id, province]));
  const sourceById = new Map(MING.sources.map((source) => [source.id, source]));
  const eventById = new Map(EVENTS.map((event) => [event.id, event]));
  const provinceLabelPoint = new Map();
  for (const feature of CHGIS_PROVINCES?.features || []) {
    const anchor = feature.properties?.labelAnchor;
    if (Array.isArray(anchor) && anchor.length === 2) provinceLabelPoint.set(feature.properties.unitId, anchor);
  }
  // A few hand-tuned label anchors so the large province names sit comfortably in the province body.
  Object.entries({ sichuan: [104.2, 30.0], guizhou: [106.2, 26.35] }).forEach(([id, point]) => provinceLabelPoint.set(id, point));
  const polygonIdByUnit = new Map();
  const prefIdsByProvince = new Map();
  for (const snapshot of Object.values(BOUNDARIES.snapshots)) {
    for (const feature of snapshot.counties?.features || []) {
      const id = feature.properties?.id;
      for (const countyId of feature.properties?.ids || [id]) polygonIdByUnit.set(countyId, id);
      const provinceId = feature.properties?.provinceId;
      const prefId = feature.properties?.prefId;
      if (provinceId && prefId) {
        if (!prefIdsByProvince.has(provinceId)) prefIdsByProvince.set(provinceId, new Set());
        prefIdsByProvince.get(provinceId).add(prefId);
      }
    }
  }
  const PREF_COLOR_SLOTS = {};
  for (const snapshot of Object.values(BOUNDARIES.snapshots)) Object.assign(PREF_COLOR_SLOTS, snapshot.colorSlots || {});
  const PREF_COLORS = {};
  for (const [provinceId, prefs] of prefIdsByProvince.entries()) {
    const base = PROVINCE_COLORS[provinceId] || "#81796e";
    const sorted = [...prefs].sort();
    sorted.forEach((prefId, index) => {
      PREF_COLORS[prefId] = prefectureColor(base, PREF_COLOR_SLOTS[prefId] ?? index);
    });
  }

  const LEVEL_RANK = { "capital-region": 0, province: 1, prefecture: 2, department: 3, county: 4 };
  const labelUnits = units.slice().sort((a, b) => (LEVEL_RANK[a.level] ?? 9) - (LEVEL_RANK[b.level] ?? 9));

  const ERAS = [
    { from: 1368, to: 1398, era: "洪武", emperor: "明太祖 · 朱元璋" },
    { from: 1399, to: 1402, era: "建文", emperor: "明惠帝 · 朱允炆" },
    { from: 1403, to: 1424, era: "永乐", emperor: "明成祖 · 朱棣" },
    { from: 1425, to: 1425, era: "洪熙", emperor: "明仁宗 · 朱高炽" },
    { from: 1426, to: 1435, era: "宣德", emperor: "明宣宗 · 朱瞻基" },
    { from: 1436, to: 1449, era: "正统", emperor: "明英宗 · 朱祁镇" },
    { from: 1450, to: 1456, era: "景泰", emperor: "明代宗 · 朱祁钰" },
    { from: 1457, to: 1464, era: "天顺", emperor: "明英宗 · 朱祁镇" },
    { from: 1465, to: 1487, era: "成化", emperor: "明宪宗 · 朱见深" },
    { from: 1488, to: 1505, era: "弘治", emperor: "明孝宗 · 朱祐樘" },
    { from: 1506, to: 1521, era: "正德", emperor: "明武宗 · 朱厚照" },
    { from: 1522, to: 1566, era: "嘉靖", emperor: "明世宗 · 朱厚熜" },
    { from: 1567, to: 1572, era: "隆庆", emperor: "明穆宗 · 朱载坖" },
    { from: 1573, to: 1619, era: "万历", emperor: "明神宗 · 朱翊钧" },
    { from: 1620, to: 1620, era: "泰昌", emperor: "明光宗 · 朱常洛" },
    { from: 1621, to: 1627, era: "天启", emperor: "明熹宗 · 朱由校" },
    { from: 1628, to: 1644, era: "崇祯", emperor: "明思宗 · 朱由检" },
  ];

  const METRIC_LABELS = {
    households: "户",
    "registered-population": "口",
    "registered-land": "顷",
    "summer-tax": "石（夏税）",
    "autumn-grain": "石（秋粮）",
    silver: "两",
  };

  const state = {
    year: 1600,
    boundaryKey: null,
    selectedUnitId: null,
    selectedPolygonIds: [],
    selectedEventId: null,
    eventFilter: "all",
    leftTab: "events",
    rightTab: "officialdom",
    playing: false,
    playTimer: null,
    layers: {
      national: true,
      modern: true,
      chgis: true,
      provinces: true,
      admin: true,
      labels: true,
      mountains: true,
      military: false,
      jimi: false,
      events: true,
    },
    labelLevels: {
      province: true,
      prefecture: true,
      department: true,
      county: true,
    },
  };

  let map;
  const labelPool = new Map();
  const mountainLabelPool = new Map();
  let labelFrame = 0;

  function eraFor(year) {
    return ERAS.find((item) => year >= item.from && year <= item.to) || ERAS[ERAS.length - 1];
  }

  function cnNumber(value) {
    const digits = "零一二三四五六七八九";
    if (value <= 10) return value === 10 ? "十" : digits[value];
    if (value < 20) return "十" + (value % 10 ? digits[value % 10] : "");
    if (value < 100) return digits[Math.floor(value / 10)] + "十" + (value % 10 ? digits[value % 10] : "");
    return String(value);
  }

  function eraLabel(year) {
    const info = eraFor(year);
    const offset = year - info.from + 1;
    return `${info.era}${offset === 1 ? "元" : cnNumber(offset)}年`;
  }

  function rankClass(rank) {
    const match = String(rank || "").match(/([正从])([一二三四五六七八九])品/);
    if (!match) return "rank-0";
    const numbers = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    return `rank-${numbers[match[2]] || 0}`;
  }

  function rankBadge(rank) {
    return `<span class="rank ${rankClass(rank)}">${esc(rank || "—")}</span>`;
  }

  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { el.hidden = true; }, 2800);
  }

  function unitIcon(level, provinceId) {
    if (level === "capital-region") return "capital-star";
    if (level === "province") return `prov-${provinceId}-province`;
    if (level === "prefecture") return `prov-${provinceId}-prefecture`;
    if (level === "department") return `prov-${provinceId}-secondary`;
    return `prov-${provinceId}-dot`;
  }

  function isProvinceActive(provinceId, year) {
    if (provinceId === "yunnan" && year < 1382) return false;
    if (provinceId === "guizhou" && year < 1413) return false;
    return true;
  }

  function isUnitActive(unit, year) {
    if (!isProvinceActive(unit.provinceId, year)) return false;
    if (year < 1476 && (unit.id === "yunyang-prefecture" || unit.ancestry?.some((item) => item.id === "yunyang-prefecture"))) return false;
    return true;
  }

  function activeProvinceData(year) {
    return {
      type: "FeatureCollection",
      features: CHGIS_PROVINCES.features.filter((feature) => isProvinceActive(feature.properties?.unitId, year)),
    };
  }

  function unitFeatureCollection(year = 1600) {
    return {
      type: "FeatureCollection",
      features: units.filter((unit) => isUnitActive(unit, year)).map((unit) => ({
        type: "Feature",
        id: unit.id,
        geometry: { type: "Point", coordinates: [unit.lon, unit.lat] },
        properties: {
          id: unit.id,
          name: unit.name,
          level: unit.level,
          provinceId: unit.provinceId,
          color: unit.color,
          icon: unitIcon(unit.level, unit.provinceId),
        },
      })),
    };
  }

  function markerFeatureCollection(year = 1600) {
    const bestByPoint = new Map();
    for (const unit of units) {
      if (!isUnitActive(unit, year)) continue;
      const key = `${unit.lon.toFixed(4)},${unit.lat.toFixed(4)}`;
      const current = bestByPoint.get(key);
      if (!current || (LEVEL_RANK[unit.level] ?? 9) < (LEVEL_RANK[current.level] ?? 9)) {
        bestByPoint.set(key, unit);
      }
    }
    return {
      type: "FeatureCollection",
      features: [...bestByPoint.values()].map((unit) => ({
        type: "Feature",
        id: unit.id,
        geometry: { type: "Point", coordinates: [unit.lon, unit.lat] },
        properties: {
          id: unit.id,
          name: unit.name,
          level: unit.level,
          provinceId: unit.provinceId,
          color: unit.color,
          icon: unitIcon(unit.level, unit.provinceId),
        },
      })),
    };
  }

  function otherFeatureCollection(rows, domain) {
    return {
      type: "FeatureCollection",
      features: rows.map((unit) => ({
        type: "Feature",
        id: unit.id,
        geometry: { type: "Point", coordinates: [unit.lon, unit.lat] },
        properties: {
          id: unit.id,
          name: unit.name,
          domain,
          kind: unit.kind || "",
          icon: domain === "military" ? "military-cross" : "jimi-ring",
        },
      })),
    };
  }

  function mountainLineFeatures() {
    return {
      type: "FeatureCollection",
      features: MOUNTAINS.map((range, index) => ({
        type: "Feature",
        id: `mountain-${index}`,
        geometry: { type: "LineString", coordinates: range.coords },
        properties: { name: range.name },
      })),
    };
  }

  function mountainPointFeatures() {
    const features = [];
    MOUNTAINS.forEach((range, rangeIndex) => {
      const rangeLength = range.coords.slice(1).reduce((sum, point, index) =>
        sum + Math.hypot(point[0] - range.coords[index][0], point[1] - range.coords[index][1]), 0);
      const iconSize = Math.max(0.22, Math.min(0.50, 0.20 + rangeLength * 0.035));
      for (let segment = 0; segment < range.coords.length - 1; segment += 1) {
        const [x1, y1] = range.coords[segment];
        const [x2, y2] = range.coords[segment + 1];
        const length = Math.hypot(x2 - x1, y2 - y1);
        const steps = Math.max(2, Math.round(length / 0.45));
        for (let step = 0; step < steps; step += 1) {
          const t = steps === 1 ? 0.5 : step / steps;
          features.push({
            type: "Feature",
            id: `mountain-${rangeIndex}-${segment}-${step}`,
            geometry: { type: "Point", coordinates: [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t] },
            properties: { name: range.name, iconSize },
          });
        }
      }
    });
    return { type: "FeatureCollection", features };
  }

  function eventsFeatureCollection(year) {
    return {
      type: "FeatureCollection",
      features: EVENTS.filter((event) => event.lon !== undefined && event.lat !== undefined && Math.abs(event.year - year) <= 6)
        .map((event) => ({
          type: "Feature",
          id: event.id,
          geometry: { type: "Point", coordinates: [event.lon, event.lat] },
          properties: {
            id: event.id,
            title: event.title,
            type: event.type,
            typeKey: EVENT_TYPE_KEYS[event.type] || "event-politics",
            year: event.year,
            active: event.year === year,
          },
        })),
    };
  }

  function boundarySnapshotFor(year) {
    const snapshots = Object.values(BOUNDARIES.snapshots);
    return snapshots.find((snapshot) => year >= snapshot.from && year <= snapshot.to)
      || snapshots[snapshots.length - 1]
      || { key: "none", from: 1368, to: 1644, data: { type: "FeatureCollection", features: [] } };
  }

  function defaultBoundaryData() {
    return boundarySnapshotFor(1600).counties || { type: "FeatureCollection", features: [] };
  }

  function defaultPrefectureData() {
    return boundarySnapshotFor(1600).prefectures || { type: "FeatureCollection", features: [] };
  }

  function defaultBoundaryNetwork() {
    return boundarySnapshotFor(1600).boundaries || { type: "FeatureCollection", features: [] };
  }

  function chgisFeatureCollection() {
    return {
      type: "FeatureCollection",
      features: CHGIS_MING.features.map((feature, index) => {
        const provinceId = feature.properties?.provinceId;
        const base = PROVINCE_COLORS[provinceId] || "#81796e";
        return {
          ...feature,
          properties: {
            ...feature.properties,
            prefId: feature.properties?.unitId || feature.id,
            color: prefectureColor(base, index),
          },
        };
      }),
    };
  }

  function boundaryLabel(key) {
    return {
      "1368": "洪武初年（云南、贵州未建省）",
      "1382": "洪武十五年云南建省后",
      "1413": "永乐十一年贵州建省后",
      "1476": "成化十二年郧阳设府后",
    }[String(key)] || "1600 年断面";
  }

  function updateBoundarySnapshot(year) {
    const snapshot = boundarySnapshotFor(year);
    if (state.boundaryKey !== snapshot.key) {
      state.boundaryKey = snapshot.key;
      if (map && map.getSource("counties")) map.getSource("counties").setData(snapshot.counties);
      if (map && map.getSource("prefectures")) map.getSource("prefectures").setData(snapshot.prefectures);
      if (map && map.getSource("countyBoundaries")) map.getSource("countyBoundaries").setData(snapshot.boundaries);
    }
    if (map && map.getSource("provinces")) map.getSource("provinces").setData(activeProvinceData(year));
    if (map && map.getSource("markers")) map.getSource("markers").setData(markerFeatureCollection(year));
    if (state.selectedUnitId && !isUnitActive(unitById.get(state.selectedUnitId), year)) {
      state.selectedUnitId = null;
      state.selectedPolygonIds = [];
      renderChief();
      renderDetail();
      $("#selection-count").textContent = "未选中";
    } else if (state.selectedUnitId) {
      setTimeout(() => selectPolygonsForUnit(state.selectedUnitId, unitById.get(state.selectedUnitId)), 0);
    }
  }

  function mapStyle() {
    const provinceColorEntries = MING.provinces.flatMap((province) => [province.id, province.color]);
    const provinceColor = ["match", ["get", "unitId"], ...provinceColorEntries, "#81796e"];
    const provinceColorByProvinceId = ["match", ["get", "provinceId"], ...provinceColorEntries, "#81796e"];
    const provinceBorderEntries = MING.provinces.flatMap((province) => [province.id, darkenHex(province.color, 0.66)]);
    const provinceBorderColor = ["match", ["get", "unitId"], ...provinceBorderEntries, "#4b3a2a"];
    const prefColorEntries = Object.entries(PREF_COLORS).flatMap(([id, color]) => [id, color]);
    const eventColor = ["match", ["get", "type"],
      "区划", "#7a3027",
      "政治", "#b08a4a",
      "军事", "#3e5e54",
      "官制", "#58577f",
      "经济", "#356671",
      "#705a70"];

    return {
      version: 8,
      sources: {
        natural: { type: "geojson", data: REF.natural },
        terrain: { type: "raster-dem", tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], encoding: "terrarium", tileSize: 256, maxzoom: 12 },
        modern: { type: "geojson", data: MODERN_CHINA },
        national: { type: "geojson", data: REF.nationalOutline },
        provinces: { type: "geojson", data: activeProvinceData(1600) },
        counties: { type: "geojson", data: defaultBoundaryData(), promoteId: "id" },
        prefectures: { type: "geojson", data: defaultPrefectureData(), promoteId: "id" },
        countyBoundaries: { type: "geojson", data: defaultBoundaryNetwork() },
        chgisMing: { type: "geojson", data: chgisFeatureCollection(), promoteId: "id" },
        chgisBoundaries: { type: "geojson", data: CHGIS_BOUNDARIES },
        mountainRidges: { type: "geojson", data: mountainLineFeatures() },
        mountainPeaks: { type: "geojson", data: mountainPointFeatures() },
        markers: { type: "geojson", data: markerFeatureCollection(1600), promoteId: "id" },
        military: { type: "geojson", data: otherFeatureCollection(MING.military, "military") },
        jimi: { type: "geojson", data: otherFeatureCollection(MING.jimi, "jimi") },
        events: { type: "geojson", data: eventsFeatureCollection(1600), promoteId: "id" },
      },
      layers: [
        { id: "background", type: "background", paint: { "background-color": "#e8e1d3" } },
        { id: "natural-ocean", type: "fill", source: "natural", filter: ["==", ["get", "kind"], "ocean"], paint: { "fill-color": "#9aaeb0", "fill-opacity": 0.9 } },
        { id: "natural-land", type: "fill", source: "natural", filter: ["==", ["get", "kind"], "land"], paint: { "fill-color": "#e8e1d3" } },
        { id: "natural-lakes", type: "fill", source: "natural", filter: ["==", ["get", "kind"], "lake"], paint: { "fill-color": "#9aaeb0", "fill-opacity": 0.9 } },
        { id: "natural-rivers", type: "line", source: "natural", filter: ["==", ["get", "kind"], "river"], paint: { "line-color": "#84999d", "line-opacity": 0.7, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.5, 8, 1.8] } },
        { id: "natural-coastline", type: "line", source: "natural", filter: ["==", ["get", "kind"], "coastline"], paint: { "line-color": "#84999d", "line-opacity": 0.7, "line-width": 0.9 } },
        { id: "terrain-hillshade", type: "hillshade", source: "terrain", paint: { "hillshade-exaggeration": 0.42, "hillshade-shadow-color": "rgba(84, 74, 56, .42)", "hillshade-highlight-color": "rgba(250, 246, 236, .48)", "hillshade-accent-color": "rgba(91, 82, 62, .26)" } },
        { id: "modern-china-line", type: "line", source: "modern", paint: { "line-color": "rgba(78, 92, 86, .46)", "line-width": 0.7, "line-dasharray": [3, 3], "line-opacity": 0.65 } },
        { id: "national-fill", type: "fill", source: "national", paint: { "fill-color": "#7a3027", "fill-opacity": 0.14 } },
        { id: "national-line", type: "line", source: "national", paint: { "line-color": "#7a3027", "line-width": 1.8, "line-opacity": 0.86 } },
        { id: "province-fill", type: "fill", source: "provinces", paint: { "fill-color": provinceColor, "fill-opacity": 0.42 } },
        { id: "province-line", type: "line", source: "provinces", paint: { "line-color": provinceBorderColor, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.35, 8, 2.1], "line-opacity": 0.92 } },
        { id: "county-fill", type: "fill", source: "counties", paint: { "fill-color": ["case", ["boolean", ["feature-state", "selected"], false], "rgba(122,48,39,.72)", ["match", ["get", "prefId"], ...prefColorEntries, "#81796e"]], "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 1, 0.48] } },
        { id: "mountain-ridges", type: "line", source: "mountainRidges", paint: { "line-color": "rgba(80, 92, 78, .24)", "line-width": 0.55, "line-dasharray": [1, 3] } },
        { id: "mountain-peaks", type: "symbol", source: "mountainPeaks", layout: { "icon-image": "mountain-peak", "icon-size": ["interpolate", ["linear"], ["zoom"], 3, ["get", "iconSize"], 8, ["*", ["get", "iconSize"], 2]], "icon-allow-overlap": true, "icon-ignore-placement": true }, paint: { "icon-opacity": 0.66 } },
        { id: "county-boundaries", type: "line", source: "countyBoundaries", paint: { "line-color": "rgba(56, 52, 44, .36)", "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.28, 8, 0.55], "line-opacity": 0.68 } },
        { id: "chgis-fill", type: "fill", source: "chgisMing", paint: { "fill-color": ["get", "color"], "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.88, 0.58] } },
        { id: "chgis-line", type: "line", source: "chgisBoundaries", paint: { "line-color": "rgba(56, 52, 44, .45)", "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.35, 8, 0.75], "line-opacity": 0.76 } },
        { id: "prefecture-line", type: "line", source: "prefectures", paint: { "line-color": provinceColorByProvinceId, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.55, 8, 1.25], "line-opacity": 0.55 } },
        { id: "province-line-top", type: "line", source: "provinces", paint: { "line-color": provinceBorderColor, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.9, 8, 2.8], "line-opacity": 0.98 } },
        { id: "military-points", type: "symbol", source: "military", minzoom: 4.4, layout: { "icon-image": ["get", "icon"], "icon-size": 0.22, "icon-allow-overlap": true, "icon-ignore-placement": true } },
        { id: "jimi-points", type: "symbol", source: "jimi", minzoom: 4.2, layout: { "icon-image": ["get", "icon"], "icon-size": 0.24, "icon-allow-overlap": true, "icon-ignore-placement": true } },
        { id: "admin-province", type: "symbol", source: "markers", filter: ["in", ["get", "level"], ["literal", ["capital-region", "province"]]], layout: { "icon-image": ["get", "icon"], "icon-size": 0.50, "icon-allow-overlap": true, "icon-ignore-placement": true } },
        { id: "admin-prefecture", type: "symbol", source: "markers", filter: ["==", ["get", "level"], "prefecture"], minzoom: 4.6, layout: { "icon-image": ["get", "icon"], "icon-size": 0.38, "icon-allow-overlap": true, "icon-ignore-placement": true } },
        { id: "admin-department", type: "symbol", source: "markers", filter: ["==", ["get", "level"], "department"], minzoom: 5.8, layout: { "icon-image": ["get", "icon"], "icon-size": 0.30, "icon-allow-overlap": true, "icon-ignore-placement": true } },
        { id: "admin-county", type: "symbol", source: "markers", filter: ["==", ["get", "level"], "county"], minzoom: 6.8, layout: { "icon-image": ["get", "icon"], "icon-size": 0.20, "icon-allow-overlap": true, "icon-ignore-placement": true } },
        { id: "event-halo", type: "circle", source: "events", paint: { "circle-radius": ["case", ["get", "active"], 16, 11], "circle-color": eventColor, "circle-opacity": 0.10 } },
        { id: "event-points", type: "symbol", source: "events", layout: { "icon-image": ["get", "typeKey"], "icon-size": 0.40, "icon-allow-overlap": true, "icon-ignore-placement": true } },
      ],
    };
  }

  function markerImage(shape, color) {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const center = size / 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(246, 241, 231, .98)";
    ctx.lineWidth = 4;
    if (shape === "province") {
      ctx.beginPath();
      ctx.arc(center, center, 25, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(center, center, 14, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(246, 241, 231, .92)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.arc(center, center, 14, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = "rgba(246, 241, 231, .72)";
      ctx.lineWidth = 1.6;
      for (let offset = -20; offset <= 20; offset += 6) {
        ctx.beginPath();
        ctx.moveTo(center - 20 + offset, center + 20);
        ctx.lineTo(center + 20 + offset, center - 20);
        ctx.stroke();
      }
      ctx.restore();
      return ctx.getImageData(0, 0, size, size);
    }
    if (shape === "prefecture") {
      ctx.beginPath();
      ctx.arc(center, center, 24, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(center, center, 10, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.8;
      ctx.stroke();
      return ctx.getImageData(0, 0, size, size);
    }
    if (shape === "secondary") {
      ctx.beginPath();
      ctx.arc(center, center, 20, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(center, center, 6, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      return ctx.getImageData(0, 0, size, size);
    }
    ctx.beginPath();
    if (shape === "dot") {
      ctx.lineWidth = 2;
      ctx.arc(center, center, 13, 0, Math.PI * 2);
    } else if (shape === "diamond") {
      ctx.moveTo(center, 5); ctx.lineTo(size - 5, center); ctx.lineTo(center, size - 5); ctx.lineTo(5, center); ctx.closePath();
    } else if (shape === "square") {
      ctx.rect(10, 10, size - 20, size - 20);
    } else if (shape === "triangle") {
      ctx.moveTo(center, 5); ctx.lineTo(size - 7, size - 9); ctx.lineTo(7, size - 9); ctx.closePath();
    } else if (shape === "star") {
      for (let index = 0; index < 10; index += 1) {
        const angle = -Math.PI / 2 + index * Math.PI / 5;
        const radius = index % 2 === 0 ? 28 : 12;
        const x = center + Math.cos(angle) * radius;
        const y = center + Math.sin(angle) * radius;
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else if (shape === "cross") {
      ctx.rect(center - 6, 8, 12, size - 16);
      ctx.rect(8, center - 6, size - 16, 12);
    } else if (shape === "ring") {
      ctx.arc(center, center, 18, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.fillStyle = "rgba(246, 241, 231, .96)";
      ctx.beginPath();
      ctx.arc(center, center, 11, 0, Math.PI * 2);
      ctx.fill();
      return ctx.getImageData(0, 0, size, size);
    }
    if (shape === "cross") {
      ctx.fill();
      ctx.strokeStyle = "rgba(246, 241, 231, .98)";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.fill();
      ctx.stroke();
    }
    return ctx.getImageData(0, 0, size, size);
  }

  function eventIconImage(type) {
    const colors = {
      "区划": "#7a3027",
      "政治": "#b08a4a",
      "军事": "#3e5e54",
      "官制": "#58577f",
      "经济": "#356671",
      "文化": "#705a70",
      "外交": "#705a70",
    };
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const c = size / 2;
    ctx.beginPath();
    ctx.arc(c, c, 27, 0, Math.PI * 2);
    ctx.fillStyle = colors[type] || "#705a70";
    ctx.fill();
    ctx.strokeStyle = "rgba(246, 241, 231, .98)";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = "#fff8eb";
    ctx.fillStyle = "#fff8eb";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (type === "区划") {
      ctx.strokeRect(17, 24, 30, 21);
      ctx.beginPath();
      ctx.moveTo(22, 24); ctx.lineTo(22, 17); ctx.lineTo(29, 17); ctx.lineTo(29, 24);
      ctx.moveTo(34, 24); ctx.lineTo(34, 17); ctx.lineTo(41, 17); ctx.lineTo(41, 24);
      ctx.stroke();
    } else if (type === "政治") {
      ctx.strokeRect(19, 25, 26, 20);
      ctx.strokeRect(27, 14, 10, 8);
      ctx.beginPath(); ctx.moveTo(32, 14); ctx.lineTo(32, 9); ctx.stroke();
    } else if (type === "军事") {
      ctx.beginPath();
      ctx.moveTo(18, 46); ctx.lineTo(46, 18);
      ctx.moveTo(18, 18); ctx.lineTo(46, 46);
      ctx.moveTo(22, 42); ctx.lineTo(29, 35);
      ctx.moveTo(42, 42); ctx.lineTo(35, 35);
      ctx.stroke();
    } else if (type === "官制") {
      ctx.beginPath();
      ctx.moveTo(14, 37);
      ctx.quadraticCurveTo(32, 13, 50, 37);
      ctx.moveTo(14, 37); ctx.lineTo(50, 37);
      ctx.moveTo(10, 37); ctx.lineTo(15, 37);
      ctx.moveTo(49, 37); ctx.lineTo(54, 37);
      ctx.moveTo(25, 37); ctx.lineTo(25, 46); ctx.lineTo(39, 46); ctx.lineTo(39, 37);
      ctx.stroke();
    } else if (type === "经济") {
      ctx.beginPath(); ctx.arc(32, 32, 16, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeRect(27, 27, 10, 10);
    } else if (type === "文化") {
      ctx.strokeRect(18, 19, 28, 27);
      ctx.beginPath(); ctx.moveTo(24, 19); ctx.lineTo(24, 46); ctx.moveTo(30, 27); ctx.lineTo(40, 27); ctx.moveTo(30, 34); ctx.lineTo(40, 34); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(22, 16); ctx.lineTo(22, 48); ctx.moveTo(22, 18); ctx.lineTo(45, 18); ctx.lineTo(38, 25); ctx.lineTo(45, 32); ctx.lineTo(22, 32); ctx.stroke();
    }
    return ctx.getImageData(0, 0, size, size);
  }

  function eventMapSvg(type) {
    const raw = ICONS[EVENT_ICON_KEYS[type]] || ICONS.politics || "";
    const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/i, "").replace(/<\/svg>[\s\S]*$/i, "");
    const color = eventTypeColor(type);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="${color}" stroke="#f6f1e7" stroke-width="3"/><g transform="translate(14 14) scale(1.5)" fill="none" stroke="#fff8eb" color="#fff8eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g></svg>`;
  }

  function svgToImageData(svg, size = 64) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, size, size);
        URL.revokeObjectURL(url);
        resolve(context.getImageData(0, 0, size, size));
      };
      image.onerror = (error) => { URL.revokeObjectURL(url); reject(error); };
      image.src = url;
    });
  }

  async function registerLucideEventIcons() {
    for (const [type, key] of Object.entries(EVENT_TYPE_KEYS)) {
      try {
        const imageData = await svgToImageData(eventMapSvg(type), 64);
        if (map.hasImage(key)) map.updateImage(key, imageData);
        else map.addImage(key, imageData, { pixelRatio: 2 });
      } catch (error) {
        // The canvas fallback in styleimagemissing remains usable if an SVG fails.
      }
    }
    try {
      const mountainSvg = (ICONS.mountain || "").replaceAll("currentColor", "#5b6653");
      const imageData = await svgToImageData(mountainSvg, 64);
      if (map.hasImage("mountain-peak")) map.updateImage("mountain-peak", imageData);
      else map.addImage("mountain-peak", imageData, { pixelRatio: 2 });
    } catch (error) {
      // Keep the simple triangle fallback.
    }
  }

  function registerMarkerIcons() {
    for (const [provinceId, color] of Object.entries(PROVINCE_COLORS)) {
      for (const shape of ["province", "prefecture", "secondary", "dot"]) {
        const id = `prov-${provinceId}-${shape}`;
        if (!map.hasImage(id)) map.addImage(id, markerImage(shape, color), { pixelRatio: 2 });
      }
    }
    if (!map.hasImage("capital-star")) map.addImage("capital-star", markerImage("star", "#7a3027"), { pixelRatio: 2 });
    if (!map.hasImage("military-cross")) map.addImage("military-cross", markerImage("cross", "#3e5e54"), { pixelRatio: 2 });
    if (!map.hasImage("jimi-ring")) map.addImage("jimi-ring", markerImage("ring", "#7b5a3c"), { pixelRatio: 2 });
    if (!map.hasImage("mountain-peak")) map.addImage("mountain-peak", markerImage("triangle", "#6f6b5c"), { pixelRatio: 2 });
    for (const [type, key] of Object.entries(EVENT_TYPE_KEYS)) {
      if (!map.hasImage(key)) map.addImage(key, eventIconImage(type), { pixelRatio: 2 });
    }
  }

  function initMap() {
    map = new maplibregl.Map({
      container: "map",
      style: mapStyle(),
      center: [110, 34],
      zoom: 4,
      minZoom: 2.8,
      maxZoom: 11,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();

    map.on("styleimagemissing", (event) => {
      const id = event.id;
      if (map.hasImage(id)) return;
      if (id === "capital-star") {
        map.addImage(id, markerImage("star", "#7a3027"), { pixelRatio: 2 });
        return;
      }
      if (id === "military-cross") {
        map.addImage(id, markerImage("cross", "#3e5e54"), { pixelRatio: 2 });
        return;
      }
      if (id === "jimi-ring") {
        map.addImage(id, markerImage("ring", "#7b5a3c"), { pixelRatio: 2 });
        return;
      }
      if (id === "mountain-peak") {
        map.addImage(id, markerImage("triangle", "#6f6b5c"), { pixelRatio: 2 });
        return;
      }
      const eventEntry = Object.entries(EVENT_TYPE_KEYS).find(([, key]) => key === id);
      if (eventEntry) {
        map.addImage(id, eventIconImage(eventEntry[0]), { pixelRatio: 2 });
        return;
      }
      const match = id.match(/^prov-(.+)-(province|prefecture|secondary|dot|diamond|square|triangle)$/);
      if (match && PROVINCE_COLORS[match[1]]) {
        map.addImage(id, markerImage(match[2], PROVINCE_COLORS[match[1]]), { pixelRatio: 2 });
      }
    });

    map.on("load", async () => {
      registerMarkerIcons();
      await registerLucideEventIcons();
      const wide = window.innerWidth > 900;
      map.fitBounds([[98.0, 18.0], [125.0, 43.2]], {
        padding: wide
          ? { top: 92, bottom: 110, left: 370, right: 425 }
          : { top: 128, bottom: 100, left: 24, right: 24 },
        duration: 0,
      });
      renderLabels();
      applyLayerState();
      state.boundaryKey = null;
      setYear(state.year);
      const params = new URLSearchParams(window.location.search);
      const linkedUnit = params.get("unit");
      if (linkedUnit && unitById.has(linkedUnit)) {
        setTimeout(() => selectUnit(linkedUnit, { fly: false, tab: "detail" }), 250);
      }
    });

    ["admin-province", "admin-prefecture", "admin-department", "admin-county", "county-fill", "chgis-fill", "event-points"].forEach((layer) => {
      map.on("click", layer, (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        if (layer === "event-points") {
          const selected = eventById.get(String(feature.properties.id));
          if (!selected) return;
          if (selected.year !== state.year) setYear(selected.year);
          state.selectedEventId = selected.id;
          renderEvents();
          toast(`${selected.year} 年 · ${selected.title}`);
          return;
        }
        if (layer === "chgis-fill") {
          selectUnit(String(feature.properties.unitId || feature.properties.provinceId));
          return;
        }
        selectUnit(String(feature.properties.targetUnitId || feature.properties.id));
      });
      map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = ""; });
      map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
    });

    map.on("move", scheduleLabels);
    map.on("zoom", scheduleLabels);
    map.on("resize", scheduleLabels);
    map.on("idle", scheduleLabels);
    setTimeout(scheduleLabels, 600);
  }

  function scheduleLabels() {
    if (labelFrame) return;
    labelFrame = requestAnimationFrame(() => {
      labelFrame = 0;
      renderLabels();
    });
  }

  function renderLabels() {
    if (!map || !state.layers.labels) {
      clearLabels();
      return;
    }
    const zoom = map.getZoom();
    const width = map.getCanvas().clientWidth;
    const height = map.getCanvas().clientHeight;
    const show = {
      "capital-region": true,
      province: true,
      prefecture: zoom >= 4.2,
      department: zoom >= 5.2,
      county: zoom >= 6.2,
    };
    const used = new Set();
    const occupied = [];
    let count = 0;

    for (const unit of labelUnits) {
      if (!isUnitActive(unit, state.year)) continue;
      const levelToggle = unit.level === "capital-region" ? "province" : unit.level;
      if (!state.labelLevels[levelToggle]) continue;
      if (!show[unit.level]) continue;
      if (count > 620) break;
      const labelPoint = (unit.level === "province" || unit.level === "capital-region")
        && provinceLabelPoint.get(unit.id)
        ? provinceLabelPoint.get(unit.id)
        : [unit.lon, unit.lat];
      const point = map.project(labelPoint);
      if (point.x < 10 || point.y < 10 || point.x > width - 10 || point.y > height - 10) continue;

      let element = labelPool.get(unit.id);
      if (!element) {
        element = document.createElement("div");
        element.dataset.unitId = unit.id;
        $("#map-labels").appendChild(element);
        labelPool.set(unit.id, element);
      }
      const isCapital = unit.level === "capital-region";
      const kind = isCapital || unit.level === "province" ? "province" : unit.level;
      const labelOffset = {
        "capital-region": 0,
        province: 0,
        prefecture: -10,
        department: 6,
        county: 22,
      }[unit.level] || 0;
      const pointKey = `${Math.round(point.x)},${Math.round(point.y)}`;
      element.className = `map-label map-label--${kind}${state.selectedUnitId === unit.id ? " is-selected" : ""}`;
      element.textContent = unit.name;
      element.style.transform = `translate3d(${point.x}px, ${point.y + labelOffset}px, 0) translate(-50%, -50%)`;
      element.style.display = "";
      const labelWidth = Math.max(24, element.offsetWidth + 8);
      const labelHeight = Math.max(12, element.offsetHeight + 4);
      const box = {
        left: point.x - labelWidth / 2,
        right: point.x + labelWidth / 2,
        top: point.y + labelOffset - labelHeight / 2,
        bottom: point.y + labelOffset + labelHeight / 2,
        pointKey,
      };
      const collides = occupied.some((other) =>
        other.pointKey !== pointKey
        && box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top);
      if (collides && !(isCapital || unit.level === "province")) {
        element.style.display = "none";
        continue;
      }
      occupied.push(box);
      used.add(unit.id);
      count += 1;
    }

    for (const [id, element] of labelPool.entries()) {
      if (!used.has(id)) {
        element.style.display = "none";
      }
    }
    renderMountainLabels(occupied, width, height, zoom);
  }

  function renderMountainLabels(occupied, width, height, zoom) {
    const used = new Set();
    const mountainBoxes = [];
    if (!state.layers.mountains) {
      for (const element of mountainLabelPool.values()) element.style.display = "none";
      return;
    }
    for (const range of MOUNTAINS) {
      if (zoom < 3.2) continue;
      const coords = range.coords;
      const labelPoint = coords[Math.floor(coords.length / 2)];
      const point = map.project(labelPoint);
      if (point.x < 12 || point.y < 12 || point.x > width - 12 || point.y > height - 12) continue;
      let element = mountainLabelPool.get(range.name);
      if (!element) {
        element = document.createElement("div");
        element.dataset.mountain = range.name;
        $("#map-labels").appendChild(element);
        mountainLabelPool.set(range.name, element);
      }
      element.className = "map-label map-label--mountain";
      element.textContent = range.name;
      let length = 0;
      for (let index = 1; index < coords.length; index += 1) {
        length += Math.hypot(coords[index][0] - coords[index - 1][0], coords[index][1] - coords[index - 1][1]);
      }
      const fontSize = Math.min(16, Math.max(9, 9 + length * 0.68));
      const letterSpacing = Math.min(18, Math.max(1.5, length * 1.35));
      element.style.fontSize = `${fontSize.toFixed(1)}px`;
      element.style.letterSpacing = `${letterSpacing.toFixed(1)}px`;
      const [x1, y1] = coords[0];
      const [x2, y2] = coords[coords.length - 1];
      let angle = Math.atan2(-(y2 - y1), x2 - x1) * 180 / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      element.style.transform = `translate3d(${point.x}px, ${point.y + 8}px, 0) translate(-50%, -50%) rotate(${angle.toFixed(1)}deg)`;
      element.style.display = "";
      const labelWidth = Math.max(20, element.offsetWidth + 6);
      const labelHeight = Math.max(11, element.offsetHeight + 3);
      const box = {
        left: point.x - labelWidth / 2,
        right: point.x + labelWidth / 2,
        top: point.y + 8 - labelHeight / 2,
        bottom: point.y + 8 + labelHeight / 2,
      };
      const collides = mountainBoxes.some((other) =>
        box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top);
      if (collides) {
        element.style.display = "none";
        continue;
      }
      mountainBoxes.push(box);
      used.add(range.name);
    }
    for (const [name, element] of mountainLabelPool.entries()) {
      if (!used.has(name)) element.style.display = "none";
    }
  }

  function clearLabels() {
    for (const element of labelPool.values()) element.style.display = "none";
    for (const element of mountainLabelPool.values()) element.style.display = "none";
  }

  function setLayerVisibility(layerIds, visible) {
    if (!map) return;
    for (const id of layerIds) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    }
  }

  function applyLayerState() {
    setLayerVisibility(["national-fill", "national-line"], state.layers.national);
    setLayerVisibility(["modern-china-line"], state.layers.modern);
    setLayerVisibility(["province-fill", "province-line", "province-line-top"], state.layers.provinces);
    setLayerVisibility(["admin-province", "admin-prefecture", "admin-department", "admin-county"], state.layers.admin);
    setLayerVisibility(["county-fill", "county-boundaries", "prefecture-line"], state.layers.admin && !state.layers.chgis);
    setLayerVisibility(["chgis-fill", "chgis-line"], state.layers.admin && state.layers.chgis);
    setLayerVisibility(["military-points"], state.layers.military);
    setLayerVisibility(["jimi-points"], state.layers.jimi);
    setLayerVisibility(["event-halo", "event-points"], state.layers.events);
    setLayerVisibility(["mountain-ridges", "mountain-peaks"], state.layers.mountains);
    if (typeof syncDisplayControls === "function") syncDisplayControls();
    if (state.layers.labels) scheduleLabels(); else clearLabels();
  }

  function clearPolygonSelection() {
    for (const featureId of state.selectedPolygonIds) {
      map.removeFeatureState({ source: "counties", id: featureId });
    }
    state.selectedPolygonIds = [];
  }

  function selectPolygonsForUnit(unitId, unit) {
    if (!map || !map.getSource("counties")) return;
    clearPolygonSelection();
    // Group by the current snapshot, so selecting a prefecture highlights all of its
    // county/territory polygons rather than a single county ring.
    const features = boundarySnapshotFor(state.year).counties?.features || [];
    const selected = [];
    for (const feature of features) {
      const properties = feature.properties || {};
      if (unit.level === "county") {
        if ((properties.ids || []).includes(unitId) || properties.id === unitId) selected.push(feature.id);
      } else if (unit.level === "prefecture" || unit.level === "department") {
        if (properties.prefId === unitId) selected.push(feature.id);
      } else if (unit.level === "province" || unit.level === "capital-region") {
        if (properties.provinceId === unitId) selected.push(feature.id);
      }
    }
    for (const featureId of selected) {
      map.setFeatureState({ source: "counties", id: featureId }, { selected: true });
    }
    state.selectedPolygonIds = selected;
  }

  function selectUnit(unitId, options = {}) {
    const unit = unitById.get(unitId);
    if (!unit) return;
    if (state.selectedUnitId) {
      map.removeFeatureState({ source: "markers", id: state.selectedUnitId });
    }
    state.selectedUnitId = unitId;
    map.setFeatureState({ source: "markers", id: unitId }, { selected: true });
    selectPolygonsForUnit(unitId, unit);
    renderChief();
    renderDetail();
    scheduleLabels();
    $("#selection-count").textContent = `${unit.name} · ${unit.levelLabel}`;
    if (options.fly !== false) {
      const zoom = unit.level === "county" ? 8.2 : unit.level === "department" ? 7.2 : unit.level === "prefecture" ? 6.2 : 5.2;
      map.flyTo({ center: [unit.lon, unit.lat], zoom, duration: 700 });
    }
    if (options.tab === "detail") setRightTab("detail");
    if (options.toast) toast(`${unit.levelLabel} · ${unit.name}${unit.seatName ? "（治所 " + unit.seatName + "）" : ""}`);
  }

  function selectBySearch(unitId) {
    const unit = unitById.get(unitId);
    if (!unit) return;
    setRightTab("detail");
    selectUnit(unitId, { tab: "detail", toast: true });
    hideSearch();
  }

  function renderChief() {
    const container = $("#local-chief");
    if (!state.selectedUnitId) {
      container.innerHTML = `
        <h3>本区主官</h3>
        <p>点击地图上的省、府、州、县，查看与它配套的地方主官、品级与佐贰官。</p>
        <p class="tree-note" style="margin:8px 0 0">例：县 → 知县（正七品）、县丞（正八品）、主簿（正九品）、典史（未入流）。</p>`;
      return;
    }
    const unit = unitById.get(state.selectedUnitId);
    const posts = OFF.levelPosts[unit.level] || [];
    container.innerHTML = `
      <h3>${esc(unit.name)}</h3>
      <p>${esc(unit.levelLabel)} · ${esc(unit.provinceName)}${unit.seatName ? " · 治所 " + esc(unit.seatName) : ""}</p>
      <div class="chief-list">
        ${posts.map((post) => `<div class="chief-row"><b>${esc(post.post)}</b>${rankBadge(post.rank)}<small>${esc(post.note || "")}</small></div>`).join("")}
      </div>
      <button class="unit-chip" id="open-detail" type="button" style="margin-top:10px">查看完整详情 →</button>`;
  }

  function renderOfficialdom() {
    const year = state.year;
    const visible = (node) => (!node.validFrom || year >= node.validFrom) && (!node.validTo || year <= node.validTo);
    const nodeHtml = (node, depth = 0) => {
      if (!visible(node)) return "";
      const children = (node.children || []).filter(visible);
      const head = `<span class="tree-name">${esc(node.name)}</span>${rankBadge(node.rank)}${node.role ? `<span class="tree-role">${esc(node.role)}</span>` : ""}`;
      if (children.length) {
        return `<details class="tree-node" ${depth < 1 ? "open" : ""}>
          <summary>${head}</summary>
          ${node.note ? `<div class="tree-note">${esc(node.note)}</div>` : ""}
          <div class="tree-children">${children.map((child) => nodeHtml(child, depth + 1)).join("")}</div>
        </details>`;
      }
      return `<div class="tree-leaf">${head}</div>${node.note ? `<div class="tree-note">${esc(node.note)}</div>` : ""}`;
    };

    $("#officialdom-tree").innerHTML = `
      <details open>
        <summary>中央官制 <span class="panel-count">${eraLabel(year)}</span></summary>
        <p class="officialdom-note">${esc(OFF.central.note)}</p>
        ${OFF.central.tree.map((node) => nodeHtml(node)).join("")}
      </details>
      <details open>
        <summary>地方官制 <span class="panel-count">都 · 布 · 按</span></summary>
        <p class="officialdom-note">${esc(OFF.local.note)}</p>
        ${OFF.local.tree.map((node) => nodeHtml(node)).join("")}
      </details>`;
  }

  function renderFigures() {
    const visible = FIGURES.filter((figure) => figure.from <= state.year && figure.to >= state.year);
    const central = visible.filter((figure) => figure.category === "central");
    const local = visible.filter((figure) => figure.category === "local");
    const card = (figure) => `<button class="figure-card" type="button" data-figure-id="${esc(figure.id)}">
      <span class="figure-avatar">${figure.portrait ? `<img src="${esc(figure.portrait)}" alt="${esc(figure.name)}" loading="lazy" />` : esc(figure.name.slice(0, 1))}</span>
      <span><b>${esc(figure.name)}</b><small><span class="figure-tag">${figure.category === "central" ? "中央" : "地方"}</span>${esc(figure.office || "")}</small></span>
    </button>`;
    const section = (title, rows) => rows.length ? `<div class="figures-title"><span>${title}</span><span>${rows.length} 人</span></div><div class="figures-grid">${rows.map(card).join("")}</div>` : "";
    $("#figures-panel").innerHTML = visible.length
      ? `<div class="figures-title"><span>同期人物 · ${state.year}</span><span>${visible.length} 人</span></div>${section("中央", central)}${section("地方", local)}`
      : `<div class="figures-title"><span>同期人物 · ${state.year}</span><span>暂无</span></div><p class="tree-note">当前年份暂无录入人物。</p>`;
  }

  function openFigure(figureId) {
    const figure = FIGURES.find((item) => item.id === figureId);
    if (!figure) return;
    $("#figure-dialog-body").innerHTML = `
      <h2>${esc(figure.name)}</h2>
      <div class="figure-courtesy">${esc(figure.courtesy || "")} · ${esc(figure.region || "")} · ${figure.from}—${figure.to}</div>
      <div class="figure-office">${esc(figure.office || "")}</div>
      <div class="figure-meta">
        ${figure.portrait ? `<img class="figure-portrait" src="${esc(figure.portrait)}" alt="${esc(figure.name)}" />` : `<div class="figure-portrait figure-avatar" style="height:180px;font-size:52px">${esc(figure.name.slice(0, 1))}</div>`}
        <div><p class="figure-bio">${esc(figure.bio || "")}</p></div>
      </div>
      <h3>历任官职</h3>
      <ul>${(figure.career || []).map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
    $("#figure-dialog").showModal();
  }

  function renderRankLegend() {
    const ranks = ["正一品", "从一品", "正二品", "从二品", "正三品", "从三品", "正四品", "正七品", "未入流"];
    $("#rank-legend").innerHTML = ranks.map((rank) => rankBadge(rank)).join("");
  }

  function renderMapLegend() {
    const legend = [
      ["capital", "首都（五角星）"],
      ["province", "省级行政中心"],
      ["prefecture", "府（大小圆圈）"],
      ["department", "州（圆内一点）"],
      ["county", "县级行政中心"],
      ["military", "都司卫所"],
      ["jimi", "羁縻/土司"],
      ["river", "河流/海岸"],
    ];
    const eventTypes = ["区划", "政治", "军事", "官制", "经济", "文化", "外交"];
    $("#map-legend").innerHTML = `<h3>图例 · 治所层级</h3><div class="legend-grid">${legend.map(([kind, label]) => `<div class="legend-item"><span class="legend-symbol legend-symbol--${kind}"></span><span>${label}</span></div>`).join("")}<div class="legend-item"><span class="legend-symbol legend-symbol--mountain-icon">${ICONS.mountain || ""}</span><span>山脉</span></div></div><p class="tree-note" style="margin:8px 0 0">同址多级治所，图上只显示最高一级；文字逐级显示。符号形状固定，实际颜色随省域变化。</p>
      <h3 style="margin-top:14px">图例 · 事件类型</h3><div class="event-legend-grid">${eventTypes.map((type) => `<div class="event-legend-item"><span class="event-icon event-legend-badge" style="--badge:${eventTypeColor(type)}">${eventIconSvg(type)}</span><span>${type}</span></div>`).join("")}</div>`;
  }

  function renderDetail() {
    const container = $("#detail-content");
    if (!state.selectedUnitId) {
      container.className = "detail-content empty-state";
      container.innerHTML = `<div class="empty-mark">舆</div><p>点击地图上的府、州、县，或搜索地名，查看它的层级、户口服赋与上下级关系。</p>`;
      return;
    }
    const unit = unitById.get(state.selectedUnitId);
    const provinceUnit = unitById.get(unit.provinceId);
    const showStats = unit.level === "province" || unit.level === "capital-region";
    const stats = showStats ? (unit.stats.length ? unit.stats : (provinceUnit?.stats || [])) : [];
    const children = unit.children.map((id) => unitById.get(id)).filter(Boolean);
    const sourceTitles = [...new Set((unit.sources || []).map((link) => sourceById.get(link.sourceId)?.title).filter(Boolean))];
    const crumbs = unit.ancestry.filter((item) => item.id !== unit.id);

    container.className = "detail-content";
    container.innerHTML = `
      <div class="detail-head">
        <div class="detail-level">${esc(unit.levelLabel)} · ${esc(unit.provinceName)}</div>
        <h2>${esc(unit.name)}</h2>
        <div class="formal">${esc(unit.formalName || "—")}</div>
        <div class="breadcrumb">${crumbs.map((item) => `<button type="button" data-unit-id="${esc(item.id)}">${esc(item.name)}</button>`).join(" <span>/</span> ")}${crumbs.length ? " <span>/</span> " : ""}<b>${esc(unit.name)}</b></div>
      </div>
      <div class="detail-section">
        <h3>建置信息</h3>
        <dl class="detail-kv">
          <dt>层级</dt><dd>${esc(unit.levelLabel)}</dd>
          <dt>上级</dt><dd>${crumbs.length ? crumbs.map((item) => `<button class="unit-chip" type="button" data-unit-id="${esc(item.id)}">${esc(item.name)}</button>`).join(" / ") : "—"}</dd>
          <dt>治所</dt><dd>${esc(unit.seatName || "—")}</dd>
          <dt>有效年份</dt><dd>${unit.validity ? `${unit.validity.from ?? "—"}—${unit.validity.to ?? "—"} 年（${esc(unit.validity.precision)}）` : "—"}</dd>
          <dt>置信度</dt><dd>${esc(unit.confidence || "—")}</dd>
        </dl>
      </div>
      ${showStats ? `<div class="detail-section">
        <h3>户口与赋税（省级数据）</h3>
        ${stats.length ? `<div class="stat-list">${stats.map((stat) => `<div class="stat-item"><strong>${fmt(stat.value)}</strong><span>${esc(METRIC_LABELS[stat.metric] || stat.metric)} · ${stat.recordedYear || "—"}</span></div>`).join("")}</div>` : `<p class="tree-note">本省暂无户口/赋税记录。</p>`}
      </div>` : ""}
      <div class="detail-section">
        <h3>下级单位 · ${children.length}</h3>
        ${children.length ? `<div class="chip-list">${children.slice(0, 36).map((child) => `<button class="unit-chip" type="button" data-unit-id="${esc(child.id)}">${esc(child.name)}</button>`).join("")}</div>${children.length > 36 ? `<p class="tree-note">仅显示前 36 个，共 ${children.length} 个。</p>` : ""}` : `<p class="tree-note">无下级建置。</p>`}
      </div>
      <div class="detail-section">
        <h3>史料来源</h3>
        ${sourceTitles.length ? `<ul class="source-list">${sourceTitles.map((title) => `<li>${esc(title)}</li>`).join("")}</ul>` : `<p class="tree-note">—</p>`}
      </div>
      <div class="note-box">本原型以万历二十八年（1600）的县级数据为基准；拖动年份会切换事件与官制，但不逐年重绘县级边界。历史示意图，非现代行政地图。</div>`;
  }

  function renderEventFilters() {
    const entries = [
      ["all", "全部", null],
      ["区划", "区划", "区划"],
      ["政治", "政治", "政治"],
      ["军事", "军事", "军事"],
      ["官制", "官制", "官制"],
      ["经济", "经济", "经济"],
      ["文化", "文化", "文化"],
      ["外交", "外交", "外交"],
    ];
    $("#event-filters").innerHTML = entries.map(([key, label, icon]) =>
      `<button class="filter-chip${key === state.eventFilter ? " is-active" : ""}" type="button" data-filter="${esc(key)}">${icon ? `<span class="event-icon">${eventIconSvg(icon)}</span>` : ""}${esc(label)}</button>`).join("");
  }

  function renderEvents() {
    const filter = state.eventFilter;
    const exact = EVENTS.filter((event) => event.year === state.year && (filter === "all" || event.type === filter));
    const upcoming = EVENTS.filter((event) => event.year > state.year && (filter === "all" || event.type === filter))
      .sort((a, b) => a.year - b.year)
      .slice(0, 8);
    const card = (event) => `<article class="event-card${state.selectedEventId === event.id ? " is-selected" : ""}" data-event-id="${esc(event.id)}">
      <div class="event-card__head"><span class="event-card__year">${event.year}</span><span class="event-type event-type--${esc(event.type)}"><span class="event-icon">${eventIconSvg(event.type)}</span>${esc(event.type)}</span><span class="event-card__title">${esc(event.title)}</span></div>
      <div class="event-card__summary">${esc(event.summary)}</div>
      ${event.impact ? `<div class="event-card__impact">影响：${esc(event.impact)}</div>` : ""}
    </article>`;

    $("#event-list").innerHTML = `
      <div class="event-section-label">本年 · ${state.year}</div>
      ${exact.length ? exact.map(card).join("") : `<div class="event-empty">本年暂无录入事件。<br>可拖动时间轴或查看“此后大事”。</div>`}
      <div class="event-section-label">此后大事</div>
      ${upcoming.length ? upcoming.map(card).join("") : `<div class="event-empty">此后暂无录入事件。</div>`}`;
    $("#event-count").textContent = `${exact.length} 条 / 全 ${EVENTS.length} 条`;
  }

  function updateTimelinePointer() {
    const pointer = $("#timeline-pointer");
    if (!pointer) return;
    const percent = ((state.year - 1368) / (1644 - 1368)) * 100;
    pointer.style.left = `${percent}%`;
  }

  function renderYearSummary() {
    const era = eraLabel(state.year);
    const info = eraFor(state.year);
    const exact = EVENTS.filter((event) => event.year === state.year);
    const admin = exact.filter((event) => event.type === "区划");
    $("#year-era").textContent = era;
    $("#year-emperor").textContent = info.emperor;
    $("#year-events-count").textContent = `本年 ${exact.length} 条`;
    const note = $("#year-admin-note");
    note.hidden = false;
    note.textContent = admin.length
      ? `本年区划调整：${admin.map((event) => event.title).join("；")}`
      : `区划底图：${boundaryLabel(boundarySnapshotFor(state.year).key)}；县级界址按年号/建置变化重建。`;
    $("#year-chip-era").textContent = era;
    $("#year-chip-year").textContent = state.year;
    $("#year-range").value = state.year;
    updateTimelinePointer();
  }

  function setYear(year, options = {}) {
    const next = Math.max(1368, Math.min(1644, Number(year)));
    const previousBoundary = state.boundaryKey;
    state.year = next;
    state.selectedEventId = options.keepEvent ? state.selectedEventId : null;
    updateBoundarySnapshot(next);
    renderYearSummary();
    updateTimelineEraActive();
    renderEvents();
    renderOfficialdom();
    renderFigures();
    if (map && map.getSource("events")) {
      map.getSource("events").setData(eventsFeatureCollection(next));
    }
    if (options.toast) toast(`${eraLabel(next)} · ${infoForYear(next)}`);
  }

  function infoForYear(year) {
    return eraFor(year).emperor;
  }

  function renderStatsCard() {
    const counts = MING.counts;
    $("#stats-card").innerHTML = `<h3>1600 年建置统计</h3><div class="stats-grid">
      <div><strong>${counts.prefecture}</strong><span>府</span></div>
      <div><strong>${counts.department}</strong><span>州</span></div>
      <div><strong>${counts.county}</strong><span>县</span></div>
      <div><strong>${MING.provinces.length}</strong><span>省级/留都</span></div>
      <div><strong>${counts.military}</strong><span>都司卫所</span></div>
      <div><strong>${counts.jimi}</strong><span>羁縻/土司</span></div>
    </div><p class="tree-note" style="margin:9px 0 0">数据来自“历史地图计划”1600 年断面；府州县点位 1,563 个。</p>`;
  }

  function switchLeftTab(tab) {
    state.leftTab = tab;
    $$(".left-panel .tab").forEach((button) => button.classList.toggle("is-active", button.dataset.tab === tab));
    $("#events-view").hidden = tab !== "events";
    $("#layers-view").hidden = tab !== "layers";
  }

  function setRightTab(tab) {
    state.rightTab = tab;
    $$(".right-panel .tab").forEach((button) => button.classList.toggle("is-active", button.dataset.tab === tab));
    $("#officialdom-view").hidden = tab !== "officialdom";
    $("#detail-view").hidden = tab !== "detail";
  }

  function initSearch() {
    const input = $("#search");
    const results = $("#search-results");
    const hide = () => { results.hidden = true; results.innerHTML = ""; };
    const search = () => {
      const query = input.value.trim();
      if (!query) { hide(); return; }
      const matches = units
        .filter((unit) => `${unit.name}${unit.formalName || ""}${unit.provinceName}${unit.seatName || ""}`.includes(query))
        .sort((a, b) => {
          const aExact = a.name === query ? 0 : a.name.startsWith(query) ? 1 : 2;
          const bExact = b.name === query ? 0 : b.name.startsWith(query) ? 1 : 2;
          return aExact - bExact || a.level.localeCompare(b.level);
        })
        .slice(0, 12);
      if (!matches.length) {
        results.innerHTML = `<div class="search-empty">没有找到“${esc(query)}”</div>`;
      } else {
        results.innerHTML = matches.map((unit) => `<button class="search-result" type="button" data-unit-id="${esc(unit.id)}">
          <span><b>${esc(unit.name)}</b><small> ${esc(unit.levelLabel)} · ${esc(unit.provinceName)}</small></span>
          <small>${unit.seatName ? esc(unit.seatName) : "—"}</small>
        </button>`).join("");
      }
      results.hidden = false;
    };
    input.addEventListener("input", search);
    input.addEventListener("keydown", (event) => { if (event.key === "Escape") hide(); });
    results.addEventListener("click", (event) => {
      const button = event.target.closest("[data-unit-id]");
      if (!button) return;
      input.value = button.querySelector("b")?.textContent || "";
      hide();
      selectBySearch(button.dataset.unitId);
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".search-wrap")) hide();
    });
    window.hideSearch = hide;
  }

  function hideSearch() {
    const results = $("#search-results");
    if (results) { results.hidden = true; results.innerHTML = ""; }
  }

  function renderTimelineEras() {
    const total = 1644 - 1368 + 1;
    const container = $("#timeline-eras");
    container.innerHTML = ERAS.map((era) => {
      const width = ((era.to - era.from + 1) / total) * 100;
      return `<button class="timeline-era" type="button" data-year="${era.from}" style="flex:0 0 ${width}%" title="${era.era} · ${era.from}—${era.to}">${era.era}</button>`;
    }).join("");
    container.addEventListener("click", (event) => {
      const button = event.target.closest("[data-year]");
      if (!button) return;
      stopPlay();
      setYear(Number(button.dataset.year), { toast: true });
    });
  }

  function updateTimelineEraActive() {
    const info = eraFor(state.year);
    $$("#timeline-eras .timeline-era").forEach((button) => {
      button.classList.toggle("is-active", Number(button.dataset.year) === info.from);
    });
  }

  function initTimeline() {
    renderTimelineEras();
    const range = $("#year-range");
    range.addEventListener("input", () => setYear(range.value));
    $("#btn-prev").addEventListener("click", () => setYear(state.year - 1));
    $("#btn-next").addEventListener("click", () => setYear(state.year + 1));
    $("#btn-year-1600").addEventListener("click", () => { stopPlay(); setYear(1600, { toast: true }); });
    $("#btn-play").addEventListener("click", togglePlay);

    const markers = $("#timeline-markers");
    markers.innerHTML = EVENTS.filter((event) => MAJOR_EVENT_IDS.has(event.id)).map((event) => {
      const left = ((event.year - 1368) / (1644 - 1368)) * 100;
      return `<button class="timeline-marker type-${esc(event.type)}" type="button" style="left:${left}%" data-year="${event.year}" data-event-id="${esc(event.id)}" title="${event.year} · ${esc(event.title)}"><span class="timeline-event-icon">${eventIconSvg(event.type)}</span></button>`;
    }).join("");
    markers.addEventListener("click", (event) => {
      const button = event.target.closest("[data-year]");
      if (!button) return;
      stopPlay();
      setYear(button.dataset.year, { toast: true });
      state.selectedEventId = button.dataset.eventId;
      renderEvents();
    });

    const ticks = $("#timeline-ticks");
    const tickYears = [1368, 1400, 1425, 1450, 1475, 1500, 1525, 1550, 1575, 1600, 1625, 1644];
    ticks.innerHTML = tickYears.map((year) => {
      const left = ((year - 1368) / (1644 - 1368)) * 100;
      return `<span class="timeline-tick" style="left:${left}%">${year}</span>`;
    }).join("");
  }

  function setPlayIcon(playing) {
    const button = $("#btn-play");
    if (!button) return;
    button.innerHTML = playing ? (ICONS.pause || "Ⅱ") : (ICONS.play || "▶");
  }

  function togglePlay() {
    if (state.playing) { stopPlay(); return; }
    state.playing = true;
    $("#btn-play").classList.add("is-playing");
    setPlayIcon(true);
    if (state.year >= 1644) setYear(1368);
    state.playTimer = setInterval(() => {
      if (state.year >= 1644) { stopPlay(); return; }
      setYear(state.year + 1);
    }, 260);
  }

  function stopPlay() {
    state.playing = false;
    if (state.playTimer) clearInterval(state.playTimer);
    state.playTimer = null;
    const button = $("#btn-play");
    if (button) { button.classList.remove("is-playing"); setPlayIcon(false); }
  }

  function renderTabIcons() {
    const tabs = [
      ["tab-events", "events"],
      ["tab-layers", "layers"],
      ["tab-officialdom", "officialdom"],
      ["tab-detail", "details"],
    ];
    for (const [id, key] of tabs) {
      const button = $(`#${id}`);
      if (button && ICONS[key]) button.insertAdjacentHTML("afterbegin", `<span class="tab-icon">${ICONS[key]}</span>`);
    }
  }

  function initResizers() {
    let active = null;
    let side = "left";
    let startX = 0;
    let startWidth = 0;
    const finish = () => {
      if (!active) return;
      active.classList.remove("is-dragging");
      document.body.classList.remove("resizing");
      active = null;
    };
    const move = (event) => {
      if (!active) return;
      const delta = side === "left" ? event.clientX - startX : startX - event.clientX;
      const width = Math.max(270, Math.min(620, startWidth + delta));
      document.documentElement.style.setProperty(side === "left" ? "--left-panel-width" : "--right-panel-width", `${width}px`);
      localStorage.setItem(`ming-panel-${side}`, String(width));
    };
    for (const [key, variable] of [["left", "--left-panel-width"], ["right", "--right-panel-width"]]) {
      const stored = Number(localStorage.getItem(`ming-panel-${key}`));
      if (stored) document.documentElement.style.setProperty(variable, `${Math.max(270, Math.min(620, stored))}px`);
    }
    $$(".panel-resizer").forEach((handle) => {
      handle.addEventListener("pointerdown", (event) => {
        active = handle;
        side = handle.dataset.panel;
        startX = event.clientX;
        const property = side === "left" ? "--left-panel-width" : "--right-panel-width";
        startWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(property));
        handle.setPointerCapture(event.pointerId);
        handle.classList.add("is-dragging");
        document.body.classList.add("resizing");
      });
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", finish);
      handle.addEventListener("pointercancel", finish);
    });
  }

  function syncDisplayControls() {
    const values = {
      mountains: state.layers.mountains,
      modern: state.layers.modern,
      events: state.layers.events,
      province: state.labelLevels.province,
      prefecture: state.labelLevels.prefecture,
      department: state.labelLevels.department,
      county: state.labelLevels.county,
    };
    $$("[data-display]").forEach((input) => { input.checked = Boolean(values[input.dataset.display]); });
  }

  function initDisplayMenu() {
    const button = $("#btn-display");
    const menu = $("#display-menu");
    const close = () => { menu.hidden = true; button.setAttribute("aria-expanded", "false"); };
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      menu.hidden = !menu.hidden;
      button.setAttribute("aria-expanded", String(!menu.hidden));
    });
    menu.addEventListener("click", (event) => event.stopPropagation());
    $$("[data-display]").forEach((input) => {
      input.addEventListener("change", () => {
        const key = input.dataset.display;
        if (key === "mountains" || key === "modern" || key === "events") {
          state.layers[key] = input.checked;
          const checkbox = { mountains: "layer-mountains", modern: "layer-modern", events: "layer-events" }[key];
          if (checkbox && $(`#${checkbox}`)) $(`#${checkbox}`).checked = input.checked;
          applyLayerState();
        } else {
          state.labelLevels[key] = input.checked;
          scheduleLabels();
        }
      });
    });
    document.addEventListener("click", close);
    syncDisplayControls();
  }

  function initControls() {
    $("#btn-zoom-in").addEventListener("click", () => map.zoomIn({ duration: 250 }));
    $("#btn-zoom-out").addEventListener("click", () => map.zoomOut({ duration: 250 }));
    $("#btn-reset").addEventListener("click", () => {
      const wide = window.innerWidth > 900;
      map.fitBounds([[98.0, 18.0], [125.0, 43.2]], {
        padding: wide ? { top: 92, bottom: 110, left: 370, right: 425 } : { top: 128, bottom: 100, left: 24, right: 24 },
        duration: 650,
      });
    });
    $("#btn-chapters").addEventListener("click", () => { window.location.href = "chapters.html?chapter=ming"; });
    $("#btn-about").addEventListener("click", () => $("#about-dialog").showModal());
    $("#btn-about-close").addEventListener("click", () => $("#about-dialog").close());
    $("#about-dialog").addEventListener("click", (event) => {
      if (event.target === $("#about-dialog")) $("#about-dialog").close();
    });

    $("#tab-events").addEventListener("click", () => switchLeftTab("events"));
    $("#tab-layers").addEventListener("click", () => switchLeftTab("layers"));
    $("#tab-officialdom").addEventListener("click", () => setRightTab("officialdom"));
    $("#tab-detail").addEventListener("click", () => setRightTab("detail"));

    $("#event-filters").addEventListener("click", (event) => {
      const button = event.target.closest("[data-filter]");
      if (!button) return;
      state.eventFilter = button.dataset.filter;
      $$("#event-filters .filter-chip").forEach((chip) => chip.classList.toggle("is-active", chip === button));
      renderEvents();
    });

    $("#event-list").addEventListener("click", (event) => {
      const card = event.target.closest("[data-event-id]");
      if (!card) return;
      const selected = eventById.get(card.dataset.eventId);
      if (!selected) return;
      state.selectedEventId = selected.id;
      if (selected.year !== state.year) setYear(selected.year, { keepEvent: true });
      renderEvents();
      if (selected.lon !== undefined) map.flyTo({ center: [selected.lon, selected.lat], zoom: 5.6, duration: 700 });
      toast(`${selected.year} 年 · ${selected.title}`);
    });

    $("#local-chief").addEventListener("click", (event) => {
      if (event.target.closest("#open-detail")) setRightTab("detail");
    });
    $("#figures-panel").addEventListener("click", (event) => {
      const card = event.target.closest("[data-figure-id]");
      if (card) openFigure(card.dataset.figureId);
    });
    $("#btn-figure-close").addEventListener("click", () => $("#figure-dialog").close());
    $("#figure-dialog").addEventListener("click", (event) => {
      if (event.target === $("#figure-dialog")) $("#figure-dialog").close();
    });
    $("#detail-content").addEventListener("click", (event) => {
      const button = event.target.closest("[data-unit-id]");
      if (!button) return;
      selectUnit(button.dataset.unitId, { tab: "detail" });
    });
    $("#map-labels").addEventListener("click", (event) => {
      const label = event.target.closest("[data-unit-id]");
      if (!label) return;
      selectUnit(label.dataset.unitId, { fly: false });
    });

    const layerMap = {
      "layer-national": "national",
      "layer-modern": "modern",
      "layer-provinces": "provinces",
      "layer-admin": "admin",
      "layer-labels": "labels",
      "layer-mountains": "mountains",
      "layer-military": "military",
      "layer-jimi": "jimi",
      "layer-events": "events",
    };
    Object.entries(layerMap).forEach(([id, key]) => {
      const checkbox = $(`#${id}`);
      checkbox.checked = state.layers[key];
      checkbox.addEventListener("change", () => {
        state.layers[key] = checkbox.checked;
        applyLayerState();
      });
    });
  }

  function init() {
    initMap();
    initSearch();
    initTimeline();
    setPlayIcon(false);
    renderTabIcons();
    initResizers();
    initDisplayMenu();
    initControls();
    renderStatsCard();
    renderMapLegend();
    renderEventFilters();
    renderFigures();
    renderYearSummary();
    renderEvents();
    renderChief();
    renderOfficialdom();
    renderDetail();
    const params = new URLSearchParams(window.location.search);
    const initialYear = Number(params.get("year")) || 1600;
    setYear(initialYear);
    if (params.get("tab") === "layers") switchLeftTab("layers");
    if (params.get("tab") === "detail") setRightTab("detail");
  }

  init();
})();
