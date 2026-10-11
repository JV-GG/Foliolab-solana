'use client';

import {useState} from 'react';

/**
 * Status colours are reserved and never reused as series colours, and always
 * ship with an icon plus a label so meaning never rests on hue alone.
 */
const STATUS = {
  TRADING: {color: '#0ca30c', icon: '●', label: 'Tradable now'},
  ASSET_PAUSED: {color: '#fab219', icon: '▲', label: 'Paused by issuer'},
  UNSUPPORTED: {color: '#d03b3b', icon: '■', label: 'Not supported'},
} as const;

export type StatusCode = keyof typeof STATUS;

export function StatusBreakdown({
  counts,
}: {
  counts: {code: string; count: number}[];
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const total = counts.reduce((sum, c) => sum + c.count, 0);

  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded">
        {counts.map((entry) => {
          const meta = STATUS[entry.code as StatusCode];
          return (
            <div
              key={entry.code}
              onMouseEnter={() => setHovered(entry.code)}
              onMouseLeave={() => setHovered(null)}
              style={{
                width: `${(entry.count / total) * 100}%`,
                background: meta?.color ?? '#898781',
                opacity: hovered === null || hovered === entry.code ? 1 : 0.4,
              }}
            />
          );
        })}
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {counts.map((entry) => {
          const meta = STATUS[entry.code as StatusCode];
          const pct = ((entry.count / total) * 100).toFixed(1);
          return (
            <li key={entry.code} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="flex items-center gap-2">
                <span aria-hidden style={{color: meta?.color ?? '#898781'}}>
                  {meta?.icon ?? '○'}
                </span>
                <span className="text-ink">{meta?.label ?? entry.code}</span>
                <code className="font-mono text-[11px] text-ink-muted">{entry.code}</code>
              </span>
              <span className="font-mono tabular-nums text-muted-2">
                {entry.count.toLocaleString('en-US')} · {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
