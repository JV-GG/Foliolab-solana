'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {useConnection} from 'wagmi';
import {AccountBar} from './AccountBar';
import {ActivityFeed} from './ActivityFeed';
import {Header} from './Header';
import {PositionsList} from './PositionsList';
import {AnimatedBrandFooter} from './AnimatedBrandFooter';
import {useVaults} from '@/lib/contracts/hooks';

export function PortfolioDashboard() {
  const router = useRouter();
  const {isConnected} = useConnection();
  const {data: vaults = [], isLoading, error} = useVaults();
  const [view, setView] = useState<'positions' | 'activity'>('positions');

  return (
    <div className="min-h-[100dvh] bg-[#ebeee7]">
      <Header />
      <main className="site-container pb-8 pt-16 sm:pt-24">
        <div className="grid gap-8 border-b border-[#aeb8ad] pb-10 md:grid-cols-[1fr_auto] md:items-end">
          <div><p className="eyebrow">Your holdings</p><h1 className="page-title mt-5">A portfolio of<br />portfolios.</h1></div>
          <div className="folio-segmented inline-flex"><button type="button" className="folio-segment" data-active={view === 'positions'} onClick={() => setView('positions')}>Positions</button><button type="button" className="folio-segment" data-active={view === 'activity'} onClick={() => setView('activity')}>Activity</button></div>
        </div>
        <div className="mt-10"><AccountBar vaults={vaults} /></div>
        <section className="mt-16" aria-label={view === 'positions' ? 'My positions' : 'Activity'}>
          {error ? <Message title="Portfolio unavailable">{error.message}</Message> : isLoading ? <Message title="Reading your positions">Loading current shares and valuations…</Message> : view === 'positions' ? <PositionsList vaults={vaults} connected={isConnected} onSelect={(address) => router.push(`/vaults/${address}`)} onExplore={() => router.push('/explore')} /> : <ActivityFeed vaults={vaults} onSelectVault={(address) => router.push(`/vaults/${address}`)} />}
        </section>
      </main>
      <AnimatedBrandFooter />
    </div>
  );
}

function Message({title, children}: {title: string; children: React.ReactNode}) { return <div className="border-y border-[#cdd3ca] py-20 text-center"><h2 className="font-editorial text-[30px]">{title}</h2><p className="mt-3 text-[13px] text-[#6b746c]">{children}</p></div>; }
