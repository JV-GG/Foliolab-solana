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
import {sameAddress} from './model';
import {useCuratorActions} from './useCuratorActions';
import {CuratorStepDrawers} from './CuratorStepDrawers';

type ManagerTab = 'plan' | 'activity';
type MobileView = 'controls' | 'map';
type CuratorVaultScope = 'all' | 'managed';

export function CuratorConsole({artSample = false}: {artSample?: boolean} = {}) {
  const {address, isConnected} = useConnection();
  const {data: vaults = [], isLoading, error, refetch, isFetching} = useVaults();
  const {action, createAndSeed, seedExistingVault, activateVault} = useCuratorActions();
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [managerTab, setManagerTab] = useState<ManagerTab>('plan');
  const [mobileView, setMobileView] = useState<MobileView>('map');
  const [createOpen, setCreateOpen] = useState(false);

  // Curators only see and interact with vaults they created/manage
  const visibleVaults = useMemo(
    () => vaults.filter((vault) => sameAddress(vault.manager, address)).sort((left, right) => left.address.localeCompare(right.address)),
    [address, vaults],
  );
  const selected = visibleVaults.find((vault) => vault.address === selectedAddress) ?? visibleVaults[0] ?? null;
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

        <div className="grid min-h-[680px] items-start gap-6 md:grid-cols-[370px_minmax(0,1fr)]">
          <aside className={`${mobileView === 'controls' ? 'flex' : 'hidden'} flex-col border border-[#c2c9c0] bg-[#f7f8f3]/60 md:flex`}>
            <div className="border-b border-[#cdd3ca] p-4">
              <VaultPicker connected={isConnected} vaults={visibleVaults} selected={selected} loading={isLoading} refreshing={isFetching} error={error instanceof Error ? error.message : null} onSelect={(next) => { setSelectedAddress(next); setManagerTab('plan'); }} onRefresh={() => void refetch()} />
            </div>

            <div className="flex-1">
              {selected ? (
                <>
                  <div className="border-b border-[#cdd3ca] bg-[#f1f3ee] p-2">
                    <div className="folio-segmented grid w-full grid-cols-2">
                      <TabButton active={managerTab === 'plan'} onClick={() => setManagerTab('plan')}>Setup & Strategy</TabButton>
                      <TabButton active={managerTab === 'activity'} onClick={() => setManagerTab('activity')}>Activity</TabButton>
                    </div>
                  </div>
                  <div className="p-3">
                    {managerTab === 'plan' ? (
                      <CuratorStepDrawers
                        key={`${selected.address}-${selected.plan?.version ?? 0}`}
                        vault={selected}
                        managerAllowed={managerAllowed}
                        onSeed={() => void seedExistingVault(selected.address)}
                        onActivate={() => void activateVault(selected.address)}
                      />
                    ) : (
                      <ActivityPanel vaultName={selected.name} vaultAddress={selected.address} />
                    )}
                  </div>
                </>
              ) : (
                <div className="grid min-h-full place-items-center p-8 text-center"><div><span className="font-editorial text-[52px] text-[#849087]">V</span><p className="font-editorial mt-3 text-[25px] font-medium">{isConnected ? 'No managed vaults' : 'Connect curator wallet'}</p><p className="mt-3 text-[12px] leading-6 text-[#6b746c]">{isConnected ? 'This wallet does not manage a vault yet. Click "+ Create vault" above to launch your first index pool.' : 'Connect your curator wallet to view and manage your vaults.'}</p><button type="button" onClick={() => setCreateOpen(true)} className="folio-button-primary mt-6">Create investment pool</button></div></div>
              )}
            </div>
          </aside>

          <section className={`${mobileView === 'map' ? 'flex' : 'hidden'} map-frame relative h-[620px] flex-col md:flex md:h-auto md:min-h-[680px] md:sticky md:top-24 overflow-hidden`}>
            <AssetMap
              vaults={visibleVaults}
              selectedAddress={selected?.address ?? null}
              connectedAddress={address}
              artSample={artSample}
              sizeByValue
              emptyTitle={isConnected ? 'NO_MANAGED_VAULTS' : 'CONNECT_CURATOR_WALLET'}
              emptyDetail={isConnected ? 'THIS WALLET DOES NOT MANAGE ANY VAULTS YET. CLICK + CREATE VAULT ABOVE.' : 'CONNECT YOUR CURATOR WALLET TO VIEW MANAGED VAULTS.'}
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

interface VaultPickerProps { connected: boolean; vaults: VaultView[]; selected: VaultView | null; loading: boolean; refreshing: boolean; error: string | null; onSelect: (address: string) => void; onRefresh: () => void; }

function VaultPicker({connected, vaults, selected, loading, refreshing, error, onSelect, onRefresh}: VaultPickerProps) {
  const scopeLabel = 'Your Managed Vaults';
  const message = error
    ? `Vault API unavailable: ${error}`
    : loading
      ? 'Loading vaults…'
      : !connected
        ? 'Connect curator wallet'
        : vaults.length === 0
          ? 'No vaults managed by this wallet'
          : null;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="eyebrow">{scopeLabel}</span>
        <button type="button" onClick={onRefresh} disabled={refreshing} className="folio-button-quiet min-h-0 px-2 py-1 text-[10px]">
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {message ? (
        <p className={`border-b border-[#cdd3ca] py-3 text-[11px] ${error ? 'text-[#a14343]' : 'text-[#6b746c]'}`} title={message}>
          {message}
        </p>
      ) : (
        <FolioSelect
          ariaLabel="Select your managed vault"
          value={selected?.address ?? ''}
          onChange={onSelect}
          options={vaults.map((vault) => ({value: vault.address, label: `${vault.name} (${vault.symbol})`}))}
          className="text-[12px] font-semibold"
        />
      )}
    </div>
  );
}



function TabButton({active, onClick, children}: {active: boolean; onClick: () => void; children: React.ReactNode}) { return <button type="button" onClick={onClick} className="folio-segment" data-active={active}>{children}</button>; }
function MobileToggle({active, onClick, children}: {active: boolean; onClick: () => void; children: React.ReactNode}) { return <button type="button" onClick={onClick} className="folio-segment" data-active={active}>{children}</button>; }
