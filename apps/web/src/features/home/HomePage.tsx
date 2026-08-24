import { useAuth } from '../auth/AuthProvider';

// Minimal landing page — this milestone builds the M4 reporting screens
// only, not a full app home. A station_employee (no reports:view) lands
// here with nothing else to navigate to, which is expected: recording
// fill-ups has no UI yet (that's out of scope for this pass).
export function HomePage() {
  const { user } = useAuth();
  return (
    <div>
      <h1 className="text-lg font-bold text-slate-900">مرحبًا، {user?.fullName}</h1>
      <p className="mt-2 text-slate-600">استخدم القائمة أعلاه للوصول إلى التقارير المتاحة لك.</p>
    </div>
  );
}
