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
    'Project', 'Elec budget', 'Mech budget', 'Week ending', 'Row type', 'Category', 'Trade', 'Description',
    'Elec payroll', 'Elec hours', 'Staff elec payroll', 'Staff elec hours',
    'Mech payroll', 'Mech hours', 'Staff mech payroll', 'Staff mech hours', 'Amount', 'Week total',
  ]];

  for (const p of summary || []) {
    const eb = p.trades?.elec?.budget || 0, mb = p.trades?.mech?.budget || 0;
    const itemTrade = (it) => (it.category === 'Materials – Electrical' ? 'Electrical' : it.category === 'Materials – Mechanical' ? 'Mechanical' : it.trade || '');
    if (!p.weeks || p.weeks.length === 0) {
      rows.push([p.name, eb, mb, '', 'project (no weeks)', '', '', '', '', '', '', '', '', '', '', '', '', p.totals?.total || 0]);
      continue;
    }
    for (const w of p.weeks) {
      const t = w.totals || {};
      // Week payroll summary row
      rows.push([
        p.name, eb, mb, w.week_ending, 'week payroll', '', '', w.notes || '',
        w.elec_pay, w.elec_hours, w.staff_elec_pay, w.staff_elec_hours,
        w.mech_pay, w.mech_hours, w.staff_mech_pay, w.staff_mech_hours, t.payroll, t.total,
      ]);
      // Each expense line
      for (const it of w.items || []) {
        rows.push([
          p.name, eb, mb, w.week_ending, 'expense', it.category, itemTrade(it), it.description || '',
          '', '', '', '', '', '', '', '', it.amount, '',
        ]);
      }
    }
    // Project total row
    const te = p.trades?.elec || {}, tm = p.trades?.mech || {};
    rows.push([p.name, eb, mb, '', 'PROJECT TOTAL', '', '', '',
      p.totals?.elec_pay || 0, te.own_hours || 0, p.totals?.staff_elec_pay || 0, te.staff_hours || 0,
      p.totals?.mech_pay || 0, tm.own_hours || 0, p.totals?.staff_mech_pay || 0, tm.staff_hours || 0, '', p.totals?.total || 0]);
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
