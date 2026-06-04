// Minimal app params for the self-hosted build.
// The original pulled tokens/appId from URL + Base44; here auth is handled
// entirely by the local API client, so this is just a lightweight stub.
const isBrowser = typeof window !== 'undefined';

export const appParams = {
  appId: import.meta.env.VITE_APP_ID || 'phasemaster',
  token: null,
  fromUrl: isBrowser ? window.location.href : '',
  functionsVersion: null,
  appBaseUrl: import.meta.env.VITE_API_BASE || '/api',
};
