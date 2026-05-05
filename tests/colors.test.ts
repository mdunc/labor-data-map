import { describe, expect, it } from "vitest";
import { BUCKETS, NO_DATA_BUCKET, valueToBucket, bucketColor, bucketLabel } from "../src/colors.ts";

describe("valueToBucket", () => {
  it.each([
    [50, 0],   // Hyper-Growth
    [40, 0],   // boundary: ≥40 = Hyper
    [39.99, 1],// Superstars
    [20, 1],   // boundary
    [19.99, 2],// Keeping Pace
    [10, 2],   // boundary
    [9.99, 3], // Below-trend
    [0, 3],    // boundary: 0 = Below-trend
    [-0.01, 4],// At-risk Contraction
    [-10, 5],  // boundary: -10 = Structural Loss
    [-50, 5],  // Structural Loss
  ])("maps %s%% to bucket %s", (pct, bucket) => {
    expect(valueToBucket(pct)).toBe(bucket);
  });

  it("returns NO_DATA_BUCKET for NaN", () => {
    expect(valueToBucket(Number.NaN)).toBe(NO_DATA_BUCKET);
  });
});

describe("bucketColor / bucketLabel", () => {
  it("returns the configured color for each bucket", () => {
    expect(bucketColor(0)).toBe("#1a9850");
    expect(bucketColor(5)).toBe("#d73027");
    expect(bucketColor(NO_DATA_BUCKET)).toBe("#cccccc");
  });
  it("returns labels for each bucket", () => {
    expect(bucketLabel(0)).toBe("Hyper-Growth");
    expect(bucketLabel(NO_DATA_BUCKET)).toBe("No data");
  });
  it("exposes 6 categorical buckets in BUCKETS", () => {
    expect(BUCKETS).toHaveLength(6);
  });
});
