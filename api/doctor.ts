/**
 * Stage-by-stage connectivity check for the Binance Web3 API.
 *
 *   node api/doctor.ts
 *
 * Each stage isolates one failure mode, so "fetch failed" becomes a specific
 * cause: DNS, TCP, TLS, HTTP, or authentication.
 */
import {Resolver, lookup} from 'node:dns/promises';
import {connect as tlsConnect} from 'node:tls';
import {Socket} from 'node:net';
import {loadCredentials, request, host as apiHost} from './client.ts';
import {readFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

try {
  for (const line of readFileSync(join(HERE, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '');
  }
} catch {
  /* fall back to ambient env */
}

const HOST = apiHost();
const host = new URL(HOST).hostname;
const pass = (s: string) => console.log(`  \x1b[32mPASS\x1b[0m  ${s}`);
const fail = (s: string) => console.log(`  \x1b[31mFAIL\x1b[0m  ${s}`);
const info = (s: string) => console.log(`        ${s}`);

function describe(error: unknown): string {
  const err = error as {message?: string; cause?: {code?: string; message?: string}};
  const cause = err.cause?.code ?? err.cause?.message;
  return cause ? `${err.message} (cause: ${cause})` : String(err.message ?? error);
}

console.log(`\nBinance Web3 API doctor — target ${HOST}\n`);

console.log('Environment');
info(`node ${process.version} · platform ${process.platform}`);
for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'NO_PROXY']) {
  if (process.env[key]) info(`${key}=${process.env[key]}`);
}
info(`BINANCE_WEB3_HOST=${process.env.BINANCE_WEB3_HOST ?? '(unset — using default)'}`);
info(
  `credentials: ${process.env.BINANCE_WEB3_API_KEY ? 'key set' : 'KEY MISSING'}, ` +
    `${process.env.BINANCE_WEB3_API_SECRET ? 'secret set' : 'SECRET MISSING'}`,
);

console.log('\n1. DNS');
let addresses: string[] = [];
try {
  const results = await lookup(host, {all: true});
  addresses = results.map((r) => r.address);
  pass(`${host} → ${results.map((r) => `${r.address} (IPv${r.family})`).join(', ')}`);
} catch (error) {
  fail(`cannot resolve ${host}: ${describe(error)}`);
}

console.log('\n1b. DNS cross-check (system vs public resolver)');
let hijacked = false;
let publicAddresses: string[] = [];
try {
  const resolver = new Resolver({timeout: 4000, tries: 1});
  resolver.setServers(['1.1.1.1', '8.8.8.8']);
  publicAddresses = await resolver.resolve4(host);

  const overlap = publicAddresses.some((a) => addresses.includes(a));
  if (overlap || addresses.length === 0) {
    pass(`system and public resolvers agree (${publicAddresses.slice(0, 2).join(', ')})`);
  } else {
    hijacked = true;
    fail(`system resolver disagrees with public DNS`);
    info(`system: ${addresses.join(', ')}`);
    info(`public: ${publicAddresses.slice(0, 3).join(', ')}`);
    info('Your resolver is redirecting this hostname. See the summary below.');
  }
} catch (error) {
  info(`could not cross-check: ${describe(error)}`);
}

console.log('\n2. TCP :443');
for (const address of addresses.slice(0, 4)) {
  await new Promise<void>((resolve) => {
    const socket = new Socket();
    const started = Date.now();
    socket.setTimeout(8000);
    socket.once('connect', () => {
      pass(`${address} connected in ${Date.now() - started}ms`);
      socket.destroy();
      resolve();
    });
    socket.once('timeout', () => {
      fail(`${address} timed out after 8000ms — blocked or filtered`);
      socket.destroy();
      resolve();
    });
    socket.once('error', (error) => {
      fail(`${address} ${describe(error)}`);
      resolve();
    });
    socket.connect(443, address);
  });
}

if (hijacked && publicAddresses.length > 0) {
  console.log('\n2b. TCP :443 to the addresses public DNS reports');
  await new Promise<void>((resolve) => {
    const socket = new Socket();
    const started = Date.now();
    socket.setTimeout(8000);
    socket.once('connect', () => {
      pass(`${publicAddresses[0]} connected in ${Date.now() - started}ms — the real host IS reachable`);
      info('This is a DNS-only block: the addresses work, the name does not resolve correctly.');
      socket.destroy();
      resolve();
    });
    socket.once('timeout', () => {
      fail(`${publicAddresses[0]} timed out — blocked at IP level too, not just DNS`);
      socket.destroy();
      resolve();
    });
    socket.once('error', (error) => {
      fail(`${publicAddresses[0]} ${describe(error)}`);
      resolve();
    });
    socket.connect(443, publicAddresses[0]);
  });
}

console.log('\n3. TLS');
await new Promise<void>((resolve) => {
  const socket = tlsConnect({host, port: 443, servername: host, timeout: 10000}, () => {
    pass(`handshake ok · ${socket.getProtocol()} · authorized=${socket.authorized}`);
    socket.destroy();
    resolve();
  });
  socket.once('timeout', () => {
    fail('TLS handshake timed out');
    socket.destroy();
    resolve();
  });
  socket.once('error', (error) => {
    fail(describe(error));
    resolve();
  });
});

console.log('\n4. HTTP (unsigned — a 401/4xx here still proves reachability)');
try {
  const response = await fetch(`${HOST}/api/v1/dex/market/supported/chain`);
  pass(`HTTP ${response.status} ${response.statusText}`);
  info(`body: ${(await response.text()).slice(0, 160)}`);
} catch (error) {
  fail(describe(error));
}

console.log('\n5. Signed request');
try {
  const result = await request(loadCredentials(), {
    method: 'GET',
    path: '/api/v1/dex/market/rwa/tokens',
    query: {limit: 1},
  });
  const body = result.body as {success?: boolean; msg?: string; data?: unknown[]};
  if (body?.success === false) {
    fail(`API rejected it: ${body.msg}`);
  } else {
    pass(`HTTP ${result.httpStatus} in ${result.durationMs}ms · ${body?.data?.length ?? 0} rows`);
  }
} catch (error) {
  fail(describe(error));
}

if (hijacked) {
  console.log(`
\x1b[1mSummary — this is a DNS problem, not a code problem.\x1b[0m

Your system resolver returns ${addresses.join(', ')} for every Binance hostname,
while public DNS returns the real CloudFront addresses. Requests never reach
Binance, so every call fails with a connect timeout.

Fix it by pointing this machine at a resolver that answers correctly. On WSL,
DNS is regenerated on each start, so it takes two files:

  sudo tee /etc/wsl.conf >/dev/null <<'EOF'
  [network]
  generateResolvConf = false
  EOF

  sudo rm -f /etc/resolv.conf
  sudo tee /etc/resolv.conf >/dev/null <<'EOF'
  nameserver 1.1.1.1
  nameserver 8.8.8.8
  EOF

Then from Windows PowerShell:  wsl --shutdown   and reopen your terminal.
Re-run this doctor to confirm. Nothing in the project needs to change.
`);
}

console.log('');
