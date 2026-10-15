import { AsyncLocalStorage } from 'async_hooks';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { Request } from 'express';

// Where a request came from, for the audit log (after review, 15 Oct 2026):
// every entry carries the address and the device without each of the ~80
// places that write one having to pass them along.
export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

// The context of the request being handled, or undefined outside one (a CLI
// script, a scheduled job).
export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

// A user agent is free text the caller controls: kept, but never unbounded.
const MAX_USER_AGENT = 512;

export function requestContextOf(req: Pick<Request, 'ip' | 'headers'>): RequestContext {
  const ua = req.headers?.['user-agent'];
  const userAgent = typeof ua === 'string' && ua.trim() ? ua.trim().slice(0, MAX_USER_AGENT) : null;
  // req.ip is the client's own address only when `trust proxy` matches the
  // proxies in front of the API (TRUST_PROXY_HOPS, main.ts).
  return { ip: req.ip ?? null, userAgent };
}

// Runs the handler INSIDE the context: the handler only starts when the
// returned observable is subscribed to, so the subscription itself is what
// runs in storage.run — not just the call that builds the observable.
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const store = requestContextOf(context.switchToHttp().getRequest<Request>());
    return new Observable((subscriber) => storage.run(store, () => next.handle().subscribe(subscriber)));
  }
}
