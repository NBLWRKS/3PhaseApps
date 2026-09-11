-- Add to server/src/db.js INSIDE the db.exec(`...`) schema block
-- (e.g. right after the training_types table). Additive, no data loss.

  CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    applicant TEXT,
    lang TEXT,
    files TEXT NOT NULL DEFAULT '[]',   -- JSON array: [{stored, name, size}]
    created_date TEXT NOT NULL
  );
