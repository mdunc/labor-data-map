import type { Topology } from "topojson-specification";
import { loadDataset, loadValues } from "./data.ts";
import { createMap } from "./map.ts";
import { createTooltip } from "./tooltip.ts";
import { renderLegend } from "./legend.ts";
import { PlaybackEngine, mountTimelineUI } from "./timeline.ts";
import { setupAboutModal } from "./about.ts";
import { runIntroOnce } from "./intro.ts";

async function fatal(message: string, err?: unknown) {
  console.error(message, err);
  document.body.innerHTML = `<div style="padding:24px;font-family:system-ui">
    <h2>Failed to load</h2>
    <p>${message}</p>
    <button onclick="location.reload()">Retry</button>
  </div>`;
}

async function main() {
  const mapCanvas = document.getElementById("map-canvas") as HTMLCanvasElement;
  const pickCanvas = document.getElementById("picking-canvas") as HTMLCanvasElement;
  const tooltipEl = document.getElementById("tooltip") as HTMLElement;
  const legendEl = document.getElementById("legend") as HTMLElement;
  const timelineEl = document.getElementById("timeline") as HTMLElement;
  const aboutBtn = document.getElementById("about-button") as HTMLElement;
  const aboutModal = document.getElementById("about-modal") as HTMLElement;

  setupAboutModal(aboutBtn, aboutModal);
  renderLegend(legendEl);

  let dataset: Awaited<ReturnType<typeof loadDataset>>;
  let topology: Topology;
  try {
    dataset = await loadDataset(".");
  } catch (err) { fatal("Couldn't load labor force data.", err); return; }
  try {
    const res = await fetch("./counties.topo.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    topology = (await res.json()) as Topology;
  } catch (err) { fatal("Couldn't load county geometry.", err); return; }

  // Read the legend gutter from CSS so the initial map fit reserves space on the right
  // for the legend overlay. Zoomed content can still pan across the full viewport.
  const containerStyle = getComputedStyle(document.getElementById("map-container") as HTMLElement);
  const gutterRaw = containerStyle.getPropertyValue("--legend-gutter").trim();
  const rightGutter = gutterRaw.endsWith("px") ? parseFloat(gutterRaw) : parseFloat(gutterRaw) || 0;
  const mapHandle = createMap(mapCanvas, pickCanvas, topology, dataset, { rightGutter });
  const tooltip = createTooltip(tooltipEl, dataset);

  const engine = new PlaybackEngine({
    nMonths: dataset.nMonths,
    monthsPerSecondAt1x: 4,
    onTick: (m) => {
      ui.setMonth(m);
    },
    onFrame: (m) => {
      mapHandle.draw(m);
    },
  });
  const ui = mountTimelineUI(timelineEl, dataset.meta.months, engine);

  function fitAndRedraw() {
    const r = mapCanvas.getBoundingClientRect();
    mapHandle.resize(r.width, r.height, window.devicePixelRatio || 1);
    mapHandle.draw(engine.month);
  }
  fitAndRedraw();
  let resizeTimer: number | undefined;
  window.addEventListener("resize", () => {
    if (resizeTimer) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(fitAndRedraw, 100);
  });

  // Pan/zoom state (declared up here so mousemove tooltip handler can read isPanning).
  const activePointers = new Map<number, { x: number; y: number }>();
  let isPanning = false;
  let pinchStartDist = 0;
  let pinchStartK = 1;

  mapCanvas.addEventListener("mousemove", (ev) => {
    if (isPanning) return;
    const rect = mapCanvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const c = mapHandle.hitTest(x, y);
    if (c === undefined) { tooltip.hide(); return; }
    const name = mapHandle.getCountyName(c);
    if (!name) { tooltip.hide(); return; }
    tooltip.show({ x: ev.clientX, y: ev.clientY, countyIdx: c, monthIdx: engine.month, countyName: name });
  });
  mapCanvas.addEventListener("mouseleave", () => tooltip.hide());

  // ---- Pan & zoom (mouse + touch, Google-Maps-style) ----------------------
  function localXY(ev: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = mapCanvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function applyTransform(tx: number, ty: number, k: number) {
    mapHandle.setTransform({ tx, ty, k });
    mapHandle.draw(engine.month);
  }

  function zoomAt(cx: number, cy: number, factor: number) {
    const cur = mapHandle.getTransform();
    const newK = Math.max(mapHandle.minZoom, Math.min(mapHandle.maxZoom, cur.k * factor));
    const f = newK / cur.k;
    // Keep the (cx, cy) screen point anchored: tx' = cx - (cx - tx) * f
    const newTx = cx - (cx - cur.tx) * f;
    const newTy = cy - (cy - cur.ty) * f;
    applyTransform(newTx, newTy, newK);
  }

  function midpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  mapCanvas.addEventListener("pointerdown", (ev) => {
    mapCanvas.setPointerCapture(ev.pointerId);
    activePointers.set(ev.pointerId, localXY(ev));
    if (activePointers.size === 1) {
      isPanning = true;
      tooltip.hide();
    } else if (activePointers.size === 2) {
      const pts = [...activePointers.values()];
      pinchStartDist = distance(pts[0], pts[1]);
      pinchStartK = mapHandle.getTransform().k;
    }
  });

  mapCanvas.addEventListener("pointermove", (ev) => {
    const prev = activePointers.get(ev.pointerId);
    if (!prev) return;
    const cur = localXY(ev);
    activePointers.set(ev.pointerId, cur);

    if (activePointers.size === 1) {
      const t = mapHandle.getTransform();
      applyTransform(t.tx + (cur.x - prev.x), t.ty + (cur.y - prev.y), t.k);
    } else if (activePointers.size === 2) {
      const pts = [...activePointers.values()];
      const dist = distance(pts[0], pts[1]);
      if (pinchStartDist <= 0) { pinchStartDist = dist; return; }
      const mid = midpoint(pts[0], pts[1]);
      const t = mapHandle.getTransform();
      // Compute new k from start of pinch, then anchor on midpoint.
      const targetK = Math.max(mapHandle.minZoom, Math.min(mapHandle.maxZoom, pinchStartK * (dist / pinchStartDist)));
      const f = targetK / t.k;
      const newTx = mid.x - (mid.x - t.tx) * f;
      const newTy = mid.y - (mid.y - t.ty) * f;
      applyTransform(newTx, newTy, targetK);
    }
  });

  function endPointer(ev: PointerEvent) {
    activePointers.delete(ev.pointerId);
    if (activePointers.size < 2) pinchStartDist = 0;
    if (activePointers.size === 0) isPanning = false;
  }
  mapCanvas.addEventListener("pointerup", endPointer);
  mapCanvas.addEventListener("pointercancel", endPointer);
  mapCanvas.addEventListener("pointerleave", endPointer);

  mapCanvas.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    const { x, y } = localXY(ev);
    // Normalize across deltaMode and trackpad/mouse: each "notch" should feel like ~10% zoom.
    const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? mapCanvas.clientHeight : 1;
    const factor = Math.exp(-ev.deltaY * unit * 0.0015);
    zoomAt(x, y, factor);
    tooltip.hide();
  }, { passive: false });

  // Double-click / double-tap to zoom in 2× at the cursor.
  mapCanvas.addEventListener("dblclick", (ev) => {
    const { x, y } = localXY(ev);
    zoomAt(x, y, 2);
  });

  // Lazy-load values for tooltip details after first paint
  loadValues(dataset, ".").catch((err) => console.warn("values.bin failed to load", err));

  // Kick off the intro animation
  runIntroOnce(engine);
  ui.setMonth(0);
}

main();
