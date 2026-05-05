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
  const mapContainer = document.getElementById("map-container") as HTMLElement;

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

  const mapHandle = createMap(mapCanvas, pickCanvas, topology, dataset);
  const tooltip = createTooltip(tooltipEl, dataset);

  const engine = new PlaybackEngine({
    nMonths: dataset.nMonths,
    monthsPerSecondAt1x: 4,
    onTick: (m) => {
      mapHandle.draw(m);
      ui.setMonth(m);
    },
  });
  const ui = mountTimelineUI(timelineEl, dataset.meta.months, engine);

  function fitAndRedraw() {
    const r = mapContainer.getBoundingClientRect();
    mapHandle.resize(r.width, r.height, window.devicePixelRatio || 1);
    mapHandle.draw(engine.month);
  }
  fitAndRedraw();
  let resizeTimer: number | undefined;
  window.addEventListener("resize", () => {
    if (resizeTimer) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(fitAndRedraw, 100);
  });

  mapCanvas.addEventListener("mousemove", (ev) => {
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

  // Lazy-load values for tooltip details after first paint
  loadValues(dataset, ".").catch((err) => console.warn("values.bin failed to load", err));

  // Kick off the intro animation
  runIntroOnce(engine);
  ui.setMonth(0);
}

main();
