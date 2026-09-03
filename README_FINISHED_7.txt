EXPENSE APP — the 7 SHARED files, EDITED against your real current repo
=======================================================================
These were edited directly from the 3PhaseApps.zip you uploaded — your actual
live files, not reconstructions. The expense app is woven in and every existing
feature was verified still present (safety-public, tracking, duplicateProject,
reorder methods, getPublicCard, SafetyCard routing, all Landing tiles).

Copy each over the matching file in your repo:
  server/src/apps.js
  server/src/index.js
  server/src/db.js
  client/src/api/base44Client.js
  client/src/App.jsx
  client/src/components/layout/AppSwitcher.jsx
  client/src/pages/Landing.jsx

You ALREADY added the 4 new files (routes.expenses.js, Expenses.jsx,
ExpenseDashboard.jsx, expensesExport.js), so nothing more to copy there.

DEPLOY: copy these 7, commit, push. API redeploys (creates the 4 expense tables
on startup — no migration). Frontend rebuilds. Hard-refresh.

AFTER DEPLOY: Admin -> your user -> set "Expense Tracking" to Edit. Then the
tile appears on the hub and in the app switcher, and /expenses works.
NO npm install needed.
