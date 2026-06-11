// Helpers for reading the per-app permission map: { [appKey]: 'read' | 'edit' }.
// Admins implicitly have edit on everything. These also tolerate the legacy
// array form ['reports'] (treated as edit) in case an old token is still around.

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
  if (user.role === 'admin') return 'edit';
  const perms = normalize(user.app_permissions);
  return perms[appKey] || 'none';
}

// At least read access (read or edit).
export function canRead(user, appKey) {
  const l = appLevel(user, appKey);
  return l === 'read' || l === 'edit';
}

// Edit access (create/update/delete).
export function canEdit(user, appKey) {
  return appLevel(user, appKey) === 'edit';
}
