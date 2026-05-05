export interface Meta {
  months: string[];     // "YYYY-MM" in chronological order
  counties: string[];   // 5-digit FIPS in fixed order
  version: string;
  /** Month every value is compared against. May or may not appear in `months`. */
  baselineMonth?: string;
}

export class Dataset {
  readonly nMonths: number;
  readonly nCounties: number;
  private readonly fipsToIndex: Map<string, number>;

  constructor(
    public readonly meta: Meta,
    public readonly buckets: Uint8Array,
    public readonly values?: Float32Array,
  ) {
    this.nMonths = meta.months.length;
    this.nCounties = meta.counties.length;
    if (buckets.length !== this.nMonths * this.nCounties) {
      throw new Error(
        `buckets size mismatch: got ${buckets.length}, expected ${this.nMonths * this.nCounties}`,
      );
    }
    this.fipsToIndex = new Map(meta.counties.map((f, i) => [f, i]));
  }

  bucketAt(monthIdx: number, countyIdx: number): number {
    return this.buckets[monthIdx * this.nCounties + countyIdx];
  }

  valueAt(monthIdx: number, countyIdx: number): number | undefined {
    if (!this.values) return undefined;
    const v = this.values[monthIdx * this.nCounties + countyIdx];
    return Number.isFinite(v) ? v : undefined;
  }

  countyIndex(fips: string): number | undefined {
    return this.fipsToIndex.get(fips);
  }
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function parseMonthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

export function formatLaborForce(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatPctChange(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export async function loadDataset(baseUrl = "."): Promise<Dataset> {
  const [metaRes, bucketsRes] = await Promise.all([
    fetch(`${baseUrl}/meta.json`),
    fetch(`${baseUrl}/buckets.bin`),
  ]);
  if (!metaRes.ok) throw new Error(`meta.json fetch failed: ${metaRes.status}`);
  if (!bucketsRes.ok) throw new Error(`buckets.bin fetch failed: ${bucketsRes.status}`);
  const meta = (await metaRes.json()) as Meta;
  const buckets = new Uint8Array(await bucketsRes.arrayBuffer());
  return new Dataset(meta, buckets);
}

export async function loadValues(dataset: Dataset, baseUrl = "."): Promise<void> {
  const res = await fetch(`${baseUrl}/values.bin`);
  if (!res.ok) throw new Error(`values.bin fetch failed: ${res.status}`);
  const values = new Float32Array(await res.arrayBuffer());
  // mutate the dataset to attach values
  (dataset as { values?: Float32Array }).values = values;
}
