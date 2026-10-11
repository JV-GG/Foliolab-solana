# SC-02 — Registry, Factory, Seedable Vault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A curator can create a vault, anyone can seed it with USDT and receive shares, and the guardian can activate it.

**Architecture:** Three contracts. `AssetRegistry` holds the shared allowlists, the settlement token and the guardian address, and is owned by governance. `FolioVault` is an ERC-20 share token with transfers disabled; it holds the money and runs the `DRAFT → SEEDED → ACTIVE` lifecycle. `VaultFactory` deploys vaults and records them. Subscriptions, trading, redemption and pause are later tasks (SC-03 to SC-06) and are not built here.

**Tech Stack:** Solidity 0.8.30, Foundry (forge 1.5.1), OpenZeppelin Contracts v5.7.0, forge-std v1.16.2.

**Spec:** [docs/folio-lab-contract-architecture.md](../../folio-lab-contract-architecture.md) — §3 (contracts), §4 (lifecycle), §5 "Seed", §7 (interface), §10 (decisions).

## Global Constraints

- `pragma solidity 0.8.30;` exactly, in every file. EVM target `cancun`.
- Imports use the remappings `forge-std/` and `@openzeppelin/contracts/`.
- Custom errors only. No `require` strings.
- `SafeERC20` for every token transfer. Amounts received are measured from balance before/after, never taken from the argument.
- `nonReentrant` (from `ReentrancyGuardTransient`) on every state-changing external function that moves tokens.
- Settlement token is USDT. `MIN_SEED` is 10 settlement units. `DEAD_SHARES` is `1e15`, minted to `0x000000000000000000000000000000000000dEaD`, taken out of the seeder's shares.
- Shares are 18-decimal. 1 share = 1 settlement unit at seed. Settlement decimals are read, never assumed; more than 18 is rejected.
- Share transfers revert. Only mint and burn are allowed.
- `governance` = `AssetRegistry.owner()` (slow, timelocked in production). `guardian` = `AssetRegistry.guardian()` (instant). In tests both are plain addresses.
- Run `forge fmt` before finishing each task. All commands run from `contracts/`.
- **Do not commit.** The user commits when they choose to.

## Review Focus

Inputs the spec implies that are easy to miss. Each one has a test in the task named.

1. **Settlement token that takes a fee on transfer** → shares are minted from what arrived, not what was sent. (Task 3, `test_seed_feeOnTransfer_mintsFromReceived`)
2. **USDT sent straight to the vault before seeding** → the seeder gets shares for their own deposit only. (Task 3, `test_seed_ignoresPriorDonation`)
3. **Settlement token with 6 decimals** → 1 share still equals 1 unit. (Task 3, `test_seed_sixDecimals_oneSharePerUnit`)
4. **`approve` + `transferFrom` on shares** → still blocked, not just `transfer`. (Task 3, `test_transferFrom_reverts`)
5. **Guardian rotated in the registry after the vault exists** → the vault obeys the new guardian and rejects the old one. (Task 3, `test_activate_followsGuardianRotation`)

## File Structure

| File | Responsibility |
|---|---|
| `contracts/src/AssetRegistry.sol` | Allowlists, settlement token, guardian. Owned by governance. |
| `contracts/src/FolioVault.sol` | Share token, custody, lifecycle, `seed`, `activate`, read views. |
| `contracts/src/VaultFactory.sol` | Deploys and records vaults. |
| `contracts/test/mocks/MockERC20.sol` | Test tokens: configurable decimals, and a fee-on-transfer variant. |
| `contracts/test/AssetRegistry.t.sol` | Registry tests. |
| `contracts/test/FolioVault.t.sol` | Vault tests. |
| `contracts/test/VaultFactory.t.sol` | Factory tests and one end-to-end flow. |
| `contracts/test/Scaffold.t.sol` | **Deleted** in Task 4 (its own comment says to replace it). |

---

### Task 1: AssetRegistry

**Files:**
- Create: `contracts/test/mocks/MockERC20.sol`
- Create: `contracts/test/AssetRegistry.t.sol`
- Create: `contracts/src/AssetRegistry.sol`
- Delete: `contracts/src/.gitkeep`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `constructor(address governance, address guardian_, address settlementToken_)`
  - `function settlementToken() external view returns (address)` (immutable)
  - `function guardian() external view returns (address)`
  - `function isAsset(address) external view returns (bool)`
  - `function isRouter(address) external view returns (bool)`
  - `function setGuardian(address newGuardian) external` (owner only)
  - `function setAsset(address asset, bool allowed) external` (owner only)
  - `function setRouter(address router, bool allowed) external` (owner only)
  - `owner()`, `transferOwnership`, `acceptOwnership` from `Ownable2Step`
  - Test helpers: `MockERC20(string name, string symbol, uint8 decimals)` with `mint(address,uint256)`; `MockFeeERC20()` (18 decimals, burns 1% of every transfer to `address(0xFEE)`).

- [ ] **Step 1: Write the mock tokens**

Create `contracts/test/mocks/MockERC20.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Test token with configurable decimals and open minting.
contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Takes 1% of every transfer, so the receiver gets less than was sent.
contract MockFeeERC20 is MockERC20 {
    address public constant FEE_SINK = address(0xFEE);

    constructor() MockERC20("Fee Token", "FEE", 18) {}

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }
        uint256 fee = value / 100;
        super._update(from, FEE_SINK, fee);
        super._update(from, to, value - fee);
    }
}
```

- [ ] **Step 2: Write the failing tests**

Create `contracts/test/AssetRegistry.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
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
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `forge test --match-contract AssetRegistryTest`
Expected: compilation fails — `Source "src/AssetRegistry.sol" not found`.

- [ ] **Step 4: Write the implementation**

Create `contracts/src/AssetRegistry.sol` and delete `contracts/src/.gitkeep`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @notice Rules shared by every vault: which tokens and routers are permitted, which token is
///         money, and who the guardian is. The owner is governance (a timelock in production),
///         so every change here is slow on purpose. The guardian is the fast emergency role.
contract AssetRegistry is Ownable2Step {
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

    constructor(address governance, address guardian_, address settlementToken_) Ownable(governance) {
        if (guardian_ == address(0) || settlementToken_ == address(0)) revert ZeroAddress();
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
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `forge fmt && forge test --match-contract AssetRegistryTest`
Expected: 15 tests pass, 0 fail.

---

### Task 2: FolioVault — construction and read views

**Files:**
- Create: `contracts/test/FolioVault.t.sol`
- Create: `contracts/src/FolioVault.sol`

**Interfaces:**
- Consumes: `AssetRegistry.settlementToken()`, `MockERC20` from Task 1.
- Produces:
  - `constructor(AssetRegistry registry_, address manager_, string memory name_, string memory symbol_)`
  - `enum VaultState {DRAFT, SEEDED, ACTIVE, PAUSED, CLOSED}`
  - `function registry() external view returns (AssetRegistry)`
  - `function settlementToken() external view returns (IERC20)`
  - `function settlementUnit() external view returns (uint256)` — `10 ** decimals`
  - `function minSeed() external view returns (uint256)` — `10 * settlementUnit`
  - `function manager() external view returns (address)`
  - `function state() external view returns (VaultState)`
  - `function heldAssets() external view returns (address[] memory)`
  - `function holdings() external view returns (address[] memory assets, uint256[] memory amounts)`
  - `function shareOf(address account) external view returns (uint256)`
  - `uint256 public constant DEAD_SHARES = 1e15`, `address public constant DEAD = 0x…dEaD`
  - Errors: `ZeroAddress()`, `UnsupportedDecimals(uint8 decimals)`

- [ ] **Step 1: Write the failing tests**

Create `contracts/test/FolioVault.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {FolioVault} from "../src/FolioVault.sol";
import {MockERC20, MockFeeERC20} from "./mocks/MockERC20.sol";

contract FolioVaultTest is Test {
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 internal constant DEAD_SHARES = 1e15;

    AssetRegistry internal registry;
    FolioVault internal vault;
    MockERC20 internal usdt;

    address internal governance = makeAddr("governance");
    address internal guardian = makeAddr("guardian");
    address internal manager = makeAddr("manager");
    address internal seeder = makeAddr("seeder");
    address internal stranger = makeAddr("stranger");

    function setUp() public {
        (registry, vault, usdt) = _deploy(18);
    }

    function _deploy(uint8 decimals_) internal returns (AssetRegistry r, FolioVault v, MockERC20 t) {
        t = new MockERC20("Tether USD", "USDT", decimals_);
        r = new AssetRegistry(governance, guardian, address(t));
        v = new FolioVault(r, manager, "Folio Tech", "fTECH");
    }

    // ---- construction

    function test_constructor_setsConfig() public view {
        assertEq(vault.name(), "Folio Tech");
        assertEq(vault.symbol(), "fTECH");
        assertEq(vault.decimals(), 18);
        assertEq(address(vault.registry()), address(registry));
        assertEq(address(vault.settlementToken()), address(usdt));
        assertEq(vault.manager(), manager);
        assertEq(vault.DEAD(), DEAD);
        assertEq(vault.DEAD_SHARES(), DEAD_SHARES);
    }

    function test_constructor_startsEmptyInDraft() public view {
        assertEq(uint8(vault.state()), uint8(FolioVault.VaultState.DRAFT));
        assertEq(vault.totalSupply(), 0);
        assertEq(vault.heldAssets().length, 0);
        (address[] memory assets, uint256[] memory amounts) = vault.holdings();
        assertEq(assets.length, 0);
        assertEq(amounts.length, 0);
    }

    function test_constructor_minSeedIsTenUnits_18Decimals() public view {
        assertEq(vault.settlementUnit(), 1e18);
        assertEq(vault.minSeed(), 10e18);
    }

    function test_constructor_minSeedIsTenUnits_6Decimals() public {
        (, FolioVault v,) = _deploy(6);
        assertEq(v.settlementUnit(), 1e6);
        assertEq(v.minSeed(), 10e6);
    }

    function test_constructor_revertsOnZeroManager() public {
        vm.expectRevert(FolioVault.ZeroAddress.selector);
        new FolioVault(registry, address(0), "Folio Tech", "fTECH");
    }

    function test_constructor_revertsOnMoreThan18Decimals() public {
        MockERC20 weird = new MockERC20("Weird", "WRD", 24);
        AssetRegistry r = new AssetRegistry(governance, guardian, address(weird));
        vm.expectRevert(abi.encodeWithSelector(FolioVault.UnsupportedDecimals.selector, uint8(24)));
        new FolioVault(r, manager, "Folio Tech", "fTECH");
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `forge test --match-contract FolioVaultTest`
Expected: compilation fails — `Source "src/FolioVault.sol" not found`.

- [ ] **Step 3: Write the implementation**

Create `contracts/src/FolioVault.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {AssetRegistry} from "./AssetRegistry.sol";

/// @notice A pooled portfolio. Holds the assets and is itself the ERC-20 share token.
///         It never prices what it holds: every money path is proportional to balances
///         the contract can read itself.
contract FolioVault is ERC20 {
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

    EnumerableSet.AddressSet private _held;

    error ZeroAddress();
    error UnsupportedDecimals(uint8 decimals);

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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `forge fmt && forge test --match-contract FolioVaultTest`
Expected: 6 tests pass, 0 fail. (A compiler warning about the unused `MockFeeERC20` import is fine; Task 3 uses it.)

---

### Task 3: FolioVault — seed, share lock, activate

**Files:**
- Modify: `contracts/test/FolioVault.t.sol` (append tests inside `FolioVaultTest`)
- Modify: `contracts/src/FolioVault.sol`

**Interfaces:**
- Consumes: everything from Task 2; `AssetRegistry.guardian()`, `AssetRegistry.setGuardian(address)`; `MockFeeERC20`.
- Produces:
  - `function seed(uint256 amount) external returns (uint256 shares)` — anyone, `DRAFT` only
  - `function activate() external` — guardian only, `SEEDED` only
  - `event Seeded(address indexed investor, uint256 amount, uint256 shares)`
  - `event StateChanged(VaultState from, VaultState to)`
  - Errors: `NotGuardian()`, `WrongState(VaultState current)`, `BelowMinimumSeed(uint256 received, uint256 minimum)`, `TransfersDisabled()`

- [ ] **Step 1: Write the failing tests**

Append inside `FolioVaultTest` in `contracts/test/FolioVault.t.sol`, before the closing brace:

```solidity
    // ---- helpers

    function _seed(FolioVault v, MockERC20 t, address who, uint256 amount) internal returns (uint256 shares) {
        t.mint(who, amount);
        vm.prank(who);
        t.approve(address(v), amount);
        vm.prank(who);
        shares = v.seed(amount);
    }

    // ---- seed

    function test_seed_mintsOneSharePerUnit() public {
        uint256 shares = _seed(vault, usdt, seeder, 100e18);

        assertEq(shares, 100e18 - DEAD_SHARES, "return value");
        assertEq(vault.balanceOf(seeder), 100e18 - DEAD_SHARES, "seeder shares");
        assertEq(vault.shareOf(seeder), 100e18 - DEAD_SHARES, "shareOf");
        assertEq(vault.balanceOf(DEAD), DEAD_SHARES, "dead shares");
        assertEq(vault.totalSupply(), 100e18, "total supply");
    }

    function test_seed_movesMoneyIntoVault() public {
        _seed(vault, usdt, seeder, 100e18);

        assertEq(usdt.balanceOf(address(vault)), 100e18);
        assertEq(usdt.balanceOf(seeder), 0);
    }

    function test_seed_recordsSettlementTokenAsHeld() public {
        _seed(vault, usdt, seeder, 100e18);

        address[] memory held = vault.heldAssets();
        assertEq(held.length, 1);
        assertEq(held[0], address(usdt));

        (address[] memory assets, uint256[] memory amounts) = vault.holdings();
        assertEq(assets.length, 1);
        assertEq(assets[0], address(usdt));
        assertEq(amounts[0], 100e18);
    }

    function test_seed_movesToSeededAndEmits() public {
        usdt.mint(seeder, 100e18);
        vm.prank(seeder);
        usdt.approve(address(vault), 100e18);

        vm.expectEmit(address(vault));
        emit FolioVault.StateChanged(FolioVault.VaultState.DRAFT, FolioVault.VaultState.SEEDED);
        vm.expectEmit(address(vault));
        emit FolioVault.Seeded(seeder, 100e18, 100e18 - DEAD_SHARES);
        vm.prank(seeder);
        vault.seed(100e18);

        assertEq(uint8(vault.state()), uint8(FolioVault.VaultState.SEEDED));
    }

    function test_seed_exactMinimumWorks() public {
        _seed(vault, usdt, seeder, 10e18);
        assertEq(vault.totalSupply(), 10e18);
    }

    function test_seed_revertsBelowMinimum() public {
        usdt.mint(seeder, 10e18);
        vm.prank(seeder);
        usdt.approve(address(vault), 10e18);

        vm.expectRevert(abi.encodeWithSelector(FolioVault.BelowMinimumSeed.selector, 10e18 - 1, 10e18));
        vm.prank(seeder);
        vault.seed(10e18 - 1);
    }

    function test_seed_revertsWhenAlreadySeeded() public {
        _seed(vault, usdt, seeder, 100e18);

        usdt.mint(stranger, 100e18);
        vm.prank(stranger);
        usdt.approve(address(vault), 100e18);

        vm.expectRevert(abi.encodeWithSelector(FolioVault.WrongState.selector, FolioVault.VaultState.SEEDED));
        vm.prank(stranger);
        vault.seed(100e18);
    }

    function test_seed_revertsWithoutAllowance() public {
        usdt.mint(seeder, 100e18);
        vm.expectRevert();
        vm.prank(seeder);
        vault.seed(100e18);
    }

    function test_seed_sixDecimals_oneSharePerUnit() public {
        (, FolioVault v, MockERC20 t) = _deploy(6);
        uint256 shares = _seed(v, t, seeder, 100e6);

        assertEq(shares, 100e18 - DEAD_SHARES);
        assertEq(v.totalSupply(), 100e18);
        assertEq(t.balanceOf(address(v)), 100e6);
    }

    function test_seed_feeOnTransfer_mintsFromReceived() public {
        MockFeeERC20 fee = new MockFeeERC20();
        AssetRegistry r = new AssetRegistry(governance, guardian, address(fee));
        FolioVault v = new FolioVault(r, manager, "Folio Fee", "fFEE");

        uint256 shares = _seed(v, fee, seeder, 100e18);

        assertEq(fee.balanceOf(address(v)), 99e18, "vault received 99");
        assertEq(v.totalSupply(), 99e18, "supply matches what arrived");
        assertEq(shares, 99e18 - DEAD_SHARES);
    }

    function test_seed_feeOnTransfer_minimumAppliesToReceived() public {
        MockFeeERC20 fee = new MockFeeERC20();
        AssetRegistry r = new AssetRegistry(governance, guardian, address(fee));
        FolioVault v = new FolioVault(r, manager, "Folio Fee", "fFEE");

        fee.mint(seeder, 10e18);
        vm.prank(seeder);
        fee.approve(address(v), 10e18);

        vm.expectRevert(abi.encodeWithSelector(FolioVault.BelowMinimumSeed.selector, 9.9e18, 10e18));
        vm.prank(seeder);
        v.seed(10e18);
    }

    function test_seed_ignoresPriorDonation() public {
        usdt.mint(address(vault), 50e18);

        uint256 shares = _seed(vault, usdt, seeder, 100e18);

        assertEq(shares, 100e18 - DEAD_SHARES, "shares come from the deposit only");
        assertEq(vault.totalSupply(), 100e18);
        assertEq(usdt.balanceOf(address(vault)), 150e18);
    }

    function testFuzz_seed_supplyIsAmountScaledTo18(uint8 decimals_, uint256 amount) public {
        decimals_ = uint8(bound(decimals_, 0, 18));
        (, FolioVault v, MockERC20 t) = _deploy(decimals_);
        uint256 unit = 10 ** decimals_;
        amount = bound(amount, 10 * unit, 1e12 * unit);

        uint256 shares = _seed(v, t, seeder, amount);

        assertEq(v.totalSupply(), amount * 10 ** (18 - decimals_), "1 share per unit");
        assertEq(v.balanceOf(DEAD), DEAD_SHARES, "dead shares fixed");
        assertEq(shares + DEAD_SHARES, v.totalSupply(), "nothing minted elsewhere");
    }

    // ---- share lock

    function test_transfer_reverts() public {
        _seed(vault, usdt, seeder, 100e18);

        vm.expectRevert(FolioVault.TransfersDisabled.selector);
        vm.prank(seeder);
        vault.transfer(stranger, 1e18);
    }

    function test_transferFrom_reverts() public {
        _seed(vault, usdt, seeder, 100e18);
        vm.prank(seeder);
        vault.approve(stranger, 1e18);

        vm.expectRevert(FolioVault.TransfersDisabled.selector);
        vm.prank(stranger);
        vault.transferFrom(seeder, stranger, 1e18);
    }

    // ---- activate

    function test_activate_guardianMovesToActive() public {
        _seed(vault, usdt, seeder, 100e18);

        vm.expectEmit(address(vault));
        emit FolioVault.StateChanged(FolioVault.VaultState.SEEDED, FolioVault.VaultState.ACTIVE);
        vm.prank(guardian);
        vault.activate();

        assertEq(uint8(vault.state()), uint8(FolioVault.VaultState.ACTIVE));
    }

    function test_activate_revertsForManager() public {
        _seed(vault, usdt, seeder, 100e18);
        vm.expectRevert(FolioVault.NotGuardian.selector);
        vm.prank(manager);
        vault.activate();
    }

    function test_activate_revertsForGovernance() public {
        _seed(vault, usdt, seeder, 100e18);
        vm.expectRevert(FolioVault.NotGuardian.selector);
        vm.prank(governance);
        vault.activate();
    }

    function test_activate_revertsForSeeder() public {
        _seed(vault, usdt, seeder, 100e18);
        vm.expectRevert(FolioVault.NotGuardian.selector);
        vm.prank(seeder);
        vault.activate();
    }

    function test_activate_revertsInDraft() public {
        vm.expectRevert(abi.encodeWithSelector(FolioVault.WrongState.selector, FolioVault.VaultState.DRAFT));
        vm.prank(guardian);
        vault.activate();
    }

    function test_activate_revertsWhenAlreadyActive() public {
        _seed(vault, usdt, seeder, 100e18);
        vm.prank(guardian);
        vault.activate();

        vm.expectRevert(abi.encodeWithSelector(FolioVault.WrongState.selector, FolioVault.VaultState.ACTIVE));
        vm.prank(guardian);
        vault.activate();
    }

    function test_activate_followsGuardianRotation() public {
        _seed(vault, usdt, seeder, 100e18);
        address newGuardian = makeAddr("newGuardian");
        vm.prank(governance);
        registry.setGuardian(newGuardian);

        vm.expectRevert(FolioVault.NotGuardian.selector);
        vm.prank(guardian);
        vault.activate();

        vm.prank(newGuardian);
        vault.activate();
        assertEq(uint8(vault.state()), uint8(FolioVault.VaultState.ACTIVE));
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `forge test --match-contract FolioVaultTest`
Expected: compilation fails — `Member "seed" not found` (and likewise `activate`, `Seeded`, `StateChanged`, `WrongState`).

- [ ] **Step 3: Write the implementation**

Edit `contracts/src/FolioVault.sol`.

Add two imports below the existing `IERC20Metadata` import:

```solidity
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
```

Change the contract declaration and add the `SafeERC20` using-line:

```solidity
contract FolioVault is ERC20, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;
```

Add events above the existing errors, and four errors below them:

```solidity
    event Seeded(address indexed investor, uint256 amount, uint256 shares);
    event StateChanged(VaultState from, VaultState to);

    error ZeroAddress();
    error UnsupportedDecimals(uint8 decimals);
    error NotGuardian();
    error WrongState(VaultState current);
    error BelowMinimumSeed(uint256 received, uint256 minimum);
    error TransfersDisabled();
```

Add this block between the constructor and the `// ---- views` section:

```solidity
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
        if (msg.sender != registry.guardian()) revert NotGuardian();
        if (state != VaultState.SEEDED) revert WrongState(state);
        _setState(VaultState.ACTIVE);
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `forge fmt && forge test --match-contract FolioVaultTest`
Expected: 28 tests pass, 0 fail (6 from Task 2, 22 new).

---

### Task 4: VaultFactory, end-to-end flow, cleanup

**Files:**
- Create: `contracts/test/VaultFactory.t.sol`
- Create: `contracts/src/VaultFactory.sol`
- Delete: `contracts/test/Scaffold.t.sol`
- Delete: `contracts/script/.gitkeep` is **kept** (the folder is still empty until SC-07)
- Modify: `contracts/README.md` ("Status" section)
- Modify: `docs/sc-checklist.md` (Phase 1 ticks and the "Decisions you need from other people" list)

**Interfaces:**
- Consumes: `FolioVault` constructor, `seed`, `activate`, `state`, `manager`, `registry`; `AssetRegistry.settlementToken()`.
- Produces:
  - `constructor(AssetRegistry registry_)`
  - `function registry() external view returns (AssetRegistry)`
  - `function createVault(string calldata name, string calldata symbol, address manager) external returns (address vault)`
  - `function isVault(address) external view returns (bool)`
  - `function vaults(uint256 index) external view returns (address)`
  - `function vaultCount() external view returns (uint256)`
  - `event VaultCreated(address indexed vault, address indexed manager, address settlement)`

- [ ] **Step 1: Write the failing tests**

Create `contracts/test/VaultFactory.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {FolioVault} from "../src/FolioVault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract VaultFactoryTest is Test {
    AssetRegistry internal registry;
    VaultFactory internal factory;
    MockERC20 internal usdt;

    address internal governance = makeAddr("governance");
    address internal guardian = makeAddr("guardian");
    address internal curator = makeAddr("curator");
    address internal investor = makeAddr("investor");

    function setUp() public {
        usdt = new MockERC20("Tether USD", "USDT", 18);
        registry = new AssetRegistry(governance, guardian, address(usdt));
        factory = new VaultFactory(registry);
    }

    function test_constructor_setsRegistry() public view {
        assertEq(address(factory.registry()), address(registry));
        assertEq(factory.vaultCount(), 0);
    }

    function test_createVault_deploysConfiguredVault() public {
        vm.prank(curator);
        FolioVault vault = FolioVault(factory.createVault("Folio Tech", "fTECH", curator));

        assertEq(vault.name(), "Folio Tech");
        assertEq(vault.symbol(), "fTECH");
        assertEq(vault.manager(), curator);
        assertEq(address(vault.registry()), address(registry));
        assertEq(uint8(vault.state()), uint8(FolioVault.VaultState.DRAFT));
    }

    function test_createVault_recordsVault() public {
        address vault = factory.createVault("Folio Tech", "fTECH", curator);

        assertTrue(factory.isVault(vault));
        assertEq(factory.vaultCount(), 1);
        assertEq(factory.vaults(0), vault);
    }

    function test_createVault_emitsVaultCreated() public {
        address expected = vm.computeCreateAddress(address(factory), vm.getNonce(address(factory)));

        vm.expectEmit(address(factory));
        emit VaultFactory.VaultCreated(expected, curator, address(usdt));
        address vault = factory.createVault("Folio Tech", "fTECH", curator);

        assertEq(vault, expected);
    }

    function test_createVault_managerCanDifferFromCaller() public {
        vm.prank(investor);
        FolioVault vault = FolioVault(factory.createVault("Folio Tech", "fTECH", curator));
        assertEq(vault.manager(), curator);
    }

    function test_createVault_eachCallMakesADistinctVault() public {
        address a = factory.createVault("Folio Tech", "fTECH", curator);
        address b = factory.createVault("Folio Tech", "fTECH", curator);

        assertTrue(a != b);
        assertEq(factory.vaultCount(), 2);
        assertEq(factory.vaults(1), b);
    }

    function test_createVault_revertsOnZeroManager() public {
        vm.expectRevert(FolioVault.ZeroAddress.selector);
        factory.createVault("Folio Tech", "fTECH", address(0));
    }

    function test_isVault_falseForUnknownAddress() public view {
        assertFalse(factory.isVault(address(this)));
    }

    function test_endToEnd_createSeedActivate() public {
        vm.prank(curator);
        FolioVault vault = FolioVault(factory.createVault("Folio Tech", "fTECH", curator));

        usdt.mint(investor, 500e18);
        vm.prank(investor);
        usdt.approve(address(vault), 500e18);
        vm.prank(investor);
        vault.seed(500e18);

        vm.prank(guardian);
        vault.activate();

        assertEq(uint8(vault.state()), uint8(FolioVault.VaultState.ACTIVE));
        assertEq(vault.totalSupply(), 500e18);
        assertEq(vault.balanceOf(investor), 500e18 - 1e15);
        assertEq(usdt.balanceOf(address(vault)), 500e18);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `forge test --match-contract VaultFactoryTest`
Expected: compilation fails — `Source "src/VaultFactory.sol" not found`.

- [ ] **Step 3: Write the implementation**

Create `contracts/src/VaultFactory.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AssetRegistry} from "./AssetRegistry.sol";
import {FolioVault} from "./FolioVault.sol";

/// @notice Deploys vaults and keeps the list of genuine ones. Holds no funds.
///         Creation is open to anyone: a new vault is a `DRAFT` and cannot take outside
///         money until the guardian activates it.
contract VaultFactory {
    AssetRegistry public immutable registry;

    address[] public vaults;
    mapping(address vault => bool created) public isVault;

    event VaultCreated(address indexed vault, address indexed manager, address settlement);

    constructor(AssetRegistry registry_) {
        registry = registry_;
    }

    function createVault(string calldata name, string calldata symbol, address manager)
        external
        returns (address vault)
    {
        vault = address(new FolioVault(registry, manager, name, symbol));
        isVault[vault] = true;
        vaults.push(vault);
        emit VaultCreated(vault, manager, registry.settlementToken());
    }

    function vaultCount() external view returns (uint256) {
        return vaults.length;
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `forge fmt && forge test --match-contract VaultFactoryTest`
Expected: 9 tests pass, 0 fail.

- [ ] **Step 5: Remove the scaffold test and run everything**

Delete `contracts/test/Scaffold.t.sol`.

Run: `forge fmt --check && forge build --sizes && forge test`
Expected: formatting clean; `FolioVault` and `VaultFactory` both under the 24,576-byte runtime limit; 52 tests pass across 3 suites (15 + 28 + 9), 0 fail.

- [ ] **Step 6: Update the README status**

In `contracts/README.md`, replace the whole `## Status` section (from the `## Status` heading down to, but not including, `## Setup`) with:

```markdown
## Status

**SC-02 is built.** Design and decisions: [`docs/folio-lab-contract-architecture.md`](../docs/folio-lab-contract-architecture.md).

| Contract | What works today |
|---|---|
| `AssetRegistry` | Asset and router allowlists, settlement token, guardian. Owned by governance. |
| `VaultFactory` | Anyone can create a vault. |
| `FolioVault` | `seed()` and `activate()`; shares are non-transferable. |

Not built yet: subscriptions (SC-03), manager trading (SC-04), redemption (SC-05),
pause and manager replacement (SC-06), deploy scripts and invariants (SC-07).
Until SC-05 lands there is **no way to withdraw** — do not deploy this to mainnet.

```

- [ ] **Step 7: Tick the checklist**

In `docs/sc-checklist.md`, under "Decisions you need from other people", tick the four decided lines and leave the fifth open:

```markdown
- [x] Which token is money — **USDT**
- [x] Minimum first deposit — **10 USDT**
- [x] Is the first investor automatically the manager? — **No, anyone can seed**
- [x] Who can replace a manager or pause things? — **governance (slow) replaces; guardian (instant) pauses**
- [ ] Max number of stocks per vault — this bounds withdrawal gas *(you, before SC-04)*
```

Under "Phase 1 — SC-02", tick every item, and change the dead-shares line to match what was built:

```markdown
- [x] `AssetRegistry` — the allowlist of permitted stocks and permitted routers
- [x] `VaultFactory` — deploys vaults, emits `VaultCreated`
- [x] `FolioVault` skeleton — is itself the ERC-20 share token
- [x] Lifecycle states: `DRAFT → SEEDED → ACTIVE` built; `PAUSED` and `CLOSED` are declared, wired in SC-06
- [x] Roles: manager, governance, guardian, investor — and their boundaries
- [x] `seed()` — first deposit mints the first shares
- [x] Mint dead shares to `0xdEaD` so the vault can never be emptied to zero
- [ ] An unseeded vault must reject later investors — *checked in SC-03, when `requestSubscription` exists*
- [x] Tests: seeding works, wrong states revert, only the right roles can call
```
