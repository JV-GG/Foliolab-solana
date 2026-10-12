//! The whole Folio Lab V2 flow on LiteSVM: registry, vault, seed, strategy with target weights,
//! activate, plan, deposit with signed prices, keeper-executed rebalance toward target weights,
//! redeem; plus the governance flow (propose with SOL bond, vote, timelock, execute, refund on reject).

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
    folio_vault::{
        PriceUpdate, Proposal, ProposalStatus, Registry, Target, Vault, VaultState, Position,
        DAY, KEEPER_FEE_LAMPORTS, MIN_PROPOSAL_BOND, TIMELOCK_SECS,
    },
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
    keeper: Keypair,
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

fn proposal_state(svm: &LiteSVM, proposal: &Pubkey) -> Proposal {
    Proposal::try_deserialize(&mut &svm.get_account(proposal).unwrap().data[..]).unwrap()
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

    let (admin, guardian, manager, keeper) = (Keypair::new(), Keypair::new(), Keypair::new(), Keypair::new());
    for k in [&admin, &guardian, &manager, &keeper] {
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

    let mut env = Env { svm, admin, guardian, manager, keeper, signer, registry, usdc, aapl, nvda, vault };

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
    let set_keeper = ix(admin_only(), folio_vault::instruction::SetKeeper { keeper: env.keeper.pubkey() });
    send(&mut env.svm, &[init, allow_aapl, allow_nvda, allow_router, set_keeper], a, &[]).unwrap();

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

fn set_strategy(env: &mut Env, text: &str, targets: Vec<Target>) -> Result<(), String> {
    let i = ix(
        folio_vault::accounts::ManagerOnly {
            manager: env.manager.pubkey(),
            registry: env.registry,
            vault: env.vault,
        },
        folio_vault::instruction::SetStrategy { text: text.into(), targets },
    );
    let m = env.manager.insecure_clone();
    send(&mut env.svm, &[i], &m, &[])
}

fn fund_gas(env: &mut Env, who: &Keypair, amount: u64) -> Result<(), String> {
    let i = ix(
        folio_vault::accounts::FundGas {
            funder: who.pubkey(),
            vault: env.vault,
            system_program: system_program::ID,
        },
        folio_vault::instruction::FundGas { amount },
    );
    send(&mut env.svm, &[i], who, &[])
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

fn rebalance(env: &mut Env, sell: Pubkey, buy: Pubkey, amount_in: u64, amount_out: u64, p: &PriceUpdate) -> Result<(), String> {
    rebalance_routed(env, sell, buy, sell, amount_in, amount_out, p)
}

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
    .map(|mut m| {
        if m.pubkey == env.vault {
            m.is_signer = false;
        }
        m
    });
    let route_data = mock_router::instruction::Swap { amount_in, amount_out }.data();
    let mut i = ix(
        folio_vault::accounts::Rebalance {
            keeper: env.keeper.pubkey(),
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
    let k = env.keeper.insecure_clone();
    send(&mut env.svm, &[sig, i], &k, &[])
}

/// A seeded, active vault with target weights: 60% AAPL, 40% USDC; seeded with 100 USDC and 0.1 SOL gas.
fn active_env() -> Env {
    let mut env = setup();
    let m = env.manager.insecure_clone();
    let address = ata(&env, &m.pubkey(), &env.usdc);
    set_token_account(&mut env.svm, address, env.usdc, m.pubkey(), 1_000 * USDC, spl_token::ID);
    seed(&mut env, &m, 100 * USDC).unwrap();
    let (aapl, usdc) = (env.aapl, env.usdc);
    set_strategy(&mut env, "60% AAPL, 40% cash", vec![Target { mint: aapl, bps: 6000 }, Target { mint: usdc, bps: 4000 }]).unwrap();
    guardian(&mut env, "activate").unwrap();
    fund_gas(&mut env, &m, 100_000_000).unwrap();
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
    assert_eq!(v.gas_tank, 100_000_000);

    // Bob deposits 50 USDC into an all-cash vault: 1 share per USDC.
    let bob = new_investor(&mut env, 1_000 * USDC);
    let p = prices(&[], NOW);
    deposit(&mut env, &bob, 50 * USDC, &p).unwrap();
    assert_eq!(position(&env.svm, &env.vault, &bob.pubkey()).shares, 50 * USDC);

    // Keeper buys 0.3 AAPL at $200 with 60 USDC (total value 150; 60 USDC = 40% AAPL, within 60% target).
    let p = prices(&[(aapl, 200 * USDC)], NOW);
    let keeper_pre_lamports = env.svm.get_account(&env.keeper.pubkey()).unwrap().lamports;
    rebalance(&mut env, usdc, aapl, 60 * USDC, 30 * STOCK / 100, &p).unwrap();
    let v = vault_state(&env.svm, &env.vault);
    assert_eq!(v.held, vec![usdc, aapl]);
    assert_eq!(balance(&env.svm, &ata(&env, &env.vault, &aapl)), 30 * STOCK / 100);
    assert_eq!(balance(&env.svm, &ata(&env, &env.vault, &usdc)), 90 * USDC);
    assert_eq!(v.gas_tank, 100_000_000 - KEEPER_FEE_LAMPORTS);
    let keeper_post_lamports = env.svm.get_account(&env.keeper.pubkey()).unwrap().lamports;
    assert!(keeper_post_lamports > keeper_pre_lamports - 10_000_000);

    // Carol deposits at new share valuation.
    set_time(&mut env.svm, NOW + 100);
    let carol = new_investor(&mut env, 1_000 * USDC);
    let p = prices(&[(aapl, 220 * USDC)], NOW + 100);
    deposit(&mut env, &carol, 15_600_000, &p).unwrap();
    assert_eq!(position(&env.svm, &env.vault, &carol.pubkey()).shares, 15 * USDC);

    // Bob redeems pro-rata slice.
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

// ---- governance & proposal tests

#[test]
fn governance_proposal_passed_and_executed() {
    let mut env = active_env();
    let (_aapl, nvda, usdc) = (env.aapl, env.nvda, env.usdc);
    let bob = new_investor(&mut env, 1_000 * USDC);
    let p = prices(&[], NOW);
    deposit(&mut env, &bob, 100 * USDC, &p).unwrap(); // Bob holds 100 shares

    // Curator proposes 50% NVDA, 50% USDC with 0.05 SOL bond
    let (proposal_pda, _) = Pubkey::find_program_address(&[b"proposal", env.vault.as_ref(), &0u64.to_le_bytes()], &folio_vault::id());
    let propose_ix = ix(
        folio_vault::accounts::Propose {
            manager: env.manager.pubkey(),
            registry: env.registry,
            vault: env.vault,
            proposal: proposal_pda,
            system_program: system_program::ID,
        },
        folio_vault::instruction::Propose {
            targets: vec![Target { mint: nvda, bps: 5000 }, Target { mint: usdc, bps: 5000 }],
            plan: "Pivot into NVDA".into(),
            voting_days: 3,
            bond: MIN_PROPOSAL_BOND,
        },
    );
    let m = env.manager.insecure_clone();
    send(&mut env.svm, &[propose_ix], &m, &[]).unwrap();

    let prop = proposal_state(&env.svm, &proposal_pda);
    assert_eq!(prop.status, ProposalStatus::Voting);
    assert_eq!(prop.total_shares, 200 * USDC);

    // Bob votes Yes (100 shares = 50% quorum, >50% approval)
    let (vote_pda, _) = Pubkey::find_program_address(&[b"vote", proposal_pda.as_ref(), bob.pubkey().as_ref()], &folio_vault::id());
    let vote_ix = ix(
        folio_vault::accounts::Vote {
            voter: bob.pubkey(),
            vault: env.vault,
            proposal: proposal_pda,
            position: position_pda(&env, &bob.pubkey()),
            vote_record: vote_pda,
            system_program: system_program::ID,
        },
        folio_vault::instruction::Vote { approve: true },
    );
    send(&mut env.svm, &[vote_ix], &bob, &[]).unwrap();

    // Fast-forward past voting period
    set_time(&mut env.svm, NOW + 4 * DAY);

    // Finalize
    let finalize_ix = ix(
        folio_vault::accounts::Finalize {
            vault: env.vault,
            proposal: proposal_pda,
            proposer: env.manager.pubkey(),
        },
        folio_vault::instruction::Finalize {},
    );
    send(&mut env.svm, &[finalize_ix], &bob, &[]).unwrap();

    let prop = proposal_state(&env.svm, &proposal_pda);
    assert_eq!(prop.status, ProposalStatus::Queued);

    // During timelock, execute fails
    let execute_ix = ix(
        folio_vault::accounts::Execute {
            vault: env.vault,
            proposal: proposal_pda,
        },
        folio_vault::instruction::Execute {},
    );
    let err = send(&mut env.svm, &[execute_ix.clone()], &bob, &[]).unwrap_err();
    assert!(err.contains("TimelockActive"), "{err}");

    // Fast-forward past timelock
    set_time(&mut env.svm, NOW + 4 * DAY + TIMELOCK_SECS + 1);
    send(&mut env.svm, &[execute_ix], &bob, &[]).unwrap();

    let v = vault_state(&env.svm, &env.vault);
    assert_eq!(v.targets, vec![Target { mint: nvda, bps: 5000 }, Target { mint: usdc, bps: 5000 }]);
    assert_eq!(v.plan, "Pivot into NVDA");
    assert_eq!(v.gas_tank, 100_000_000 + MIN_PROPOSAL_BOND);
}

#[test]
fn governance_proposal_rejected_refunds_bond() {
    let mut env = active_env();
    let (nvda, usdc) = (env.nvda, env.usdc);
    let bob = new_investor(&mut env, 1_000 * USDC);
    let p = prices(&[], NOW);
    deposit(&mut env, &bob, 100 * USDC, &p).unwrap();

    let (proposal_pda, _) = Pubkey::find_program_address(&[b"proposal", env.vault.as_ref(), &0u64.to_le_bytes()], &folio_vault::id());
    let propose_ix = ix(
        folio_vault::accounts::Propose {
            manager: env.manager.pubkey(),
            registry: env.registry,
            vault: env.vault,
            proposal: proposal_pda,
            system_program: system_program::ID,
        },
        folio_vault::instruction::Propose {
            targets: vec![Target { mint: nvda, bps: 5000 }, Target { mint: usdc, bps: 5000 }],
            plan: "Bad idea".into(),
            voting_days: 2,
            bond: MIN_PROPOSAL_BOND,
        },
    );
    let m = env.manager.insecure_clone();
    send(&mut env.svm, &[propose_ix], &m, &[]).unwrap();

    let (vote_pda, _) = Pubkey::find_program_address(&[b"vote", proposal_pda.as_ref(), bob.pubkey().as_ref()], &folio_vault::id());
    let vote_ix = ix(
        folio_vault::accounts::Vote {
            voter: bob.pubkey(),
            vault: env.vault,
            proposal: proposal_pda,
            position: position_pda(&env, &bob.pubkey()),
            vote_record: vote_pda,
            system_program: system_program::ID,
        },
        folio_vault::instruction::Vote { approve: false },
    );
    send(&mut env.svm, &[vote_ix], &bob, &[]).unwrap();

    set_time(&mut env.svm, NOW + 3 * DAY);

    let mgr_pre_lamports = env.svm.get_account(&env.manager.pubkey()).unwrap().lamports;
    let finalize_ix = ix(
        folio_vault::accounts::Finalize {
            vault: env.vault,
            proposal: proposal_pda,
            proposer: env.manager.pubkey(),
        },
        folio_vault::instruction::Finalize {},
    );
    send(&mut env.svm, &[finalize_ix], &bob, &[]).unwrap();

    let prop = proposal_state(&env.svm, &proposal_pda);
    assert_eq!(prop.status, ProposalStatus::Rejected);
    let mgr_post_lamports = env.svm.get_account(&env.manager.pubkey()).unwrap().lamports;
    assert_eq!(mgr_post_lamports, mgr_pre_lamports + MIN_PROPOSAL_BOND);
}

// ---- refusals & constraints

#[test]
fn strategy_locked_after_activation() {
    let mut env = active_env();
    let (aapl, usdc) = (env.aapl, env.usdc);
    let err = set_strategy(&mut env, "change now", vec![Target { mint: aapl, bps: 5000 }, Target { mint: usdc, bps: 5000 }]).unwrap_err();
    assert!(err.contains("StrategyLocked"), "{err}");
}

#[test]
fn rebalance_needs_keeper() {
    let mut env = active_env();
    let (usdc, aapl) = (env.usdc, env.aapl);
    let p = prices(&[(aapl, 200 * USDC)], NOW);

    // Mallory tries to crank rebalance
    let mallory = Keypair::new();
    env.svm.airdrop(&mallory.pubkey(), 1_000_000_000).unwrap();
    let (pool, _) = Pubkey::find_program_address(&[b"pool"], &mock_router::id());
    let (sp, bp) = (program_of(&env, &usdc), program_of(&env, &aapl));
    let route = mock_router::accounts::Swap {
        user: env.vault,
        user_src: ata(&env, &env.vault, &usdc),
        user_dst: ata(&env, &env.vault, &aapl),
        pool,
        pool_src: get_associated_token_address_with_program_id(&pool, &usdc, &sp),
        pool_dst: get_associated_token_address_with_program_id(&pool, &aapl, &bp),
        src_mint: usdc,
        dst_mint: aapl,
        src_token_program: sp,
        dst_token_program: bp,
    }
    .to_account_metas(None)
    .into_iter()
    .map(|mut m| {
        if m.pubkey == env.vault {
            m.is_signer = false;
        }
        m
    });
    let route_data = mock_router::instruction::Swap { amount_in: 10 * USDC, amount_out: 5 * STOCK / 100 }.data();
    let mut i = ix(
        folio_vault::accounts::Rebalance {
            keeper: mallory.pubkey(),
            registry: env.registry,
            vault: env.vault,
            sell_mint: usdc,
            buy_mint: aapl,
            vault_sell: ata(&env, &env.vault, &usdc),
            vault_buy: ata(&env, &env.vault, &aapl),
            router: mock_router::id(),
            sell_token_program: sp,
            buy_token_program: bp,
            associated_token_program: associated_token::ID,
            system_program: system_program::ID,
            instructions: solana_instructions_sysvar::ID,
        },
        folio_vault::instruction::Rebalance { max_sell: 10 * USDC, min_buy: 5 * STOCK / 100, route_data, prices: p.clone() },
    );
    i.accounts.extend(held_accounts(&env, None));
    i.accounts.extend(route);
    let sig = ed25519_ix(&env.signer, &p.message(&env.registry));
    let err = send(&mut env.svm, &[sig, i], &mallory, &[]).unwrap_err();
    assert!(err.contains("NotKeeper"), "{err}");
}

#[test]
fn rebalance_refuses_selling_underweight() {
    let mut env = active_env();
    let (usdc, aapl) = (env.usdc, env.aapl);
    let p = prices(&[(aapl, 200 * USDC)], NOW);

    // Buy a small amount of AAPL (10 USDC = 10% portfolio value, target is 60%)
    rebalance(&mut env, usdc, aapl, 10 * USDC, 5 * STOCK / 100, &p).unwrap();

    // Now AAPL is held at 10% weight (< 60% target). Selling AAPL for USDC must be rejected!
    let err = rebalance(&mut env, aapl, usdc, 2 * STOCK / 100, 4 * USDC, &p).unwrap_err();
    assert!(err.contains("SellNotOverweight"), "{err}");
}

#[test]
fn rebalance_refuses_overshoot() {
    let mut env = active_env();
    let (usdc, aapl) = (env.usdc, env.aapl);
    let p = prices(&[(aapl, 200 * USDC)], NOW);

    // Total value = 100 USDC. Target for AAPL is 60% (60 USDC).
    // Trying to buy 80 USDC worth of AAPL overshoots the 60% + 1% drift band limit.
    let err = rebalance(&mut env, usdc, aapl, 80 * USDC, 40 * STOCK / 100, &p).unwrap_err();
    assert!(err.contains("TargetOvershoot"), "{err}");
}

#[test]
fn rebalance_refuses_too_soon() {
    let mut env = active_env();
    let (usdc, aapl) = (env.usdc, env.aapl);
    let p = prices(&[(aapl, 200 * USDC)], NOW);

    // First swap in cycle starts cycle at NOW
    rebalance(&mut env, usdc, aapl, 30 * USDC, 15 * STOCK / 100, &p).unwrap();

    // 1 hour later (outside REBALANCE_WINDOW 15 min, but before 12 hours) -> refused!
    set_time(&mut env.svm, NOW + 3_600);
    let p_future = prices(&[(aapl, 200 * USDC)], NOW + 3_600);
    let err = rebalance(&mut env, usdc, aapl, 10 * USDC, 5 * STOCK / 100, &p_future).unwrap_err();
    assert!(err.contains("RebalanceTooSoon"), "{err}");
}


#[test]
fn rebalance_refuses_empty_gas_tank() {
    let mut env = setup();
    let m = env.manager.insecure_clone();
    let address = ata(&env, &m.pubkey(), &env.usdc);
    set_token_account(&mut env.svm, address, env.usdc, m.pubkey(), 1_000 * USDC, spl_token::ID);
    seed(&mut env, &m, 100 * USDC).unwrap();
    let (aapl, usdc) = (env.aapl, env.usdc);
    set_strategy(&mut env, "60/40", vec![Target { mint: aapl, bps: 6000 }, Target { mint: usdc, bps: 4000 }]).unwrap();
    guardian(&mut env, "activate").unwrap();
    // Gas tank is 0!
    let p = prices(&[(aapl, 200 * USDC)], NOW);
    let err = rebalance(&mut env, usdc, aapl, 20 * USDC, 10 * STOCK / 100, &p).unwrap_err();
    assert!(err.contains("GasTankEmpty"), "{err}");
}

#[test]
fn pause_blocks_deposit_and_rebalance_not_redeem() {
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
fn registry_is_set_up() {
    let env = setup();
    let r = Registry::try_deserialize(&mut &env.svm.get_account(&env.registry).unwrap().data[..]).unwrap();
    assert_eq!(r.admin, env.admin.pubkey());
    assert_eq!(r.vault_count, 1);
    assert_eq!(r.assets, vec![env.aapl, env.nvda]);
    assert_eq!(r.keeper, env.keeper.pubkey());
}
