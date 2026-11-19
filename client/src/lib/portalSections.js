// Turn workbook sheets (from readXlsx) into Customer Portal tables, and format
// their values for display.
//
// For each sheet:
//   - the header row is the first row with at least 3 text cells;
//   - the sheet's own title is the first text above it (e.g. "Amazon HOU3 –
//     Brookshire, TX: Change Orders Pending IGS Approval");
//   - columns are the header cells, plus any unlabeled column that has data;
//   - every row below the header with a value becomes a table row, and a row
//     whose first two columns are empty (e.g. "Total pending" under the
//     Description column) is marked as a total;
//   - error cells such as #VALUE! are left blank.
// Column kinds: percent (header has % and values 0–1.5), date, currency
// (header has $, amount, value, balance or net30), number, or text.

const cellText = (c) => (c == null || c.t === 'e' ? null : c.t === 'b' ? (c.v ? 'Yes' : 'No') : c.v);

export function sheetsToSections(sheets) {
  const sections = [];
  for (const sh of sheets) {
    const rows = sh.rows;
    const hi = rows.findIndex((r) => (r || []).filter((c) => c && c.t === 's').length >= 3);
    if (hi < 0) continue;
    const header = rows[hi] || [];
    let subtitle = '';
    for (let i = 0; i < hi && !subtitle; i++) {
      const c = (rows[i] || []).find((x) => x && x.t === 's');
      if (c) subtitle = String(c.v).trim();
    }
    const body = rows.slice(hi + 1).filter((r) => (r || []).some((c) => cellText(c) != null));
    const width = Math.max(header.length, ...body.map((r) => (r || []).length));
    const cols = [];
    for (let ci = 0; ci < width; ci++) {
      const label = header[ci] && header[ci].t === 's' ? String(header[ci].v).trim() : '';
      const hasData = body.some((r) => cellText((r || [])[ci]) != null);
      if (label || hasData) cols.push({ ci, label });
    }
    if (!cols.length || !body.length) continue;
    const tableRows = body.map((r) => {
      const cells = cols.map(({ ci }) => cellText((r || [])[ci]));
      const total = (cells[0] == null || cells[0] === '') && (cells.length < 2 || cells[1] == null || cells[1] === '');
      return { cells, total, raw: cols.map(({ ci }) => (r || [])[ci] || null) };
    });
    const columns = cols.map(({ label }, k) => ({ label, kind: kindOf(label, tableRows.filter((r) => !r.total).map((r) => r.raw[k])) }));
    sections.push({
      title: sh.name,
      subtitle,
      columns,
      rows: tableRows.map(({ cells, total }) => ({ cells, total })),
    });
  }
  return sections;
}

function kindOf(label, cells) {
  const vals = cells.filter((c) => c && c.t !== 'e');
  if (!vals.length) return 'text';
  const nums = vals.filter((c) => c.t === 'n').map((c) => c.v);
  const dates = vals.filter((c) => c.t === 'd').length;
  if (dates / vals.length >= 0.6) return 'date';
  if (nums.length / vals.length < 0.6) return 'text';
  // Reference numbers (invoice #, PO line, row #) are shown exactly as typed.
  if (/invoice|^#$|^no\.?$|number|line/i.test(label) && nums.every((n) => Number.isInteger(n))) return 'text';
  if (/%/.test(label) && nums.every((n) => n >= -0.001 && n <= 1.5)) return 'percent';
  if (/\$|amount|value|balance|net\s*30/i.test(label)) return 'currency';
  return 'number';
}

// ---- display ----
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatCell(v, kind) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') {
    if (kind === 'currency') return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (kind === 'percent') return `${(v * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
    if (kind === 'number') return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return String(v); // numbers in text columns (invoice numbers etc.) stay as typed
  }
  if (kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return `${MONTHS[m - 1]} ${d}, ${y}`;
  }
  return String(v);
}
export const alignRight = (kind) => kind === 'currency' || kind === 'percent' || kind === 'number';
