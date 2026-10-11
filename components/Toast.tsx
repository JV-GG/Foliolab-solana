'use client';

import {createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode} from 'react';

const TOAST_MS = 5000;

const NotifyContext = createContext<((message: string) => void) | null>(null);

/** Holds the one visible toast and renders it; `useNotify` shows a message. */
export function ToastProvider({children}: {children: ReactNode}) {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <NotifyContext.Provider value={notify}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed top-6 left-1/2 z-50 max-w-[90%] -translate-x-1/2 transition-all"
      >
        {toast && (
          <div className="folio-enter flex items-center gap-2.5 rounded-full border border-[#aeb8ad] bg-[#f7f8f3]/95 px-5 py-3 text-[12px] font-semibold tracking-tight text-[#2b3a30] shadow-[0_16px_40px_rgba(43,58,48,0.16)] backdrop-blur-xl">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span>{toast}</span>
          </div>
        )}
      </div>
    </NotifyContext.Provider>
  );
}

export function useNotify(): (message: string) => void {
  const notify = useContext(NotifyContext);
  if (!notify) throw new Error('useNotify must be used inside ToastProvider.');
  return notify;
}
