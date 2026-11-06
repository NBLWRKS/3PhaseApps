import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutGrid, FileText, Highlighter, BarChart3, DollarSign,
  ShieldCheck, GraduationCap, FolderOpen, Shield, LogOut,
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { canRead } from '@/lib/permissions';
import { base44 } from '@/api/base44Client';
import logo from '@/assets/logo-dark.png';

// Left-hand navigation shown on wide screens (lg and up) for every signed-in
// app page. Phones and tablets keep each page's own header and app switcher.
// Keep the app list in sync with AppSwitcher and the Landing page.
const GROUPS = [
  {
    label: 'Field & projects',
    apps: [
      { key: 'reports', name: 'Reports', path: '/reports', icon: FileText },
      { key: 'highlight', name: 'Highlight', path: '/highlight', icon: Highlighter },
      { key: 'tracking', name: 'Project Tracking', path: '/tracking', icon: BarChart3 },
      { key: 'expenses', name: 'Expenses', path: '/expenses', icon: DollarSign },
    ],
  },
  {
    label: 'People & safety',
    apps: [
      { key: 'safety', name: 'Safety Credentials', path: '/safety', icon: ShieldCheck },
      { key: 'onboarding', name: 'Onboarding', path: '/onboarding-admin', icon: GraduationCap },
      { key: 'applications', name: 'Applications', path: '/applications', icon: FolderOpen },
    ],
  },
];

function NavItem({ to, icon: Icon, label, active }) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 h-10 px-3 rounded-md text-sm transition-colors ${
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
          : 'text-sidebar-foreground hover:bg-secondary hover:text-foreground font-medium'
      }`}
    >
      <Icon className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export default function AppSidebar() {
  const { pathname } = useLocation();
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated || !user) return null;

  const isActive = (path) => pathname === path || pathname.startsWith(`${path}/`);
  const groups = GROUPS
    .map((g) => ({ ...g, apps: g.apps.filter((a) => canRead(user, a.key)) }))
    .filter((g) => g.apps.length);

  return (
    <aside
      className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-60 flex-col gap-5 bg-sidebar border-r border-sidebar-border px-3 py-5 overflow-y-auto"
      style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}
      aria-label="Applications"
    >
      <Link to="/" className="px-2 block" aria-label="3PhaseApps home">
        <img src={logo} alt="3 Phase Conveyor, Electrical & Mechanical" className="w-full max-w-[190px] h-auto" />
      </Link>
      <div className="gold-sheen h-0.5 rounded-full" aria-hidden="true" />

      <nav className="flex flex-col gap-0.5">
        <NavItem to="/" icon={LayoutGrid} label="All apps" active={pathname === '/'} />
        {groups.map((g) => (
          <React.Fragment key={g.label}>
            <span className="px-3 pt-4 pb-1.5 font-mono-ui text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {g.label}
            </span>
            {g.apps.map((a) => (
              <NavItem key={a.key} to={a.path} icon={a.icon} label={a.name} active={isActive(a.path)} />
            ))}
          </React.Fragment>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-0.5 pt-4 border-t border-sidebar-border">
        {user.role === 'admin' && (
          <NavItem to="/admin" icon={Shield} label="Admin" active={isActive('/admin')} />
        )}
        <button
          type="button"
          onClick={() => base44.auth.logout()}
          className="flex items-center gap-3 h-10 px-3 rounded-md text-sm font-medium text-sidebar-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <LogOut className="w-[18px] h-[18px]" aria-hidden="true" />
          Log out
        </button>
        <div className="flex items-center gap-3 px-3 pt-3">
          <span className="w-8 h-8 rounded-full bg-sidebar-accent text-sidebar-accent-foreground grid place-items-center text-sm font-semibold shrink-0">
            {(user.full_name || user.email || '?').trim().charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 text-xs text-muted-foreground truncate" title={user.email}>
            {user.full_name || user.email}
          </span>
        </div>
      </div>
    </aside>
  );
}
