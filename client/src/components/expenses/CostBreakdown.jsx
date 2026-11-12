import React, { useMemo, useState } from 'react';
import { CalendarRange, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { buildCostBreakdown, exportCostBreakdownXlsx } from '@/lib/costBreakdown';

// Whole dollars, US format (same as the rest of the Expenses page).
const money = (n) => {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US');
};

const PERIOD_KEY = 'expenses.breakdownPeriod';
function initialPeriod() {
  try { return localStorage.getItem(PERIOD_KEY) === 'month' ? 'month' : 'week'; } catch { return 'week'; }
}

// Electrical / Mechanical cost breakdown for one project, by week or month,
// with an .xlsx export of exactly what's shown.
export default function CostBreakdown({ project }) {
  const [period, setPeriodState] = useState(initialPeriod);
  const setPeriod = (p) => {
    setPeriodState(p);
    try { localStorage.setItem(PERIOD_KEY, p); } catch { /* ignore */ }
  };
  const b = useMemo(() => buildCostBreakdown(project, period), [project, period]);

  const exportXlsx = () => {
    try { exportCostBreakdownXlsx(project, period); }
    catch { toast.error('Export failed'); }
  };

  const btn = (value, label) => (
    <button type="button" onClick={() => setPeriod(value)} aria-pressed={period === value}
      className={`px-3 py-1.5 text-sm font-medium transition ${value === 'month' ? 'border-l border-border' : ''} ${period === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}>
      {label}
    </button>
  );

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm" aria-labelledby="cost-breakdown-title">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h3 id="cost-breakdown-title" className="text-sm font-semibold flex items-center gap-1.5">
          <CalendarRange className="w-4 h-4 text-muted-foreground" aria-hidden="true" /> Cost Breakdown
        </h3>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border overflow-hidden bg-card" role="group" aria-label="Group costs by">
            {btn('week', 'Weekly')}
            {btn('month', 'Monthly')}
          </div>
          <button type="button" onClick={exportXlsx} disabled={!b.rows.length}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition disabled:opacity-50">
            <FileSpreadsheet className="w-4 h-4" aria-hidden="true" /> Export .xlsx
          </button>
        </div>
      </div>

      {b.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No costs entered yet. Weeks and rentals you add appear here.</p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm tabular-nums border-collapse min-w-[760px]">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th scope="col" className="text-left font-medium px-2 py-2 border-b border-border">{period === 'month' ? 'Month' : 'Week ending'}</th>
                {b.columns.map((c) => (
                  <th key={c.key} scope="col" className="text-right font-medium px-2 py-2 border-b border-border">{c.label}</th>
                ))}
                <th scope="col" className="text-right font-semibold px-2 py-2 border-b border-border text-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r) => (
                <tr key={r.key} className="hover:bg-secondary/40">
                  <th scope="row" className="text-left font-medium px-2 py-1.5 border-b border-border/60 whitespace-nowrap">
                    {period === 'month' ? r.label : r.label.replace(/^Week ending /, '')}
                  </th>
                  {b.columns.map((c) => (
                    <td key={c.key} className={`text-right px-2 py-1.5 border-b border-border/60 ${r.values[c.key] ? '' : 'text-muted-foreground/60'}`}>
                      {r.values[c.key] ? money(r.values[c.key]) : '–'}
                    </td>
                  ))}
                  <td className="text-right font-semibold px-2 py-1.5 border-b border-border/60">{money(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <th scope="row" className="text-left px-2 py-2">Total</th>
                {b.columns.map((c) => <td key={c.key} className="text-right px-2 py-2">{money(b.totals[c.key])}</td>)}
                <td className="text-right px-2 py-2 text-primary">{money(b.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-2">
        Payroll includes staffing. Equipment Rentals includes the Rentals log, counted on the delivery date.
        {period === 'month' ? ' Each week counts in the month of its week-ending date.' : ''}
      </p>
    </section>
  );
}
