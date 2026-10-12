'use client';

import {useMemo, useState} from 'react';
import {useConnection} from '@/lib/contracts/wallet';
import {AnimatedBrandFooter} from '@/components/AnimatedBrandFooter';
import {Header} from '@/components/Header';
import {FolioSelect} from '@/components/FolioSelect';
import {useVaults, type VaultView} from '@/lib/contracts/hooks';
import {appChainLabel} from '@/lib/contracts/wallet';
import {shortAddress} from '@/lib/domain/format';
import {ActivityPanel, ActivityStrip} from './ActivityPanel';
import {AssetMap} from './AssetMap';
import {CreateVaultCard} from './CreateVaultCard';
import {CuratorModal} from './CuratorModal';
import {PlanCard} from './PlanCard';
import {RebalanceCard} from './RebalanceCard';
import {sameAddress} from './model';
import {useCuratorActions} from './useCuratorActions';
import {VaultOverviewCard} from './VaultOverviewCard';

type ManagerTab = 'plan' | 'rebalance' | 'activity';
type MobileView = 'controls' | 'map';
type CuratorVaultScope = 'all' | 'managed';

export function CuratorConsole({artSample = false}: {artSample?: boolean} = {}) {
  const {address, isConnected} = useConnection();
  const {data: vaults = [], isLoading, error, refetch, isFetching} = useVaults();
  const {action, createAndSeed, seedExistingVault, activateVault} = useCuratorActions();
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [managerTab, setManagerTab] = useState<ManagerTab>('plan');
  const [mobileView, setMobileView] = useState<MobileView>('map');
  const [vaultScope, setVaultScope] = useState<CuratorVaultScope>('all');
  const [createOpen, setCreateOpen] = useState(false);

  const managed = useMemo(() => vaults.filter((vault) => sameAddress(vault.manager, address)).sort((left, right) => left.address.localeCompare(right.address)), [address, vaults]);
  const visibleVaults = vaultScope === 'managed' ? managed : vaults;
  const selected = visibleVaults.find((vault) => vault.address === selectedAddress) ?? (vaultScope === 'all' ? managed[0] : null) ?? visibleVaults[0] ?? null;
  const managerAllowed = Boolean(address && selected && sameAddress(selected.manager, address));

  return (
    <div className="min-h-[100dvh] bg-[#ebeee7]">
      <Header />
      <main className="site-container py-7 sm:py-10">
        <div className="mb-7 flex flex-col gap-5 border-b border-[#aeb8ad] pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="eyebrow">Curator studio · {appChainLabel}</p><h1 className="font-editorial mt-3 text-[clamp(34px,5vw,58px)] font-medium leading-none tracking-[-0.045em]">Manage the route.</h1></div>
          <button type="button" onClick={() => setCreateOpen(true)} className="folio-button-primary self-start sm:self-auto">+ Create vault</button>
        </div>

        <div className="folio-segmented mb-5 grid w-full grid-cols-2 md:hidden">
          <MobileToggle active={mobileView === 'controls'} onClick={() => setMobileView('controls')}>Manager console</MobileToggle>
          <MobileToggle active={mobileView === 'map'} onClick={() => setMobileView('map')}>Capital map</MobileToggle>
        </div>

        <div className="grid min-h-[680px] gap-6 md:grid-cols-[370px_minmax(0,1fr)]">
          <aside className={`${mobileView === 'controls' ? 'flex' : 'hidden'} flex-col border border-[#c2c9c0] bg-[#f7f8f3]/60 md:flex`}>
            <div className="border-b border-[#cdd3ca] p-4">
              <VaultPicker connected={isConnected} vaults={visibleVaults} scope={vaultScope} selected={selected} loading={isLoading} refreshing={isFetching} error={error instanceof Error ? error.message : null} onSelect={(next) => { setSelectedAddress(next); setManagerTab('plan'); }} onRefresh={() => void refetch()} />
            </div>

            <div className="flex-1">
              {selected ? (
                <>
                  <VaultStatus
                    vault={selected}
                    managerAllowed={managerAllowed}
                    action={action}
                    onSeed={() => void seedExistingVault(selected.address)}
                    onActivate={() => void activateVault(selected.address)}
                  />
                  <VaultOverviewCard vault={selected} />
                  <div className="border-y border-[#cdd3ca] bg-[#f1f3ee] p-2">
                    <div className="folio-segmented grid w-full grid-cols-3">
                      <TabButton active={managerTab === 'plan'} onClick={() => setManagerTab('plan')}>Plan</TabButton>
                      <TabButton active={managerTab === 'rebalance'} onClick={() => setManagerTab('rebalance')}>Rebalance</TabButton>
                      <TabButton active={managerTab === 'activity'} onClick={() => setManagerTab('activity')}>Activity</TabButton>
                    </div>
                  </div>
                  <div className="p-4">
                    {managerTab === 'plan' ? <PlanCard key={`${selected.address}-${selected.plan?.version ?? 0}`} vault={selected} managerAllowed={managerAllowed} /> : managerTab === 'rebalance' ? <RebalanceCard key={`${selected.address}-${selected.plan?.version ?? 0}-${selected.holdings.map((holding) => `${holding.asset}:${holding.amount}`).join('|')}`} vault={selected} managerAllowed={managerAllowed} /> : <ActivityPanel vaultName={selected.name} vaultAddress={selected.address} />}
                  </div>
                </>
              ) : (
                <div className="grid min-h-full place-items-center p-8 text-center"><div><span className="font-editorial text-[52px] text-[#849087]">V</span><p className="font-editorial mt-3 text-[25px] font-medium">{vaultScope === 'managed' ? 'No managed vaults' : 'No vaults visible'}</p><p className="mt-3 text-[12px] leading-6 text-[#6b746c]">{vaultScope === 'managed' ? (isConnected ? 'This wallet does not manage a vault yet. Create one or refresh after it is indexed.' : 'Connect the manager wallet to load its managed vault islands.') : 'No curator vaults are currently available. Refresh after a vault is indexed.'}</p><button type="button" onClick={() => setCreateOpen(true)} className="folio-button-primary mt-6">Create investment pool</button></div></div>
              )}
            </div>
          </aside>

          <section className={`${mobileView === 'map' ? 'flex' : 'hidden'} map-frame relative h-[620px] flex-col md:flex md:h-auto md:min-h-[680px]`}>
            <AssetMap
              vaults={visibleVaults}
              selectedAddress={selected?.address ?? null}
              connectedAddress={address}
              artSample={artSample}
              sizeByValue
              toolbar={<CuratorVaultScopeFilter scope={vaultScope} onChange={(scope) => { setVaultScope(scope); setSelectedAddress(null); }} />}
              emptyTitle={vaultScope === 'managed' ? (isConnected ? 'NO_MANAGED_VAULTS' : 'CONNECT_MANAGER_WALLET') : 'NO_VAULTS_MAPPED'}
              emptyDetail={vaultScope === 'managed' ? (isConnected ? 'CREATE A VAULT OR REFRESH AFTER INDEXING.' : 'CONNECT THE MANAGER WALLET TO VIEW MANAGED VAULTS.') : 'CREATE THE FIRST VAULT OR REFRESH AFTER INDEXING.'}
              onSelect={(vault) => { setSelectedAddress(vault); setMobileView('controls'); }}
            />
            {selected && <ActivityStrip vaultName={selected.name} vaultAddress={selected.address} onOpen={() => { setManagerTab('activity'); setMobileView('controls'); }} />}
          </section>
        </div>
      </main>

      <AnimatedBrandFooter />

      <CuratorModal open={createOpen} title="Create and seed a vault" onClose={() => setCreateOpen(false)}>
        <CreateVaultCard connected={isConnected} deploymentReady action={action} onCreate={createAndSeed} onCreated={(vault) => { setSelectedAddress(vault); setCreateOpen(false); setMobileView('controls'); void refetch(); }} />
      </CuratorModal>
    </div>
  );
}

interface VaultPickerProps { connected: boolean; vaults: VaultView[]; scope: CuratorVaultScope; selected: VaultView | null; loading: boolean; refreshing: boolean; error: string | null; onSelect: (address: string) => void; onRefresh: () => void; }

function VaultPicker({connected, vaults, scope, selected, loading, refreshing, error, onSelect, onRefresh}: VaultPickerProps) {
  const scopeLabel = scope === 'managed' ? 'Managed vault' : 'All vaults';
  const message = error ? `Vault API unavailable: ${error}` : loading ? 'Loading vaults…' : scope === 'managed' && !connected ? 'Connect manager wallet' : vaults.length === 0 ? (scope === 'managed' ? 'No vaults managed by this wallet' : 'No vaults available') : null;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between"><span className="eyebrow">{scopeLabel}</span><button type="button" onClick={onRefresh} disabled={refreshing} className="folio-button-quiet min-h-0 px-2 py-1 text-[10px]">{refreshing ? 'Refreshing…' : 'Refresh'}</button></div>
      {message ? <p className={`border-b border-[#cdd3ca] py-3 text-[11px] ${error ? 'text-[#a14343]' : 'text-[#6b746c]'}`} title={message}>{message}</p> : <FolioSelect ariaLabel={`Selected ${scopeLabel.toLowerCase()}`} value={selected?.address ?? ''} onChange={onSelect} options={vaults.map((vault) => ({value: vault.address, label: `${vault.name} (${vault.symbol})`}))} className="text-[12px] font-semibold" />}
    </div>
  );
}

function CuratorVaultScopeFilter({scope, onChange}: {scope: CuratorVaultScope; onChange: (scope: CuratorVaultScope) => void}) {
  return (
    <div className="flex min-w-0 border border-[#46504c] bg-[#0a0e0d]" aria-label="Vault scope">
      <button type="button" onClick={() => onChange('all')} className="h-10 whitespace-nowrap px-4 font-mono text-[13px] tracking-[0.12em] text-[#b8c0ba] transition-colors sm:text-[15px]" data-active={scope === 'all'} style={scope === 'all' ? {background: '#214e45', color: '#72f3d6'} : undefined}>All islands</button>
      <button type="button" onClick={() => onChange('managed')} className="h-10 whitespace-nowrap border-l border-[#46504c] px-4 font-mono text-[13px] tracking-[0.12em] text-[#b8c0ba] transition-colors sm:text-[15px]" data-active={scope === 'managed'} style={scope === 'managed' ? {background: '#214e45', color: '#72f3d6'} : undefined}>Managed vaults</button>
    </div>
  );
}

function VaultStatus({
  vault,
  managerAllowed,
  action,
  onSeed,
  onActivate,
}: {
  vault: VaultView;
  managerAllowed: boolean;
  action: string;
  onSeed?: () => void;
  onActivate?: () => void;
}) {
  const busy = action === 'approving' || action === 'seeding' || action === 'activating';

  return (
    <div className="border-b border-[#cdd3ca] px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[10px] text-[#717b72]">Manager {shortAddress(vault.manager)}</p>
        <span
          className={`folio-status ${
            vault.state === 'ACTIVE'
              ? 'folio-status-active'
              : vault.state === 'CLOSED'
                ? 'folio-status-closed'
                : 'folio-status-neutral'
          }`}
        >
          {vault.state}
        </span>
      </div>

      {vault.state === 'DRAFT' && managerAllowed && (
        <div className="mt-4 border-l-2 border-[#b18b15] pl-3 text-[11px] leading-5 text-[#6f5c0d]">
          <strong className="block text-[#171c18]">Vault in DRAFT — Initial Seed Required</strong>
          <p className="mt-1 text-[#717b72]">
            This vault is deployed on-chain but needs an initial seed deposit (min 10 USDC) to become active.
          </p>
          <button
            type="button"
            onClick={onSeed}
            disabled={busy}
            className="folio-button-primary mt-2 min-h-0 px-3 py-1 text-[11px]"
          >
            {action === 'approving' ? 'Preparing…' : action === 'seeding' ? 'Seeding Vault…' : 'Deposit 10 USDC Seed →'}
          </button>
        </div>
      )}

      {vault.state === 'SEEDED' && (
        <div className="mt-4 border-l-2 border-[#b18b15] pl-3 text-[11px] leading-5 text-[#6f5c0d]">
          <strong className="block text-[#171c18]">Waiting for Guardian activation</strong>
          <p className="mt-1 text-[#717b72]">
            Initial deposit received! Manager trading remains locked until <code>activate()</code> is confirmed.
          </p>
          {managerAllowed && (
            <button
              type="button"
              onClick={onActivate}
              disabled={busy}
              className="folio-button-primary mt-2 min-h-0 px-3 py-1 text-[11px]"
            >
              {action === 'activating' ? 'Activating…' : 'Activate Vault (Guardian) →'}
            </button>
          )}
        </div>
      )}

      {!managerAllowed && (
        <p className="mt-4 border-l-2 border-[#a14343] pl-3 text-[11px] leading-5 text-[#8f3e3e]">
          Manager actions are disabled for this wallet.
        </p>
      )}
    </div>
  );
}

function TabButton({active, onClick, children}: {active: boolean; onClick: () => void; children: React.ReactNode}) { return <button type="button" onClick={onClick} className="folio-segment" data-active={active}>{children}</button>; }
function MobileToggle({active, onClick, children}: {active: boolean; onClick: () => void; children: React.ReactNode}) { return <button type="button" onClick={onClick} className="folio-segment" data-active={active}>{children}</button>; }
