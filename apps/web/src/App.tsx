import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthProvider';
import { RequireAuth } from './components/RequireAuth';
import { Layout } from './components/Layout';
import { LoginPage } from './features/auth/LoginPage';
import { ChangePasswordPage } from './features/auth/ChangePasswordPage';
import { HomePage } from './features/home/HomePage';
import { DashboardPage } from './features/reports/DashboardPage';
import { DailyReportPage } from './features/reports/DailyReportPage';
import { ViolationsPage } from './features/reports/ViolationsPage';
import { DriverDetailPage } from './features/drivers/DriverDetailPage';
import { DriversListPage } from './features/drivers/DriversListPage';
import { VehicleDetailPage } from './features/vehicles/VehicleDetailPage';
import { VehiclesListPage } from './features/vehicles/VehiclesListPage';
import { ChangeRequestsQueuePage } from './features/vehicles/ChangeRequestsQueuePage';
import { StationsListPage } from './features/stations/StationsListPage';
import { RecordFillUpPage } from './features/fillups/RecordFillUpPage';
import { AdminLayout } from './features/admin/AdminLayout';
import { UsersAdminPage } from './features/admin/UsersAdminPage';
import { SettingsAdminPage } from './features/admin/SettingsAdminPage';
import { ExceptionTypesAdminPage } from './features/admin/ExceptionTypesAdminPage';
import { AuditLogAdminPage } from './features/admin/AuditLogAdminPage';
import { StationsAdminPage } from './features/admin/StationsAdminPage';

// Route structure mirrors backend modules, per docs/IMPLEMENTATION_PLAN.md
// §9. /fillups/new is the recording screen (create only — the exceptions
// LIST is /reports/violations, and its approve action lives inline there,
// not under a separate /exceptions route).
//
// Item 11: the standalone /lookup route is retired — its search
// functionality is now embedded directly in VehiclesListPage/
// DriversListPage (search box on each list), so a separate "search" nav
// destination nobody thought to visit no longer exists.
//
// /admin/* (item 7) has no top-level permission gate of its own here —
// each AdminLayout tab and its target page individually checks the
// specific permission it needs (see AdminLayout.tsx), same pattern as
// every other nav-gated route in this file.
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            {/* Deliberately OUTSIDE <Layout>: this is the forced first-login
                screen (artboard 3c), meant to be a dedicated,
                distraction-free step with no nav chrome — nested under
                Layout it inherited the sidebar/hamburger/bottom-bar, whose
                links let a user tap away before finishing the required
                change. Server-side enforcement (PermissionsGuard +
                mustChangePassword) is the real control either way; this is
                the matching UI treatment. */}
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/reports/dashboard" element={<DashboardPage />} />
              <Route path="/reports/daily" element={<DailyReportPage />} />
              <Route path="/reports/violations" element={<ViolationsPage />} />
              <Route path="/fillups/new" element={<RecordFillUpPage />} />
              <Route path="/stations" element={<StationsListPage />} />
              <Route path="/drivers" element={<DriversListPage />} />
              <Route path="/drivers/:driverId" element={<DriverDetailPage />} />
              <Route path="/vehicles" element={<VehiclesListPage />} />
              <Route path="/vehicles/:vehicleId" element={<VehicleDetailPage />} />
              <Route path="/vehicles/change-requests" element={<ChangeRequestsQueuePage />} />
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Navigate to="/admin/users" replace />} />
                <Route path="users" element={<UsersAdminPage />} />
                <Route path="settings" element={<SettingsAdminPage />} />
                <Route path="exception-types" element={<ExceptionTypesAdminPage />} />
                <Route path="stations" element={<StationsAdminPage />} />
                <Route path="audit-log" element={<AuditLogAdminPage />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
