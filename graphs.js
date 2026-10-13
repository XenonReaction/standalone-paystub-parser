// Graphs tab: a line chart of each loaded paystub's apparent, actual, and
// adjusted hourly rates by pay period, drawn as plain SVG (no chart library).
// script.js owns the paystubs and calls updateRateChart() whenever they or the
// federal rate change; this file only draws what it's given.

const SVG_NS = 'http://www.w3.org/2000/svg';
const HEIGHT = 320;
const MARGIN = { top: 16, right: 96, bottom: 36, left: 56 };
// Roughly how wide an x-axis date label is, used to thin out crowded labels.
const X_LABEL_WIDTH = 84;
// Closest two line-end labels may sit, vertically, before they're nudged apart.
const END_LABEL_GAP = 16;

// Colors come from --series-N in style.css (validated for color-blind safety).
const SERIES = [
  { key: 'apparent', label: 'Apparent', color: 'var(--series-1)' },
  { key: 'actual', label: 'Actual', color: 'var(--series-2)' },
  { key: 'adjusted', label: 'Adjusted', color: 'var(--series-3)' },
];

const emptyEl = document.getElementById('graphs-empty');
const contentEl = document.getElementById('graphs-content');
const chartEl = document.getElementById('rate-chart');
const svg = document.getElementById('rate-chart-svg');
const tooltipEl = document.getElementById('rate-chart-tooltip');
const legendEl = document.getElementById('rate-chart-legend');
const tableBodyEl = document.getElementById('rate-table-body');
const tableFootEl = document.getElementById('rate-table-foot');
const averagesToggle = document.getElementById('show-averages');

// Each row: { label, shortLabel, apparent, actual, adjusted }, oldest first.
let rows = [];
// Where the last draw put things, for the hover/keyboard handlers.
let layout = null;
let activeIndex = null;

function formatDollars(value) {
  return `$${value.toFixed(2)}`;
}

function average(key) {
  return rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
}

function svgEl(name, attrs, parent) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [attr, value] of Object.entries(attrs)) {
    el.setAttribute(attr, value);
  }
  parent.append(el);
  return el;
}

/** Evenly spaced, round-numbered y-axis ticks covering min..max. */
function niceTicks(min, max, count = 5) {
  if (min === max) {
    max = min + 1;
  }
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * magnitude).find((s) => raw <= s);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let t = lo; t <= hi + step / 2; t += step) {
    ticks.push(Math.round(t * 100) / 100);
  }
  return { lo, hi, ticks, decimals: Number.isInteger(step) ? 0 : 2 };
}

/** Moves labels apart so none sit closer than END_LABEL_GAP, keeping their order. */
function spreadLabels(labels) {
  const sorted = [...labels].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    sorted[i].y = Math.max(sorted[i].y, sorted[i - 1].y + END_LABEL_GAP);
  }
  return sorted;
}

function draw() {
  const width = chartEl.clientWidth;
  // The Graphs tab is hidden (zero width) until opened; the ResizeObserver redraws then.
  if (rows.length === 0 || width === 0) {
    return;
  }

  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const showAverages = averagesToggle.checked;

  const values = rows.flatMap((row) => SERIES.map((s) => row[s.key]));
  const { lo, hi, ticks, decimals } = niceTicks(Math.min(0, ...values), Math.max(...values));
  const x = (i) => MARGIN.left + (rows.length === 1 ? plotWidth / 2 : (i * plotWidth) / (rows.length - 1));
  const y = (v) => MARGIN.top + plotHeight - ((v - lo) / (hi - lo)) * plotHeight;
  layout = { x, width, plotWidth };

  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${width} ${HEIGHT}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', HEIGHT);

  // Gridlines and y-axis labels.
  for (const tick of ticks) {
    svgEl('line', { class: 'rate-chart__grid', x1: MARGIN.left, x2: MARGIN.left + plotWidth, y1: y(tick), y2: y(tick) }, svg);
    const label = svgEl('text', { class: 'rate-chart__axis-label', x: MARGIN.left - 8, y: y(tick), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, svg);
    label.textContent = `$${tick.toFixed(decimals)}`;
  }

  // X-axis labels, skipping some when there are too many pay periods to fit.
  const labelEvery = Math.max(1, Math.ceil((rows.length * X_LABEL_WIDTH) / Math.max(plotWidth, 1)));
  rows.forEach((row, i) => {
    if (i % labelEvery !== 0) {
      return;
    }
    const label = svgEl('text', { class: 'rate-chart__axis-label', x: x(i), y: HEIGHT - MARGIN.bottom + 20, 'text-anchor': 'middle' }, svg);
    label.textContent = row.shortLabel;
  });

  if (showAverages) {
    for (const s of SERIES) {
      const line = svgEl('line', { class: 'rate-chart__average', x1: MARGIN.left, x2: MARGIN.left + plotWidth, y1: y(average(s.key)), y2: y(average(s.key)) }, svg);
      line.style.stroke = s.color;
    }
  }

  const crosshair = svgEl('line', { class: 'rate-chart__crosshair', y1: MARGIN.top, y2: MARGIN.top + plotHeight, visibility: 'hidden' }, svg);
  layout.crosshair = crosshair;

  for (const s of SERIES) {
    const path = svgEl('path', { class: 'rate-chart__line', d: rows.map((row, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(row[s.key])}`).join('') }, svg);
    path.style.stroke = s.color;
    rows.forEach((row, i) => {
      const point = svgEl('circle', { class: 'rate-chart__point', cx: x(i), cy: y(row[s.key]), r: 4 }, svg);
      point.style.fill = s.color;
    });
  }

  // Name each line at its last point, so it isn't identified by color alone.
  const last = rows.length - 1;
  const endLabels = spreadLabels(SERIES.map((s) => ({ s, y: y(rows[last][s.key]) })));
  for (const { s, y: labelY } of endLabels) {
    const key = svgEl('line', { class: 'rate-chart__end-key', x1: x(last) + 10, x2: x(last) + 22, y1: labelY, y2: labelY }, svg);
    key.style.stroke = s.color;
    const label = svgEl('text', { class: 'rate-chart__end-label', x: x(last) + 26, y: labelY, 'dominant-baseline': 'middle' }, svg);
    label.textContent = s.label;
  }

  // Invisible layer over the whole plot so the pointer only has to be near a pay period.
  const hitArea = svgEl('rect', { class: 'rate-chart__hit-area', x: MARGIN.left - 12, y: MARGIN.top, width: plotWidth + 24, height: plotHeight }, svg);
  hitArea.addEventListener('pointermove', (event) => {
    const svgX = event.clientX - svg.getBoundingClientRect().left;
    const fraction = (svgX - MARGIN.left) / plotWidth;
    showTooltip(Math.min(rows.length - 1, Math.max(0, Math.round(fraction * (rows.length - 1)))));
  });
  hitArea.addEventListener('pointerleave', hideTooltip);

  if (activeIndex !== null) {
    showTooltip(Math.min(activeIndex, rows.length - 1));
  }
}

function showTooltip(index) {
  activeIndex = index;
  const row = rows[index];
  const px = layout.x(index);
  layout.crosshair.setAttribute('x1', px);
  layout.crosshair.setAttribute('x2', px);
  layout.crosshair.setAttribute('visibility', 'visible');

  const title = document.createElement('p');
  title.className = 'rate-chart__tooltip-title';
  title.textContent = row.label;
  tooltipEl.replaceChildren(
    title,
    ...SERIES.map((s) => {
      const item = document.createElement('p');
      item.className = 'rate-chart__tooltip-row';
      const key = document.createElement('span');
      key.className = 'line-key';
      key.style.background = s.color;
      const value = document.createElement('strong');
      value.textContent = `${formatDollars(row[s.key])}/hr`;
      const name = document.createElement('span');
      name.className = 'rate-chart__tooltip-name';
      name.textContent = s.label;
      item.append(key, value, name);
      return item;
    }),
  );
  tooltipEl.hidden = false;
  // Keep the tooltip inside the chart: flip it to the left of the crosshair near the right edge.
  const tooltipWidth = tooltipEl.offsetWidth;
  const left = px + 12 + tooltipWidth > layout.width ? px - 12 - tooltipWidth : px + 12;
  tooltipEl.style.left = `${Math.max(0, left)}px`;
  tooltipEl.style.top = `${MARGIN.top}px`;
}

function hideTooltip() {
  activeIndex = null;
  tooltipEl.hidden = true;
  layout?.crosshair.setAttribute('visibility', 'hidden');
}

function renderLegend() {
  const showAverages = averagesToggle.checked;
  legendEl.replaceChildren(
    ...SERIES.map((s) => {
      const item = document.createElement('li');
      const key = document.createElement('span');
      key.className = 'line-key';
      key.style.background = s.color;
      item.append(key, s.label);
      if (showAverages) {
        const avg = document.createElement('span');
        avg.className = 'chart-legend__average';
        avg.textContent = ` avg ${formatDollars(average(s.key))}/hr`;
        item.append(avg);
      }
      return item;
    }),
  );
}

function renderTable() {
  const cellRow = (cells, header) => {
    const tr = document.createElement('tr');
    cells.forEach((text, i) => {
      const cell = document.createElement(i === 0 && header ? 'th' : 'td');
      cell.textContent = text;
      tr.append(cell);
    });
    return tr;
  };
  tableBodyEl.replaceChildren(
    ...rows.map((row) => cellRow([row.label, ...SERIES.map((s) => formatDollars(row[s.key]))], false)),
  );
  tableFootEl.replaceChildren(cellRow(['Average', ...SERIES.map((s) => formatDollars(average(s.key)))], true));
}

function render() {
  emptyEl.hidden = rows.length > 0;
  contentEl.hidden = rows.length === 0;
  if (rows.length === 0) {
    return;
  }
  renderLegend();
  renderTable();
  draw();
}

/** Called by script.js with one row per loaded paystub, in any order. */
export function updateRateChart(newRows) {
  rows = [...newRows].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  render();
}

averagesToggle.addEventListener('change', render);
new ResizeObserver(draw).observe(chartEl);

// Keyboard: focus the chart, then Left/Right step through pay periods.
svg.addEventListener('keydown', (event) => {
  if (rows.length === 0 || !layout || !['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    return;
  }
  event.preventDefault();
  const step = event.key === 'ArrowLeft' ? -1 : 1;
  showTooltip(Math.min(rows.length - 1, Math.max(0, (activeIndex ?? (step > 0 ? -1 : rows.length)) + step)));
});
svg.addEventListener('focus', () => layout && showTooltip(activeIndex ?? rows.length - 1));
svg.addEventListener('blur', hideTooltip);
