import React from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import AppSidebar from './AppSidebar';

// Wraps the signed-in app pages: on wide screens a fixed sidebar sits on the
// left and the page shifts right to make room. Each page still handles its own
// sign-in and permission checks, exactly as before.
export default function ShellLayout() {
  const { isAuthenticated } = useAuth();
  return (
    <>
      <AppSidebar />
      <div className={isAuthenticated ? 'lg:pl-60' : undefined}>
        <Outlet />
      </div>
    </>
  );
}
