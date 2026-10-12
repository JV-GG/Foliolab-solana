//! The whole Folio Lab flow on LiteSVM: registry, vault, seed, activate, plan, deposit with signed
//! prices, rebalance through the mock router, redeem; plus the checks that must refuse.

use {
    anchor_lang::{
        prelude::{Clock, Pubkey},
        solana_program::{
            instruction::{AccountMeta, Instruction},
            program_pack::Pack,
            system_program,
        },
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    anchor_spl::{
        associated_token::{self, get_associated_token_address_with_program_id},
        token::spl_token,
        token_2022::spl_token_2022,
    },
    ed25519_dalek::{Signer as _, SigningKey},
    folio_vault::{PriceUpdate, Registry, Vault, VaultState, Position},
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const ED25519_ID: Pubkey = folio_vault::ED25519_PROGRAM_ID;
const NOW: i64 = 1_791_800_000;
const USDC: u64 = 1_000_000; // 6 decimals
const STOCK: u64 = 100_000_000; // 8 decimals

struct Env {
    svm: LiteSVM,
    admin: Keypair,
    guardian: Keypair,
    manager: Keypair,
    signer: SigningKey,
    registry: Pubkey,
    usdc: Pubkey,
    aapl: Pubkey, // Token-2022, like xStocks
    nvda: Pubkey, // legacy SPL token
    vault: Pubkey,
}

fn send(svm: &mut LiteSVM, ixs: &[Instruction], payer: &Keypair, extra: &[&Keypair]) -> Result<(), String> {
    svm.expire_blockhash();
    let bh = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(ixs, Some(&payer.pubkey()), &bh);
    let mut signers: Vec<&Keypair> = vec![payer];
    signers.extend_from_slice(extra);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &signers).unwrap();
    svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}\n{}", e.err, e.meta.logs.join("\n")))
}

fn ix<A: ToAccountMetas, D: InstructionData>(accounts: A, data: D) -> Instruction {
    Instruction::new_with_bytes(folio_vault::id(), &data.data(), accounts.to_account_metas(None))
}

fn set_mint(svm: &mut LiteSVM, mint: Pubkey, decimals: u8, program: Pubkey) {
    let state = spl_token::state::Mint {
        mint_authority: Some(Pubkey::new_unique()).into(),
        supply: u64::MAX / 2,
        decimals,
        is_initialized: true,
        freeze_authority: None.into(),
    };
    let mut data = vec![0u8; spl_token::state::Mint::LEN];
    state.pack_into_slice(&mut data);
    svm.set_account(mint, account(data, program)).unwrap();
}

/// Writes a token account directly (the base layout is the same in both token programs).
fn set_token_account(svm: &mut LiteSVM, address: Pubkey, mint: Pubkey, owner: Pubkey, amount: u64, program: Pubkey) {
    let state = spl_token::state::Account {
        mint,
        owner,
        amount,
        delegate: None.into(),
        state: spl_token::state::AccountState::Initialized,
        is_native: None.into(),
        delegated_amount: 0,
        close_authority: None.into(),
    };
    let mut data = vec![0u8; spl_token::state::Account::LEN];
    state.pack_into_slice(&mut data);
    if program == spl_token_2022::ID {
        // Token-2022 marks a plain account with its account-type byte after the base layout.
        data.resize(spl_token::state::Account::LEN + 1, 0);
        data[spl_token::state::Account::LEN] = 2;
    }
    svm.set_account(address, account(data, program)).unwrap();
}

fn account(data: Vec<u8>, owner: Pubkey) -> solana_account::Account {
    solana_account::Account { lamports: 10_000_000, data, owner, executable: false, rent_epoch: 0 }
}

fn program_of(env: &Env, mint: &Pubkey) -> Pubkey {
    if *mint == env.aapl { spl_token_2022::ID } else { spl_token::ID }
}

fn ata(env: &Env, owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(owner, mint, &program_of(env, mint))
}

fn balance(svm: &LiteSVM, address: &Pubkey) -> u64 {
    let acc = svm.get_account(address).unwrap();
    spl_token::state::Account::unpack_from_slice(&acc.data[..spl_token::state::Account::LEN]).unwrap().amount
}

fn vault_state(svm: &LiteSVM, vault: &Pubkey) -> Vault {
    Vault::try_deserialize(&mut &svm.get_account(vault).unwrap().data[..]).unwrap()
}

fn position(svm: &LiteSVM, vault: &Pubkey, owner: &Pubkey) -> Position {
    let (p, _) = Pubkey::find_program_address(&[b"position", vault.as_ref(), owner.as_ref()], &folio_vault::id());
    Position::try_deserialize(&mut &svm.get_account(&p).unwrap().data[..]).unwrap()
}

fn set_time(svm: &mut LiteSVM, t: i64) {
    let mut clock: Clock = svm.get_sysvar();
    clock.unix_timestamp = t;
    svm.set_sysvar(&clock);
}

/// The Ed25519 program instruction carrying one signature, with everything inline.
fn ed25519_ix(key: &SigningKey, message: &[u8]) -> Instruction {
    let sig = key.sign(message).to_bytes();
    let pk = key.verifying_key().to_bytes();
    let (pk_off, sig_off, msg_off) = (16u16, 48u16, 112u16);
    let mut data = vec![1u8, 0];
    for v in [sig_off, u16::MAX, pk_off, u16::MAX, msg_off, message.len() as u16, u16::MAX] {
        data.extend_from_slice(&v.to_le_bytes());
    }
    data.extend_from_slice(&pk);
    data.extend_from_slice(&sig);
    data.extend_from_slice(message);
    Instruction { program_id: ED25519_ID, accounts: vec![], data }
}

fn prices(list: &[(Pubkey, u64)], timestamp: i64) -> PriceUpdate {
    PriceUpdate {
        mints: list.iter().map(|p| p.0).collect(),
        prices: list.iter().map(|p| p.1).collect(),
        timestamp,
    }
}

/// `[mint, vault_ata]` for every held mint, in order.
fn held_accounts(env: &Env, extra_recipient: Option<&Pubkey>) -> Vec<AccountMeta> {
    let v = vault_state(&env.svm, &env.vault);
    let mut metas = vec![];
    for mint in v.held {
        metas.push(AccountMeta::new_readonly(mint, false));
        metas.push(AccountMeta::new(ata(env, &env.vault, &mint), false));
        if let Some(owner) = extra_recipient {
            metas.push(AccountMeta::new(ata(env, owner, &mint), false));
        }
    }
    metas
}

fn setup() -> Env {
    let mut svm = LiteSVM::new();
    svm.add_program(folio_vault::id(), include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/folio_vault.so")))
        .unwrap();
    svm.add_program(mock_router::id(), include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/mock_router.so")))
        .unwrap();
    set_time(&mut svm, NOW);

    let (admin, guardian, manager) = (Keypair::new(), Keypair::new(), Keypair::new());
    for k in [&admin, &guardian, &manager] {
        svm.airdrop(&k.pubkey(), 100_000_000_000).unwrap();
    }
    let signer = SigningKey::from_bytes(&[7u8; 32]);
    let (usdc, aapl, nvda) = (Pubkey::new_unique(), Pubkey::new_unique(), Pubkey::new_unique());
    set_mint(&mut svm, usdc, 6, spl_token::ID);
    set_mint(&mut svm, aapl, 8, spl_token_2022::ID);
    set_mint(&mut svm, nvda, 8, spl_token::ID);
    let (registry, _) = Pubkey::find_program_address(&[b"registry"], &folio_vault::id());
    let (vault, _) =
        Pubkey::find_program_address(&[b"vault", registry.as_ref(), &0u64.to_le_bytes()], &folio_vault::id());

    let mut env = Env { svm, admin, guardian, manager, signer, registry, usdc, aapl, nvda, vault };

    let a = &env.admin;
    let init = ix(
        folio_vault::accounts::InitializeRegistry {
            admin: a.pubkey(),
            registry,
            settlement_mint: usdc,
            system_program: system_program::ID,
        },
        folio_vault::instruction::InitializeRegistry {
            guardian: env.guardian.pubkey(),
            price_signer: Pubkey::new_from_array(env.signer.verifying_key().to_bytes()),
        },
    );
    let admin_only = || folio_vault::accounts::AdminOnly { admin: a.pubkey(), registry };
    let allow_aapl = ix(admin_only(), folio_vault::instruction::SetAsset { mint: aapl, allowed: true });
    let allow_nvda = ix(admin_only(), folio_vault::instruction::SetAsset { mint: nvda, allowed: true });
    let allow_router =
        ix(admin_only(), folio_vault::instruction::SetRouter { program: mock_router::id(), allowed: true });
    send(&mut env.svm, &[init, allow_aapl, allow_nvda, allow_router], a, &[]).unwrap();

    // The mock router's pool, stocked with every token.
    let (pool, _) = Pubkey::find_program_address(&[b"pool"], &mock_router::id());
    for mint in [usdc, aapl, nvda] {
        let program = program_of(&env, &mint);
        let address = get_associated_token_address_with_program_id(&pool, &mint, &program);
        set_token_account(&mut env.svm, address, mint, pool, 1_000_000 * STOCK, program);
    }

    let m = env.manager.pubkey();
    let create = ix(
        folio_vault::accounts::CreateVault {
            payer: m,
            registry,
            vault,
            settlement_mint: usdc,
            vault_settlement: ata(&env, &vault, &usdc),
            token_program: spl_token::ID,
            associated_token_program: associated_token::ID,
            system_program: system_program::ID,
        },
        folio_vault::instruction::CreateVault { name: "Mag 7 Lite".into(), manager: m },
    );
    let manager = env.manager.insecure_clone();
    send(&mut env.svm, &[create], &manager, &[]).unwrap();
    env
}

fn new_investor(env: &mut Env, usdc_amount: u64) -> Keypair {
    let k = Keypair::new();
    env.svm.airdrop(&k.pubkey(), 10_000_000_000).unwrap();
    let address = ata(env, &k.pubkey(), &env.usdc);
    set_token_account(&mut env.svm, address, env.usdc, k.pubkey(), usdc_amount, spl_token::ID);
    // Empty stock accounts so a redeem has somewhere to pay out.
    for mint in [env.aapl, env.nvda] {
        let program = program_of(env, &mint);
        let address = ata(env, &k.pubkey(), &mint);
        set_token_account(&mut env.svm, address, mint, k.pubkey(), 0, program);
    }
    k
}

fn position_pda(env: &Env, owner: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"position", env.vault.as_ref(), owner.as_ref()], &folio_vault::id()).0
}

fn seed(env: &mut Env, who: &Keypair, amount: u64) -> Result<(), String> {
    let i = ix(
        folio_vault::accounts::Seed {
            investor: who.pubkey(),
            vault: env.vault,
            position: position_pda(env, &who.pubkey()),
            settlement_mint: env.usdc,
            investor_settlement: ata(env, &who.pubkey(), &env.usdc),
            vault_settlement: ata(env, &env.vault, &env.usdc),
            token_program: spl_token::ID,
            system_program: system_program::ID,
        },
        folio_vault::instruction::Seed { amount },
    );
    send(&mut env.svm, &[i], who, &[])
}

fn guardian_ix(env: &Env, which: &str) -> Instruction {
    let accounts =
        folio_vault::accounts::GuardianOnly { guardian: env.guardian.pubkey(), registry: env.registry, vault: env.vault };
    match which {
        "activate" => ix(accounts, folio_vault::instruction::Activate {}),
        "pause" => ix(accounts, folio_vault::instruction::Pause {}),
        _ => ix(accounts, folio_vault::instruction::Unpause {}),
    }
}

fn guardian(env: &mut Env, which: &str) -> Result<(), String> {
    let i = guardian_ix(env, which);
    let g = env.guardian.insecure_clone();
    send(&mut env.svm, &[i], &g, &[])
}

fn set_plan(env: &mut Env, text: &str) -> Result<(), String> {
    let i = ix(
        folio_vault::accounts::ManagerOnly { manager: env.manager.pubkey(), vault: env.vault },
        folio_vault::instruction::SetPlan { text: text.into() },
    );
    let m = env.manager.insecure_clone();
    send(&mut env.svm, &[i], &m, &[])
}

fn deposit_with(env: &mut Env, who: &Keypair, amount: u64, p: &PriceUpdate, key: &SigningKey) -> Result<(), String> {
    let mut i = ix(
        folio_vault::accounts::Deposit {
            investor: who.pubkey(),
            registry: env.registry,
            vault: env.vault,
            position: position_pda(env, &who.pubkey()),
            settlement_mint: env.usdc,
            investor_settlement: ata(env, &who.pubkey(), &env.usdc),
            vault_settlement: ata(env, &env.vault, &env.usdc),
            token_program: spl_token::ID,
            system_program: system_program::ID,
            instructions: solana_instructions_sysvar::ID,
        },
        folio_vault::instruction::Deposit { amount, min_shares: 0, prices: p.clone() },
    );
    i.accounts.extend(held_accounts(env, None));
    let sig = ed25519_ix(key, &p.message(&env.registry));
    send(&mut env.svm, &[sig, i], who, &[])
}

fn deposit(env: &mut Env, who: &Keypair, amount: u64, p: &PriceUpdate) -> Result<(), String> {
    let key = env.signer.clone();
    deposit_with(env, who, amount, p, &key)
}

fn redeem(env: &mut Env, who: &Keypair, shares: u64) -> Result<(), String> {
    let mut i = ix(
        folio_vault::accounts::Redeem {
            owner: who.pubkey(),
            vault: env.vault,
            position: position_pda(env, &who.pubkey()),
            token_program: spl_token::ID,
            token_2022_program: spl_token_2022::ID,
        },
        folio_vault::instruction::Redeem { shares, forfeit: vec![] },
    );
    i.accounts.extend(held_accounts(env, Some(&who.pubkey())));
    send(&mut env.svm, &[i], who, &[])
}

/// Sell `amount_in` of `sell` for `amount_out` of `buy` through the mock router.
fn rebalance(env: &mut Env, sell: Pubkey, buy: Pubkey, amount_in: u64, amount_out: u64, p: &PriceUpdate) -> Result<(), String> {
    rebalance_routed(env, sell, buy, sell, amount_in, amount_out, p)
}

/// Like `rebalance`, but the route actually sells `route_sell`, which may differ from the declared
/// `sell`: what a dishonest manager would try.
fn rebalance_routed(
    env: &mut Env,
    sell: Pubkey,
    buy: Pubkey,
    route_sell: Pubkey,
    amount_in: u64,
    amount_out: u64,
    p: &PriceUpdate,
) -> Result<(), String> {
    let (pool, _) = Pubkey::find_program_address(&[b"pool"], &mock_router::id());
    let (sp, bp, rp) = (program_of(env, &sell), program_of(env, &buy), program_of(env, &route_sell));
    let route = mock_router::accounts::Swap {
        user: env.vault,
        user_src: ata(env, &env.vault, &route_sell),
        user_dst: ata(env, &env.vault, &buy),
        pool,
        pool_src: get_associated_token_address_with_program_id(&pool, &route_sell, &rp),
        pool_dst: get_associated_token_address_with_program_id(&pool, &buy, &bp),
        src_mint: route_sell,
        dst_mint: buy,
        src_token_program: rp,
        dst_token_program: bp,
    }
    .to_account_metas(None)
    .into_iter()
    // The vault cannot sign the outer transaction; the program signs for it in the CPI.
    .map(|mut m| {
        if m.pubkey == env.vault {
            m.is_signer = false;
        }
        m
    });
    let route_data = mock_router::instruction::Swap { amount_in, amount_out }.data();
    let mut i = ix(
        folio_vault::accounts::Rebalance {
            manager: env.manager.pubkey(),
            registry: env.registry,
            vault: env.vault,
            sell_mint: sell,
            buy_mint: buy,
            vault_sell: ata(env, &env.vault, &sell),
            vault_buy: ata(env, &env.vault, &buy),
            router: mock_router::id(),
            sell_token_program: sp,
            buy_token_program: bp,
            associated_token_program: associated_token::ID,
            system_program: system_program::ID,
            instructions: solana_instructions_sysvar::ID,
        },
        folio_vault::instruction::Rebalance { max_sell: amount_in, min_buy: amount_out, route_data, prices: p.clone() },
    );
    i.accounts.extend(held_accounts(env, None));
    i.accounts.extend(route);
    let sig = ed25519_ix(&env.signer, &p.message(&env.registry));
    let m = env.manager.insecure_clone();
    send(&mut env.svm, &[sig, i], &m, &[])
}

/// A seeded, active vault with a plan: 100 USDC from the manager.
fn active_env() -> Env {
    let mut env = setup();
    let m = env.manager.insecure_clone();
    let address = ata(&env, &m.pubkey(), &env.usdc);
    set_token_account(&mut env.svm, address, env.usdc, m.pubkey(), 1_000 * USDC, spl_token::ID);
    seed(&mut env, &m, 100 * USDC).unwrap();
    guardian(&mut env, "activate").unwrap();
    set_plan(&mut env, "60% AAPL, 40% cash").unwrap();
    env
}

// ---- the story

#[test]
fn full_flow() {
    let mut env = active_env();
    let (usdc, aapl) = (env.usdc, env.aapl);
    let v = vault_state(&env.svm, &env.vault);
    assert_eq!(v.state, VaultState::Active);
    assert_eq!(v.total_shares, 100 * USDC);
    assert_eq!(position(&env.svm, &env.vault, &env.manager.pubkey()).shares, 100 * USDC - 1_000);
    assert_eq!(v.plan_version, 1);

    // Bob deposits 50 USDC into an all-cash vault: 1 share per USDC.
    let bob = new_investor(&mut env, 1_000 * USDC);
    let p = prices(&[], NOW);
    deposit(&mut env, &bob, 50 * USDC, &p).unwrap();
    assert_eq!(position(&env.svm, &env.vault, &bob.pubkey()).shares, 50 * USDC);

    // Manager buys 0.3 AAPL at $200 with 60 USDC.
    let p = prices(&[(aapl, 200 * USDC)], NOW);
    rebalance(&mut env, usdc, aapl, 60 * USDC, 30 * STOCK / 100, &p).unwrap();
    let v = vault_state(&env.svm, &env.vault);
    assert_eq!(v.held, vec![usdc, aapl]);
    assert_eq!(balance(&env.svm, &ata(&env, &env.vault, &aapl)), 30 * STOCK / 100);
    assert_eq!(balance(&env.svm, &ata(&env, &env.vault, &usdc)), 90 * USDC);

    // AAPL rises to $220: vault worth 90 + 66 = 156. Carol's 15.6 USDC buys 15 shares.
    set_time(&mut env.svm, NOW + 100);
    let carol = new_investor(&mut env, 1_000 * USDC);
    let p = prices(&[(aapl, 220 * USDC)], NOW + 100);
    deposit(&mut env, &carol, 15_600_000, &p).unwrap();
    assert_eq!(position(&env.svm, &env.vault, &carol.pubkey()).shares, 15 * USDC);

    // Bob leaves with 50/165 of everything.
    let supply = vault_state(&env.svm, &env.vault).total_shares;
    assert_eq!(supply, 165 * USDC);
    let vault_usdc = balance(&env.svm, &ata(&env, &env.vault, &usdc));
    let vault_aapl = balance(&env.svm, &ata(&env, &env.vault, &aapl));
    redeem(&mut env, &bob, 50 * USDC).unwrap();
    let bob_usdc = balance(&env.svm, &ata(&env, &bob.pubkey(), &usdc));
    let bob_aapl = balance(&env.svm, &ata(&env, &bob.pubkey(), &aapl));
    assert_eq!(bob_usdc, 950 * USDC + (vault_usdc as u128 * 50 / 165) as u64);
    assert_eq!(bob_aapl, (vault_aapl as u128 * 50 / 165) as u64);
    assert_eq!(position(&env.svm, &env.vault, &bob.pubkey()).shares, 0);
}

#[test]
fn sell_to_dust_drops_asset() {
    let mut env = active_env();
    let (usdc, aapl, nvda) = (env.usdc, env.aapl, env.nvda);
    let p = prices(&[(aapl, 200 * USDC), (nvda, 100 * USDC)], NOW);
    rebalance(&mut env, usdc, aapl, 20 * USDC, 10 * STOCK / 100, &p).unwrap();
    // Stock to stock, all of it: AAPL leaves the held list, NVDA joins.
    rebalance(&mut env, aapl, nvda, 10 * STOCK / 100, 20 * STOCK / 100, &p).unwrap();
    assert_eq!(vault_state(&env.svm, &env.vault).held, vec![usdc, nvda]);
}

// ---- refusals

#[test]
fn seed_below_minimum_fails() {
    let mut env = setup();
    let m = env.manager.insecure_clone();
    let address = ata(&env, &m.pubkey(), &env.usdc);
    set_token_account(&mut env.svm, address, env.usdc, m.pubkey(), 1_000 * USDC, spl_token::ID);
    let err = seed(&mut env, &m, 9 * USDC).unwrap_err();
    assert!(err.contains("BelowMinimumSeed"), "{err}");
}

#[test]
fn deposit_rejects_wrong_signer_and_stale_prices() {
    let mut env = active_env();
    let bob = new_investor(&mut env, 1_000 * USDC);
    let p = prices(&[], NOW);
    let err = deposit_with(&mut env, &bob, 10 * USDC, &p, &SigningKey::from_bytes(&[9u8; 32])).unwrap_err();
    assert!(err.contains("InvalidPriceSignature"), "{err}");

    let old = prices(&[], NOW - 61);
    let err = deposit(&mut env, &bob, 10 * USDC, &old).unwrap_err();
    assert!(err.contains("StalePrices"), "{err}");
}

#[test]
fn deposit_needs_price_for_every_held_stock() {
    let mut env = active_env();
    let (usdc, aapl) = (env.usdc, env.aapl);
    let p = prices(&[(aapl, 200 * USDC)], NOW);
    rebalance(&mut env, usdc, aapl, 20 * USDC, 10 * STOCK / 100, &p).unwrap();
    let bob = new_investor(&mut env, 1_000 * USDC);
    let err = deposit(&mut env, &bob, 10 * USDC, &prices(&[], NOW)).unwrap_err();
    assert!(err.contains("MissingPrice"), "{err}");
}

#[test]
fn pause_blocks_deposit_and_trade_but_not_redeem() {
    let mut env = active_env();
    let (usdc, aapl) = (env.usdc, env.aapl);
    let bob = new_investor(&mut env, 1_000 * USDC);
    deposit(&mut env, &bob, 10 * USDC, &prices(&[], NOW)).unwrap();
    guardian(&mut env, "pause").unwrap();

    let err = deposit(&mut env, &bob, 10 * USDC, &prices(&[], NOW)).unwrap_err();
    assert!(err.contains("WrongState"), "{err}");
    let p = prices(&[(aapl, 200 * USDC)], NOW);
    let err = rebalance(&mut env, usdc, aapl, 20 * USDC, 10 * STOCK / 100, &p).unwrap_err();
    assert!(err.contains("WrongState"), "{err}");
    redeem(&mut env, &bob, 10 * USDC).unwrap();
}

#[test]
fn rebalance_refuses_loss_over_two_percent() {
    let mut env = active_env();
    let (usdc, aapl) = (env.usdc, env.aapl);
    let p = prices(&[(aapl, 200 * USDC)], NOW);
    // 20 USDC for 0.097 AAPL ($19.40): a 3% loss.
    let err = rebalance(&mut env, usdc, aapl, 20 * USDC, 9_700_000, &p).unwrap_err();
    assert!(err.contains("TradeLossTooHigh"), "{err}");
    // 0.099 AAPL ($19.80): a 1% loss is fine.
    rebalance(&mut env, usdc, aapl, 20 * USDC, 9_900_000, &p).unwrap();
}

#[test]
fn rebalance_refuses_route_that_drains_another_holding() {
    let mut env = active_env();
    let (usdc, aapl, nvda) = (env.usdc, env.aapl, env.nvda);
    let p = prices(&[(aapl, 200 * USDC), (nvda, 100 * USDC)], NOW);
    rebalance(&mut env, usdc, aapl, 20 * USDC, 10 * STOCK / 100, &p).unwrap();
    // Declared: sell USDC for NVDA. The route really sells the vault's AAPL instead.
    let err = rebalance_routed(&mut env, usdc, nvda, aapl, 10 * STOCK / 100, 20 * STOCK / 100, &p).unwrap_err();
    assert!(err.contains("CollateralDecreased"), "{err}");
    assert_eq!(balance(&env.svm, &ata(&env, &env.vault, &aapl)), 10 * STOCK / 100);
}

#[test]
fn rebalance_needs_plan_and_manager() {
    let mut env = setup();
    let m = env.manager.insecure_clone();
    let address = ata(&env, &m.pubkey(), &env.usdc);
    set_token_account(&mut env.svm, address, env.usdc, m.pubkey(), 1_000 * USDC, spl_token::ID);
    seed(&mut env, &m, 100 * USDC).unwrap();
    guardian(&mut env, "activate").unwrap();
    let (usdc, aapl) = (env.usdc, env.aapl);
    let p = prices(&[(aapl, 200 * USDC)], NOW);
    let err = rebalance(&mut env, usdc, aapl, 20 * USDC, 10 * STOCK / 100, &p).unwrap_err();
    assert!(err.contains("NoPlanPosted"), "{err}");

    // Someone else cannot post the plan.
    let mallory = Keypair::new();
    env.svm.airdrop(&mallory.pubkey(), 1_000_000_000).unwrap();
    let i = ix(
        folio_vault::accounts::ManagerOnly { manager: mallory.pubkey(), vault: env.vault },
        folio_vault::instruction::SetPlan { text: "mine now".into() },
    );
    let err = send(&mut env.svm, &[i], &mallory, &[]).unwrap_err();
    assert!(err.contains("NotManager"), "{err}");
}

#[test]
fn rebalance_rejects_unlisted_asset_and_router() {
    let mut env = active_env();
    let usdc = env.usdc;
    let junk = Pubkey::new_unique();
    set_mint(&mut env.svm, junk, 8, spl_token::ID);
    let p = prices(&[(junk, 200 * USDC)], NOW);
    let err = rebalance(&mut env, usdc, junk, 20 * USDC, 10 * STOCK / 100, &p).unwrap_err();
    assert!(err.contains("AssetNotAllowed"), "{err}");

    let a = env.admin.insecure_clone();
    let off = ix(
        folio_vault::accounts::AdminOnly { admin: a.pubkey(), registry: env.registry },
        folio_vault::instruction::SetRouter { program: mock_router::id(), allowed: false },
    );
    send(&mut env.svm, &[off], &a, &[]).unwrap();
    let aapl = env.aapl;
    let p = prices(&[(aapl, 200 * USDC)], NOW);
    let err = rebalance(&mut env, usdc, aapl, 20 * USDC, 10 * STOCK / 100, &p).unwrap_err();
    assert!(err.contains("RouterNotAllowed"), "{err}");
}

#[test]
fn redeem_more_than_owned_fails() {
    let mut env = active_env();
    let bob = new_investor(&mut env, 1_000 * USDC);
    deposit(&mut env, &bob, 10 * USDC, &prices(&[], NOW)).unwrap();
    let err = redeem(&mut env, &bob, 11 * USDC).unwrap_err();
    assert!(err.contains("InsufficientShares"), "{err}");
}

#[test]
fn registry_is_set_up() {
    let env = setup();
    let r = Registry::try_deserialize(&mut &env.svm.get_account(&env.registry).unwrap().data[..]).unwrap();
    assert_eq!(r.admin, env.admin.pubkey());
    assert_eq!(r.vault_count, 1);
    assert_eq!(r.assets, vec![env.aapl, env.nvda]);
}
