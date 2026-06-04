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
};

export const base44 = {
  auth,
  entities: { Report: entity('Report'), User: entity('User') },
  integrations,
  functions,
  admin,
  highlight,
  _getToken: getToken,
  _setToken: setToken,
};

export default base44;
