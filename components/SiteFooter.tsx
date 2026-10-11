import Link from 'next/link';
import {CompassMark} from './Header';

export function SiteFooter() {
  return (
    <footer className="mt-24 overflow-hidden border-t border-[#cdd3ca] pt-16 sm:mt-32 sm:pt-24">
      <div className="site-container text-center">
        <div className="flex justify-center"><CompassMark large /></div>
        <p className="font-editorial mt-4 text-[38px] font-semibold tracking-[-0.045em] text-[#2b3a30]">folio lab</p>
        <p className="mx-auto mt-3 max-w-[560px] text-[13px] leading-6 text-[#59645c]">A considered route from an investment idea to a transparent on-chain portfolio.</p>
        <nav aria-label="Footer navigation" className="mt-9 flex flex-wrap justify-center gap-x-6 gap-y-3 text-[12px] font-semibold text-[#465248] [&_a]:no-underline">
          <Link href="/explore">Explore</Link><span aria-hidden="true">•</span>
          <Link href="/portfolio">Portfolio</Link><span aria-hidden="true">•</span>
          <Link href="/curator">Curator</Link><span aria-hidden="true">•</span>
          <a href="https://www.bnbchain.org" target="_blank" rel="noreferrer">BNB Chain</a>
        </nav>
        <p className="mt-8 text-[10px] tracking-[0.08em] text-[#7b847c]">© 2026 Folio Lab · Tokenized portfolios, held transparently.</p>
      </div>
      <CapitalBridge />
    </footer>
  );
}

function CapitalBridge() {
  return (
    <svg aria-hidden="true" viewBox="0 0 1440 330" className="mt-12 block h-auto w-full text-[#35463b]" fill="none">
      <g stroke="currentColor" strokeWidth="2" opacity=".88">
        <path d="M0 112H1440M0 128H1440" />
        <path d="M0 148h1440v182H0z" opacity=".3" />
        {Array.from({length: 9}, (_, index) => { const x = index * 180 - 70; return <path key={x} d={`M${x} 330V229c0-58 47-105 105-105s105 47 105 105v101`} />; })}
        {Array.from({length: 48}, (_, index) => <path key={index} d={`M${index * 32 - 25} 128l-18 20m36-20-18 20`} opacity=".35" />)}
        <g transform="translate(625 50)">
          <rect x="0" y="18" width="120" height="58" rx="10" />
          <path d="M18 18V3h27v15M52 18V-8h28v26M88 18V7h17v11M-28 76h180" />
          <circle cx="28" cy="80" r="14" /><circle cx="98" cy="80" r="14" />
          <path d="M120 35h35l24 24h36m-45-18 22-19m-8 27 26-7" />
          <circle cx="218" cy="60" r="12" /><path d="M218 48V28m-10 2h20" />
        </g>
        <path d="M80 92c16-17 32-17 48 0m107-29c18-20 36-20 54 0m930 20c15-16 30-16 45 0" opacity=".35" />
      </g>
    </svg>
  );
}
