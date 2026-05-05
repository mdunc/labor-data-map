import { geoAlbersUsa, geoPath, GeoProjection } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection, MultiPolygon, Polygon, Feature } from "geojson";

import { Dataset } from "./data.ts";
import { bucketColor, bucketColorRgb } from "./colors.ts";

export interface Transform {
  tx: number;
  ty: number;
  k: number;
}

export interface MapHandle {
  resize(width: number, height: number, dpr: number): void;
  /** monthIdx may be fractional during playback to fade between adjacent months. */
  draw(monthIdx: number): void;
  hitTest(x: number, y: number): number | undefined; // returns countyIdx or undefined
  getCountyName(countyIdx: number): string | undefined;
  getCountyFips(countyIdx: number): string | undefined;
  /** Set pan/zoom transform. Values are clamped so the map always fills the viewport. */
  setTransform(t: Transform): Transform;
  getTransform(): Transform;
  getViewport(): { width: number; height: number };
  /** Min/max zoom factor (k). */
  readonly minZoom: number;
  readonly maxZoom: number;
}

interface CountyEntry {
  fips: string;
  name: string;
  state: string;
  feature: Feature<Polygon | MultiPolygon, { id: string }>;
  path?: Path2D;        // built lazily after first projection
  pickColor: string;    // unique RGB string for hit-testing
}

const STATE_NAMES: Record<string, string> = {
  "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","11":"DC","12":"FL",
  "13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME",
  "24":"MD","25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH",
  "34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI",
  "45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY",
  "60":"AS","66":"GU","69":"MP","72":"PR","78":"VI",
};

function indexToRgb(idx: number): string {
  // idx + 1 so we never use #000000 (which is also background); RGB encode.
  const v = idx + 1;
  const r = (v >> 16) & 0xff;
  const g = (v >> 8) & 0xff;
  const b = v & 0xff;
  return `rgb(${r},${g},${b})`;
}

function rgbToIndex(r: number, g: number, b: number): number {
  return ((r << 16) | (g << 8) | b) - 1;
}

export function createMap(
  visibleCanvas: HTMLCanvasElement,
  pickingCanvas: HTMLCanvasElement,
  topology: Topology,
  dataset: Dataset,
  options: { rightGutter?: number } = {},
): MapHandle {
  // Reserved space on the right at base zoom (k=1) so the legend sits over empty area.
  // When zoomed in, the user can pan content across the whole viewport including this strip.
  const rightGutter = options.rightGutter ?? 0;
  const ctx = visibleCanvas.getContext("2d", { alpha: false })!;
  const pickCtx = pickingCanvas.getContext("2d", { alpha: false, willReadFrequently: true })!;

  const countiesGeo = feature(
    topology,
    topology.objects.counties as GeometryCollection,
  ) as FeatureCollection<Polygon | MultiPolygon, { id: string }>;
  const statesMesh = mesh(
    topology,
    topology.objects.states as GeometryCollection,
    (a, b) => a !== b,
  );
  const countyMeshAll = mesh(topology, topology.objects.counties as GeometryCollection);

  // Build entries in dataset's county order so countyIdx aligns with packed array.
  const entries: CountyEntry[] = [];
  const fipsToFeature = new Map<string, Feature<Polygon | MultiPolygon, { id: string }>>();
  for (const f of countiesGeo.features) {
    const fips = String(f.id).padStart(5, "0");
    fipsToFeature.set(fips, f);
  }
  const missingTopo: string[] = [];
  for (let c = 0; c < dataset.nCounties; c++) {
    const fips = dataset.meta.counties[c];
    const f = fipsToFeature.get(fips);
    if (!f) {
      missingTopo.push(fips);
      continue;
    }
    const name = (f.properties as { name?: string }).name ?? `County ${fips}`;
    const state = STATE_NAMES[fips.slice(0, 2)] ?? "";
    entries.push({ fips, name, state, feature: f, pickColor: indexToRgb(c) });
  }
  if (missingTopo.length > 0) {
    console.warn(`Counties in dataset but missing from TopoJSON: ${missingTopo.length}`, missingTopo.slice(0, 10));
  }
  const inTopoNotInDataset: string[] = [];
  for (const fips of fipsToFeature.keys()) {
    if (dataset.countyIndex(fips) === undefined) inTopoNotInDataset.push(fips);
  }
  if (inTopoNotInDataset.length > 0) {
    console.warn(`Counties in TopoJSON but missing from dataset: ${inTopoNotInDataset.length}`, inTopoNotInDataset.slice(0, 10));
  }

  // Reverse map: countyIdx → entry (entries[] is in dataset order minus missing topo)
  const idxToEntry = new Map<number, CountyEntry>();
  for (const e of entries) {
    const c = dataset.countyIndex(e.fips);
    if (c !== undefined) idxToEntry.set(c, e);
  }

  let projection: GeoProjection = geoAlbersUsa();
  let widthCss = 0;
  let heightCss = 0;
  let dprCached = 1;
  let statesPath: Path2D | null = null;
  let countyMeshPath: Path2D | null = null;

  const MIN_ZOOM = 1;
  const MAX_ZOOM = 32;
  let tx = 0;
  let ty = 0;
  let k = 1;

  function clampTransform(t: Transform): Transform {
    const ck = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, t.k));
    // Map content (in base coords) occupies [0, contentW] x [0, contentH].
    // On screen after transform, content spans [tx, tx + ck*contentW] horizontally.
    // Allow panning whenever the scaled content is wider than the viewport;
    // otherwise lock tx so content sits at its natural left-aligned position.
    const contentW = Math.max(1, widthCss - rightGutter);
    const contentH = heightCss;
    const scaledW = ck * contentW;
    const scaledH = ck * contentH;

    let ctx2: number;
    if (scaledW >= widthCss) {
      ctx2 = Math.max(widthCss - scaledW, Math.min(0, t.tx));
    } else {
      ctx2 = 0;
    }
    let cty: number;
    if (scaledH >= heightCss) {
      cty = Math.max(heightCss - scaledH, Math.min(0, t.ty));
    } else {
      cty = 0;
    }
    return { tx: ctx2, ty: cty, k: ck };
  }

  function rebuildPaths() {
    projection = geoAlbersUsa();
    // Fit into the area left of the legend so the initial layout matches the legend overlay.
    const fitW = Math.max(1, widthCss - rightGutter);
    projection.fitSize([fitW, heightCss], countiesGeo);
    const svgPath = geoPath(projection);
    for (const e of entries) {
      e.path = new Path2D(svgPath(e.feature) ?? "");
    }
    statesPath = new Path2D(svgPath(statesMesh) ?? "");
    countyMeshPath = new Path2D(svgPath(countyMeshAll) ?? "");
  }

  function draw(monthIdx: number) {
    ctx.save();
    ctx.scale(dprCached, dprCached);
    ctx.fillStyle = "#838790";
    ctx.fillRect(0, 0, widthCss, heightCss);
    ctx.translate(tx, ty);
    ctx.scale(k, k);

    const lo = Math.floor(monthIdx);
    const hi = Math.min(lo + 1, dataset.nMonths - 1);
    const t = monthIdx - lo;
    const blend = t > 0 && hi !== lo;

    // Pass 1: fills
    for (const [c, e] of idxToEntry) {
      const ba = dataset.bucketAt(lo, c);
      let fill: string;
      if (!blend) {
        fill = bucketColor(ba);
      } else {
        const bb = dataset.bucketAt(hi, c);
        if (ba === bb) {
          fill = bucketColor(ba);
        } else {
          const [r1, g1, b1] = bucketColorRgb(ba);
          const [r2, g2, b2] = bucketColorRgb(bb);
          const r = Math.round(r1 + (r2 - r1) * t);
          const g = Math.round(g1 + (g2 - g1) * t);
          const b = Math.round(b1 + (b2 - b1) * t);
          fill = `rgb(${r},${g},${b})`;
        }
      }
      ctx.fillStyle = fill;
      if (e.path) ctx.fill(e.path);
    }
    // Pass 2: county borders (line width compensated for zoom so it stays ~constant on screen)
    if (countyMeshPath) {
      ctx.lineWidth = 0.5 / k;
      ctx.strokeStyle = "#000";
      ctx.stroke(countyMeshPath);
    }
    // Pass 3: state borders
    if (statesPath) {
      ctx.lineWidth = 1 / k;
      ctx.strokeStyle = "#000";
      ctx.stroke(statesPath);
    }
    ctx.restore();
  }

  function rebuildPicking() {
    pickCtx.save();
    pickCtx.scale(dprCached, dprCached);
    pickCtx.imageSmoothingEnabled = false;
    pickCtx.fillStyle = "#000";
    pickCtx.fillRect(0, 0, widthCss, heightCss);
    for (const [, e] of idxToEntry) {
      pickCtx.fillStyle = e.pickColor;
      if (e.path) pickCtx.fill(e.path);
    }
    pickCtx.restore();
  }

  function resize(width: number, height: number, dpr: number) {
    widthCss = width;
    heightCss = height;
    dprCached = dpr;
    visibleCanvas.width = Math.round(width * dpr);
    visibleCanvas.height = Math.round(height * dpr);
    pickingCanvas.width = Math.round(width * dpr);
    pickingCanvas.height = Math.round(height * dpr);
    rebuildPaths();
    rebuildPicking();
    // Re-clamp current transform against new viewport bounds.
    const c = clampTransform({ tx, ty, k });
    tx = c.tx; ty = c.ty; k = c.k;
  }

  function hitTest(x: number, y: number): number | undefined {
    // Invert the pan/zoom transform so we sample the picking canvas (rendered at base scale).
    const mx = (x - tx) / k;
    const my = (y - ty) / k;
    const px = Math.round(mx * dprCached);
    const py = Math.round(my * dprCached);
    if (px < 0 || py < 0 || px >= pickingCanvas.width || py >= pickingCanvas.height) return undefined;
    const [r, g, b] = pickCtx.getImageData(px, py, 1, 1).data;
    if (r === 0 && g === 0 && b === 0) return undefined;
    const idx = rgbToIndex(r, g, b);
    return idxToEntry.has(idx) ? idx : undefined;
  }

  return {
    resize,
    draw,
    hitTest,
    getCountyName(c) {
      const e = idxToEntry.get(c);
      return e ? `${e.name}, ${e.state}` : undefined;
    },
    getCountyFips(c) {
      return idxToEntry.get(c)?.fips;
    },
    setTransform(t) {
      const c = clampTransform(t);
      tx = c.tx;
      ty = c.ty;
      k = c.k;
      return { tx, ty, k };
    },
    getTransform() {
      return { tx, ty, k };
    },
    getViewport() {
      return { width: widthCss, height: heightCss };
    },
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
  };
}
