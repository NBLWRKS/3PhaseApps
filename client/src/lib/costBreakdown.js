// Cost breakdown for one Expense Tracking project, by week or by month.
// Used by the breakdown table on the Expenses page and its .xlsx export, so
// both always show the same numbers.
//
// Columns are the entered totals:
//   Electrical Payroll  = own electrical payroll + electrical staffing
//   Electrical Materials, Mechanical Payroll (own + staffing), Mechanical Materials
//   Equipment Rentals   = "Equipment Rental" expense lines + the Rentals log
//   Other, then one column per custom expense category that has entries.
// The grand total equals the project's Total spend.
import { buildXlsx, downloadBlob, excelDate, XS } from '@/lib/xlsx';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round2 = (n) => Math.round(n * 100) / 100;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const FIXED = [
  { key: 'elec_payroll', label: 'Electrical Payroll (incl. Staffing)' },
  { key: 'elec_materials', label: 'Electrical Materials' },
  { key: 'mech_payroll', label: 'Mechanical Payroll (incl. Staffing)' },
  { key: 'mech_materials', label: 'Mechanical Materials' },
  { key: 'rentals', label: 'Equipment Rentals' },
  { key: 'other', label: 'Other' },
];
const CATEGORY_KEY = {
  'Materials – Electrical': 'elec_materials',
  'Materials – Mechanical': 'mech_materials',
  'Equipment Rental': 'rentals',
  Other: 'other',
};

export function weekLabel(iso) {
  if (!ISO.test(iso || '')) return iso || 'No date';
  const [y, m, d] = iso.split('-').map(Number);
  return `Week ending ${MONTHS[m - 1]} ${d}, ${y}`;
}
export function monthLabel(key) {
  if (!/^\d{4}-\d{2}$/.test(key || '')) return key || 'No date';
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/**
 * @param {object} p  one project from GET /api/expenses/summary
 * @param {'week'|'month'} period
 * @returns {{ columns: {key,label}[], rows: {key,label,date,values,total}[], totals: object, total: number, period: string }}
 */
export function buildCostBreakdown(p, period = 'week') {
  const weeks = [...(p?.weeks || [])].sort((a, b) => String(a.week_ending).localeCompare(String(b.week_ending)));
  const custom = new Set();
  for (const w of weeks) for (const it of w.items || []) if (!(it.category in CATEGORY_KEY)) custom.add(it.category || 'Uncategorized');
  const customCols = [...custom].sort().map((c) => ({ key: `cat:${c}`, label: c }));
  const columns = [...FIXED, ...customCols];

  const rows = new Map(); // key -> row, in insertion order
  const rowFor = (key, label, date, sort) => {
    if (!rows.has(key)) rows.set(key, { key, label, date, sort, values: Object.fromEntries(columns.map((c) => [c.key, 0])) });
    return rows.get(key);
  };
  const periodOf = (iso) => {
    if (period === 'month') {
      if (!ISO.test(iso || '')) return { key: `raw:${iso || ''}`, label: iso ? `Unrecognized date: ${iso}` : 'No date', date: null, sort: `9${iso}` };
      const k = iso.slice(0, 7);
      return { key: k, label: monthLabel(k), date: `${k}-01`, sort: k };
    }
    return { key: `w:${iso}`, label: weekLabel(iso), date: ISO.test(iso || '') ? iso : null, sort: ISO.test(iso || '') ? iso : `9${iso}` };
  };

  for (const w of weeks) {
    const pr = periodOf(w.week_ending);
    const r = rowFor(pr.key, pr.label, pr.date, pr.sort);
    r.values.elec_payroll += num(w.elec_pay) + num(w.staff_elec_pay);
    r.values.mech_payroll += num(w.mech_pay) + num(w.staff_mech_pay);
    for (const it of w.items || []) {
      const k = CATEGORY_KEY[it.category] || `cat:${it.category || 'Uncategorized'}`;
      r.values[k] += num(it.amount);
    }
  }

  // Rentals log: costed by delivery date. By month, the delivery month. By week,
  // the logged week whose 7 days (week ending and the 6 days before) include
  // the delivery date; anything else gets its own row so the total still adds up.
  for (const rent of p?.rentals?.list || []) {
    const cost = num(rent.cost);
    if (!cost) continue;
    const d = rent.date_delivered;
    let r;
    if (!ISO.test(d || '')) {
      r = rowFor('rent:nodate', 'Rentals log, no delivery date', null, '99');
    } else if (period === 'month') {
      const pr = periodOf(d); r = rowFor(pr.key, pr.label, pr.date, pr.sort);
    } else {
      const w = weeks.find((x) => ISO.test(x.week_ending || '') && d <= x.week_ending && d >= addDays(x.week_ending, -6));
      if (w) { const pr = periodOf(w.week_ending); r = rowFor(pr.key, pr.label, pr.date, pr.sort); }
      else r = rowFor(`rent:${d}`, `Rental delivered ${MONTHS[+d.slice(5, 7) - 1]} ${+d.slice(8)}, ${d.slice(0, 4)} (no week logged)`, null, `${d}~`);
    }
    r.values.rentals += cost;
  }

  const list = [...rows.values()].sort((a, b) => a.sort.localeCompare(b.sort));
  const totals = Object.fromEntries(columns.map((c) => [c.key, 0]));
  for (const r of list) {
    for (const c of columns) { r.values[c.key] = round2(r.values[c.key]); totals[c.key] += r.values[c.key]; }
    r.total = round2(columns.reduce((s, c) => s + r.values[c.key], 0));
  }
  for (const c of columns) totals[c.key] = round2(totals[c.key]);
  const total = round2(list.reduce((s, r) => s + r.total, 0));
  return { columns, rows: list, totals, total, period };
}

// Download the breakdown as an .xlsx file.
export function exportCostBreakdownXlsx(p, period = 'week') {
  const b = buildCostBreakdown(p, period);
  const periodName = period === 'month' ? 'Monthly' : 'Weekly';
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const header = [period === 'month' ? 'Month' : 'Week ending', ...b.columns.map((c) => c.label), 'Total'];
  const rows = [
    [{ v: `${p.name} — ${periodName} cost breakdown`, s: XS.title }],
    [`Exported ${todayIso} from 3PhaseApps Expense Tracking. Payroll columns include staffing; Equipment Rentals includes the Rentals log.`],
    [],
    header.map((h) => ({ v: h, s: XS.bold })),
    ...b.rows.map((r) => {
      const serial = r.date ? excelDate(r.date) : null;
      return [
        serial != null ? { v: serial, s: period === 'month' ? XS.month : XS.day } : r.label,
        ...b.columns.map((c) => ({ v: r.values[c.key], s: XS.money })),
        { v: r.total, s: XS.boldMoney },
      ];
    }),
    [{ v: 'Total', s: XS.bold }, ...b.columns.map((c) => ({ v: b.totals[c.key], s: XS.boldMoney })), { v: b.total, s: XS.boldMoney }],
  ];
  const blob = buildXlsx({
    sheetName: `${periodName} costs`,
    rows,
    widths: [period === 'month' ? 14 : 40, ...b.columns.map((c) => Math.max(14, Math.min(34, c.label.length + 2))), 16],
    freezeRows: 4,
  });
  const safe = String(p.name || 'project').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'project';
  downloadBlob(blob, `${safe}-${period === 'month' ? 'monthly' : 'weekly'}-costs-${todayIso}.xlsx`);
}
