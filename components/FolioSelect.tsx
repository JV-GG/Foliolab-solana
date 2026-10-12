'use client';

import {useEffect, useId, useRef, useState} from 'react';

export interface FolioSelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: FolioSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  containerClassName?: string;
}

export function FolioSelect({value, options, onChange, ariaLabel, disabled = false, className = '', containerClassName = ''}: Props) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex] ?? null;

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, []);

  function openMenu() {
    if (disabled || options.length === 0) return;
    setHighlightedIndex(selectedIndex);
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setHighlightedIndex(index);
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled || options.length === 0) return;

    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setHighlightedIndex((current) => (current + direction + options.length) % options.length);
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      if (!open) openMenu();
      setHighlightedIndex(event.key === 'Home' ? 0 : options.length - 1);
      return;
    }

    if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault();
      choose(highlightedIndex);
    }
  }

  return (
    <div ref={rootRef} className={`relative w-full min-w-0 ${containerClassName}`}>
      <button
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${highlightedIndex}` : undefined}
        disabled={disabled || options.length === 0}
        onClick={() => open ? setOpen(false) : openMenu()}
        onKeyDown={handleKeyDown}
        className={`group flex min-h-[44px] w-full items-center justify-between gap-3 rounded-[14px] border px-3 text-left outline-none transition-[border-color,background-color,box-shadow,transform] disabled:cursor-not-allowed disabled:opacity-50 ${open ? 'border-[#2b3a30] bg-[#fcfdf9] shadow-[0_8px_24px_rgba(43,58,48,0.16)]' : 'border-[#9da89f] bg-[#f7f8f3] shadow-[0_2px_8px_rgba(43,58,48,0.06)] hover:border-[#647168] hover:bg-[#fcfdf9] hover:shadow-[0_7px_20px_rgba(43,58,48,0.12)]'} ${className}`}
      >
        <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full border transition-colors ${open ? 'border-[#237b68] bg-[#62dec2]' : 'border-[#8f9b91] bg-[#d8b126]'}`} />
        <span className="min-w-0 flex-1 truncate text-[#2b3a30]">{selected?.label ?? 'Select an option'}</span>
        <span aria-hidden="true" className={`grid h-7 w-7 shrink-0 place-items-center rounded-[9px] border text-[13px] transition-[transform,background-color,color,border-color] ${open ? 'rotate-180 border-[#2b3a30] bg-[#2b3a30] text-white' : 'border-[#9da89f] bg-[#edf0ea] text-[#445148] group-hover:border-[#647168]'}`}>⌄</span>
      </button>

      {open && (
        <div id={listId} role="listbox" aria-label={ariaLabel} className="absolute left-0 top-[calc(100%+6px)] z-[80] max-h-64 w-full min-w-max overflow-y-auto rounded-[14px] border border-[#89948b] bg-[#f7f8f3] p-1.5 shadow-[0_18px_45px_rgba(31,43,35,0.24)]">
          {options.map((option, index) => {
            const active = index === highlightedIndex;
            const chosen = option.value === value;
            return (
              <button
                id={`${listId}-${index}`}
                key={option.value}
                type="button"
                role="option"
                aria-selected={chosen}
                onPointerEnter={() => setHighlightedIndex(index)}
                onClick={() => choose(index)}
                className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[12px] font-semibold transition-colors ${active ? 'bg-[#2b3a30] text-white' : 'text-[#2b3a30] hover:bg-[#e5e9e2]'}`}
              >
                <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full border ${chosen ? 'border-[#237b68] bg-[#4ed9bb]' : active ? 'border-[#d8b126]' : 'border-[#aeb8ad]'}`} />
                <span className="truncate">{option.label}</span>
                {chosen && <span className={`ml-auto text-[9px] font-[800] tracking-[0.1em] ${active ? 'text-[#78e8cf]' : 'text-[#237b68]'}`}>SELECTED</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
