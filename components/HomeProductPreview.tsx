'use client';

import {useState} from 'react';

const holdings = [
  {symbol: 'USDT', name: 'Cash reserve', value: '$9,944.16', allocation: '40%', color: '#27bfa3'},
  {symbol: 'AAPLon', name: 'Apple token', value: '$8,701.14', allocation: '35%', color: '#8f6ee8'},
  {symbol: 'NVDAon', name: 'Nvidia token', value: '$6,215.10', allocation: '25%', color: '#e9ad38'},
] as const;

const ranges = {
  '1M': {
    label: '30 days',
    change: '+1.7% preview',
    endY: 21,
    path: 'M8 148 C38 142 60 153 89 131 C117 108 140 136 169 111 C195 89 221 117 252 85 C278 58 304 98 337 64 C368 31 391 69 421 40 C452 10 481 48 530 21',
  },
  '3M': {
    label: '90 days',
    change: '+4.8% preview',
    endY: 10,
    path: 'M8 154 C35 145 54 151 77 132 C100 113 120 125 143 111 C164 98 181 114 205 93 C224 76 244 87 265 70 C285 54 303 73 325 58 C348 41 364 55 387 38 C408 22 426 49 448 30 C469 13 489 27 530 10',
  },
  '1Y': {
    label: '1 year',
    change: '+12.4% preview',
    endY: 8,
    path: 'M8 166 C34 151 57 160 82 143 C108 126 128 151 154 119 C181 87 205 121 232 95 C259 69 280 91 305 72 C332 51 355 77 383 45 C410 14 435 52 460 29 C482 9 507 35 530 8',
  },
} as const;

type Range = keyof typeof ranges;

export function HomeProductPreview() {
  const [range, setRange] = useState<Range>('3M');
  const chart = ranges[range];

  return (
    <div className="relative mx-auto w-full max-w-[760px] pb-8 pt-3 folio-enter [animation-delay:100ms] lg:justify-self-end">
      <div aria-hidden="true" className="absolute inset-x-[8%] bottom-0 h-[75%] rounded-[38px] bg-[#b9c9b4]/55 blur-3xl" />

      <div className="relative overflow-hidden rounded-[30px] border border-white/80 bg-[#fbfbf8] shadow-[0_32px_90px_rgba(38,55,45,0.17),0_4px_18px_rgba(38,55,45,0.08)] transition duration-500 hover:-translate-y-1 hover:shadow-[0_38px_100px_rgba(38,55,45,0.2)] sm:rounded-[36px]">
        <div className="flex items-center justify-between border-b border-[#e5e7e1] px-5 py-4 sm:px-7">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-[12px] bg-[#21483d] text-[11px] font-bold text-white">FL</span>
            <div>
              <p className="text-[12px] font-semibold text-[#283a30]">Atlas Technology</p>
              <p className="mt-0.5 text-[9px] text-[#7b847d]">Illustrative product preview</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e0f1e9] px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[.08em] text-[#21705d]"><span className="h-1.5 w-1.5 rounded-full bg-[#2b997e]" /> Active</span>
        </div>

        <div className="grid lg:grid-cols-[1.22fr_0.78fr]">
          <div className="min-w-0 px-5 py-6 sm:px-8 sm:py-8">
            <p className="text-[10px] font-medium text-[#7a847c]">Illustrative portfolio value</p>
            <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
              <strong className="text-[clamp(34px,4vw,52px)] font-semibold tracking-[-0.055em] text-[#1f3027]">$24,860.40</strong>
              <span className="mb-2 rounded-full bg-[#e5f1e7] px-2 py-1 text-[9px] font-bold text-[#24725d]">{chart.change}</span>
            </div>

            <div className="mt-7 overflow-hidden rounded-[20px] bg-[#f0f3ed] px-3 pb-2 pt-4 sm:px-4">
              <div className="mb-1 flex items-center justify-between gap-3 px-1">
                <span className="text-[8px] font-semibold uppercase tracking-[.1em] text-[#849087]">Portfolio value · {chart.label}</span>
                <span className="flex rounded-full bg-white/75 p-0.5" aria-label="Illustrative chart range">
                  {(Object.keys(ranges) as Range[]).map((option) => <button key={option} type="button" aria-pressed={range === option} onClick={() => setRange(option)} className={`rounded-full px-2 py-1 text-[7px] font-bold transition ${range === option ? 'bg-[#21483d] text-white shadow-sm' : 'text-[#7b867e] hover:text-[#21483d]'}`}>{option}</button>)}
                </span>
              </div>
              <svg viewBox="0 0 540 190" role="img" aria-label={`Illustrative ${chart.label} portfolio performance chart`} className="h-auto w-full overflow-visible">
                <defs>
                  <linearGradient id="home-chart-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#4d8b73" stopOpacity="0.27" />
                    <stop offset="1" stopColor="#4d8b73" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path key={`fill-${range}`} d={`${chart.path} L530 178 L8 178 Z`} fill="url(#home-chart-fill)" className="folio-enter" />
                <path key={`line-${range}`} d={chart.path} fill="none" stroke="#2d6958" strokeWidth="4" strokeLinecap="round" className="folio-enter" />
                <circle cx="530" cy={chart.endY} r="6" fill="#fbfbf8" stroke="#2d6958" strokeWidth="4" />
                <path d="M8 178H530" stroke="#d6dcd3" strokeWidth="1" />
              </svg>
              <div className="flex justify-between px-1 text-[8px] text-[#929a93]"><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span></div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3 border-t border-[#e2e5de] pt-5">
              <PreviewMetric value="3" label="Assets" />
              <PreviewMetric value="$1.24" label="Share price" />
              <PreviewMetric value="v3" label="Plan" />
            </div>
          </div>

          <div className="border-t border-[#e3e6df] bg-[#f3f5f0] px-5 py-6 sm:px-7 sm:py-8 lg:border-l lg:border-t-0">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-[10px] font-semibold text-[#33473b]">Allocation preview</p><p className="mt-1 text-[9px] text-[#8a928b]">Illustrative, not wallet data</p></div>
              <div className="relative h-16 w-16 shrink-0 rounded-full" style={{background: 'conic-gradient(#27bfa3 0 40%, #8f6ee8 40% 75%, #e9ad38 75% 100%)'}}>
                <span className="absolute inset-[8px] grid place-items-center rounded-full bg-[#f3f5f0] text-[9px] font-bold text-[#415048]">100%</span>
              </div>
            </div>

            <div className="mt-7 divide-y divide-[#dce1d9] border-y border-[#dce1d9]">
              {holdings.map((holding) => (
                <div key={holding.symbol} className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-4">
                  <span className="h-2.5 w-2.5 rounded-full transition-transform group-hover:scale-125" style={{backgroundColor: holding.color}} />
                  <span className="min-w-0"><strong className="block truncate text-[11px] font-semibold text-[#2f4036]">{holding.symbol}</strong><small className="mt-0.5 block truncate text-[8px] text-[#8a928b]">{holding.name}</small></span>
                  <span className="text-right"><strong className="block text-[10px] text-[#35473d]">{holding.value}</strong><small className="mt-0.5 block text-[8px] text-[#7e8881]">{holding.allocation}</small></span>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-[18px] bg-[#21483d] px-4 py-4 text-white">
              <div className="flex items-center justify-between gap-3"><span className="text-[9px] text-[#b8d4ca]">Published strategy</span><span className="rounded-full bg-white/10 px-2 py-1 text-[8px]">On-chain</span></div>
              <p className="mt-3 text-[11px] font-medium leading-5 text-[#f3f6f3]">Diversified technology exposure with a liquid USDT reserve.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-1 -left-2 hidden rounded-[20px] border border-white bg-white/95 px-4 py-3 shadow-[0_18px_45px_rgba(38,55,45,0.15)] backdrop-blur sm:block lg:-left-7">
        <p className="text-[8px] uppercase tracking-[.12em] text-[#829087]">Exit design</p>
        <p className="mt-1 text-[11px] font-semibold text-[#2c4034]">Withdraw assets in kind</p>
      </div>
    </div>
  );
}

function PreviewMetric({value, label}: {value: string; label: string}) {
  return <div><strong className="block text-[13px] font-semibold text-[#2b3c32]">{value}</strong><span className="mt-1 block text-[8px] text-[#899189]">{label}</span></div>;
}
