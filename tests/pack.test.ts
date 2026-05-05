import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSeriesFile, parseAreaFile, parseDataFile, joinLaborForceCounty } from "../scripts/lib/bls.ts";

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
