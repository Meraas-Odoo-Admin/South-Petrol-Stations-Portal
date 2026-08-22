import type { HealthCheckResponse } from '@fuel-tracking/shared-types';

// Placeholder page for M0 — proves the shared-types package builds and is
// importable from both apps. Real routes/features arrive in M1+.
const placeholderStatus: HealthCheckResponse['status'] = 'ok';

function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 ps-4 pe-4 text-center">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">منظومة تتبع تعبئة الوقود</h1>
        <p className="mt-2 text-slate-600">قيد الإنشاء — المرحلة صفر: البنية الأساسية</p>
        <p className="mt-1 text-sm text-slate-400">shared-types check: {placeholderStatus}</p>
      </div>
    </div>
  );
}

export default App;
