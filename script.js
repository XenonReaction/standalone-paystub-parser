// Standalone, no-build-step version of this project's parser (see ../src and
// ../frontend/src/app/core for the "real" versions this is ported from).
// Loaded as an ES module directly by the browser, with pdf.js itself pulled
// from a CDN - nothing here needs npm, a bundler, or a server. The PDF's
// bytes never leave this tab; the only network requests this page makes are
// for the pdf.js library code itself, not for anything in the file you pick.
import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.3.289/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.3.289/pdf.worker.min.mjs';

// ---------------------------------------------------------------------------
// PDF -> layout-preserving text (mirrors ../src/pdf.ts / ../frontend's
// pdf-text-extractor.service.ts - same column-reconstruction approach).
// ---------------------------------------------------------------------------

const LINE_Y_TOLERANCE = 2.0;
const COLUMN_UNIT = 5.0;

function splitRunIntoWords(run, pageHeight) {
  const { str, width, transform } = run;
  const x0 = transform[4];
  const y = transform[5];
  const charWidth = str.length > 0 ? width / str.length : 0;
  const y0 = pageHeight - y;

  const words = [];
  let charIndex = 0;
  for (const token of str.split(/(\s+)/)) {
    if (token.trim() === '') {
      charIndex += token.length;
      continue;
    }
    words.push({ x0: x0 + charWidth * charIndex, y0, text: token });
    charIndex += token.length;
  }
  return words;
}

function renderLine(words) {
  let out = '';
  let lastCol = 0;
  for (const { x0, text } of [...words].sort((a, b) => a.x0 - b.x0)) {
    const col = Math.max(0, Math.round(x0 / COLUMN_UNIT));
    const spaces = out ? Math.max(1, col - lastCol) : col;
    out += ' '.repeat(spaces) + text;
    lastCol = col + text.length;
  }
  return out.replace(/\s+$/, '');
}

function wordsToLines(words) {
  const sorted = [...words].sort((a, b) => (a.y0 !== b.y0 ? a.y0 - b.y0 : a.x0 - b.x0));

  const lines = [];
  let current = [];
  let currentY = null;
  for (const word of sorted) {
    if (currentY === null || Math.abs(word.y0 - currentY) <= LINE_Y_TOLERANCE) {
      current.push(word);
      currentY = currentY === null ? word.y0 : currentY;
    } else {
      lines.push(current);
      current = [word];
      currentY = word.y0;
    }
  }
  if (current.length > 0) {
    lines.push(current);
  }
  return lines.map(renderLine);
}

async function extractLayoutText(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data });
  const doc = await loadingTask.promise;

  const pages = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const words = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) {
        continue;
      }
      words.push(...splitRunIntoWords(item, viewport.height));
    }

    pages.push(words.length === 0 ? '' : wordsToLines(words).join('\n'));
  }

  await loadingTask.destroy();
  return pages.join('\n');
}

// ---------------------------------------------------------------------------
// Layout text -> structured fields (mirrors ../src/parser.ts). Deliberately
// leaves out employee id / hire date / location (no identity/hashing needed
// here - nothing is stored or sent anywhere) and bank/account (PII this
// project never extracts at all, see the main parser's own notes).
// ---------------------------------------------------------------------------

const NUM = '-?[\\d,]+\\.\\d{2}';
const NUM_RE = new RegExp(NUM, 'g');

function money(value) {
  return value === null || value === undefined ? null : parseFloat(value.replace(/,/g, ''));
}

function isoDate(value) {
  if (!value) {
    return null;
  }
  const [monthStr, dayStr, yearStr] = value.split('/');
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  const year =
    yearStr.length === 2
      ? (parseInt(yearStr, 10) <= 68 ? 2000 : 1900) + parseInt(yearStr, 10)
      : parseInt(yearStr, 10);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function first(pattern, text) {
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

function findMarker(text, marker, fromIndex = 0) {
  if (typeof marker === 'string') {
    const index = text.indexOf(marker, fromIndex);
    return index < 0 ? null : { index, length: marker.length };
  }
  const match = text.slice(fromIndex).match(marker);
  if (!match || match.index === undefined) {
    return null;
  }
  return { index: fromIndex + match.index, length: match[0].length };
}

function section(text, start, end) {
  const startMarker = findMarker(text, start);
  if (!startMarker) {
    return '';
  }
  if (end) {
    const endMarker = findMarker(text, end, startMarker.index + startMarker.length);
    if (endMarker) {
      return text.slice(startMarker.index, endMarker.index);
    }
  }
  return text.slice(startMarker.index);
}

function findNumbers(line) {
  return line.match(NUM_RE) ?? [];
}

function parseEarnings(text) {
  const earnings = [];
  const lines = section(text, /Total Gross Pay\s+Hours/, /Taxes\s+Status/).split('\n').slice(1);
  for (const rawLine of lines) {
    const s = rawLine.trim();
    if (!s || !/[A-Za-z]/.test(s[0])) {
      continue;
    }
    const values = findNumbers(s);
    if (values.length < 3) {
      continue;
    }
    const name = s.split(/\s{2,}/)[0];
    if (values.length >= 4) {
      earnings.push({
        name,
        hours: money(values[0]),
        rate: money(values[1]),
        current_amount: money(values[2]),
        ytd_amount: money(values[3]),
      });
    } else {
      const hours = money(values[0]);
      if (hours && hours > 0) {
        earnings.push({ name, hours, rate: money(values[1]), current_amount: money(values[2]), ytd_amount: null });
      } else {
        earnings.push({ name, hours, rate: null, current_amount: money(values[1]), ytd_amount: money(values[2]) });
      }
    }
  }
  return earnings;
}

function parseTaxes(text) {
  const taxes = [];
  const lines = section(text, /Taxes\s+Status/, 'Other Deductions from Pay').split('\n').slice(1);
  for (const rawLine of lines) {
    const s = rawLine.trim();
    if (!s || !/[A-Za-z]/.test(s[0])) {
      continue;
    }
    const values = findNumbers(s);
    if (values.length < 3) {
      continue;
    }
    const prefix = s.slice(0, s.indexOf(values[0])).trimEnd();
    const parts = prefix.split(/\s{2,}/);
    taxes.push({
      name: parts[0],
      status: parts.length > 1 ? parts[1] : null,
      taxable_amount: money(values[values.length - 3]),
      current_amount: money(values[values.length - 2]),
      ytd_amount: money(values[values.length - 1]),
    });
  }
  return taxes;
}

function parseDeductions(text) {
  const deductions = [];
  const lines = section(text, 'Other Deductions from Pay', 'Direct Deposits').split('\n').slice(1);
  for (const rawLine of lines) {
    const s = rawLine.trim();
    const values = findNumbers(s);
    if (!s || !/[A-Za-z]/.test(s[0]) || values.length < 2) {
      continue;
    }
    const name = s.slice(0, s.indexOf(values[0])).trim();
    deductions.push({
      name,
      current_amount: money(values[values.length - 2]),
      ytd_amount: money(values[values.length - 1]),
    });
  }
  return deductions;
}

function parsePaystubFromText(text) {
  const paymentSummary = section(text, /Payment\s+Summary/);
  return {
    voucher_date: isoDate(first(/Voucher Date\s+Voucher Number\s*\n\s*(\d{2}\/\d{2}\/\d{4})/, text)),
    voucher_number: first(/Voucher Date\s+Voucher Number\s*\n\s*\d{2}\/\d{2}\/\d{4}\s+(\d+)/, text),
    status: first(/Status\s+(\S+)/, text),
    period_begin: isoDate(first(/Period Begin\s+(\d{2}\/\d{2}\/\d{2})/, text)),
    period_end: isoDate(first(/Period End\s+(\d{2}\/\d{2}\/\d{2})/, text)),
    check_type: first(/Check Type\s+(\S+)/, text),
    gross_pay: money(first(new RegExp(`Total Gross Pay\\s+(${NUM})`), paymentSummary)),
    net_pay: money(first(new RegExp(`Net Pay\\s+(${NUM})`), paymentSummary)),
    direct_deposit_amount: money(first(new RegExp(`Direct Deposit Amount\\s+\\*+\\s*(${NUM})`), text)),
    net_check: money(first(new RegExp(`Net Check\\s+(${NUM})`), paymentSummary)),
    earnings: parseEarnings(text),
    taxes: parseTaxes(text),
    other_deductions: parseDeductions(text),
  };
}

// ---------------------------------------------------------------------------
// Structured fields -> the three requested $/hour figures.
// ---------------------------------------------------------------------------

function totalHoursWorked(stub) {
  return stub.earnings.reduce((sum, e) => sum + (e.hours ?? 0), 0);
}

/**
 * - $/hour paid: net_pay / hours - whatever actually landed in the bank, per hour.
 * - $/hour, reimbursements removed: strip out the *entire* net effect of
 *   other_deductions (mileage, GPS/data, the tips-reported wash) from net
 *   pay first, i.e. what's left is just labor pay after taxes.
 * - $/hour, mileage at federal rate: earnings for the period minus taxes
 *   (i.e. pay before any of the other_deductions line items are applied),
 *   with mileage added back in - recalculated as (mileage $ ÷ actual $/mi)
 *   x federal $/mi, instead of the actual reimbursement rate.
 *
 * Returns null if there's no hours to divide by, no net pay, or no line
 * item matching "mileage" to back out miles from.
 */
function calculateRates(stub, federalMileageRate, actualMileageRate) {
  const hours = totalHoursWorked(stub);
  const mileageLine = stub.other_deductions.find((d) => /mileage/i.test(d.name));
  if (
    hours <= 0 ||
    stub.net_pay === null ||
    !mileageLine ||
    mileageLine.current_amount === null ||
    !actualMileageRate ||
    actualMileageRate <= 0
  ) {
    return null;
  }

  const reimbursementNetEffect = -stub.other_deductions.reduce((sum, d) => sum + (d.current_amount ?? 0), 0);
  const impliedMiles = -mileageLine.current_amount / actualMileageRate;
  const recalculatedMileage = impliedMiles * federalMileageRate;

  const totalTaxes = stub.taxes.reduce((sum, t) => sum + (t.current_amount ?? 0), 0);
  const earningsAfterTaxes = (stub.gross_pay ?? 0) - totalTaxes;

  const ratePaid = stub.net_pay / hours;
  const rateNoReimbursements = (stub.net_pay - reimbursementNetEffect) / hours;
  const rateAdjusted = (earningsAfterTaxes + recalculatedMileage) / hours;

  return { hours, impliedMiles, recalculatedMileage, ratePaid, rateNoReimbursements, rateAdjusted };
}

// ---------------------------------------------------------------------------
// DOM wiring.
// ---------------------------------------------------------------------------

const fileInput = document.getElementById('pdf-input');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const federalRateInput = document.getElementById('federal-rate-input');
const actualRateInput = document.getElementById('actual-rate-input');
const parsedJsonEl = document.getElementById('parsed-json');

let currentStub = null;

function formatDollars(value) {
  return value === null ? '—' : `$${value.toFixed(2)}`;
}

function render() {
  if (!currentStub) {
    return;
  }
  const federalRate = parseFloat(federalRateInput.value) || 0;
  const actualRate = parseFloat(actualRateInput.value) || 0;
  const rates = calculateRates(currentStub, federalRate, actualRate);

  document.getElementById('rate-paid').textContent = formatDollars(rates?.ratePaid ?? null);
  document.getElementById('rate-no-reimbursements').textContent = formatDollars(rates?.rateNoReimbursements ?? null);
  document.getElementById('rate-adjusted').textContent = formatDollars(rates?.rateAdjusted ?? null);

  const note = document.getElementById('rate-adjusted-note');
  if (rates) {
    note.textContent = `${rates.impliedMiles.toFixed(0)} implied miles (mileage reimbursement ÷ $${actualRate.toFixed(2)}/mi actual rate) × $${federalRate.toFixed(2)}/mi federal rate = ${formatDollars(rates.recalculatedMileage)}, added to earnings after taxes.`;
  } else {
    note.textContent = 'No mileage reimbursement line found on this paystub, so this can’t be calculated.';
  }

  parsedJsonEl.textContent = JSON.stringify(currentStub, null, 2);
  resultsEl.hidden = false;
}

federalRateInput.addEventListener('input', render);
actualRateInput.addEventListener('input', render);

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) {
    return;
  }

  statusEl.textContent = 'Reading PDF…';
  statusEl.classList.remove('status--error');
  resultsEl.hidden = true;
  currentStub = null;

  try {
    const text = await extractLayoutText(file);
    const stub = parsePaystubFromText(text);
    if (totalHoursWorked(stub) <= 0 || stub.net_pay === null) {
      throw new Error("Couldn't find hours worked and net pay in this PDF - is it the expected paystub layout?");
    }
    currentStub = stub;
    statusEl.textContent = '';
    render();
  } catch (error) {
    statusEl.textContent = error instanceof Error ? error.message : 'Failed to parse this PDF.';
    statusEl.classList.add('status--error');
  }
});
