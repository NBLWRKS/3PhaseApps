// The catalog of applications available under the 3 Phase Conveyor umbrella.
// Add new apps here as they launch. `key` is what gets stored in a user's
// app_permissions map and checked by the access middleware.
export const APPS = [
  { key: 'reports', name: 'Reports' },
  { key: 'highlight', name: 'Highlight' },
  // Future apps go here, e.g. { key: 'scheduling', name: 'Scheduling' }
];

export const APP_KEYS = APPS.map((a) => a.key);

// Valid permission levels, lowest to highest. 'edit' implies 'read'.
export const LEVELS = ['read', 'edit'];

// Normalize stored permissions into a canonical object: { [appKey]: 'read'|'edit' }.
// Accepts both the NEW object format and the LEGACY array format:
//   - Legacy array ['reports','highlight']  -> { reports:'edit', highlight:'edit' }
//     (in the old model, having the app key meant full access)
//   - Object { reports:'read', highlight:'edit' } -> kept, filtered to valid apps/levels
// Anything invalid is dropped.
export function normalizePermissions(input) {
  const out = {};
  if (Array.isArray(input)) {
    for (const key of input) {
      if (APP_KEYS.includes(key)) out[key] = 'edit';
    }
    return out;
  }
  if (input && typeof input === 'object') {
    for (const [key, level] of Object.entries(input)) {
      if (APP_KEYS.includes(key) && LEVELS.includes(level)) out[key] = level;
    }
  }
  return out;
}

// Back-compat alias: older callers used sanitizePermissions(array)->array.
// Now returns the normalized object form.
export function sanitizePermissions(input) {
  return normalizePermissions(input);
}

// Does `perms` grant at least `needed` ('read' or 'edit') for `appKey`?
// 'edit' satisfies a 'read' requirement; 'read' does not satisfy 'edit'.
export function hasAppLevel(perms, appKey, needed) {
  const have = perms ? perms[appKey] : undefined;
  if (!have) return false;
  if (needed === 'read') return have === 'read' || have === 'edit';
  if (needed === 'edit') return have === 'edit';
  return false;
}
