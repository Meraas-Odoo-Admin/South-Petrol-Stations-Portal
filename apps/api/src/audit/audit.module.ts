import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditReadService } from './audit-read.service';
import { AuditController } from './audit.controller';

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditReadService],
  exports: [AuditService],
})
export class AuditModule {}
