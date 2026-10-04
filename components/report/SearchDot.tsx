'use client';

import { useEffect, useRef, useState } from 'react';
import { AddressSearch } from '@/components/map/AddressSearch';
import type { PickedPlace } from '@/lib/geo/place';
import { Icon } from '@/components/common/Icon';

/**
 * Looking up another address, kept quiet: a round search button beside the address that opens into
 * the full search field (it slides out from the dot, over the title). Escape, a pick, or clicking
 * away closes it again. Must sit inside <MapsProvider>.
 */
export function SearchDot({ onSelect }: { onSelect: (place: PickedPlace) => void }) {
  const [open, setOpen] = useState(false);
  const field = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    field.current?.querySelector('input')?.focus();
    // Escape anywhere or a click outside closes it, even when the field can't take focus (no Maps key).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        requestAnimationFrame(() => dot.current?.focus());
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!field.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <div className="relative size-[46px] flex-none print:hidden">
      <button
        ref={dot}
        type="button"
        aria-label="Look up another address"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={`grid size-[46px] place-items-center rounded-pill card text-sky-700 shadow-control transition-transform hover:bg-sky-050 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring motion-safe:active:scale-[.95] ${
          open ? 'invisible' : ''
        }`}
      >
        <Icon name="search" size={20} strokeWidth={2} />
      </button>
      {open && (
        <div
          ref={field}
          className="absolute top-0 left-0 z-30 w-[min(360px,calc(100vw-32px))] motion-safe:animate-search-open"
          onBlur={(e) => {
            if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false);
          }}
        >
          <AddressSearch
            placeholder="Look up another address"
            onSelect={(place) => {
              setOpen(false);
              onSelect(place);
            }}
          />
        </div>
      )}
    </div>
  );
}
