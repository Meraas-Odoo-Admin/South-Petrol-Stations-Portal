import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChangePasswordRequest,
  ChangePasswordResponse,
  LoginRequest,
  LoginResponse,
  MeResponse,
} from '@fuel-tracking/shared-types';
import {
  apiClient,
  publicClient,
  setAccessToken,
  setOnAuthFailure,
  silentRefresh,
} from '../../lib/apiClient';

const ME_QUERY_KEY = ['auth', 'me'] as const;

interface AuthContextValue {
  user: MeResponse | null;
  // True during the initial mount-time silent refresh, AND whenever we
  // hold a token but GET /auth/me for it hasn't resolved yet (right after
  // login/changePassword, or right after the mount-time refresh succeeds).
  // Consumers (RequireAuth) MUST treat this as "not yet known", not as
  // "unauthenticated" — otherwise there's a window where hasToken is true
  // but meQuery.data is still undefined, and isAuthenticated reads false,
  // which bounces a genuinely-valid session back to /login. This was a
  // real bug, caught by Playwright: every login flow redirected straight
  // back to /login because RequireAuth only gated on the mount-time
  // refresh, not on this same race recurring after every login.
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginRequest) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  changePassword: (payload: ChangePasswordRequest) => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Whether we currently hold an access token — distinct from "logged in
  // with confirmed identity" (that's `user !== null`, from /auth/me).
  const [hasToken, setHasToken] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => (await apiClient.get<MeResponse>('/auth/me')).data,
    enabled: hasToken,
    retry: false,
  });

  // On mount: no access token is ever persisted, so the only way to
  // restore a session after a page reload is to attempt a silent
  // /auth/refresh — the httpOnly refresh cookie makes this work without
  // anything stored in JS-reachable memory beforehand.
  //
  // Uses the SHARED silentRefresh() (same one the 401-retry interceptor
  // uses), not a one-off publicClient.post call — React 18 StrictMode
  // double-invokes this effect in development, and since refresh tokens
  // are single-use, two independent concurrent calls would race (one
  // rotates the token and succeeds, the other 401s against the
  // now-revoked one). silentRefresh() coalesces both invocations into one
  // real request. This was a real, confirmed bug before this fix — see
  // the comment on silentRefresh() in lib/apiClient.ts.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // silentRefresh() already calls setAccessToken internally.
        await silentRefresh();
        if (cancelled) {
          return;
        }
        setHasToken(true);
      } catch {
        // No valid session to restore — fall through to /login.
      } finally {
        if (!cancelled) {
          setIsInitializing(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setOnAuthFailure(() => {
      setAccessToken(null);
      setHasToken(false);
      queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
    });
    return () => setOnAuthFailure(null);
  }, [queryClient]);

  const login = useCallback(
    async (credentials: LoginRequest) => {
      const res = await publicClient.post<LoginResponse>('/auth/login', credentials);
      setAccessToken(res.data.accessToken);
      setHasToken(true);
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      return res.data;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      setAccessToken(null);
      setHasToken(false);
      queryClient.clear();
    }
  }, [queryClient]);

  const changePassword = useCallback(
    async (payload: ChangePasswordRequest) => {
      // Rotates this session onto a freshly issued pair (see
      // AuthService.changePassword) — the access token changes even though
      // the caller stays logged in, so it must be re-stored here.
      const res = await apiClient.post<ChangePasswordResponse>('/auth/change-password', payload);
      setAccessToken(res.data.accessToken);
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
    [queryClient],
  );

  const hasPermission = useCallback(
    (permission: string) => meQuery.data?.permissions.includes(permission) ?? false,
    [meQuery.data],
  );

  const value: AuthContextValue = {
    user: meQuery.data ?? null,
    // isInitializing: mount-time refresh still in flight.
    // hasToken && meQuery.isLoading: a token was just set (login,
    // changePassword, or the mount-time refresh just succeeded) and the
    // first /auth/me fetch for it hasn't resolved yet. Both must gate
    // rendering/redirects the same way — see the isLoading doc comment.
    isLoading: isInitializing || (hasToken && meQuery.isLoading),
    isAuthenticated: hasToken && meQuery.data != null,
    login,
    logout,
    changePassword,
    hasPermission,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
