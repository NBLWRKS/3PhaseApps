// Usage:
//   node src/init-admin.js <email> <password> [role]
// role defaults to "admin". Creates the user or updates password/role if it exists.
import { nanoid } from 'nanoid';
import db from './db.js';
import { hashPassword } from './auth.js';

const [, , email, password, role = 'admin'] = process.argv;

if (!email || !password) {
  console.error('Usage: node src/init-admin.js <email> <password> [role]');
  process.exit(1);
}

const now = new Date().toISOString();
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());

if (existing) {
  db.prepare('UPDATE users SET password_hash = ?, role = ?, updated_date = ? WHERE id = ?')
    .run(hashPassword(password), role, now, existing.id);
  console.log(`Updated user ${email} (role=${role}).`);
} else {
  db.prepare(
    `INSERT INTO users (id, email, password_hash, role, app_permissions, created_date, updated_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(nanoid(), email.toLowerCase(), hashPassword(password), role, JSON.stringify(['reports']), now, now);
  console.log(`Created user ${email} (role=${role}).`);
}
