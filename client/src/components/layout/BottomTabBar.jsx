import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FilePlus, Settings } from 'lucide-react';
import SettingsDrawer from './SettingsDrawer';

const TABS = [
  { label: 'Reports', path: '/reports', icon: LayoutDashboard },
  { label: 'New Report', path: '/reports/new', icon: FilePlus },
];

export default function BottomTabBar() {
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border flex items-stretch sm:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {TABS.map(({ label, path, icon: Icon }) => {
          const active = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors select-none
                ${active ? 'text-primary' : 'text-muted-foreground'}`}
            >
              <Icon className={`w-5 h-5 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
              {label}
            </Link>
          );
        })}

        {/* Settings tab */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-xs font-medium text-muted-foreground transition-colors select-none"
        >
          <Settings className="w-5 h-5" />
          Settings
        </button>
      </nav>

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}