// Read an .xlsx workbook in the browser, with no library: an .xlsx file is a
// zip of XML files. Entries are inflated with the browser's built-in
// DecompressionStream ('deflate-raw'), and the XML is read with DOMParser.
// Formula cells use their last calculated value, as Excel shows it.
//
// readXlsx(arrayBuffer) -> [{ name, rows: [[cell | null, ...], ...] }]
//   cell = { t: 'n' | 's' | 'd' | 'b' | 'e', v }   (d = ISO date 'YYYY-MM-DD')

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser can\'t open .xlsx files. Use a current Chrome, Edge, Safari or Firefox.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This file isn\'t an .xlsx workbook.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('This .xlsx file looks damaged.');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    const lNameLen = dv.getUint16(local + 26, true), lExtraLen = dv.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    const data = u8.subarray(start, start + csize);
    files[name] = { method, data };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return {
    async text(name) {
      const f = files[name];
      if (!f) return null;
      const raw = f.method === 0 ? f.data : f.method === 8 ? await inflateRaw(f.data) : null;
      if (!raw) throw new Error('This .xlsx file uses an unsupported compression.');
      return dec.decode(raw);
    },
  };
}

const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
const kids = (el, tag) => (el ? Array.from(el.getElementsByTagNameNS('*', tag)) : []);
const textOf = (el) => kids(el, 't').map((t) => t.textContent).join('');

// Built-in Excel number formats that are dates.
const DATE_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
function isDateFormat(code) {
  const c = String(code || '').replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  return /[dy]/i.test(c) || /m{3,}/i.test(c);
}
function serialToIso(n) {
  const ms = Math.round((n - 25569) * 86400000); // Excel serial (1900 system) -> Unix ms
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}
const colIndex = (ref) => {
  const m = /^([A-Z]+)/.exec(ref || ''); if (!m) return -1;
  let n = 0; for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export async function readXlsx(buf) {
  const zip = await unzip(buf);
  const wbXml = await zip.text('xl/workbook.xml');
  if (!wbXml) throw new Error('This file isn\'t an .xlsx workbook.');
  const wb = xml(wbXml);
  const rels = xml((await zip.text('xl/_rels/workbook.xml.rels')) || '<Relationships/>');
  const target = {};
  for (const r of kids(rels.documentElement, 'Relationship')) target[r.getAttribute('Id')] = r.getAttribute('Target');

  const shared = [];
  const ss = await zip.text('xl/sharedStrings.xml');
  if (ss) for (const si of kids(xml(ss).documentElement, 'si')) shared.push(textOf(si));

  const dateStyle = [];
  const st = await zip.text('xl/styles.xml');
  if (st) {
    const sd = xml(st);
    const custom = {};
    for (const f of kids(sd.documentElement, 'numFmt')) custom[+f.getAttribute('numFmtId')] = f.getAttribute('formatCode');
    const xfs = kids(sd.documentElement, 'cellXfs')[0];
    for (const xf of kids(xfs, 'xf')) {
      const idn = +xf.getAttribute('numFmtId');
      dateStyle.push(DATE_IDS.has(idn) || (custom[idn] != null && isDateFormat(custom[idn])));
    }
  }

  const sheets = [];
  for (const s of kids(wb.documentElement, 'sheet')) {
    const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let path = target[rid] || '';
    path = path.startsWith('/') ? path.slice(1) : `xl/${path.replace(/^\.\//, '')}`;
    const text = await zip.text(path);
    if (!text) continue;
    const rows = [];
    for (const row of kids(xml(text).documentElement, 'row')) {
      const ri = (+row.getAttribute('r') || rows.length + 1) - 1;
      const cells = [];
      for (const c of kids(row, 'c')) {
        const ci = colIndex(c.getAttribute('r'));
        if (ci < 0) continue;
        const t = c.getAttribute('t') || 'n';
        const vEl = kids(c, 'v')[0];
        const v = vEl ? vEl.textContent : null;
        let cell = null;
        if (t === 's') cell = v != null ? { t: 's', v: shared[+v] ?? '' } : null;
        else if (t === 'inlineStr') cell = { t: 's', v: textOf(kids(c, 'is')[0]) };
        else if (t === 'str') cell = v != null ? { t: 's', v } : null;
        else if (t === 'b') cell = v != null ? { t: 'b', v: v === '1' } : null;
        else if (t === 'e') cell = { t: 'e', v };
        else if (v != null && v !== '') {
          const n = Number(v);
          const si = +c.getAttribute('s') || 0;
          cell = dateStyle[si] ? { t: 'd', v: serialToIso(n) } : { t: 'n', v: n };
        }
        if (cell && cell.t === 's' && !String(cell.v).trim()) cell = null;
        cells[ci] = cell;
      }
      rows[ri] = cells;
    }
    sheets.push({ name: s.getAttribute('name') || `Sheet${sheets.length + 1}`, rows: Array.from(rows, (r) => r || []) });
  }
  return sheets;
}
