import React, { useMemo, useState } from 'react';
import { ListPlus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

// Import individual charges (e.g. a QuickBooks "Expenses" export) as expense
// lines, one combined line per week. The person copies the rows from Excel,
// including the header row, and pastes them here; we find the Date, Total/Amount
// and Payee columns by their headers, group the charges into this project's
// weeks and show a preview before anything is saved.

const TRADES = ['', 'Electrical', 'Mechanical', 'Safety', 'Dumpsters'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const money = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// "11/18/2026", "11/18/26" or "2026-11-18" -> UTC Date, else null.
function parseDate(s) {
  const t = String(s || '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t);
  if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return new Date(Date.UTC(y, +m[1] - 1, +m[2])); }
  return null;
}
// "$1,759.95", "1759.95", "(125.00)" -> number, else null.
function parseAmount(s) {
  let t = String(s || '').trim().replace(/[$,\s]/g, '');
  const neg = /^\(.*\)$/.test(t);
  t = t.replace(/[()]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return neg ? -Number(t) : Number(t);
}
const iso = (d) => d.toISOString().slice(0, 10);
const mmdd = (d) => `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;

// The weekday this project's weeks end on (most common among its weeks); Friday if none.
function weekEndDay(project) {
  const counts = new Array(7).fill(0);
  for (const w of project?.weeks || []) { const d = parseDate(w.week_ending); if (d) counts[d.getUTCDay()]++; }
  const best = counts.indexOf(Math.max(...counts));
  return counts[best] > 0 ? best : 5;
}

export function parseCharges(text, endDay) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { error: null, charges: [], skipped: [] };
  const split = (l) => (l.includes('\t') ? l.split('\t') : l.split(',')).map((c) => c.trim().replace(/^"|"$/g, ''));
  const head = split(lines[0]).map((h) => h.toLowerCase());
  const col = (re) => head.findIndex((h) => re.test(h));
  const iDate = col(/^(date|txn date|transaction date)$/);
  const iAmt = col(/^(total|amount)$/);
  const iPayee = col(/^(payee|vendor|name|vendor display name)$/);
  const iNo = col(/^(no\.?|num|number|ref)$/);
  if (iDate < 0 || iAmt < 0) {
    return { error: 'Couldn\'t find the "Date" and "Total" (or "Amount") columns. Copy the rows including the header row.', charges: [], skipped: [] };
  }
  const charges = [], skipped = [];
  lines.slice(1).forEach((l, i) => {
    const c = split(l);
    const d = parseDate(c[iDate]);
    const a = parseAmount(c[iAmt]);
    if (!d || a == null) { if (c.some(Boolean)) skipped.push({ row: i + 2, text: l.slice(0, 80) }); return; }
    const end = new Date(d); end.setUTCDate(d.getUTCDate() + ((endDay - d.getUTCDay() + 7) % 7));
    charges.push({ date: d, week_ending: iso(end), amount: a, payee: iPayee >= 0 ? c[iPayee] : '', ref: iNo >= 0 ? c[iNo] : '' });
  });
  return { error: null, charges, skipped };
}

// One line per week: total, number of charges, and a description listing dates.
export function groupByWeek(charges) {
  const by = new Map();
  for (const ch of charges) {
    if (!by.has(ch.week_ending)) by.set(ch.week_ending, []);
    by.get(ch.week_ending).push(ch);
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week_ending, list]) => {
    const payees = [...new Set(list.map((c) => c.payee).filter(Boolean))];
    const dates = list.map((c) => c.date).sort((a, b) => a - b).map(mmdd);
    const amount = Math.round(list.reduce((s, c) => s + c.amount, 0) * 100) / 100;
    const who = payees.length === 1 ? payees[0] : payees.length ? `${payees[0]} +${payees.length - 1}` : 'Imported';
    return { week_ending, amount, count: list.length,
      description: `${who} — ${list.length} charge${list.length === 1 ? '' : 's'} (${dates.join(', ')})` };
  });
}

export default function ImportLinesModal({ project, categories, onClose, onDone }) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState(categories.includes('Other') ? 'Other' : categories[0] || 'Other');
  const [trade, setTrade] = useState('');
  const [saving, setSaving] = useState(false);
  const endDay = useMemo(() => weekEndDay(project), [project]);
  const parsed = useMemo(() => parseCharges(text, endDay), [text, endDay]);
  const weeks = useMemo(() => groupByWeek(parsed.charges), [parsed]);
  const total = Math.round(weeks.reduce((s, w) => s + w.amount, 0) * 100) / 100;
  const known = useMemo(() => new Set((project?.weeks || []).map((w) => w.week_ending)), [project]);

  const doImport = async () => {
    if (!weeks.length) return;
    setSaving(true);
    try {
      const r = await base44.expenses.importLines(project.id, {
        category, trade: trade || null,
        lines: weeks.map((w) => ({ week_ending: w.week_ending, amount: w.amount, description: w.description })),
      });
      const parts = [`Added ${r.lines_added} weekly line${r.lines_added === 1 ? '' : 's'} (${money(r.amount_added)})`];
      if (r.weeks_created) parts.push(`created ${r.weeks_created} new week${r.weeks_created === 1 ? '' : 's'}`);
      if (r.lines_skipped) parts.push(`skipped ${r.lines_skipped} already imported`);
      toast.success(parts.join(', '));
      onDone();
    } catch (e) {
      toast.error(e?.message || 'Import failed');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="import-lines-title"
        className="w-full max-w-2xl rounded-2xl bg-card border border-border shadow-xl p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 id="import-lines-title" className="text-lg font-bold flex items-center gap-2"><ListPlus className="w-5 h-5" aria-hidden="true" /> Import expense lines — {project.name}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Open the export (for example from QuickBooks) in Excel, select the rows including the header row, copy, and paste below.
          The Date and Total (or Amount) columns are required; Payee and No. are used in the description. Charges are added up
          into one line per week, ending on {DAYS[endDay]} like this project's other weeks.
        </p>

        <label htmlFor="import-lines-text" className="text-xs font-medium">Pasted rows</label>
        <textarea id="import-lines-text" value={text} onChange={(e) => setText(e.target.value)} rows={6} spellCheck={false}
          placeholder={'Date\tType\tNo.\tPayee\t…\tTotal\n11/18/2026\tExpense\t…\tR&L Dumpsters\t…\t1732.11'}
          className="w-full mt-1 mb-3 px-3 py-2 rounded-lg border border-border bg-background font-mono text-xs outline-none focus:border-primary" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label htmlFor="import-lines-category" className="text-xs font-medium">Category</label>
            <select id="import-lines-category" value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-sm outline-none focus:border-primary">
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="import-lines-trade" className="text-xs font-medium">Trade</label>
            <select id="import-lines-trade" value={trade} onChange={(e) => setTrade(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-sm outline-none focus:border-primary">
              {TRADES.map((t) => <option key={t} value={t}>{t || 'No trade'}</option>)}
            </select>
          </div>
        </div>

        {parsed.error && <p role="alert" className="text-sm text-destructive mb-3">{parsed.error}</p>}
        {weeks.length > 0 && (
          <div className="mb-3">
            <p className="text-xs text-muted-foreground mb-1.5">
              {parsed.charges.length} charge{parsed.charges.length === 1 ? '' : 's'} → {weeks.length} weekly line{weeks.length === 1 ? '' : 's'}, total {money(total)}
            </p>
            <div className="overflow-x-auto border border-border rounded-lg max-h-64">
              <table className="w-full text-xs tabular-nums">
                <thead className="sticky top-0 bg-card"><tr className="text-muted-foreground">
                  <th scope="col" className="text-left font-medium px-2 py-1.5">Week ending</th>
                  <th scope="col" className="text-right font-medium px-2 py-1.5">Charges</th>
                  <th scope="col" className="text-right font-medium px-2 py-1.5">Amount</th>
                  <th scope="col" className="text-left font-medium px-2 py-1.5">Description</th>
                </tr></thead>
                <tbody>
                  {weeks.map((w) => (
                    <tr key={w.week_ending} className="border-t border-border">
                      <td className="px-2 py-1 whitespace-nowrap">{w.week_ending}{!known.has(w.week_ending) && <span className="ml-1 text-amber-400" title="Goes into a week within 3 days if there is one, otherwise a new week is added">· new</span>}</td>
                      <td className="px-2 py-1 text-right">{w.count}</td>
                      <td className="px-2 py-1 text-right">{money(w.amount)}</td>
                      <td className="px-2 py-1 text-muted-foreground whitespace-nowrap">{w.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {parsed.skipped.length > 0 && (
          <p className="text-xs text-amber-400 mb-3">
            Skipped {parsed.skipped.length} row{parsed.skipped.length === 1 ? '' : 's'} without a date or amount (row {parsed.skipped.map((s) => s.row).join(', ')}).
          </p>
        )}
        <p className="text-xs text-muted-foreground mb-4">
          Lines already in a week with the same category, trade, amount and description are skipped, so importing the same rows twice doesn't double-count.
          If these charges were entered earlier as one combined line, delete that line first.
        </p>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-secondary">Cancel</button>
          <button type="button" onClick={doImport} disabled={!weeks.length || saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            Import {weeks.length ? `${weeks.length} line${weeks.length === 1 ? '' : 's'} · ${money(total)}` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
