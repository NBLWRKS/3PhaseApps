// Export expense data to a CSV that opens directly in Excel. Pure JS, no deps.
// One row per week per project, with payroll + a total, followed by that week's
// expense line items as their own rows (category/description/amount).

function csvField(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCsv(rows) { return rows.map((r) => r.map(csvField).join(',')).join('\r\n'); }

export function exportExpensesCsv(summary) {
  const rows = [[
    'Project', 'Budget', 'Week ending', 'Row type', 'Category', 'Description',
    'Elec payroll', 'Elec hours', 'Mech payroll', 'Mech hours', 'Amount', 'Week total',
  ]];

  for (const p of summary || []) {
    const budget = p.totals?.budget || 0;
    if (!p.weeks || p.weeks.length === 0) {
      rows.push([p.name, budget, '', 'project (no weeks)', '', '', '', '', '', '', '', p.totals?.total || 0]);
      continue;
    }
    for (const w of p.weeks) {
      const t = w.totals || {};
      // Week payroll summary row
      rows.push([
        p.name, budget, w.week_ending, 'week payroll', '', w.notes || '',
        w.elec_pay, w.elec_hours, w.mech_pay, w.mech_hours, t.payroll, t.total,
      ]);
      // Each expense line
      for (const it of w.items || []) {
        rows.push([
          p.name, budget, w.week_ending, 'expense', it.category, it.description || '',
          '', '', '', '', it.amount, '',
        ]);
      }
    }
    // Project total row
    rows.push([p.name, budget, '', 'PROJECT TOTAL', '', '', p.totals?.elec_pay || 0, p.totals?.elec_hours || 0, p.totals?.mech_pay || 0, p.totals?.mech_hours || 0, '', p.totals?.total || 0]);
  }

  const csv = '\uFEFF' + toCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `expense-tracking-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
