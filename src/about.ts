export function setupAboutModal(button: HTMLElement, modal: HTMLElement): void {
  modal.innerHTML = `
    <div class="about-content">
      <h2 style="margin-top:0">About this map</h2>
      <p>This map shows monthly US county labor force change <strong>over the past 20 years</strong> across the
      timeline window Jan 2010 – Dec 2025. Each month is compared to the same month 20 years earlier
      (e.g. June 2019 is compared to June 1999), so what you see is the long-run shape of the labor force —
      seasonal patterns wash out and the cumulative two-decade trajectory is what colors each county.
      Data is from the Bureau of Labor Statistics
      <a href="https://www.bls.gov/lau/" target="_blank" rel="noreferrer">Local Area Unemployment Statistics (LAUS)</a>
      program — county-level <em>not seasonally adjusted</em> labor force series.</p>
      <p>Each county is colored by its bucketed % change for the displayed month. Bucket boundaries are inclusive of the
      lower bound and exclusive of the upper bound (so 0% lands in <em>Below-trend Growth</em>).</p>
      <p>Use the timeline to play, pause, scrub, and adjust speed. Hover any county for its current value.</p>
      <button id="about-close" type="button">Close</button>
    </div>
  `;
  modal.hidden = true;
  const closeBtn = modal.querySelector<HTMLButtonElement>("#about-close")!;
  button.addEventListener("click", () => { modal.hidden = false; });
  closeBtn.addEventListener("click", () => { modal.hidden = true; });
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal) modal.hidden = true;
  });
}
