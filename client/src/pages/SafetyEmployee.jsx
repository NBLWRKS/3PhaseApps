import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { canRead, canEdit } from '@/lib/permissions';
import { Navigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Pencil, ShieldCheck, Loader2, X, Check, Camera, User } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO, differenceInDays } from 'date-fns';
import logo from '@/assets/logo.jpg';
import AppSwitcher from '@/components/layout/AppSwitcher';

// Compute Valid / Expiring soon / Expired from an expiration date.
function recordStatus(rec) {
  if (!rec.expires_date) return { label: 'No expiry', cls: 'bg-muted text-muted-foreground' };
  const days = differenceInDays(parseISO(rec.expires_date), new Date());
  if (days < 0) return { label: 'Expired', cls: 'bg-destructive/15 text-destructive' };
  if (days <= 30) return { label: `Expires in ${days}d`, cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' };
  return { label: 'Valid', cls: 'bg-green-600/15 text-green-700 dark:text-green-400' };
}

function fmt(d) {
  if (!d) return '—';
  try { return format(parseISO(d), 'MMM d, yyyy'); } catch { return d; }
}

const EMPTY = { training: '', passed_date: '', expires_date: '', notes: '', no_expiry: false };

export default function SafetyEmployee() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user, isLoadingAuth } = useAuth();
  const [emp, setEmp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState([]);
  const [editingId, setEditingId] = useState(null); // record id being edited, or 'new'
  const [form, setForm] = useState(EMPTY);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editingPosition, setEditingPosition] = useState(false);
  const [positionDraft, setPositionDraft] = useState('');

  const editable = canEdit(user, 'safety');

  const load = useCallback(() => {
    base44.safety.getEmployee(slug)
      .then((e) => setEmp(e))
      .catch(() => toast.error('Failed to load employee'))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!user) return;
    load();
    base44.safety.listTrainingTypes().then((t) => setTypes(t || [])).catch(() => {});
  }, [user, load]);

  if (!isLoadingAuth && !canRead(user, 'safety')) return <Navigate to="/" replace />;

  const startAdd = () => { setForm(EMPTY); setEditingId('new'); };
  const startEdit = (rec) => {
    setForm({
      training: rec.training || '',
      passed_date: rec.passed_date || '',
      expires_date: rec.expires_date || '',
      notes: rec.notes || '',
      // A record with a date passed but no expiration is treated as no-expiry.
      no_expiry: !!rec.passed_date && !rec.expires_date,
    });
    setEditingId(rec.id);
  };
  const cancel = () => { setEditingId(null); setForm(EMPTY); };

  const saveRecord = async () => {
    if (!form.training) { toast.error('Pick a training type'); return; }
    try {
      if (editingId === 'new') {
        await base44.safety.addRecord(emp.id, form);
        toast.success('Record added');
      } else {
        await base44.safety.updateRecord(editingId, form);
        toast.success('Record updated');
      }
      cancel();
      load();
    } catch {
      toast.error('Failed to save record');
    }
  };

  const deleteRecord = async (id) => {
    if (!confirm('Delete this training record?')) return;
    try {
      await base44.safety.deleteRecord(id);
      load();
    } catch {
      toast.error('Failed to delete record');
    }
  };

  // Upload a photo file, then save its URL to the employee record.
  const onPhotoPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file later
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file'); return; }
    setUploadingPhoto(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.safety.updateEmployee(emp.id, { photo_url: file_url });
      setEmp((prev) => ({ ...prev, photo_url: file_url }));
      toast.success('Photo updated');
    } catch {
      toast.error('Failed to upload photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removePhoto = async () => {
    if (!confirm('Remove this photo?')) return;
    try {
      await base44.safety.updateEmployee(emp.id, { photo_url: '' });
      setEmp((prev) => ({ ...prev, photo_url: null }));
    } catch {
      toast.error('Failed to remove photo');
    }
  };

  const savePosition = async () => {
    try {
      await base44.safety.updateEmployee(emp.id, { position: positionDraft });
      setEmp((prev) => ({ ...prev, position: positionDraft || null }));
      setEditingPosition(false);
      toast.success('Position updated');
    } catch {
      toast.error('Failed to update position');
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={logo} alt="3 Phase Conveyor" className="h-7 w-auto" />
            <span className="text-sm font-semibold text-muted-foreground border-l border-border pl-2">
              Safety Credentials
            </span>
          </div>
          <AppSwitcher currentKey="safety" />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <button onClick={() => navigate('/safety')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> All employees
        </button>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : !emp ? (
          <p className="text-muted-foreground text-center py-16">Employee not found.</p>
        ) : (
          <>
            <div className="flex items-start gap-4 mb-5">
              {/* Employee photo with upload/replace */}
              <div className="flex-none">
                <div className="w-24 h-24 rounded-xl overflow-hidden border-2 border-border bg-muted flex items-center justify-center">
                  {emp.photo_url ? (
                    <img src={emp.photo_url} alt={emp.name} className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-10 h-10 text-muted-foreground/40" />
                  )}
                </div>
                {editable && (
                  <div className="mt-1.5 flex flex-col items-center gap-0.5">
                    <label className="cursor-pointer inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      {uploadingPhoto ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
                      {emp.photo_url ? 'Replace' : 'Add photo'}
                      <input type="file" accept="image/*" className="hidden" onChange={onPhotoPick} disabled={uploadingPhoto} />
                    </label>
                    {emp.photo_url && (
                      <button onClick={removePhoto} className="text-[11px] text-muted-foreground hover:text-destructive">Remove</button>
                    )}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <ShieldCheck className="w-6 h-6 text-primary flex-none" />
                  <h1 className="text-2xl font-bold truncate">{emp.name}</h1>
                </div>

                {/* Position / title */}
                {editingPosition ? (
                  <div className="flex items-center gap-1.5 mb-1">
                    <input
                      value={positionDraft}
                      onChange={(e) => setPositionDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && savePosition()}
                      placeholder="Position / title"
                      autoFocus
                      className="px-2 py-1 rounded border border-border bg-card text-sm outline-none focus:border-primary"
                    />
                    <button onClick={savePosition} className="p-1 text-primary"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setEditingPosition(false)} className="p-1 text-muted-foreground"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-muted-foreground">{emp.position || 'No position set'}</span>
                    {editable && (
                      <button onClick={() => { setPositionDraft(emp.position || ''); setEditingPosition(true); }} className="text-muted-foreground hover:text-foreground">
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}

                <a
                  href={`/SafetyCredentials/${emp.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  View public credential card ↗
                </a>
              </div>
            </div>

            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Training</h2>
              {editable && editingId == null && (
                <button onClick={startAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
                  <Plus className="w-4 h-4" /> Add record
                </button>
              )}
            </div>

            {editingId === 'new' && (
              <RecordForm form={form} setForm={setForm} types={types} onSave={saveRecord} onCancel={cancel} />
            )}

            {(emp.records || []).length === 0 && editingId !== 'new' ? (
              <p className="text-muted-foreground text-sm py-8 text-center border border-dashed border-border rounded-lg">
                No training records yet.
              </p>
            ) : (
              <div className="space-y-2">
                {(emp.records || []).map((rec) =>
                  editingId === rec.id ? (
                    <RecordForm key={rec.id} form={form} setForm={setForm} types={types} onSave={saveRecord} onCancel={cancel} />
                  ) : (
                    <div key={rec.id} className="bg-card border border-border rounded-lg p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{rec.training}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${recordStatus(rec).cls}`}>{recordStatus(rec).label}</span>
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            Passed: {fmt(rec.passed_date)} &nbsp;·&nbsp; Expires: {fmt(rec.expires_date)}
                          </div>
                          {rec.notes && <div className="text-sm text-muted-foreground mt-1 break-words">{rec.notes}</div>}
                        </div>
                        {editable && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => startEdit(rec)} className="p-1.5 text-muted-foreground hover:text-foreground"><Pencil className="w-4 h-4" /></button>
                            <button onClick={() => deleteRecord(rec.id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function RecordForm({ form, setForm, types, onSave, onCancel }) {
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="bg-card border border-primary/40 rounded-lg p-3 mb-2 space-y-2">
      <div>
        <label className="text-xs font-medium text-muted-foreground">Training type</label>
        <select
          value={form.training}
          onChange={(e) => set('training', e.target.value)}
          className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary"
        >
          <option value="">Select a training…</option>
          {types.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Training / Evaluation date</label>
          <input type="date" value={form.passed_date || ''} onChange={(e) => set('passed_date', e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">{form.no_expiry ? 'Expires' : 'Expires (auto: +3 yrs)'}</label>
          <div className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-muted text-sm text-muted-foreground">
            {form.no_expiry
              ? 'No expiry'
              : (form.passed_date ? (() => { const d = new Date(form.passed_date); d.setFullYear(d.getFullYear() + 3); return d.toISOString().slice(0, 10); })() : '—')}
          </div>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
        <input
          type="checkbox"
          checked={!!form.no_expiry}
          onChange={(e) => set('no_expiry', e.target.checked)}
          className="w-4 h-4 accent-primary"
        />
        <span>No expiry (this certification does not expire)</span>
      </label>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Notes (cert #, provider…)</label>
        <input value={form.notes || ''} onChange={(e) => set('notes', e.target.value)}
          className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary" />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button onClick={onSave} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"><Check className="w-4 h-4" /> Save</button>
        <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm"><X className="w-4 h-4" /> Cancel</button>
      </div>
    </div>
  );
}
