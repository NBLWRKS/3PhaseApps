import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import { authRequired } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
    cb(null, `${nanoid()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (_req, file, cb) => {
    // Accept standard images plus mobile formats (HEIC/HEIF from iPhone). Some
    // mobile browsers send an empty or octet-stream mimetype, so also accept
    // based on a recognized image file extension as a fallback.
    const okMime = /^image\//i.test(file.mimetype)
      || /^(application\/octet-stream)?$/i.test(file.mimetype || '');
    const okExt = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(file.originalname || '');
    cb(null, okMime || okExt);
  },
});

const router = express.Router();

// POST /api/integrations/upload  (multipart, field: "file")
// Returns { file_url } to match base44 UploadFile response shape.
router.post('/upload', authRequired, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ file_url: `${publicBase()}/uploads/${req.file.filename}` });
});

// Normalize PUBLIC_URL into a clean absolute origin with no trailing slash:
//   "3phaseapps.com/"        -> "https://3phaseapps.com"
//   "https://x.com/"         -> "https://x.com"
//   ""                       -> "" (relative path fallback)
export function publicBase() {
  let base = (process.env.PUBLIC_URL || '').trim();
  if (!base) return '';
  base = base.replace(/\/+$/, ''); // strip trailing slashes
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  return base;
}

export { uploadDir };
export default router;
