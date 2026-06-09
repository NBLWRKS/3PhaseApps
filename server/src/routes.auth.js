import express from 'express';
import { nanoid } from 'nanoid';
import db from './db.js';
import {
  hashPassword,
  verifyPassword,
  signToken,
  authRequired,
} from './auth.js';

const router = express.Router();
const now = () => new Date().toISOString();

// Whether new signups are allowed without an admin invite.
const OPEN_SIGNUP = (process.env.OPEN_SIGNUP || 'true') === 'true';
// When false, OTP email verification is skipped (no mail server needed).

function createUser(email, password, role = 'user') {
  const id = nanoid();
  const ts = now();
  // New users get access to Reports by default. Admins can adjust this later
  // in the admin panel. Set explicitly rather than relying on a column default.
  const defaultPerms = JSON.stringify(['reports']);
  db.prepare(
    `INSERT INTO users (id, email, password_hash, role, app_permissions, created_date, updated_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, email.toLowerCase(), password ? hashPassword(password) : null, role, defaultPerms, ts, ts);
  return db.prepare('SELECT id, email, full_name, role, app_permissions, created_date, updated_date FROM users WHERE id = ?').get(id);
}

// POST /api/auth/register  { email, password }
router.post('/register', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

  if (!OPEN_SIGNUP) {
    return res.status(403).json({ error: 'Signups are disabled. Ask an admin to create your account.' });
  }

  // No email verification: create the account and issue a token immediately.
  const user = createUser(email, password);
  return res.json({ access_token: signToken(user), otp_required: false });
});

// POST /api/auth/verify-otp  { email, otpCode }
router.post('/verify-otp', (req, res) => {
  const { email, otpCode } = req.body || {};
  const row = db.prepare('SELECT * FROM otps WHERE email = ?').get((email || '').toLowerCase());
  if (!row || row.code !== String(otpCode)) return res.status(400).json({ error: 'Invalid verification code' });
  if (Date.now() > row.expires_at) return res.status(400).json({ error: 'Code expired' });

  const id = nanoid();
  const ts = now();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, role, created_date, updated_date)
     VALUES (?, ?, ?, 'user', ?, ?)`
  ).run(id, email.toLowerCase(), row.password_hash, ts, ts);
  db.prepare('DELETE FROM otps WHERE email = ?').run(email.toLowerCase());
  const user = db.prepare('SELECT id, email, full_name, role, created_date, updated_date FROM users WHERE id = ?').get(id);
  return res.json({ access_token: signToken(user) });
});

// POST /api/auth/resend-otp  { email }
router.post('/resend-otp', (req, res) => {
  const { email } = req.body || {};
  const row = db.prepare('SELECT * FROM otps WHERE email = ?').get((email || '').toLowerCase());
  if (!row) return res.status(400).json({ error: 'No pending verification for this email' });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  db.prepare('UPDATE otps SET code = ?, expires_at = ? WHERE email = ?')
    .run(code, Date.now() + 15 * 60 * 1000, email.toLowerCase());
  console.log(`[OTP] Verification code for ${email}: ${code}`);
  return res.json({ ok: true });
});

// POST /api/auth/login  { email, password }
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').toLowerCase());
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  return res.json({ access_token: signToken(user) });
});

// GET /api/auth/me
router.get('/me', authRequired, (req, res) => {
  res.json(req.user);
});

// POST /api/auth/reset-password-request  { email }
router.post('/reset-password-request', (req, res) => {
  const { email } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').toLowerCase());
  // Always return ok to avoid leaking which emails exist.
  if (user) {
    const token = nanoid(32);
    db.prepare('INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)')
      .run(token, user.id, Date.now() + 60 * 60 * 1000);
    const base = process.env.PUBLIC_URL || '';
    console.log(`[RESET] Password reset link for ${email}: ${base}/reset-password?token=${token}`);
  }
  res.json({ ok: true });
});

// POST /api/auth/reset-password  { resetToken, newPassword }
router.post('/reset-password', (req, res) => {
  const { resetToken, newPassword } = req.body || {};
  const row = db.prepare('SELECT * FROM password_resets WHERE token = ?').get(resetToken);
  if (!row || Date.now() > row.expires_at) return res.status(400).json({ error: 'Invalid or expired reset token' });
  db.prepare('UPDATE users SET password_hash = ?, updated_date = ? WHERE id = ?')
    .run(hashPassword(newPassword), now(), row.user_id);
  db.prepare('DELETE FROM password_resets WHERE token = ?').run(resetToken);
  res.json({ ok: true });
});

export default router;
