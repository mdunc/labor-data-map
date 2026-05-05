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

/** How many years back each month's % change is computed against. */
export const LOOKBACK_YEARS = 20;

function lookbackMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return `${Number(y) - LOOKBACK_YEARS}-${m}`;
}

/**
 * Builds a packed dataset from county labor-force series.
 * - Every month's % change is computed vs. the same month `LOOKBACK_YEARS` years earlier
 *   (a rolling 20-year window). The lookback month must exist in the source series; it
 *   does not need to appear in `months`.
 * - Months whose lookback value is missing or non-positive are marked NO_DATA_BUCKET.
 * - Layout is month-major: index = monthIdx * nCounties + countyIdx
 */
export function packDataset(
  series: Map<string, Map<string, number>>,
  months: string[],
  version: string,
): PackResult {
  const counties = [...series.keys()].sort();
  const nMonths = months.length;
  const nCounties = counties.length;
  const buckets = new Uint8Array(nMonths * nCounties);
  const values = new Float32Array(nMonths * nCounties);

  for (let c = 0; c < nCounties; c++) {
    const fips = counties[c];
    const countyMap = series.get(fips)!;
    for (let m = 0; m < nMonths; m++) {
      const ym = months[m];
      const v = countyMap.get(ym);
      const base = countyMap.get(lookbackMonth(ym));
      const offset = m * nCounties + c;
      if (v === undefined || base === undefined || base <= 0) {
        buckets[offset] = NO_DATA_BUCKET;
        values[offset] = Number.NaN;
      } else {
        const pct = ((v - base) / base) * 100;
        buckets[offset] = valueToBucket(pct);
        values[offset] = pct;
      }
    }
  }

  return {
    meta: { months, counties, version },
    buckets,
    values,
  };
}
