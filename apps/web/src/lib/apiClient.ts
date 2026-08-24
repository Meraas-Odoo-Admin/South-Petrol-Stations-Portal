import axios from 'axios';

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

let refreshPromise: Promise<string> | null = null;

// Coalesces ALL concurrent callers (the 401-retry path below, AND
// AuthProvider's mount-time silent refresh) into a single in-flight
// /auth/refresh call, sharing one promise rather than each firing its own
// request. This isn't just an optimization: refresh tokens are single-use
// (rotated on every call), so two concurrent real requests race — one
// succeeds and rotates the cookie, the other 401s using the now-revoked
// token. React 18 StrictMode double-invokes effects in development, so
// AuthProvider's mount effect genuinely fires twice on every page load;
// without this coalescing, the second (losing) call's 401 would leave
// React state believing there's no session, even though the first call's
// response had already established a perfectly valid one — a real bug,
// caught by an actual browser reload in Playwright testing, not something
// tsc/eslint could ever have caught.
export async function silentRefresh(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = publicClient
      .post<{ accessToken: string }>('/auth/refresh')
      .then((res) => {
        setAccessToken(res.data.accessToken);
        return res.data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as (typeof error.config & { _retry?: boolean }) | undefined;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const token = await silentRefresh();
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
