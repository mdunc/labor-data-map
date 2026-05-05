import { parseMonthLabel } from "./data.ts";

export interface PlaybackEngineOptions {
  nMonths: number;
  monthsPerSecondAt1x: number;
  onTick: (monthIdx: number) => void;
}

export class PlaybackEngine {
  private _month = 0;
  private _speed = 1;
  private _playing = false;
  private _lastTime: number | null = null;
  private rafHandle: number | null = null;
  readonly nMonths: number;
  private monthsPerSecondAt1x: number;
  private onTick: (m: number) => void;

  constructor(opts: PlaybackEngineOptions) {
    this.nMonths = opts.nMonths;
    this.monthsPerSecondAt1x = opts.monthsPerSecondAt1x;
    this.onTick = opts.onTick;
  }

  get month(): number { return Math.round(this._month); }
  get speed(): number { return this._speed; }
  get isPlaying(): boolean { return this._playing; }

  setSpeed(s: number) { this._speed = s; }

  play() {
    if (this._month >= this.nMonths - 1) this._month = 0;
    this._playing = true;
    this._lastTime = null;
    this.scheduleFrame();
  }

  pause() {
    this._playing = false;
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  scrubTo(monthIdx: number) {
    this.pause();
    const clamped = Math.max(0, Math.min(this.nMonths - 1, Math.round(monthIdx)));
    if (clamped !== Math.round(this._month)) {
      this._month = clamped;
      this.onTick(clamped);
    } else {
      this._month = clamped;
    }
  }

  private scheduleFrame() {
    if (typeof requestAnimationFrame === "undefined") return;
    this.rafHandle = requestAnimationFrame((t) => this._tick(t / 1000));
  }

  /** Test-friendly tick: takes seconds since some origin. */
  _tick(nowSec: number) {
    if (!this._playing) return;
    if (this._lastTime === null) {
      this._lastTime = nowSec;
      this.scheduleFrame();
      return;
    }
    const dt = nowSec - this._lastTime;
    this._lastTime = nowSec;
    const before = Math.round(this._month);
    this._month += dt * this.monthsPerSecondAt1x * this._speed;
    if (this._month >= this.nMonths - 1) {
      this._month = this.nMonths - 1;
      this._playing = false;
    }
    const after = Math.round(this._month);
    if (after !== before) this.onTick(after);
    if (this._playing) this.scheduleFrame();
  }
}

export interface TimelineUI {
  setMonth(monthIdx: number): void;
  destroy(): void;
}

const SPEEDS = [0.5, 1, 2, 4, 8] as const;

export function mountTimelineUI(
  container: HTMLElement,
  months: string[],
  engine: PlaybackEngine,
): TimelineUI {
  container.innerHTML = `
    <button id="tl-play" type="button" aria-label="Play">▶</button>
    <div id="tl-speeds" role="group" aria-label="Speed">
      ${SPEEDS.map((s) =>
        `<button type="button" data-speed="${s}" class="${s === 1 ? "active" : ""}">${s}×</button>`,
      ).join("")}
    </div>
    <div id="tl-month-label" style="font-size:14px;font-weight:600;min-width:140px"></div>
    <div id="tl-track-wrap" style="flex:1;position:relative;height:24px">
      <input id="tl-scrub" type="range" min="0" max="${months.length - 1}" value="0" step="1"
             style="width:100%;position:absolute;inset:0" />
      <div id="tl-baseline-marker" title="All values compare to Jan 2006"
           style="display:none"></div>
    </div>
  `;

  const playBtn = container.querySelector<HTMLButtonElement>("#tl-play")!;
  const speedGroup = container.querySelector<HTMLElement>("#tl-speeds")!;
  const monthLabel = container.querySelector<HTMLElement>("#tl-month-label")!;
  const scrub = container.querySelector<HTMLInputElement>("#tl-scrub")!;

  function refreshMonthLabel(m: number) {
    monthLabel.textContent = parseMonthLabel(months[m]);
  }
  function refreshPlayBtn() {
    playBtn.textContent = engine.isPlaying ? "⏸" : "▶";
    playBtn.setAttribute("aria-label", engine.isPlaying ? "Pause" : "Play");
  }
  function setActiveSpeed(s: number) {
    for (const btn of speedGroup.querySelectorAll<HTMLButtonElement>("button")) {
      btn.classList.toggle("active", Number(btn.dataset.speed) === s);
    }
  }

  refreshMonthLabel(0);
  refreshPlayBtn();

  playBtn.addEventListener("click", () => {
    if (engine.isPlaying) engine.pause();
    else engine.play();
    refreshPlayBtn();
  });

  speedGroup.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement;
    if (target.tagName !== "BUTTON") return;
    const s = Number(target.dataset.speed);
    engine.setSpeed(s);
    setActiveSpeed(s);
  });

  scrub.addEventListener("input", () => {
    engine.scrubTo(Number(scrub.value));
    refreshPlayBtn();
  });

  function onKey(ev: KeyboardEvent) {
    if (ev.target && (ev.target as HTMLElement).tagName === "INPUT") return;
    if (ev.code === "Space") {
      ev.preventDefault();
      if (engine.isPlaying) engine.pause(); else engine.play();
      refreshPlayBtn();
      return;
    }
    const step = ev.shiftKey ? 12 : 1;
    if (ev.code === "ArrowLeft")  engine.scrubTo(engine.month - step);
    if (ev.code === "ArrowRight") engine.scrubTo(engine.month + step);
    if (ev.code === "Home")       engine.scrubTo(0);
    if (ev.code === "End")        engine.scrubTo(months.length - 1);
  }
  window.addEventListener("keydown", onKey);

  return {
    setMonth(m: number) {
      scrub.value = String(m);
      refreshMonthLabel(m);
      refreshPlayBtn();
    },
    destroy() {
      window.removeEventListener("keydown", onKey);
      container.innerHTML = "";
    },
  };
}
