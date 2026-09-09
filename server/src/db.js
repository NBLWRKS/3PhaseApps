import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'app.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    app_permissions TEXT NOT NULL DEFAULT '["reports"]',
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    project TEXT NOT NULL,
    report_by TEXT,
    report_date TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    report_type TEXT NOT NULL DEFAULT 'electrical',
    workers INTEGER,
    devices_installed INTEGER,
    pipe_ran_ft REAL,
    beds_installed INTEGER,
    blocks TEXT NOT NULL DEFAULT '[]',
    created_by TEXT,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS otps (
    email TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    password_hash TEXT,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS highlights (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    project TEXT,
    team TEXT,
    image_url TEXT,
    image_width INTEGER,
    image_height INTEGER,
    regions TEXT NOT NULL DEFAULT '[]',
    pages TEXT NOT NULL DEFAULT '[]',
    created_by TEXT,
    updated_by TEXT,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL
  );

  -- Safety Credentials app: employees, their training records, and the
  -- admin-managed list of available training types.
  CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,          -- display name, e.g. "Aballay, Dayana A"
    slug TEXT NOT NULL UNIQUE,   -- URL segment, e.g. "DayanaAballay"
    active INTEGER NOT NULL DEFAULT 1,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS training_records (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    training TEXT NOT NULL,      -- training type name
    passed_date TEXT,           -- ISO date the employee passed
    expires_date TEXT,          -- optional ISO expiration date
    notes TEXT,                 -- cert #, provider, etc.
    created_by TEXT,
    updated_by TEXT,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS training_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_date TEXT NOT NULL
  );

  -- Project Tracking: Project -> Area -> Task hierarchy.
  CREATE TABLE IF NOT EXISTS tracking_projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tracking_areas (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tracking_tasks (
    id TEXT PRIMARY KEY,
    area_id TEXT NOT NULL,
    name TEXT NOT NULL,
    percent INTEGER NOT NULL DEFAULT 0,   -- 0..100
    weight REAL NOT NULL DEFAULT 1,       -- rollup weight
    blocked INTEGER NOT NULL DEFAULT 0,   -- manual blocked flag
    assignee TEXT,
    target_date TEXT,                     -- optional ISO date
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    updated_by TEXT,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL
  );

  -- Expense Tracking: Project -> Weekly entry -> (payroll fields + line items)
  CREATE TABLE IF NOT EXISTS expense_projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    budget_elec REAL NOT NULL DEFAULT 0,
    budget_mech REAL NOT NULL DEFAULT 0,
    budget_staff_elec REAL NOT NULL DEFAULT 0,
    budget_staff_mech REAL NOT NULL DEFAULT 0,
    budget_materials_elec REAL NOT NULL DEFAULT 0,
    budget_materials_mech REAL NOT NULL DEFAULT 0,
    budget_rental REAL NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS expense_weeks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    week_ending TEXT NOT NULL,
    elec_pay REAL NOT NULL DEFAULT 0,
    elec_hours REAL NOT NULL DEFAULT 0,
    mech_pay REAL NOT NULL DEFAULT 0,
    mech_hours REAL NOT NULL DEFAULT 0,
    staff_elec_pay REAL NOT NULL DEFAULT 0,
    staff_elec_hours REAL NOT NULL DEFAULT 0,
    staff_mech_pay REAL NOT NULL DEFAULT 0,
    staff_mech_hours REAL NOT NULL DEFAULT 0,
    notes TEXT,
    created_by TEXT,
    updated_by TEXT,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS expense_items (
    id TEXT PRIMARY KEY,
    week_id TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    amount REAL NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS expense_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_date TEXT NOT NULL
  );

  -- Change Orders — tracked SEPARATELY per project (not part of weekly spend).
  CREATE TABLE IF NOT EXISTS expense_change_orders (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    co_number TEXT,
    co_date TEXT,
    man_hours REAL NOT NULL DEFAULT 0,
    equipment_total REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    updated_by TEXT,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL
  );

  -- Purchase Orders — money AWARDED/received per project (revenue side),
  -- compared against spend. Not part of weekly spend.
  CREATE TABLE IF NOT EXISTS expense_purchase_orders (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    po_number TEXT,
    amount REAL NOT NULL DEFAULT 0,
    paid INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    updated_by TEXT,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL
  );
`);

// --- Lightweight migrations for databases created before these columns
// existed. ALTER TABLE ADD COLUMN is a no-op-safe op once guarded by a check. ---
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn('reports', 'report_type', "TEXT NOT NULL DEFAULT 'electrical'");
ensureColumn('reports', 'beds_installed', 'INTEGER');
ensureColumn('users', 'app_permissions', `TEXT NOT NULL DEFAULT '["reports"]'`);
ensureColumn('highlights', 'updated_by', 'TEXT');
ensureColumn('highlights', 'pages', "TEXT NOT NULL DEFAULT '[]'");
ensureColumn('highlights', 'project', 'TEXT');
ensureColumn('highlights', 'team', 'TEXT');
ensureColumn('highlights', 'legend', "TEXT NOT NULL DEFAULT '{}'");
// Expense per-category budgets (safety net if an older expense_projects shipped first)
ensureColumn('expense_projects', 'budget_elec', 'REAL NOT NULL DEFAULT 0');
ensureColumn('expense_projects', 'budget_mech', 'REAL NOT NULL DEFAULT 0');
ensureColumn('expense_projects', 'budget_staff_elec', 'REAL NOT NULL DEFAULT 0');
ensureColumn('expense_projects', 'budget_staff_mech', 'REAL NOT NULL DEFAULT 0');
ensureColumn('expense_projects', 'budget_materials_elec', 'REAL NOT NULL DEFAULT 0');
ensureColumn('expense_projects', 'budget_materials_mech', 'REAL NOT NULL DEFAULT 0');
ensureColumn('expense_projects', 'budget_rental', 'REAL NOT NULL DEFAULT 0');
// Staffing payroll on weeks
ensureColumn('expense_weeks', 'staff_elec_pay', 'REAL NOT NULL DEFAULT 0');
ensureColumn('expense_weeks', 'staff_elec_hours', 'REAL NOT NULL DEFAULT 0');
ensureColumn('expense_weeks', 'staff_mech_pay', 'REAL NOT NULL DEFAULT 0');
ensureColumn('expense_weeks', 'staff_mech_hours', 'REAL NOT NULL DEFAULT 0');

// --- Seed Safety Credentials data on first run (only if employees is empty) ---
function slugify(name) {
  // "Aballay, Dayana A" -> "DayanaAballay" (given-name first, middle initials
  // dropped, compound surnames kept).
  const parts = name.split(',').map((s) => s.trim());
  const first = (parts[1] || '').trim();
  const last = (parts[0] || '').trim();
  const firstClean = first.split(/\s+/).filter((w) => w.length > 1).join(' ') || first;
  const ordered = `${firstClean} ${last}`.trim();
  return ordered
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^A-Za-z0-9 ]/g, '')                    // drop punctuation
    .split(/\s+/).filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

const EMPLOYEE_SEED = [
  'Aballay, Dayana A', 'Aguirre Torres, Sebastian', 'Anez, Luis A', 'Angarita Torres, Breyner A',
  'Barrios, Yefferson', 'Carlos, Camilo', 'Ceniceros Rodriguez, Esau', 'Chaparro, Amparo',
  'Cobon, Ofni', 'Delucenay, Neil', 'Diaz Torres, Pedro', 'Escobedo Sanchez, Yeison V',
  'Gaeta, Julian', 'Hansen, Seth', 'Jacinto, Antonio A', 'Jacinto, Juan J', 'Juares, Elmer',
  'Lizardo, Anthony j', 'Lizardo, Hugo A', 'Lopez, Israel', 'Lopez, Orvik A', 'Lopez Escobedo, Julio Y',
  'Martinez, Juan C', 'Mavares Sanchez, Viky C', 'Medina, John J', 'Mejia, Alicia A',
  'Morales Lopez, Elder Daniel', 'Noble, Jacob L', 'Noble, Robert E', 'Nolasco Ruiz, Kevin E',
  'Ornelas, Sergio', 'Orta Gonzalez, Luis Miguel', 'Ortiz Torres, Kevin J', 'Palacios, Robinson',
  'Peralta Hernandez, Gelasio', 'Perdomo, Aura V', 'Perdomo, Jorge L', 'Quintero, Monica J',
  'Quintero, Sebastian', 'Ramirez Carrizales, Jose Antonio', 'Ramirez Ruiz, Jose M', 'Reyes, Marvin',
  'Rodriguez, Esteban', 'Rojas, Andry', 'Rojas Ortega, Alejandro', 'Rojas Perez, William',
  'Saenz Herrera, Dairin G', 'Saenz Herrera, Marvin I', 'Saenz Herrera, Queneddi E', 'Sanchez, Hector',
  'Sanchez Torres, Carlos', 'Strong, Dylan', 'Suescun, Elkin P', 'Vazquez, Carlos',
  'Velasquez Gomez, Juan J', 'Villatoro, Geymen N', 'Villatoro, Rolin A',
];

const TRAINING_TYPE_SEED = [
  'OSHA 10', 'OSHA 30', 'Forklift Certification', 'Aerial/Scissor Lift', 'Fall Protection',
  'Lockout/Tagout (LOTO)', 'First Aid / CPR', 'Confined Space', 'Arc Flash / NFPA 70E',
];

const empCount = db.prepare('SELECT COUNT(*) AS c FROM employees').get().c;
if (empCount === 0) {
  const ts = new Date().toISOString();
  const insEmp = db.prepare(
    'INSERT INTO employees (id, name, slug, active, created_date, updated_date) VALUES (?, ?, ?, 1, ?, ?)'
  );
  const usedSlugs = new Set();
  const mkId = () => 'emp_' + Math.random().toString(36).slice(2, 12);
  const seedEmp = db.transaction(() => {
    for (const name of EMPLOYEE_SEED) {
      let slug = slugify(name);
      let s = slug, n = 2;
      while (usedSlugs.has(s)) { s = `${slug}${n++}`; } // de-dupe slugs
      usedSlugs.add(s);
      insEmp.run(mkId(), name.replace(/\s+/g, ' ').trim(), s, ts, ts);
    }
  });
  seedEmp();
  console.log(`[seed] inserted ${EMPLOYEE_SEED.length} employees`);
}

const ttCount = db.prepare('SELECT COUNT(*) AS c FROM training_types').get().c;
if (ttCount === 0) {
  const ts = new Date().toISOString();
  const insTT = db.prepare('INSERT INTO training_types (id, name, created_date) VALUES (?, ?, ?)');
  const mkId = () => 'tt_' + Math.random().toString(36).slice(2, 10);
  const seedTT = db.transaction(() => {
    for (const name of TRAINING_TYPE_SEED) insTT.run(mkId(), name, ts);
  });
  seedTT();
  console.log(`[seed] inserted ${TRAINING_TYPE_SEED.length} training types`);
}

export default db;
