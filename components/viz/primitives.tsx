import type {ReactNode} from 'react';

export function Panel({
  title,
  subtitle,
  children,
  source,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  source?: string;
}) {
  return (
    <section className="rounded-xl border border-line bg-white p-5 sm:p-6">
      <h2 className="text-[17px] tracking-[-0.3px]">{title}</h2>
      {subtitle && <p className="mt-1 text-[13px] leading-[1.6] text-muted-2">{subtitle}</p>}
      <div className="mt-4">{children}</div>
      {source && (
        <p className="mt-4 border-t border-line pt-3 font-mono text-[11px] text-ink-muted">
          {source}
        </p>
      )}
    </section>
  );
}

/** Explicit failure state. Never render fabricated numbers in place of data. */
export function Unavailable({error, endpoint}: {error: string; endpoint: string}) {
  return (
    <div className="rounded-lg border border-dashed border-[#e0b4b4] bg-[#fdf6f6] p-4">
      <p className="text-[13px] font-semibold text-[#ad354b]">Data unavailable</p>
      <p className="mt-1 text-[13px] leading-[1.6] text-muted-2">{error}</p>
      <p className="mt-2 font-mono text-[11px] text-ink-muted">{endpoint}</p>
      <p className="mt-2 text-[12px] leading-[1.6] text-muted-2">
        Nothing is substituted here — this panel stays empty rather than showing placeholder
        values.
      </p>
    </div>
  );
}

export function Legend({items}: {items: {label: string; color: string}[]}) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-[12px] text-muted-2">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-[2px]"
            style={{background: item.color}}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function StatTile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-white p-5">
      <p className="text-[12px] font-[750] tracking-[1.5px] text-[#738195]">{label}</p>
      <p className="mt-2 text-[30px] font-[650] tracking-[-1px]">{value}</p>
      {note && <p className="mt-1 text-[12px] leading-[1.5] text-muted-2">{note}</p>}
    </div>
  );
}
