import { PlaybackEngine } from "./timeline.ts";

let hasRun = false;

/**
 * Plays the timeline once from start to end on first paint at the engine's
 * default 1× speed. Subsequent calls do nothing.
 */
export function runIntroOnce(engine: PlaybackEngine): void {
  if (hasRun) return;
  hasRun = true;
  engine.scrubTo(0);
  engine.play();
}
