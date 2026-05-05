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
  it("computes 20-year pct_change and packs buckets month-major", () => {
    // 2 counties; timeline = Jan 2010, Feb 2010. Source includes Jan/Feb 1990 (20y prior).
    const series = new Map<string, Map<string, number>>([
      // 01001: Jan 1990=100, Jan 2010=110 (+10%); Feb 1990=100, Feb 2010=150 (+50%)
      ["01001", new Map([
        ["1990-01", 100], ["1990-02", 100],
        ["2010-01", 110], ["2010-02", 150],
      ])],
      // 02001: Jan 1990=200, Jan 2010=180 (-10%); Feb 1990=200, Feb 2010=100 (-50%)
      ["02001", new Map([
        ["1990-01", 200], ["1990-02", 200],
        ["2010-01", 180], ["2010-02", 100],
      ])],
    ]);
    const months = ["2010-01", "2010-02"];
    const { meta, buckets, values } = packDataset(series, months, "test");
    expect(meta.months).toEqual(months);
    expect(meta.counties).toEqual(["01001", "02001"]);
    // -10 is the inclusive lower bound of bucket 4 ([-10, 0)) so -10 → bucket 4.
    expect(buckets[0]).toBe(2);          // 01001 +10% → Keeping Pace
    expect(buckets[1]).toBe(4);          // 02001 -10% → At-risk Contraction
    expect(buckets[2]).toBe(0);          // 01001 +50% → Hyper-Growth
    expect(buckets[3]).toBe(5);          // 02001 -50% → Structural Loss
    expect(values[0]).toBeCloseTo(10);
    expect(values[1]).toBeCloseTo(-10);
    expect(values[2]).toBeCloseTo(50);
    expect(values[3]).toBeCloseTo(-50);
  });

  it("marks months as 255 when the 20-year-ago value is missing", () => {
    const series = new Map<string, Map<string, number>>([
      // No 1990 data, so 2010 has no lookback base.
      ["09001", new Map([["2010-01", 100], ["2010-02", 110]])],
    ]);
    const months = ["2010-01", "2010-02"];
    const { buckets } = packDataset(series, months, "test");
    expect(buckets[0]).toBe(255);
    expect(buckets[1]).toBe(255);
  });

  it("marks individual missing months as 255", () => {
    const series = new Map<string, Map<string, number>>([
      ["01001", new Map([
        ["1990-01", 100], ["1990-02", 100], ["1990-03", 100],
        ["2010-01", 110],
        // 2010-02 missing
        ["2010-03", 150],
      ])],
    ]);
    const months = ["2010-01", "2010-02", "2010-03"];
    const { buckets } = packDataset(series, months, "test");
    expect(buckets[0]).toBe(2);   // +10% → Keeping Pace
    expect(buckets[1]).toBe(255); // missing current month
    expect(buckets[2]).toBe(0);   // +50% → Hyper-Growth
  });

  it("uses the 20-year-ago value even when it lies outside the timeline window", () => {
    // Window = [2010-01, 2010-02]; bases = 1990-01, 1990-02 (outside the window).
    const series = new Map<string, Map<string, number>>([
      ["01001", new Map([
        ["1990-01", 80], ["1990-02", 80],
        ["2010-01", 100], ["2010-02", 120],
      ])],
      // 03001: no 1990 data → both months NO_DATA
      ["03001", new Map([["2010-01", 100], ["2010-02", 105]])],
    ]);
    const months = ["2010-01", "2010-02"];
    const { buckets, values } = packDataset(series, months, "test");
    // Layout is month-major with 2 counties (01001=0, 03001=1):
    //   offset = monthIdx * 2 + countyIdx
    // 01001: Jan 2010 = 100/80 = +25%; Feb 2010 = 120/80 = +50%
    expect(values[0]).toBeCloseTo(25);  // 01001 @ Jan 2010
    expect(buckets[0]).toBe(1);         // Superstars [20,40)
    expect(values[2]).toBeCloseTo(50);  // 01001 @ Feb 2010
    expect(buckets[2]).toBe(0);         // Hyper-Growth [40, ∞)
    // 03001 has no lookback base for either month
    expect(buckets[1]).toBe(255);       // 03001 @ Jan 2010
    expect(buckets[3]).toBe(255);       // 03001 @ Feb 2010
  });
});
