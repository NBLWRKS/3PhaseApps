import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Building2, Plus, Loader2, ChevronRight, Users } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { canRead, canEdit } from '@/lib/permissions';
import AppSwitcher from '@/components/layout/AppSwitcher';
import logo from '@/assets/logo-dark.png';

const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } };

// /portal — internal users: the list of customer portals (editors can add one).
// Customers: go straight to the one portal they have.
export default function PortalHome() {
  const { user, isLoadingAuth } = useAuth();
  const navigate = useNavigate();
  const [portals, setPortals] = useState(null);
  const [name, setName] = useState('');
  const [customer, setCustomer] = useState('');
  const [creating, setCreating] = useState(false);
  const isCustomer = user?.role === 'customer';

  useEffect(() => {
    if (!user) return;
    base44.portal.list()
      .then((list) => {
        if (isCustomer && list.length) navigate(`/portal/${list[0].id}`, { replace: true });
        else setPortals(list);
      })
      .catch(() => setPortals([]));
  }, [user, isCustomer, navigate]);

  if (isLoadingAuth) return null;
  if (!user) return <Navigate to="/portal/login" replace />;
  if (!isCustomer && !canRead(user, 'portal')) return <Navigate to="/" replace />;

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const p = await base44.portal.create({ name: name.trim(), customer: customer.trim() });
      toast.success('Portal created');
      navigate(`/portal/${p.id}`);
    } catch (err) { toast.error(err.message || 'Could not create the portal'); setCreating(false); }
  };

  if (isCustomer) {
    return (
      <div className="min-h-screen grid place-items-center px-4 text-center">
        {portals == null ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /> : (
          <div className="max-w-sm space-y-3">
            <img src={logo} alt="3 Phase Conveyor" className="h-8 w-auto mx-auto" />
            <p className="text-sm text-muted-foreground">Your login isn't linked to a project portal yet. Please contact your 3 Phase Conveyor project manager.</p>
            <button onClick={() => base44.auth.logout('/portal/login')} className="text-sm text-primary underline">Sign out</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="3 Phase Conveyor" className="h-5 sm:h-6 w-auto shrink-0 lg:hidden" />
            <span className="text-sm font-semibold text-muted-foreground border-l border-border pl-2.5 lg:border-l-0 lg:pl-0 lg:font-display lg:text-lg lg:text-foreground">Customer Portal</span>
          </div>
          <AppSwitcher currentKey="portal" />
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-5 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customer Portal</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Read-only project dashboards for customers. Each customer login sees only its own portal.</p>
        </div>

        {portals == null ? (
          <div className="flex items-center gap-2 text-muted-foreground py-10 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
        ) : portals.length === 0 ? (
          <div className="text-center py-14 rounded-2xl border border-dashed border-border bg-card/50 text-sm text-muted-foreground">
            <Building2 className="w-9 h-9 mx-auto mb-2 opacity-30" aria-hidden="true" />
            No portals yet.{canEdit(user, 'portal') ? ' Add the first one below.' : ''}
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {portals.map((p) => (
              <li key={p.id}>
                <Link to={`/portal/${p.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:border-primary/50 hover:bg-secondary/40 transition">
                  <Building2 className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {p.customer || 'No customer set'} · updated {fmtDate(p.updated_date)}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0"><Users className="w-3.5 h-3.5" aria-hidden="true" /> {p.customer_logins}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {canEdit(user, 'portal') && (
          <form onSubmit={create} className="rounded-2xl border border-border bg-card p-4 space-y-3 max-w-xl">
            <h2 className="text-sm font-semibold flex items-center gap-1.5"><Plus className="w-4 h-4" aria-hidden="true" /> New portal</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="portal-name" className="text-xs font-medium">Project name</label>
                <input id="portal-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Amazon HOU3 – Brookshire, TX" required
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label htmlFor="portal-customer" className="text-xs font-medium">Customer</label>
                <input id="portal-customer" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Intelligrated"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary" />
              </div>
            </div>
            <button type="submit" disabled={creating || !name.trim()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
              {creating && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} Create portal
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
