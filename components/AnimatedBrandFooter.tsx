'use client';

import Link from 'next/link';
import {useEffect, useRef} from 'react';
import {CompassMark} from './Header';

const BRIDGE_VIDEO =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260928_144832_2b6b23aa-4416-4fcb-9df4-132349c59edc.mp4';
const BRIDGE_VIDEO_FALLBACK = '/folio-bridge-h264.mp4';

export function AnimatedBrandFooter() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let observer: IntersectionObserver | undefined;

    const supportsHevc = video.canPlayType('video/mp4; codecs="hvc1"') !== '';
    video.src = supportsHevc ? BRIDGE_VIDEO : BRIDGE_VIDEO_FALLBACK;
    video.load();

    const syncPlayback = () => {
      if (motionPreference.matches) {
        video.pause();
        video.currentTime = 0;
        return;
      }

      observer?.disconnect();
      observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            void video.play().catch(() => {
              // Autoplay can still be blocked by browser-level user preferences.
            });
          } else {
            video.pause();
          }
        },
        {threshold: 0.15},
      );
      observer.observe(video);
    };

    syncPlayback();
    motionPreference.addEventListener('change', syncPlayback);

    return () => {
      observer?.disconnect();
      motionPreference.removeEventListener('change', syncPlayback);
    };
  }, []);

  return (
    <footer className="relative isolate min-h-[500px] overflow-hidden border-t border-[#ccd2c8] bg-[#ebeee7] sm:min-h-[540px] lg:min-h-[580px]">
      <div className="site-container relative z-10 grid gap-8 pb-8 pt-14 sm:grid-cols-[1fr_auto] sm:items-start sm:pb-10 sm:pt-16">
        <div className="flex min-h-[84px] max-w-[620px] flex-col justify-between">
          <div className="flex min-h-10 items-center gap-3">
            <CompassMark />
            <strong className="text-[18px] font-semibold tracking-[-0.03em] text-[#28382f]">Folio Lab</strong>
          </div>
          <p className="max-w-[620px] text-[13px] leading-6 text-[#667168] sm:whitespace-nowrap">
            A considered route from an investment thesis to transparent, on-chain ownership.
          </p>
        </div>

        <div className="flex min-h-[84px] flex-col justify-between sm:items-end">
          <nav aria-label="Homepage footer" className="flex min-h-10 flex-wrap items-center gap-x-6 gap-y-2 text-[13px] font-semibold text-[#536158] [&_a]:no-underline [&_a]:transition-colors hover:[&_a]:text-[#1f3027]">
            <Link href="/explore">Explore</Link>
            <Link href="/portfolio">Portfolio</Link>
            <Link href="/curator">Curator</Link>
          </nav>
          <p className="text-[13px] leading-6 text-[#667168]">© 2026 Folio Lab · Built on BNB Chain</p>
        </div>
      </div>

      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 top-[165px] sm:top-[115px]">
        <video
          ref={videoRef}
          className="pointer-events-none h-full w-full select-none object-cover object-[50%_55%] mix-blend-multiply"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          tabIndex={-1}
          disablePictureInPicture
          data-primary-src={BRIDGE_VIDEO}
        />
      </div>

      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[145px] z-[1] h-20 bg-gradient-to-b from-[#ebeee7] to-transparent sm:top-[95px]" />
    </footer>
  );
}
