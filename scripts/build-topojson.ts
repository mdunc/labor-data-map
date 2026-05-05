import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mapshaper from "mapshaper";

// Census Bureau cartographic boundary files (1:5,000,000 generalized).
// The 2024 vintage includes Connecticut's 9 planning regions (FIPS 09110–09190),
// which replaced the 8 historical counties (09001–09015) for federal statistical
// reporting starting in 2022. The us-atlas npm package is still on the older
// vintage and won't ever match BLS LAUS county codes for CT.
const CENSUS_BASE = "https://www2.census.gov/geo/tiger/GENZ2024/shp";
const COUNTY_ZIP = "cb_2024_us_county_5m.zip";
const STATE_ZIP = "cb_2024_us_state_5m.zip";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");
const OUT = join(PUBLIC_DIR, "counties.topo.json");

async function downloadZip(name: string, dest: string): Promise<void> {
  const url = `${CENSUS_BASE}/${name}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "labor-force-map (mark@nimbus-solutions.co.jp)" },
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  console.log(`  ${name}: ${(buf.byteLength / 1024).toFixed(0)} KB`);
}

async function main() {
  const work = await mkdir(join(tmpdir(), `topo-${Date.now()}`), { recursive: true });
  if (!work) throw new Error("failed to create temp dir");
  const countyZip = join(work, COUNTY_ZIP);
  const stateZip = join(work, STATE_ZIP);

  console.log("Downloading Census 2024 cartographic boundaries…");
  await Promise.all([downloadZip(COUNTY_ZIP, countyZip), downloadZip(STATE_ZIP, stateZip)]);

  // Build a single topojson with three named objects (counties, states, nation),
  // matching the layout that map.ts already consumes from us-atlas.
  // - GEOID is the FIPS code (5-digit county, 2-digit state); we promote it to the
  //   topojson `id` field so existing code (`feature.id`) keeps working unchanged.
  // - Visvalingam 5% simplification produces a file roughly comparable in size to
  //   us-atlas/counties-10m (~840 KB).
  const cmd = [
    `-i ${countyZip} name=counties`,
    `-i ${stateZip} name=states`,
    "-simplify visvalingam 3% keep-shapes",
    // Build a nation layer by dissolving all state polygons together.
    "-dissolve2 target=states + name=nation",
    // Match us-atlas property shape: each feature carries only `name`. GEOID is
    // promoted to the topojson `id` at output time, so we keep it on the way in
    // and drop it explicitly afterwards.
    "-rename-fields target=counties name=NAME",
    "-filter-fields target=counties name,GEOID",
    "-rename-fields target=states name=NAME",
    "-filter-fields target=states name,GEOID",
    "-filter-fields target=nation",
    `-o ${OUT} format=topojson id-field=GEOID target=counties,states,nation`,
    // mapshaper's id-field copies the field to topojson id but doesn't remove it
    // from properties — strip it post-write so feature.properties stays minimal.
  ].join(" ");

  console.log("Converting to TopoJSON…");
  await mapshaper.runCommands(cmd);

  // mapshaper's id-field copies the value to topojson `id` but leaves it in
  // properties. Strip it so feature.properties matches the lean us-atlas shape.
  const topo = JSON.parse(await readFile(OUT, "utf8"));
  for (const obj of Object.values(topo.objects) as { geometries?: { properties?: Record<string, unknown> }[] }[]) {
    for (const g of obj.geometries ?? []) {
      if (g.properties) delete g.properties.GEOID;
    }
  }
  await writeFile(OUT, JSON.stringify(topo));

  console.log(`Wrote ${OUT}`);
  await rm(work, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
