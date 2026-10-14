// Pay formulas, ported from ../pay_formulas.json. Each formula receives the
// inputs plus every output calculated before it, so the key order of
// `formulas` is the calculation order. ../pay_values.json holds a worked
// example (sample_paystub_2026-08-21.pdf) to check these against.

// Inputs a caller is expected to provide (all USD unless noted).
export const INPUT_FIELDS = {
  pay: ['training_pay', 'insider_pay', 'driver_pay', 'tips_reported_pay', 'tips_paid_pay'],
  taxes: ['federal_taxes'],
  hours: ['training_hours', 'insider_hours', 'driver_hours'],
  reimbursement: ['car_reimbursement', 'gps_reimbursement'],
  rates: ['federal_rate_per_mile', 'actual_rate_per_mile'],
};

// The federal minimum wage (USD per hour) and the date it took effect.
export const FEDERAL_MINIMUM_WAGE = { rate: 7.25, since: '2009-07-24' };

// USD per mile; either can be overridden by passing it in the inputs.
export const DEFAULT_RATES = {
  federal_rate_per_mile: 0.76,
  actual_rate_per_mile: 0.45,
};

export const formulas = {
  total_pay: (v) =>
    v.training_pay + v.insider_pay + v.driver_pay +
    v.tips_reported_pay + v.tips_paid_pay - v.federal_taxes,
  apparent_pay: (v) => v.total_pay + v.car_reimbursement + v.gps_reimbursement,
  total_hours: (v) => v.training_hours + v.insider_hours + v.driver_hours,
  apparent_pay_rate: (v) => v.apparent_pay / v.total_hours,
  hourly_rate: (v) => v.total_pay / v.total_hours,
  miles_driven: (v) => v.car_reimbursement / v.actual_rate_per_mile,
  federal_suggested_reimbursement: (v) => v.miles_driven * v.federal_rate_per_mile,
  missing_reimbursement: (v) => v.federal_suggested_reimbursement - v.car_reimbursement,
  adjusted_pay: (v) => v.total_pay - v.missing_reimbursement,
  adjusted_hourly_rate: (v) => v.adjusted_pay / v.total_hours,
};

export const UNITS = {
  total_pay: 'USD',
  apparent_pay: 'USD',
  total_hours: 'hours',
  apparent_pay_rate: 'USD per hour',
  hourly_rate: 'USD per hour',
  miles_driven: 'miles',
  federal_suggested_reimbursement: 'USD',
  missing_reimbursement: 'USD',
  adjusted_pay: 'USD',
  adjusted_hourly_rate: 'USD per hour',
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Returns { inputs, outputs }. Intermediate results are kept at full
// precision; only the returned outputs are rounded to cents, matching
// how pay_values.json was calculated.
export function calculatePay(inputs) {
  const v = { ...DEFAULT_RATES, ...inputs };
  const outputs = {};
  for (const [name, formula] of Object.entries(formulas)) {
    v[name] = formula(v);
    outputs[name] = round2(v[name]);
  }
  return { inputs: v, outputs };
}

// Lifetime formulas across several paystubs. Each paystub's pay is summed and
// divided by the summed hours, so a long pay period counts for more than a
// short one (rather than averaging each paystub's hourly rate).
// "actual" pay is total_pay: pay after federal taxes, reimbursement left out.
export const overallFormulas = {
  overall_apparent_pay: (stubs) => sumOf(stubs, 'apparent_pay'),
  overall_actual_pay: (stubs) => sumOf(stubs, 'total_pay'),
  overall_adjusted_pay: (stubs) => sumOf(stubs, 'adjusted_pay'),
  overall_total_hours: (stubs) => sumOf(stubs, 'total_hours'),
};

export const overallRateFormulas = {
  overall_apparent_hourly_rate: (v) => v.overall_apparent_pay / v.overall_total_hours,
  overall_actual_hourly_rate: (v) => v.overall_actual_pay / v.overall_total_hours,
  overall_adjusted_hourly_rate: (v) => v.overall_adjusted_pay / v.overall_total_hours,
};

function sumOf(stubs, name) {
  return stubs.reduce((sum, v) => sum + v[name], 0);
}

// Takes the full-precision `inputs` (which also hold every output) that
// calculatePay returned for each paystub; rounds only the final results.
export function calculateOverallPay(stubValues) {
  const v = {};
  for (const [name, formula] of Object.entries(overallFormulas)) {
    v[name] = formula(stubValues);
  }
  for (const [name, formula] of Object.entries(overallRateFormulas)) {
    v[name] = formula(v);
  }
  return Object.fromEntries(Object.entries(v).map(([name, value]) => [name, round2(value)]));
}
