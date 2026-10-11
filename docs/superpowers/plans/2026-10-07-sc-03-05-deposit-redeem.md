# SC-03 + SC-05 — Signed-Price Deposits, Withdrawals, Pause Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone can deposit USDT into an active vault and get shares instantly at the fair price; anyone can withdraw their percentage of every holding at any time; the guardian can pause deposits.

**Architecture:** `AssetRegistry` gains a `priceSigner` and verifies EIP-712 `PriceUpdate` signatures (one price list, shared by every vault). `FolioVault.deposit` values the vault from its **own balances** times those signed prices, then mints `received × supply ÷ value`, rounded down. `FolioVault.redeem` burns shares and pays the same percentage of every held asset, with no price. `pause`/`unpause` move `ACTIVE ⇄ PAUSED`; redemption works in every state. Until SC-04 builds `rebalance`, tests use a harness that stands in for manager trades.

**Tech Stack:** Solidity 0.8.30, Foundry (forge 1.5.1), OpenZeppelin Contracts v5.7.0 (`EIP712`, `ECDSA`, `Math`), forge-std v1.16.2.

**Spec:** [docs/folio-lab-contract-architecture.md](../../folio-lab-contract-architecture.md) — §1 (changed 7 Oct: priced deposits), §2, §4, §5 "Deposit" and "Redeem", §7, §8.0, §10 decisions #6 and #9–#11.

## Global Constraints

- `pragma solidity 0.8.30;` exactly, in every file. EVM target `cancun`. Custom errors only.
- `SafeERC20` for every token transfer; amounts received measured from balance before/after.
- `nonReentrant` on every state-changing external function that moves tokens (`deposit`, `redeem`).
- Signed prices: EIP-712, domain name `"Folio Lab"`, version `"1"`, verifying contract = the `AssetRegistry`. Type string exactly `PriceUpdate(address[] assets,uint256[] prices,uint64 timestamp)`.
- `price` = value in settlement-token units of **one whole** asset token (`10 ** decimals` base units).
- Max price age **60 seconds**; a timestamp in the future is rejected too.
- USDT (settlement token) is always valued at par; a signed USDT price is ignored.
- Every held non-USDT asset must have a non-zero price, or the deposit reverts.
- Shares round **down** on deposit and every redemption leg rounds **down**; non-USDT value rounds **up**.
- `deposit` only in `ACTIVE`. `redeem` in any state; dead shares (`0x…dEaD`) can never be redeemed.
- No delay between depositing and redeeming.
- Run `forge fmt` before finishing each task. All commands run from `contracts/`.
- **Do not commit.** The user commits when they choose to.

## Review Focus

1. **A held stock missing from the signed list** → deposit reverts; it must never count as worth $0. (Task 2, `test_deposit_revertsWhenHeldStockHasNoPrice`)
2. **Deposit immediately followed by a full redemption at the same prices** → the depositor can never walk out with more than they paid. (Task 2, `testFuzz_depositThenRedeem_neverProfits`)
3. **Signature made by standard tooling (`cast wallet sign --data`, as viem/ethers would)** → accepted, so the backend's encoding matches ours, array fields included. (Task 1, `test_checkPrices_acceptsSignatureFromStandardTooling`)
4. **A paused vault** → deposits blocked, withdrawals still work. (Task 2, `test_pause_blocksDeposits`, `test_redeem_worksWhilePaused`)
5. **A stock token that is not 18 decimals** → valued from its own decimals. (Task 2, `test_deposit_stockWithSixDecimals`)

## File Structure

| File | Responsibility |
|---|---|
| `contracts/src/AssetRegistry.sol` | + `PriceUpdate` struct, `priceSigner`, EIP-712 hashing and `checkPrices` |
| `contracts/src/FolioVault.sol` | + `deposit`, `redeem`, `pause`, `unpause`; `_held` becomes `internal` |
| `contracts/test/helpers/FolioVaultHarness.sol` | test-only vault with two hooks standing in for manager trades (SC-04) |
| `contracts/test/helpers/VaultFixture.sol` | shared setup and signing helpers for deposit/redeem tests |
| `contracts/test/AssetRegistry.t.sol` | + 13 signed-price tests |
| `contracts/test/FolioVaultDeposit.t.sol` | deposit + pause tests |
| `contracts/test/FolioVaultRedeem.t.sol` | redeem tests |
| `contracts/test/Simulation.t.sol` | + chapters 8–10 (deposit, pause, withdraw) |

Every code block below was compiled and run before this plan was written: 105 tests pass, `forge lint` clean, deep-profile fuzzing passes.

---

### Task 1: AssetRegistry — price signer and signed-price verification

**Files:**
- Modify (replace whole file): `contracts/src/AssetRegistry.sol`
- Modify (replace whole file): `contracts/test/AssetRegistry.t.sol`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - file-level `struct PriceUpdate { address[] assets; uint256[] prices; uint64 timestamp; }` exported from `AssetRegistry.sol`
  - `uint256 public constant MAX_PRICE_AGE = 60`, `bytes32 public constant PRICE_UPDATE_TYPEHASH`
  - `address public priceSigner`; `function setPriceSigner(address) external` (owner only; zero rejected); `event PriceSignerSet(address indexed from, address indexed to)`
  - `function hashPriceUpdate(PriceUpdate calldata) public view returns (bytes32)` — the EIP-712 digest to sign
  - `function checkPrices(PriceUpdate calldata, bytes calldata signature) external view` — reverts `LengthMismatch()`, `StalePrices(uint64 timestamp)`, or `InvalidPriceSignature()`
  - constructor signature unchanged

- [ ] **Step 1: Write the failing tests**

Replace `contracts/test/AssetRegistry.t.sol` with this. The first 16 tests are the existing ones, unchanged; the 13 after `// ---- signed prices` are new. The last test uses a signature produced off-chain with `cast wallet sign --data` for this exact registry address (`0x2e23…470b`, the test contract's second deployment) on chain 31337.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AssetRegistry, PriceUpdate} from "../src/AssetRegistry.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract AssetRegistryTest is Test {
    AssetRegistry internal registry;
    MockERC20 internal usdt;

    address internal governance = makeAddr("governance");
    address internal guardian = makeAddr("guardian");
    address internal stranger = makeAddr("stranger");
    address internal stock = makeAddr("stock");
    address internal router = makeAddr("router");

    function setUp() public {
        usdt = new MockERC20("Tether USD", "USDT", 18);
        registry = new AssetRegistry(governance, guardian, address(usdt));
    }

    function test_constructor_setsRoles() public view {
        assertEq(registry.owner(), governance);
        assertEq(registry.guardian(), guardian);
        assertEq(registry.settlementToken(), address(usdt));
    }

    function test_constructor_settlementTokenIsAllowedAsset() public view {
        assertTrue(registry.isAsset(address(usdt)));
    }

    function test_constructor_revertsOnZeroGuardian() public {
        vm.expectRevert(AssetRegistry.ZeroAddress.selector);
        new AssetRegistry(governance, address(0), address(usdt));
    }

    function test_constructor_revertsOnZeroSettlementToken() public {
        vm.expectRevert(AssetRegistry.ZeroAddress.selector);
        new AssetRegistry(governance, guardian, address(0));
    }

    function test_setAsset_governanceCanAllowAndDisallow() public {
        vm.expectEmit(address(registry));
        emit AssetRegistry.AssetSet(stock, true);
        vm.prank(governance);
        registry.setAsset(stock, true);
        assertTrue(registry.isAsset(stock));

        vm.prank(governance);
        registry.setAsset(stock, false);
        assertFalse(registry.isAsset(stock));
    }

    function test_setAsset_revertsForNonGovernance() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, guardian));
        vm.prank(guardian);
        registry.setAsset(stock, true);
    }

    function test_setAsset_revertsOnZeroAddress() public {
        vm.expectRevert(AssetRegistry.ZeroAddress.selector);
        vm.prank(governance);
        registry.setAsset(address(0), true);
    }

    function test_setAsset_cannotDisallowSettlementToken() public {
        vm.expectRevert(AssetRegistry.SettlementTokenFixed.selector);
        vm.prank(governance);
        registry.setAsset(address(usdt), false);
    }

    function test_setRouter_governanceCanAllowAndDisallow() public {
        vm.expectEmit(address(registry));
        emit AssetRegistry.RouterSet(router, true);
        vm.prank(governance);
        registry.setRouter(router, true);
        assertTrue(registry.isRouter(router));

        vm.prank(governance);
        registry.setRouter(router, false);
        assertFalse(registry.isRouter(router));
    }

    function test_renounceOwnership_isDisabled() public {
        vm.expectRevert(AssetRegistry.RenounceDisabled.selector);
        vm.prank(governance);
        registry.renounceOwnership();

        assertEq(registry.owner(), governance);
    }

    function test_setRouter_revertsForNonGovernance() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vm.prank(stranger);
        registry.setRouter(router, true);
    }

    function test_setRouter_revertsOnZeroAddress() public {
        vm.expectRevert(AssetRegistry.ZeroAddress.selector);
        vm.prank(governance);
        registry.setRouter(address(0), true);
    }

    function test_setGuardian_governanceCanRotate() public {
        address newGuardian = makeAddr("newGuardian");
        vm.expectEmit(address(registry));
        emit AssetRegistry.GuardianSet(guardian, newGuardian);
        vm.prank(governance);
        registry.setGuardian(newGuardian);
        assertEq(registry.guardian(), newGuardian);
    }

    function test_setGuardian_revertsForGuardianItself() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, guardian));
        vm.prank(guardian);
        registry.setGuardian(stranger);
    }

    function test_setGuardian_revertsOnZeroAddress() public {
        vm.expectRevert(AssetRegistry.ZeroAddress.selector);
        vm.prank(governance);
        registry.setGuardian(address(0));
    }

    function test_governanceHandover_isTwoStep() public {
        address newGovernance = makeAddr("newGovernance");
        vm.prank(governance);
        registry.transferOwnership(newGovernance);
        assertEq(registry.owner(), governance, "old owner stays until accepted");

        vm.prank(newGovernance);
        registry.acceptOwnership();
        assertEq(registry.owner(), newGovernance);
    }

    // ---- signed prices

    uint256 internal constant SIGNER_KEY = 0xA11CE;

    function _setSigner(address signer) internal {
        vm.prank(governance);
        registry.setPriceSigner(signer);
    }

    function _oneAsset(uint256 price, uint64 timestamp) internal view returns (PriceUpdate memory update) {
        address[] memory assets = new address[](1);
        assets[0] = stock;
        uint256[] memory prices = new uint256[](1);
        prices[0] = price;
        update = PriceUpdate({assets: assets, prices: prices, timestamp: timestamp});
    }

    function _signWith(uint256 key, PriceUpdate memory update) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, registry.hashPriceUpdate(update));
        return abi.encodePacked(r, s, v);
    }

    function test_setPriceSigner_governanceCanSet() public {
        address signer = vm.addr(SIGNER_KEY);
        vm.expectEmit(address(registry));
        emit AssetRegistry.PriceSignerSet(address(0), signer);
        _setSigner(signer);
        assertEq(registry.priceSigner(), signer);
    }

    function test_setPriceSigner_revertsForNonGovernance() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, guardian));
        vm.prank(guardian);
        registry.setPriceSigner(guardian);
    }

    function test_setPriceSigner_revertsOnZeroAddress() public {
        vm.expectRevert(AssetRegistry.ZeroAddress.selector);
        vm.prank(governance);
        registry.setPriceSigner(address(0));
    }

    function test_checkPrices_acceptsFreshSignedPrices() public {
        vm.warp(1_800_000_000);
        _setSigner(vm.addr(SIGNER_KEY));
        PriceUpdate memory update = _oneAsset(335e18, uint64(block.timestamp));
        registry.checkPrices(update, _signWith(SIGNER_KEY, update));
    }

    function test_checkPrices_acceptsExactlyMaxAge() public {
        vm.warp(1_800_000_000);
        _setSigner(vm.addr(SIGNER_KEY));
        PriceUpdate memory update = _oneAsset(335e18, uint64(block.timestamp - 60));
        registry.checkPrices(update, _signWith(SIGNER_KEY, update));
    }

    function test_checkPrices_rejectsOlderThanMaxAge() public {
        vm.warp(1_800_000_000);
        _setSigner(vm.addr(SIGNER_KEY));
        PriceUpdate memory update = _oneAsset(335e18, uint64(block.timestamp - 61));
        bytes memory signature = _signWith(SIGNER_KEY, update);
        vm.expectRevert(
            abi.encodeWithSelector(AssetRegistry.StalePrices.selector, uint64(block.timestamp - 61))
        );
        registry.checkPrices(update, signature);
    }

    function test_checkPrices_rejectsFutureTimestamp() public {
        vm.warp(1_800_000_000);
        _setSigner(vm.addr(SIGNER_KEY));
        PriceUpdate memory update = _oneAsset(335e18, uint64(block.timestamp + 1));
        bytes memory signature = _signWith(SIGNER_KEY, update);
        vm.expectRevert(
            abi.encodeWithSelector(AssetRegistry.StalePrices.selector, uint64(block.timestamp + 1))
        );
        registry.checkPrices(update, signature);
    }

    function test_checkPrices_rejectsWrongSigner() public {
        vm.warp(1_800_000_000);
        _setSigner(vm.addr(SIGNER_KEY));
        PriceUpdate memory update = _oneAsset(335e18, uint64(block.timestamp));
        bytes memory signature = _signWith(0xBAD, update);
        vm.expectRevert(AssetRegistry.InvalidPriceSignature.selector);
        registry.checkPrices(update, signature);
    }

    function test_checkPrices_rejectsTamperedPrice() public {
        vm.warp(1_800_000_000);
        _setSigner(vm.addr(SIGNER_KEY));
        PriceUpdate memory update = _oneAsset(335e18, uint64(block.timestamp));
        bytes memory signature = _signWith(SIGNER_KEY, update);
        update.prices[0] = 1e18;
        vm.expectRevert(AssetRegistry.InvalidPriceSignature.selector);
        registry.checkPrices(update, signature);
    }

    function test_checkPrices_rejectsWhenNoSignerSet() public {
        vm.warp(1_800_000_000);
        PriceUpdate memory update = _oneAsset(335e18, uint64(block.timestamp));
        bytes memory signature = _signWith(SIGNER_KEY, update);
        vm.expectRevert(AssetRegistry.InvalidPriceSignature.selector);
        registry.checkPrices(update, signature);
    }

    function test_checkPrices_rejectsGarbageSignature() public {
        vm.warp(1_800_000_000);
        _setSigner(vm.addr(SIGNER_KEY));
        PriceUpdate memory update = _oneAsset(335e18, uint64(block.timestamp));
        vm.expectRevert(AssetRegistry.InvalidPriceSignature.selector);
        registry.checkPrices(update, hex"1234");
    }

    function test_checkPrices_rejectsLengthMismatch() public {
        vm.warp(1_800_000_000);
        _setSigner(vm.addr(SIGNER_KEY));
        PriceUpdate memory update = _oneAsset(335e18, uint64(block.timestamp));
        update.prices = new uint256[](2);
        vm.expectRevert(AssetRegistry.LengthMismatch.selector);
        registry.checkPrices(update, "");
    }

    /// @dev Signed off-chain with `cast wallet sign --data` (standard EIP-712 typed data), key 0xa1,
    ///      for this registry's address on chain 31337. Proves the backend can sign with ordinary
    ///      tooling and that array fields are encoded the standard way.
    function test_checkPrices_acceptsSignatureFromStandardTooling() public {
        assertEq(
            address(registry),
            0x2e234DAe75C793f67A35089C9d99245E1C58470b,
            "registry address the vector was signed for"
        );
        _setSigner(0xd2431CA38735C2fd438e2cAa23F094191D89675b);

        address[] memory assets = new address[](2);
        assets[0] = 0x1111111111111111111111111111111111111111;
        assets[1] = 0x2222222222222222222222222222222222222222;
        uint256[] memory prices = new uint256[](2);
        prices[0] = 335.13e18;
        prices[1] = 180.5e18;
        vm.warp(1_800_000_000);

        registry.checkPrices(
            PriceUpdate({assets: assets, prices: prices, timestamp: 1_800_000_000}),
            hex"b6e9d8fb3c025491908aebc8d76f18d5894561ebb68e211427de3db1060f07c553b4013839eb51db36d4598774ec7f9e51ce97801abb1e9335b2602062d33b9f1b"
        );
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `forge test --match-contract AssetRegistryTest`
Expected: compilation fails — `PriceUpdate` not found in `src/AssetRegistry.sol`.

- [ ] **Step 3: Write the implementation**

Replace `contracts/src/AssetRegistry.sol` with:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

struct PriceUpdate {
    address[] assets;
    uint256[] prices;
    uint64 timestamp;
}

/// @notice Rules shared by every vault: which tokens and routers are permitted, which token is
///         money, and who the guardian is. The owner is governance (a timelock in production),
///         so every change here is slow on purpose. The guardian is the fast emergency role.
contract AssetRegistry is Ownable2Step, EIP712 {
    uint256 public constant MAX_PRICE_AGE = 60;
    bytes32 public constant PRICE_UPDATE_TYPEHASH =
        keccak256("PriceUpdate(address[] assets,uint256[] prices,uint64 timestamp)");
    address public priceSigner;
    error InvalidPriceSignature();
    error StalePrices(uint64 timestamp);
    error LengthMismatch();
    event PriceSignerSet(address indexed from, address indexed to);

    /// @notice The stablecoin every vault is seeded and subscribed in. Fixed at deploy.
    address public immutable settlementToken;

    /// @notice Can activate, pause and unpause vaults without a delay.
    address public guardian;

    mapping(address asset => bool allowed) public isAsset;
    mapping(address router => bool allowed) public isRouter;

    event GuardianSet(address indexed from, address indexed to);
    event AssetSet(address indexed asset, bool allowed);
    event RouterSet(address indexed router, bool allowed);

    error ZeroAddress();
    error SettlementTokenFixed();
    error RenounceDisabled();

    constructor(address governance, address guardian_, address settlementToken_)
        Ownable(governance)
        EIP712("Folio Lab", "1")
    {
        if (guardian_ == address(0) || settlementToken_ == address(0)) {
            revert ZeroAddress();
        }
        settlementToken = settlementToken_;
        guardian = guardian_;
        isAsset[settlementToken_] = true;
        emit GuardianSet(address(0), guardian_);
        emit AssetSet(settlementToken_, true);
    }

    function setGuardian(address newGuardian) external onlyOwner {
        if (newGuardian == address(0)) revert ZeroAddress();
        emit GuardianSet(guardian, newGuardian);
        guardian = newGuardian;
    }

    /// @dev The settlement token can never be removed: vaults must always be able to hold it.
    function setAsset(address asset, bool allowed) external onlyOwner {
        if (asset == address(0)) revert ZeroAddress();
        if (asset == settlementToken) revert SettlementTokenFixed();
        isAsset[asset] = allowed;
        emit AssetSet(asset, allowed);
    }

    function setRouter(address router, bool allowed) external onlyOwner {
        if (router == address(0)) revert ZeroAddress();
        isRouter[router] = allowed;
        emit RouterSet(router, allowed);
    }

    function setPriceSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        emit PriceSignerSet(priceSigner, newSigner);
        priceSigner = newSigner;
    }

    function hashPriceUpdate(PriceUpdate calldata update) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    PRICE_UPDATE_TYPEHASH,
                    keccak256(abi.encodePacked(update.assets)),
                    keccak256(abi.encodePacked(update.prices)),
                    update.timestamp
                )
            )
        );
    }

    function checkPrices(PriceUpdate calldata update, bytes calldata signature) external view {
        if (update.assets.length != update.prices.length) revert LengthMismatch();
        if (update.timestamp > block.timestamp || block.timestamp - update.timestamp > MAX_PRICE_AGE) {
            revert StalePrices(update.timestamp);
        }
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(hashPriceUpdate(update), signature);
        if (err != ECDSA.RecoverError.NoError || signer != priceSigner) revert InvalidPriceSignature();
    }

    /// @dev An ownerless registry could never rotate the guardian or change an allowlist again.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `forge fmt && forge test --match-contract AssetRegistryTest`
Expected: 29 tests pass, 0 fail. Then `forge test`: every other suite still passes (they do not use the new code).

---

### Task 2: FolioVault — deposit, redeem, pause

**Files:**
- Create: `contracts/test/helpers/FolioVaultHarness.sol`
- Create: `contracts/test/helpers/VaultFixture.sol`
- Create: `contracts/test/FolioVaultRedeem.t.sol`
- Create: `contracts/test/FolioVaultDeposit.t.sol`
- Modify (replace whole file): `contracts/src/FolioVault.sol`

**Interfaces:**
- Consumes: `PriceUpdate`, `AssetRegistry.checkPrices`, `hashPriceUpdate`, `setPriceSigner`, `guardian()` from Task 1; `MockERC20`, `MockFeeERC20` from `test/mocks/MockERC20.sol`.
- Produces:
  - `function deposit(uint256 amount, PriceUpdate calldata prices, bytes calldata signature, uint256 minShares) external returns (uint256 shares)`
  - `function redeem(uint256 shares, address to) external returns (address[] memory assets, uint256[] memory amounts)`
  - `function pause() external`, `function unpause() external` (guardian)
  - `event Deposited(address indexed investor, uint256 amount, uint256 shares, uint256 vaultValue, uint64 priceTimestamp)`
  - `event Redeemed(address indexed investor, uint256 shares, address[] assets, uint256[] amounts)`
  - errors `MissingPrice(address)`, `ZeroPrice(address)`, `EmptyVault()`, `ZeroShares()`, `SlippageTooHigh(uint256 shares, uint256 minShares)`, `NothingToRedeem()`, `DeadSharesLocked()`
  - `EnumerableSet.AddressSet internal _held` (was `private`), so `FolioVaultHarness` can add holdings
  - test helpers: `FolioVaultHarness(AssetRegistry, address manager)` with `addHeldAsset(address)` and `sendOut(IERC20, address, uint256)`; abstract `VaultFixture` with `_seedAndActivate`, `_simulateBuy`, `_aaplPrice`, `_sign`, `_deposit`

- [ ] **Step 1: Write the test harness**

Create `contracts/test/helpers/FolioVaultHarness.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {AssetRegistry} from "../../src/AssetRegistry.sol";
import {FolioVault} from "../../src/FolioVault.sol";

/// @dev FolioVault plus two test-only hooks that stand in for a manager trade until SC-04
///      builds `rebalance`. Never deployed outside tests.
contract FolioVaultHarness is FolioVault {
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20;

    constructor(AssetRegistry registry_, address manager_)
        FolioVault(registry_, manager_, "Folio Test", "fTST")
    {}

    /// @dev The buy side of a trade: the vault now counts `asset` as a holding.
    function addHeldAsset(address asset) external {
        _held.add(asset);
    }

    /// @dev The sell side of a trade: tokens leave the vault.
    function sendOut(IERC20 token, address to, uint256 amount) external {
        token.safeTransfer(to, amount);
    }
}
```

- [ ] **Step 2: Write the shared fixture**

Create `contracts/test/helpers/VaultFixture.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {AssetRegistry, PriceUpdate} from "../../src/AssetRegistry.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {FolioVaultHarness} from "./FolioVaultHarness.sol";

/// @dev Shared setup for deposit and redeem tests: a registry with a price signer, an allowed
///      stock token, and a harness vault.
abstract contract VaultFixture is Test {
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 internal constant DEAD_SHARES = 1e15;
    uint256 internal constant SIGNER_KEY = 0xA11CE;

    address internal priceSigner = vm.addr(SIGNER_KEY);
    address internal governance = makeAddr("governance");
    address internal guardian = makeAddr("guardian");
    address internal manager = makeAddr("manager");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal mallory = makeAddr("mallory");
    address internal sink = makeAddr("sink");

    MockERC20 internal usdt;
    MockERC20 internal aapl;
    AssetRegistry internal registry;
    FolioVaultHarness internal vault;

    function setUp() public virtual {
        vm.warp(1_800_000_000);
        usdt = new MockERC20("Tether USD", "USDT", 18);
        aapl = new MockERC20("Apple (Ondo)", "AAPLon", 18);
        registry = new AssetRegistry(governance, guardian, address(usdt));
        vm.startPrank(governance);
        registry.setAsset(address(aapl), true);
        registry.setPriceSigner(priceSigner);
        vm.stopPrank();
        vault = new FolioVaultHarness(registry, manager);
    }

    /// @dev Bob seeds `amount` USDT, then the guardian activates.
    function _seedAndActivate(uint256 amount) internal {
        usdt.mint(bob, amount);
        vm.prank(bob);
        usdt.approve(address(vault), amount);
        vm.prank(bob);
        vault.seed(amount);
        vm.prank(guardian);
        vault.activate();
    }

    /// @dev Stand-in for a manager trade (SC-04): `usdtOut` leaves, `aaplIn` arrives.
    function _simulateBuy(uint256 usdtOut, uint256 aaplIn) internal {
        vault.sendOut(usdt, sink, usdtOut);
        aapl.mint(address(vault), aaplIn);
        vault.addHeldAsset(address(aapl));
    }

    /// @dev A fresh AAPL price signed by the price signer.
    function _aaplPrice(uint256 price)
        internal
        view
        returns (PriceUpdate memory update, bytes memory signature)
    {
        address[] memory assets = new address[](1);
        assets[0] = address(aapl);
        uint256[] memory prices = new uint256[](1);
        prices[0] = price;
        return _sign(SIGNER_KEY, assets, prices, uint64(block.timestamp));
    }

    function _sign(uint256 key, address[] memory assets, uint256[] memory prices, uint64 timestamp)
        internal
        view
        returns (PriceUpdate memory update, bytes memory signature)
    {
        update = PriceUpdate({assets: assets, prices: prices, timestamp: timestamp});
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, registry.hashPriceUpdate(update));
        signature = abi.encodePacked(r, s, v);
    }

    /// @dev `who` deposits `amount` USDT with no minimum-shares bound.
    function _deposit(address who, uint256 amount, PriceUpdate memory update, bytes memory signature)
        internal
        returns (uint256 shares)
    {
        usdt.mint(who, amount);
        vm.prank(who);
        usdt.approve(address(vault), amount);
        vm.prank(who);
        shares = vault.deposit(amount, update, signature, 0);
    }
}
```

- [ ] **Step 3: Write the failing redeem tests**

Create `contracts/test/FolioVaultRedeem.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {FolioVault} from "../src/FolioVault.sol";
import {FolioVaultHarness} from "./helpers/FolioVaultHarness.sol";
import {VaultFixture} from "./helpers/VaultFixture.sol";

contract FolioVaultRedeemTest is VaultFixture {
    uint256 internal constant BOB_SHARES = 1_000e18 - DEAD_SHARES;

    function setUp() public override {
        super.setUp();
        // Bob seeds 1,000; the manager has bought: vault holds 600 USDT + 2 AAPL, 1,000 shares.
        _seedAndActivate(1_000e18);
        _simulateBuy(400e18, 2e18);
    }

    function test_redeem_paysTheSamePercentOfEveryAsset() public {
        vm.prank(bob);
        (address[] memory assets, uint256[] memory amounts) = vault.redeem(100e18, bob); // 10%

        assertEq(assets.length, 2);
        assertEq(assets[0], address(usdt));
        assertEq(assets[1], address(aapl));
        assertEq(amounts[0], 60e18, "10% of 600 USDT");
        assertEq(amounts[1], 0.2e18, "10% of 2 AAPL");
        assertEq(usdt.balanceOf(bob), 60e18);
        assertEq(aapl.balanceOf(bob), 0.2e18);
        assertEq(usdt.balanceOf(address(vault)), 540e18);
        assertEq(aapl.balanceOf(address(vault)), 1.8e18);
    }

    function test_redeem_burnsTheShares() public {
        vm.prank(bob);
        vault.redeem(100e18, bob);

        assertEq(vault.balanceOf(bob), BOB_SHARES - 100e18);
        assertEq(vault.totalSupply(), 900e18);
    }

    function test_redeem_emitsRedeemed() public {
        address[] memory assets = new address[](2);
        assets[0] = address(usdt);
        assets[1] = address(aapl);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 60e18;
        amounts[1] = 0.2e18;

        vm.expectEmit(address(vault));
        emit FolioVault.Redeemed(bob, 100e18, assets, amounts);
        vm.prank(bob);
        vault.redeem(100e18, bob);
    }

    function test_redeem_canPayAnotherAddress() public {
        vm.prank(bob);
        vault.redeem(100e18, carol);

        assertEq(usdt.balanceOf(carol), 60e18);
        assertEq(aapl.balanceOf(carol), 0.2e18);
        assertEq(usdt.balanceOf(bob), 0);
        assertEq(vault.balanceOf(bob), BOB_SHARES - 100e18);
    }

    function test_redeem_fullExitLeavesDeadSharesBacked() public {
        vm.prank(bob);
        vault.redeem(BOB_SHARES, bob);

        assertEq(vault.totalSupply(), DEAD_SHARES, "only dead shares remain");
        assertEq(usdt.balanceOf(bob), 599.9994e18);
        assertEq(aapl.balanceOf(bob), 1.999998e18);
        assertEq(usdt.balanceOf(address(vault)), 0.0006e18, "dead shares' slice stays");
        assertEq(aapl.balanceOf(address(vault)), 0.000002e18);
    }

    function test_redeem_roundsDownSoDustStays() public {
        vm.prank(bob);
        (, uint256[] memory amounts) = vault.redeem(1, bob); // 1 wei of shares

        assertEq(amounts[0], 0, "600e18 * 1 / 1000e18 rounds to 0");
        assertEq(amounts[1], 0);
        assertEq(vault.totalSupply(), 1_000e18 - 1, "the share is still burned");
        assertEq(usdt.balanceOf(address(vault)), 600e18);
    }

    function test_redeem_worksWhilePaused() public {
        vm.prank(guardian);
        vault.pause();

        vm.prank(bob);
        vault.redeem(100e18, bob);

        assertEq(usdt.balanceOf(bob), 60e18);
    }

    function test_redeem_seedInvestorCanRecoverBeforeActivation() public {
        FolioVaultHarness fresh = new FolioVaultHarness(registry, manager);
        usdt.mint(carol, 100e18);
        vm.prank(carol);
        usdt.approve(address(fresh), 100e18);
        vm.prank(carol);
        uint256 shares = fresh.seed(100e18);

        vm.prank(carol);
        fresh.redeem(shares, carol);

        assertEq(usdt.balanceOf(carol), 100e18 - DEAD_SHARES, "all but the dead shares' slice");
        assertEq(uint8(fresh.state()), uint8(FolioVault.VaultState.SEEDED));
    }

    function test_redeem_revertsOnZeroShares() public {
        vm.expectRevert(FolioVault.NothingToRedeem.selector);
        vm.prank(bob);
        vault.redeem(0, bob);
    }

    function test_redeem_revertsOnZeroRecipient() public {
        vm.expectRevert(FolioVault.ZeroAddress.selector);
        vm.prank(bob);
        vault.redeem(100e18, address(0));
    }

    function test_redeem_revertsBeyondBalance() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientBalance.selector, bob, BOB_SHARES, BOB_SHARES + 1
            )
        );
        vm.prank(bob);
        vault.redeem(BOB_SHARES + 1, bob);
    }

    function test_redeem_revertsForAccountWithNoShares() public {
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, mallory, 0, 1e18)
        );
        vm.prank(mallory);
        vault.redeem(1e18, mallory);
    }

    function test_redeem_deadSharesAreLocked() public {
        vm.expectRevert(FolioVault.DeadSharesLocked.selector);
        vm.prank(DEAD);
        vault.redeem(DEAD_SHARES, mallory);
    }

    function testFuzz_redeem_isExactlyProportional(uint256 shares) public {
        shares = bound(shares, 1, BOB_SHARES);
        uint256 supply = vault.totalSupply();

        vm.prank(bob);
        (, uint256[] memory amounts) = vault.redeem(shares, bob);

        assertEq(amounts[0], 600e18 * shares / supply);
        assertEq(amounts[1], 2e18 * shares / supply);
        assertEq(usdt.balanceOf(address(vault)), 600e18 - amounts[0], "nothing else left the vault");
        assertEq(aapl.balanceOf(address(vault)), 2e18 - amounts[1]);
    }
}
```

- [ ] **Step 4: Write the failing deposit and pause tests**

Create `contracts/test/FolioVaultDeposit.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AssetRegistry, PriceUpdate} from "../src/AssetRegistry.sol";
import {FolioVault} from "../src/FolioVault.sol";
import {MockERC20, MockFeeERC20} from "./mocks/MockERC20.sol";
import {FolioVaultHarness} from "./helpers/FolioVaultHarness.sol";
import {VaultFixture} from "./helpers/VaultFixture.sol";

contract FolioVaultDepositTest is VaultFixture {
    function setUp() public override {
        super.setUp();
        _seedAndActivate(1_000e18);
    }

    // ---- pricing

    function test_deposit_cashOnlyVault_mintsOneSharePerUnit() public {
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(200e18);

        uint256 shares = _deposit(carol, 100e18, update, signature);

        assertEq(shares, 100e18);
        assertEq(vault.balanceOf(carol), 100e18);
        assertEq(vault.totalSupply(), 1_100e18);
    }

    function test_deposit_afterStocksRise_mintsAtFairPrice() public {
        // Vault: 600 USDT + 2 AAPL. At $300 that is 600 + 600 = 1,200 for 1,000 shares = $1.20.
        _simulateBuy(400e18, 2e18);
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(300e18);

        uint256 shares = _deposit(carol, 120e18, update, signature);

        assertEq(shares, 100e18, "120 / 1.20 = 100 shares");
        // After: 720 USDT + 2 AAPL = 1,320 for 1,100 shares = still $1.20.
        assertEq(usdt.balanceOf(address(vault)), 720e18);
        assertEq(vault.totalSupply(), 1_100e18);
    }

    function test_deposit_usdtStaysIdleInVault() public {
        _simulateBuy(400e18, 2e18);
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(300e18);

        _deposit(carol, 120e18, update, signature);

        assertEq(usdt.balanceOf(address(vault)), 720e18, "deposit sits as idle USDT");
        assertEq(aapl.balanceOf(address(vault)), 2e18, "no stock was bought");
        assertEq(vault.heldAssets().length, 2, "no new holding");
    }

    function test_deposit_emitsDeposited() public {
        _simulateBuy(400e18, 2e18);
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(300e18);
        usdt.mint(carol, 120e18);
        vm.prank(carol);
        usdt.approve(address(vault), 120e18);

        vm.expectEmit(address(vault));
        emit FolioVault.Deposited(carol, 120e18, 100e18, 1_200e18, uint64(block.timestamp));
        vm.prank(carol);
        vault.deposit(120e18, update, signature, 0);
    }

    function test_deposit_ignoresPricesForAssetsNotHeld() public {
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(1);

        uint256 shares = _deposit(carol, 100e18, update, signature);

        assertEq(shares, 100e18, "AAPL is not held, so its price is irrelevant");
    }

    function test_deposit_settlementTokenIsAlwaysAtPar() public {
        address[] memory assets = new address[](1);
        assets[0] = address(usdt);
        uint256[] memory prices = new uint256[](1);
        prices[0] = 2e18;
        (PriceUpdate memory update, bytes memory signature) =
            _sign(SIGNER_KEY, assets, prices, uint64(block.timestamp));

        uint256 shares = _deposit(carol, 100e18, update, signature);

        assertEq(shares, 100e18, "a signed USDT price is ignored");
    }

    function test_deposit_stockWithSixDecimals() public {
        MockERC20 nvda = new MockERC20("Nvidia (Ondo)", "NVDAon", 6);
        vault.sendOut(usdt, sink, 400e18);
        nvda.mint(address(vault), 2e6);
        vault.addHeldAsset(address(nvda));

        address[] memory assets = new address[](1);
        assets[0] = address(nvda);
        uint256[] memory prices = new uint256[](1);
        prices[0] = 300e18;
        (PriceUpdate memory update, bytes memory signature) =
            _sign(SIGNER_KEY, assets, prices, uint64(block.timestamp));

        uint256 shares = _deposit(carol, 120e18, update, signature);

        assertEq(shares, 100e18, "2 NVDA at $300 valued from its own decimals");
    }

    function test_deposit_feeOnTransfer_mintsFromReceived() public {
        MockFeeERC20 fee = new MockFeeERC20();
        AssetRegistry r = new AssetRegistry(governance, guardian, address(fee));
        vm.prank(governance);
        r.setPriceSigner(priceSigner);
        FolioVaultHarness v = new FolioVaultHarness(r, manager);

        fee.mint(bob, 1_000e18);
        vm.prank(bob);
        fee.approve(address(v), 1_000e18);
        vm.prank(bob);
        v.seed(1_000e18); // 990 arrives -> 990 shares
        vm.prank(guardian);
        v.activate();

        address[] memory assets = new address[](0);
        uint256[] memory prices = new uint256[](0);
        PriceUpdate memory update =
            PriceUpdate({assets: assets, prices: prices, timestamp: uint64(block.timestamp)});
        (uint8 sv, bytes32 sr, bytes32 ss) = vm.sign(SIGNER_KEY, r.hashPriceUpdate(update));

        fee.mint(carol, 100e18);
        vm.prank(carol);
        fee.approve(address(v), 100e18);
        vm.prank(carol);
        uint256 shares = v.deposit(100e18, update, abi.encodePacked(sr, ss, sv), 0);

        assertEq(shares, 99e18, "shares follow the 99 that arrived");
    }

    function testFuzz_deposit_neverLowersValuePerShare(uint256 price, uint256 amount) public {
        _simulateBuy(400e18, 2e18);
        price = bound(price, 1e15, 1e24);
        amount = bound(amount, 1e18, 1e30);
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(price);
        uint256 valueBefore = 600e18 + 2 * price;
        uint256 supplyBefore = vault.totalSupply();

        uint256 shares = _deposit(carol, amount, update, signature);

        // valueAfter / supplyAfter >= valueBefore / supplyBefore, cross-multiplied.
        assertGe((valueBefore + amount) * supplyBefore, valueBefore * (supplyBefore + shares));
    }

    function testFuzz_depositThenRedeem_neverProfits(uint256 price, uint256 amount) public {
        _simulateBuy(400e18, 2e18);
        price = bound(price, 1e15, 1e24);
        amount = bound(amount, 1e18, 1e30);
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(price);

        uint256 shares = _deposit(carol, amount, update, signature);
        vm.prank(carol);
        (, uint256[] memory amounts) = vault.redeem(shares, carol);

        // amounts[0] is USDT, amounts[1] is AAPL, valued at the same signed price.
        assertLe(amounts[0] + amounts[1] * price / 1e18, amount);
    }

    // ---- rejections

    function test_deposit_revertsWhenHeldStockHasNoPrice() public {
        _simulateBuy(400e18, 2e18);
        address[] memory assets = new address[](0);
        uint256[] memory prices = new uint256[](0);
        (PriceUpdate memory update, bytes memory signature) =
            _sign(SIGNER_KEY, assets, prices, uint64(block.timestamp));
        usdt.mint(carol, 100e18);
        vm.prank(carol);
        usdt.approve(address(vault), 100e18);

        vm.expectRevert(abi.encodeWithSelector(FolioVault.MissingPrice.selector, address(aapl)));
        vm.prank(carol);
        vault.deposit(100e18, update, signature, 0);
    }

    function test_deposit_revertsOnZeroPrice() public {
        _simulateBuy(400e18, 2e18);
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(0);
        usdt.mint(carol, 100e18);
        vm.prank(carol);
        usdt.approve(address(vault), 100e18);

        vm.expectRevert(abi.encodeWithSelector(FolioVault.ZeroPrice.selector, address(aapl)));
        vm.prank(carol);
        vault.deposit(100e18, update, signature, 0);
    }

    function test_deposit_revertsOnStalePrices() public {
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(300e18);
        vm.warp(block.timestamp + 61);
        usdt.mint(carol, 100e18);
        vm.prank(carol);
        usdt.approve(address(vault), 100e18);

        vm.expectRevert(abi.encodeWithSelector(AssetRegistry.StalePrices.selector, update.timestamp));
        vm.prank(carol);
        vault.deposit(100e18, update, signature, 0);
    }

    function test_deposit_revertsOnPricesSignedByAnyoneElse() public {
        _simulateBuy(400e18, 2e18);
        address[] memory assets = new address[](1);
        assets[0] = address(aapl);
        uint256[] memory prices = new uint256[](1);
        prices[0] = 1e18; // Mallory claims AAPL is worth $1
        (PriceUpdate memory update, bytes memory signature) =
            _sign(0xBAD, assets, prices, uint64(block.timestamp));
        usdt.mint(mallory, 100e18);
        vm.prank(mallory);
        usdt.approve(address(vault), 100e18);

        vm.expectRevert(AssetRegistry.InvalidPriceSignature.selector);
        vm.prank(mallory);
        vault.deposit(100e18, update, signature, 0);
    }

    function test_deposit_revertsBelowMinShares() public {
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(300e18);
        usdt.mint(carol, 100e18);
        vm.prank(carol);
        usdt.approve(address(vault), 100e18);

        vm.expectRevert(abi.encodeWithSelector(FolioVault.SlippageTooHigh.selector, 100e18, 101e18));
        vm.prank(carol);
        vault.deposit(100e18, update, signature, 101e18);
    }

    function test_deposit_revertsWhenNothingArrives() public {
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(300e18);

        vm.expectRevert(FolioVault.ZeroShares.selector);
        vm.prank(carol);
        vault.deposit(0, update, signature, 0);
    }

    function test_deposit_revertsWhenSeededButNotActive() public {
        FolioVaultHarness fresh = new FolioVaultHarness(registry, manager);
        usdt.mint(bob, 100e18);
        vm.prank(bob);
        usdt.approve(address(fresh), 100e18);
        vm.prank(bob);
        fresh.seed(100e18);
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(300e18);

        vm.expectRevert(abi.encodeWithSelector(FolioVault.WrongState.selector, FolioVault.VaultState.SEEDED));
        vm.prank(carol);
        fresh.deposit(100e18, update, signature, 0);
    }

    // ---- pause

    function test_pause_guardianPausesAndUnpauses() public {
        vm.expectEmit(address(vault));
        emit FolioVault.StateChanged(FolioVault.VaultState.ACTIVE, FolioVault.VaultState.PAUSED);
        vm.prank(guardian);
        vault.pause();
        assertEq(uint8(vault.state()), uint8(FolioVault.VaultState.PAUSED));

        vm.expectEmit(address(vault));
        emit FolioVault.StateChanged(FolioVault.VaultState.PAUSED, FolioVault.VaultState.ACTIVE);
        vm.prank(guardian);
        vault.unpause();
        assertEq(uint8(vault.state()), uint8(FolioVault.VaultState.ACTIVE));
    }

    function test_pause_blocksDeposits() public {
        vm.prank(guardian);
        vault.pause();
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(300e18);
        usdt.mint(carol, 100e18);
        vm.prank(carol);
        usdt.approve(address(vault), 100e18);

        vm.expectRevert(abi.encodeWithSelector(FolioVault.WrongState.selector, FolioVault.VaultState.PAUSED));
        vm.prank(carol);
        vault.deposit(100e18, update, signature, 0);
    }

    function test_pause_revertsForManager() public {
        vm.expectRevert(FolioVault.NotGuardian.selector);
        vm.prank(manager);
        vault.pause();
    }

    function test_pause_revertsWhenAlreadyPaused() public {
        vm.prank(guardian);
        vault.pause();
        vm.expectRevert(abi.encodeWithSelector(FolioVault.WrongState.selector, FolioVault.VaultState.PAUSED));
        vm.prank(guardian);
        vault.pause();
    }

    function test_unpause_revertsForManager() public {
        vm.prank(guardian);
        vault.pause();
        vm.expectRevert(FolioVault.NotGuardian.selector);
        vm.prank(manager);
        vault.unpause();
    }

    function test_unpause_revertsWhenNotPaused() public {
        vm.expectRevert(abi.encodeWithSelector(FolioVault.WrongState.selector, FolioVault.VaultState.ACTIVE));
        vm.prank(guardian);
        vault.unpause();
    }
}
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `forge test --match-contract "FolioVault(Deposit|Redeem)Test"`
Expected: compilation fails — `_held` is private / `Member "deposit" not found` / `Member "redeem" not found`.

- [ ] **Step 6: Write the implementation**

Replace `contracts/src/FolioVault.sol` with:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {AssetRegistry, PriceUpdate} from "./AssetRegistry.sol";

/// @notice A pooled portfolio. Holds the assets and is itself the ERC-20 share token.
///         Deposits are priced from backend-signed stock prices (spec §1, §8.0); redemption is
///         proportional and needs no price.
contract FolioVault is ERC20, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    enum VaultState {
        DRAFT,
        SEEDED,
        ACTIVE,
        PAUSED,
        CLOSED
    }

    /// @notice Shares locked forever at seed so `totalSupply` can never return to zero.
    uint256 public constant DEAD_SHARES = 1e15;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    uint256 internal constant MIN_SEED_UNITS = 10;

    AssetRegistry public immutable registry;
    IERC20 public immutable settlementToken;
    /// @notice One whole settlement token, in its own smallest units.
    uint256 public immutable settlementUnit;
    uint256 public immutable minSeed;

    address public manager;
    VaultState public state;

    /// @dev Internal so the test harness can stand in for manager trades until SC-04.
    EnumerableSet.AddressSet internal _held;

    event Seeded(address indexed investor, uint256 amount, uint256 shares);
    event StateChanged(VaultState from, VaultState to);
    event Deposited(
        address indexed investor, uint256 amount, uint256 shares, uint256 vaultValue, uint64 priceTimestamp
    );
    event Redeemed(address indexed investor, uint256 shares, address[] assets, uint256[] amounts);

    error ZeroAddress();
    error UnsupportedDecimals(uint8 decimals);
    error NotGuardian();
    error WrongState(VaultState current);
    error BelowMinimumSeed(uint256 received, uint256 minimum);
    error TransfersDisabled();
    error MissingPrice(address asset);
    error ZeroPrice(address asset);
    error EmptyVault();
    error ZeroShares();
    error SlippageTooHigh(uint256 shares, uint256 minShares);
    error NothingToRedeem();
    error DeadSharesLocked();

    constructor(AssetRegistry registry_, address manager_, string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
    {
        if (manager_ == address(0)) revert ZeroAddress();
        address token = registry_.settlementToken();
        uint8 tokenDecimals = IERC20Metadata(token).decimals();
        if (tokenDecimals > 18) revert UnsupportedDecimals(tokenDecimals);

        registry = registry_;
        manager = manager_;
        settlementToken = IERC20(token);
        settlementUnit = 10 ** tokenDecimals;
        minSeed = MIN_SEED_UNITS * settlementUnit;
    }

    // ---- lifecycle

    /// @notice First deposit. Sets the starting price by convention: 1 share = 1 settlement
    ///         token. Anyone can seed; the seeder does not have to be the manager.
    /// @param amount Settlement tokens to pull from the caller.
    /// @return shares Shares minted to the caller, after `DEAD_SHARES` are taken out.
    function seed(uint256 amount) external nonReentrant returns (uint256 shares) {
        if (state != VaultState.DRAFT) revert WrongState(state);

        // Count what actually arrived, so a token that takes a fee cannot mint unbacked shares.
        uint256 balanceBefore = settlementToken.balanceOf(address(this));
        settlementToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = settlementToken.balanceOf(address(this)) - balanceBefore;
        if (received < minSeed) revert BelowMinimumSeed(received, minSeed);

        // `received >= minSeed` means this is at least 10e18, so subtracting DEAD_SHARES is safe.
        shares = received * 1e18 / settlementUnit - DEAD_SHARES;

        _held.add(address(settlementToken));
        _setState(VaultState.SEEDED);
        _mint(DEAD, DEAD_SHARES);
        _mint(msg.sender, shares);

        emit Seeded(msg.sender, received, shares);
    }

    /// @notice Opens the vault to outside investors.
    function activate() external {
        _onlyGuardian();
        if (state != VaultState.SEEDED) revert WrongState(state);
        _setState(VaultState.ACTIVE);
    }

    /// @notice Emergency brake: stops deposits (and, from SC-04, manager trades).
    ///         Redemption keeps working.
    function pause() external {
        _onlyGuardian();
        if (state != VaultState.ACTIVE) revert WrongState(state);
        _setState(VaultState.PAUSED);
    }

    function unpause() external {
        _onlyGuardian();
        if (state != VaultState.PAUSED) revert WrongState(state);
        _setState(VaultState.ACTIVE);
    }

    // ---- investors

    /// @notice Buy shares at the fair price. The USDT stays in the vault as idle cash until the
    ///         manager invests it.
    /// @param amount Settlement tokens to pull from the caller.
    /// @param prices Stock prices signed by `registry.priceSigner()`, at most 60 seconds old.
    /// @param minShares The caller's own lower bound, in case the price moved.
    /// @return shares Shares minted to the caller.
    function deposit(uint256 amount, PriceUpdate calldata prices, bytes calldata signature, uint256 minShares)
        external
        nonReentrant
        returns (uint256 shares)
    {
        if (state != VaultState.ACTIVE) revert WrongState(state);
        registry.checkPrices(prices, signature);

        // Valued before the deposit arrives, so the newcomer buys in at the current price.
        uint256 valueBefore = _vaultValue(prices);
        if (valueBefore == 0) revert EmptyVault();

        uint256 balanceBefore = settlementToken.balanceOf(address(this));
        settlementToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = settlementToken.balanceOf(address(this)) - balanceBefore;

        shares = Math.mulDiv(received, totalSupply(), valueBefore);
        if (shares == 0) revert ZeroShares();
        if (shares < minShares) revert SlippageTooHigh(shares, minShares);

        _mint(msg.sender, shares);
        emit Deposited(msg.sender, received, shares, valueBefore, prices.timestamp);
    }

    /// @notice Burn shares and receive the same percentage of every asset the vault holds, idle
    ///         USDT included. No price is used, and no state blocks it: exit is always open.
    /// @return assets Every held asset, in `heldAssets()` order.
    /// @return amounts What `to` received of each, rounded down.
    function redeem(uint256 shares, address to)
        external
        nonReentrant
        returns (address[] memory assets, uint256[] memory amounts)
    {
        if (shares == 0) revert NothingToRedeem();
        if (to == address(0)) revert ZeroAddress();
        if (msg.sender == DEAD) revert DeadSharesLocked();

        uint256 supply = totalSupply();
        assets = _held.values();
        amounts = new uint256[](assets.length);
        for (uint256 i; i < assets.length; ++i) {
            amounts[i] = Math.mulDiv(IERC20(assets[i]).balanceOf(address(this)), shares, supply);
        }

        // Burn first: reverts if the caller holds fewer shares, before any token moves.
        _burn(msg.sender, shares);
        for (uint256 i; i < assets.length; ++i) {
            if (amounts[i] != 0) IERC20(assets[i]).safeTransfer(to, amounts[i]);
        }

        emit Redeemed(msg.sender, shares, assets, amounts);
    }

    // ---- internals

    /// @dev Settlement token at par, every other held asset at its signed price. Rounded up, so
    ///      a newcomer can never buy in below the true value.
    function _vaultValue(PriceUpdate calldata prices) internal view returns (uint256 value) {
        address[] memory assets = _held.values();
        for (uint256 i; i < assets.length; ++i) {
            uint256 balance = IERC20(assets[i]).balanceOf(address(this));
            if (assets[i] == address(settlementToken)) {
                value += balance;
            } else {
                uint256 unit = 10 ** IERC20Metadata(assets[i]).decimals();
                value += Math.mulDiv(balance, _priceOf(prices, assets[i]), unit, Math.Rounding.Ceil);
            }
        }
    }

    /// @dev A held asset without a price must never count as worth zero.
    function _priceOf(PriceUpdate calldata prices, address asset) internal pure returns (uint256) {
        for (uint256 i; i < prices.assets.length; ++i) {
            if (prices.assets[i] == asset) {
                if (prices.prices[i] == 0) revert ZeroPrice(asset);
                return prices.prices[i];
            }
        }
        revert MissingPrice(asset);
    }

    function _onlyGuardian() internal view {
        if (msg.sender != registry.guardian()) revert NotGuardian();
    }

    function _setState(VaultState to) internal {
        emit StateChanged(state, to);
        state = to;
    }

    /// @dev Shares can be minted and burned but not moved between accounts (spec §9).
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) revert TransfersDisabled();
        super._update(from, to, value);
    }

    // ---- views

    function heldAssets() external view returns (address[] memory) {
        return _held.values();
    }

    function holdings() external view returns (address[] memory assets, uint256[] memory amounts) {
        assets = _held.values();
        amounts = new uint256[](assets.length);
        for (uint256 i; i < assets.length; ++i) {
            amounts[i] = IERC20(assets[i]).balanceOf(address(this));
        }
    }

    function shareOf(address account) external view returns (uint256) {
        return balanceOf(account);
    }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `forge fmt && forge test --match-contract "FolioVault(Deposit|Redeem)Test"`
Expected: 37 tests pass (23 deposit + 14 redeem), 0 fail.

Run: `forge test`
Expected: every suite passes (the existing `FolioVaultTest` still has 29).

Run: `FOUNDRY_PROFILE=deep forge test --match-test testFuzz`
Expected: all fuzz tests pass at 10,000 runs.

---

### Task 3: Simulation chapters, sizes, docs

**Files:**
- Modify (replace whole file): `contracts/test/Simulation.t.sol`
- Modify: `contracts/README.md` (the `## Status` section)
- Modify: `docs/sc-checklist.md` (Phase 2, Phase 4, Phase 5, "Right now")

**Interfaces:**
- Consumes: everything from Tasks 1–2 through the real `VaultFactory`-made vault (no harness).
- Produces: nothing new.

- [ ] **Step 1: Extend the simulation**

Replace `contracts/test/Simulation.t.sol` with the version below. Chapters 0–7 are unchanged except: `vm.warp` in chapter 0, governance also sets the price signer in chapter 1, and chapter 4's last line. Chapters 8–10 are new.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AssetRegistry, PriceUpdate} from "../src/AssetRegistry.sol";
import {FolioVault} from "../src/FolioVault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @notice A story, not a unit test: several people use the system in order, and the test prints
///         what happens at each step. Run it with:
///
///             forge test --match-contract SimulationTest -vv
///
///         Cast:
///           team     governance (slow admin) and guardian (fast admin)
///           backend  price signer: signs stock prices before every deposit
///           Alice    curator, manages the first vault
///           Bob      first investor, seeds Alice's vault
///           Carol    second investor
///           Dave     curator, manages the second vault
///           Mallory  attacker
contract SimulationTest is Test {
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;

    address internal governance = makeAddr("governance");
    address internal guardian = makeAddr("guardian");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");
    address internal mallory = makeAddr("mallory");

    uint256 internal constant PRICE_SIGNER_KEY = 0xBAC4E2D;
    address internal priceSigner = vm.addr(PRICE_SIGNER_KEY);

    MockERC20 internal usdt;
    MockERC20 internal appleStock;
    address internal router = makeAddr("binanceRouter");

    AssetRegistry internal registry;
    VaultFactory internal factory;
    FolioVault internal aliceVault;
    FolioVault internal daveVault;

    function test_simulation_multiUserStory() public {
        _ch0TeamDeploysTheSystem();
        _ch1GovernanceSetsTheRules();
        _ch2AliceCreatesAVault();
        _ch3BobSeedsIt();
        _ch4CarolIsTooLateToSeed();
        _ch5SharesCannotBeMoved();
        _ch6OnlyTheGuardianActivates();
        _ch7DaveRunsASecondVault();
        _ch8CarolDepositsAfterActivation();
        _ch9PauseBlocksDepositsNotExits();
        _ch10FinalBooks();
    }

    // ---- chapters

    function _ch0TeamDeploysTheSystem() internal {
        _title("0. The team deploys the system");

        vm.warp(1_800_000_000); // a realistic clock, so price timestamps look like real ones
        usdt = new MockERC20("Tether USD", "USDT", 18);
        registry = new AssetRegistry(governance, guardian, address(usdt));
        factory = new VaultFactory(registry);

        assertEq(registry.owner(), governance);
        assertEq(registry.guardian(), guardian);
        assertTrue(registry.isAsset(address(usdt)));

        _say("AssetRegistry and VaultFactory are live.");
        _say("USDT is the money. It is allowed from day one and can never be removed.");
    }

    function _ch1GovernanceSetsTheRules() internal {
        _title("1. Governance decides what vaults may hold and where they may trade");

        appleStock = new MockERC20("Apple (Ondo)", "AAPLon", 18);
        vm.startPrank(governance);
        registry.setAsset(address(appleStock), true);
        registry.setRouter(router, true);
        registry.setPriceSigner(priceSigner);
        vm.stopPrank();

        assertTrue(registry.isAsset(address(appleStock)));
        assertTrue(registry.isRouter(router));
        _say("Governance allowed AAPLon and one router, and named the backend's price signer.");

        MockERC20 scamToken = new MockERC20("Totally Real Apple", "AAPL", 18);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, mallory));
        vm.prank(mallory);
        registry.setAsset(address(scamToken), true);

        assertFalse(registry.isAsset(address(scamToken)));
        _say("Mallory tried to allow her own scam token: REVERTED (she is not governance).");
    }

    function _ch2AliceCreatesAVault() internal {
        _title("2. Alice becomes a curator");

        vm.prank(alice);
        aliceVault = FolioVault(factory.createVault("Alice Tech Fund", "fTECH", alice));

        assertTrue(factory.isVault(address(aliceVault)));
        assertEq(aliceVault.manager(), alice);
        assertEq(uint8(aliceVault.state()), uint8(FolioVault.VaultState.DRAFT));
        assertEq(aliceVault.totalSupply(), 0);

        _say("Alice created 'Alice Tech Fund'. Nobody had to approve that.");
        _say(
            string.concat("Vault state: ", _stateName(aliceVault.state()), ". It is empty and has no shares.")
        );
    }

    function _ch3BobSeedsIt() internal {
        _title("3. Bob puts in the first money (the seed)");

        _fund(bob, aliceVault, 1_000e18);
        vm.prank(bob);
        uint256 bobShares = aliceVault.seed(1_000e18);

        assertEq(bobShares, 1_000e18 - 1e15);
        assertEq(aliceVault.balanceOf(bob), 1_000e18 - 1e15);
        assertEq(aliceVault.balanceOf(DEAD), 1e15);
        assertEq(aliceVault.totalSupply(), 1_000e18);
        assertEq(usdt.balanceOf(address(aliceVault)), 1_000e18);
        assertEq(usdt.balanceOf(bob), 0);
        assertEq(uint8(aliceVault.state()), uint8(FolioVault.VaultState.SEEDED));

        _say("Bob deposited 1000 USDT. 1 share = 1 USDT at the seed.");
        _say(string.concat("Bob's shares:  ", _units(aliceVault.balanceOf(bob))));
        _say(
            string.concat(
                "Dead shares:   ",
                _units(aliceVault.balanceOf(DEAD)),
                "  (locked forever, blocks the inflation attack)"
            )
        );
        _say(string.concat("Total supply:  ", _units(aliceVault.totalSupply())));
        _say(string.concat("Vault state:   ", _stateName(aliceVault.state())));
    }

    function _ch4CarolIsTooLateToSeed() internal {
        _title("4. Carol also wants to seed Alice's vault");

        _fund(carol, aliceVault, 500e18);
        vm.expectRevert(abi.encodeWithSelector(FolioVault.WrongState.selector, FolioVault.VaultState.SEEDED));
        vm.prank(carol);
        aliceVault.seed(500e18);

        assertEq(usdt.balanceOf(carol), 500e18, "Carol keeps her money");
        assertEq(aliceVault.balanceOf(carol), 0);
        _say("REVERTED: a vault is seeded exactly once. Carol still has her 500 USDT.");
        _say("She can deposit normally once the vault is ACTIVE (chapter 8).");
    }

    function _ch5SharesCannotBeMoved() internal {
        _title("5. Bob tries to hand some shares to Carol");

        vm.expectRevert(FolioVault.TransfersDisabled.selector);
        vm.prank(bob);
        // Expected to revert, so the return value is never produced.
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        aliceVault.transfer(carol, 100e18);

        assertEq(aliceVault.balanceOf(bob), 1_000e18 - 1e15);
        assertEq(aliceVault.balanceOf(carol), 0);
        _say("REVERTED: shares can be minted and burned, never transferred.");
    }

    function _ch6OnlyTheGuardianActivates() internal {
        _title("6. Opening the vault to the public");

        vm.expectRevert(FolioVault.NotGuardian.selector);
        vm.prank(alice);
        aliceVault.activate();
        _say("Alice tried to activate her own vault: REVERTED (the manager is not the guardian).");

        vm.expectRevert(FolioVault.NotGuardian.selector);
        vm.prank(mallory);
        aliceVault.activate();
        _say("Mallory tried too: REVERTED.");

        vm.prank(guardian);
        aliceVault.activate();

        assertEq(uint8(aliceVault.state()), uint8(FolioVault.VaultState.ACTIVE));
        _say(string.concat("The guardian activated it. Vault state: ", _stateName(aliceVault.state())));
    }

    function _ch7DaveRunsASecondVault() internal {
        _title("7. Dave starts a second, separate vault");

        vm.prank(dave);
        daveVault = FolioVault(factory.createVault("Dave Dividend Fund", "fDIV", dave));
        assertEq(factory.vaultCount(), 2);

        // Carol approved Alice's vault earlier; she now approves Dave's and tries a tiny seed.
        vm.prank(carol);
        usdt.approve(address(daveVault), 500e18);
        vm.expectRevert(abi.encodeWithSelector(FolioVault.BelowMinimumSeed.selector, 5e18, 10e18));
        vm.prank(carol);
        daveVault.seed(5e18);
        _say("Carol tried to seed Dave's vault with 5 USDT: REVERTED (minimum is 10).");

        vm.prank(carol);
        daveVault.seed(250e18);

        assertEq(daveVault.balanceOf(carol), 250e18 - 1e15);
        assertEq(usdt.balanceOf(address(daveVault)), 250e18);
        assertEq(usdt.balanceOf(carol), 250e18);
        assertEq(uint8(daveVault.state()), uint8(FolioVault.VaultState.SEEDED));
        _say("Carol seeded it with 250 USDT instead. She keeps the other 250.");

        // Nothing that happened in Dave's vault touched Alice's.
        assertEq(usdt.balanceOf(address(aliceVault)), 1_000e18);
        assertEq(aliceVault.totalSupply(), 1_000e18);
        assertEq(aliceVault.balanceOf(carol), 0);
        _say("Alice's vault did not change: each vault has its own money and its own shares.");
    }

    function _ch8CarolDepositsAfterActivation() internal {
        _title("8. Carol joins Alice's vault now that it is ACTIVE");

        (PriceUpdate memory prices, bytes memory signature) = _backendSignsPrices();
        vm.prank(carol);
        usdt.approve(address(aliceVault), 200e18);
        vm.prank(carol);
        uint256 shares = aliceVault.deposit(200e18, prices, signature, 0);

        assertEq(shares, 200e18);
        assertEq(aliceVault.balanceOf(carol), 200e18);
        assertEq(usdt.balanceOf(address(aliceVault)), 1_200e18);
        _say("The backend signed fresh prices, and Carol deposited 200 USDT.");
        _say(
            string.concat(
                "Carol's shares: ", _units(shares), "  (the vault is all cash, so 1 share = 1 USDT)"
            )
        );
        _say("Her USDT sits idle in the vault until Alice invests it (SC-04).");

        (PriceUpdate memory fake, bytes memory fakeSignature) =
            _sign(0xBAD, new address[](0), new uint256[](0));
        usdt.mint(mallory, 100e18);
        vm.prank(mallory);
        usdt.approve(address(aliceVault), 100e18);
        vm.expectRevert(AssetRegistry.InvalidPriceSignature.selector);
        vm.prank(mallory);
        aliceVault.deposit(100e18, fake, fakeSignature, 0);
        _say("Mallory signed her own prices: REVERTED (she is not the price signer).");

        vm.warp(block.timestamp + 61);
        vm.expectRevert(abi.encodeWithSelector(AssetRegistry.StalePrices.selector, prices.timestamp));
        vm.prank(carol);
        aliceVault.deposit(10e18, prices, signature, 0);
        _say("Carol reused the same signed prices 61 seconds later: REVERTED (older than 60 s).");
    }

    function _ch9PauseBlocksDepositsNotExits() internal {
        _title("9. Something looks wrong: the guardian pulls the emergency brake");

        vm.prank(guardian);
        aliceVault.pause();
        _say(string.concat("Vault state: ", _stateName(aliceVault.state())));

        (PriceUpdate memory prices, bytes memory signature) = _backendSignsPrices();
        vm.expectRevert(abi.encodeWithSelector(FolioVault.WrongState.selector, FolioVault.VaultState.PAUSED));
        vm.prank(carol);
        aliceVault.deposit(10e18, prices, signature, 0);
        _say("Carol tried to deposit more: REVERTED (paused).");

        vm.prank(bob);
        (, uint256[] memory amounts) = aliceVault.redeem(500e18, bob);
        assertEq(amounts[0], 500e18);
        assertEq(usdt.balanceOf(bob), 500e18);
        _say("Bob withdrew 500 shares anyway and got 500 USDT back. A pause never traps anyone.");

        vm.prank(guardian);
        aliceVault.unpause();
        _say(string.concat("The guardian unpaused. Vault state: ", _stateName(aliceVault.state())));
    }

    function _ch10FinalBooks() internal view {
        _title("10. Final books");

        _say("Alice Tech Fund (ACTIVE)");
        _say(string.concat("  holds     ", _units(usdt.balanceOf(address(aliceVault))), " USDT"));
        _say(string.concat("  Bob       ", _units(aliceVault.balanceOf(bob)), " shares"));
        _say(string.concat("  Carol     ", _units(aliceVault.balanceOf(carol)), " shares"));
        _say(string.concat("  dead      ", _units(aliceVault.balanceOf(DEAD)), " shares"));
        _say("Dave Dividend Fund (SEEDED, waiting for the guardian)");
        _say(string.concat("  holds     ", _units(usdt.balanceOf(address(daveVault))), " USDT"));
        _say(string.concat("  Carol     ", _units(daveVault.balanceOf(carol)), " shares"));
        _say(string.concat("  dead      ", _units(daveVault.balanceOf(DEAD)), " shares"));

        // Every share is accounted for, and every share is backed by one USDT (both vaults are all cash).
        assertEq(
            aliceVault.balanceOf(bob) + aliceVault.balanceOf(carol) + aliceVault.balanceOf(DEAD),
            aliceVault.totalSupply()
        );
        assertEq(daveVault.balanceOf(carol) + daveVault.balanceOf(DEAD), daveVault.totalSupply());
        assertEq(usdt.balanceOf(address(aliceVault)), aliceVault.totalSupply());
        assertEq(usdt.balanceOf(address(daveVault)), daveVault.totalSupply());

        // Alice, Dave and Mallory never deposited, so they own nothing.
        assertEq(aliceVault.balanceOf(alice), 0);
        assertEq(daveVault.balanceOf(dave), 0);
        assertEq(aliceVault.balanceOf(mallory) + daveVault.balanceOf(mallory), 0);
        assertEq(usdt.balanceOf(mallory), 100e18, "Mallory's failed deposit cost her nothing");

        _say("");
        _say("Not possible yet: manager trades (SC-04), replace manager and close a vault (SC-06).");
    }

    // ---- helpers

    function _fund(address who, FolioVault vault, uint256 amount) internal {
        usdt.mint(who, amount);
        vm.prank(who);
        usdt.approve(address(vault), amount);
    }

    /// @dev What the backend does before each deposit: sign fresh prices. Alice's vault holds only
    ///      USDT so far, so the list is empty; the signature still proves the prices are fresh.
    function _backendSignsPrices() internal view returns (PriceUpdate memory prices, bytes memory signature) {
        return _sign(PRICE_SIGNER_KEY, new address[](0), new uint256[](0));
    }

    function _sign(uint256 key, address[] memory assets, uint256[] memory prices)
        internal
        view
        returns (PriceUpdate memory update, bytes memory signature)
    {
        update = PriceUpdate({assets: assets, prices: prices, timestamp: uint64(block.timestamp)});
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, registry.hashPriceUpdate(update));
        signature = abi.encodePacked(r, s, v);
    }

    function _title(string memory line) internal pure {
        console.log("");
        console.log(string.concat("== ", line));
    }

    function _say(string memory line) internal pure {
        console.log(string.concat("   ", line));
    }

    /// @dev 18-decimal amount as a string with three decimals, e.g. 999.999.
    function _units(uint256 wad) internal pure returns (string memory) {
        uint256 thousandths = (wad % 1e18) / 1e15;
        string memory pad = thousandths < 10 ? "00" : thousandths < 100 ? "0" : "";
        return string.concat(vm.toString(wad / 1e18), ".", pad, vm.toString(thousandths));
    }

    function _stateName(FolioVault.VaultState s) internal pure returns (string memory) {
        if (s == FolioVault.VaultState.DRAFT) return "DRAFT";
        if (s == FolioVault.VaultState.SEEDED) return "SEEDED";
        if (s == FolioVault.VaultState.ACTIVE) return "ACTIVE";
        if (s == FolioVault.VaultState.PAUSED) return "PAUSED";
        return "CLOSED";
    }
}
```

- [ ] **Step 2: Run it and read the story**

Run: `forge fmt && forge test --match-contract SimulationTest -vv`
Expected: PASS, and the log ends with chapter "10. Final books" showing Alice's vault holding 700 USDT, Bob 499.999 shares, Carol 200.000 shares.

- [ ] **Step 3: Full check**

Run: `forge fmt --check && forge build --force --sizes && forge lint && forge test`
Expected: no warnings or lint output; every contract under the 24,576-byte runtime limit (FolioVault ≈ 8.8 kB); 105 tests pass across 6 suites (29 + 29 + 23 + 14 + 9 + 1).

- [ ] **Step 4: Update the README status**

In `contracts/README.md`, replace the whole `## Status` section (heading down to, not including, `## Setup`) with:

```markdown
## Status

**SC-02, SC-03 and SC-05 are built.** Design and decisions: [`docs/folio-lab-contract-architecture.md`](../docs/folio-lab-contract-architecture.md).

| Contract | What works today |
|---|---|
| `AssetRegistry` | Asset and router allowlists, settlement token, guardian, price signer; verifies EIP-712 signed prices. Owned by governance. |
| `VaultFactory` | Anyone can create a vault. |
| `FolioVault` | `seed`, `activate`, `deposit` (priced from signed prices, shares minted instantly), `redeem` (your % of every holding, any time), `pause`/`unpause`. Shares are non-transferable. |

Not built yet: manager trading (SC-04), manager replacement and closing (SC-06), deploy scripts
and invariants (SC-07). Deposits trust the backend's signed prices (spec §8.0) — do not deploy
to mainnet before SC-07's adversarial review.

```

- [ ] **Step 5: Update the checklist**

In `docs/sc-checklist.md`, replace the whole "Phase 2 — SC-03" section body (keep the heading line, change its text) with:

```markdown
## Phase 2 — SC-03 · later investors can join

- [x] `deposit()` — USDT goes straight into the vault and sits idle; shares minted instantly
- [x] Priced from backend-signed stock prices (EIP-712), at most 60 seconds old
- [x] The contract values the vault from its **own** balances; the backend only supplies prices
- [x] A held stock with no price, or a zero price, reverts the deposit
- [x] Always round shares **down** so existing holders are never diluted
- [x] `minShares` so an investor can reject a price that moved
- [x] Tests: share price never falls on a deposit; deposit-then-withdraw never profits
```

Replace the Phase 4 checkbox lines with the same four lines ticked (`- [x]`).

Replace the Phase 5 checkbox lines with:

```markdown
- [x] `pause()` / `unpause()` — built in SC-03 because signed prices need an instant brake
- [x] **Withdrawals still work while paused** — a pause that traps people is not safety
- [ ] `replaceManager()` with a timelock
- [x] Tests: paused blocks deposits, never exits (trades: when SC-04 lands)
```

In "Right now", replace the last paragraph (starting `**SC-02 is built.**`) with:

```markdown
**SC-02, SC-03 and SC-05 are built.** Deposits are priced from backend-signed prices — Vincent
needs the EIP-712 `PriceUpdate` layout (spec §7) and the signing rules in spec §8.0. Next is
SC-04 (manager trading), which needs: max assets per vault, and the allowlist by liquidity.
```
