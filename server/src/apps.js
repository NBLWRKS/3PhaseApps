// The catalog of applications available under the 3 Phase Conveyor umbrella.
// Add new apps here as they launch. `key` is what gets stored in a user's
// app_permissions list and checked by the access middleware.
export const APPS = [
  { key: 'reports', name: 'Reports' },
  { key: 'highlight', name: 'Highlight' },
  // Future apps go here, e.g. { key: 'scheduling', name: 'Scheduling' }
];

export const APP_KEYS = APPS.map((a) => a.key);

export function sanitizePermissions(input) {
  if (!Array.isArray(input)) return [];
  return input.filter((k) => APP_KEYS.includes(k));
}
