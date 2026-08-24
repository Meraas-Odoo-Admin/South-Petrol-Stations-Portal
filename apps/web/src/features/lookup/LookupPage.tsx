import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

// M2 never built driver/vehicle list screens (API only) — this is the
// minimal way to actually reach /drivers/:id and /vehicles/:id from the
// UI, since there's no browsable list to link from yet.
export function LookupPage() {
  const navigate = useNavigate();
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');

  function goToDriver(event: FormEvent) {
    event.preventDefault();
    if (driverId.trim()) {
      navigate(`/drivers/${driverId.trim()}`);
    }
  }

  function goToVehicle(event: FormEvent) {
    event.preventDefault();
    if (vehicleId.trim()) {
      navigate(`/vehicles/${vehicleId.trim()}`);
    }
  }

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-lg font-bold text-slate-900">بحث سائق / مركبة</h1>

      <form onSubmit={goToDriver} className="rounded-lg bg-white p-4 shadow">
        <label className="mb-1 block text-sm text-slate-600">معرف السائق</label>
        <div className="flex gap-2">
          <input
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            className="flex-1 rounded border border-slate-300 px-2 py-1"
          />
          <button type="submit" className="rounded bg-slate-900 px-3 py-1 text-sm text-white">
            عرض
          </button>
        </div>
      </form>

      <form onSubmit={goToVehicle} className="rounded-lg bg-white p-4 shadow">
        <label className="mb-1 block text-sm text-slate-600">معرف المركبة</label>
        <div className="flex gap-2">
          <input
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className="flex-1 rounded border border-slate-300 px-2 py-1"
          />
          <button type="submit" className="rounded bg-slate-900 px-3 py-1 text-sm text-white">
            عرض
          </button>
        </div>
      </form>
    </div>
  );
}
