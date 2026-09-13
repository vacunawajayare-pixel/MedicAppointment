import { useEffect, useState } from 'react';
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

const COLLAPSE_KEY = 'staff-sidebar-collapsed';

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export default function StaffLayout() {
  const { user, profile, role, loading, signOut } = useStaffAuth();
  const loc = useLocation();
  // Desktop: expanded (icon + text) vs collapsed (icon only). Persisted.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  // Mobile: sidebar behaves as an overlay drawer, closed by default.
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      // private mode — preference just won't persist
    }
  }, [collapsed]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [loc.pathname]);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  if (loading) return <p className="staff-dark p-8 text-center text-sm">Loading session…</p>;
  if (!user || !profile || !role) return <Navigate to="/appointments/login" replace />;

  const activePage = NAV.find((n) => loc.pathname.startsWith(n.to))?.label ?? '';

  const linkCls = (active: boolean, centered: boolean) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
      centered ? 'justify-center' : ''
    } ${active ? 'bg-[#0e4a3a] font-semibold text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`;

  const renderLinks = (showLabels: boolean) => (
    <nav className="mt-4 space-y-1">
      {NAV.map((n) => {
        const active = loc.pathname.startsWith(n.to);
        return (
          <Link
            key={n.to}
            to={n.to}
            title={n.label}
            aria-current={active ? 'page' : undefined}
            className={linkCls(active, !showLabels)}
          >
            <span className="w-4 shrink-0 text-center">{n.icon}</span>
            {showLabels && <span className="truncate">{n.label}</span>}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="staff-dark flex min-h-screen">
      {/* Mobile top bar with hamburger (drawer trigger) */}
      <header className="fixed inset-x-0 top-0 z-30 flex items-center gap-2 border-b border-white/5 bg-black/70 px-3 py-2 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={mobileOpen}
          aria-controls="staff-mobile-nav"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-200 hover:bg-white/10 hover:text-white"
        >
          <HamburgerIcon />
        </button>
        <span className="flex h-6 w-6 items-center justify-center rounded bg-[#0e4a3a] text-xs font-bold text-white">✚</span>
        <span className="text-sm font-bold">Clinic staff</span>
        {activePage && <span className="ml-1 text-xs text-slate-400">· {activePage}</span>}
      </header>

      {/* Desktop sidebar: expanded (icon + text) / collapsed (icon only) */}
      <aside
        id="staff-sidebar"
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-white/5 bg-black/50 p-3 transition-[width] duration-200 ease-in-out md:flex ${
          collapsed ? 'md:w-[76px]' : 'md:w-52 md:p-4'
        }`}
      >
        <div className={`flex items-center gap-2 px-1 py-2 ${collapsed ? 'flex-col' : ''}`}>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            aria-controls="staff-sidebar"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            <HamburgerIcon />
          </button>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#0e4a3a] text-xs font-bold text-white">✚</span>
          {!collapsed && <span className="truncate text-sm font-bold">Clinic staff</span>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">{renderLinks(!collapsed)}</div>

        <div className="mt-auto space-y-1 pt-4">
          {collapsed ? (
            <div
              title={`${profile.full_name} · ${role}`}
              className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-[#0e4a3a]/40 text-xs font-bold text-[#9fd8cb]"
            >
              {(profile.full_name.trim()[0] ?? '?').toUpperCase()}
            </div>
          ) : (
            <div className="rounded-lg bg-white/5 px-3 py-2">
              <p className="truncate text-xs font-semibold">{profile.full_name}</p>
              <p className="text-[11px] uppercase tracking-wider text-[#4ea895]">{role}</p>
            </div>
          )}
          <button
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200 ${
              collapsed ? 'justify-center' : ''
            }`}
            onClick={() => {
              void signOut();
            }}
            title="Sign out"
          >
            <span className="w-4 shrink-0 text-center">↩</span>
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Mobile drawer backdrop */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
        />
      )}

      {/* Mobile drawer: full labels, slides in as an overlay */}
      <aside
        id="staff-mobile-nav"
        aria-hidden={!mobileOpen}
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-white/5 bg-[#0b1210] p-4 transition-transform duration-200 ease-in-out md:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2 px-1 py-2">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-[#0e4a3a] text-xs font-bold text-white">✚</span>
          <span className="text-sm font-bold">Clinic staff</span>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation menu"
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-white/5 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">{renderLinks(true)}</div>

        <div className="mt-auto space-y-1 pt-4">
          <div className="rounded-lg bg-white/5 px-3 py-2">
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
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-6xl flex-1 p-4 pt-16 md:p-6 md:pt-6">
        <Outlet />
      </main>
    </div>
  );
}
