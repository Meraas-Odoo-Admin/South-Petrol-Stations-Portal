import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthProvider';
import { RequireAuth } from './components/RequireAuth';
import { Layout } from './components/Layout';
import { LoginPage } from './features/auth/LoginPage';
import { ChangePasswordPage } from './features/auth/ChangePasswordPage';
import { HomePage } from './features/home/HomePage';
import { DailyReportPage } from './features/reports/DailyReportPage';
import { ExceptionsPage } from './features/reports/ExceptionsPage';
import { VehicleDetailPage } from './features/vehicles/VehicleDetailPage';
import { VehiclesListPage } from './features/vehicles/VehiclesListPage';
import { ChangeRequestsQueuePage } from './features/vehicles/ChangeRequestsQueuePage';
import { StationsListPage } from './features/stations/StationsListPage';
import { RecordFillUpPage } from './features/fillups/RecordFillUpPage';
import { RegistrationPage } from './features/registration/RegistrationPage';
import { AdminLayout } from './features/admin/AdminLayout';
import { UserDetailPage } from './features/users/UserDetailPage';
import { UserCreatePage } from './features/users/UserCreatePage';
import { SettingsAdminPage } from './features/admin/SettingsAdminPage';
import { ListsPage } from './features/lists/ListsPage';
import { AuditLogAdminPage } from './features/admin/AuditLogAdminPage';
import { MunicipalitiesAdminPage } from './features/admin/MunicipalitiesAdminPage';
import { MunicipalityDetailPage } from './features/admin/MunicipalityDetailPage';
import { ManageOfficesPage, ManagePlacesPage } from './features/places/ManagePlacesPage';
import { StationCreatePage, StationManagePage } from './features/places/StationManagePage';
import { StationMonitorPage, StationsMonitoringPage } from './features/monitoring/StationsMonitoringPage';
import { OfficeCreatePage, OfficeManagePage } from './features/places/OfficeManagePage';
import { MyOfficePage, MyStationPage } from './features/places/MyPlacePages';
import { EmployeeActivityPage } from './features/regreports/EmployeeActivityPage';
import { RolesReportsPage } from './features/reports/RolesReportsPage';
import { useAuth } from './features/auth/AuthProvider';
import { NAV_ACCESS, singleDestination } from './lib/navAccess';
import { CitizenCheckPage } from './features/citizen/CitizenCheckPage';

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
// Phase 5A: people are managed from inside the place they belong to - a
// municipality (super admin), a station or office (municipality manager), your
// own station or office (supervisor, office manager). There is no free-floating
// users list; the old /staff and /admin/users addresses lead to the right place
// for whoever opens them. The API enforces who may do what; this only keeps
// people without the permission off a page that would be empty.
function Gate({ allow, children }: { allow: (has: (p: string) => boolean) => boolean; children: JSX.Element }) {
  const { hasPermission } = useAuth();
  return allow(hasPermission) ? children : <Navigate to="/" replace />;
}

// One job, no home screen: the station employee opens straight on «تسجيل تعبئة».
function Home() {
  const { hasPermission } = useAuth();
  const only = singleDestination(hasPermission);
  return only ? <Navigate to={only} replace /> : <HomePage />;
}

function PeopleHomeRedirect() {
  const { hasPermission } = useAuth();
  if (hasPermission('municipalities:manage')) return <Navigate to="/admin/municipalities" replace />;
  if (NAV_ACCESS.manage(hasPermission)) return <Navigate to="/manage?part=people" replace />;
  if (NAV_ACCESS.manageOffices(hasPermission)) return <Navigate to="/manage/offices?part=people" replace />;
  if (NAV_ACCESS.myStation(hasPermission)) return <Navigate to="/my-station" replace />;
  if (NAV_ACCESS.myOffice(hasPermission)) return <Navigate to="/my-office" replace />;
  return <Navigate to="/" replace />;
}

// «الإدارة» opens on the first of its tabs the person may use: the super
// admin's municipalities, or «القوائم» for a municipality manager.
function AdminHomeRedirect() {
  const { hasPermission } = useAuth();
  if (hasPermission('municipalities:manage')) return <Navigate to="/admin/municipalities" replace />;
  if (hasPermission('settings:manage')) return <Navigate to="/admin/settings" replace />;
  if (NAV_ACCESS.lists(hasPermission)) return <Navigate to="/admin/lists" replace />;
  if (hasPermission('audit:view')) return <Navigate to="/admin/audit-log" replace />;
  return <Navigate to="/" replace />;
}

// The old «القوائم» address keeps its tab.
function ListsRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/admin/lists${search}`} replace />;
}

// Phase 5B: «متابعة مكاتب التسجيل», «مخزون البطاقات» and «الجاهزية للموعد
// النهائي» are no longer pages of their own; their content lives in the
// office and station pages. The old addresses lead each person to the place
// that now holds what they came for.
function FoldedReportRedirect({ tab }: { tab: 'overview' | 'cards' }) {
  const { hasPermission } = useAuth();
  const { officeId } = useParams();
  if (NAV_ACCESS.manageOffices(hasPermission)) {
    return <Navigate to={officeId ? `/manage/offices/${officeId}?tab=${tab}` : '/manage/offices'} replace />;
  }
  if (NAV_ACCESS.myOffice(hasPermission)) return <Navigate to={`/my-office?tab=${tab}`} replace />;
  if (NAV_ACCESS.myStation(hasPermission)) return <Navigate to="/my-station" replace />;
  return <Navigate to="/reports" replace />;
}

function StaffRedirect() {
  const { userId } = useParams();
  return <Navigate to={userId ? `/people/${userId}` : '/people'} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Public: the citizen checks their own card, no account (after review, 19 Oct 2026). */}
          <Route path="/check" element={<CitizenCheckPage />} />
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
              <Route path="/" element={<Home />} />
              <Route path="/reports/dashboard" element={<Navigate to="/reports/daily" replace />} />
              <Route path="/reports/daily" element={<DailyReportPage />} />
              <Route path="/reports/violations" element={<ExceptionsPage />} />
              <Route path="/reports" element={<Gate allow={NAV_ACCESS.reports}><RolesReportsPage /></Gate>} />
              <Route path="/reports/registration" element={<FoldedReportRedirect tab="overview" />} />
              <Route path="/reports/registration/offices/:officeId" element={<FoldedReportRedirect tab="overview" />} />
              <Route path="/reports/registration/employees/:userId" element={<EmployeeActivityPage />} />
              <Route path="/fillups/new" element={<RecordFillUpPage />} />
              <Route path="/registration" element={<RegistrationPage />} />
              <Route path="/stations" element={<Gate allow={NAV_ACCESS.stations}><StationsListPage /></Gate>} />
              <Route path="/vehicles" element={<Gate allow={NAV_ACCESS.vehicles}><VehiclesListPage /></Gate>} />
              <Route path="/vehicles/:vehicleId" element={<Gate allow={NAV_ACCESS.vehicles}><VehicleDetailPage /></Gate>} />
              <Route path="/vehicles/change-requests" element={<ChangeRequestsQueuePage />} />
              {/* People, from inside their place. */}
              <Route path="/people" element={<PeopleHomeRedirect />} />
              <Route path="/people/new" element={<UserCreatePage basePath="/people" standalone />} />
              <Route path="/people/:userId" element={<UserDetailPage basePath="/people" />} />
              <Route path="/staff" element={<PeopleHomeRedirect />} />
              <Route path="/staff/new" element={<Navigate to="/people/new" replace />} />
              <Route path="/staff/:userId" element={<StaffRedirect />} />

              {/* The municipality manager's stations and offices. */}
              <Route path="/manage" element={<Gate allow={NAV_ACCESS.manage}><ManagePlacesPage /></Gate>} />
              <Route path="/manage/stations/new" element={<Gate allow={(h) => h('stations:create')}><StationCreatePage /></Gate>} />
              <Route path="/manage/stations/:stationId" element={<Gate allow={NAV_ACCESS.manage}><StationManagePage /></Gate>} />
              <Route path="/manage/offices" element={<Gate allow={NAV_ACCESS.manageOffices}><ManageOfficesPage /></Gate>} />
              <Route path="/manage/offices/new" element={<Gate allow={(h) => h('registration_stations:manage')}><OfficeCreatePage /></Gate>} />
              <Route path="/manage/offices/:officeId" element={<Gate allow={NAV_ACCESS.manageOffices}><OfficeManagePage /></Gate>} />
              {/* «مراقبة المحطات»: the stations' fuel (after review, 19 Oct 2026). */}
              <Route path="/monitoring" element={<Gate allow={NAV_ACCESS.monitoring}><StationsMonitoringPage /></Gate>} />
              <Route path="/monitoring/stations/:stationId" element={<Gate allow={NAV_ACCESS.monitoring}><StationMonitorPage /></Gate>} />
              {/* A supervisor's own station, an office manager's own office. */}
              <Route path="/my-station" element={<Gate allow={NAV_ACCESS.myStation}><MyStationPage /></Gate>} />
              <Route path="/my-office" element={<Gate allow={NAV_ACCESS.myOffice}><MyOfficePage /></Gate>} />

              {/* Phase 7: «القوائم» is a tab of «الإدارة». */}
              <Route path="/lists" element={<ListsRedirect />} />

              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminHomeRedirect />} />
                <Route path="users" element={<PeopleHomeRedirect />} />
                <Route path="users/new" element={<Navigate to="/people/new" replace />} />
                <Route path="users/:userId" element={<StaffRedirect />} />
                <Route path="settings" element={<SettingsAdminPage />} />
                <Route path="lists" element={<Gate allow={NAV_ACCESS.lists}><ListsPage /></Gate>} />
                <Route path="exception-types" element={<Navigate to="/admin/lists" replace />} />
                <Route path="vehicle-types" element={<Navigate to="/admin/lists?tab=vehicles" replace />} />
                <Route path="municipalities" element={<MunicipalitiesAdminPage />} />
                <Route path="municipalities/:municipalityId" element={<MunicipalityDetailPage />} />
                {/* The security-authorities section is gone: each municipality's
                    directorate is created with it and renamed from its page. */}
                <Route path="security-authorities" element={<Navigate to="/admin/municipalities" replace />} />
                <Route path="registration-stations" element={<Navigate to="/manage/offices" replace />} />
                <Route path="stations" element={<Navigate to="/manage" replace />} />
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
