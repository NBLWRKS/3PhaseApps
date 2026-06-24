import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { canRead, canEdit } from '@/lib/permissions';
import { ArrowLeft, Plus, Trash2, Loader2, Tag } from 'lucide-react';
import { toast } from 'sonner';
import logo from '@/assets/logo.jpg';
import AppSwitcher from '@/components/layout/AppSwitcher';

export default function SafetyTrainingTypes() {
  const navigate = useNavigate();
  const { user, isLoadingAuth } = useAuth();
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const editable = canEdit(user, 'safety');

  const load = () => {
    base44.safety.listTrainingTypes()
      .then((t) => setTypes(t || []))
      .catch(() => toast.error('Failed to load training types'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!user) return;
    load();
  }, [user]);

  if (!isLoadingAuth && !canRead(user, 'safety')) return <Navigate to="/" replace />;

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      await base44.safety.addTrainingType(name);
      setNewName('');
      load();
      toast.success('Training type added');
    } catch {
      toast.error('Failed to add training type');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t) => {
    if (!confirm(`Delete "${t.name}"? This won't change existing records, but the type won't be selectable for new ones.`)) return;
    try {
      await base44.safety.deleteTrainingType(t.id);
      setTypes((list) => list.filter((x) => x.id !== t.id));
    } catch {
      toast.error('Failed to delete training type');
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={logo} alt="3 Phase Conveyor" className="h-7 w-auto" />
            <span className="text-sm font-semibold text-muted-foreground border-l border-border pl-2">
              Safety Credentials
            </span>
          </div>
          <AppSwitcher currentKey="safety" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <button onClick={() => navigate('/safety')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> All employees
        </button>

        <div className="flex items-center gap-2 mb-1">
          <Tag className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Training Types</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Manage the list of trainings that can be assigned to employees.
        </p>

        {editable && (
          <div className="flex items-center gap-2 mb-5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="New training type name…"
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-card text-sm outline-none focus:border-primary"
            />
            <button
              onClick={add}
              disabled={saving || !newName.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : types.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">No training types yet.</p>
        ) : (
          <div className="bg-card border border-border rounded-lg divide-y divide-border overflow-hidden">
            {types.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="font-medium">{t.name}</span>
                {editable && (
                  <button onClick={() => remove(t)} className="p-1.5 text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
