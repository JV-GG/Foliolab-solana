/**
 * Minimal signed client for the Binance Web3 API.
 *
 * Deliberately thin rather than using the official SDK: the point here is to see
 * exactly what goes over the wire and what comes back.
 *
 * Signing (https://web3.binance.com/en/dev-docs/authentication):
 *   preHash   = timestamp + METHOD + pathWithQuery + body
 *   signature = base64(hmacSha256(secret, preHash))
 *
 * pathWithQuery MUST include the `/build` prefix exactly as sent, or you get
 * 40102 Invalid signature. That is the single most common mistake.
 */
import {createHmac} from 'node:crypto';
import {Resolver} from 'node:dns';
import {readFileSync} from 'node:fs';
import {request as httpsRequest} from 'node:https';
import {join} from 'node:path';

export const DEFAULT_HOST = 'https://web3.binance.com';

/** Overridable so captured responses can be replayed locally for testing. */
export function host(): string {
  loadProjectEnv();
  return process.env.BINANCE_WEB3_HOST || DEFAULT_HOST;
}
export const BASE_PATH = '/build';

/** BSC mainnet. Everything here targets mainnet by design. */
export const BSC_CHAIN_ID = 56;

export interface Credentials {
  apiKey: string;
  secretKey: string;
}

export interface RequestOptions {
  method: 'GET' | 'POST';
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  timeoutMs?: number;
}

export interface ApiResult {
  httpStatus: number;
  durationMs: number;
  /** The full path that was signed, useful when debugging 40102. */
  signedPath: string;
  body: unknown;
}

/**
 * Some networks return a sinkhole address for Binance hostnames, so every
 * request dies with a connect timeout even though the real servers are fine.
 * Setting BINANCE_WEB3_DNS (e.g. 1.1.1.1) resolves through that server instead
 * of the system resolver, which routes around a DNS-level block without needing
 * root access or a change to /etc. Unset, nothing here is active and ordinary
 * fetch is used.
 */
/**
 * Loads this repo's dotenv files into process.env once, so the CLI and the Next
 * app read the same configuration. Next only reads root .env* files, and the
 * CLI only read api/.env, which previously meant settings applied to one and
 * not the other. Existing environment variables always win.
 */
let envLoaded = false;

function loadProjectEnv(): void {
  if (envLoaded) return;
  envLoaded = true;
  // Next has already loaded the root .env* files. Reading files here inside Next would make the
  // build trace the whole project, which can ship .env files in the server bundle.
  if (process.env.NEXT_RUNTIME) return;

  const root = process.cwd();
  for (const file of [join(root, '.env.local'), join(root, '.env'), join(root, 'api', '.env')]) {
    try {
      for (const line of readFileSync(/*turbopackIgnore: true*/ file, 'utf8').split('\n')) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (!match) continue;
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        if (value && process.env[match[1]] === undefined) process.env[match[1]] = value;
      }
    } catch {
      // File absent; try the next one.
    }
  }
}

/** Read lazily: dotenv files are loaded after this module is imported. */
function dnsOverride(): string | undefined {
  loadProjectEnv();
  return process.env.BINANCE_WEB3_DNS || undefined;
}

const addressCache = new Map<string, string>();

function resolveVia(server: string, hostname: string): Promise<string> {
  const cached = addressCache.get(hostname);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const resolver = new Resolver({timeout: 5000, tries: 2});
    resolver.setServers([server]);
    resolver.resolve4(hostname, (error, addresses) => {
      if (error || !addresses?.length) {
        reject(error ?? new Error(`No A record for ${hostname} via ${server}`));
        return;
      }
      addressCache.set(hostname, addresses[0]);
      resolve(addresses[0]);
    });
  });
}

/**
 * fetch() equivalent that resolves the hostname through DNS_OVERRIDE. TLS still
 * validates against the real hostname, because SNI comes from `host`, not from
 * the address we connect to.
 */
function requestViaOverride(
  server: string,
  url: URL,
  method: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number,
): Promise<{status: number; text: string}> {
  return new Promise((resolve, reject) => {
    resolveVia(server, url.hostname).then((address) => {
      const req = httpsRequest(
        {
          host: url.hostname,
          servername: url.hostname,
          port: 443,
          path: url.pathname + url.search,
          method,
          headers: {...headers, Host: url.hostname},
          timeout: timeoutMs,
          // Node calls this with `all: true` on some paths, which expects an
          // array; otherwise it wants (err, address, family).
          lookup: (_hostname, options, callback) => {
            const cb = callback as unknown as (
              error: null,
              address: string | {address: string; family: number}[],
              family?: number,
            ) => void;
            if (typeof options === 'object' && options?.all) {
              cb(null, [{address, family: 4}]);
            } else {
              cb(null, address, 4);
            }
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(chunk as Buffer));
          res.on('end', () =>
            resolve({status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8')}),
          );
        },
      );
      req.on('timeout', () => req.destroy(new Error(`Timed out after ${timeoutMs}ms`)));
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    }, reject);
  });
}

function buildQuery(query: RequestOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function sign(
  secretKey: string,
  timestamp: string,
  method: string,
  pathWithQuery: string,
  body: string,
): string {
  const preHash = timestamp + method + pathWithQuery + body;
  return createHmac('sha256', secretKey).update(preHash, 'utf8').digest('base64');
}

export async function request(
  credentials: Credentials,
  options: RequestOptions,
): Promise<ApiResult> {
  const bodyText = options.body === undefined ? '' : JSON.stringify(options.body);
  const pathWithQuery = BASE_PATH + options.path + buildQuery(options.query);
  const timestamp = new Date().toISOString();

  const headers: Record<string, string> = {
    'X-OC-APIKEY': credentials.apiKey,
    'X-OC-TIMESTAMP': timestamp,
    'X-OC-SIGN': sign(credentials.secretKey, timestamp, options.method, pathWithQuery, bodyText),
  };
  if (bodyText) headers['Content-Type'] = 'application/json';

  const timeoutMs = options.timeoutMs ?? 15_000;
  const startedAt = performance.now();

  let status: number;
  let text: string;

  const server = dnsOverride();
  if (server) {
    const result = await requestViaOverride(
      server,
      new URL(host() + pathWithQuery),
      options.method,
      headers,
      bodyText,
      timeoutMs,
    );
    status = result.status;
    text = result.text;
  } else {
    const response = await fetch(host() + pathWithQuery, {
      method: options.method,
      headers,
      body: bodyText || undefined,
      // Fail fast rather than hanging a server render on a blocked connection.
      signal: AbortSignal.timeout(timeoutMs),
    });
    status = response.status;
    text = await response.text();
  }

  const durationMs = Math.round(performance.now() - startedAt);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text.slice(0, 2000);
  }

  return {httpStatus: status, durationMs, signedPath: pathWithQuery, body: parsed};
}

export function loadCredentials(): Credentials {
  loadProjectEnv();
  const apiKey = process.env.BINANCE_WEB3_API_KEY;
  const secretKey = process.env.BINANCE_WEB3_API_SECRET;

  if (!apiKey || !secretKey) {
    throw new Error(
      'Missing credentials. Put BINANCE_WEB3_API_KEY and BINANCE_WEB3_API_SECRET in ' +
        'api/.env or .env.local — keys from https://web3.binance.com/en/dev-portal/project',
    );
  }
  return {apiKey, secretKey};
}
