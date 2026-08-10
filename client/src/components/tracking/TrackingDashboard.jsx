import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend,
} from 'recharts';

const STATUS_COLORS = {
  not_started: '#9aa3af',
  in_progress: '#2C6E9B',
  complete: '#2E7D5B',
  blocked: '#C0392B',
};
const STATUS_LABELS = {
  not_started: 'Not started',
  in_progress: 'In progress',
  complete: 'Complete',
  blocked: 'Blocked',
};

function pctColor(p) {
  if (p >= 100) return '#2E7D5B';
  if (p >= 50) return '#2C6E9B';
  if (p > 0) return '#E8B33D';
  return '#cbd5e1';
}

export default function TrackingDashboard({ summary }) {
  const projectNames = summary.map((p) => p.name);
  const [selected, setSelected] = useState('__all__');

  // Overall program completion: weighted by each project's total task weight.
  const overall = useMemo(() => {
    let wsum = 0, psum = 0;
    for (const p of summary) {
      const w = (p.areas || []).reduce((s, a) => s + (a.weight || 0), 0);
      wsum += w; psum += w * p.percent;
    }
    return wsum > 0 ? Math.round(psum / wsum) : 0;
  }, [summary]);

  // Aggregate status counts across all (or the selected) project.
  const statusData = useMemo(() => {
    const totals = { not_started: 0, in_progress: 0, complete: 0, blocked: 0 };
    const projects = selected === '__all__' ? summary : summary.filter((p) => p.id === selected);
    for (const p of projects) {
      for (const k of Object.keys(totals)) totals[k] += (p.status_counts?.[k] || 0);
    }
    return Object.entries(totals)
      .map(([k, v]) => ({ key: k, name: STATUS_LABELS[k], value: v, color: STATUS_COLORS[k] }))
      .filter((d) => d.value > 0);
  }, [summary, selected]);

  // Completion % per project.
  const projectData = summary.map((p) => ({ name: p.name, percent: p.percent }));

  // Completion % by area within the selected project (or all if none selected).
  const areaData = useMemo(() => {
    const projects = selected === '__all__' ? summary : summary.filter((p) => p.id === selected);
    const rows = [];
    for (const p of projects) {
      for (const a of p.areas || []) {
        rows.push({ name: selected === '__all__' ? `${p.name} · ${a.name}` : a.name, percent: a.percent });
      }
    }
    return rows;
  }, [summary, selected]);

  const totalTasks = summary.reduce((s, p) => s + (p.task_count || 0), 0);
  const totalBlocked = summary.reduce((s, p) => s + (p.status_counts?.blocked || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Overall completion" value={`${overall}%`} accent={pctColor(overall)} />
        <StatCard label="Projects" value={summary.length} />
        <StatCard label="Total tasks" value={totalTasks} />
        <StatCard label="Blocked" value={totalBlocked} accent={totalBlocked > 0 ? '#C0392B' : undefined} />
      </div>

      {/* Project filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground">Focus:</span>
        <button onClick={() => setSelected('__all__')}
          className={`text-sm px-3 py-1 rounded-full border ${selected === '__all__' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-secondary'}`}>
          All projects
        </button>
        {summary.map((p) => (
          <button key={p.id} onClick={() => setSelected(p.id)}
            className={`text-sm px-3 py-1 rounded-full border ${selected === p.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-secondary'}`}>
            {p.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Completion by project */}
        <ChartCard title="Completion % by project">
          <ResponsiveContainer width="100%" height={Math.max(200, projectData.length * 44 + 40)}>
            <BarChart data={projectData} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} fontSize={12} />
              <YAxis type="category" dataKey="name" width={110} fontSize={12} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Bar dataKey="percent" radius={[0, 4, 4, 0]}>
                {projectData.map((d, i) => <Cell key={i} fill={pctColor(d.percent)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Readiness / status breakdown */}
        <ChartCard title={`Readiness${selected !== '__all__' ? ' (selected project)' : ''}`}>
          {statusData.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {statusData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Completion by area */}
        <ChartCard title="Completion % by area" full>
          {areaData.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={Math.max(200, areaData.length * 36 + 40)}>
              <BarChart data={areaData} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} fontSize={12} />
                <YAxis type="category" dataKey="name" width={selected === '__all__' ? 160 : 110} fontSize={12} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Bar dataKey="percent" radius={[0, 4, 4, 0]}>
                  {areaData.map((d, i) => <Cell key={i} fill={pctColor(d.percent)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className="border border-border rounded-xl bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold mt-0.5" style={accent ? { color: accent } : undefined}>{value}</div>
    </div>
  );
}

function ChartCard({ title, children, full }) {
  return (
    <div className={`border border-border rounded-xl bg-card p-4 ${full ? 'lg:col-span-2' : ''}`}>
      <h3 className="text-sm font-semibold text-muted-foreground mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Empty() {
  return <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No data</div>;
}
