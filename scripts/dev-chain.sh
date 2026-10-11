#!/usr/bin/env bash
# Deploys Folio Lab to a plain local anvil (no fork). Mock tokens are planted at the REAL BSC
# addresses of USDT and the Ondo stocks, so Binance price lookups by address work unchanged.
#
# Usage:  anvil --block-time 1      (in another terminal)
#         scripts/dev-chain.sh
# Reads PRICE_SIGNER_PRIVATE_KEY from .env.local; set CHAIN_RPC_URL=http://127.0.0.1:8545 there too.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
export PATH="$PATH:$HOME/.foundry/bin"
cd "$ROOT/contracts"
set -a; . "$ROOT/.env.local"; set +a

RPC=${RPC_URL:-http://127.0.0.1:8545}
PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil account 0
ME=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
USDT=0x55d398326f99059fF775485246999027B3197955
AAPL=0x390a684ef9cade28a7ad0dfa61ab1eb3842618c4
NVDA=0xa9ee28c80f960b889dfbd1902055218cba016f75
MSFT=0x6bfe75d1ad432050ea973c3a3dcd88f02e2444c3
SIGNER=$(cast wallet address "$PRICE_SIGNER_PRIVATE_KEY")

dep() { local c=$1; shift; forge create "$c" --rpc-url $RPC --private-key $PK --broadcast --constructor-args "$@" 2>&1 | awk '/Deployed to/{print $3}'; }
send() { cast send --rpc-url $RPC --private-key $PK "$@" >/dev/null; }
plant() { # plant <real address> <symbol>: copy a fresh 18-decimal MockERC20's code to the real address
  local tmp; tmp=$(dep test/mocks/MockERC20.sol:MockERC20 "$2" "$2" 18)
  cast rpc --rpc-url $RPC anvil_setCode "$1" "$(cast code --rpc-url $RPC "$tmp")" >/dev/null
}

plant $USDT USDT; plant $AAPL AAPLon; plant $NVDA NVDAon
# MSFTon is pausable (setPaused), to rehearse an issuer pausing a held token.
tmp=$(forge create test/mocks/MockERC20.sol:MockPausableERC20 --rpc-url $RPC --private-key $PK --broadcast 2>&1 | awk '/Deployed to/{print $3}')
cast rpc --rpc-url $RPC anvil_setCode $MSFT "$(cast code --rpc-url $RPC "$tmp")" >/dev/null
send $USDT "mint(address,uint256)" $ME 1000000000000000000000000   # 1,000,000 USDT

REG=$(dep src/AssetRegistry.sol:AssetRegistry $ME $ME $USDT)
FAC=$(dep src/VaultFactory.sol:VaultFactory "$REG")
send "$REG" "setPriceSigner(address)" "$SIGNER"
for t in $AAPL $NVDA $MSFT; do send "$REG" "setAsset(address,bool)" $t true; done

send "$FAC" "createVault(string,string,address)" "Mag Tech" "MAGT" $ME
V=$(cast call --rpc-url $RPC "$FAC" "vaults(uint256)(address)" 0)
send $USDT "approve(address,uint256)" "$V" 1000000000000000000000
send "$V" "seed(uint256)" 100000000000000000000                    # 100 USDT
send "$V" "activate()"

# A second vault that already holds stocks, bought through a real rebalance(). A MockRouter
# stands in for the Binance router: it takes the vault's USDT and mints the stock to it.
ROUTER=$(forge create test/mocks/MockRouter.sol:MockRouter --rpc-url $RPC --private-key $PK --broadcast 2>&1 | awk '/Deployed to/{print $3}')
send "$REG" "setRouter(address,bool)" "$ROUTER" true
send "$FAC" "createVault(string,string,address)" "Folio Test" "fTST" $ME
S=$(cast call --rpc-url $RPC "$FAC" "vaults(uint256)(address)" 1)
send $USDT "approve(address,uint256)" "$S" 1000000000000000000000
send "$S" "seed(uint256)" 1000000000000000000000                   # 1000 USDT
send "$S" "activate()"
send "$S" "setPlan(string)" "Hold Apple, Nvidia and Microsoft roughly equally by value. Keep about 30% in USDT."

CHAIN_ID=$(cast chain-id --rpc-url $RPC)
buy() { # buy <stock> <usdt in> <stock out> <signed price of one whole stock, USDT base units>
  local calldata ts typed sig
  calldata=$(cast calldata "swap(address,address,uint256,uint256,address)" $USDT "$1" "$2" "$3" "$S")
  # The contract rejects a timestamp ahead of the chain, so sign at the latest block time.
  ts=$(( $(cast block latest --rpc-url $RPC -f timestamp) - 1 ))
  typed='{"types":{"EIP712Domain":[{"name":"name","type":"string"},{"name":"version","type":"string"},'
  typed+='{"name":"chainId","type":"uint256"},{"name":"verifyingContract","type":"address"}],'
  typed+='"PriceUpdate":[{"name":"assets","type":"address[]"},{"name":"prices","type":"uint256[]"},{"name":"timestamp","type":"uint64"}]},'
  typed+='"primaryType":"PriceUpdate","domain":{"name":"Folio Lab","version":"1","chainId":'$CHAIN_ID',"verifyingContract":"'$REG'"},'
  typed+='"message":{"assets":["'$1'"],"prices":["'$4'"],"timestamp":'$ts'}}'
  sig=$(cast wallet sign --private-key "$PRICE_SIGNER_PRIVATE_KEY" --data "$typed")
  send "$S" "rebalance((address,address,address,uint256,uint256,bytes),(address[],uint256[],uint64),bytes)" \
    "($ROUTER,$USDT,$1,$2,$3,$calldata)" "([$1],[$4],$ts)" "$sig"
}
buy $AAPL 250000000000000000000 1000000000000000000 250000000000000000000   # 250 USDT -> 1 AAPLon
buy $NVDA 180000000000000000000 1000000000000000000 180000000000000000000   # 180 USDT -> 1 NVDAon
buy $MSFT 260000000000000000000 500000000000000000 520000000000000000000    # 260 USDT -> 0.5 MSFTon

echo "REGISTRY=$REG"
echo "FACTORY=$FAC"
echo "VAULT=$V"
echo "STOCK_VAULT=$S"
echo "state=$(cast call --rpc-url $RPC "$V" 'state()(uint8)') supply=$(cast call --rpc-url $RPC "$V" 'totalSupply()(uint256)')"
echo "stock vault holds: $(cast call --rpc-url $RPC "$S" 'heldAssets()(address[])')"
echo
echo "Both vaults come from the factory, so DEV_EXTRA_VAULTS is no longer needed: clear it in .env.local."
