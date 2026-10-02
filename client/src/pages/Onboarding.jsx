import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { CheckCircle2, Circle, Loader2, FileText, ChevronLeft, ShieldCheck, GraduationCap } from 'lucide-react';
import logo from '@/assets/logo.jpg';

export default function Onboarding() {
  const [employees, setEmployees] = useState([]);
  const [courses, setCourses] = useState([]);
  const [employeeId, setEmployeeId] = useState('');
  const [completions, setCompletions] = useState({}); // course_id -> completed_date
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);         // course currently being viewed
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([base44.onboarding.publicEmployees(), base44.onboarding.publicCourses()])
      .then(([emps, crs]) => { setEmployees(emps || []); setCourses(crs || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadCompletions = useCallback((id) => {
    if (!id) { setCompletions({}); return; }
    base44.onboarding.publicCompletions(id)
      .then((rows) => {
        const m = {};
        for (const r of rows || []) m[r.course_id] = r.completed_date;
        setCompletions(m);
      })
      .catch(() => setCompletions({}));
  }, []);

  useEffect(() => { loadCompletions(employeeId); }, [employeeId, loadCompletions]);

  const openCourse = (c) => { setActive(c); setAgreed(false); };
  const confirmComplete = async () => {
    if (!employeeId || !active) return;
    setSaving(true);
    try {
      await base44.onboarding.complete(employeeId, active.id);
      setCompletions((m) => ({ ...m, [active.id]: new Date().toISOString() }));
      setActive(null); setAgreed(false);
    } catch { alert('Could not record your completion. Please try again.'); }
    finally { setSaving(false); }
  };

  const Shell = ({ children }) => (
    <div className="min-h-screen bg-background text-foreground">
      <header className="bg-card border-b border-border">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-2.5">
          <img src={logo} alt="3 Phase Conveyor" className="h-7 w-auto" />
          <span className="text-sm font-semibold text-muted-foreground border-l border-border pl-2.5">Onboarding</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">{children}</main>
    </div>
  );

  if (loading) return <Shell><div className="flex items-center gap-2 text-muted-foreground py-16 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div></Shell>;

  // ----- course viewer -----
  if (active) {
    return (
      <Shell>
        <button onClick={() => setActive(null)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ChevronLeft className="w-4 h-4" /> Back to courses
        </button>
        <h1 className="text-xl font-bold mb-3">{active.name}</h1>
        <div className="rounded-xl border border-border overflow-hidden bg-card mb-4" style={{ height: '70vh' }}>
          <iframe title={active.name} src={base44.onboarding.courseFileUrl(active.id)} className="w-full h-full" />
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 w-4 h-4" />
            <span className="text-sm">By continuing, I agree that I have completed all training related to this course.</span>
          </label>
          <div className="flex justify-end mt-4">
            <button onClick={confirmComplete} disabled={!agreed || saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} <CheckCircle2 className="w-4 h-4" /> Complete course
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ----- course list -----
  return (
    <Shell>
      <div className="flex items-center gap-2 mb-1">
        <GraduationCap className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Employee Onboarding</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-5">Select your name, then complete each training course below.</p>

      <a href="/safety" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mb-6">
        <ShieldCheck className="w-4 h-4" /> View Safety Credentials
      </a>

      <div className="mb-6">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your name</label>
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}
          className="w-full mt-1 bg-card border border-border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30">
          <option value="">— Select your name —</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      {courses.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border border-dashed border-border bg-card/50 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-25" />
          <p>No training courses available yet.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {courses.map((c) => {
            const done = !!completions[c.id];
            return (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                {done ? <CheckCircle2 className="w-5 h-5 text-green-600 flex-none" /> : <Circle className="w-5 h-5 text-muted-foreground flex-none" />}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{done ? 'Completed' : 'Not started'}</div>
                </div>
                <button onClick={() => openCourse(c)} disabled={!employeeId}
                  className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
                  {done ? 'Review' : 'Start'}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {!employeeId && courses.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3 text-center">Select your name above to begin a course.</p>
      )}
    </Shell>
  );
}
