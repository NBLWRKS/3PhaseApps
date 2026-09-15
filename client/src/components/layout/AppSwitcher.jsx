import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid3x3, ChevronDown } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { canRead } from '@/lib/permissions';

// The live, switchable applications. Keep in sync with the Landing page list.
const APPS = [
  { key: 'reports', name: 'Reports', path: '/reports' },
  { key: 'highlight', name: 'Highlight', path: '/highlight' },
  { key: 'safety', name: 'Safety Credentials', path: '/safety' },
  { key: 'tracking', name: 'Project Tracking', path: '/tracking' },
  { key: 'expenses', name: 'Expense Tracking', path: '/expenses' },
  { key: 'applications', name: 'Applications', path: '/applications' },
];

// A compact dropdown that lets the user jump to another application they have
// access to, without going back to the landing page first. `currentKey` is the
// app the user is currently in, which is excluded from the list.
export default function AppSwitcher({ currentKey }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Other apps the user can at least read (admins see all).
  const others = APPS.filter((a) => a.key !== currentKey && canRead(user, a.key));

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Nothing to switch to — don't render the control at all.
  if (others.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        title="Switch app"
      >
        <Grid3x3 className="w-4 h-4" />
        <span className="hidden sm:inline">Apps</span>
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-44 bg-card border border-border rounded-lg shadow-lg py-1 z-50">
          {others.map((a) => (
            <button
              key={a.key}
              onClick={() => { setOpen(false); navigate(a.path); }}
              className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors"
            >
              {a.name}
            </button>
          ))}
          <div className="border-t border-border my-1" />
          <button
            onClick={() => { setOpen(false); navigate('/'); }}
            className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-secondary transition-colors"
          >
            All apps…
          </button>
        </div>
      )}
    </div>
  );
}
