import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import logo from '@/assets/logo.jpg';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Loader2, ShieldCheck, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function Admin() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoadingAuth } = useAuth();

  const [apps, setApps] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const [appList, userList] = await Promise.all([
          base44.admin.listApps(),
          base44.admin.listUsers(),
        ]);
        if (!cancelled) {
          setApps(appList);
          setUsers(userList);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load admin data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAdmin]);

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  const saveUser = async (id, changes) => {
    setSavingId(id);
    setError('');
    // optimistic update
    const prev = users;
    const next = users.map((u) => (u.id === id ? { ...u, ...changes } : u));
    setUsers(next);
    try {
      const updated = await base44.admin.updateUser(id, {
        role: next.find((u) => u.id === id).role,
        app_permissions: next.find((u) => u.id === id).app_permissions,
      });
      setUsers((cur) => cur.map((u) => (u.id === id ? updated : u)));
      toast.success('Saved');
    } catch (err) {
      setUsers(prev); // revert
      setError(err.message || 'Failed to save');
      toast.error(err.message || 'Failed to save');
    } finally {
      setSavingId(null);
    }
  };

  const toggleApp = (u, appKey) => {
    const has = u.app_permissions.includes(appKey);
    const app_permissions = has
      ? u.app_permissions.filter((k) => k !== appKey)
      : [...u.app_permissions, appKey];
    saveUser(u.id, { app_permissions });
  };

  const changeRole = (u, role) => {
    saveUser(u.id, { role });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="3 Phase Conveyor" className="h-8 w-auto" />
            <span className="text-sm font-semibold text-muted-foreground border-l border-border pl-3">
              Admin
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/')} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to apps
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">User access</h1>
        </div>
        <p className="text-muted-foreground mb-6">
          Set each user's role and which applications they can open. Admins can open every app.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center">No registered users yet.</p>
        ) : (
          <div className="space-y-3">
            {users.map((u) => {
              const isSelf = u.id === user.id;
              const isAdminRow = u.role === 'admin';
              return (
                <Card key={u.id}>
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      {/* Identity */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{u.full_name || u.email}</p>
                          {isSelf && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">You</span>
                          )}
                          {savingId === u.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                        </div>
                        {u.full_name && <p className="text-sm text-muted-foreground truncate">{u.email}</p>}
                      </div>

                      {/* Role */}
                      <div className="sm:w-40">
                        <Select
                          value={u.role}
                          onValueChange={(v) => changeRole(u, v)}
                          disabled={isSelf}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* App permissions */}
                    <div className="mt-4 pt-4 border-t border-border">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                        App access
                      </p>
                      {isAdminRow ? (
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          <Check className="w-4 h-4 text-accent" />
                          Admins have access to all applications.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-x-8 gap-y-3">
                          {apps.map((app) => (
                            <label key={app.key} className="flex items-center gap-2 cursor-pointer">
                              <Switch
                                checked={u.app_permissions.includes(app.key)}
                                onCheckedChange={() => toggleApp(u, app.key)}
                              />
                              <span className="text-sm">{app.name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
