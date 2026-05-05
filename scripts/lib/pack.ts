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
 * - Baseline = first entry in `months` (e.g., "2010-01"). Counties without a baseline value
 *   are marked NO_DATA_BUCKET for every month.
 * - Layout is month-major: index = monthIdx * nCounties + countyIdx
 * - If `month0Comparison` is provided (e.g. "2006-01"), the first month's % change is
 *   computed against that prior month rather than the baseline. This lets the initial
 *   frame show pre-window context (e.g. recession impact) instead of a flat 0%. Counties
 *   missing the prior value at month 0 fall back to 0% (bucket 3).
 */
export function packDataset(
  series: Map<string, Map<string, number>>,
  months: string[],
  version: string,
  month0Comparison?: string,
): PackResult {
  const counties = [...series.keys()].sort();
  const nMonths = months.length;
  const nCounties = counties.length;
  const buckets = new Uint8Array(nMonths * nCounties);
  const values = new Float32Array(nMonths * nCounties);

  const baselineMonth = months[0];

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

    // Month 0: optionally compare against an earlier reference month.
    if (month0Comparison) {
      const prior = countyMap.get(month0Comparison);
      const offset = c;
      if (prior === undefined || prior <= 0) {
        buckets[offset] = valueToBucket(0);
        values[offset] = 0;
      } else {
        const pct = ((baseline - prior) / prior) * 100;
        buckets[offset] = valueToBucket(pct);
        values[offset] = pct;
      }
    } else {
      // Default: month 0 vs. itself = 0%
      buckets[c] = valueToBucket(0);
      values[c] = 0;
    }

    // Months 1+ always compare against the in-window baseline.
    for (let m = 1; m < nMonths; m++) {
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
    meta: {
      months,
      counties,
      version,
      ...(month0Comparison ? { month0Comparison } : {}),
    },
    buckets,
    values,
  };
}
