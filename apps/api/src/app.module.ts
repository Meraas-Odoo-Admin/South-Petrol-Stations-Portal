import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { AuditModule } from './audit/audit.module';
import { RbacModule } from './rbac/rbac.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { MunicipalitiesModule } from './municipalities/municipalities.module';
import { RoutesModule } from './routes/routes.module';
import { SecurityAuthoritiesModule } from './security-authorities/security-authorities.module';
import { StationsModule } from './stations/stations.module';
import { RegistrationStationsModule } from './registration-stations/registration-stations.module';
import { CardsModule } from './cards/cards.module';
import { RegistrationReportsModule } from './registration-reports/registration-reports.module';
import { OwnersModule } from './owners/owners.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { VehicleTypesModule } from './vehicle-types/vehicle-types.module';
import { SystemSettingsModule } from './system-settings/system-settings.module';
import { FillUpsModule } from './fillups/fillups.module';
import { ReportsModule } from './reports/reports.module';
import { RolesModule } from './roles/roles.module';
import { NotificationsModule } from './notifications/notifications.module';
import { FuelStockModule } from './fuel-stock/fuel-stock.module';
import { OpsReportsModule } from './ops-reports/ops-reports.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './rbac/guards/permissions.guard';
import { accountThrottleSkip, accountTracker } from './common/throttle/account-throttle';
import { RequestContextInterceptor } from './common/request-context';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    ThrottlerModule.forRoot([
      // Every route, per IP.
      {
        name: 'default',
        ttl: 60_000,
        limit: 100,
      },
      // Login (per username) and refresh (per refresh token), see
      // common/throttle/account-throttle.ts. Skipped on every other route;
      // the route's own @Throttle sets the limit.
      {
        name: 'account',
        ttl: 60_000,
        limit: 10,
        skipIf: accountThrottleSkip,
        getTracker: (req) => accountTracker(req),
      },
    ]),
    PrismaModule,
    AuditModule,
    RbacModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    MunicipalitiesModule,
    RoutesModule,
    SecurityAuthoritiesModule,
    StationsModule,
    RegistrationStationsModule,
    CardsModule,
    RegistrationReportsModule,
    OwnersModule,
    VehiclesModule,
    VehicleTypesModule,
    SystemSettingsModule,
    FillUpsModule,
    ReportsModule,
    RolesModule,
    NotificationsModule,
    FuelStockModule,
    OpsReportsModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Order matters: authenticate first, then authorize. Both fail closed —
    // see JwtAuthGuard/@Public and PermissionsGuard/@RequirePermission.
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    // Where each request came from (address, device), for the audit log.
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestContextInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
