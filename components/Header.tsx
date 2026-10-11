'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {WalletButton} from './WalletButton';

const links = [
  {href: '/explore', label: 'Explore'},
  {href: '/portfolio', label: 'Portfolio'},
  {href: '/curator', label: 'Curator'},
] as const;

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-[#cdd3ca]/80 bg-[#ebeee7]/92 backdrop-blur-xl">
      <div className="site-container flex min-h-[68px] items-center gap-4">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5 text-[#2b3a30] no-underline">
          <CompassMark />
          <span className="font-editorial text-[19px] font-semibold tracking-[-0.035em] sm:text-[21px]">Folio Lab</span>
        </Link>

        <nav aria-label="Product navigation" className="ml-auto hidden items-center gap-1 sm:flex">
          {links.map((link) => {
            const active = pathname === link.href || (link.href === '/explore' && pathname.startsWith('/vaults/'));
            return (
              <Link key={link.href} href={link.href} aria-current={active ? 'page' : undefined} className={`rounded-full px-3.5 py-2 text-[12px] font-semibold no-underline transition ${active ? 'bg-[#2b3a30] text-[#f7f8f3]' : 'text-[#6b746c] hover:bg-[#2b3a30]/5 hover:text-[#2b3a30]'}`}>
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto min-w-0 shrink-0 sm:ml-2"><WalletButton /></div>
      </div>

      <nav aria-label="Mobile product navigation" className="site-container flex items-center gap-5 overflow-x-auto border-t border-[#cdd3ca]/60 py-2 sm:hidden">
        {links.map((link) => {
          const active = pathname === link.href || (link.href === '/explore' && pathname.startsWith('/vaults/'));
          return <Link key={link.href} href={link.href} aria-current={active ? 'page' : undefined} className={`shrink-0 text-[11px] font-bold no-underline ${active ? 'text-[#2b3a30]' : 'text-[#747d75]'}`}>{link.label}</Link>;
        })}
      </nav>
    </header>
  );
}

export function CompassMark({large = false}: {large?: boolean}) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center overflow-hidden rounded-[30%] bg-[#213a30] ring-1 ring-[#213a30]/15 transition-transform duration-200 group-hover:-rotate-2 group-hover:scale-[1.03] ${large ? 'h-12 w-12' : 'h-8 w-8'}`}
    >
      <svg viewBox="0 0 32 32" className="h-full w-full" fill="none">
        <path d="M6.25 10.45 16 5.15l9.75 5.3L16 15.8 6.25 10.45Z" fill="#F4F3EA" />
        <path d="M6.25 13.05 14.85 17.75v9.1l-8.6-4.72v-9.08Z" fill="#9EC8B8" />
        <path d="m25.75 13.05-8.6 4.7v9.1l8.6-4.72v-9.08Z" fill="#E2B84F" />
        <path d="m16 7.75 5.05 2.74L16 13.25l-5.05-2.76L16 7.75Z" fill="#213A30" fillOpacity=".18" />
      </svg>
    </span>
  );
}
