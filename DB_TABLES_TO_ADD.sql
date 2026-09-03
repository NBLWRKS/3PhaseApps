-- ============================================================================
-- EXPENSE TRACKING — add these three tables to server/src/db.js
-- Paste them INSIDE the existing db.exec(`...`) schema block, right after the
-- tracking_tasks table (before the closing `);` of that block).
-- They use CREATE TABLE IF NOT EXISTS, so they create on startup and never
-- touch existing data.
-- ============================================================================

  -- Expense Tracking: Project -> Weekly entry -> (payroll fields + line items)
  CREATE TABLE IF NOT EXISTS expense_projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    budget REAL NOT NULL DEFAULT 0,      -- 0 = no budget set
    archived INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS expense_weeks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    week_ending TEXT NOT NULL,           -- ISO date (the Friday/Sunday you close the week)
    elec_pay REAL NOT NULL DEFAULT 0,    -- electrical payroll $
    elec_hours REAL NOT NULL DEFAULT 0,  -- electrical hours
    mech_pay REAL NOT NULL DEFAULT 0,    -- mechanical payroll $
    mech_hours REAL NOT NULL DEFAULT 0,  -- mechanical hours
    notes TEXT,
    created_by TEXT,
    updated_by TEXT,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL
  );

  -- One row per expense/rental line within a week.
  CREATE TABLE IF NOT EXISTS expense_items (
    id TEXT PRIMARY KEY,
    week_id TEXT NOT NULL,
    category TEXT NOT NULL,              -- e.g. 'Equipment Rental', 'Materials', 'Other', or custom
    description TEXT,
    amount REAL NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL
  );

  -- Custom expense categories the user adds (base categories are built into the UI).
  CREATE TABLE IF NOT EXISTS expense_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_date TEXT NOT NULL
  );
