import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { LayoutDashboard, FilePlus, LogOut, Shield } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import logo from '@/assets/logo.jpg';
import BottomTabBar from './BottomTabBar';
import PageTransition from './PageTransition';
import AppSwitcher from './AppSwitcher';

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/reports', icon: LayoutDashboard },
  { label: 'New Report', path: '/reports/new', icon: FilePlus },
];

export default function AppLayout() {
  const location = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop top bar — hidden on mobile */}
      <header
        className="sticky top-0 z-50 bg-card border-b border-border backdrop-blur-md bg-opacity-95 hidden sm:block"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/reports" className="flex items-center gap-3">
            <img src={logo} alt="3 Phase Conveyor" className="h-8 w-auto" />
            <span className="text-sm font-semibold text-muted-foreground border-l border-border pl-3">
              Reports
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map(({ label, path, icon: Icon }) => {
              const active = location.pathname === path;
              return (
                <Link
                  key={path}
                  to={path}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                    ${active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </Link>
              );
            })}
            {isAdmin && (
              <Link
                to="/admin"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-secondary"
              >
                <Shield className="w-4 h-4" />
                <span>Admin</span>
              </Link>
            )}
            <AppSwitcher currentKey="reports" />
            <button
              onClick={() => base44.auth.logout()}
              className="ml-2 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </nav>
        </div>
      </header>

      {/* Mobile top bar (logo only) — visible on mobile */}
      <header
        className="sticky top-0 z-40 bg-card border-b border-border flex items-center justify-between px-4 h-14 sm:hidden"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <Link to="/reports" className="flex items-center gap-2">
          <img src={logo} alt="3 Phase Conveyor" className="h-7 w-auto" />
          <span className="text-sm font-semibold text-muted-foreground border-l border-border pl-2">
            Reports
          </span>
        </Link>
        <AppSwitcher currentKey="reports" />
      </header>

      {/* Main content — extra bottom padding on mobile for tab bar */}
      <main
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 sm:pb-8"
        style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}
      >
        <AnimatePresence mode="wait">
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Tab Bar */}
      <BottomTabBar />
    </div>
  );
}