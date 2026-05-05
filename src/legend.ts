import { BUCKETS, NO_DATA_COLOR, NO_DATA_LABEL } from "./colors.ts";

function rangeLabel(lower: number, upper: number): string {
  if (lower === -Infinity) return `< ${upper}%`;
  if (upper === Infinity) return `≥ ${lower}%`;
  return `${lower}% to ${upper}%`;
}

export function renderLegend(el: HTMLElement): void {
  const rows: string[] = [];
  rows.push(`<div style="font-weight:600;margin-bottom:6px">Labor Force vs. Jan 2010</div>`);
  for (const b of BUCKETS) {
    rows.push(
      `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">
         <span style="width:14px;height:14px;background:${b.color};display:inline-block"></span>
         <span>${b.label} <span style="color:#666">(${rangeLabel(b.lower, b.upper)})</span></span>
       </div>`,
    );
  }
  rows.push(
    `<div style="display:flex;align-items:center;gap:6px;margin-top:6px">
       <span style="width:14px;height:14px;background:${NO_DATA_COLOR};display:inline-block;border:1px solid #999"></span>
       <span style="color:#666">${NO_DATA_LABEL}</span>
     </div>`,
  );
  el.innerHTML = rows.join("");
}
