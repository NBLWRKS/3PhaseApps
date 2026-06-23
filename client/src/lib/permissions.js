// Helpers for reading the per-app permission map: { [appKey]: level }.
// Levels, low to high: 'read' < 'edit' < 'supervisor'. Admins implicitly have
// the highest level on everything. Also tolerates the legacy array form
// ['reports'] (treated as edit) in case an old token is still around.

const RANK = { read: 1, edit: 2, supervisor: 3 };

function normalize(perms) {
  if (Array.isArray(perms)) {
    const o = {};
    for (const k of perms) o[k] = 'edit';
    return o;
  }
  return perms && typeof perms === 'object' ? perms : {};
}

export function appLevel(user, appKey) {
  if (!user) return 'none';
  if (user.role === 'admin') return 'supervisor';
  const perms = normalize(user.app_permissions);
  return perms[appKey] || 'none';
}

function atLeast(user, appKey, needed) {
  const have = appLevel(user, appKey);
  return (RANK[have] || 0) >= (RANK[needed] || 0);
}

// At least read access (read, edit, or supervisor).
export function canRead(user, appKey) {
  return atLeast(user, appKey, 'read');
}

// At least edit access (edit or supervisor). Create/update/delete.
export function canEdit(user, appKey) {
  return atLeast(user, appKey, 'edit');
}

// Supervisor access: can view AND edit reports submitted by anyone, not just
// their own. Admins included.
export function canSupervise(user, appKey) {
  return atLeast(user, appKey, 'supervisor');
}
