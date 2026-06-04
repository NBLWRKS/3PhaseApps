import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import authRoutes from './routes.auth.js';
import reportRoutes from './routes.reports.js';
import uploadRoutes, { uploadDir } from './routes.uploads.js';
import functionRoutes from './routes.functions.js';
import adminRoutes from './routes.admin.js';
import highlightRoutes from './routes.highlight.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// In a split deployment the frontend (static site) lives on a different origin
// than this API. CORS_ORIGIN should be set to that site's URL, e.g.
// https://app.yourdomain.com. Comma-separate to allow more than one (such as a
// local dev origin). If unset, falls back to allowing all origins.
const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: corsOrigins.length ? corsOrigins : true,
  })
);
app.use(express.json({ limit: '5mb' }));

// Serve uploaded files
app.use('/uploads', express.static(uploadDir, { maxAge: '7d' }));

// --- API ---
app.use('/api/auth', authRoutes);
app.use('/api/entities/Report', reportRoutes);
app.use('/api/integrations', uploadRoutes);
app.use('/api/functions', functionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/highlight', highlightRoutes);

// Public app settings endpoint (frontend AuthContext probes this).
// Auth here is "required" so the app gates behind login.
app.get('/api/apps/public/prod/public-settings/by-id/:appId', (req, res) => {
  res.json({
    id: req.params.appId,
    public_settings: {
      name: 'PhaseMaster',
      requiresAuth: true,
    },
  });
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// --- Static frontend (built SPA) ---
const clientDir = path.join(__dirname, '..', '..', 'client-dist');
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir));
  // SPA fallback: send index.html for any non-API, non-upload GET.
  // Implemented as middleware (instead of app.get('*')) so it works on both
  // Express 4 and Express 5 (whose path syntax rejects a bare '*').
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`PhaseMaster server listening on :${PORT}`);
  if ((process.env.JWT_SECRET || 'change-me-in-production') === 'change-me-in-production') {
    console.warn('WARNING: JWT_SECRET is using the insecure default. Set it in your .env before going live.');
  }
});
