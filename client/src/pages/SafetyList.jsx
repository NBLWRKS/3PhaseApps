import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { canRead, canEdit } from '@/lib/permissions';
import { Navigate } from 'react-router-dom';
import { Search, Plus, ShieldCheck, ChevronRight, Loader2, Tag, IdCard, CheckSquare, Square, X } from 'lucide-react';
import { toast } from 'sonner';
import logo from '@/assets/logo.jpg';
import AppSwitcher from '@/components/layout/AppSwitcher';
import { downloadCardsPdf } from '@/lib/idCardGenerator';

// Compute an overall credential status for an employee from their record count.
function statusFromRecords(count) {
  if (!count) return { label: 'No records', cls: 'bg-muted text-muted-foreground' };
  return { label: `${count} record${count === 1 ? '' : 's'}`, cls: 'bg-primary/10 text-primary' };
}

export default function SafetyList() {
  const navigate = useNavigate();
  const { user, isLoadingAuth } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  // ID-card selection mode: pick employees, then generate a printable PDF.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState('');

  const editable = canEdit(user, 'safety');

  useEffect(() => {
    if (!user) return;
    base44.safety.listEmployees()
      .then((rows) => setEmployees(rows || []))
      .catch(() => toast.error('Failed to load employees'))
      .finally(() => setLoading(false));
  }, [user]);

  if (!isLoadingAuth && !canRead(user, 'safety')) {
    return <Navigate to="/" replace />;
  }

  const filtered = employees.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase())
  );

  const addEmployee = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const emp = await base44.safety.addEmployee(name);
      setEmployees((list) => [...list, { ...emp, record_count: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
      setAdding(false);
      toast.success('Employee added');
    } catch {
      toast.error('Failed to add employee');
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected(new Set(filtered.map((e) => e.id)));
  };

  const clearSelection = () => setSelected(new Set());

  const exitSelectMode = () => { setSelectMode(false); clearSelection(); };

  const generateCards = async () => {
    const chosen = employees.filter((e) => selected.has(e.id));
    if (chosen.length === 0) { toast.error('Select at least one employee'); return; }
    // Fetch full records (photo_url + position) for each selected employee,
    // since the list only carries summary fields.
    setGenerating(true);
    setGenProgress('Preparing…');
    try {
      const full = [];
      for (const e of chosen) {
        // eslint-disable-next-line no-await-in-loop
        const detail = await base44.safety.getEmployee(e.slug);
        full.push(detail);
      }
      await downloadCardsPdf(full, (done, total) => setGenProgress(`Rendering card ${done} of ${total}…`));
      toast.success(`Generated ${chosen.length} card${chosen.length === 1 ? '' : 's'}`);
      exitSelectMode();
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate cards');
    } finally {
      setGenerating(false);
      setGenProgress('');
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={logo} alt="3 Phase Conveyor" className="h-7 w-auto" />
            <span className="text-sm font-semibold text-muted-foreground border-l border-border pl-2">
              Safety Credentials
            </span>
          </div>
          <AppSwitcher currentKey="safety" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-2 mb-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">Employee Safety Credentials</h1>
          </div>
          <div className="flex items-center gap-2">
            {editable && (
              <button
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm ${selectMode ? 'border-primary text-primary bg-primary/5' : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'}`}
              >
                <IdCard className="w-4 h-4" /> <span className="hidden sm:inline">{selectMode ? 'Cancel' : 'ID cards'}</span>
              </button>
            )}
            <button
              onClick={() => navigate('/safety/training-types')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary"
            >
              <Tag className="w-4 h-4" /> <span className="hidden sm:inline">Training types</span>
            </button>
          </div>
        </div>

        {/* Selection action bar (ID card mode) */}
        {selectMode && (
          <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-lg border border-primary/30 bg-primary/5">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <button onClick={selectAllVisible} className="text-xs text-primary hover:underline">Select all shown</button>
            {selected.size > 0 && <button onClick={clearSelection} className="text-xs text-muted-foreground hover:underline">Clear</button>}
            <button
              onClick={generateCards}
              disabled={generating || selected.size === 0}
              className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> {genProgress || 'Generating…'}</> : <><IdCard className="w-4 h-4" /> Generate {selected.size > 0 ? selected.size : ''} card{selected.size === 1 ? '' : 's'}</>}
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employees…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card text-sm outline-none focus:border-primary"
            />
          </div>
          {editable && (
            <button
              onClick={() => setAdding((a) => !a)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          )}
        </div>

        {adding && (
          <div className="flex items-center gap-2 mb-4 p-3 rounded-lg border border-border bg-card">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addEmployee()}
              placeholder="Last, First  (e.g. Smith, John)"
              autoFocus
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary"
            />
            <button onClick={addEmployee} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Save</button>
            <button onClick={() => { setAdding(false); setNewName(''); }} className="px-3 py-2 rounded-lg border border-border text-sm">Cancel</button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-center py-16">No employees found.</p>
        ) : (
          <div className="bg-card border border-border rounded-lg divide-y divide-border overflow-hidden">
            {filtered.map((e) => {
              const st = statusFromRecords(e.record_count);
              const isSel = selected.has(e.id);
              return (
                <button
                  key={e.id}
                  onClick={() => (selectMode ? toggleSelect(e.id) : navigate(`/safety/${e.slug}`))}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-secondary transition-colors ${isSel ? 'bg-primary/5' : ''}`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    {selectMode && (
                      isSel
                        ? <CheckSquare className="w-5 h-5 text-primary flex-none" />
                        : <Square className="w-5 h-5 text-muted-foreground flex-none" />
                    )}
                    <span className="font-medium truncate">{e.name}</span>
                  </span>
                  <span className="flex items-center gap-3 flex-none">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                    {!selectMode && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
