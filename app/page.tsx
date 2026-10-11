import Link from 'next/link';
import {AnimatedBrandFooter} from '@/components/AnimatedBrandFooter';
import {Header} from '@/components/Header';
import {HomeProductPreview} from '@/components/HomeProductPreview';
import {LandingVaults} from '@/components/LandingVaults';

export default function HomePage() {
  return (
    <div className="min-h-[100dvh] bg-[#f7f6f1]">
      <Header />
      <main>
        <section className="relative isolate overflow-hidden border-b border-[#d8dcd3]">
          <div aria-hidden="true" className="absolute -right-[12%] top-[-30%] h-[760px] w-[760px] rounded-full bg-[#dce6d5]/70 blur-[2px]" />
          <div aria-hidden="true" className="absolute bottom-[-48%] left-[28%] h-[560px] w-[560px] rounded-full bg-[#efe7c9]/55 blur-[1px]" />

          <div className="site-container relative grid min-h-[760px] items-center gap-14 py-16 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16 lg:py-20 xl:min-h-[830px] xl:gap-24">
            <div className="max-w-[610px] folio-enter">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#bfc9bd] bg-white/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-[#526158] backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-[#237b68]" />
                Built on BNB Chain
              </div>

              <h1 className="mt-7 max-w-[600px] text-[clamp(46px,5.1vw,76px)] font-semibold leading-[0.99] tracking-[-0.058em] text-[#223229]">
                Invest in the plan.<br />Own every position.
              </h1>
              <p className="mt-7 max-w-[540px] text-[clamp(16px,1.3vw,19px)] leading-[1.65] text-[#5c685f]">
                Explore transparent stock vaults, deposit USDT, and receive a proportional claim on every token the vault holds.
              </p>

              <div className="mt-9 flex flex-col gap-3 xs:flex-row">
                <Link href="/explore" className="folio-button-primary min-w-[156px] px-6 py-3.5 text-[13px]">Explore vaults <span aria-hidden="true">→</span></Link>
                <Link href="/curator" className="folio-button-secondary min-w-[156px] px-6 py-3.5 text-[13px]">For curators</Link>
              </div>

              <div className="mt-12 grid max-w-[590px] grid-cols-3 border-t border-[#cbd1c8] pt-5">
                <HeroFact value="On-chain" label="Vault holdings" />
                <HeroFact value="In kind" label="Withdrawals" bordered />
                <HeroFact value="Live" label="Signed pricing" bordered />
              </div>
            </div>

            <HomeProductPreview />
          </div>
        </section>

        <section className="bg-[#eeefe9] py-16 sm:py-20 lg:py-24">
          <div className="site-container">
            <div className="flex items-end justify-between gap-6 pb-8 sm:pb-10">
              <div>
                <p className="eyebrow">Explore</p>
                <h2 className="mt-3 text-[clamp(34px,3.5vw,48px)] font-semibold leading-none tracking-[-0.045em] text-[#26372d]">Discover vaults.</h2>
                <p className="mt-3 text-[13px] leading-6 text-[#69746b] sm:text-[14px]">Explore strategies and invest with confidence.</p>
              </div>
              <Link href="/explore" className="group/view-all mb-1 inline-flex min-h-11 shrink-0 items-center gap-2 text-[12px] font-semibold text-[#425248] no-underline outline-none transition-colors hover:text-[#1f3027] focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#237b68]">
                View all <span aria-hidden="true" className="transition-transform duration-200 group-hover/view-all:translate-x-1">→</span>
              </Link>
            </div>
            <LandingVaults />
          </div>
        </section>

        <section className="bg-[#173c33] py-20 text-[#f4f4ed] sm:py-28">
          <div className="site-container grid gap-14 lg:grid-cols-[0.76fr_1.24fr] lg:items-center lg:gap-20">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9dc7b9]">A clearer ownership model</p>
              <h2 className="mt-5 max-w-[460px] text-[clamp(38px,4vw,56px)] font-semibold leading-[1.05] tracking-[-0.045em]">Know what you own. Keep the exit.</h2>
              <p className="mt-6 max-w-[430px] text-[14px] leading-7 text-[#c7d5ce]">Vault shares track a proportional claim across the whole portfolio. Curators manage the route, while investors retain the right to redeem their share of each holding.</p>
            </div>

            <div className="divide-y divide-[#41675d] border-y border-[#41675d]">
              <ProcessStep number="01" title="Inspect the strategy" detail="Read the published plan, current holdings, manager address, and available pricing." />
              <ProcessStep number="02" title="Invest with USDT" detail="Signed prices protect the share calculation before your deposit is confirmed on-chain." />
              <ProcessStep number="03" title="Redeem the portfolio" detail="Withdraw your proportional share of USDT and held stock tokens in kind, including when paused." />
            </div>
          </div>
        </section>

        <section className="bg-[#f7f6f1] py-20 sm:py-24 lg:py-28">
          <div className="site-container grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-20">
            <div className="max-w-[620px]">
              <p className="eyebrow">Curator studio</p>
              <h2 className="mt-5 max-w-[580px] text-[clamp(40px,4.5vw,64px)] font-semibold leading-[1.02] tracking-[-0.05em] text-[#26372d]">Build your thesis on-chain.</h2>
              <p className="mt-6 max-w-[520px] text-[15px] leading-7 text-[#626d64]">Create a transparent vault, publish the strategy investors can inspect, and manage allocations through approved infrastructure.</p>
              <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
                <Link href="/curator" className="inline-flex min-h-12 items-center gap-3 rounded-full bg-[#26372d] px-6 text-[13px] font-semibold text-[#f7f6f1] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#18382f] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#26372d]">
                  Open curator studio <span aria-hidden="true">→</span>
                </Link>
                <span className="text-[12px] text-[#7a847c]">Manager-only workspace</span>
              </div>
            </div>

            <div>
              <div className="flex items-end justify-between gap-6 pb-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#66746b]">Manager workflow</p>
                <p className="text-[12px] text-[#89928b]">Three clear steps</p>
              </div>
              <ol className="divide-y divide-[#ccd2ca] border-y border-[#ccd2ca]">
                <li className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-4 gap-y-1.5 py-6 sm:grid-cols-[64px_170px_minmax(0,1fr)] sm:items-center sm:gap-5">
                  <span className="row-span-2 text-[12px] font-bold tracking-[0.12em] text-[#1e806d] sm:row-span-1">01</span>
                  <h3 className="text-[18px] font-semibold tracking-[-0.025em] text-[#26372d]">Create</h3>
                  <p className="col-start-2 text-[13px] leading-6 text-[#69756c] sm:col-start-auto">Name the vault, choose its manager, and provide the initial seed.</p>
                </li>
                <li className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-4 gap-y-1.5 py-6 sm:grid-cols-[64px_170px_minmax(0,1fr)] sm:items-center sm:gap-5">
                  <span className="row-span-2 text-[12px] font-bold tracking-[0.12em] text-[#1e806d] sm:row-span-1">02</span>
                  <h3 className="text-[18px] font-semibold tracking-[-0.025em] text-[#26372d]">Publish</h3>
                  <p className="col-start-2 text-[13px] leading-6 text-[#69756c] sm:col-start-auto">Post the investment plan on-chain before making the first allocation.</p>
                </li>
                <li className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-4 gap-y-1.5 py-6 sm:grid-cols-[64px_170px_minmax(0,1fr)] sm:items-center sm:gap-5">
                  <span className="row-span-2 text-[12px] font-bold tracking-[0.12em] text-[#1e806d] sm:row-span-1">03</span>
                  <h3 className="text-[18px] font-semibold tracking-[-0.025em] text-[#26372d]">Allocate</h3>
                  <p className="col-start-2 text-[13px] leading-6 text-[#69756c] sm:col-start-auto">Review signed quotes and rebalance while investor funds remain inside the vault.</p>
                </li>
              </ol>
            </div>
          </div>
        </section>
      </main>
      <AnimatedBrandFooter />
    </div>
  );
}

function HeroFact({value, label, bordered = false}: {value: string; label: string; bordered?: boolean}) {
  return (
    <div className={`${bordered ? 'border-l border-[#cbd1c8] pl-4 sm:pl-6' : 'pr-4 sm:pr-6'}`}>
      <strong className="block text-[13px] font-semibold text-[#2b3a30]">{value}</strong>
      <span className="mt-1 block text-[10px] leading-4 text-[#748077]">{label}</span>
    </div>
  );
}

function ProcessStep({number, title, detail}: {number: string; title: string; detail: string}) {
  return (
    <article className="group grid grid-cols-[52px_minmax(0,1fr)] gap-x-4 gap-y-2 py-8 sm:grid-cols-[72px_minmax(190px,0.8fr)_1.2fr] sm:items-center sm:gap-x-6 lg:grid-cols-[76px_minmax(220px,0.8fr)_1.2fr] lg:py-9">
      <span className="row-span-2 self-start pt-0.5 text-[28px] font-semibold leading-none tracking-[-0.04em] text-[#8db7aa] tabular-nums sm:row-span-1 sm:self-center sm:pt-0">{number}</span>
      <h3 className="text-[21px] font-semibold leading-tight tracking-[-0.025em] text-[#f4f4ed]">{title}</h3>
      <p className="col-start-2 max-w-[480px] text-[14px] leading-6 text-[#b8cac3] transition-colors group-hover:text-[#e2e9e5] sm:col-start-auto">{detail}</p>
    </article>
  );
}
