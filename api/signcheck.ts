/**
 * Verifies the signing algorithm against the worked example in the Binance docs.
 * Runs without credentials: node api/signcheck.ts
 */
import {createHmac} from 'node:crypto';
import {sign} from './client.ts';

const secretKey = 'test-secret-key';
const timestamp = '2026-05-11T10:08:57.715Z';
const method = 'GET';
const pathWithQuery = '/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT';
const body = '';

const preHash = timestamp + method + pathWithQuery + body;
const expected = createHmac('sha256', secretKey).update(preHash, 'utf8').digest('base64');
const actual = sign(secretKey, timestamp, method, pathWithQuery, body);

console.log('preHash :', preHash);
console.log('expected:', expected);
console.log('actual  :', actual);

if (actual !== expected) {
  console.error('\nFAIL — signing does not match the documented algorithm');
  process.exit(1);
}
console.log('\nPASS — signing matches the documented algorithm');
