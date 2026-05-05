import { valueToBucket, NO_DATA_BUCKET } from "../../src/colors.ts";
import type { Meta } from "../../src/data.ts";

export function buildMonthList(startYM: string, endYM: string): string[] {
  const [sy, sm] = startYM.split("-").map(Number);
  const [ey, em] = endYM.split("-").map(Number);
  const out: string[] = [];
  for (let y = sy; y <= ey; y++) {
    const mFrom = y === sy ? sm : 1;
    const mTo = y === ey ? em : 12;
    for (let m = mFrom; m <= mTo; m++) {
      out.push(`${y}-${String(m).padStart(2, "0")}`);
    }
  }
  return out;
}

export interface PackResult {
  meta: Meta;
  buckets: Uint8Array;
  values: Float32Array;
}

/**
 * Builds a packed dataset from county labor-force series.
 * - Every month's % change is computed against `baselineMonth` (default: months[0]).
 *   The baseline does not have to appear in `months` — it can be an earlier month
 *   that exists in the source series but lies before the timeline window.
 * - Counties without a baseline value are marked NO_DATA_BUCKET for every month.
 * - Layout is month-major: index = monthIdx * nCounties + countyIdx
 */
export function packDataset(
  series: Map<string, Map<string, number>>,
  months: string[],
  version: string,
  baselineMonth: string = months[0],
): PackResult {
  const counties = [...series.keys()].sort();
  const nMonths = months.length;
  const nCounties = counties.length;
  const buckets = new Uint8Array(nMonths * nCounties);
  const values = new Float32Array(nMonths * nCounties);

  for (let c = 0; c < nCounties; c++) {
    const fips = counties[c];
    const countyMap = series.get(fips)!;
    const baseline = countyMap.get(baselineMonth);
    if (baseline === undefined || baseline <= 0) {
      // mark whole row as missing
      for (let m = 0; m < nMonths; m++) {
        buckets[m * nCounties + c] = NO_DATA_BUCKET;
        values[m * nCounties + c] = Number.NaN;
      }
      continue;
    }
    for (let m = 0; m < nMonths; m++) {
      const v = countyMap.get(months[m]);
      const offset = m * nCounties + c;
      if (v === undefined) {
        buckets[offset] = NO_DATA_BUCKET;
        values[offset] = Number.NaN;
      } else {
        const pct = ((v - baseline) / baseline) * 100;
        buckets[offset] = valueToBucket(pct);
        values[offset] = pct;
      }
    }
  }

  return {
    meta: { months, counties, version, baselineMonth },
    buckets,
    values,
  };
}
