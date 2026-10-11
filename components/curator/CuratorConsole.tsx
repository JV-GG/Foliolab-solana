'use client';

import {useMemo, useState} from 'react';
import type {Address} from 'viem';
import {useChainId, useConnection} from 'wagmi';
import {AnimatedBrandFooter} from '@/components/AnimatedBrandFooter';
import {Header} from '@/components/Header';
import {useVaults, type VaultView} from '@/lib/contracts/hooks';
import {deploymentFor} from '@/lib/contracts/addresses';
import {appChainLabel} from '@/lib/contracts/wagmi';
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

export function CuratorConsole({artSample = false}: {artSample?: boolean} = {}) {
  const {address, isConnected} = useConnection();
  const chainId = useChainId();
  const {data: vaults = [], isLoading, error, refetch, isFetching} = useVaults();
  const {action, createAndSeed, seedExistingVault, activateVault} = useCuratorActions();
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [managerTab, setManagerTab] = useState<ManagerTab>('plan');
  const [mobileView, setMobileView] = useState<MobileView>('map');
  const [createOpen, setCreateOpen] = useState(false);

  const managed = useMemo(() => vaults.filter((vault) => sameAddress(vault.manager, address)).sort((left, right) => left.address.localeCompare(right.address)), [address, vaults]);
  const selected = managed.find((vault) => vault.address === selectedAddress) ?? managed[0] ?? null;
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
              <VaultPicker connected={isConnected} managed={managed} selected={selected} loading={isLoading} refreshing={isFetching} error={error instanceof Error ? error.message : null} onSelect={(next) => { setSelectedAddress(next); setManagerTab('plan'); }} onRefresh={() => void refetch()} />
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
                <div className="grid min-h-full place-items-center p-8 text-center"><div><span className="font-editorial text-[52px] text-[#849087]">V</span><p className="font-editorial mt-3 text-[25px] font-medium">No managed vaults</p><p className="mt-3 text-[12px] leading-6 text-[#6b746c]">{isConnected ? 'This wallet does not manage a vault yet. Create one or refresh after it is indexed.' : 'Connect the manager wallet to load its vault islands.'}</p><button type="button" onClick={() => setCreateOpen(true)} className="folio-button-primary mt-6">Create investment pool</button></div></div>
              )}
            </div>
          </aside>

          <section className={`${mobileView === 'map' ? 'flex' : 'hidden'} map-frame relative h-[620px] flex-col md:flex md:h-auto md:min-h-[680px]`}>
            <AssetMap vaults={managed} selectedAddress={selected?.address ?? null} connectedAddress={address} artSample={artSample} onSelect={(vault) => { setSelectedAddress(vault); setMobileView('controls'); }} />
            {selected && <ActivityStrip vaultName={selected.name} vaultAddress={selected.address} onOpen={() => { setManagerTab('activity'); setMobileView('controls'); }} />}
          </section>
        </div>
      </main>

      <AnimatedBrandFooter />

      <CuratorModal open={createOpen} title="Create and seed a vault" onClose={() => setCreateOpen(false)}>
        <CreateVaultCard connected={isConnected} deploymentReady={Boolean(deploymentFor(chainId))} action={action} onCreate={createAndSeed} onCreated={(vault) => { setSelectedAddress(vault); setCreateOpen(false); setMobileView('controls'); void refetch(); }} />
      </CuratorModal>
    </div>
  );
}

interface VaultPickerProps { connected: boolean; managed: VaultView[]; selected: VaultView | null; loading: boolean; refreshing: boolean; error: string | null; onSelect: (address: Address) => void; onRefresh: () => void; }

function VaultPicker({connected, managed, selected, loading, refreshing, error, onSelect, onRefresh}: VaultPickerProps) {
  const message = !connected ? 'Connect manager wallet' : error ? `Vault API unavailable: ${error}` : loading ? 'Loading managed vaults…' : managed.length === 0 ? 'No vaults managed by this wallet' : null;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between"><span className="eyebrow">Managed vault</span><button type="button" onClick={onRefresh} disabled={refreshing} className="folio-button-quiet min-h-0 px-2 py-1 text-[10px]">{refreshing ? 'Refreshing…' : 'Refresh'}</button></div>
      {message ? <p className={`border-b border-[#cdd3ca] py-3 text-[11px] ${error ? 'text-[#a14343]' : 'text-[#6b746c]'}`} title={message}>{message}</p> : <select aria-label="Selected managed vault" value={selected?.address ?? ''} onChange={(event) => onSelect(event.target.value as Address)} className="folio-field text-[12px] font-semibold">{managed.map((vault) => <option key={vault.address} value={vault.address}>{vault.name} ({vault.symbol})</option>)}</select>}
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
            This vault is deployed on-chain but needs an initial seed deposit (min 10 USDT) to become active.
          </p>
          <button
            type="button"
            onClick={onSeed}
            disabled={busy}
            className="folio-button-primary mt-2 min-h-0 px-3 py-1 text-[11px]"
          >
            {action === 'approving' ? 'Approving USDT…' : action === 'seeding' ? 'Seeding Vault…' : 'Deposit 10 USDT Seed →'}
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
