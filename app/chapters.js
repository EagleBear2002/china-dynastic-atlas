(() => {
  "use strict";
  const REF = window.__REFERENCE__;
  const MODERN = window.__MODERN_CHINA__;
  const TERRITORIES = window.__TERRITORIES__;
  const CHAPTERS = window.__CHAPTERS__;
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

  const state = { chapterId: "qin", activePolity: null };
  let map;
  const labelNodes = new Map();

  function periodFor(chapter) {
    return TERRITORIES.periods.find((period) => period.id === chapter.periodId) || TERRITORIES.periods[0];
  }

  function territoryData(period) {
    return {
      type: "FeatureCollection",
      features: (period.polities || []).filter((polity) => polity.polygon).map((polity) => ({
        type: "Feature",
        id: polity.id,
        geometry: { type: "Polygon", coordinates: [polity.polygon] },
        properties: {
          id: polity.id,
          name: polity.name,
          color: polity.color || "#7a3027",
          labelLat: polity.labelAt?.lat,
          labelLng: polity.labelAt?.lng,
        },
      })),
    };
  }

  function mapStyle() {
    const initialChapter = CHAPTERS.find((chapter) => chapter.id === state.chapterId) || CHAPTERS[0];
    const initialPeriod = periodFor(initialChapter);
    return {
      version: 8,
      sources: {
        natural: { type: "geojson", data: REF.natural },
        terrain: { type: "raster-dem", tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], encoding: "terrarium", tileSize: 256, maxzoom: 12 },
        modern: { type: "geojson", data: MODERN },
        territories: { type: "geojson", data: territoryData(initialPeriod), promoteId: "id" },
      },
      layers: [
        { id: "background", type: "background", paint: { "background-color": "#e8e1d3" } },
        { id: "ocean", type: "fill", source: "natural", filter: ["==", ["get", "kind"], "ocean"], paint: { "fill-color": "#9aaeb0", "fill-opacity": 0.86 } },
        { id: "land", type: "fill", source: "natural", filter: ["==", ["get", "kind"], "land"], paint: { "fill-color": "#e8e1d3" } },
        { id: "lakes", type: "fill", source: "natural", filter: ["==", ["get", "kind"], "lake"], paint: { "fill-color": "#9aaeb0", "fill-opacity": 0.9 } },
        { id: "rivers", type: "line", source: "natural", filter: ["==", ["get", "kind"], "river"], paint: { "line-color": "#84999d", "line-opacity": 0.7, "line-width": 0.65 } },
        { id: "coast", type: "line", source: "natural", filter: ["==", ["get", "kind"], "coastline"], paint: { "line-color": "#84999d", "line-opacity": 0.65, "line-width": 0.8 } },
        { id: "hillshade", type: "hillshade", source: "terrain", paint: { "hillshade-exaggeration": 0.42, "hillshade-shadow-color": "rgba(84,74,56,.42)", "hillshade-highlight-color": "rgba(250,246,236,.48)", "hillshade-accent-color": "rgba(91,82,62,.26)" } },
        { id: "modern-line", type: "line", source: "modern", paint: { "line-color": "rgba(78,92,86,.36)", "line-width": 0.65, "line-dasharray": [3, 3], "line-opacity": 0.55 } },
        { id: "polity-fill", type: "fill", source: "territories", paint: { "fill-color": ["get", "color"], "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.72, 0.44] } },
        { id: "polity-line", type: "line", source: "territories", paint: { "line-color": ["get", "color"], "line-width": 1.35, "line-opacity": 0.72 } },
      ],
    };
  }

  function initMap() {
    map = new maplibregl.Map({
      container: "map",
      style: mapStyle(),
      center: [108, 34],
      zoom: 3.2,
      minZoom: 2.5,
      maxZoom: 8,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.on("move", renderLabels);
    map.on("zoom", renderLabels);
    map.on("resize", renderLabels);
    map.on("load", () => renderChapter(state.chapterId));
  }

  function renderChapter(chapterId) {
    const chapter = CHAPTERS.find((item) => item.id === chapterId) || CHAPTERS[0];
    const period = periodFor(chapter);
    state.chapterId = chapter.id;
    state.activePolity = null;
    $("#btn-chapter").textContent = chapter.name;
    $("#chapter-name").textContent = chapter.full;
    $("#chapter-years").textContent = chapter.years;
    $("#chapter-note").textContent = chapter.note || period.era || "";
    $("#chapter-subtitle").textContent = `${chapter.full} · ${chapter.years}`;
    $("#chapter-description").textContent = period.description || "";
    const polities = period.polities || [];
    $("#polity-list").innerHTML = polities.map((polity) => `<div class="polity-item"><i style="--dot:${esc(polity.color || "#7a3027")}"></i><span>${esc(polity.name)}</span></div>`).join("");
    $("#polity-switcher").innerHTML = polities.map((polity) => `<button class="polity-btn" type="button" data-polity-id="${esc(polity.id)}" style="--dot:${esc(polity.color || "#7a3027")}"><i></i>${esc(polity.name)}</button>`).join("");
    const data = territoryData(period);
    if (map.getSource("territories")) map.getSource("territories").setData(data);
    for (const node of labelNodes.values()) node.remove();
    labelNodes.clear();
    if (data.features.length) {
      const coords = data.features.flatMap((feature) => feature.geometry.coordinates[0]);
      const lngs = coords.map((point) => point[0]);
      const lats = coords.map((point) => point[1]);
      map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: { top: 110, bottom: 50, left: 330, right: 40 }, duration: 600 });
    }
    renderLabels();
    history.replaceState(null, "", `?chapter=${encodeURIComponent(chapter.id)}`);
  }

  function renderLabels() {
    if (!map || !map.getSource("territories")) return;
    const width = map.getCanvas().clientWidth;
    const height = map.getCanvas().clientHeight;
    const period = periodFor(CHAPTERS.find((item) => item.id === state.chapterId));
    const used = new Set();
    for (const polity of period.polities || []) {
      if (!polity.labelAt) continue;
      const point = map.project([polity.labelAt.lng, polity.labelAt.lat]);
      if (point.x < 0 || point.y < 0 || point.x > width || point.y > height) continue;
      let element = labelNodes.get(polity.id);
      if (!element) {
        element = document.createElement("div");
        element.className = "map-label map-label--polity";
        element.dataset.polityId = polity.id;
        $("#map-labels").appendChild(element);
        labelNodes.set(polity.id, element);
      }
      element.textContent = polity.name;
      element.classList.toggle("is-selected", state.activePolity === polity.id);
      element.style.transform = `translate3d(${point.x}px, ${point.y}px, 0) translate(-50%, -50%)`;
      element.style.color = polity.color || "#7a3027";
      element.style.display = "";
      used.add(polity.id);
    }
    for (const [id, node] of labelNodes.entries()) if (!used.has(id)) node.style.display = "none";
  }

  function selectPolity(polityId) {
    state.activePolity = polityId;
    for (const [id] of labelNodes) map.setFeatureState({ source: "territories", id }, { selected: id === polityId });
    document.querySelectorAll("[data-polity-id]").forEach((button) => button.classList.toggle("is-active", button.dataset.polityId === polityId));
    renderLabels();
  }

  function initChrome() {
    $("#btn-chapter").addEventListener("click", () => {
      $("#chapter-grid").innerHTML = CHAPTERS.map((chapter) => `<button class="chapter-card" type="button" data-chapter-id="${esc(chapter.id)}"><b>${esc(chapter.name)}</b><span>${esc(chapter.full)}<br>${esc(chapter.years)}</span></button>`).join("");
      $("#chapter-dialog").showModal();
    });
    $("#btn-dialog-close").addEventListener("click", () => $("#chapter-dialog").close());
    $("#chapter-dialog").addEventListener("click", (event) => { if (event.target === $("#chapter-dialog")) $("#chapter-dialog").close(); });
    $("#chapter-grid").addEventListener("click", (event) => {
      const card = event.target.closest("[data-chapter-id]");
      if (!card) return;
      const chapterId = card.dataset.chapterId;
      const detailPages = { ming: "index.html", qing: "qing.html?year=1820", tang: "tang.html?year=740", song: "song.html?year=1100", yuan: "yuan.html?year=1300" };
      const destination = detailPages[chapterId];
      $("#chapter-dialog").close();
      if (destination) { window.location.href = destination; return; }
      renderChapter(chapterId);
    });
    $("#polity-switcher").addEventListener("click", (event) => {
      const button = event.target.closest("[data-polity-id]");
      if (button) selectPolity(button.dataset.polityId);
    });
  }

  const params = new URLSearchParams(location.search);
  state.chapterId = params.get("chapter") || "qin";
  initMap();
  initChrome();
})();
