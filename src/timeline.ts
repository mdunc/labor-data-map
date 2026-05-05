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
