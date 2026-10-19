import { applyDecorators, CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata, UseInterceptors } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import type { Request } from 'express';
import { AuditService } from './audit.service';

// After review (19 Oct 2026): every report export is in the audit log — who
// took which report out of the system, with which filters, from where (the
// address and device come from the request, common/request-context.ts). A
// file leaves the system with people's names, plates and fill-ups in it;
// until now nothing recorded that it had. Recorded once the export succeeded.
const AUDITED_EXPORT = 'auditedExport';

@Injectable()
export class ExportAuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const report = this.reflector.get<string>(AUDITED_EXPORT, context.getHandler());
    const req = context.switchToHttp().getRequest<Request & { user?: { id?: string } }>();
    return next.handle().pipe(
      tap(() => {
        void this.audit
          .log({
            userId: req.user?.id ?? null,
            action: 'EXPORT',
            entityType: 'Report',
            entityId: report,
            newValue: { filters: { ...(req.query as Record<string, unknown>) } } as never,
          })
          .catch(() => undefined);
      }),
    );
  }
}

// On an export endpoint: @AuditedExport('daily').
export const AuditedExport = (report: string) => applyDecorators(SetMetadata(AUDITED_EXPORT, report), UseInterceptors(ExportAuditInterceptor));
