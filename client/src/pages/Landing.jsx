import React from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import logo from '@/assets/logo.jpg';
import { FileText, ArrowRight, Zap, Wrench, Clock, LogOut, Shield, Loader2, Highlighter, ShieldCheck, BarChart3, DollarSign, FolderOpen, GraduationCap } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// Catalog of apps shown on the splash. `key` matches the server's app keys and
// a user's app_permissions. Add new live apps here as they launch.
const APPS = [
  {
    key: 'reports',
    name: 'Reports',
    description: 'Field inspection reports for electrical and mechanical jobs — sections, photos, site stats, and PDF export.',
    icon: FileText,
    live: true,
    path: '/reports',
    tags: ['Electrical', 'Mechanical'],
  },
  {
    key: 'highlight',
    name: 'Highlight',
    description: 'Upload a conveyor PDF, convert it to an image, and highlight sections of the layout to mark up and share.',
    icon: Highlighter,
    live: true,
    path: '/highlight',
  },
  {
    key: 'safety',
    name: 'Safety Credentials',
    description: 'Track every employee’s safety training records — types, dates passed, expirations, and credential status.',
    icon: ShieldCheck,
    live: true,
    path: '/safety',
  },
  {
    key: 'tracking',
    name: 'Project Tracking',
    description: 'Track project completion and readiness — tasks roll up by area and project, with live charts and Excel export.',
    icon: BarChart3,
    live: true,
    path: '/tracking',
  },
  {
    key: 'expenses',
    name: 'Expense Tracking',
    description: 'Track spend across projects — weekly payroll (electrical & mechanical), hours, expenses, equipment rentals, and budget vs. actual with charts and CSV export.',
    icon: DollarSign,
    live: true,
    path: '/expenses',
  },
  {
    key: 'applications',
    name: 'Applications',
    description: 'View and download submitted new-hire application packets (contains sensitive info).',
    icon: FolderOpen,
    live: true,
    path: '/applications',
  },
  {
    key: 'onboarding',
    name: 'Onboarding',
    description: 'Upload training courses and track which employees have completed each one.',
    icon: GraduationCap,
    live: true,
    path: '/onboarding-admin',
  },
  {
    key: 'soon-1',
    name: 'More coming soon',
    description: 'Additional tools for the field and the office are on the way.',
    icon: Clock,
    live: false,
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Splash is the post-login home; send guests to log in.
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const isAdmin = user?.role === 'admin';
  // Admins implicitly have access to every app. Permissions are an object
  // { appKey: 'read'|'edit' }; tolerate the legacy array form too.
  const canAccess = (key) => {
    if (isAdmin) return true;
    const p = user?.app_permissions;
    if (Array.isArray(p)) return p.includes(key);
    return !!(p && p[key]);
  };

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      {/* Decorative spectrum wave echoing the logo, top-right */}
      <div
        className="pointer-events-none absolute -top-32 -right-32 w-[42rem] h-[42rem] rounded-full opacity-[0.07] blur-3xl"
        style={{
          background:
            'conic-gradient(from 180deg, #e0211b, #f5a623, #f8e71c, #3fae46, #1f7bc2, #7b4ea0, #e0211b)',
        }}
      />

      {/* Top bar with admin + logout */}
      <div className="relative max-w-5xl mx-auto px-6 pt-6 flex items-center justify-end gap-2">
        {isAdmin && (
          <button
            onClick={() => navigate('/admin')}
            className="inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Shield className="w-4 h-4" />
            Admin
          </button>
        )}
        <button
          onClick={() => base44.auth.logout()}
          className="inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Log out"
        >
          <LogOut className="w-4 h-4" />
          Log out
        </button>
      </div>

      <div className="relative max-w-5xl mx-auto px-6 pb-16 pt-8 sm:pt-10">
        {/* Hero */}
        <header className="flex flex-col items-center text-center">
          <div className="bg-card rounded-2xl shadow-sm ring-1 ring-border px-8 py-6">
            <img src={logo} alt="3 Phase Conveyor" className="h-16 w-auto" />
          </div>
          <h1 className="mt-8 text-3xl sm:text-4xl font-bold tracking-tight">
            3 Phase Conveyor
          </h1>
          <p className="mt-2 text-base sm:text-lg text-muted-foreground">
            Electrical &amp; Mechanical — applications
          </p>
          <div className="mt-6 flex items-center gap-1">
            <span className="w-2.5 h-7 rounded-full bg-destructive" />
            <span className="w-2.5 h-7 rounded-full bg-primary" />
            <span className="w-2.5 h-7 rounded-full bg-accent" />
          </div>
        </header>

        {/* App grid */}
        <section className="mt-16">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-5">
            Your applications
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {APPS.map((app) => {
              const Icon = app.icon;
              const accessible = app.live && canAccess(app.key);
              const lockedNoAccess = app.live && !accessible;
              return (
                <button
                  key={app.key}
                  onClick={() => accessible && navigate(app.path)}
                  disabled={!accessible}
                  className={[
                    'group text-left rounded-xl border bg-card p-6 transition-all duration-300',
                    accessible
                      ? 'hover:shadow-lg hover:border-primary/40 cursor-pointer'
                      : 'opacity-70 cursor-default',
                  ].join(' ')}
                >
                  <div
                    className={[
                      'h-1 w-12 rounded-full mb-5',
                      accessible
                        ? 'bg-gradient-to-r from-destructive via-primary to-accent'
                        : 'bg-muted-foreground/30',
                    ].join(' ')}
                  />
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={[
                          'flex items-center justify-center w-11 h-11 rounded-lg',
                          accessible ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                        ].join(' ')}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg leading-tight">{app.name}</h3>
                        {!app.live && (
                          <span className="text-xs font-medium text-muted-foreground">Coming soon</span>
                        )}
                        {lockedNoAccess && (
                          <span className="text-xs font-medium text-muted-foreground">No access — ask an admin</span>
                        )}
                      </div>
                    </div>
                    {accessible && (
                      <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                    )}
                  </div>

                  <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                    {app.description}
                  </p>

                  {app.tags && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {app.tags.map((t) => {
                        const TagIcon = t === 'Mechanical' ? Wrench : Zap;
                        return (
                          <span
                            key={t}
                            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground"
                          >
                            <TagIcon className="w-3 h-3" />
                            {t}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-20 pt-8 border-t border-border text-center text-sm text-muted-foreground">
          Signed in as {user?.email}
          {' · '}
          &copy; {new Date().getFullYear()} 3 Phase Conveyor
        </footer>
      </div>
    </div>
  );
}
