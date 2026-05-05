import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");

const src = require.resolve("us-atlas/counties-10m.json");
const dst = join(PUBLIC_DIR, "counties.topo.json");

await mkdir(PUBLIC_DIR, { recursive: true });
await copyFile(src, dst);
console.log(`Copied ${src} → ${dst}`);
