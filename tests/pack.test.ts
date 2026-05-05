import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSeriesFile, parseAreaFile, parseDataFile, joinLaborForceCounty } from "../scripts/lib/bls.ts";
import { buildMonthList, packDataset } from "../scripts/lib/pack.ts";

const fix = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("BLS parsers", () => {
  it("parses la.series and keeps only county labor force", () => {
    const rows = parseSeriesFile(fix("la.series.sample.txt"));
    const lf = rows.filter((r) => r.measureCode === "06" && r.areaTypeCode === "F");
    expect(lf).toHaveLength(2);
    expect(lf[0].seriesId).toBe("LAUCN010010000000006");
  });

  it("parses la.area into area-code → FIPS map", () => {
    const map = parseAreaFile(fix("la.area.sample.txt"));
    expect(map.get("CN0100100000000")).toBe("01001");
    expect(map.get("CN0100300000000")).toBe("01003");
  });

  it("parses la.data into time-series rows", () => {
    const rows = parseDataFile(fix("la.data.sample.txt"));
    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual({
      seriesId: "LAUCN010010000000006",
      year: 2006,
      period: "M01",
      value: 20000,
    });
  });

  it("joins everything into county labor force time series", () => {
    const series = parseSeriesFile(fix("la.series.sample.txt"));
    const areas = parseAreaFile(fix("la.area.sample.txt"));
    const data = parseDataFile(fix("la.data.sample.txt"));
    const joined = joinLaborForceCounty(series, areas, data);
    expect(joined.get("01001")?.get("2006-01")).toBe(20000);
    expect(joined.get("01003")?.get("2006-03")).toBe(49000);
  });
});

describe("buildMonthList", () => {
  it("emits all months in [start, end] inclusive", () => {
    const months = buildMonthList("2006-01", "2006-04");
    expect(months).toEqual(["2006-01", "2006-02", "2006-03", "2006-04"]);
  });
  it("spans 240 months for the full window", () => {
    expect(buildMonthList("2006-01", "2025-12")).toHaveLength(240);
  });
});

describe("packDataset", () => {
  it("computes pct_change vs the first month and packs buckets month-major", () => {
    // 2 counties, 3 months
    const series = new Map<string, Map<string, number>>([
      ["01001", new Map([["2006-01", 100], ["2006-02", 110], ["2006-03", 150]])],
      ["02001", new Map([["2006-01", 200], ["2006-02", 180], ["2006-03", 100]])],
    ]);
    const months = ["2006-01", "2006-02", "2006-03"];
    const { meta, buckets, values } = packDataset(series, months, "test");
    expect(meta.months).toEqual(months);
    expect(meta.counties).toEqual(["01001", "02001"]);
    // m=0 baseline: every county is 0% → bucket 3 (Below-trend)
    expect(buckets[0]).toBe(3); // 01001 @ 2006-01: 0%
    expect(buckets[1]).toBe(3); // 02001 @ 2006-01: 0%
    // m=1: 01001 = +10% → bucket 2 (Keeping Pace); 02001 = -10% → bucket 4 (At-risk Contraction, [-10, 0))
    expect(buckets[2]).toBe(2);
    expect(buckets[3]).toBe(4);
    // m=2: 01001 = +50% → bucket 0 (Hyper); 02001 = -50% → bucket 5 (Structural Loss)
    expect(buckets[4]).toBe(0);
    expect(buckets[5]).toBe(5);
    // values are raw pct_change in same layout
    expect(values[0]).toBeCloseTo(0);
    expect(values[2]).toBeCloseTo(10);
    expect(values[3]).toBeCloseTo(-10);
  });

  it("marks counties with no baseline as 255 across all months", () => {
    const series = new Map<string, Map<string, number>>([
      ["09001", new Map([["2006-02", 100]])], // no Jan baseline
    ]);
    const months = ["2006-01", "2006-02"];
    const { buckets } = packDataset(series, months, "test");
    expect(buckets[0]).toBe(255);
    expect(buckets[1]).toBe(255);
  });

  it("marks individual missing months as 255", () => {
    const series = new Map<string, Map<string, number>>([
      ["01001", new Map([["2006-01", 100], ["2006-03", 150]])],
    ]);
    const months = ["2006-01", "2006-02", "2006-03"];
    const { buckets } = packDataset(series, months, "test");
    expect(buckets[0]).toBe(3); // baseline month: 0% → bucket 3
    expect(buckets[1]).toBe(255); // missing month
    expect(buckets[2]).toBe(0); // +50% → Hyper
  });

  it("supports a baselineMonth outside the timeline window", () => {
    // Window = [2010-01, 2010-02]; baseline = 2006-01 (earlier than window).
    const series = new Map<string, Map<string, number>>([
      // 01001: 2006=80, 2010-01=100 (+25%), 2010-02=120 (+50%)
      ["01001", new Map([["2006-01", 80], ["2010-01", 100], ["2010-02", 120]])],
      // 02001: 2006=200, 2010-01=100 (-50%), 2010-02=180 (-10%)
      ["02001", new Map([["2006-01", 200], ["2010-01", 100], ["2010-02", 180]])],
      // 03001: missing 2006 baseline → entire row marked NO_DATA
      ["03001", new Map([["2010-01", 100], ["2010-02", 105]])],
    ]);
    const months = ["2010-01", "2010-02"];
    const { meta, buckets, values } = packDataset(series, months, "test", "2006-01");
    expect(meta.baselineMonth).toBe("2006-01");
    // 01001: every month vs. 80
    expect(values[0]).toBeCloseTo(25);   // bucket 1 (Superstars)
    expect(buckets[0]).toBe(1);
    expect(values[3]).toBeCloseTo(50);   // bucket 0 (Hyper-Growth, ≥40)
    expect(buckets[3]).toBe(0);
    // 02001: every month vs. 200
    expect(values[1]).toBeCloseTo(-50);  // bucket 5 (Structural Loss, <-10)
    expect(buckets[1]).toBe(5);
    expect(values[4]).toBeCloseTo(-10);  // bucket 4 (At-risk, [-10, 0))
    expect(buckets[4]).toBe(4);
    // 03001: no baseline → all months are NO_DATA (255)
    expect(buckets[2]).toBe(255);
    expect(buckets[5]).toBe(255);
  });
});
