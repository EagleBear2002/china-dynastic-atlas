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
  const CHGIS_NATION = window.__CHGIS_NATION__ || REF.nationalOutline;
  const CHGIS_SPECIAL_TYPES = new Set(["行都司", "都司", "卫", "所", "宣慰司", "宣抚司", "长官司", "招讨司", "夷", "wz"]);
  const TERRITORIES = window.__TERRITORIES__ || { periods: [] };
  const WORLD1600 = window.__WORLD1600__ || { type: "FeatureCollection", features: [] };

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
  for (const province of MING.provinces) {
    if (!PROVINCE_COLORS[province.id]) PROVINCE_COLORS[province.id] = province.color || "#81796e";
    province.color = PROVINCE_COLORS[province.id];
  }
  for (const unit of MING.units) unit.color = PROVINCE_COLORS[unit.provinceId] || "#81796e";

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

  // 1600 播州之役后的改置：CHGIS 没有单独的遵义府/平越府面，用原播州宣慰司、
  // 平越卫的辖域生成接替单位，保证时间轴进入 1600 年后这一块仍可点击。
  MING.units.push(
    {
      id: "zunyi-replacement", name: "遵义府", level: "prefecture", levelLabel: "府",
      provinceId: "guizhou", provinceName: "贵州", parentId: "guizhou",
      seatName: "遵义", lon: 106.9, lat: 27.7, formalName: "遵义军民府",
      children: [], ancestry: [], stats: [], sources: [],
      validity: { from: 1600, to: 1644, precision: "exact" }, confidence: "reconstructed",
    },
    {
      id: "pingyue-replacement", name: "平越府", level: "prefecture", levelLabel: "府",
      provinceId: "guizhou", provinceName: "贵州", parentId: "guizhou",
      seatName: "平越", lon: 107.5, lat: 26.7, formalName: "平越军民府",
      children: [], ancestry: [], stats: [], sources: [],
      validity: { from: 1600, to: 1644, precision: "exact" }, confidence: "reconstructed",
    },
  );
  const units = MING.units;
  // The source snapshot only records a 1600 point in time; replace those
  // degenerate 1600—1600 ranges with usable Ming-era ranges. Prefectures are
  // aligned to the CHGIS feature ranges by name+province; unmatched units get
  // the Ming-wide fallback.
  // CHGIS records three features with end=1600 although only the two units that
  // were actually replaced by the 1600 播州改土归流 end that year; 镇远府 (and any
  // other feature marked so) persisted past 1600, so its end is the dataset
  // horizon, not a real abolition. Treat end=1600 as "still present at 1600".
  const CHGIS_ABOLISHED_1600 = new Set(["播州宣慰司", "平越卫"]);
  const chgisEndYear = (properties) => (
    properties.end === 1600 && !CHGIS_ABOLISHED_1600.has(properties.name) ? 1644 : properties.end
  );
  const chgisRangeByNameProvince = new Map();
  for (const feature of CHGIS_MING.features || []) {
    const properties = feature.properties || {};
    if (properties.beg == null && properties.end == null) continue;
    const key = `${properties.name}|${properties.provinceId}`;
    const current = chgisRangeByNameProvince.get(key) || [9999, -9999];
    const end = chgisEndYear(properties);
    if (properties.beg != null) current[0] = Math.min(current[0], properties.beg);
    if (end != null) current[1] = Math.max(current[1], end);
    chgisRangeByNameProvince.set(key, current);
  }
  // --- Year model: CHGIS is the only source with real periods (beg/end) ------
  // Each point takes the validity of the CHGIS feature it belongs to — matched by
  // name first, then by location; departments and counties inherit their parent
  // prefecture. That keeps the point label, the colour block beneath it and the
  // territory switching year together.
  const chgisRangesByName = new Map();
  const chgisBoxes = [];
  for (const feature of CHGIS_MING.features || []) {
    const properties = feature.properties || {};
    if (properties.beg == null && properties.end == null) continue;
    const range = [properties.beg ?? 1368, chgisEndYear(properties) ?? 1644];
    if (properties.name) {
      const list = chgisRangesByName.get(properties.name) || [];
      list.push(range);
      chgisRangesByName.set(properties.name, list);
    }
    chgisBoxes.push({ box: geometryBounds(feature.geometry), range, geometry: feature.geometry });
  }
  const mergeRange = (ranges) => ranges.reduce(
    (acc, range) => [Math.min(acc[0], range[0]), Math.max(acc[1], range[1])], [9999, -9999]);
  const clampRange = (range) => ({
    from: Math.max(Number(window.__YEAR_MIN__ ?? 1368), range[0]),
    to: Math.min(Number(window.__YEAR_MAX__ ?? 1644), range[1]),
    precision: "reconstructed",
  });
  function pointInRing(ring, x, y) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function pointInGeometry(geometry, x, y) {
    const polygons = geometry?.type === "Polygon" ? [geometry.coordinates]
      : geometry?.type === "MultiPolygon" ? geometry.coordinates : [];
    for (const polygon of polygons) {
      if (!polygon.length || !pointInRing(polygon[0], x, y)) continue;
      let inHole = false;
      for (let i = 1; i < polygon.length; i += 1) if (pointInRing(polygon[i], x, y)) { inHole = true; break; }
      if (!inHole) return true;
    }
    return false;
  }
  function chgisRangeByLocation(lon, lat) {
    for (const entry of chgisBoxes) {
      const [minLon, minLat, maxLon, maxLat] = entry.box;
      if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;
      if (pointInGeometry(entry.geometry, lon, lat)) return entry.range;
    }
    return null;
  }
  function resolveChgisRange(lon, lat, name, provinceId) {
    const exact = provinceId != null ? chgisRangeByNameProvince.get(`${name}|${provinceId}`) : null;
    if (exact) return exact;
    const byName = chgisRangesByName.get(name);
    if (byName && byName.length) return mergeRange(byName);
    return chgisRangeByLocation(lon, lat);
  }
  const unitByIdForValidity = new Map(units.map((unit) => [unit.id, unit]));
  // Keep any unit that already carries a real, non-degenerate range — notably the
  // 1600 播州改土归流 replacements (遵义府/平越府, 1600–1644) — instead of letting
  // the location join pull them back to their predecessor's span (播州宣慰司 1371).
  const explicitRange = (unit) => {
    const v = unit.validity;
    if (!v || (v.from === 1600 && v.to === 1600)) return null;
    return [v.from ?? 1368, v.to ?? 1644];
  };
  const resolvedRange = new Map();
  for (const unit of units) {
    const explicit = explicitRange(unit);
    if (unit.level === "province" || unit.level === "capital-region") {
      resolvedRange.set(unit.id, explicit
        || [unit.id === "yunnan" ? 1382 : unit.id === "guizhou" ? 1413 : 1368, 1644]);
    } else if (explicit) {
      resolvedRange.set(unit.id, explicit);
    }
  }
  for (const unit of units) {
    if (unit.level !== "prefecture" || resolvedRange.has(unit.id)) continue;
    resolvedRange.set(unit.id, resolveChgisRange(unit.lon, unit.lat, unit.name, unit.provinceId) || [1368, 1644]);
  }
  for (const unit of units) {
    if (resolvedRange.has(unit.id)) continue;
    let range = null;
    let current = unitByIdForValidity.get(unit.parentId);
    for (let guard = 0; current && guard < 12; guard += 1) {
      if (resolvedRange.has(current.id)) { range = resolvedRange.get(current.id); break; }
      current = unitByIdForValidity.get(current.parentId);
    }
    resolvedRange.set(unit.id, range || [1368, 1644]);
  }
  for (const unit of units) unit.validity = clampRange(resolvedRange.get(unit.id) || [1368, 1644]);
  // Military and jimi points take the same derivation, stored on the record so
  // their point layers can filter by year exactly like the civil markers.
  for (const unit of [...MING.military, ...MING.jimi]) {
    unit.validity = clampRange(resolveChgisRange(unit.lon, unit.lat, unit.name, null) || [1368, 1644]);
  }
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  // Canonical crosswalk: one unit record owns its seat, validity and all CHGIS
  // feature fragments. Rendering and selection read this index instead of
  // re-matching by display name everywhere.
  const featureById = new Map();
  const unitByFeatureId = new Map();
  const unitByNameProvince = new Map();
  for (const unit of units) {
    unit.featureIds = [];
    unit.seat = {
      name: unit.seatName || "",
      lon: unit.lon,
      lat: unit.lat,
    };
    unit.period = unit.validity || { from: 1368, to: 1644 };
    unitByNameProvince.set(`${unit.name}|${unit.provinceId}`, unit);
  }
  for (const feature of CHGIS_MING.features || []) {
    const properties = feature.properties || {};
    const unit = unitByNameProvince.get(`${properties.name}|${properties.provinceId}`);
    if (!unit) continue;
    feature.properties.unitId = unit.id;
    unit.featureIds.push(feature.id);
    unitByFeatureId.set(feature.id, unit.id);
    featureById.set(feature.id, feature);
  }
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

  const ERAS = window.__ERAS__ || [
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
  const YEAR_MIN = Number(window.__YEAR_MIN__ ?? 1368);
  const YEAR_MAX = Number(window.__YEAR_MAX__ ?? 1644);

  const METRIC_LABELS = {
    households: "户",
    "registered-population": "口",
    "registered-land": "顷",
    "summer-tax": "石（夏税）",
    "autumn-grain": "石（秋粮）",
    silver: "两",
  };

  const state = {
    year: Number(window.__DEFAULT_YEAR__ ?? 1600),
    boundaryKey: null,
    selectedUnitId: null,
    selectedPolygonIds: [],
    selectedChgisIds: [],
    selectedSpecial: null,
    blinkTimer: null,
    blinkOn: false,
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
      special: true,
      neighbors: true,
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
  const specialLabelPool = new Map();
  const neighborLabelPool = new Map();
  const neighborCapitalLabelPool = new Map();
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

  function unitIcon(level) {
    // Seat symbols are all black (no per-province colour); a county is a small
    // hollow circle rather than a dot.
    if (level === "capital-region") return "capital-star";
    if (level === "province") return "seat-province";
    if (level === "prefecture") return "seat-prefecture";
    if (level === "department") return "seat-department";
    return "seat-county";
  }

  function isProvinceActive(provinceId, year) {
    if (provinceId === "yunnan" && year < 1382) return false;
    if (provinceId === "guizhou" && year < 1413) return false;
    return true;
  }

  function isUnitActive(unit, year) {
    if (!isProvinceActive(unit.provinceId, year)) return false;
    if (unit.validity) {
      if (unit.validity.from != null && year < unit.validity.from) return false;
      if (unit.validity.to != null && year > unit.validity.to) return false;
    }
    if (year < 1476 && (unit.id === "yunyang-prefecture" || unit.ancestry?.some((item) => item.id === "yunyang-prefecture"))) return false;
    return true;
  }

  function activeProvinceData(year) {
    return {
      type: "FeatureCollection",
      features: CHGIS_PROVINCES.features.filter((feature) => isProvinceActive(feature.properties?.unitId, year)),
    };
  }

  function unitFeatureCollection(year = state.year) {
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

  function markerFeatureCollection(year = state.year) {
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

  function otherFeatureCollection(rows, domain, year = state.year) {
    return {
      type: "FeatureCollection",
      features: rows.filter((unit) => isUnitActive(unit, year)).map((unit) => ({
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

  // Mountain glyphs, ridge dashes and names are map ink like rivers and terrain,
  // not screen furniture: their geographic footprint is fixed, so on screen they
  // must grow with the map, doubling every zoom level. Zoom 4 is the default
  // view and the anchor where sizes match the previous screen-fixed values.
  // Exponential base-2 interpolation across integer stops that each double
  // evaluates exactly to anchor · 2^(zoom − 4) between stops; unit spacing
  // between stops is required for that exactness.
  const MOUNTAIN_INK_ANCHOR_ZOOM = 4;
  const MOUNTAIN_INK_MIN_ZOOM = 3;
  const MOUNTAIN_INK_MAX_ZOOM = 11;

  function mountainInkScale(zoom) {
    const clamped = Math.min(Math.max(zoom, MOUNTAIN_INK_MIN_ZOOM), MOUNTAIN_INK_MAX_ZOOM);
    return Math.pow(2, clamped - MOUNTAIN_INK_ANCHOR_ZOOM);
  }

  function mountainInkStops(anchorSize) {
    const stops = [];
    for (let zoom = MOUNTAIN_INK_MIN_ZOOM; zoom <= MOUNTAIN_INK_MAX_ZOOM; zoom += 1) {
      stops.push(zoom, anchorSize * mountainInkScale(zoom));
    }
    return stops;
  }

  // Point at half the arc length of a mountain polyline: the name sits at the
  // range's visual centre, not at its middle vertex (which drifts toward one end
  // whenever the segments have uneven lengths, as Qinling's do).
  function mountainMidpoint(coords) {
    let total = 0;
    for (let i = 1; i < coords.length; i += 1) {
      total += Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
    }
    let remaining = total / 2;
    for (let i = 1; i < coords.length; i += 1) {
      const [x0, y0] = coords[i - 1];
      const [x1, y1] = coords[i];
      const segment = Math.hypot(x1 - x0, y1 - y0);
      if (remaining <= segment || i === coords.length - 1) {
        const t = segment === 0 ? 0 : remaining / segment;
        return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
      }
      remaining -= segment;
    }
    return coords[coords.length - 1];
  }

  function mountainIconSizeExpression() {
    const stops = [];
    for (let zoom = MOUNTAIN_INK_MIN_ZOOM; zoom <= MOUNTAIN_INK_MAX_ZOOM; zoom += 1) {
      // 1.2 keeps the glyph size at the default zoom 4 identical to the previous
      // linear expression, which evaluated to 1.2 × iconSize there.
      stops.push(zoom, ["*", ["get", "iconSize"], 1.2 * mountainInkScale(zoom)]);
    }
    return ["interpolate", ["exponential", 2], ["zoom"], ...stops];
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
      // Grand ranges (Qinling, Yinshan, Qilianshan…) render at 60% of their former
      // size; the 0.30 cap keeps every glyph box within the ~0.45° glyph spacing,
      // so neighbouring glyphs never overlap at any zoom.
      const iconSize = Math.min(0.30, Math.max(0.22, 0.6 * (0.20 + rangeLength * 0.035)));
      for (let segment = 0; segment < range.coords.length - 1; segment += 1) {
        const [x1, y1] = range.coords[segment];
        const [x2, y2] = range.coords[segment + 1];
        const length = Math.hypot(x2 - x1, y2 - y1);
        const steps = Math.max(1, Math.round(length / 0.45));
        for (let step = 0; step < steps; step += 1) {
          // Glyphs sit at the midpoints of equal divisions: a short segment keeps
          // one centred glyph instead of two overlapping ones, and spacing stays
          // ~0.45° across segment joints.
          const t = (step + 0.5) / steps;
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
    return boundarySnapshotFor(state.year).counties || { type: "FeatureCollection", features: [] };
  }

  function defaultPrefectureData() {
    return boundarySnapshotFor(state.year).prefectures || { type: "FeatureCollection", features: [] };
  }

  function defaultBoundaryNetwork() {
    return boundarySnapshotFor(state.year).boundaries || { type: "FeatureCollection", features: [] };
  }

  function normalizeUnitName(value) {
    return String(value || "")
      .replace(/(军民府|军民宣慰司|宣慰司|长官司|府|州|县|卫|所)$/g, "")
      .trim();
  }

  function isSpecialChgis(properties = {}) {
    const rawType = properties.type || "";
    const rawName = properties.name || "";
    return CHGIS_SPECIAL_TYPES.has(rawType)
      || (rawType === "补域" && /行都司|都司|卫|所|宣慰司|宣抚司|长官司|招讨司/.test(rawName));
  }

  function geometryBounds(geometry) {
    const points = [];
    const walk = (value) => {
      if (Array.isArray(value) && typeof value[0] === "number") points.push(value);
      else if (Array.isArray(value)) value.forEach(walk);
    };
    walk(geometry?.coordinates || []);
    if (!points.length) return [0, 0, 0, 0];
    return [
      Math.min(...points.map((point) => point[0])),
      Math.min(...points.map((point) => point[1])),
      Math.max(...points.map((point) => point[0])),
      Math.max(...points.map((point) => point[1])),
    ];
  }

  function specialLabelPoints() {
    const groups = new Map();
    for (const feature of CHGIS_MING.features || []) {
      const properties = feature.properties || {};
      if (!isSpecialChgis(properties) || !featureActiveInYear(properties, state.year)) continue;
      if (state.year >= 1600 && (properties.name === "播州宣慰司" || properties.name === "平越卫")) continue;
      const name = properties.name || feature.id;
      const bounds = geometryBounds(feature.geometry);
      const area = (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]);
      const labelAt = Array.isArray(properties.labelAt) ? properties.labelAt : null;
      const current = groups.get(name);
      if (!current || area > current.area) groups.set(name, { name, type: properties.type, area, labelAt });
    }
    return [...groups.values()]
      .filter((item) => Array.isArray(item.labelAt))
      .map((item) => ({
        name: item.name,
        type: item.type,
        lon: item.labelAt[0],
        lat: item.labelAt[1],
      }));
  }

  function chgisFeatureCollection(year = state.year) {
    const features = [];
    for (let index = 0; index < CHGIS_MING.features.length; index += 1) {
      const feature = CHGIS_MING.features[index];
      const properties = feature.properties || {};
      let replacement = null;
      if (year >= 1600 && properties.name === "播州宣慰司") {
        replacement = {
          name: "遵义府", type: "府", provinceId: "guizhou",
          unitId: "zunyi-replacement", prefId: "zunyi-replacement",
          beg: 1600, end: 1644,
        };
      } else if (year >= 1600 && properties.name === "平越卫") {
        replacement = {
          name: "平越府", type: "府", provinceId: "guizhou",
          unitId: "pingyue-replacement", prefId: "pingyue-replacement",
          beg: 1600, end: 1644,
        };
      }
      if (!replacement && !featureActiveInYear(properties, year)) continue;
      const merged = { ...properties, ...(replacement || {}) };
      const provinceId = merged.provinceId;
      const base = PROVINCE_COLORS[provinceId] || "#81796e";
      const bounds = geometryBounds(feature.geometry);
      features.push({
        ...feature,
        properties: {
          ...merged,
          prefId: merged.unitId || feature.id,
          isSpecial: replacement ? false : isSpecialChgis(properties),
          labelAt: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2],
          color: prefectureColor(base, Number(merged.colorSlot ?? index)),
        },
      });
    }
    return { type: "FeatureCollection", features };
  }

  function featureActiveInYear(properties, year) {
    const begin = properties?.beg ?? properties?.validFrom ?? null;
    // Same end=1600 normalisation as the point validity derivation, so a CHGIS
    // colour block and its point switch year together (镇远府 etc.).
    const end = properties?.end === 1600 && !CHGIS_ABOLISHED_1600.has(properties?.name)
      ? 1644
      : (properties?.end ?? properties?.validTo ?? null);
    return (begin == null || year >= begin) && (end == null || year <= end);
  }

  function neighborPolities(year = state.year) {
    const validity = {
      "后金": [1616, 1644],
      "蒙古诸部": [1368, 1635],
      "乌思藏": [1368, 1644],
      "朝鲜": [1392, 1910],
      "日本": [1467, 1603],
      "越南": [1428, 1789],
    };
    const seen = new Set();
    const result = [];
    // Prefer the more detailed global historical basemap polygons for the
    // surrounding states; fall back to the rougher East-Asia set only for
    // polities it lacks, notably 后金.
    for (const feature of WORLD1600.features) {
      const properties = feature.properties || {};
      if (seen.has(properties.name)) continue;
      const span = validity[properties.name];
      if (span && (year < span[0] || year > span[1])) continue;
      seen.add(properties.name);
      const bounds = geometryBounds(feature.geometry);
      const capitalOverrides = {
        "掸邦": { name: "景栋", lng: 99.3, lat: 21.3 },
      };
      result.push({
        name: properties.name,
        color: properties.color || "#6b7b8c",
        geometry: feature.geometry,
        labelAt: properties.labelAt,
        capital: capitalOverrides[properties.name] || properties.capital || null,
        area: (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]),
      });
    }
    const skipRough = new Set(["鞑靼瓦剌", "乌思藏"]);    const toLabelPoint = (labelAt) => (Array.isArray(labelAt) ? labelAt
      : (labelAt && Number.isFinite(labelAt.lng) && Number.isFinite(labelAt.lat) ? [labelAt.lng, labelAt.lat] : null));
    const pushPolity = (name, color, polygon, labelAt) => {
      const bounds = geometryBounds({ type: "Polygon", coordinates: [polygon] });
      result.push({
        name,
        color: color || "#6b7b8c",
        geometry: { type: "Polygon", coordinates: [polygon] },
        labelAt: toLabelPoint(labelAt) || [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2],
        capital: null,
        area: (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]),
      });
      seen.add(name);
    };
    for (const periodId of ["ming_early", "ming_mid", "ming_late_wl", "ming_late_ls"]) {
      const period = TERRITORIES.periods.find((item) => item.id === periodId);
      if (!period || year < period.startYear || year > period.endYear) continue;
      for (const polity of period.polities || []) {
        if (!polity.polygon || /^明|交趾/.test(polity.name) || skipRough.has(polity.name)) continue;
        // 后金 took the name 清 in 1636; show whichever fits the current year.
        const name = polity.name === "后金 / 清" ? (year >= 1636 ? "清" : "后金") : polity.name;
        if (name === "后金" && year < 1616) continue;
        if (seen.has(name)) continue;
        pushPolity(name, polity.color, polity.polygon, polity.labelAt);
      }
    }
    // 清 carries on after the last period that names it: reuse the 后金/清 polygon.
    if (year >= 1637 && !seen.has("清")) {
      const lateJin = TERRITORIES.periods.find((item) => item.id === "ming_late_ls");
      const qing = lateJin?.polities.find((polity) => polity.name === "后金 / 清" && polity.polygon);
      if (qing) pushPolity("清", qing.color, qing.polygon, qing.labelAt);
    }
    return result;
  }

  function neighborFeatureCollection(year = state.year) {
    return {
      type: "FeatureCollection",
      features: neighborPolities(year).map((polity, index) => ({
        type: "Feature",
        id: `neighbor-${index}`,
        geometry: polity.geometry,
        properties: { name: polity.name, color: polity.color, labelAt: polity.labelAt },
      })),
    };
  }

  function neighborCapitalCollection(year = state.year) {
    return {
      type: "FeatureCollection",
      features: neighborPolities(year)
        .filter((polity) => polity.capital?.lat != null && polity.capital?.lng != null)
        .map((polity, index) => ({
          type: "Feature",
          id: `neighbor-capital-${index}`,
          geometry: { type: "Point", coordinates: [polity.capital.lng, polity.capital.lat] },
          properties: { name: polity.capital.name || polity.name, polity: polity.name, labelAt: [polity.capital.lng, polity.capital.lat] },
        })),
    };
  }

  function boundaryLabel(key) {
    if (window.__DYNASTY__ === "qing") return "1820 年断面";
    return {
      "1368": "洪武初年（云南、贵州未建省）",
      "1382": "洪武十五年云南建省后",
      "1413": "永乐十一年贵州建省后",
      "1476": "成化十二年郧阳设府后",
    }[String(key)] || "1600 年断面";
  }

  // County/prefecture polygon faces obey the same year model as the points: a
  // face shows only while its province and parent prefecture are active, so the
  // 4-snapshot fallback view no longer shows blocks that lack a point (or lacks
  // points that should have a block).
  function activeBoundaryFeatures(collection, year, prefKey) {
    if (!collection?.features) return collection;
    return {
      ...collection,
      features: collection.features.filter((feature) => {
        const properties = feature.properties || {};
        if (properties.provinceId && !isProvinceActive(properties.provinceId, year)) return false;
        const prefId = prefKey ? properties[prefKey] : null;
        if (prefId) {
          const unit = unitById.get(prefId);
          if (unit) return isUnitActive(unit, year);
        }
        return true;
      }),
    };
  }

  function updateBoundarySnapshot(year) {
    const snapshot = boundarySnapshotFor(year);
    state.boundaryKey = snapshot.key;
    if (map && map.getSource("counties")) map.getSource("counties").setData(activeBoundaryFeatures(snapshot.counties, year, "prefId"));
    if (map && map.getSource("prefectures")) map.getSource("prefectures").setData(activeBoundaryFeatures(snapshot.prefectures, year, "id"));
    if (map && map.getSource("countyBoundaries")) map.getSource("countyBoundaries").setData(activeBoundaryFeatures(snapshot.boundaries, year, null));
    if (map && map.getSource("provinces")) map.getSource("provinces").setData(activeProvinceData(year));
    if (map && map.getSource("territory")) map.getSource("territory").setData(activeProvinceData(year));
    if (map && map.getSource("chgisMing")) map.getSource("chgisMing").setData(chgisFeatureCollection(year));
    if (map && map.getSource("neighbors")) map.getSource("neighbors").setData(neighborFeatureCollection(year));
    if (map && map.getSource("neighborCapitals")) map.getSource("neighborCapitals").setData(neighborCapitalCollection(year));
    if (map && map.getSource("markers")) map.getSource("markers").setData(markerFeatureCollection(year));
    if (map && map.getSource("military")) map.getSource("military").setData(otherFeatureCollection(MING.military, "military", year));
    if (map && map.getSource("jimi")) map.getSource("jimi").setData(otherFeatureCollection(MING.jimi, "jimi", year));
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
    const prefColorEntries = Object.entries(PREF_COLORS).length
      ? Object.entries(PREF_COLORS).flatMap(([id, color]) => [id, color])
      : ["__none__", "#81796e"];
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
        national: { type: "geojson", data: CHGIS_NATION },
        territory: { type: "geojson", data: activeProvinceData(state.year) },
        neighbors: { type: "geojson", data: neighborFeatureCollection() },
        neighborCapitals: { type: "geojson", data: neighborCapitalCollection() },
        provinces: { type: "geojson", data: activeProvinceData(state.year) },
        counties: { type: "geojson", data: defaultBoundaryData(), promoteId: "id" },
        prefectures: { type: "geojson", data: defaultPrefectureData(), promoteId: "id" },
        countyBoundaries: { type: "geojson", data: defaultBoundaryNetwork() },
        chgisMing: { type: "geojson", data: chgisFeatureCollection(), promoteId: "id" },
        chgisBoundaries: { type: "geojson", data: CHGIS_BOUNDARIES },
        mountainRidges: { type: "geojson", data: mountainLineFeatures() },
        mountainPeaks: { type: "geojson", data: mountainPointFeatures() },
        markers: { type: "geojson", data: markerFeatureCollection(state.year), promoteId: "id" },
        military: { type: "geojson", data: otherFeatureCollection(MING.military, "military") },
        jimi: { type: "geojson", data: otherFeatureCollection(MING.jimi, "jimi") },
        events: { type: "geojson", data: eventsFeatureCollection(state.year), promoteId: "id" },
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
        { id: "national-fill", type: "fill", source: "territory", paint: { "fill-color": "#7a3027", "fill-opacity": 0.14 } },
        { id: "national-line", type: "line", source: "territory", paint: { "line-color": "#7a3027", "line-width": 1.3, "line-opacity": 0.7 } },
        { id: "neighbor-fill", type: "fill", source: "neighbors", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.20 } },
        { id: "neighbor-glow-outer", type: "line", source: "neighbors", paint: { "line-color": ["get", "color"], "line-width": 24, "line-opacity": 0.08, "line-blur": 7 } },
        { id: "neighbor-glow-mid", type: "line", source: "neighbors", paint: { "line-color": ["get", "color"], "line-width": 15, "line-opacity": 0.14, "line-blur": 4.5 } },
        { id: "neighbor-glow-inner", type: "line", source: "neighbors", paint: { "line-color": ["get", "color"], "line-width": 8, "line-opacity": 0.24, "line-blur": 2.5 } },
        { id: "neighbor-capital", type: "circle", source: "neighborCapitals", paint: { "circle-radius": 3.2, "circle-color": "#4b3a2a", "circle-stroke-color": "#f6f1e7", "circle-stroke-width": 1 } },
        { id: "ming-base", type: "fill", source: "national", paint: { "fill-color": "#e8e1d3", "fill-opacity": 0.94 } },
        { id: "province-fill", type: "fill", source: "provinces", paint: { "fill-color": provinceColor, "fill-opacity": 0.42 } },
        { id: "province-line", type: "line", source: "provinces", paint: { "line-color": provinceBorderColor, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.9, 8, 1.4], "line-opacity": 0.55 } },
        { id: "county-fill", type: "fill", source: "counties", paint: { "fill-color": ["case", ["boolean", ["feature-state", "selected"], false], "rgba(122,48,39,.72)", ["match", ["get", "prefId"], ...prefColorEntries, "#81796e"]], "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 1, 0.48] } },
        { id: "mountain-ridges", type: "line", source: "mountainRidges", paint: { "line-color": "rgba(80, 92, 78, .24)", "line-width": ["interpolate", ["exponential", 2], ["zoom"], ...mountainInkStops(0.55)], "line-dasharray": [1, 3] } },
        { id: "mountain-peaks", type: "symbol", source: "mountainPeaks", layout: { "icon-image": "mountain-peak", "icon-size": mountainIconSizeExpression(), "icon-allow-overlap": true, "icon-ignore-placement": true }, paint: { "icon-opacity": 0.66 } },
        { id: "county-boundaries", type: "line", source: "countyBoundaries", paint: { "line-color": "rgba(56, 52, 44, .36)", "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.28, 8, 0.55], "line-opacity": 0.68 } },
        { id: "chgis-fill", type: "fill", source: "chgisMing", filter: ["==", ["get", "isSpecial"], false], paint: { "fill-color": ["case", ["boolean", ["feature-state", "selected"], false], "#b85c43", ["get", "color"]], "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], ["case", ["boolean", ["feature-state", "blink"], false], 0.96, 0.52], 0.58] } },
        { id: "chgis-special-fill", type: "fill", source: "chgisMing", filter: ["==", ["get", "isSpecial"], true], paint: { "fill-color": "#5f5040", "fill-opacity": 0.22 } },
        { id: "chgis-line", type: "line", source: "chgisBoundaries", paint: { "line-color": "rgba(70, 62, 50, .26)", "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.25, 8, 0.48], "line-opacity": 0.58 } },
        { id: "prefecture-line", type: "line", source: "prefectures", paint: { "line-color": provinceColorByProvinceId, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.55, 8, 1.25], "line-opacity": 0.55 } },
        { id: "province-line-top", type: "line", source: "provinces", paint: { "line-color": provinceBorderColor, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.1, 8, 1.5], "line-opacity": 0.72 } },
        { id: "military-points", type: "symbol", source: "military", minzoom: 4.4, layout: { "icon-image": ["get", "icon"], "icon-size": 0.22, "icon-allow-overlap": true, "icon-ignore-placement": true } },
        { id: "jimi-points", type: "symbol", source: "jimi", minzoom: 4.2, layout: { "icon-image": ["get", "icon"], "icon-size": 0.24, "icon-allow-overlap": true, "icon-ignore-placement": true } },
        { id: "admin-province", type: "symbol", source: "markers", filter: ["in", ["get", "level"], ["literal", ["capital-region", "province"]]], layout: { "icon-image": ["get", "icon"], "icon-size": 0.50, "icon-allow-overlap": true, "icon-ignore-placement": true }, paint: { "icon-opacity": ["case", ["boolean", ["feature-state", "hidden"], false], 0, 1] } },
        { id: "admin-prefecture", type: "symbol", source: "markers", filter: ["==", ["get", "level"], "prefecture"], layout: { "icon-image": ["get", "icon"], "icon-size": 0.38, "icon-allow-overlap": true, "icon-ignore-placement": true }, paint: { "icon-opacity": ["case", ["boolean", ["feature-state", "hidden"], false], 0, 1] } },
        { id: "admin-department", type: "symbol", source: "markers", filter: ["==", ["get", "level"], "department"], layout: { "icon-image": ["get", "icon"], "icon-size": 0.30, "icon-allow-overlap": true, "icon-ignore-placement": true }, paint: { "icon-opacity": ["case", ["boolean", ["feature-state", "hidden"], false], 0, 1] } },
        { id: "admin-county", type: "symbol", source: "markers", filter: ["==", ["get", "level"], "county"], layout: { "icon-image": ["get", "icon"], "icon-size": 0.30, "icon-allow-overlap": true, "icon-ignore-placement": true }, paint: { "icon-opacity": ["case", ["boolean", ["feature-state", "hidden"], false], 0, 1] } },
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
    if (shape === "circle") {
      ctx.beginPath();
      ctx.arc(center, center, 13, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3.2;
      ctx.stroke();
      return ctx.getImageData(0, 0, size, size);
    }
    if (shape === "county-ring") {
      // Small hollow circle for county seats — a circle, not a dot. Radius 18 vs
      // the 州 outer ring's 20, so it reads only a little smaller than 州.
      ctx.beginPath();
      ctx.arc(center, center, 18, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3.2;
      ctx.stroke();
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
    const SEAT_BLACK = "#1a1a1a";
    for (const [id, shape] of Object.entries({ "seat-province": "province", "seat-prefecture": "prefecture", "seat-department": "secondary", "seat-county": "county-ring" })) {
      if (!map.hasImage(id)) map.addImage(id, markerImage(shape, SEAT_BLACK), { pixelRatio: 2 });
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
      const seatMatch = id.match(/^seat-(province|prefecture|department|county)$/);
      if (seatMatch) {
        const shape = seatMatch[1] === "department" ? "secondary" : seatMatch[1] === "county" ? "county-ring" : seatMatch[1];
        map.addImage(id, markerImage(shape, "#1a1a1a"), { pixelRatio: 2 });
        return;
      }
      const match = id.match(/^prov-(.+)-(province|prefecture|secondary|dot|circle|diamond|square|triangle)$/);
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
        // A seat symbol whose name is currently hidden must not be clickable.
        if (layer.startsWith("admin-") && feature.id != null
          && map.getFeatureState({ source: "markers", id: feature.id }).hidden) return;
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
          const properties = feature.properties || {};
          // Topology-repair slivers without a resolved owner fall through to the
          // generic "待考辖区" highlighter; repaired slivers that were assigned to
          // a real adjacent prefecture are selectable normally.
          if (properties.type === "补域" && !properties.unitId) {
            selectFallbackChgis(properties, feature.id);
            return;
          }
          let targetId = properties.unitId;
          if (targetId) {
            const target = unitById.get(String(targetId));
            if (!target || (properties.provinceId && target.provinceId !== properties.provinceId)) {
              targetId = null;
            }
          }
          if (!targetId || !unitById.has(String(targetId))) {
            const wantedName = normalizeUnitName(properties.name);
            let candidates = [...unitById.values()].filter((unit) =>
              (unit.level === "prefecture" || unit.level === "department")
              && normalizeUnitName(unit.name) === wantedName
            );
            // Same-name units exist (e.g. 山西永宁州 / 贵州永宁州). Prefer the
            // candidate in the same province, then the nearest seat coordinate.
            const sameProvince = candidates.filter((unit) => unit.provinceId === properties.provinceId);
            if (sameProvince.length) candidates = sameProvince;
            else if (properties.provinceId) candidates = [];
            if (candidates.length > 1 && Number.isFinite(properties.labelAt?.[0])) {
              const [cx, cy] = properties.labelAt;
              candidates.sort((a, b) => Math.hypot(a.lon - cx, a.lat - cy) - Math.hypot(b.lon - cx, b.lat - cy));
            }
            targetId = candidates[0]?.id;
          }
          if (!targetId || !unitById.has(String(targetId))) {
            selectFallbackChgis(properties, feature.id);
            return;
          }
          selectOrToggleUnit(String(targetId));
          return;
        }
        selectOrToggleUnit(String(feature.properties.targetUnitId || feature.properties.id));
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

  // Seats that share one coordinate — a prefecture with its attached counties, two
  // counties governing the same city — carry one name per unit, and the per-level
  // offsets alone put same-level names on the very same pixel. Names sharing a point
  // are therefore collected into a single column: the first keeps its level's offset
  // and every further name continues outward until it clears the names already there.
  const LABEL_OFFSETS = {
    "capital-region": 0,
    province: 0,
    prefecture: -16,
    department: -6,
    county: 10,
  };

  function stackedLabelOffset(pointKey, level, height, stacks) {
    const base = LABEL_OFFSETS[level] ?? 0;
    // A department keeps its slot just above the point until that slot is taken; it
    // then yields downwards so the column still reads highest rank first. Every other
    // level continues on its own side of the point.
    const direction = level === "department" || base >= 0 ? 1 : -1;
    const placed = stacks.get(pointKey) || [];
    const overlaps = (offset) => placed.some((other) =>
      offset - height / 2 < other.bottom + 2 && offset + height / 2 + 2 > other.top);
    let offset = base;
    for (let guard = 0; guard < 40 && overlaps(offset); guard += 1) offset += direction * 4;
    placed.push({ top: offset - height / 2, bottom: offset + height / 2 });
    stacks.set(pointKey, placed);
    return offset;
  }

  // Seat symbols must appear and disappear together with their place names.
  // MapLibre cannot filter a symbol by DOM state, so each marker feature is
  // flagged 'hidden' while its name is not drawn and cleared when it is drawn.
  let markerHiddenState = new Set();
  let markerIdCache = { year: null, ids: null };
  function markerIdsForYear() {
    if (markerIdCache.year !== state.year) {
      markerIdCache = { year: state.year, ids: new Set(markerFeatureCollection(state.year).features.map((feature) => feature.id)) };
      markerHiddenState = new Set();
    }
    return markerIdCache.ids;
  }
  function syncMarkerVisibility(visibleIds) {
    if (!map || !map.getSource("markers")) return;
    const next = new Set();
    for (const id of markerIdsForYear()) if (!visibleIds.has(id)) next.add(id);
    for (const id of next) if (!markerHiddenState.has(id)) map.setFeatureState({ source: "markers", id }, { hidden: true });
    for (const id of markerHiddenState) if (!next.has(id)) map.setFeatureState({ source: "markers", id }, { hidden: false });
    markerHiddenState = next;
  }

  function renderLabels() {
    if (!map) {
      clearLabels();
      return;
    }
    const zoom = map.getZoom();
    const width = map.getCanvas().clientWidth;
    const height = map.getCanvas().clientHeight;
    const occupied = [];
    if (!state.layers.labels) {
      // Mountain names hang off the mountain layer, not this one: place names go,
      // and the mountain pass below still runs.
      for (const element of labelPool.values()) element.style.display = "none";
      for (const element of specialLabelPool.values()) element.style.display = "none";
      renderMountainLabels(width, height, zoom);
      syncMarkerVisibility(new Set());
      return;
    }
    const isQing = window.__DYNASTY__ === "qing";
    const show = {
      "capital-region": true,
      province: true,
      prefecture: zoom >= (isQing ? 3.4 : 4.2),
      department: zoom >= (isQing ? 4.2 : 5.2),
      county: zoom >= (isQing ? 5.2 : 6.2),
    };
    const used = new Set();
    const stacks = new Map();
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
      const pointKey = `${Math.round(point.x)},${Math.round(point.y)}`;
      element.className = `map-label map-label--${kind}${state.selectedUnitId === unit.id ? " is-selected" : ""}`;
      element.textContent = unit.name;
      element.style.display = "";
      const labelWidth = Math.max(24, element.offsetWidth + 8);
      const labelHeight = Math.max(12, element.offsetHeight + 4);
      const labelOffset = stackedLabelOffset(pointKey, unit.level, labelHeight, stacks);
      element.style.transform = `translate3d(${point.x}px, ${point.y + labelOffset}px, 0) translate(-50%, -50%)`;
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
    // Special (military/jimi) and neighbour names still avoid placed place names;
    // mountain names are unconditional bottom-layer ink and take no part in
    // collision tracking.
    renderSpecialLabels(occupied, width, height, zoom);
    renderMountainLabels(width, height, zoom);
    renderNeighborLabels(occupied, width, height, zoom);
    syncMarkerVisibility(used);
  }

  function renderMountainLabels(width, height, zoom) {
    const used = new Set();
    if (!state.layers.mountains) {
      for (const element of mountainLabelPool.values()) element.style.display = "none";
      return;
    }
    const midpoints = MOUNTAINS.map((range) => mountainMidpoint(range.coords));
    // Nearest mid-point distance (degrees; longitude scaled by latitude) bounds
    // how wide a name may be. A name capped to 85% of that distance keeps its
    // box clear of every neighbour's, at any zoom — this is what stops the
    // dense Five Ridges cluster from piling names on top of one another.
    const nearestDeg = midpoints.map((from, index) => {
      let nearest = Infinity;
      midpoints.forEach((to, other) => {
        if (other === index) return;
        const dx = (to[0] - from[0]) * Math.cos(from[1] * Math.PI / 180);
        const dy = to[1] - from[1];
        nearest = Math.min(nearest, Math.hypot(dx, dy));
      });
      return nearest;
    });
    for (const [index, range] of MOUNTAINS.entries()) {
      const coords = range.coords;
      const labelPoint = midpoints[index];
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
      for (let i = 1; i < coords.length; i += 1) {
        length += Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
      }
      // Names are map ink: size scales with the map (inkScale), but each name is
      // also capped to 85% of the distance to the nearest range's name so dense
      // clusters never draw overlapping labels. In open country the ink size
      // wins, so names stay fully proportional to the map ("printed on it").
      const inkScale = mountainInkScale(zoom);
      const charCount = Math.max(1, Array.from(range.name).length);
      const spacingRatio = 0.06;
      const charWidths = charCount + spacingRatio * (charCount - 1);
      const pxPerDegree = Math.max(1, Math.abs(map.project([labelPoint[0] + 1, labelPoint[1]]).x - point.x));
      const inkFont = Math.min(16, Math.max(9, 9 + length * 0.68)) * inkScale;
      const fitFont = (0.8 * nearestDeg[index] * pxPerDegree) / charWidths;
      const fontSize = Math.max(6, Math.min(inkFont, fitFont));
      const letterSpacing = fontSize * spacingRatio;
      element.style.fontSize = `${fontSize.toFixed(1)}px`;
      element.style.letterSpacing = `${letterSpacing.toFixed(1)}px`;
      const [x1, y1] = coords[0];
      const [x2, y2] = coords[coords.length - 1];
      let angle = Math.atan2(-(y2 - y1), x2 - x1) * 180 / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      const labelOffset = fontSize * 0.9;
      element.style.transform = `translate3d(${point.x}px, ${point.y + labelOffset}px, 0) translate(-50%, -50%) rotate(${angle.toFixed(1)}deg)`;
      // Mountain names never yield and never hide: they are bottom-layer ink
      // (z-index 0 in styles.css), so every other label draws on top of them
      // instead of displacing them. Only the manual 山脉 toggle hides them.
      element.style.display = "";
      used.add(range.name);
    }
    for (const [name, element] of mountainLabelPool.entries()) {
      if (!used.has(name)) element.style.display = "none";
    }
  }

  function renderSpecialLabels(occupied, width, height, zoom) {
    const used = new Set();
    if (!state.layers.special) {
      for (const element of specialLabelPool.values()) element.style.display = "none";
      return;
    }
    const placedBoxes = [];
    const clearance = 8;
    const near = (box, other) =>
      box.left < other.right + clearance && box.right > other.left - clearance
      && box.top < other.bottom + clearance && box.bottom > other.top - clearance;
    for (const item of specialLabelPoints()) {
      // Match the prefecture-label lifecycle: hidden at the same low zoom levels.
      if (zoom < 4.2 || !state.labelLevels.prefecture) continue;
      const point = map.project([item.lon, item.lat]);
      if (point.x < 12 || point.y < 12 || point.x > width - 12 || point.y > height - 12) continue;
      let element = specialLabelPool.get(item.name);
      if (!element) {
        element = document.createElement("div");
        element.dataset.special = item.name;
        $("#map-labels").appendChild(element);
        specialLabelPool.set(item.name, element);
      }
      element.className = "map-label map-label--special";
      element.textContent = item.name;
      element.style.display = "";
      const labelWidth = Math.max(24, element.offsetWidth + 8);
      const labelHeight = Math.max(12, element.offsetHeight + 4);
      // A military/羁縻 name sits just above its seat, but when a place name is
      // already there (灵州 above 宁夏卫) it steps downward until it has clear
      // air, so the two labels never crowd into one another.
      const offsets = [-8];
      for (let step = 1; step <= 5; step += 1) offsets.push(-8 + step * (labelHeight + 3));
      let chosen = null;
      for (const dy of offsets) {
        const centerY = point.y + dy;
        const box = {
          left: point.x - labelWidth / 2,
          right: point.x + labelWidth / 2,
          top: centerY - labelHeight / 2,
          bottom: centerY + labelHeight / 2,
        };
        if (occupied.some((other) => near(box, other)) || placedBoxes.some((other) => near(box, other))) continue;
        chosen = { centerY, box };
        break;
      }
      if (!chosen) {
        element.style.display = "none";
        continue;
      }
      element.style.transform = `translate3d(${point.x}px, ${chosen.centerY}px, 0) translate(-50%, -50%)`;
      occupied.push(chosen.box);
      placedBoxes.push(chosen.box);
      used.add(item.name);
    }
    for (const [name, element] of specialLabelPool.entries()) {
      if (!used.has(name)) element.style.display = "none";
    }
  }

  function renderNeighborLabels(occupied, width, height, zoom) {
    const used = new Set();
    if (!state.layers.neighbors) {
      for (const element of neighborLabelPool.values()) element.style.display = "none";
      for (const element of neighborCapitalLabelPool.values()) element.style.display = "none";
      return;
    }
    for (const polity of neighborPolities()) {
      const point = map.project(polity.labelAt);
      if (point.x < 10 || point.y < 10 || point.x > width - 10 || point.y > height - 10) continue;
      let element = neighborLabelPool.get(polity.name);
      if (!element) {
        element = document.createElement("div");
        element.dataset.neighbor = polity.name;
        $("#map-labels").appendChild(element);
        neighborLabelPool.set(polity.name, element);
      }
      element.className = "map-label map-label--neighbor";
      element.textContent = polity.name;
      element.style.color = polity.color;
      const area = Number.isFinite(polity.area) ? polity.area : 1;
      const fontSize = Math.max(13, Math.min(28, 13 + Math.sqrt(area) * 1.15));
      element.style.fontSize = `${fontSize.toFixed(1)}px`;
      element.style.letterSpacing = `${Math.max(2, fontSize * 0.12).toFixed(1)}px`;
      element.style.display = "";
      element.style.transform = `translate3d(${point.x}px, ${point.y}px, 0) translate(-50%, -50%)`;
      used.add(polity.name);
      const halfWidth = Math.max(30, polity.name.length * fontSize * 0.62);
      occupied.push({ left: point.x - halfWidth, right: point.x + halfWidth, top: point.y - fontSize / 2, bottom: point.y + fontSize / 2 });
    }
    for (const [name, element] of neighborLabelPool.entries()) if (!used.has(name)) element.style.display = "none";

    const capitalUsed = new Set();
    for (const polity of neighborPolities()) {
      if (!polity.capital?.lat || !polity.capital?.lng || zoom < 3.8) continue;
      const point = map.project([polity.capital.lng, polity.capital.lat]);
      if (point.x < 10 || point.y < 10 || point.x > width - 10 || point.y > height - 10) continue;
      const key = `${polity.name}-${polity.capital.name}`;
      let element = neighborCapitalLabelPool.get(key);
      if (!element) {
        element = document.createElement("div");
        element.dataset.neighborCapital = key;
        $("#map-labels").appendChild(element);
        neighborCapitalLabelPool.set(key, element);
      }
      element.className = "map-label map-label--neighbor-capital";
      element.textContent = polity.capital.name || polity.name;
      element.style.display = "";
      element.style.transform = `translate3d(${point.x}px, ${point.y - 9}px, 0) translate(-50%, -50%)`;
      capitalUsed.add(key);
    }
    for (const [key, element] of neighborCapitalLabelPool.entries()) if (!capitalUsed.has(key)) element.style.display = "none";
  }

  function clearLabels() {
    for (const element of labelPool.values()) element.style.display = "none";
    for (const element of mountainLabelPool.values()) element.style.display = "none";
    for (const element of specialLabelPool.values()) element.style.display = "none";
    for (const element of neighborLabelPool.values()) element.style.display = "none";
    for (const element of neighborCapitalLabelPool.values()) element.style.display = "none";
  }

  function setLayerVisibility(layerIds, visible) {
    if (!map) return;
    for (const id of layerIds) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    }
  }

  function applyLayerState() {
    setLayerVisibility(["national-fill", "national-line"], state.layers.national);
    setLayerVisibility(["neighbor-fill", "neighbor-glow-outer", "neighbor-glow-mid", "neighbor-glow-inner", "neighbor-capital"], state.layers.neighbors);
    setLayerVisibility(["modern-china-line"], state.layers.modern);
    setLayerVisibility(["province-fill", "province-line", "province-line-top"], state.layers.provinces);
    setLayerVisibility(["admin-province", "admin-prefecture", "admin-department", "admin-county"], state.layers.admin);
    setLayerVisibility(["county-fill", "county-boundaries", "prefecture-line"], state.layers.admin && !state.layers.chgis);
    setLayerVisibility(["chgis-fill", "chgis-line"], state.layers.admin && state.layers.chgis);
    setLayerVisibility(["chgis-special-fill"], state.layers.admin && state.layers.chgis && state.layers.special);
    setLayerVisibility(["military-points"], state.layers.military);
    setLayerVisibility(["jimi-points"], state.layers.jimi);
    setLayerVisibility(["event-halo", "event-points"], state.layers.events);
    setLayerVisibility(["mountain-ridges", "mountain-peaks"], state.layers.mountains);
    if (typeof syncDisplayControls === "function") syncDisplayControls();
    // Mountain names follow the mountain layer, so keep the label pass alive while
    // either of the two toggles is on.
    if (state.layers.labels || state.layers.mountains) scheduleLabels(); else clearLabels();
  }

  function stopChgisBlink() {
    if (state.blinkTimer) {
      clearInterval(state.blinkTimer);
      state.blinkTimer = null;
    }
    for (const featureId of state.selectedChgisIds) {
      map.removeFeatureState({ source: "chgisMing", id: featureId });
    }
    state.selectedChgisIds = [];
  }

  function startChgisBlink(featureIds) {
    state.selectedChgisIds = featureIds;
    state.blinkOn = true;
    for (const featureId of featureIds) {
      map.setFeatureState({ source: "chgisMing", id: featureId }, { selected: true, blink: true });
    }
    state.blinkTimer = setInterval(() => {
      state.blinkOn = !state.blinkOn;
      for (const featureId of featureIds) {
        map.setFeatureState({ source: "chgisMing", id: featureId }, { selected: true, blink: state.blinkOn });
      }
    }, 520);
  }

  function clearPolygonSelection() {
    for (const featureId of state.selectedPolygonIds) {
      map.removeFeatureState({ source: "counties", id: featureId });
    }
    state.selectedPolygonIds = [];
    stopChgisBlink();
  }

  function selectPolygonsForUnit(unitId, unit) {
    if (!map) return;
    clearPolygonSelection();
    // The detailed county source is used when CHGIS is off; keep it as a fallback.
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

    // CHGIS is the visible prefecture layer. Names in the Ming point data often
    // carry suffixes such as 军民府/宣慰司, while the CHGIS face may use only the
    // stem; normalize both before matching. Province must also match, otherwise
    // same-name units such as 山西永宁州 and 贵州永宁州 would cross-highlight.
    const chgisSelected = [];
    const wantedName = normalizeUnitName(unit.name);
    const replacementSourceNames = {
      "zunyi-replacement": "播州宣慰司",
      "pingyue-replacement": "平越卫",
    };
    if (unit.featureIds?.length) {
      // Preferred path: the canonical crosswalk already owns the feature IDs.
      for (const featureId of unit.featureIds) {
        const feature = featureById.get(featureId);
        if (feature && featureActiveInYear(feature.properties, state.year)) chgisSelected.push(featureId);
      }
    } else {
      for (const feature of CHGIS_MING.features || []) {
        const properties = feature.properties || {};
        if (!featureActiveInYear(properties, state.year)) continue;
        const sameProvince = !properties.provinceId || properties.provinceId === unit.provinceId;
        const replacementMatch = state.year >= 1600 && replacementSourceNames[unitId] === properties.name;
        const matchesUnit = replacementMatch
          || (properties.unitId === unitId && sameProvince)
          || (unit.level === "county" && properties.unitId === unit.parentId && sameProvince)
          || (unit.level !== "county" && sameProvince && normalizeUnitName(properties.name) === wantedName)
          || ((unit.level === "province" || unit.level === "capital-region") && properties.provinceId === unitId);
        if (matchesUnit) chgisSelected.push(feature.id);
      }
    }
    // Last-resort spatial fallback: if a 军民府/土司 name has no CHGIS name match,
    // query the visible CHGIS face under the unit's seat point.
    if (!chgisSelected.length && Number.isFinite(unit.lon) && Number.isFinite(unit.lat)) {
      const point = map.project([unit.lon, unit.lat]);
      for (const feature of map.queryRenderedFeatures(point, { layers: ["chgis-fill"] })) {
        if (feature.id != null) chgisSelected.push(feature.id);
      }
    }
    if (chgisSelected.length) startChgisBlink(chgisSelected);
  }

  function selectSpecialUnit(properties, featureId) {
    clearPolygonSelection();
    if (state.selectedUnitId) {
      map.removeFeatureState({ source: "markers", id: state.selectedUnitId });
    }
    state.selectedUnitId = null;
    state.selectedSpecial = {
      name: properties.name || "特殊辖区",
      type: properties.type || "军事/羁縻辖区",
      provinceId: properties.provinceId || "",
      beg: properties.beg,
      end: properties.end,
      featureId,
    };
    const ids = (CHGIS_MING.features || [])
      .filter((feature) => isSpecialChgis(feature.properties)
        && feature.properties?.name === properties.name
        && feature.properties?.provinceId === properties.provinceId)
      .map((feature) => feature.id);
    if (ids.length) startChgisBlink(ids);
    renderChief();
    renderDetail();
    renderOfficialdom();
    renderFigures();
    scheduleLabels();
    setRightTab("detail");
    $("#selection-count").textContent = `${state.selectedSpecial.name} · 军事/羁縻`;
    toast(`${state.selectedSpecial.name} · ${state.selectedSpecial.type}（军事/羁縻辖区）`);
  }

  function selectFallbackChgis(properties, featureId) {
    clearPolygonSelection();
    if (state.selectedUnitId) {
      map.removeFeatureState({ source: "markers", id: state.selectedUnitId });
    }
    state.selectedUnitId = null;
    const isTopologySliver = properties.type === "补域";
    state.selectedSpecial = {
      // A topology-repair sliver inherits a nearby source name (e.g. 登州府),
      // which is misleading because it is not that prefecture. Show it as a
      // neutral unowned patch instead.
      name: isTopologySliver ? "待考辖区" : (properties.name || "未命名色块"),
      type: "待考辖区",
      sourceType: properties.type || "",
      provinceId: properties.provinceId || "",
      beg: properties.beg,
      end: properties.end,
      featureId,
      fallback: true,
    };
    const ids = (CHGIS_MING.features || [])
      .filter((feature) => feature.id === featureId
        || (feature.properties?.name === properties.name
          && feature.properties?.provinceId === properties.provinceId))
      .map((feature) => feature.id);
    if (ids.length) startChgisBlink(ids);
    renderChief();
    renderDetail();
    renderOfficialdom();
    renderFigures();
    scheduleLabels();
    setRightTab("detail");
    $("#selection-count").textContent = `${state.selectedSpecial.name} · 待考辖区`;
    toast(`${state.selectedSpecial.name} · 该色块暂无对应民政府州`);
  }

  function selectUnit(unitId, options = {}) {
    const unit = unitById.get(unitId);
    if (!unit) return;
    state.selectedSpecial = null;
    if (state.selectedUnitId) {
      map.removeFeatureState({ source: "markers", id: state.selectedUnitId });
    }
    state.selectedUnitId = unitId;
    map.setFeatureState({ source: "markers", id: unitId }, { selected: true });
    selectPolygonsForUnit(unitId, unit);
    renderChief();
    renderDetail();
    renderOfficialdom();
    renderFigures();
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

  // Clear any unit/special selection and reset the dependent panels.
  function clearSelection() {
    if (state.selectedUnitId) map.removeFeatureState({ source: "markers", id: state.selectedUnitId });
    state.selectedUnitId = null;
    state.selectedSpecial = null;
    clearPolygonSelection();
    renderChief();
    renderDetail();
    renderOfficialdom();
    renderFigures();
    scheduleLabels();
    $("#selection-count").textContent = "未选中";
  }

  // Re-clicking the already-selected place deselects it instead of re-selecting.
  function selectOrToggleUnit(unitId, options = {}) {
    if (state.selectedUnitId === unitId) {
      clearSelection();
      return;
    }
    selectUnit(unitId, options);
  }

  function renderChief() {
    const container = $("#local-chief");
    if (state.selectedSpecial) {
      const special = state.selectedSpecial;
      const provinceName = unitById.get(special.provinceId)?.name || special.provinceId || "—";
      container.innerHTML = `
        <h3>${esc(special.name)}</h3>
        <p>${esc(special.type)} · ${esc(provinceName)}</p>
        <p class="tree-note">${special.fallback
          ? "该色块暂无对应民政府州，暂按待考辖区处理。"
          : "军事/羁縻辖区，不设民政府州县主官；其首领、卫所武职另属军政系统。"}</p>`;
      return;
    }
    if (!state.selectedUnitId) {
      container.innerHTML = `
        <h3>本区主官</h3>
        <p>点击地图上的省、府、州、县，查看与它配套的地方主官、品级与佐贰官。</p>
        <p class="tree-note" style="margin:8px 0 0">例：县 → 知县（正七品）、县丞（正八品）、主簿（正九品）、典史（未入流）。</p>`;
      return;
    }
    const unit = unitById.get(state.selectedUnitId);
    const posts = OFF.levelPosts[unit.level] || [];
    // The full chain reads clearer than "level · province · seat": a county under a
    // department shows all four steps, e.g. 河南 · 彰德府 · 磁州 · 武安县.
    const chain = unit.ancestry?.length ? unit.ancestry : [{ name: unit.name }];
    container.innerHTML = `
      <h3>${esc(unit.name)}</h3>
      <p>${chain.map((item) => esc(item.name)).join(" · ")}</p>
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

    const selectedUnit = state.selectedUnitId ? unitById.get(state.selectedUnitId) : null;
    const localOnly = Boolean(selectedUnit || state.selectedSpecial);
    const localBlock = `
      <details open>
        <summary>地方官制 <span class="panel-count">都 · 布 · 按</span></summary>
        <p class="officialdom-note">${esc(OFF.local.note)}</p>
        ${OFF.local.tree.map((node) => nodeHtml(node)).join("")}
      </details>`;
    $("#officialdom-tree").innerHTML = localOnly
      ? `<p class="officialdom-note">当前查看：${esc(selectedUnit?.name || state.selectedSpecial?.name || "")} · 仅显示地方官制</p>${localBlock}`
      : `
      <details open>
        <summary>中央官制 <span class="panel-count">${eraLabel(year)}</span></summary>
        <p class="officialdom-note">${esc(OFF.central.note)}</p>
        ${OFF.central.tree.map((node) => nodeHtml(node)).join("")}
      </details>
      ${localBlock}`;
  }

  function figureMatchesUnit(figure, unit) {
    const aliases = {
      jingshi: ["京师", "北直隶", "北京"],
      nanjing: ["南京", "南直隶"],
      "shaanxi-xing-dusi": ["陕西行都司", "陕西"],
      "sichuan-xing-dusi": ["四川行都司", "四川"],
    };
    const tokens = [
      unit.name,
      unit.provinceName,
      unit.seatName,
      ...(aliases[unit.provinceId] || []),
    ].filter((token) => token && token.length >= 2);
    const haystack = [
      figure.region,
      figure.office,
      figure.bio,
      ...(figure.career || []),
    ].join(" ");
    return tokens.some((token) => haystack.includes(token));
  }

  function renderFigures() {
    const visible = FIGURES.filter((figure) => figure.from <= state.year && figure.to >= state.year);
    const selectedUnit = state.selectedUnitId ? unitById.get(state.selectedUnitId) : null;
    const localFigures = selectedUnit ? visible.filter((figure) => figureMatchesUnit(figure, selectedUnit)) : [];
    const shown = selectedUnit ? localFigures : visible;
    // 明史列传人物的类别标签；旧数据只有 central/local，新增 royal/ culture。
    const CATEGORY_LABELS = { central: "中央", local: "地方", culture: "艺文", royal: "宗室" };
    const byCategory = (key) => shown.filter((figure) => (figure.category || "local") === key);
    const central = byCategory("central");
    const local = byCategory("local");
    const culture = byCategory("culture");
    const royal = byCategory("royal");
    const card = (figure) => `<button class="figure-card" type="button" data-figure-id="${esc(figure.id)}">
      <span class="figure-avatar">${figure.portrait ? `<img src="${esc(figure.portrait)}" alt="${esc(figure.name)}" loading="lazy" />` : esc(figure.name.slice(0, 1))}</span>
      <span><b>${esc(figure.name)}</b><small><span class="figure-tag">${CATEGORY_LABELS[figure.category] || "其他"}</span>${esc(figure.office || "")}</small></span>
    </button>`;
    const section = (title, rows) => rows.length ? `<div class="figures-title"><span>${title}</span><span>${rows.length} 人</span></div><div class="figures-grid">${rows.map(card).join("")}</div>` : "";
    const title = selectedUnit ? `同期本地人物 · ${state.year} · ${selectedUnit.name}` : `同期人物 · ${state.year}`;
    $("#figures-panel").innerHTML = shown.length
      ? `<div class="figures-title"><span>${esc(title)}</span><span>${shown.length} 人</span></div>${selectedUnit ? section("本地相关人物", shown) : `${section("中央", central)}${section("地方", local)}${section("艺文", culture)}${section("宗室", royal)}`}`
      : `<div class="figures-title"><span>${esc(title)}</span><span>暂无</span></div><p class="tree-note">当前年份暂无本地相关人物。</p>`;
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

  /// 图例与地图共用同一个符号生成器，图例画出的形状因此与地图上完全一致。
  function markerImageUrl(shape, color) {
    const data = markerImage(shape, color);
    const canvas = document.createElement("canvas");
    canvas.width = data.width;
    canvas.height = data.height;
    canvas.getContext("2d").putImageData(data, 0, 0);
    return canvas.toDataURL("image/png");
  }

  function renderMapLegend() {
    const seatColor = "#1a1a1a";
    const marks = [
      ["star", "#7a3027", "首都（五角星）"],
      ["province", seatColor, "省级行政中心（外环＋阴影线）"],
      ["prefecture", seatColor, "府（大小双圈）"],
      ["secondary", seatColor, "州（圆内一点）"],
      ["county-ring", seatColor, "县级（小圆圈）"],
      ["cross", "#3e5e54", "都司卫所"],
      ["ring", "#7b5a3c", "羁縻/土司"],
    ];
    const mark = ([shape, color, label]) =>
      `<div class="legend-item"><span class="legend-symbol legend-symbol--img"><img src="${markerImageUrl(shape, color)}" alt="" /></span><span>${label}</span></div>`;
    const eventTypes = ["区划", "政治", "军事", "官制", "经济", "文化", "外交"];
    $("#map-legend").innerHTML = `<h3>图例 · 治所层级</h3><div class="legend-grid">${marks.map(mark).join("")}<div class="legend-item"><span class="legend-symbol legend-symbol--river"></span><span>河流/海岸</span></div><div class="legend-item"><span class="legend-symbol legend-symbol--mountain-icon">${ICONS.mountain || ""}</span><span>山脉</span></div></div><p class="tree-note" style="margin:8px 0 0">同址多级治所，图上只显示最高一级；文字与符号同步显隐（地名不显示时治所符号也隐藏）。省府州县治所符号一律黑色，县级为小圆圈。</p>
      <h3 style="margin-top:14px">图例 · 事件类型</h3><div class="event-legend-grid">${eventTypes.map((type) => `<div class="event-legend-item"><span class="event-icon event-legend-badge" style="--badge:${eventTypeColor(type)}">${eventIconSvg(type)}</span><span>${type}</span></div>`).join("")}</div>`;
  }

  function renderSpecialDetail(container) {
    const special = state.selectedSpecial;
    const provinceName = unitById.get(special.provinceId)?.name || special.provinceId || "—";
    const years = special.beg != null || special.end != null
      ? `${special.beg ?? "—"}—${special.end ?? "—"} 年`
      : "—";
    container.className = "detail-content";
    container.innerHTML = `
      <div class="detail-head">
        <div class="detail-level">军事/羁縻辖区 · ${esc(provinceName)}</div>
        <h2>${esc(special.name)}</h2>
        <div class="formal">${esc(special.type)}</div>
      </div>
      <div class="detail-section">
        <h3>建置信息</h3>
        <dl class="detail-kv">
          <dt>类型</dt><dd>${esc(special.type)}</dd>
          <dt>上级</dt><dd>${esc(provinceName)}</dd>
          <dt>治所</dt><dd>待考（当前以辖区面中心近似）</dd>
          <dt>有效年份</dt><dd>${esc(years)}</dd>
          <dt>资料来源</dt><dd>CHGIS V6 · 1600 年府级多边形</dd>
        </dl>
      </div>
      <div class="detail-section">
        <h3>说明</h3>
        <p class="tree-note">${special.fallback
          ? "该色块暂未对应到民政府州，可能是地图补域或待考辖区；点击仍会高亮对应面。"
          : "该单位为行都司、卫所、宣慰司、长官司等军事或羁縻辖区，不属于民政府州县序列。图中灰褐色虚线面表示其大致辖域；点击色块可高亮对应辖区。"}</p>
      </div>`;
  }

  // Special county notes: 附郭县/倚郭县 — a county whose seat sits at its parent
  // 府/州 seat (includes 双附郭 same-city counties). Shown in the detail panel.
  function specialCountyNote(unit) {
    if (!unit || unit.level !== "county") return "";
    const sameCity = (a, b) => Math.abs((a.lon ?? 999) - (b.lon ?? -999)) < 0.002
      && Math.abs((a.lat ?? 999) - (b.lat ?? -999)) < 0.002;
    let current = unitById.get(unit.parentId);
    for (let guard = 0; current && guard < 12; guard += 1) {
      if ((current.level === "prefecture" || current.level === "department") && sameCity(current, unit)) {
        return `附郭县（倚郭：治所与所属${current.level === "department" ? "州" : "府"}「${current.name}」同城）`;
      }
      current = unitById.get(current.parentId);
    }
    return "";
  }

  function renderDetail() {
    const container = $("#detail-content");
    if (state.selectedSpecial) {
      renderSpecialDetail(container);
      return;
    }
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
    const specialNote = specialCountyNote(unit);

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
          ${specialNote ? `<dt>备注</dt><dd>${esc(specialNote)}</dd>` : ""}
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
    const percent = ((state.year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100;
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
    const next = Math.max(YEAR_MIN, Math.min(YEAR_MAX, Number(year)));
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
    $("#stats-card").innerHTML = `<h3>${state.year} 年建置统计</h3><div class="stats-grid">
      <div><strong>${counts.prefecture}</strong><span>府</span></div>
      <div><strong>${counts.department}</strong><span>州</span></div>
      <div><strong>${counts.county}</strong><span>县</span></div>
      <div><strong>${MING.provinces.length}</strong><span>省级/留都</span></div>
      <div><strong>${counts.military}</strong><span>都司卫所</span></div>
      <div><strong>${counts.jimi}</strong><span>羁縻/土司</span></div>
    </div><p class="tree-note" style="margin:9px 0 0">${window.__DYNASTY__ === "qing" ? "数据来自 CHGIS 1820 年断面；府州县点位按 1820 年整理。" : "数据来自“历史地图计划”1600 年断面；府州县点位 1,563 个。"}</p>`;
  }

  function switchLeftTab(tab) {
    state.leftTab = tab;
    $$(".left-panel .tab").forEach((button) => button.classList.toggle("is-active", button.dataset.tab === tab));
    $("#events-view").hidden = tab !== "events";
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
    const total = YEAR_MAX - YEAR_MIN + 1;
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
    $("#btn-year-1600").addEventListener("click", () => { stopPlay(); setYear(Number(window.__DEFAULT_YEAR__ ?? 1600), { toast: true }); });
    $("#btn-play").addEventListener("click", togglePlay);

    const markers = $("#timeline-markers");
    markers.innerHTML = EVENTS.filter((event) => MAJOR_EVENT_IDS.has(event.id)).map((event) => {
      const left = ((event.year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100;
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
    const tickYears = Array.from({ length: 8 }, (_, i) => Math.round(YEAR_MIN + (YEAR_MAX - YEAR_MIN) * i / 7));
    ticks.innerHTML = tickYears.map((year) => {
      const left = ((year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100;
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
    if (state.year >= YEAR_MAX) setYear(YEAR_MIN);
    state.playTimer = setInterval(() => {
      if (state.year >= YEAR_MAX) { stopPlay(); return; }
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

  /// 「显示」下拉是图层与地名标签的唯一入口；两个命名空间共用一个 data-display 键：
  /// 前一组是 state.layers 的图层开关，后一组是 state.labelLevels 的逐级标签。
  const DISPLAY_LAYER_KEYS = new Set(["national", "provinces", "admin", "special",
    "neighbors", "military", "jimi", "modern", "mountains", "events", "labels"]);

  function syncDisplayControls() {
    $$("[data-display]").forEach((input) => {
      const key = input.dataset.display;
      input.checked = DISPLAY_LAYER_KEYS.has(key)
        ? Boolean(state.layers[key])
        : Boolean(state.labelLevels[key]);
    });
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
        if (DISPLAY_LAYER_KEYS.has(key)) {
          state.layers[key] = input.checked;
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

  function openChapterSwitch() {
    const chapters = window.__CHAPTERS__ || [];
    const grid = $("#chapter-switch-grid");
    grid.innerHTML = chapters.map((chapter) => `<button class="chapter-switch-card" type="button" data-switch-chapter="${esc(chapter.id)}"><b>${esc(chapter.name)}</b><span>${esc(chapter.full)}<small>${esc(chapter.years)}</small></span></button>`).join("");
    $("#chapter-switch-dialog").showModal();
  }

  function initChapterSwitch() {
    $("#btn-chapter-switch-close").addEventListener("click", () => $("#chapter-switch-dialog").close());
    $("#chapter-switch-dialog").addEventListener("click", (event) => { if (event.target === $("#chapter-switch-dialog")) $("#chapter-switch-dialog").close(); });
    $("#chapter-switch-grid").addEventListener("click", (event) => {
      const card = event.target.closest("[data-switch-chapter]");
      if (!card) return;
      const id = card.dataset.switchChapter;
      const destinations = { ming: "index.html?year=1600", qing: "qing.html?year=1820" };
      $("#chapter-switch-dialog").close();
      if (destinations[id]) window.location.href = destinations[id];
      else toast(`${card.textContent.trim()}章节建设中`);
    });
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
    $("#btn-chapters").addEventListener("click", openChapterSwitch);
    $("#btn-about").addEventListener("click", () => $("#about-dialog").showModal());
    $("#btn-about-close").addEventListener("click", () => $("#about-dialog").close());
    $("#about-dialog").addEventListener("click", (event) => {
      if (event.target === $("#about-dialog")) $("#about-dialog").close();
    });

    $("#tab-events").addEventListener("click", () => switchLeftTab("events"));
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
      selectOrToggleUnit(label.dataset.unitId, { fly: false, tab: "detail" });
    });
    // Labels sit above the canvas with pointer events on (so they stay
    // clickable), which would otherwise swallow wheel-zoom. Forward the wheel to
    // the map canvas so zooming works while the pointer is over a name.
    $("#map-labels").addEventListener("wheel", (event) => {
      event.preventDefault();
      event.stopPropagation();
      map.getCanvas().dispatchEvent(new WheelEvent("wheel", {
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        clientX: event.clientX,
        clientY: event.clientY,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        bubbles: true,
        cancelable: true,
      }));
    }, { passive: false });
  }

  function init() {
    document.body.classList.add(`theme-${window.__DYNASTY__ || "ming"}`);
    initMap();
    initSearch();
    initTimeline();
    setPlayIcon(false);
    renderTabIcons();
    initResizers();
    initDisplayMenu();
    initChapterSwitch();
    initControls();
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
    if (params.get("tab") === "legend") switchLeftTab("legend");
    if (params.get("tab") === "detail") setRightTab("detail");
  }

  init();
})();
