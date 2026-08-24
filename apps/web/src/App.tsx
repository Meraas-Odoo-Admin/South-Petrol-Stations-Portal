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
import { LookupPage } from './features/lookup/LookupPage';
import { DriverDetailPage } from './features/drivers/DriverDetailPage';
import { VehicleDetailPage } from './features/vehicles/VehicleDetailPage';

// Route structure mirrors backend modules, per docs/IMPLEMENTATION_PLAN.md
// §9 — this is the M4 reporting slice only (/reports/*, /drivers/:id,
// /vehicles/:id); /fillups, /exceptions, /admin/* aren't built yet.
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/change-password" element={<ChangePasswordPage />} />
              <Route path="/reports/dashboard" element={<DashboardPage />} />
              <Route path="/reports/daily" element={<DailyReportPage />} />
              <Route path="/reports/violations" element={<ViolationsPage />} />
              <Route path="/lookup" element={<LookupPage />} />
              <Route path="/drivers/:driverId" element={<DriverDetailPage />} />
              <Route path="/vehicles/:vehicleId" element={<VehicleDetailPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
