export type BucketIndex = 0 | 1 | 2 | 3 | 4 | 5;

export interface Bucket {
  index: BucketIndex;
  label: string;
  color: string;
  /** Inclusive lower bound; -Infinity if open-ended. */
  lower: number;
  /** Exclusive upper bound; Infinity if open-ended. */
  upper: number;
}

export const BUCKETS: readonly Bucket[] = [
  { index: 0, label: "Hyper-Growth",        color: "#1a9850", lower: 40,  upper: Infinity },
  { index: 1, label: "Superstars",          color: "#66bd63", lower: 20,  upper: 40 },
  { index: 2, label: "Keeping Pace",        color: "#a6d96a", lower: 10,  upper: 20 },
  { index: 3, label: "Below-trend Growth",  color: "#fdae61", lower: 0,   upper: 10 },
  { index: 4, label: "At-risk Contraction", color: "#f46d43", lower: -10, upper: 0 },
  { index: 5, label: "Structural Loss",     color: "#d73027", lower: -Infinity, upper: -10 },
] as const;

export const NO_DATA_BUCKET = 255;
export const NO_DATA_COLOR = "#cccccc";
export const NO_DATA_LABEL = "No data";

export function valueToBucket(pct: number): BucketIndex | typeof NO_DATA_BUCKET {
  if (!Number.isFinite(pct)) return NO_DATA_BUCKET;
  for (const b of BUCKETS) {
    if (pct >= b.lower && pct < b.upper) return b.index;
  }
  return NO_DATA_BUCKET;
}

export function bucketColor(idx: number): string {
  if (idx === NO_DATA_BUCKET) return NO_DATA_COLOR;
  return BUCKETS[idx]?.color ?? NO_DATA_COLOR;
}

export function bucketLabel(idx: number): string {
  if (idx === NO_DATA_BUCKET) return NO_DATA_LABEL;
  return BUCKETS[idx]?.label ?? NO_DATA_LABEL;
}
