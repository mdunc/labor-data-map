import { describe, expect, it, vi } from "vitest";
import { PlaybackEngine } from "../src/timeline.ts";

describe("PlaybackEngine", () => {
  it("starts at month 0", () => {
    const cb = vi.fn();
    const eng = new PlaybackEngine({ nMonths: 240, monthsPerSecondAt1x: 4, onTick: cb });
    expect(eng.month).toBe(0);
  });

  it("advances by speed × dt during play", () => {
    const cb = vi.fn();
    const eng = new PlaybackEngine({ nMonths: 240, monthsPerSecondAt1x: 4, onTick: cb });
    eng.setSpeed(2); // 2× → 8 months/sec
    eng.play();
    eng._tick(0);     // first tick anchors time
    eng._tick(0.5);   // 0.5s later → +4 months
    expect(eng.month).toBeCloseTo(4);
  });

  it("stops at the last month and pauses", () => {
    const cb = vi.fn();
    const eng = new PlaybackEngine({ nMonths: 240, monthsPerSecondAt1x: 4, onTick: cb });
    eng.setSpeed(8);
    eng.play();
    eng._tick(0);
    eng._tick(100); // way past end
    expect(eng.month).toBe(239);
    expect(eng.isPlaying).toBe(false);
  });

  it("clamps scrub to [0, nMonths-1]", () => {
    const cb = vi.fn();
    const eng = new PlaybackEngine({ nMonths: 240, monthsPerSecondAt1x: 4, onTick: cb });
    eng.scrubTo(-50);
    expect(eng.month).toBe(0);
    eng.scrubTo(9999);
    expect(eng.month).toBe(239);
  });

  it("scrubbing pauses playback", () => {
    const cb = vi.fn();
    const eng = new PlaybackEngine({ nMonths: 240, monthsPerSecondAt1x: 4, onTick: cb });
    eng.play();
    expect(eng.isPlaying).toBe(true);
    eng.scrubTo(50);
    expect(eng.isPlaying).toBe(false);
    expect(eng.month).toBe(50);
  });

  it("calls onTick whenever month changes", () => {
    const cb = vi.fn();
    const eng = new PlaybackEngine({ nMonths: 240, monthsPerSecondAt1x: 4, onTick: cb });
    eng.scrubTo(10);
    eng.scrubTo(10); // no change
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("notifies onTick when playback ends mid-frame on the last month", () => {
    // Regression: the play/pause button is updated by the UI in response to
    // onTick. If the final tick clamps _month to nMonths-1 without changing
    // the rounded month, the engine flips _playing→false silently and the
    // button is left showing "pause".
    const cb = vi.fn();
    const eng = new PlaybackEngine({ nMonths: 10, monthsPerSecondAt1x: 1, onTick: cb });
    eng.play();
    eng._tick(0);    // anchor
    eng._tick(8.6);  // before=0, after=9 → fires
    cb.mockClear();
    eng._tick(9.5);  // _month clamped 9, _playing→false, before=9, after=9
    expect(eng.isPlaying).toBe(false);
    expect(cb).toHaveBeenCalled();
  });
});
