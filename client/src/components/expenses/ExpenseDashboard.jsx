import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend, LineChart, Line,
} from 'recharts';

const money = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

// Palette for category slices.
const CAT_COLORS = ['#2C6E9B', '#2E7D5B', '#E8B33D', '#C0392B', '#7E57C2', '#00897B', '#8D6E63', '#5C6BC0', '#EF6C00'];

function budgetColor(pct) {
  if (pct >= 100) return '#C0392B';
  if (pct >= 85) return '#E8B33D';
  return '#2E7D5B';
}

export default function ExpenseDashboard({ summary }) {
  const [selected, setSelected] = useState('__all__');
  const scoped = selected === '__all__' ? summary : summary.filter((p) => p.id === selected);

  const grandTotal = summary.reduce((s, p) => s + (p.totals?.total || 0), 0);
  const totalHours = summary.reduce((s, p) => s + (p.totals?.hours || 0), 0);
  const totalPayroll = summary.reduce((s, p) => s + (p.totals?.payroll || 0), 0);

  // Spend per project (bar).
  const projectData = summary.map((p) => ({ name: p.name, total: p.totals?.total || 0 }));

  // Spend by category (pie) — aggregate category_totals across scope.
  const categoryData = useMemo(() => {
    const agg = {};
    for (const p of scoped) {
      for (const [cat, amt] of Object.entries(p.category_totals || {})) {
        agg[cat] = (agg[cat] || 0) + amt;
      }
    }
    return Object.entries(agg).map(([name, value]) => ({ name, value })).filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [scoped]);

  // Weekly trend (line) — merge weeks across scope by week_ending.
  const trendData = useMemo(() => {
    const byWeek = {};
    for (const p of scoped) {
      for (const pt of p.trend || []) {
        byWeek[pt.week_ending] = (byWeek[pt.week_ending] || 0) + pt.total;
      }
    }
    return Object.entries(byWeek).sort(([a], [b]) => a.localeCompare(b))
      .map(([week, total]) => ({ week, total }));
  }, [scoped]);

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total spend" value={money(grandTotal)} />
        <StatCard label="Projects" value={summary.length} />
        <StatCard label="Total payroll" value={money(totalPayroll)} />
        <StatCard label="Total hours" value={totalHours.toLocaleString()} />
      </div>

      {/* Budget progress per project */}
      <div className="border border-border rounded-xl bg-card p-4">
        <h3 className="text-sm font-semibold text-muted-foreground mb-3">Budget status</h3>
        <div className="space-y-2.5">
          {summary.filter((p) => p.totals?.budget > 0).length === 0 ? (
            <div className="text-sm text-muted-foreground">No budgets set. Add a budget on a project to track it here.</div>
          ) : summary.filter((p) => p.totals?.budget > 0).map((p) => {
            const t = p.totals;
            return (
              <div key={p.id} className="flex items-center gap-3">
                <span className="w-40 truncate text-sm">{p.name}</span>
                <div className="flex-1 h-2.5 rounded-full bg-neutral-200 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, t.budget_pct)}%`, backgroundColor: budgetColor(t.budget_pct) }} />
                </div>
                <span className="text-xs tabular-nums w-44 text-right text-muted-foreground">
                  {money(t.total)} / {money(t.budget)} · <span style={{ color: budgetColor(t.budget_pct) }}>{t.budget_pct}%</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scope filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground">Focus:</span>
        <button onClick={() => setSelected('__all__')} className={`text-sm px-3 py-1 rounded-full border ${selected === '__all__' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-secondary'}`}>All projects</button>
        {summary.map((p) => (
          <button key={p.id} onClick={() => setSelected(p.id)} className={`text-sm px-3 py-1 rounded-full border ${selected === p.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-secondary'}`}>{p.name}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Spend by project">
          <ResponsiveContainer width="100%" height={Math.max(200, projectData.length * 44 + 40)}>
            <BarChart data={projectData} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={money} fontSize={11} />
              <YAxis type="category" dataKey="name" width={110} fontSize={12} />
              <Tooltip formatter={(v) => money(v)} />
              <Bar dataKey="total" radius={[0, 4, 4, 0]} fill="#2C6E9B" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={`Spend by category${selected !== '__all__' ? ' (selected)' : ''}`}>
          {categoryData.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={2}>
                  {categoryData.map((d, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => money(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title={`Weekly spend trend${selected !== '__all__' ? ' (selected)' : ''}`} full>
          {trendData.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendData} margin={{ left: 8, right: 24, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" fontSize={11} />
                <YAxis tickFormatter={money} fontSize={11} />
                <Tooltip formatter={(v) => money(v)} />
                <Line type="monotone" dataKey="total" stroke="#2C6E9B" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="border border-border rounded-xl bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold mt-0.5">{value}</div>
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
function Empty() { return <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No data</div>; }
