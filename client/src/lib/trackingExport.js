// Export the tracking data to a CSV file that opens directly in Excel.
// Pure JS, no dependency — flattens Project -> Area -> Task into rows.

const STATUS_LABELS = {
  not_started: 'Not started',
  in_progress: 'In progress',
  complete: 'Complete',
  blocked: 'Blocked',
};

// Quote a CSV field if it contains comma, quote, or newline.
function csvField(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows) {
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n');
}

export function exportTrackingXlsx(summary) {
  const rows = [[
    'Project', 'Project %', 'Area', 'Area %', 'Task',
    'Task %', 'Weight', 'Status', 'Blocked', 'Assignee', 'Target date', 'Notes',
  ]];

  for (const p of summary || []) {
    if (!p.areas || p.areas.length === 0) {
      rows.push([p.name, `${p.percent}%`, '', '', '', '', '', '', '', '', '', '']);
      continue;
    }
    for (const a of p.areas) {
      if (!a.tasks || a.tasks.length === 0) {
        rows.push([p.name, `${p.percent}%`, a.name, `${a.percent}%`, '', '', '', '', '', '', '', '']);
        continue;
      }
      for (const t of a.tasks) {
        rows.push([
          p.name, `${p.percent}%`,
          a.name, `${a.percent}%`,
          t.name, `${t.percent}%`, t.weight,
          STATUS_LABELS[t.status] || t.status,
          t.blocked ? 'Yes' : '',
          t.assignee || '', t.target_date || '', t.notes || '',
        ]);
      }
    }
  }

  const csv = '\uFEFF' + toCsv(rows); // BOM so Excel reads UTF-8 correctly
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `project-tracking-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
