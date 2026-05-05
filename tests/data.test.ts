import { describe, expect, it } from "vitest";
import { Dataset, formatLaborForce, formatPctChange, parseMonthLabel } from "../src/data.ts";

describe("Dataset (month-major layout)", () => {
  const meta = {
    months: ["2006-01", "2006-02", "2006-03"],
    counties: ["01001", "01003", "01005"],
    version: "test",
  };
  // 3 months × 3 counties = 9 bytes
  // m=0: [0, 1, 2], m=1: [3, 4, 5], m=2: [255, 0, 1]
  const buckets = new Uint8Array([0, 1, 2, 3, 4, 5, 255, 0, 1]);

  it("looks up bucket for (monthIdx, countyIdx)", () => {
    const ds = new Dataset(meta, buckets);
    expect(ds.bucketAt(0, 0)).toBe(0);
    expect(ds.bucketAt(0, 2)).toBe(2);
    expect(ds.bucketAt(1, 1)).toBe(4);
    expect(ds.bucketAt(2, 0)).toBe(255);
  });

  it("resolves county FIPS to index", () => {
    const ds = new Dataset(meta, buckets);
    expect(ds.countyIndex("01003")).toBe(1);
    expect(ds.countyIndex("99999")).toBeUndefined();
  });

  it("exposes counts", () => {
    const ds = new Dataset(meta, buckets);
    expect(ds.nMonths).toBe(3);
    expect(ds.nCounties).toBe(3);
  });
});

describe("formatters", () => {
  it("formats labor force with thousands separators", () => {
    expect(formatLaborForce(1234567)).toBe("1,234,567");
  });
  it("formats pct change with sign and one decimal", () => {
    expect(formatPctChange(34.234)).toBe("+34.2%");
    expect(formatPctChange(-5)).toBe("-5.0%");
    expect(formatPctChange(0)).toBe("+0.0%");
  });
  it("parses YYYY-MM month labels to a human label", () => {
    expect(parseMonthLabel("2006-01")).toBe("January 2006");
    expect(parseMonthLabel("2025-12")).toBe("December 2025");
  });
});
