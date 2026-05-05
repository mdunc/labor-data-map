import { PlaybackEngine } from "./timeline.ts";

/**
 * Plays the timeline once at 4× from start to end on first paint, then leaves the
 * playhead at the final month. Subsequent calls do nothing.
 */
export function runIntroOnce(engine: PlaybackEngine): void {
  engine.scrubTo(0);
  engine.setSpeed(4);
  engine.play();
}
