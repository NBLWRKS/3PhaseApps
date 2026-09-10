import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';

import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

import AppLayout from '@/components/layout/AppLayout';
import Landing from '@/pages/Landing';
import Admin from '@/pages/Admin';
import Highlight from '@/pages/Highlight';
import SafetyList from '@/pages/SafetyList';
import SafetyEmployee from '@/pages/SafetyEmployee';
import SafetyCard from '@/pages/SafetyCard';
import Tracking from '@/pages/Tracking';
import Expenses from '@/pages/Expenses';
import Dashboard from '@/pages/Dashboard';
import ReportEditor from '@/pages/ReportEditor';
import ReportView from '@/pages/ReportView';
import ApplyPacket from '@/pages/ApplyPacket';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Only force a redirect for protected areas. Public pages (login,
      // register, splash, etc.) render normally and handle their own gating,
      // which avoids a redirect loop when a stored token has expired.
      const path = window.location.pathname;
      const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password', '/', '/admin', '/apply'];
      // The public credential card (/SafetyCredentials/:slug) is viewable
      // without login — the QR on the ID cards points here.
      const isPublicCard = path.toLowerCase().startsWith('/safetycredentials');
      if (!publicPaths.includes(path) && !isPublicCard) {
        navigateToLogin();
        return null;
      }
    }
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Public splash page listing available apps */}
      <Route path="/" element={<Landing />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/highlight" element={<Highlight />} />
      <Route path="/Highlight" element={<Navigate to="/highlight" replace />} />
      <Route path="/safety" element={<SafetyList />} />
      <Route path="/safety/:slug" element={<SafetyEmployee />} />
      <Route path="/tracking" element={<Tracking />} />
      <Route path="/expenses" element={<Expenses />} />
      <Route path="/apply" element={<ApplyPacket />} />
      {/* Capitalized URL form from the spec, e.g. /SafetyCredentials/DayanaAballay/ */}
      <Route path="/SafetyCredentials" element={<Navigate to="/safety" replace />} />
      <Route path="/SafetyCredentials/:slug" element={<SafetyCard />} />
      {/* lowercase alias so a hand-typed URL still reaches the public card */}
      <Route path="/safetycredentials/:slug" element={<SafetyCard />} />

      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AppLayout />}>
          <Route path="/reports" element={<Dashboard />} />
          <Route path="/reports/new" element={<ReportEditor />} />
          <Route path="/reports/:id" element={<ReportView />} />
          <Route path="/reports/:id/edit" element={<ReportEditor />} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App