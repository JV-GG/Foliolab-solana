'use client';

import {useEffect, type ReactNode} from 'react';

interface Props {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}

export function CuratorModal({open, title, children, onClose}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#243128]/35 p-3 backdrop-blur-md transition-opacity sm:p-4"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="folio-sheet max-h-[min(780px,calc(100dvh-24px))] w-full max-w-[530px] overflow-y-auto"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[#cdd3ca] bg-[#fcfdf9]/95 px-6 py-5 backdrop-blur-xl">
          <div>
            <div className="eyebrow">Manager action</div>
            <h2 className="font-editorial mt-1 text-[26px] font-medium tracking-[-0.035em] text-[#2b3a30]">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="grid h-9 w-9 place-items-center rounded-full bg-[#2b3a30]/5 text-[18px] text-[#6b746c] hover:bg-[#2b3a30]/10 hover:text-[#2b3a30]"
          >
            ×
          </button>
        </div>
        <div className="p-6">{children}</div>
      </section>
    </div>
  );
}
