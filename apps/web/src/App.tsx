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
import { VehicleDetailPage } from './features/vehicles/VehicleDetailPage';
import { VehiclesListPage } from './features/vehicles/VehiclesListPage';
import { ChangeRequestsQueuePage } from './features/vehicles/ChangeRequestsQueuePage';
import { StationsListPage } from './features/stations/StationsListPage';
import { RecordFillUpPage } from './features/fillups/RecordFillUpPage';
import { RegistrationPage } from './features/registration/RegistrationPage';
import { AdminLayout } from './features/admin/AdminLayout';
import { UsersListPage } from './features/users/UsersListPage';
import { UserDetailPage } from './features/users/UserDetailPage';
import { UserCreatePage } from './features/users/UserCreatePage';
import { SettingsAdminPage } from './features/admin/SettingsAdminPage';
import { ExceptionTypesAdminPage } from './features/admin/ExceptionTypesAdminPage';
import { VehicleTypesAdminPage } from './features/admin/VehicleTypesAdminPage';
import { AuditLogAdminPage } from './features/admin/AuditLogAdminPage';
import { MunicipalitiesAdminPage } from './features/admin/MunicipalitiesAdminPage';
import { SecurityAuthoritiesAdminPage } from './features/admin/SecurityAuthoritiesAdminPage';
import { RegistrationStationsAdminPage } from './features/admin/RegistrationStationsAdminPage';
import { RegistrationReportPage } from './features/regreports/RegistrationReportPage';
import { OfficeEmployeesPage } from './features/regreports/OfficeEmployeesPage';
import { EmployeeActivityPage } from './features/regreports/EmployeeActivityPage';
import { CardStockPage } from './features/regreports/CardStockPage';
import { ReadinessPage } from './features/regreports/ReadinessPage';
import { useAuth } from './features/auth/AuthProvider';

// Route structure mirrors backend modules, per docs/IMPLEMENTATION_PLAN.md
// §9. /fillups/new is the recording screen (create only — the exceptions
// LIST is /reports/violations, and its approve action lives inline there,
// not under a separate /exceptions route).
//
// Item 11: the standalone /lookup route is retired — its search
// functionality is now embedded directly in VehiclesListPage (search box
// on the list), so a separate "search" nav destination nobody thought to
// visit no longer exists.
//
// Round 6: /drivers and /drivers/:driverId removed along with the rest of
// the Driver management surface (see docs/DESIGN_owner_based_fillups.md).
//
// /admin/* (item 7) has no top-level permission gate of its own here —
// each AdminLayout tab and its target page individually checks the
// specific permission it needs (see AdminLayout.tsx), same pattern as
// every other nav-gated route in this file.
// A supervisor's own staff screens live outside the admin area (they reach
// them from their own menu entry). The API enforces who may do what; this
// only keeps people without the permission off a page that would be empty.
function StaffArea({ children }: { children: JSX.Element }) {
  const { hasPermission } = useAuth();
  return hasPermission('users:manage_staff') ? children : <Navigate to="/" replace />;
}

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
              <Route path="/reports/registration" element={<RegistrationReportPage />} />
              <Route path="/reports/registration/offices/:officeId" element={<OfficeEmployeesPage />} />
              <Route path="/reports/registration/employees/:userId" element={<EmployeeActivityPage />} />
              <Route path="/reports/card-stock" element={<CardStockPage />} />
              <Route path="/reports/readiness" element={<ReadinessPage />} />
              <Route path="/fillups/new" element={<RecordFillUpPage />} />
              <Route path="/registration" element={<RegistrationPage />} />
              <Route path="/stations" element={<StationsListPage />} />
              <Route path="/vehicles" element={<VehiclesListPage />} />
              <Route path="/vehicles/:vehicleId" element={<VehicleDetailPage />} />
              <Route path="/vehicles/change-requests" element={<ChangeRequestsQueuePage />} />
              <Route path="/staff" element={<StaffArea><UsersListPage basePath="/staff" standalone /></StaffArea>} />
              <Route path="/staff/new" element={<StaffArea><UserCreatePage basePath="/staff" standalone /></StaffArea>} />
              <Route path="/staff/:userId" element={<StaffArea><UserDetailPage basePath="/staff" /></StaffArea>} />
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Navigate to="/admin/users" replace />} />
                <Route path="users" element={<UsersListPage basePath="/admin/users" />} />
                <Route path="users/new" element={<UserCreatePage basePath="/admin/users" />} />
                <Route path="users/:userId" element={<UserDetailPage basePath="/admin/users" />} />
                <Route path="settings" element={<SettingsAdminPage />} />
                <Route path="exception-types" element={<ExceptionTypesAdminPage />} />
                <Route path="vehicle-types" element={<VehicleTypesAdminPage />} />
                <Route path="registration-stations" element={<RegistrationStationsAdminPage />} />
                <Route path="municipalities" element={<MunicipalitiesAdminPage />} />
                <Route path="security-authorities" element={<SecurityAuthoritiesAdminPage />} />
                {/* Round 19: station create/edit moved onto /stations
                    itself (StationsListPage, gated on stations:manage) —
                    "much more logical" than a separate admin surface, per
                    the client's own framing. Redirect, not a 404, for
                    anyone with the old URL bookmarked. */}
                <Route path="stations" element={<Navigate to="/stations" replace />} />
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
