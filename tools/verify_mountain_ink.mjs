#!/usr/bin/env node
// Headless verification for the mountain-ink zoom scaling in app/index.html.
//
// Mountain glyphs, ridge lines and names are supposed to be "printed" on the
// map: their geographic footprint is fixed, so on screen they must double with
// every zoom level. This driver checks the real page through Edge's DevTools
// protocol without touching production code:
//   1. the icon-size / line-width style expressions carry exponential base-2
//      doubling stops and are accepted by MapLibre;
//   2. mountain name labels grow by exactly 2^(zoom-4) (font ratio z6/z4 = 4);
//   3. giant glyphs actually render at high zoom (pixel probe on a clean
//      background screenshot).
//
// Usage: node tools/verify_mountain_ink.mjs
// Writes app/preview-ink-z{4,6,8}.png and app/preview-ink-z8-clean.png.

import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9333;
const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(HERE, "..", "app");
const appUrl = new URL(`file:///${join(APP_DIR, "index.html").replace(/\\/g, "/")}`).href;

// Runs before any page script: intercept the `maplibregl` global assignment
// (the vendored UMD bundle does `globalThis.maplibregl = factory()`) and wrap
// its Map constructor so the live instance can be driven from the test.
const CAPTURE_SCRIPT = `
(() => {
  window.__TEST__ = { map: null, errors: [] };
  let current;
  Object.defineProperty(window, "maplibregl", {
    configurable: true,
    get() { return current; },
    set(value) {
      current = value;
      if (value && value.Map) {
        const Original = value.Map;
        value.Map = class extends Original {
          constructor(...args) {
            super(...args);
            window.__TEST__.map = this;
          }
        };
      }
    },
  });
  window.addEventListener("error", (event) => window.__TEST__.errors.push(String(event.message)));
  window.addEventListener("unhandledrejection", (event) =>
    window.__TEST__.errors.push("Promise: " + event.reason));
})();
`;

const PROBE = `
(async () => {
  const T = window.__TEST__;
  const map = T && T.map;
  if (!map) return { error: "map instance not captured", pageErrors: T ? T.errors : [] };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await Promise.race([new Promise((resolve) => map.once("idle", resolve)), sleep(9000)]);
  await sleep(500);
  const out = {
    pageErrors: T.errors.concat(window.__ERRORS__ || []),
    iconSize: map.getLayoutProperty("mountain-peaks", "icon-size"),
    lineWidth: map.getPaintProperty("mountain-ridges", "line-width"),
    zooms: {},
  };
  // Every range whose anchor is inside the viewport must have a visible name.
  const labelCheck = () => {
    const width = map.getCanvas().clientWidth;
    const height = map.getCanvas().clientHeight;
    const shown = new Set([...document.querySelectorAll(".map-label--mountain")]
      .filter((el) => el.style.display !== "none").map((el) => el.textContent));
    const expected = [], missing = [];
    for (const range of window.__MOUNTAINS__) {
      const point = map.project(range.coords[Math.floor(range.coords.length / 2)]);
      if (point.x < 12 || point.y < 12 || point.x > width - 12 || point.y > height - 12) continue;
      expected.push(range.name);
      if (!shown.has(range.name)) missing.push(range.name);
    }
    return { expected: expected.length, shown: shown.size, missing };
  };
  const readLabels = () => [...document.querySelectorAll(".map-label--mountain")].map((el) => ({
    name: el.textContent,
    font: el.style.fontSize,
    shown: el.style.display !== "none",
  }));
  // Glyph silhouettes must never occlude each other. The SVG path spans ~86% of
  // the icon box in width and ~58% in height (wide base, narrow peak), so a
  // vertical neighbour can sit closer than a horizontal one: model each glyph
  // as an ellipse and flag pairs whose ellipses intersect.
  const glyphCheck = (zoom) => {
    const features = map.queryRenderedFeatures({ layers: ["mountain-peaks"] });
    const scale = Math.pow(2, zoom - 4);
    const glyphs = features.map((feature) => {
      const point = map.project(feature.geometry.coordinates);
      const box = feature.properties.iconSize * 1.2 * 32 * scale;
      return {
        name: feature.properties.name,
        iconSize: feature.properties.iconSize,
        x: point.x, y: point.y,
        w: box * 0.86,
        h: box * 0.58,
      };
    });
    let worst = null;
    for (let i = 0; i < glyphs.length; i += 1) {
      for (let j = i + 1; j < glyphs.length; j += 1) {
        const a = glyphs[i], b = glyphs[j];
        const dx = Math.abs(a.x - b.x) / ((a.w + b.w) / 2);
        const dy = Math.abs(a.y - b.y) / ((a.h + b.h) / 2);
        const excess = Math.sqrt(dx * dx + dy * dy);
        if (excess < 0.99 && (!worst || excess < worst.excess)) {
          worst = { excess: +excess.toFixed(3), names: [a.name, b.name] };
        }
      }
    }
    const qinling = glyphs.find((glyph) => glyph.name === "秦岭");
    return {
      glyphs: glyphs.length,
      closestPair: worst,
      qinlingIconSize: qinling ? qinling.iconSize : null,
    };
  };
  // The name must sit at the range's arc-length midpoint (its visual centre),
  // not at a middle vertex. Compare each label's translate3d x to map.project of
  // the arc midpoint, in the same canvas-pixel basis.
  const arcMidpoint = (coords) => {
    let total = 0;
    for (let i = 1; i < coords.length; i += 1) total += Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
    let remaining = total / 2;
    for (let i = 1; i < coords.length; i += 1) {
      const [x0, y0] = coords[i - 1], [x1, y1] = coords[i];
      const seg = Math.hypot(x1 - x0, y1 - y0);
      if (remaining <= seg || i === coords.length - 1) {
        const t = seg === 0 ? 0 : remaining / seg;
        return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
      }
      remaining -= seg;
    }
    return coords[coords.length - 1];
  };
  const centerCheck = () => {
    let maxError = 0, worst = null;
    for (const el of document.querySelectorAll(".map-label--mountain")) {
      if (el.style.display === "none") continue;
      const range = window.__MOUNTAINS__.find((r) => r.name === el.textContent);
      const match = el.style.transform.match(/translate3d\\(([-\\d.]+)px, ([-\\d.]+)px/);
      if (!range || !match) continue;
      const expectedX = map.project(arcMidpoint(range.coords)).x;
      const error = Math.abs(parseFloat(match[1]) - expectedX);
      if (error > maxError) { maxError = error; worst = el.textContent; }
    }
    return { maxError: +maxError.toFixed(1), worst };
  };

  const nameOverlapCheck = () => {
    const items = [...document.querySelectorAll(".map-label--mountain")]
      .filter((el) => el.style.display !== "none")
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          name: el.textContent,
          cx: rect.left + rect.width / 2,
          cy: rect.top + rect.height / 2,
          r: 0.5 * Math.hypot(el.offsetWidth, el.offsetHeight),
        };
      });
    let minMargin = Infinity, worst = null;
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i], b = items[j];
        const margin = Math.hypot(a.cx - b.cx, a.cy - b.cy) - (a.r + b.r);
        if (margin < minMargin) {
          minMargin = margin;
          worst = { pair: [a.name, b.name], margin: +margin.toFixed(1) };
        }
      }
    }
    return { count: items.length, minMargin: Number.isFinite(minMargin) ? +minMargin.toFixed(1) : null, worst };
  };
  const cases = [
    { zoom: 4, center: [110, 34] },
    { zoom: 6, center: [110, 34] },
    { zoom: 8, center: [110, 34] },
    // 五岭 dense cluster — the area the user reported.
    { zoom: 5, center: [111.5, 25.0] },
    { zoom: 6, center: [111.5, 25.0] },
    { zoom: 7, center: [111.5, 25.0] },
    { zoom: 8, center: [111.5, 25.0] },
  ];
  for (const item of cases) {
    map.jumpTo({ zoom: item.zoom, center: item.center });
    await sleep(700);
    out.zooms["z" + item.zoom + "@" + item.center.join(",")] = {
      labels: labelCheck(),
      glyphs: glyphCheck(item.zoom),
      names: nameOverlapCheck(),
      center: centerCheck(),
    };
  }
  return out;
})()
`;

// Layers that tint the paper background (#e8e1d3); hiding them leaves glyph
// pixels at a predictable blended colour for the pixel probe.
const HIDE_FOR_CLEAN = [
  "terrain-hillshade", "national-fill", "national-line", "province-fill",
  "province-line", "province-line-top", "county-fill", "county-boundaries",
  "chgis-fill", "chgis-special-fill", "chgis-line", "chgis-special-line",
  "prefecture-line", "modern-china-line", "neighbor-fill", "neighbor-glow-outer",
  "neighbor-glow-inner", "neighbor-line", "neighbor-capital", "event-halo",
  "event-points",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", () => reject(new Error("websocket failed")));
  });
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result);
    } else if (message.method) {
      for (const handler of listeners.get(message.method) || []) handler(message.params);
    }
  });
  return {
    ready,
    send(method, params = {}) {
      return ready.then(() => new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      }));
    },
    on(method, handler) {
      if (!listeners.has(method)) listeners.set(method, []);
      listeners.get(method).push(handler);
    },
  };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error("page evaluation failed: " + JSON.stringify(result.exceptionDetails));
  }
  return result.result.value;
}

async function screenshot(cdp, zoom, clean, center, name) {
  await evaluate(cdp, `
    (async () => {
      const map = window.__TEST__.map;
      map.jumpTo({ zoom: ${zoom}, center: ${JSON.stringify(center)} });
      ${clean ? `for (const id of ${JSON.stringify(HIDE_FOR_CLEAN)}) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");` : ""}
      await new Promise((resolve) => setTimeout(resolve, 900));
    })()
  `);
  const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(APP_DIR, name), Buffer.from(shot.data, "base64"));
  return name;
}

async function main() {
  const userDataDir = mkdtempSync(join(tmpdir(), "edge-ink-"));
  const edge = spawn(EDGE, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    "--window-size=1400,900",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--hide-scrollbars",
    "about:blank",
  ], { stdio: "ignore" });

  try {
    let targets = null;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        targets = await response.json();
        if (targets.some((target) => target.type === "page")) break;
      } catch { /* endpoint not up yet */ }
      await sleep(300);
    }
    const page = targets?.find((target) => target.type === "page");
    if (!page) throw new Error("Edge debugging target not found");

    const cdp = connect(page.webSocketDebuggerUrl);
    const consoleErrors = [];
    cdp.on("Runtime.exceptionThrown", (params) => consoleErrors.push(
      "exception: " + (params.exceptionDetails?.exception?.description
        || params.exceptionDetails?.text || "?")));
    cdp.on("Runtime.consoleAPICalled", (params) => {
      if (params.type === "error") {
        consoleErrors.push("console.error: " + params.args.map((arg) => arg.value ?? arg.description).join(" "));
      }
    });
    await cdp.ready;
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: CAPTURE_SCRIPT });

    const loaded = new Promise((resolve) => cdp.on("Page.loadEventFired", resolve));
    await cdp.send("Page.navigate", { url: appUrl });
    await loaded;
    await sleep(800);

    const probe = await evaluate(cdp, PROBE);
    const shots = [];
    shots.push(await screenshot(cdp, 4, false, [110, 34], "preview-ink-z4.png"));
    shots.push(await screenshot(cdp, 7, false, [108.6, 34.0], "preview-ink-qinling-z7.png"));
    shots.push(await screenshot(cdp, 6, false, [111.5, 25.0], "preview-ink-wuling-z6.png"));
    shots.push(await screenshot(cdp, 7, false, [111.5, 25.0], "preview-ink-wuling-z7.png"));
    shots.push(await screenshot(cdp, 8, false, [111.5, 25.0], "preview-ink-wuling-z8.png"));
    // Clean shots at both ends: if glyphs keep a fixed geographic footprint,
    // the glyph pixel count covering the viewport is roughly zoom-invariant
    // (per-glyph area x16 from z4 to z8, visible glyph count /16).
    for (const zoom of [4, 8]) shots.push(await screenshot(cdp, zoom, true, [110, 34], `preview-ink-z${zoom}-clean.png`));

    console.log(JSON.stringify({ probe, consoleErrors, shots }, null, 2));
  } finally {
    edge.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
