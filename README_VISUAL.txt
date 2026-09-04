EXPENSE APP — visual/organization polish (1 file)
==================================================
Replaces: client/src/pages/Expenses.jsx
(Builds on the notes + change-orders update; this only restyles the entry page.)

WHAT CHANGED (per the direction you chose):
1. KPI STAT ROW per selected project — four big-number tiles across the top:
   Total Spend (of budget), Budget Used % (with remaining, colored green/amber/red),
   Man Hours, Payroll. Each tile has a colored accent rail.
2. BUDGET SET APART — the 7 category budget cards now live in a distinct
   "Budget vs. Actual" panel (lighter secondary surface) so the glance-level
   summary stands separate from data entry.
3. CLEAR SECTIONING — the header, KPIs, Budget panel, "Weekly Entry", and
   "Change Orders" are now visually distinct sections with labels, instead of
   one flat stack of same-weight cards.
4. Dark theme kept.

Everything functional is unchanged (4 payroll categories, split materials,
weekly notes, change orders, import, single-project dropdown).

VERIFIED: compiles clean; structure/hierarchy confirmed in a render. Pixel-level
styling (grids/spacing/panel shade) renders in your Vite build — it couldn't be
fully previewed in-sandbox (Tailwind CDN limitation), so eyeball it once live and
tell me any spacing tweaks.

NO npm install. Commit, push, hard-refresh.
