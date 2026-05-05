# US County Labor Force Map (2006–2025)

An interactive, static-site choropleth showing 20 years of US county-level labor force change vs. January 2006.

Hover any county for its name and current value. Use the timeline at the bottom to play, pause, scrub, and adjust speed. Counties are colored by bucketed % change for the displayed month, from green (Hyper-Growth, > 40%) to red (Structural Loss, < -10%).

## Live site

Deployed via static hosting — see [Deploying](#deploying).

## Development

```sh
npm install
npm run build:topo     # copy us-atlas TopoJSON to public/
npm run build:data     # fetch BLS LAUS, compute, pack to public/
npm run dev            # http://localhost:5173
```

`build:data` makes ~50 MB of HTTP requests against `download.bls.gov` and takes 30–60 s.

## Data refresh

The dataset is a fixed window (Jan 2006 – Dec 2025). To pick up BLS revisions or extend the window:

1. Edit `START` / `END` in `scripts/build-dataset.ts` if extending.
2. Run `npm run build:data`.
3. Run `npm run build` and redeploy.

## Source

- Geometry: [`us-atlas`](https://github.com/topojson/us-atlas) (1:10M).
- Data: BLS [Local Area Unemployment Statistics](https://www.bls.gov/lau/), county-level, NSA labor force series.

## Deploying

```sh
npm run build
```

This runs `tsc -b`, then `vite build`, then copies the data files. Output lands in `dist/`. Upload it to any static host:

- **GitHub Pages:** push `dist/` contents to a `gh-pages` branch (or use the official Pages action).
- **Netlify:** connect the repo with build cmd `npm run build` and publish dir `dist`.
- **S3 + CloudFront:** sync `dist/` to your bucket.

## Tests

```sh
npm test              # full suite
npm run test:watch    # interactive
```

Coverage spans color/bucket logic, the dataset lookup, the BLS parser, the pack module, the playback engine, and an end-to-end render smoke test in jsdom.

## Manual smoke checklist

Before a release, verify in Chrome, Firefox, and Safari:

- [ ] Map paints all states (no missing fills).
- [ ] Intro animation runs once on load.
- [ ] Spacebar toggles play/pause.
- [ ] Scrubbing works smoothly at all speeds (0.5×, 1×, 2×, 4×, 8×).
- [ ] Hovering shows tooltips with sensible values.
- [ ] About modal opens and closes (ⓘ button + backdrop click).
- [ ] Retina rendering looks crisp.

## Project structure

```
src/
  main.ts          app entry; wires everything
  map.ts           canvas renderer + hit-testing
  timeline.ts      playback engine + UI controls
  tooltip.ts       hover tooltip
  legend.ts        legend renderer
  about.ts         about modal
  intro.ts         one-shot intro animation
  data.ts          dataset loader + lookups
  colors.ts        bucket boundaries + colors
  styles.css
scripts/
  build-dataset.ts CLI: fetch BLS, validate, pack
  copy-topojson.ts copy us-atlas to public/
  lib/
    bls.ts         BLS flat-file parsers
    pack.ts        baseline math + binary packing
public/            generated at build time (gitignored)
tests/             Vitest suites
docs/              spec + plan
```
