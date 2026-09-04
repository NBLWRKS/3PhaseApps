EXPENSE APP — weekly notes + Change Orders (4 files)
=====================================================
Edited against your real repo. Supersedes the matching files from prior bundles.

1. WEEKLY NOTES: each week card now has a Notes field (multi-line), saved on blur.
   (Used the notes column that was already in expense_weeks — no data change.)

2. CHANGE ORDERS: each project has its own Change Orders section, tracked
   SEPARATELY from weekly spend (does NOT roll into the project total/budget).
   Each CO: CO number/name, date, man hours, equipment total, total $.
   The section shows running subtotals: total man hours, total equipment, total $.

FILES:
  server/src/db.js                 (new expense_change_orders table)
  server/src/routes.expenses.js    (CO CRUD + CO subtotals in summary; weeks already carry notes)
  client/src/api/base44Client.js   (addChangeOrder/updateChangeOrder/deleteChangeOrder)
  client/src/pages/Expenses.jsx    (weekly notes field + Change Orders section)

VERIFIED end-to-end against SQLite: COs create with correct subtotals
(man hrs / equipment / total) and stay OUT of the project spend total.
All files compile clean.

db.js note: new table via CREATE TABLE IF NOT EXISTS — safe, additive, no data loss.
NO npm install. Commit, push, hard-refresh.

VISUALS: the higher-quality visual/organization pass is NOT in this bundle yet
(see chat) — kept separate so these verified features can ship first.
