export * from './health';

// DELIBERATELY INCREMENTAL: only login/refresh/me/change-password and the
// reports module's request/response shapes are mirrored here, because
// that's what M4's frontend actually consumes. Every other M1-M3 DTO
// (companies, stations, drivers, owners, vehicles, fillups create/approve)
// still lives only in apps/api and is NOT yet duplicated here — that's
// separate, larger retrofit work, not an oversight. Add a module's shapes
// here only when the frontend actually starts consuming that module.
export * from './auth';
export * from './pagination';
export * from './reports';
