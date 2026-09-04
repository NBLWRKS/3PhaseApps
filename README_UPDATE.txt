EXPENSE APP UPDATE — split materials, staffing payroll, no combined totals, import
==================================================================================
Edited against your real repo (3PhaseApps.zip). 5 files.

CHANGES
1. MATERIALS SPLIT: "Materials" is now "Materials – Electrical" and
   "Materials – Mechanical" — separate line-item categories AND separate budgets.
2. STAFFING PAYROLL: each week now has FOUR payroll buckets ($ + hours each):
   Electrical, Mechanical, Staffing – Electrical, Staffing – Mechanical.
   Staffing has its own budgets too.
   -> Budget is now 7 categories: Elec Payroll, Mech Payroll, Staffing Elec,
      Staffing Mech, Materials Elec, Materials Mech, Equipment Rental
      (project budget = sum of all 7).
3. COMBINED TOTALS REMOVED: no program-wide KPI strip; the entry page shows only
   the selected project (via the dropdown you already had).
4. IMPORT: an Upload button on each project opens an "Import weekly totals" modal.
   Paste rows from Excel (tab-separated) or comma-separated, one week per line,
   columns in this order:
     Week ending, Elec pay, Elec hrs, Mech pay, Mech hrs,
     Staff elec pay, Staff elec hrs, Staff mech pay, Staff mech hrs,
     Materials elec, Materials mech, Rental
   It creates the weeks and turns materials/rental into expense line items.
   (A live preview table shows what will import before you commit.)

FILES (replace the matching files):
  server/src/db.js                                    (staffing week cols + split/staffing budget cols + migrations)
  server/src/routes.expenses.js                       (4 payroll fields, 7 budgets, /import endpoint)
  client/src/api/base44Client.js                      (adds expenses.importWeeks)
  client/src/pages/Expenses.jsx                       (4 payroll boxes, import modal, no totals strip)
  client/src/components/expenses/ExpenseDashboard.jsx (7-category budget bars)

These supersede the same files from the previous expense bundles.

VERIFIED: import endpoint tested end-to-end against SQLite (weeks created,
payroll summed across all 4 buckets, materials/staffing split into the right 7
categories); all files compile clean; entry page renders the 4 payroll boxes +
7 budget cards + import button, with the combined-totals strip gone. BI styling
couldn't be previewed in-sandbox (Tailwind CDN limitation) but compiles for your
Vite build.

db.js note: additive columns + CREATE TABLE IF NOT EXISTS + ensureColumn
migrations — safe whether or not an older expense schema shipped. No data loss.
NO npm install. Commit, push, hard-refresh.

ABOUT YOUR SPREADSHEET: your xlsx has a different per-employee layout per sheet
and some malformed dates, so there's no reliable one-click file import. The
paste-totals importer is the dependable path: for each project, total each
week's columns in your sheet and paste the weekly rows in.
