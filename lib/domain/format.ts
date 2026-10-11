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

/** 0x1234…abcd */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
