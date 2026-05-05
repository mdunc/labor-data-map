export interface SeriesRow {
  seriesId: string;
  areaTypeCode: string;
  areaCode: string;
  measureCode: string;
}

export interface DataRow {
  seriesId: string;
  year: number;
  period: string; // e.g. "M01"
  value: number;
}

/** Splits a BLS flat-file line on tabs and trims each cell. */
function splitTabbed(line: string): string[] {
  return line.split("\t").map((s) => s.trim());
}

export function parseSeriesFile(text: string): SeriesRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  // first line is the header
  const out: SeriesRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitTabbed(lines[i]);
    if (cells.length < 4) continue;
    out.push({
      seriesId: cells[0],
      areaTypeCode: cells[1],
      areaCode: cells[2],
      measureCode: cells[3],
    });
  }
  return out;
}

/**
 * Parses la.area into area-code → 5-digit FIPS map.
 * BLS county area codes look like "CN0100100000000" — the FIPS is chars 2..7 (state+county).
 */
export function parseAreaFile(text: string): Map<string, string> {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const out = new Map<string, string>();
  for (let i = 1; i < lines.length; i++) {
    const cells = splitTabbed(lines[i]);
    if (cells.length < 2) continue;
    const [areaTypeCode, areaCode] = cells;
    if (areaTypeCode !== "F") continue;
    if (!areaCode.startsWith("CN") || areaCode.length < 7) continue;
    const fips = areaCode.slice(2, 7);
    out.set(areaCode, fips);
  }
  return out;
}

export function parseDataFile(text: string): DataRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const out: DataRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitTabbed(lines[i]);
    if (cells.length < 4) continue;
    const [seriesId, year, period, value] = cells;
    if (!period.startsWith("M") || period === "M13") continue; // skip annual averages
    const v = Number(value);
    if (!Number.isFinite(v)) continue;
    out.push({ seriesId, year: Number(year), period, value: v });
  }
  return out;
}

/**
 * Returns Map<fips, Map<"YYYY-MM", value>> for labor force (measure 06) at county level (F).
 */
export function joinLaborForceCounty(
  series: SeriesRow[],
  areas: Map<string, string>,
  data: DataRow[],
): Map<string, Map<string, number>> {
  const seriesIdToFips = new Map<string, string>();
  for (const s of series) {
    if (s.measureCode !== "06" || s.areaTypeCode !== "F") continue;
    const fips = areas.get(s.areaCode);
    if (fips) seriesIdToFips.set(s.seriesId, fips);
  }

  const out = new Map<string, Map<string, number>>();
  for (const row of data) {
    const fips = seriesIdToFips.get(row.seriesId);
    if (!fips) continue;
    const month = `${row.year}-${row.period.slice(1).padStart(2, "0")}`;
    let countyMap = out.get(fips);
    if (!countyMap) {
      countyMap = new Map();
      out.set(fips, countyMap);
    }
    countyMap.set(month, row.value);
  }
  return out;
}
