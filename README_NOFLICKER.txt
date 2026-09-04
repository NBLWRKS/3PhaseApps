EXPENSE APP — stop the soft-refresh/flicker on every edit (1 file)
==================================================================
Replaces: client/src/pages/Expenses.jsx

PROBLEM: after every field edit or dropdown change, the page called a full
reload that flipped the whole view to a "Loading…" state and re-mounted it —
the visible "soft refresh" flicker.

FIX: value edits and add/delete now do a SILENT refresh — the data (and all
totals / budget % / KPIs) still updates in the background, but the loading
spinner never shows and the view never re-mounts, so there's no flicker.
The spinner still appears only on first load and on the deliberate modal
actions (New Project, Import).

VERIFIED: simulated editing a payroll field — the summary refreshed (totals
update) while the "Loading…" state never appeared. Compiles clean.

NO npm install. Commit, push, hard-refresh. Supersedes the previous
Expenses.jsx (visual-polish) bundle.
