'use client';

import {useState} from 'react';

export interface CategoryRow {
  label: string;
  value: number;
  color: string;
  note?: string;
}

/** Horizontal bars with a per-mark hover tooltip and direct value labels. */
export function CategoryBars({rows, unit = ''}: {rows: CategoryRow[]; unit?: string}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => (
        <div
          key={row.label}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
          className="grid grid-cols-[minmax(84px,auto)_1fr_auto] items-center gap-3"
        >
          <span className="text-[12px] text-muted-2">{row.label}</span>
          <div className="h-[14px] w-full">
            <div
              className="h-full rounded-r-[4px] transition-opacity"
              style={{
                width: `${Math.max((row.value / max) * 100, 0.5)}%`,
                background: row.color,
                opacity: hovered === null || hovered === i ? 1 : 0.4,
              }}
            />
          </div>
          <span className="font-mono text-[12px] tabular-nums text-ink">
            {row.value.toLocaleString('en-US')}
            {unit}
          </span>
        </div>
      ))}
      {hovered !== null && rows[hovered].note && (
        <p className="mt-1 rounded-lg bg-[#f1f4f8] p-2 text-[12px] text-muted-2">
          {rows[hovered].note}
        </p>
      )}
    </div>
  );
}
