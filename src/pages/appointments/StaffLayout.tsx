import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useStaffAuth } from './auth/staffAuth';

// Guard logic unchanged: loading gate + role gate, then sidebar shell.
const NAV = [
  { to: '/appointments/dashboard', label: 'Dashboard', icon: '▦' },
  { to: '/appointments/booking', label: 'Booking', icon: '◫' },
  { to: '/appointments/check-in', label: 'Check-in', icon: '✓' },
  { to: '/appointments/patients', label: 'Patients', icon: '○' },
  { to: '/appointments/doctors', label: 'Doctors', icon: '✚' },
  { to: '/appointments/reports', label: 'Reports', icon: '▥' },
  { to: '/appointments/settings', label: 'Settings', icon: '⚙' },
];

export default function StaffLayout() {
  const { user, profile, role, loading, signOut } = useStaffAuth();
  const loc = useLocation();
  if (loading) return <p className="staff-dark p-8 text-center text-sm">Loading session…</p>;
  if (!user || !profile || !role) return <Navigate to="/appointments/login" replace />;

  return (
    <div className="staff-dark flex min-h-screen">
      <aside className="flex w-16 shrink-0 flex-col border-r border-white/5 bg-black/50 p-3 md:w-52 md:p-4">
        <div className="flex items-center gap-2 px-1 py-2">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-[#0e4a3a] text-xs font-bold text-white">✚</span>
          <span className="hidden text-sm font-bold md:inline">Clinic staff</span>
        </div>
        <nav className="mt-4 space-y-1">
          {NAV.map((n) => {
            const active = loc.pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                title={n.label}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                  active ? 'bg-[#0e4a3a] font-semibold text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <span className="w-4 text-center">{n.icon}</span>
                <span className="hidden md:inline">{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-1 pt-4">
          <div className="hidden rounded-lg bg-white/5 px-3 py-2 md:block">
            <p className="truncate text-xs font-semibold">{profile.full_name}</p>
            <p className="text-[11px] uppercase tracking-wider text-[#4ea895]">{role}</p>
          </div>
          <button
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200"
            onClick={() => {
              void signOut();
            }}
            title="Sign out"
          >
            <span className="w-4 text-center">↩</span>
            <span className="hidden md:inline">Sign out</span>
          </button>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
