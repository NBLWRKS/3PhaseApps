import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { canRead, canEdit } from '@/lib/permissions';
import {
  Plus, Trash2, ChevronDown, ChevronRight, Loader2, BarChart3, Table2,
  Download, Ban, FolderPlus, Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import logo from '@/assets/logo.jpg';
import AppSwitcher from '@/components/layout/AppSwitcher';
import TrackingDashboard from '@/components/tracking/TrackingDashboard';
import { exportTrackingXlsx } from '@/lib/trackingExport';

const STATUS_META = {
  not_started: { label: 'Not started', color: '#9aa3af', bg: 'bg-neutral-100 text-neutral-600' },
  in_progress: { label: 'In progress', color: '#2C6E9B', bg: 'bg-blue-50 text-blue-700' },
  complete: { label: 'Complete', color: '#2E7D5B', bg: 'bg-green-50 text-green-700' },
  blocked: { label: 'Blocked', color: '#C0392B', bg: 'bg-red-50 text-red-700' },
};

function pctColor(p) {
  if (p >= 100) return '#2E7D5B';
  if (p >= 50) return '#2C6E9B';
  if (p > 0) return '#E8B33D';
  return '#cbd5e1';
}

export default function Tracking() {
  const { user, loading } = useAuth();
  const [view, setView] = useState('table'); // 'table' | 'dashboard'
  const [summary, setSummary] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [expanded, setExpanded] = useState(() => new Set());

  const editable = canEdit(user, 'tracking');

  const load = useCallback(() => {
    setLoadingData(true);
    base44.tracking.summary()
      .then((data) => {
        setSummary(Array.isArray(data) ? data : []);
        // expand all projects+areas by default on first load
        setExpanded((prev) => {
          if (prev.size > 0) return prev;
          const s = new Set();
          for (const p of data || []) {
            s.add(`p:${p.id}`);
            for (const a of p.areas || []) s.add(`a:${a.id}`);
          }
          return s;
        });
      })
      .catch(() => toast.error('Failed to load tracking data'))
      .finally(() => setLoadingData(false));
  }, []);

  useEffect(() => { if (canRead(user, 'tracking')) load(); }, [user, load]);

  if (loading) return null;
  if (!canRead(user, 'tracking')) return <Navigate to="/" replace />;

  const toggle = (key) => setExpanded((prev) => {
    const s = new Set(prev);
    s.has(key) ? s.delete(key) : s.add(key);
    return s;
  });

  // ---- mutations (optimistic-ish: reload after) ----
  const addProject = async () => {
    const name = prompt('New project name:');
    if (!name || !name.trim()) return;
    try { await base44.tracking.addProject(name.trim()); load(); } catch { toast.error('Failed to add project'); }
  };
  const addArea = async (projectId) => {
    const name = prompt('New area name:');
    if (!name || !name.trim()) return;
    try { await base44.tracking.addArea(projectId, name.trim()); load(); } catch { toast.error('Failed to add area'); }
  };
  const addTask = async (areaId) => {
    try {
      await base44.tracking.addTask(areaId, { name: 'New task', percent: 0, weight: 1 });
      load();
    } catch { toast.error('Failed to add task'); }
  };
  const delProject = async (p) => {
    if (!confirm(`Delete project "${p.name}" and all its areas and tasks?`)) return;
    try { await base44.tracking.deleteProject(p.id); load(); } catch { toast.error('Failed to delete'); }
  };
  const delArea = async (a) => {
    if (!confirm(`Delete area "${a.name}" and its tasks?`)) return;
    try { await base44.tracking.deleteArea(a.id); load(); } catch { toast.error('Failed to delete'); }
  };
  const delTask = async (t) => {
    if (!confirm('Delete this task?')) return;
    try { await base44.tracking.deleteTask(t.id); load(); } catch { toast.error('Failed to delete'); }
  };

  // Debounced-ish inline task save
  const saveTask = async (t, patch) => {
    try {
      await base44.tracking.updateTask(t.id, patch);
      load();
    } catch { toast.error('Failed to save'); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={logo} alt="3 Phase Conveyor" className="h-7 w-auto" />
            <span className="text-sm font-semibold text-muted-foreground border-l border-border pl-2">
              Project Tracking
            </span>
          </div>
          <AppSwitcher />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-2 mb-5 flex-wrap">
          <div className="flex items-center gap-2">
            <Layers className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">Project Tracking</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-border overflow-hidden">
              <button onClick={() => setView('table')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm ${view === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}>
                <Table2 className="w-4 h-4" /> Table
              </button>
              <button onClick={() => setView('dashboard')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border-l border-border ${view === 'dashboard' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}>
                <BarChart3 className="w-4 h-4" /> Dashboard
              </button>
            </div>
            <button onClick={() => exportTrackingXlsx(summary)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary"
              title="Export to Excel">
              <Download className="w-4 h-4" /> <span className="hidden sm:inline">Export</span>
            </button>
            {editable && (
              <button onClick={addProject}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
                <FolderPlus className="w-4 h-4" /> Project
              </button>
            )}
          </div>
        </div>

        {loadingData ? (
          <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading…
          </div>
        ) : summary.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No projects yet.</p>
            {editable && <button onClick={addProject} className="mt-3 text-primary hover:underline text-sm">Add your first project</button>}
          </div>
        ) : view === 'dashboard' ? (
          <TrackingDashboard summary={summary} />
        ) : (
          <div className="space-y-4">
            {summary.map((p) => (
              <ProjectBlock
                key={p.id} project={p} editable={editable}
                expanded={expanded} toggle={toggle}
                onAddArea={addArea} onAddTask={addTask}
                onDelProject={delProject} onDelArea={delArea} onDelTask={delTask}
                onSaveTask={saveTask}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function ProgressBar({ percent }) {
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <div className="flex-1 h-2 rounded-full bg-neutral-200 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: pctColor(percent) }} />
      </div>
      <span className="text-xs font-semibold tabular-nums w-9 text-right">{percent}%</span>
    </div>
  );
}

function ProjectBlock({ project: p, editable, expanded, toggle, onAddArea, onAddTask, onDelProject, onDelArea, onDelTask, onSaveTask }) {
  const open = expanded.has(`p:${p.id}`);
  const sc = p.status_counts || {};
  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden">
      {/* Project header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-secondary/40">
        <button onClick={() => toggle(`p:${p.id}`)} className="text-muted-foreground">
          {open ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </button>
        <span className="font-bold text-lg flex-1 truncate">{p.name}</span>
        <div className="hidden sm:flex items-center gap-1.5 text-xs">
          {sc.blocked > 0 && <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700">{sc.blocked} blocked</span>}
          <span className="text-muted-foreground">{p.task_count} tasks · {p.area_count} areas</span>
        </div>
        <div className="w-40"><ProgressBar percent={p.percent} /></div>
        {editable && (
          <div className="flex items-center gap-1">
            <button onClick={() => onAddArea(p.id)} title="Add area" className="p-1.5 text-muted-foreground hover:text-primary"><Plus className="w-4 h-4" /></button>
            <button onClick={() => onDelProject(p)} title="Delete project" className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
          </div>
        )}
      </div>

      {open && (
        <div className="divide-y divide-border">
          {(p.areas || []).length === 0 && (
            <div className="px-6 py-3 text-sm text-muted-foreground">
              No areas yet.{editable && <button onClick={() => onAddArea(p.id)} className="ml-2 text-primary hover:underline">Add an area</button>}
            </div>
          )}
          {(p.areas || []).map((a) => (
            <AreaBlock key={a.id} area={a} editable={editable} expanded={expanded} toggle={toggle}
              onAddTask={onAddTask} onDelArea={onDelArea} onDelTask={onDelTask} onSaveTask={onSaveTask} />
          ))}
        </div>
      )}
    </div>
  );
}

function AreaBlock({ area: a, editable, expanded, toggle, onAddTask, onDelArea, onDelTask, onSaveTask }) {
  const open = expanded.has(`a:${a.id}`);
  return (
    <div>
      <div className="flex items-center gap-3 px-4 sm:px-6 py-2.5 bg-card">
        <button onClick={() => toggle(`a:${a.id}`)} className="text-muted-foreground">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <span className="font-semibold flex-1 truncate">{a.name}</span>
        <span className="hidden sm:block text-xs text-muted-foreground">{a.task_count} tasks</span>
        <div className="w-40"><ProgressBar percent={a.percent} /></div>
        {editable && (
          <div className="flex items-center gap-1">
            <button onClick={() => onAddTask(a.id)} title="Add task" className="p-1.5 text-muted-foreground hover:text-primary"><Plus className="w-4 h-4" /></button>
            <button onClick={() => onDelArea(a)} title="Delete area" className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
          </div>
        )}
      </div>

      {open && (a.tasks || []).length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-y border-border bg-secondary/20">
                <th className="text-left font-medium px-4 sm:px-6 py-1.5">Task</th>
                <th className="text-left font-medium px-2 py-1.5 w-24">%</th>
                <th className="text-left font-medium px-2 py-1.5 w-16">Wt</th>
                <th className="text-left font-medium px-2 py-1.5 w-28">Status</th>
                <th className="text-left font-medium px-2 py-1.5 w-32 hidden md:table-cell">Assignee</th>
                <th className="text-left font-medium px-2 py-1.5 w-32 hidden lg:table-cell">Target</th>
                {editable && <th className="w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {a.tasks.map((t) => (
                <TaskRow key={t.id} task={t} editable={editable} onSave={onSaveTask} onDelete={onDelTask} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TaskRow({ task: t, editable, onSave, onDelete }) {
  const [local, setLocal] = useState(t);
  useEffect(() => { setLocal(t); }, [t.id, t.percent, t.weight, t.blocked, t.name, t.assignee, t.target_date]);
  const meta = STATUS_META[t.status] || STATUS_META.not_started;

  const commit = (patch) => {
    setLocal((l) => ({ ...l, ...patch }));
    onSave(t, patch);
  };

  return (
    <tr className="border-b border-border last:border-0 hover:bg-secondary/20">
      <td className="px-4 sm:px-6 py-1.5">
        {editable ? (
          <input value={local.name} onChange={(e) => setLocal((l) => ({ ...l, name: e.target.value }))}
            onBlur={(e) => e.target.value !== t.name && commit({ name: e.target.value })}
            className="w-full bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-primary/40 rounded px-1 py-0.5" />
        ) : <span>{t.name}</span>}
      </td>
      <td className="px-2 py-1.5">
        {editable ? (
          <input type="number" min="0" max="100" value={local.percent}
            onChange={(e) => setLocal((l) => ({ ...l, percent: e.target.value }))}
            onBlur={(e) => Number(e.target.value) !== t.percent && commit({ percent: Number(e.target.value) })}
            className="w-16 bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-primary/40 rounded px-1 py-0.5 tabular-nums" />
        ) : <span className="tabular-nums">{t.percent}%</span>}
      </td>
      <td className="px-2 py-1.5">
        {editable ? (
          <input type="number" min="0" step="0.5" value={local.weight}
            onChange={(e) => setLocal((l) => ({ ...l, weight: e.target.value }))}
            onBlur={(e) => Number(e.target.value) !== t.weight && commit({ weight: Number(e.target.value) })}
            className="w-12 bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-primary/40 rounded px-1 py-0.5 tabular-nums" />
        ) : <span className="tabular-nums">{t.weight}</span>}
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className={`text-xs px-2 py-0.5 rounded-full ${meta.bg}`}>{meta.label}</span>
          {editable && (
            <button onClick={() => commit({ blocked: !local.blocked })}
              title={local.blocked ? 'Unblock' : 'Mark blocked'}
              className={`p-0.5 rounded ${local.blocked ? 'text-red-600' : 'text-neutral-300 hover:text-red-500'}`}>
              <Ban className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>
      <td className="px-2 py-1.5 hidden md:table-cell">
        {editable ? (
          <input value={local.assignee || ''} placeholder="—"
            onChange={(e) => setLocal((l) => ({ ...l, assignee: e.target.value }))}
            onBlur={(e) => (e.target.value || '') !== (t.assignee || '') && commit({ assignee: e.target.value })}
            className="w-full bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-primary/40 rounded px-1 py-0.5" />
        ) : <span className="text-muted-foreground">{t.assignee || '—'}</span>}
      </td>
      <td className="px-2 py-1.5 hidden lg:table-cell">
        {editable ? (
          <input type="date" value={local.target_date || ''}
            onChange={(e) => commit({ target_date: e.target.value })}
            className="bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-primary/40 rounded px-1 py-0.5 text-muted-foreground" />
        ) : <span className="text-muted-foreground">{t.target_date || '—'}</span>}
      </td>
      {editable && (
        <td className="px-2 py-1.5">
          <button onClick={() => onDelete(t)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
        </td>
      )}
    </tr>
  );
}
