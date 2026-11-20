import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import AppSidebar from './AppSidebar';

// Wraps the signed-in app pages: on wide screens a fixed sidebar sits on the
// left and the page shifts right to make room. Each page still handles its own
// sign-in and permission checks, exactly as before.
export default function ShellLayout() {
  const { isAuthenticated, user } = useAuth();
  const { pathname } = useLocation();
  // Customer Portal logins get no internal navigation at all, and a single
  // portal has its own section menu on the left instead of the app sidebar.
  const inPortal = /^\/portal\/(?!login$)[^/]+/i.test(pathname);
  const sidebar = isAuthenticated && user?.role !== 'customer' && !inPortal;
  return (
    <>
      {sidebar && <AppSidebar />}
      <div className={sidebar ? 'lg:pl-60' : undefined}>
        <Outlet />
      </div>
    </>
  );
}
