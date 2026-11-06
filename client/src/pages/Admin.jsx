import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import logo from '@/assets/logo-dark.png';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Loader2, ShieldCheck, Check, UserX, KeyRound, Copy } from 'lucide-react';

// Readable temporary password: no 0/O/1/l/I look-alikes, 12 characters.
function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join('');
}
import { toast } from 'sonner';

export default function Admin() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoadingAuth } = useAuth();

  const [apps, setApps] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  // Password reset panel: which user it's open for, the typed value, and the
  // password just set (shown once so the admin can pass it on).
  const [pwFor, setPwFor] = useState(null);
  const [pwValue, setPwValue] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwDone, setPwDone] = useState(null); // { id, password }

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

  // Set a user's permission level for an app: 'none' | 'read' | 'edit'.
  const setAppLevel = (u, appKey, level) => {
    const app_permissions = { ...(u.app_permissions || {}) };
    if (level === 'none') {
      delete app_permissions[appKey];
    } else {
      app_permissions[appKey] = level;
    }
    saveUser(u.id, { app_permissions });
  };

  const changeRole = (u, role) => {
    saveUser(u.id, { role });
  };

  const openPasswordReset = (u) => {
    setPwFor(u.id);
    setPwValue(generatePassword());
    setPwError('');
    setPwDone(null);
  };

  const closePasswordReset = () => {
    setPwFor(null);
    setPwValue('');
    setPwError('');
    setPwDone(null);
  };

  const submitPasswordReset = async (e, u) => {
    e.preventDefault();
    if (pwValue.length < 8) {
      setPwError('Use at least 8 characters.');
      return;
    }
    setSavingId(u.id);
    setPwError('');
    try {
      await base44.admin.setUserPassword(u.id, pwValue);
      setPwDone({ id: u.id, password: pwValue });
      toast.success('Password reset');
    } catch (err) {
      setPwError(err.message || 'Failed to reset password');
    } finally {
      setSavingId(null);
    }
  };

  const copyPassword = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      /* clipboard blocked: the password is selectable on screen */
    }
  };

  // Remove an account (e.g. someone who left). Their sign-in stops working
  // right away; reports and records they created are kept.
  const removeUser = async (u) => {
    const who = u.full_name ? `${u.full_name} (${u.email})` : u.email;
    if (!confirm(`Remove ${who}?\n\nThey will be signed out and can no longer log in. Reports and records they created are kept.`)) return;
    setSavingId(u.id);
    setError('');
    try {
      await base44.admin.deleteUser(u.id);
      setUsers((cur) => cur.filter((x) => x.id !== u.id));
      toast.success('User removed');
    } catch (err) {
      setError(err.message || 'Failed to remove user');
      toast.error(err.message || 'Failed to remove user');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="3 Phase Conveyor" className="h-5 sm:h-6 w-auto shrink-0 lg:hidden" />
            <span className="text-sm font-semibold text-muted-foreground border-l border-border pl-3 lg:border-l-0 lg:pl-0 lg:font-display lg:text-lg lg:text-foreground">
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

                      {/* Reset password / remove account (not on your own row) */}
                      {!isSelf && (
                        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => (pwFor === u.id ? closePasswordReset() : openPasswordReset(u))}
                            disabled={savingId === u.id}
                            aria-expanded={pwFor === u.id}
                            aria-controls={`pw-${u.id}`}
                            className="gap-2"
                          >
                            <KeyRound className="w-4 h-4" aria-hidden="true" />
                            Reset password
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeUser(u)}
                            disabled={savingId === u.id}
                            className="gap-2 text-destructive hover:text-destructive"
                          >
                            <UserX className="w-4 h-4" aria-hidden="true" />
                            Remove
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Password reset panel */}
                    {pwFor === u.id && (
                      <div id={`pw-${u.id}`} className="mt-4 p-4 rounded-lg border border-border bg-muted/40">
                        {pwDone?.id === u.id ? (
                          <div className="space-y-3" role="status">
                            <p className="text-sm font-medium">
                              Password reset for {u.full_name || u.email}. They've been signed out on every device.
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Give them this password privately. It won't be shown again.
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              <code className="px-3 py-2 rounded-md bg-background border border-border font-mono text-base select-all break-all">
                                {pwDone.password}
                              </code>
                              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => copyPassword(pwDone.password)}>
                                <Copy className="w-4 h-4" aria-hidden="true" />
                                Copy
                              </Button>
                              <Button type="button" size="sm" onClick={closePasswordReset}>Done</Button>
                            </div>
                          </div>
                        ) : (
                          <form onSubmit={(e) => submitPasswordReset(e, u)} className="space-y-3">
                            <Label htmlFor={`pw-input-${u.id}`}>New password for {u.full_name || u.email}</Label>
                            <div className="flex flex-wrap gap-2">
                              <Input
                                id={`pw-input-${u.id}`}
                                type="text"
                                autoComplete="new-password"
                                spellCheck={false}
                                value={pwValue}
                                onChange={(e) => { setPwValue(e.target.value); setPwError(''); }}
                                aria-invalid={!!pwError}
                                aria-describedby={`pw-help-${u.id}`}
                                className="font-mono flex-1 min-w-0 basis-56"
                              />
                              <Button type="button" variant="outline" onClick={() => { setPwValue(generatePassword()); setPwError(''); }}>
                                Generate new
                              </Button>
                            </div>
                            <p id={`pw-help-${u.id}`} className={`text-xs ${pwError ? 'text-destructive' : 'text-muted-foreground'}`}>
                              {pwError || 'At least 8 characters. Saving signs them out everywhere.'}
                            </p>
                            <div className="flex gap-2">
                              <Button type="submit" size="sm" disabled={savingId === u.id}>
                                {savingId === u.id && <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />}
                                Set password
                              </Button>
                              <Button type="button" variant="ghost" size="sm" onClick={closePasswordReset}>Cancel</Button>
                            </div>
                          </form>
                        )}
                      </div>
                    )}

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
                        <div className="space-y-3">
                          {apps.map((app) => {
                            const level = (u.app_permissions && u.app_permissions[app.key]) || 'none';
                            // Supervisor (view + edit everyone's reports) only
                            // applies to Reports, so it's offered just for that app.
                            const levelOptions = [
                              { value: 'none', label: 'No access' },
                              { value: 'read', label: 'Read' },
                              { value: 'edit', label: 'Edit' },
                              ...(app.key === 'reports' ? [{ value: 'supervisor', label: 'Supervisor' }] : []),
                            ];
                            return (
                              <div key={app.key} className="flex items-center justify-between gap-4">
                                <span className="text-sm font-medium">{app.name}</span>
                                <div className="inline-flex rounded-md border border-border overflow-hidden">
                                  {levelOptions.map((opt) => (
                                    <button
                                      key={opt.value}
                                      onClick={() => setAppLevel(u, app.key, opt.value)}
                                      disabled={savingId === u.id}
                                      className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-border first:border-l-0 ${
                                        level === opt.value
                                          ? opt.value === 'none'
                                            ? 'bg-muted text-foreground'
                                            : 'bg-primary text-primary-foreground'
                                          : 'bg-card text-muted-foreground hover:bg-secondary'
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
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
