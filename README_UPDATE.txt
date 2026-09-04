EXPENSE APP UPDATE — per-category budgets + BI-styled redesign
===============================================================
Edited directly against your uploaded repo (3PhaseApps.zip) — real files.

WHAT CHANGED
1. BUDGETS ARE NOW PER CATEGORY. Each project has a budget for Electrical
   Payroll, Mechanical Payroll, Materials, and Equipment Rental. The overall
   project budget = the sum of those four. Spend-vs-budget shows per category
   (green / amber / red) on both the entry page and dashboard.
2. NEW BI-STYLE UI (PowerBI / Cora feel) on BOTH the entry page and dashboard:
   KPI tiles, rounded cards with soft shadows, a clean per-category budget grid,
   refined payroll boxes, a modal for setting budgets / creating projects, and a
   dashboard with a gradient area trend chart, category pie, project bar, and
   category budget-vs-actual bars.

FILES (4 — all edited from your real repo, replace the matching files):
  server/src/db.js                                  (4 budget_* columns + migrations)
  server/src/routes.expenses.js                     (per-category budget rollups + create/update)
  client/src/pages/Expenses.jsx                     (redesigned entry page + budget modal)
  client/src/components/expenses/ExpenseDashboard.jsx (redesigned dashboard)

If you have NOT yet deployed the earlier expense bundle, deploy that first
(the 7 shared-file edits + the other 2 new files: routes were already in that
set). These 4 files supersede the db.js/routes.expenses.js/Expenses.jsx/
ExpenseDashboard.jsx from before.

NOTE ON db.js: I replaced the single `budget` column with 4 category columns
AND added ensureColumn migrations, so it's safe whether or not an older version
shipped first. No data loss — CREATE TABLE IF NOT EXISTS + additive columns.

VERIFIED: rollup math (per-category %, project = sum of budgets) tested against
SQLite; all 4 files compile clean; structure/data render correctly. The BI
STYLING could not be visually previewed in my sandbox (Tailwind CDN limitation),
but all classes are standard Tailwind that compile in your Vite build. Deploy
and view; if any spacing/look needs a tweak, send a screenshot.

NO npm install. Commit, push, hard-refresh.
