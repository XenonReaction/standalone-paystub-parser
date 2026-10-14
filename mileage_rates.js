// IRS standard mileage rates, from
// https://www.irs.gov/tax-professionals/standard-mileage-rates. Rates are in
// cents per mile, as the IRS publishes them; `start` and `end` are inclusive
// ISO dates. Newest first. Add each new rate to the top when the IRS
// announces it.
export const MILEAGE_RATES = [
  { start: '2026-07-01', end: '2026-12-31', business: 76, charity: 14, medical_moving: 23.5, sources: ['IR-2026-29'] },
  { start: '2026-01-01', end: '2026-06-30', business: 72.5, charity: 14, medical_moving: 20.5, sources: ['IR-2025-128'] },
  { start: '2025-01-01', end: '2025-12-31', business: 70, charity: 14, medical_moving: 21, sources: ['IR-2024-312'] },
  { start: '2024-01-01', end: '2024-12-31', business: 67, charity: 14, medical_moving: 21, sources: ['IR-2023-239'] },
  { start: '2023-01-01', end: '2023-12-31', business: 65.5, charity: 14, medical_moving: 22, sources: ['IR-2022-234'] },
  { start: '2022-07-01', end: '2022-12-31', business: 62.5, charity: 14, medical_moving: 22, sources: ['IR-2022-124'] },
  { start: '2022-01-01', end: '2022-06-30', business: 58.5, charity: 14, medical_moving: 18, sources: ['IR-2021-251'] },
  { start: '2021-01-01', end: '2021-12-31', business: 56, charity: 14, medical_moving: 16, sources: ['IR-2020-279'] },
  { start: '2020-01-01', end: '2020-12-31', business: 57.5, charity: 14, medical_moving: 17, sources: ['IR-2019-215'] },
  { start: '2019-01-01', end: '2019-12-31', business: 58, charity: 14, medical_moving: 20, sources: ['IR-2018-251'] },
  // 2018's moving rate only applies to the military after the TCJA.
  { start: '2018-01-01', end: '2018-12-31', business: 54.5, charity: 14, medical_moving: 18, sources: ['IR-2017-204', 'IR-2018-127'] },
  { start: '2017-01-01', end: '2017-12-31', business: 53.5, charity: 14, medical_moving: 17, sources: ['IR-2016-169'] },
  { start: '2016-01-01', end: '2016-12-31', business: 54, charity: 14, medical_moving: 19, sources: ['IR-2015-137'] },
  { start: '2015-01-01', end: '2015-12-31', business: 57.5, charity: 14, medical_moving: 23, sources: ['IR-2014-114'] },
  { start: '2014-01-01', end: '2014-12-31', business: 56, charity: 14, medical_moving: 23.5, sources: ['IR-2013-95'] },
  { start: '2013-01-01', end: '2013-12-31', business: 56.5, charity: 14, medical_moving: 24, sources: ['IR-2012-95'] },
  { start: '2012-01-01', end: '2012-12-31', business: 55.5, charity: 14, medical_moving: 23, sources: ['IRB-2012-02'] },
  { start: '2011-07-01', end: '2011-12-31', business: 55.5, charity: 14, medical_moving: 23.5, sources: ['IR-2011-69'] },
  { start: '2011-01-01', end: '2011-06-30', business: 51, charity: 14, medical_moving: 19, sources: ['IR-2010-119'] },
];

/**
 * The rate in effect on an ISO date. A pay period spanning two rate periods
 * uses the rate of its first day, so pass the period's begin date. Dates
 * past the table use its newest rate and dates before it its oldest, with
 * `outOfRange` set so the page can say so.
 */
export function mileageRateOn(isoDate) {
  const match = MILEAGE_RATES.find((rate) => rate.start <= isoDate && isoDate <= rate.end);
  if (match) {
    return { ...match, outOfRange: false };
  }
  const fallback = isoDate > MILEAGE_RATES[0].end ? MILEAGE_RATES[0] : MILEAGE_RATES[MILEAGE_RATES.length - 1];
  return { ...fallback, outOfRange: true };
}

/** "2026-07-01".."2026-12-31" -> "Jul 1 – Dec 31, 2026"; whole years -> "2025". */
export function describeRatePeriod(rate) {
  const [startYear, startMonth, startDay] = rate.start.split('-');
  const [, endMonth, endDay] = rate.end.split('-');
  if (startMonth === '01' && startDay === '01' && endMonth === '12' && endDay === '31') {
    return startYear;
  }
  const month = (m, d) =>
    `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
  return `${month(startMonth, startDay)} – ${month(endMonth, endDay)}, ${startYear}`;
}
