import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend, LineChart, Line, Area, AreaChart,
} from 'recharts';
import { DollarSign, TrendingUp, Clock, Wallet } from 'lucide-react';

const money = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const CAT_COLORS = ['hsl(208 75% 42%)', 'hsl(160 84% 34%)', 'hsl(38 92% 50%)', 'hsl(280 45% 55%)', 'hsl(0 72% 55%)', 'hsl(190 70% 42%)', 'hsl(30 50% 45%)', 'hsl(230 55% 55%)'];

function budgetColor(pct) {
  if (pct >= 100) return 'hsl(0 72% 45%)';
  if (pct >= 85) return 'hsl(38 92% 50%)';
  return 'hsl(160 84% 34%)';
}

export default function ExpenseDashboard({ summary }) {
  const [selected, setSelected] = useState('__all__');
  const scoped = selected === '__all__' ? summary : summary.filter((p) => p.id === selected);

  const grandTotal = summary.reduce((s, p) => s + (p.totals?.total || 0), 0);
  const grandBudget = summary.reduce((s, p) => s + (p.totals?.budget || 0), 0);
  const totalHours = summary.reduce((s, p) => s + (p.totals?.hours || 0), 0);
  const totalPayroll = summary.reduce((s, p) => s + (p.totals?.payroll || 0), 0);
  const overallPct = grandBudget > 0 ? Math.round(grandTotal / grandBudget * 100) : 0;

  const projectData = summary.map((p) => ({ name: p.name, total: p.totals?.total || 0, budget: p.totals?.budget || 0 }));

  const categoryData = useMemo(() => {
    const agg = {};
    for (const p of scoped) {
      for (const [cat, amt] of Object.entries(p.category_totals || {})) agg[cat] = (agg[cat] || 0) + amt;
    }
    return Object.entries(agg).map(([name, value]) => ({ name, value })).filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  }, [scoped]);

  const trendData = useMemo(() => {
    const byWeek = {};
    for (const p of scoped) for (const pt of p.trend || []) byWeek[pt.week_ending] = (byWeek[pt.week_ending] || 0) + pt.total;
    return Object.entries(byWeek).sort(([a], [b]) => a.localeCompare(b)).map(([week, total]) => ({ week, total }));
  }, [scoped]);

  // Per-category budget vs spend across scope.
  const catBudgets = useMemo(() => {
    const keys = ['elec', 'mech', 'staff_elec', 'staff_mech', 'materials_elec', 'materials_mech', 'rental'];
    const labels = { elec: 'Electrical Payroll', mech: 'Mechanical Payroll', staff_elec: 'Staffing – Electrical', staff_mech: 'Staffing – Mechanical', materials_elec: 'Materials – Electrical', materials_mech: 'Materials – Mechanical', rental: 'Equipment Rental' };
    return keys.map((k) => {
      let spend = 0, budget = 0;
      for (const p of scoped) { const b = p.budgets?.[k]; if (b) { spend += b.spend || 0; budget += b.budget || 0; } }
      return { key: k, label: labels[k], spend, budget, pct: budget > 0 ? Math.round(spend / budget * 100) : 0 };
    });
  }, [scoped]);

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={DollarSign} label="Total spend" value={money(grandTotal)} sub={grandBudget > 0 ? `${overallPct}% of ${money(grandBudget)}` : null} accent={grandBudget > 0 ? budgetColor(overallPct) : undefined} />
        <Kpi icon={Wallet} label="Total budget" value={money(grandBudget)} />
        <Kpi icon={TrendingUp} label="Total payroll" value={money(totalPayroll)} />
        <Kpi icon={Clock} label="Total hours" value={totalHours.toLocaleString()} />
      </div>

      {/* Scope filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground">Focus:</span>
        <FilterPill active={selected === '__all__'} onClick={() => setSelected('__all__')}>All projects</FilterPill>
        {summary.map((p) => <FilterPill key={p.id} active={selected === p.id} onClick={() => setSelected(p.id)}>{p.name}</FilterPill>)}
      </div>

      {/* Category budget bars */}
      <Card title="Budget vs. actual by category">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          {catBudgets.map((c) => (
            <div key={c.key}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium">{c.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {money(c.spend)}{c.budget > 0 && <> / {money(c.budget)} · <span style={{ color: budgetColor(c.pct) }} className="font-semibold">{c.pct}%</span></>}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${c.budget > 0 ? Math.min(100, c.pct) : 0}%`, backgroundColor: c.budget > 0 ? budgetColor(c.pct) : 'hsl(var(--muted-foreground))' }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Spend by project">
          <ResponsiveContainer width="100%" height={Math.max(200, projectData.length * 46 + 30)}>
            <BarChart data={projectData} layout="vertical" margin={{ left: 8, right: 20, top: 4, bottom: 4 }} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="2 4" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" tickFormatter={money} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis type="category" dataKey="name" width={110} fontSize={12} stroke="hsl(var(--muted-foreground))" />
              <Tooltip formatter={(v) => money(v)} contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted))' }} />
              <Bar dataKey="total" radius={[0, 6, 6, 0]} fill="hsl(208 75% 42%)" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title={`Spend by category${selected !== '__all__' ? ' · selected' : ''}`}>
          {categoryData.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={98} paddingAngle={2} stroke="hsl(var(--card))" strokeWidth={2}>
                  {categoryData.map((d, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => money(v)} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title={`Weekly spend trend${selected !== '__all__' ? ' · selected' : ''}`} full>
          {trendData.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={trendData} margin={{ left: 8, right: 20, top: 8, bottom: 4 }}>
                <defs>
                  <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(208 75% 42%)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(208 75% 42%)" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis tickFormatter={money} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <Tooltip formatter={(v) => money(v)} contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="total" stroke="hsl(208 75% 42%)" strokeWidth={2.5} fill="url(#spendFill)" dot={{ r: 3, fill: 'hsl(208 75% 42%)' }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  );
}

const tooltipStyle = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 10,
  fontSize: 12,
  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
  color: 'hsl(var(--foreground))',
};

function Kpi({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <Icon className="w-4 h-4 text-muted-foreground/60" />
      </div>
      <div className="text-2xl font-bold mt-1.5 tabular-nums" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function Card({ title, children, full }) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-5 shadow-sm ${full ? 'lg:col-span-2' : ''}`}>
      <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
      {children}
    </div>
  );
}

function FilterPill({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`text-sm px-3.5 py-1.5 rounded-full border font-medium transition ${active ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'border-border text-muted-foreground hover:bg-secondary'}`}>{children}</button>
  );
}

function Empty() { return <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No data yet</div>; }
