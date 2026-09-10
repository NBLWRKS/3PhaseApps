// Drop-in replacement for the Base44 SDK client.
// Exposes the same surface the app uses:
//   base44.auth.{me,loginViaEmailPassword,loginWithProvider,register,verifyOtp,
//               resendOtp,setToken,logout,redirectToLogin,
//               resetPasswordRequest,resetPassword}
//   base44.entities.Report.{list,filter,get,create,update,delete}
//   base44.integrations.Core.UploadFile({ file })
//   base44.functions.invoke(name, body)

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const TOKEN_KEY = 'pm_access_token';

function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function setToken(t) {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

async function request(method, pathName, { body, isForm } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let payload;
  if (isForm) {
    payload = body; // FormData
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${pathName}`, { method, headers, body: payload });
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    const err = new Error((data && data.error) || res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function buildQuery(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) sp.append(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// --- Entity factory (mirrors base44 entity methods) ---
function entity(name) {
  const base = `/entities/${name}`;
  return {
    list: (sort, limit) => request('GET', `${base}${buildQuery({ sort, limit })}`),
    filter: (filters = {}, sort, limit) =>
      request('GET', `${base}${buildQuery({ ...filters, sort, limit })}`),
    get: (id) => request('GET', `${base}/${id}`),
    create: (data) => request('POST', base, { body: data }),
    update: (id, data) => request('PUT', `${base}/${id}`, { body: data }),
    delete: (id) => request('DELETE', `${base}/${id}`),
  };
}

const auth = {
  me: () => request('GET', '/auth/me'),

  loginViaEmailPassword: async (email, password) => {
    const r = await request('POST', '/auth/login', { body: { email, password } });
    if (r?.access_token) setToken(r.access_token);
    return r;
  },

  loginWithProvider: (_provider, _next) => {
    window.location.href = '/login';
  },

  register: ({ email, password }) =>
    request('POST', '/auth/register', { body: { email, password } }).then((r) => {
      if (r?.access_token) setToken(r.access_token);
      return r;
    }),

  verifyOtp: ({ email, otpCode }) =>
    request('POST', '/auth/verify-otp', { body: { email, otpCode } }),

  resendOtp: (email) => request('POST', '/auth/resend-otp', { body: { email } }),

  setToken: (t) => setToken(t),

  logout: (redirectTo) => {
    setToken(null);
    window.location.href = '/login';
  },

  redirectToLogin: (_fromUrl) => {
    window.location.href = '/login';
  },

  resetPasswordRequest: (email) =>
    request('POST', '/auth/reset-password-request', { body: { email } }),

  resetPassword: ({ resetToken, newPassword }) =>
    request('POST', '/auth/reset-password', { body: { resetToken, newPassword } }),
};

const integrations = {
  Core: {
    UploadFile: async ({ file }) => {
      const form = new FormData();
      form.append('file', file);
      return request('POST', '/integrations/upload', { body: form, isForm: true });
    },
  },
};

const functions = {
  invoke: (name, body) => request('POST', `/functions/${name}`, { body }),
};

// Admin: manage users, roles, and per-app permissions.
const admin = {
  listApps: () => request('GET', '/admin/apps'),
  listUsers: () => request('GET', '/admin/users'),
  updateUser: (id, { role, app_permissions }) =>
    request('PUT', `/admin/users/${id}`, { body: { role, app_permissions } }),
};

// Highlight app: convert PDFs to PNG and manage highlighted conveyor docs.
const highlight = {
  convertPdf: async (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('POST', '/highlight/convert', { body: form, isForm: true });
  },
  list: () => request('GET', '/highlight'),
  get: (id) => request('GET', `/highlight/${id}`),
  create: (data) => request('POST', '/highlight', { body: data }),
  update: (id, data) => request('PUT', `/highlight/${id}`, { body: data }),
  delete: (id) => request('DELETE', `/highlight/${id}`),
  // Build a flattened PDF (page images + highlights) of the current document
  // state and trigger a browser download. Works before saving.
  exportPdf: async (data) => {
    const token = getToken();
    const res = await fetch(`${API_BASE}/highlight/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      let msg = res.statusText;
      try { const j = await res.json(); msg = j.error || msg; } catch { /* non-json */ }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const safe = (data.title || 'highlight').replace(/[^\w.-]+/g, '_').slice(0, 80);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safe}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

const safety = {
  // Training types
  listTrainingTypes: () => request('GET', '/safety/training-types'),
  addTrainingType: (name) => request('POST', '/safety/training-types', { body: { name } }),
  deleteTrainingType: (id) => request('DELETE', `/safety/training-types/${id}`),
  // Employees
  listEmployees: () => request('GET', '/safety/employees'),
  getEmployee: (slug) => request('GET', `/safety/employees/${slug}`),
  getPublicCard: async (slug) => {
    const res = await fetch(`${API_BASE}/public/safety/card/${encodeURIComponent(slug)}`);
    if (!res.ok) throw new Error('Not found');
    return res.json();
  },
  addEmployee: (name) => request('POST', '/safety/employees', { body: { name } }),
  updateEmployee: (id, data) => request('PUT', `/safety/employees/${id}`, { body: data }),
  deleteEmployee: (id) => request('DELETE', `/safety/employees/${id}`),
  // Training records
  addRecord: (employeeId, data) => request('POST', `/safety/employees/${employeeId}/records`, { body: data }),
  updateRecord: (id, data) => request('PUT', `/safety/records/${id}`, { body: data }),
  deleteRecord: (id) => request('DELETE', `/safety/records/${id}`),
};

const tracking = {
  summary: (projectId) => request('GET', '/tracking/summary' + (projectId ? `?project=${projectId}` : '')),
  listProjects: () => request('GET', '/tracking/projects'),
  addProject: (name) => request('POST', '/tracking/projects', { body: { name } }),
  updateProject: (id, data) => request('PUT', `/tracking/projects/${id}`, { body: data }),
  deleteProject: (id) => request('DELETE', `/tracking/projects/${id}`),
  duplicateProject: (id, name) => request('POST', `/tracking/projects/${id}/duplicate`, { body: name ? { name } : {} }),
  addArea: (project_id, name) => request('POST', '/tracking/areas', { body: { project_id, name } }),
  updateArea: (id, data) => request('PUT', `/tracking/areas/${id}`, { body: data }),
  deleteArea: (id) => request('DELETE', `/tracking/areas/${id}`),
  addTask: (area_id, data) => request('POST', '/tracking/tasks', { body: { area_id, ...data } }),
  updateTask: (id, data) => request('PUT', `/tracking/tasks/${id}`, { body: data }),
  deleteTask: (id) => request('DELETE', `/tracking/tasks/${id}`),
  reorderProjects: (ids) => request('POST', '/tracking/projects/reorder', { body: { ids } }),
  reorderAreas: (ids) => request('POST', '/tracking/areas/reorder', { body: { ids } }),
  reorderTasks: (ids) => request('POST', '/tracking/tasks/reorder', { body: { ids } }),
};

const expenses = {
  summary: (projectId) => request('GET', '/expenses/summary' + (projectId ? `?project=${projectId}` : '')),
  listProjects: () => request('GET', '/expenses/projects'),
  addProject: (data) => request('POST', '/expenses/projects', { body: data }),
  updateProject: (id, data) => request('PUT', `/expenses/projects/${id}`, { body: data }),
  deleteProject: (id) => request('DELETE', `/expenses/projects/${id}`),
  listCategories: () => request('GET', '/expenses/categories'),
  addCategory: (name) => request('POST', '/expenses/categories', { body: { name } }),
  addWeek: (data) => request('POST', '/expenses/weeks', { body: data }),
  updateWeek: (id, data) => request('PUT', `/expenses/weeks/${id}`, { body: data }),
  deleteWeek: (id) => request('DELETE', `/expenses/weeks/${id}`),
  addItem: (data) => request('POST', '/expenses/items', { body: data }),
  updateItem: (id, data) => request('PUT', `/expenses/items/${id}`, { body: data }),
  deleteItem: (id) => request('DELETE', `/expenses/items/${id}`),
  importWeeks: (project_id, rows) => request('POST', '/expenses/import', { body: { project_id, rows } }),
  addChangeOrder: (data) => request('POST', '/expenses/change-orders', { body: data }),
  updateChangeOrder: (id, data) => request('PUT', `/expenses/change-orders/${id}`, { body: data }),
  deleteChangeOrder: (id) => request('DELETE', `/expenses/change-orders/${id}`),
  addPO: (data) => request('POST', '/expenses/purchase-orders', { body: data }),
  updatePO: (id, data) => request('PUT', `/expenses/purchase-orders/${id}`, { body: data }),
  deletePO: (id) => request('DELETE', `/expenses/purchase-orders/${id}`),
  listRentalTypes: () => request('GET', '/expenses/rental-types'),
  addRentalType: (name) => request('POST', '/expenses/rental-types', { body: { name } }),
  addRental: (data) => request('POST', '/expenses/rentals', { body: data }),
  updateRental: (id, data) => request('PUT', `/expenses/rentals/${id}`, { body: data }),
  deleteRental: (id) => request('DELETE', `/expenses/rentals/${id}`),
};

export const base44 = {
  auth,
  entities: { Report: entity('Report'), User: entity('User') },
  integrations,
  functions,
  admin,
  highlight,
  safety,
  tracking,
  expenses,
  _getToken: getToken,
  _setToken: setToken,
};

export default base44;
