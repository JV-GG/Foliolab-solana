/**
 * Summarises a JSON value as a type tree, so you can see an endpoint's data
 * shape without reading hundreds of lines of payload.
 */

const MAX_ARRAY_KEYS = 40;

function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function preview(value: unknown): string {
  if (typeof value === 'string') {
    const clean = value.replace(/\s+/g, ' ');
    return clean.length > 48 ? `"${clean.slice(0, 48)}…"` : `"${clean}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  return '';
}

export function describeShape(value: unknown, indent = '', depth = 0): string[] {
  if (depth > 6) return [`${indent}…`];

  if (Array.isArray(value)) {
    if (value.length === 0) return [`${indent}[] (empty array)`];
    const lines = [`${indent}[${value.length} item${value.length === 1 ? '' : 's'}], each:`];
    lines.push(...describeShape(value[0], `${indent}  `, depth + 1));
    return lines;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const shown = entries.slice(0, MAX_ARRAY_KEYS);
    const lines: string[] = [];

    for (const [key, child] of shown) {
      const kind = typeName(child);
      if (kind === 'object' || kind === 'array') {
        lines.push(`${indent}${key}: ${kind}`);
        lines.push(...describeShape(child, `${indent}  `, depth + 1));
      } else {
        const sample = preview(child);
        lines.push(`${indent}${key}: ${kind}${sample ? ` = ${sample}` : ''}`);
      }
    }
    if (entries.length > shown.length) {
      lines.push(`${indent}… ${entries.length - shown.length} more keys`);
    }
    return lines;
  }

  return [`${indent}${typeName(value)}${preview(value) ? ` = ${preview(value)}` : ''}`];
}
