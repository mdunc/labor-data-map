import { Dataset, formatPctChange, parseMonthLabel } from "./data.ts";
import { bucketColor, bucketLabel } from "./colors.ts";

export interface Tooltip {
  show(opts: {
    x: number;
    y: number;
    countyIdx: number;
    monthIdx: number;
    countyName: string;
  }): void;
  hide(): void;
}

export function createTooltip(el: HTMLElement, dataset: Dataset): Tooltip {
  function show({ x, y, countyIdx, monthIdx, countyName }: {
    x: number; y: number; countyIdx: number; monthIdx: number; countyName: string;
  }) {
    const bucket = dataset.bucketAt(monthIdx, countyIdx);
    const value = dataset.valueAt(monthIdx, countyIdx); // pct_change; may be undefined if values.bin not yet loaded
    const monthLabel = parseMonthLabel(dataset.meta.months[monthIdx]);
    const color = bucketColor(bucket);
    const label = bucketLabel(bucket);
    const pctText = value !== undefined ? formatPctChange(value) : "(loading…)";

    el.innerHTML = `
      <div style="font-weight:600">${countyName}</div>
      <div style="color:#666;font-size:11px">${monthLabel}</div>
      <div style="margin-top:4px">
        <span style="display:inline-block;width:10px;height:10px;background:${color};margin-right:4px;vertical-align:middle"></span>
        <span style="vertical-align:middle">${label}: <strong>${pctText}</strong></span>
      </div>
    `;
    el.hidden = false;
    // Position offset to keep tooltip from blocking the cursor:
    const offset = 14;
    el.style.left = `${x + offset}px`;
    el.style.top = `${y + offset}px`;
  }

  function hide() {
    el.hidden = true;
  }

  return { show, hide };
}
