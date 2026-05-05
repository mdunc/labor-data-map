import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseSeriesFile,
  parseAreaFile,
  parseDataFile,
  joinLaborForceCounty,
} from "./lib/bls.ts";
import { buildMonthList, packDataset } from "./lib/pack.ts";

const BLS_BASE = "https://download.bls.gov/pub/time.series/la";
const FILES = ["la.series", "la.area", "la.data.64.County"];

const START = "2010-01";
const END = "2025-12";
const BASELINE = "2006-01";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "labor-force-map (mark@nimbus-solutions.co.jp)" },
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return await res.text();
}

async function main() {
  console.log(`Fetching ${FILES.length} BLS files…`);
  const [seriesTxt, areaTxt, dataTxt] = await Promise.all(
    FILES.map((f) => fetchText(`${BLS_BASE}/${f}`)),
  );

  console.log("Parsing…");
  const series = parseSeriesFile(seriesTxt);
  const areas = parseAreaFile(areaTxt);
  const data = parseDataFile(dataTxt);
  console.log(`  series rows: ${series.length}`);
  console.log(`  area rows:   ${areas.size}`);
  console.log(`  data rows:   ${data.length}`);

  const joined = joinLaborForceCounty(series, areas, data);
  console.log(`  counties:    ${joined.size}`);

  const months = buildMonthList(START, END);
  const version = new Date().toISOString().slice(0, 10);
  const { meta, buckets, values } = packDataset(joined, months, version, BASELINE);

  // Validate
  if (meta.counties.length < 3000) {
    throw new Error(`Too few counties: ${meta.counties.length} (expected ~3,143)`);
  }
  if (meta.months.length !== 192) {
    throw new Error(`Expected 192 months, got ${meta.months.length}`);
  }
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    if (!(b >= 0 && b <= 5) && b !== 255) {
      throw new Error(`Invalid bucket value ${b} at offset ${i}`);
    }
  }

  await mkdir(PUBLIC_DIR, { recursive: true });
  await writeFile(join(PUBLIC_DIR, "meta.json"), JSON.stringify(meta));
  await writeFile(join(PUBLIC_DIR, "buckets.bin"), buckets);
  await writeFile(join(PUBLIC_DIR, "values.bin"), Buffer.from(values.buffer));

  console.log(`Wrote meta.json (${meta.counties.length} counties × ${meta.months.length} months)`);
  console.log(`Wrote buckets.bin (${buckets.byteLength} bytes)`);
  console.log(`Wrote values.bin (${values.byteLength} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
