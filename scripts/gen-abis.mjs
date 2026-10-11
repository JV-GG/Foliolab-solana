// Writes lib/contracts/abis.ts from the Foundry build output. Run `forge build` in contracts/ first.
import fs from 'node:fs';

const contracts = ['AssetRegistry', 'VaultFactory', 'FolioVault'];
const erc20Fns = ['balanceOf', 'decimals', 'symbol', 'name', 'approve', 'allowance', 'totalSupply'];
const abiOf = (file, name) => JSON.parse(fs.readFileSync(`contracts/out/${file}/${name}.json`, 'utf8')).abi;

let out = `/**
 * Contract ABIs, generated from contracts/out. Do not edit by hand.
 * Part 1 owns the contracts; regenerate after any interface change:
 *   cd contracts && forge build && cd .. && npm run abis
 */
`;
// deposit() bubbles up the registry's price errors (StalePrices, InvalidPriceSignature, …), so the
// vault ABI carries them too; otherwise clients see a raw selector instead of a named error.
const registryErrors = abiOf('AssetRegistry.sol', 'AssetRegistry').filter((e) => e.type === 'error');
for (const name of contracts) {
  const id = name[0].toLowerCase() + name.slice(1) + 'Abi';
  let abi = abiOf(`${name}.sol`, name);
  if (name === 'FolioVault') {
    const have = new Set(abi.filter((e) => e.type === 'error').map((e) => e.name));
    abi = [...abi, ...registryErrors.filter((e) => !have.has(e.name))];
  }
  out += `\nexport const ${id} = ${JSON.stringify(abi, null, 2)} as const;\n`;
}
const erc20 = abiOf('ERC20.sol', 'ERC20').filter((e) => erc20Fns.includes(e.name));
out += `\nexport const erc20Abi = ${JSON.stringify(erc20, null, 2)} as const;\n`;

fs.writeFileSync('lib/contracts/abis.ts', out);
console.log('wrote lib/contracts/abis.ts');
