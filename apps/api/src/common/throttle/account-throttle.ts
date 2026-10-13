import type { ExecutionContext } from '@nestjs/common';

// Rate limits for the two public auth routes, keyed by WHO is trying rather
// than by where from.
//
// A building full of phones behind one gateway (a registration office, a
// police station) shares one IP: limiting login and refresh per IP made one
// busy minute lock everybody out, and a refresh limit counted every tab and
// every poll of every colleague. So:
//
//  - login   is limited per USERNAME (5 a minute): the account being guessed,
//            not the building. The account lockout after 5 wrong passwords
//            is separate and unchanged.
//  - refresh is limited per REFRESH TOKEN (10 a minute): one session.
//
// The looser per-IP ceiling (60 a minute, the `default` throttler on these
// two routes) stays as a backstop against one address spraying many accounts.

export type AccountThrottleKind = 'login' | 'refresh';

interface RequestLike {
  originalUrl?: string;
  url?: string;
  ip?: string;
  body?: { username?: unknown };
  cookies?: Record<string, string | undefined>;
  headers?: Record<string, string | string[] | undefined>;
}

const REFRESH_COOKIE = 'refresh_token';

function pathOf(req: RequestLike): string {
  return (req.originalUrl ?? req.url ?? '').split('?')[0]!.replace(/\/+$/, '');
}

export function accountThrottleKind(req: RequestLike): AccountThrottleKind | null {
  const path = pathOf(req);
  if (path.endsWith('/auth/login')) return 'login';
  if (path.endsWith('/auth/refresh')) return 'refresh';
  return null;
}

function cookieFromHeader(req: RequestLike): string | undefined {
  const header = req.headers?.cookie;
  const raw = Array.isArray(header) ? header.join(';') : header;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === REFRESH_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

// The key a request counts against. With nothing to key on (no username in
// the body, no refresh cookie) it falls back to the address, so such a request
// still counts against something.
export function accountTracker(req: RequestLike): string {
  const kind = accountThrottleKind(req);
  if (kind === 'login') {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    if (username) return `user:${username}`;
  }
  if (kind === 'refresh') {
    const token = req.cookies?.[REFRESH_COOKIE] ?? cookieFromHeader(req);
    if (token) return `token:${token}`;
  }
  return `ip:${req.ip ?? 'unknown'}`;
}

export const accountThrottleSkip = (context: ExecutionContext): boolean =>
  accountThrottleKind(context.switchToHttp().getRequest<RequestLike>()) === null;
