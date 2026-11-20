import React, { useLayoutEffect, useRef, useState } from 'react';
import { formatCell, alignRight } from '@/lib/portalSections';

// One table from the workbook, always shown in full with no sideways scrolling.
// It's drawn as a table when every column fits the space available (wide
// tables use a more compact size); if it doesn't fit, e.g. on a phone or a
// 16-column sheet on a laptop, each row becomes a card of label/value pairs.
// The table stays laid out (hidden) so the check re-runs as the window resizes.
export default function DataTable({ section }) {
  const { columns, rows } = section;
  const wrapRef = useRef(null);
  const tableRef = useRef(null);
  const [fits, setFits] = useState(true);
  useLayoutEffect(() => {
    const check = () => {
      const w = wrapRef.current, t = tableRef.current;
      if (w && t) setFits(t.offsetWidth <= w.clientWidth + 1);
    };
    check();
    const ro = new ResizeObserver(check);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [section]);
  const compact = columns.length >= 12;
  const longest = columns.map((_, ci) => Math.max(0, ...rows.map((r) => String(r.cells[ci] ?? '').length)));
  const filled = (r) => columns.map((c, ci) => ({ c, v: formatCell(r.cells[ci], c.kind) })).filter((x) => x.v !== '');
  const pad = compact ? 'px-1.5' : 'px-2.5';
  return (
    <div ref={wrapRef} className="relative">
      <div className={fits ? 'rounded-xl border border-border bg-card' : 'absolute inset-x-0 top-0 h-0 overflow-hidden invisible'} aria-hidden={!fits}>
        <table ref={tableRef} className={`w-full tabular-nums border-collapse ${compact ? 'text-[11px] xl:text-xs' : 'text-xs xl:text-sm'}`}>
          <thead>
            <tr className="text-muted-foreground">
              {columns.map((c, i) => (
                <th key={i} scope="col" className={`${pad} py-2 font-semibold border-b border-border align-bottom leading-tight ${alignRight(c.kind) ? 'text-right' : 'text-left'}`}
                  style={c.kind === 'text' && longest[i] > 40 ? { minWidth: compact ? '8rem' : '11rem' } : undefined}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className={r.total ? 'font-semibold bg-secondary' : 'even:bg-secondary/40'}>
                {columns.map((c, ci) => (
                  <td key={ci} className={`${pad} py-1.5 border-b border-border/70 align-top break-words ${alignRight(c.kind) ? 'text-right whitespace-nowrap' : 'text-left whitespace-pre-line'}`}>
                    {formatCell(r.cells[ci], c.kind)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!fits && (
        <ul className="grid gap-2.5 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((r, ri) => {
            const items = filled(r);
            if (!items.length) return null;
            return (
              <li key={ri} className={`rounded-xl border p-3 ${r.total ? 'border-primary/40 bg-secondary font-semibold' : 'border-border bg-card'}`}>
                <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-1 text-sm">
                  {items.map(({ c, v }, k) => (
                    <React.Fragment key={k}>
                      <dt className="text-muted-foreground text-xs pt-0.5">{c.label || '—'}</dt>
                      <dd className={`min-w-0 break-words whitespace-pre-line ${alignRight(c.kind) ? 'tabular-nums' : ''}`}>{v}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
