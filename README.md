# Paystub Parser

**Live site: <https://xenonreaction.github.io/standalone-paystub-parser/>**

Paystub Parser reads your paystub PDFs and works out the hourly rate you're really earning. It's a static
page with no build step and no server. Everything runs in your browser tab: the PDF is never uploaded,
and nothing is saved once you close or reload the page.

## Features

- **Upload PDFs or enter values by hand.** Load one or more paystub PDFs at once, or switch to "Enter
  values" and type in the amounts from the paystub. A paystub that's already loaded is turned away (PDFs
  are matched by voucher date and number, manual entries by pay period).
- **Three hourly rates for each paystub:**
  - **Apparent**: (pay + mileage reimbursement + GPS reimbursement) ÷ hours. What the paycheck looks
    like per hour.
  - **Actual**: pay ÷ hours, with the reimbursements left out.
  - **Adjusted**: (pay − (miles × federal rate − mileage reimbursement)) ÷ hours. Actual pay minus the
    car costs that the $0.45/mile reimbursement didn't cover at the IRS standard mileage rate.
- **IRS mileage rates.** Each paystub uses the IRS business rate in effect on the first day of its pay
  period. You can override the rate for a single paystub on the Adjusted card.
- **Lifetime Rates.** Combines every loaded paystub as total pay ÷ total hours, so longer pay periods
  count for more.
- **Graphs.** A line chart of all three rates per pay period. You can turn each line on or off, show
  averages, and overlay the federal minimum wage. It also has a table view and arrow-key navigation.
- **Transparency.** The "Calculations" and "Parsed paystub" sections show each step of the math and
  everything the parser read from the PDF.

In every rate, "pay" means all earnings lines (training, insider, driver, and reported and paid tips)
minus federal taxes. Hours are training, insider, and driver hours together.

> These are the page's own estimates, not payroll or IRS figures. The federal mileage rate stands in
> for typical vehicle costs, not your vehicle's actual cost.

## Running locally

The scripts are ES modules, so the browser won't run them from `file://`. Serve the folder with any
static file server, for example:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. pdf.js is loaded from cdnjs, so you need an internet connection.

## Project structure

| File                        | Purpose                                                                 |
| --------------------------- | ----------------------------------------------------------------------- |
| `index.html`                | Page markup for the Home, Graphs, and About tabs                         |
| `script.js`                 | PDF text extraction (pdf.js), paystub parsing, manual entry, and rendering |
| `pay_formulas.js`           | Per-paystub and lifetime pay/rate formulas                               |
| `mileage_rates.js`          | IRS standard mileage rate table and lookup by date                       |
| `graphs.js`                 | SVG line chart, tooltip, averages, and rate table                        |
| `tabs.js`                   | Hash-based tab switching (`#home`, `#graphs`, `#about`)                  |
| `style.css`                 | Styles                                                                   |
| `Example of paystub data.png` | Example image shown in the manual-entry form                          |

## Maintenance notes

- **New IRS mileage rate:** add an entry to the top of `MILEAGE_RATES` in `mileage_rates.js`.
- **Cache busting:** whenever a file changes, bump the `?v=` query string on every file reference in
  `index.html` and on the imports in `script.js` and `graphs.js`. That way browsers never mix a cached
  old file with a new one.
