import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { base44, TOKEN_KEY, SESSION_EXPIRED_EVENT } from '@/api/base44Client';

// Shown when the server stops accepting this tab's sign-in mid-session (it
// expired, an admin reset the password, or the account was removed). Until
// now every save just failed silently. The page is left as it is, so nothing
// typed is lost: the person signs in again in a new tab, and this tab picks
// up the new sign-in automatically (same browser storage) and hides the banner.
export default function SessionExpiredBanner() {
  const [shown, setShown] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const onExpired = () => setShown(true);
    const onStorage = (e) => {
      if (e.key !== TOKEN_KEY || !e.newValue) return;
      base44.auth.me().then(() => setShown(false)).catch(() => {});
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  if (!shown || pathname === '/login') return null;
  return (
    <div role="alert"
      className="fixed inset-x-0 top-0 z-[100] bg-red-700 text-white shadow-lg"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="max-w-5xl mx-auto px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="font-semibold">Your sign-in has expired, so nothing you change now is being saved.</span>
        <span>
          <a href={pathname.toLowerCase().startsWith('/portal') ? '/portal/login' : '/login'} target="_blank" rel="noopener" className="underline font-semibold">Sign in again</a>
          {' '}in a new tab, then come back here and save. Your work on this page is kept.
        </span>
      </div>
    </div>
  );
}
