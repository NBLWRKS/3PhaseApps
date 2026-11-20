// Turns a portal's workbook tables into dashboard data: change orders,
// scope-of-work lines, invoices and headline totals. Sections are found by
// their sheet name / title (e.g. "Pending COs", "Approved COs", "Base SOW
// Remaining", "Invoicing"), columns by their header text, so a newer copy of
// the same workbook keeps working even if columns move. Anything the
// dashboard doesn't recognise is still shown under "More tables".
import { formatCell } from '@/lib/portalSections';

const has = (s, re) => re.test(`${s.title || ''} ${s.subtitle || ''}`);
const col = (s, re) => s.columns.findIndex((c) => re.test(c.label || ''));
const val = (r, i) => (i >= 0 ? r.cells[i] : null);
const numOf = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function findSections(sections) {
  const pending = sections.find((s) => has(s, /pending/i) && has(s, /\bco|change/i));
  const approved = sections.find((s) => s !== pending && has(s, /approved/i) && has(s, /\bco|change/i));
  const sow = sections.find((s) => has(s, /\bsow\b|scope of work/i));
  const invoicing = sections.find((s) => has(s, /invoic/i) && s !== sow && s !== pending && s !== approved);
  const used = new Set([pending, approved, sow, invoicing].filter(Boolean));
  return { pending, approved, sow, invoicing, other: sections.filter((s) => !used.has(s)) };
}

// Every non-total row as label/value pairs, for the detail viewer.
const fieldsOf = (s, r) => s.columns
  .map((c, i) => ({ label: c.label || '—', value: formatCell(r.cells[i], c.kind), raw: r.cells[i], kind: c.kind }))
  .filter((f) => f.value !== '');

function changeOrdersFrom(s, status) {
  if (!s) return [];
  const iNo = col(s, /^(co\s*#|#)$/i);
  const iCo = col(s, /^co\s*#$/i);
  const iTitle = col(s, /^change order$/i);
  const iScope = col(s, /^scope$/i);
  const iDesc = col(s, /description/i);
  const iAmt = col(s, /amount/i);
  const iDate = col(s, /date|submitted to igs|first submitted/i);
  const iStatus = col(s, /status|invoice status/i);
  const iAging = col(s, /aging/i);
  return s.rows.filter((r) => !r.total).map((r, k) => {
    const scope = val(r, iScope) || '';
    const coNo = iCo >= 0 ? val(r, iCo) : null;
    const title = (iTitle >= 0 ? val(r, iTitle) : null) || coNo || `Change order ${val(r, iNo) ?? k + 1}`;
    const dateCol = iDate >= 0 ? s.columns[iDate] : null;
    return {
      key: `${status}-${k}`,
      status, // 'Pending' | 'Approved'
      scope: String(scope),
      ref: coNo ? `${scope ? `${scope} ` : ''}${coNo}` : (val(r, iNo) != null ? `#${val(r, iNo)}` : ''),
      title: String(title),
      description: iDesc >= 0 ? String(val(r, iDesc) ?? '') : '',
      amount: numOf(val(r, iAmt)),
      date: iDate >= 0 ? val(r, iDate) : null,
      dateLabel: dateCol ? dateCol.label : '',
      statusText: iStatus >= 0 && val(r, iStatus) != null ? String(val(r, iStatus)) : '',
      aging: numOf(val(r, iAging)),
      fields: fieldsOf(s, r),
    };
  });
}

function sowFrom(s) {
  if (!s) return [];
  const i = {
    scope: col(s, /^scope$/i), line: col(s, /po line/i), milestone: col(s, /milestone/i),
    value: col(s, /po value/i), invoiced: col(s, /invoiced to date/i), remaining: col(s, /remaining to invoice/i),
  };
  return s.rows.filter((r) => !r.total).map((r, k) => {
    const value = numOf(val(r, i.value)) ?? 0;
    const invoiced = numOf(val(r, i.invoiced)) ?? 0;
    const remaining = numOf(val(r, i.remaining)) ?? Math.max(0, value - invoiced);
    return {
      key: `sow-${k}`,
      scope: String(val(r, i.scope) ?? ''),
      line: String(val(r, i.line) ?? ''),
      milestone: String(val(r, i.milestone) ?? `Line ${k + 1}`),
      value, invoiced, remaining,
      pct: value > 0 ? invoiced / value : 0,
      fields: fieldsOf(s, r),
    };
  });
}

function invoicesFrom(s) {
  if (!s) return [];
  const iAmt = col(s, /amount|total/i);
  return s.rows.filter((r) => !r.total).map((r, k) => ({ key: `inv-${k}`, amount: numOf(val(r, iAmt)), fields: fieldsOf(s, r) }));
}

const sum = (list, f) => list.reduce((t, x) => t + (f(x) || 0), 0);

export function buildDashboard(sections) {
  const found = findSections(sections || []);
  const changeOrders = [...changeOrdersFrom(found.pending, 'Pending'), ...changeOrdersFrom(found.approved, 'Approved')];
  const sow = sowFrom(found.sow);
  const invoices = invoicesFrom(found.invoicing);
  const pending = changeOrders.filter((c) => c.status === 'Pending');
  const approved = changeOrders.filter((c) => c.status === 'Approved');
  const sowValue = sum(sow, (x) => x.value);
  const sowInvoiced = sum(sow, (x) => x.invoiced);
  return {
    sections: found,
    changeOrders, sow, invoices,
    kpis: {
      pendingCount: pending.length, pendingTotal: sum(pending, (c) => c.amount),
      approvedCount: approved.length, approvedTotal: sum(approved, (c) => c.amount),
      sowValue, sowInvoiced, sowRemaining: sum(sow, (x) => x.remaining), sowPct: sowValue > 0 ? sowInvoiced / sowValue : 0,
      invoicingCount: invoices.length, invoicingTotal: sum(invoices, (x) => x.amount),
    },
  };
}

export const money = (n, cents = false) => {
  const v = Number(n) || 0;
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
};
export const pct = (f) => `${Math.round((Number(f) || 0) * 1000) / 10}%`;

// Same rule the server applies for customers: drop the columns listed (by
// label, ignoring case) under each section's title. Used for editors'
// "customer view", so they see exactly what the customer gets.
const norm = (s) => String(s || '').trim().toLowerCase();
export function withoutHidden(sections, hidden) {
  if (!hidden) return sections;
  return sections.map((s) => {
    const h = new Set((hidden[s.title] || []).map(norm));
    if (!h.size) return s;
    const keep = s.columns.map((c, i) => (h.has(norm(c.label)) ? -1 : i)).filter((i) => i >= 0);
    return { ...s, columns: keep.map((i) => s.columns[i]), rows: s.rows.map((r) => ({ ...r, cells: keep.map((i) => r.cells[i] ?? null) })) };
  });
}
