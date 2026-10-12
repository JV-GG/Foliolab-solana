const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function money(value: number): string {
  return currency.format(value);
}

export function pct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

/** Rounds down to whole cents, so "use max" never exceeds the real limit. */
export function floorToCents(value: number): string {
  return (Math.floor((value + 1e-8) * 100) / 100).toFixed(2);
}

/** A raw base-unit amount as a readable number, e.g. 1500000000000000000 (18) → "1.5". */
export function tokenAmount(raw: string | bigint, decimals: number, maxDigits = 6): string {
  const value = BigInt(raw);
  const unit = BigInt(10) ** BigInt(decimals);
  const whole = value / unit;
  const fraction = (value % unit).toString().padStart(decimals, '0').slice(0, maxDigits).replace(/0+$/, '');
  return `${whole.toLocaleString('en-US')}${fraction ? `.${fraction}` : ''}`;
}

/** 7xZ7…3Jbi */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Raw base units → decimal string, e.g. formatUnits(1500000n, 6) === '1.5'. */
export function formatUnits(raw: bigint | string, decimals: number): string {
  const value = BigInt(raw);
  const negative = value < BigInt(0);
  const abs = negative ? -value : value;
  const unit = BigInt(10) ** BigInt(decimals);
  const fraction = (abs % unit).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${abs / unit}${fraction ? `.${fraction}` : ''}`;
}

/** Decimal string → raw base units, truncating extra digits, e.g. parseUnits('1.5', 6) === 1500000n. */
export function parseUnits(text: string, decimals: number): bigint {
  const match = /^(\d*)(?:\.(\d*))?$/.exec(text.trim());
  if (!match || (match[1] === '' && !match[2])) throw new Error(`Not a number: "${text}"`);
  return BigInt((match[1] || '0') + (match[2] ?? '').slice(0, decimals).padEnd(decimals, '0'));
}

/**
 * Formats lamports into clean, human-readable SOL units.
 * Examples:
 *   20_000n -> "0.00002 SOL"
 *   50_000_000n -> "0.05 SOL"
 *   100_000_000n -> "0.1 SOL"
 *   1_000_000_000n -> "1 SOL"
 *   0n -> "0 SOL"
 */
export function formatSol(rawLamports: bigint | string | number, maxDigits = 6): string {
  const lamports = BigInt(rawLamports.toString());
  if (lamports === BigInt(0)) return '0 SOL';
  const sol = Number(lamports) / 1e9;
  const formatted = sol.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDigits,
  });
  return `${formatted} SOL`;
}
