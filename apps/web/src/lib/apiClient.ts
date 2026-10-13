import axios from 'axios';
import { createRefreshCoordinator } from './refreshCoordinator';

// Access token lives in memory ONLY — never localStorage. Putting it there
// would undermine the entire reason the refresh token is httpOnly in the
// first place (XSS-readable storage for one token defeats the point of
// making the other one XSS-proof). The single source of truth is
// AuthProvider's React state; this module-level variable exists only so
// the axios interceptor (which runs outside React's render cycle) can read
// the current value synchronously.
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

const baseURL = import.meta.env.VITE_API_BASE_URL;

// No interceptors — used for /auth/login and the initial silent
// /auth/refresh on app load, neither of which should trigger the
// attach-token / retry-on-401 behavior below.
export const publicClient = axios.create({ baseURL, withCredentials: true });

export const apiClient = axios.create({ baseURL, withCredentials: true });

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Registered by AuthProvider — called when a 401 survives the one retry
// below, i.e. the session is genuinely gone (refresh token expired/
// revoked). Navigation to /login needs React Router's context, which this
// module doesn't have, so AuthProvider supplies the callback instead.
let onAuthFailure: (() => void) | null = null;
export function setOnAuthFailure(callback: (() => void) | null): void {
  onAuthFailure = callback;
}

// ONE refresh per expiry, however many requests came back 401 at once and
// whenever their responses arrive (see refreshCoordinator.ts, which has the
// reasoning and the unit test). AuthProvider's mount-time refresh uses the
// same coordinator, so React 18 StrictMode's double-invoked effect shares one
// call too.
const coordinator = createRefreshCoordinator({
  doRefresh: async () => (await publicClient.post<{ accessToken: string }>('/auth/refresh')).data.accessToken,
  getToken: getAccessToken,
  setToken: setAccessToken,
});

export function silentRefresh(): Promise<string> {
  return coordinator.refresh();
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as (typeof error.config & { _retry?: boolean }) | undefined;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        // The token this request was SENT with: if it is no longer the current
        // one, a refresh already happened and no new call is made.
        const header = String(originalRequest.headers?.Authorization ?? '');
        const sentToken = header.startsWith('Bearer ') ? header.slice(7) : null;
        const token = await coordinator.tokenAfterUnauthorized(sentToken);
        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        setAccessToken(null);
        onAuthFailure?.();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);
