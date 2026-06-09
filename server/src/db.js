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

export default db;
