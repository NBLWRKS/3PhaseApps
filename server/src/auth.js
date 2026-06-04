import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES = '30d';

export function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}

export function verifyPassword(pw, hash) {
  if (!hash) return false;
  return bcrypt.compareSync(pw, hash);
}

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES,
  });
}

export function getUserFromToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, email, full_name, role, app_permissions, created_date, updated_date FROM users WHERE id = ?').get(payload.sub);
    if (!user) return null;
    try {
      user.app_permissions = JSON.parse(user.app_permissions || '[]');
    } catch {
      user.app_permissions = [];
    }
    return user;
  } catch {
    return null;
  }
}

function extractToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  if (req.query && req.query.access_token) return req.query.access_token;
  return null;
}

export function authRequired(req, res, next) {
  const user = getUserFromToken(extractToken(req));
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  next();
}

export function adminRequired(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }
  next();
}

// Gate a route behind access to a specific app. Admins always pass; regular
// users must have the app key in their app_permissions list.
export function appAccessRequired(appKey) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (req.user.role === 'admin') return next();
    const perms = Array.isArray(req.user.app_permissions) ? req.user.app_permissions : [];
    if (!perms.includes(appKey)) {
      return res.status(403).json({ error: 'You do not have access to this application' });
    }
    next();
  };
}

export function optionalAuth(req, _res, next) {
  req.user = getUserFromToken(extractToken(req));
  next();
}
