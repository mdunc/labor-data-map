/**
 * Boots the renderer with a fixture dataset + tiny topology in jsdom and asserts
 * that draw() executes without throwing and county names resolve.
 *
 * jsdom's canvas does not actually rasterize, so we cannot assert on hit-testing
 * here — that is verified manually in the dev server.
 */
import { describe, expect, it } from "vitest";
import { topology as buildTopology } from "topojson-server";
import type { FeatureCollection, Polygon } from "geojson";
import { Dataset, type Meta } from "../src/data.ts";
import { createMap } from "../src/map.ts";

// jsdom does not implement Path2D or a working CanvasRenderingContext2D.
// Provide just enough stub so createMap()/resize()/draw() do not throw.
if (typeof (globalThis as { Path2D?: unknown }).Path2D === "undefined") {
  (globalThis as { Path2D: unknown }).Path2D = class {
    constructor(_d?: string) {}
  };
}
const stubCtx = new Proxy(
  {
    canvas: null as HTMLCanvasElement | null,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    imageSmoothingEnabled: true,
  },
  {
    get(target, prop) {
      if (prop in target) return (target as Record<string, unknown>)[prop as string];
      if (prop === "getImageData") {
        return () => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) });
      }
      return () => {};
    },
    set(target, prop, value) {
      (target as Record<string, unknown>)[prop as string] = value;
      return true;
    },
  },
);
HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
  (stubCtx as unknown as { canvas: HTMLCanvasElement }).canvas = this;
  return stubCtx as unknown as CanvasRenderingContext2D;
} as typeof HTMLCanvasElement.prototype.getContext;

function makeFixtureTopology() {
  const counties: FeatureCollection<Polygon, { name: string }> = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "01001",
        properties: { name: "Autauga" },
        geometry: { type: "Polygon", coordinates: [[[-87, 32], [-86, 32], [-86, 33], [-87, 33], [-87, 32]]] },
      },
      {
        type: "Feature",
        id: "01003",
        properties: { name: "Baldwin" },
        geometry: { type: "Polygon", coordinates: [[[-88, 30], [-87, 30], [-87, 31], [-88, 31], [-88, 30]]] },
      },
      {
        type: "Feature",
        id: "01005",
        properties: { name: "Barbour" },
        geometry: { type: "Polygon", coordinates: [[[-86, 31], [-85, 31], [-85, 32], [-86, 32], [-86, 31]]] },
      },
    ],
  };
  const states: FeatureCollection<Polygon, { name: string }> = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "01",
        properties: { name: "Alabama" },
        geometry: { type: "Polygon", coordinates: [[[-88, 30], [-85, 30], [-85, 33], [-88, 33], [-88, 30]]] },
      },
    ],
  };
  return buildTopology({ counties, states });
}

function makeDataset(): Dataset {
  const meta: Meta = {
    months: ["2006-01", "2006-02"],
    counties: ["01001", "01003", "01005"],
    version: "test",
  };
  // m=0 baseline (all 0% → bucket 3); m=1 +50% → bucket 0
  const buckets = new Uint8Array([3, 3, 3, 0, 0, 0]);
  return new Dataset(meta, buckets);
}

describe("integration smoke", () => {
  it("renders without throwing for both months", () => {
    const visible = document.createElement("canvas");
    const picking = document.createElement("canvas");
    const ds = makeDataset();
    const topo = makeFixtureTopology();
    const map = createMap(visible, picking, topo as unknown as Parameters<typeof createMap>[2], ds);
    map.resize(400, 300, 1);
    expect(() => map.draw(0)).not.toThrow();
    expect(() => map.draw(1)).not.toThrow();
  });

  it("returns county names in the form 'Name, ST'", () => {
    const visible = document.createElement("canvas");
    const picking = document.createElement("canvas");
    const ds = makeDataset();
    const topo = makeFixtureTopology();
    const map = createMap(visible, picking, topo as unknown as Parameters<typeof createMap>[2], ds);
    map.resize(400, 300, 1);
    expect(map.getCountyName(0)).toMatch(/, AL$/);
  });
});
