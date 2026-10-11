'use client';

import {useState} from 'react';
import Link from 'next/link';
import {useConnection} from 'wagmi';
import {Header} from './Header';
import {AnimatedBrandFooter} from './AnimatedBrandFooter';
import {DetailPanel, type TradeType} from './DetailPanel';
import {TradeDialog} from './TradeDialog';
import {useVaults} from '@/lib/contracts/hooks';

export function VaultDetailsPage({address}: {address: string}) {
  const {isConnected} = useConnection();
  const {data: vaults = [], isLoading, error} = useVaults();
  const [trade, setTrade] = useState<TradeType | null>(null);
  const vault = vaults.find((item) => item.address.toLowerCase() === address.toLowerCase()) ?? null;

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-[#ebeee7]">
      <Header />
      <main className="site-container min-w-0 pb-8 pt-10 sm:pt-16">
        <Link href="/explore" className="folio-button-quiet -ml-3">← Back to explore</Link>
        {error ? <State title="Vault data unavailable" detail={error.message} /> : isLoading ? <State title="Opening vault" detail="Reading holdings, plan and your current position…" /> : !vault ? <State title="Vault not found" detail="This address is not part of the visible vault list on the selected network." /> : <DetailPanel vault={vault} connected={isConnected} onTrade={setTrade} />}
      </main>
      <AnimatedBrandFooter />
      {vault && <TradeDialog type={trade} vault={vault} onClose={() => setTrade(null)} />}
    </div>
  );
}

function State({title, detail}: {title: string; detail: string}) { return <div className="min-h-[50vh] border-y border-[#cdd3ca] py-24 text-center"><h1 className="page-title">{title}</h1><p className="mx-auto mt-5 max-w-[580px] text-[14px] leading-7 text-[#6b746c]">{detail}</p></div>; }
