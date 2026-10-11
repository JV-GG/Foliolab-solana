/**
 * Probe the Binance Web3 API and report what each endpoint actually returns.
 *
 *   node api/probe.ts                 list the catalogue
 *   node api/probe.ts --all           probe everything read-only
 *   node api/probe.ts rwa             probe every endpoint whose id starts "rwa"
 *   node api/probe.ts rwa.tokens      probe one endpoint
 *   node api/probe.ts rwa.tokens --raw  print the full JSON too
 *
 * Read-only by design: nothing here can move funds. See endpoints.ts.
 */
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadCredentials, request, type ApiResult} from './client.ts';
import {ENDPOINTS, type EndpointSpec} from './endpoints.ts';
import {describeShape} from './shape.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const RESPONSES_DIR = join(HERE, 'responses');

/** Minimal .env loader — avoids a dependency just to read four lines. */
function loadEnvFile(): void {
  try {
    const text = readFileSync(join(HERE, '.env'), 'utf8');
    for (const line of text.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!match) continue;
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (value && !process.env[match[1]]) process.env[match[1]] = value;
    }
  } catch {
    // No .env file; rely on the ambient environment.
  }
}

function applyPlaceholders(spec: EndpointSpec): EndpointSpec | string {
  const address = process.env.PROBE_ADDRESS;
  const token = process.env.PROBE_TOKEN;
  const txHash = process.env.PROBE_TXHASH;

  const query = {...(spec.query ?? {})};
  let body = spec.body;

  if (spec.needsAddress) {
    if (!address) return 'needs PROBE_ADDRESS in api/.env';
    query.address = address;
    if (spec.id === 'wallet.tokenBalances') {
      body = [{binanceChainId: '56', address, tokenContractAddress: process.env.PROBE_TOKEN ?? ''}];
    }
  }
  if (spec.needsToken) {
    if (!token) return 'needs PROBE_TOKEN in api/.env';
    query.tokenContractAddress = token;
  }
  if (spec.needsTxHash) {
    if (!txHash) return 'needs PROBE_TXHASH in api/.env';
    query.txHash = txHash;
  }

  return {...spec, query, body};
}

function isSuccess(result: ApiResult): boolean {
  if (result.httpStatus !== 200) return false;
  const code = (result.body as {code?: unknown})?.code;
  return code === '000000' || code === 0 || code === '0' || code === undefined;
}

function summarise(result: ApiResult): string[] {
  const body = result.body as Record<string, unknown> | undefined;
  const payload = body && 'data' in body ? body.data : body;
  return describeShape(payload, '    ');
}

async function probe(spec: EndpointSpec, raw: boolean): Promise<boolean> {
  const prepared = applyPlaceholders(spec);
  console.log(`\n\x1b[1m${spec.id}\x1b[0m  ${spec.method} ${spec.path}`);
  console.log(`  ${spec.description}`);

  if (typeof prepared === 'string') {
    console.log(`  \x1b[33mSKIPPED\x1b[0m — ${prepared}`);
    return false;
  }

  let result: ApiResult;
  try {
    result = await request(loadCredentials(), {
      method: prepared.method,
      path: prepared.path,
      query: prepared.query,
      body: prepared.body,
    });
  } catch (error) {
    console.log(`  \x1b[31mREQUEST FAILED\x1b[0m — ${(error as Error).message}`);
    return false;
  }

  const ok = isSuccess(result);
  const status = ok ? '\x1b[32mOK\x1b[0m' : '\x1b[31mERROR\x1b[0m';
  console.log(`  ${status}  HTTP ${result.httpStatus}  ${result.durationMs}ms`);

  mkdirSync(RESPONSES_DIR, {recursive: true});
  writeFileSync(
    join(RESPONSES_DIR, `${spec.id}.json`),
    JSON.stringify({request: prepared, result}, null, 2),
  );

  if (ok) {
    console.log('  shape:');
    for (const line of summarise(result)) console.log(line);
  } else {
    // The error text tells you which parameters the endpoint actually wants.
    console.log(`  response: ${JSON.stringify(result.body).slice(0, 400)}`);
  }

  if (raw) console.log(`  raw: ${JSON.stringify(result.body, null, 2)}`);
  return ok;
}

async function main(): Promise<void> {
  loadEnvFile();
  const args = process.argv.slice(2);
  const raw = args.includes('--raw');
  const filters = args.filter((a) => !a.startsWith('--'));
  const all = args.includes('--all');

  if (!all && filters.length === 0) {
    console.log('Binance Web3 API — read-only endpoint catalogue\n');
    let group = '';
    for (const spec of ENDPOINTS) {
      if (spec.group !== group) {
        group = spec.group;
        console.log(`\n\x1b[1m${group.toUpperCase()}\x1b[0m`);
      }
      console.log(`  ${spec.id.padEnd(26)} ${spec.method.padEnd(4)} ${spec.description}`);
    }
    console.log(`\n${ENDPOINTS.length} endpoints. Run one:  node api/probe.ts rwa.tokens`);
    console.log('Run all:                          node api/probe.ts --all\n');
    return;
  }

  const selected = all
    ? ENDPOINTS
    : ENDPOINTS.filter((spec) => filters.some((f) => spec.id.startsWith(f)));

  if (selected.length === 0) {
    console.log(`No endpoint matches: ${filters.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  let okCount = 0;
  for (const spec of selected) {
    if (await probe(spec, raw)) okCount++;
    if (selected.length > 1) await new Promise((r) => setTimeout(r, 250)); // stay under 5 rps
  }

  console.log(`\n${okCount}/${selected.length} succeeded. Full JSON in api/responses/\n`);
}

await main();
