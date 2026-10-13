// Single-flight token refresh.
//
// A page makes many requests at once (the screen's own, the bell, the stock
// strip, the nav badges). When the access token has expired they all come back
// 401 together. Refresh tokens are single-use (rotated on every call), so each
// of them calling /auth/refresh would be wrong twice over: one wins and the
// rest fail on the token it just rotated, and the server's limit counts all of
// them.
//
// So there is exactly ONE refresh call per expiry:
//   1. a caller that arrives while a refresh is in flight waits for it;
//   2. a caller whose request was sent with a token that is no longer the
//      current one (the refresh already finished while its response was on the
//      way back) does not refresh at all: it retries with the current token.
//
// No module state outside the coordinator, no browser APIs: it is unit-tested
// with plain functions (refreshCoordinator.test.ts).

export interface RefreshCoordinator {
  /** Every caller of a refresh shares the one in-flight call. */
  refresh(): Promise<string>;
  /**
   * A request sent with `sentToken` came back 401: the token to retry with.
   * Reuses the current token when it has already been replaced; otherwise
   * joins (or starts) the single refresh.
   */
  tokenAfterUnauthorized(sentToken: string | null): Promise<string>;
}

export function createRefreshCoordinator(options: {
  /** Performs the one real refresh and returns the new access token. */
  doRefresh: () => Promise<string>;
  getToken: () => string | null;
  setToken: (token: string | null) => void;
}): RefreshCoordinator {
  let inFlight: Promise<string> | null = null;

  function refresh(): Promise<string> {
    if (!inFlight) {
      inFlight = options
        .doRefresh()
        .then((token) => {
          options.setToken(token);
          return token;
        })
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  }

  async function tokenAfterUnauthorized(sentToken: string | null): Promise<string> {
    const current = options.getToken();
    if (!inFlight && current && current !== sentToken) {
      return current;
    }
    return refresh();
  }

  return { refresh, tokenAfterUnauthorized };
}
