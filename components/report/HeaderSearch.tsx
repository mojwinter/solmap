'use client';

import { useEffect, useRef, useState } from 'react';
import { AddressSearch } from '@/components/map/AddressSearch';
import type { PickedPlace } from '@/lib/geo/place';
import { Icon } from '@/components/common/Icon';

/** Typing this anywhere outside a field jumps to the search (shown as a hint in the empty field). */
const SHORTCUT = '/';

/**
 * Looking up another address, from the top bar. From `sm` up it's a standing pill field at the
 * bar's right end; on phones it's a round button that opens into a field across the whole bar (over
 * the wordmark, never over the address). Escape, a pick, or clicking away closes it again on phones.
 * `/` focuses it anywhere. The bar must be `relative` (the phone field is placed against it), and
 * this must sit inside <MapsProvider>.
 */
export function HeaderSearch({ onSelect }: { onSelect: (place: PickedPlace) => void }) {
  const [open, setOpen] = useState(false);
  // Bumped on every pick: a fresh field, so the bar goes back to its placeholder (the title shows the address).
  const [picks, setPicks] = useState(0);
  const field = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  const focusField = () => requestAnimationFrame(() => field.current?.querySelector('input')?.focus());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== SHORTCUT || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      setOpen(true);
      focusField();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    focusField();
    // Escape anywhere or a click outside closes it, even when the field can't take focus (no Maps key).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        if (button.current?.checkVisibility()) requestAnimationFrame(() => button.current?.focus());
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
    <>
      <button
        ref={button}
        type="button"
        aria-label="Look up another address"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={`grid size-11 flex-none place-items-center rounded-pill card text-ink-secondary shadow-control transition-transform hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring motion-safe:active:scale-[.95] sm:hidden print:hidden ${
          open ? 'invisible' : ''
        }`}
      >
        <Icon name="search" size={20} strokeWidth={2} />
      </button>
      <div
        ref={field}
        className={`${open ? 'block' : 'hidden'} absolute inset-x-4 top-3 z-30 max-sm:motion-safe:animate-search-open sm:relative sm:inset-auto sm:block sm:h-11 sm:w-[340px] lg:w-[400px] print:hidden`}
        onBlur={(e) => {
          if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false);
        }}
      >
        <AddressSearch
          key={picks}
          variant="bar"
          placeholder="Search another address"
          shortcut={SHORTCUT}
          className="absolute inset-x-0 top-0"
          onSelect={(place) => {
            setOpen(false);
            setPicks((n) => n + 1);
            onSelect(place);
          }}
        />
      </div>
    </>
  );
}

/**
 * The same boxes as HeaderSearch, drawn but inert: for the route's loading screen, which shows
 * before the Maps library (and the report) arrive, so the top bar doesn't change as they do.
 */
export function HeaderSearchPlaceholder() {
  return (
    <div aria-hidden="true" className="contents print:hidden">
      <span className="grid size-11 flex-none place-items-center rounded-pill card text-ink-secondary shadow-control sm:hidden">
        <Icon name="search" size={20} strokeWidth={2} />
      </span>
      <span className="hidden h-11 w-[340px] items-center gap-2.5 rounded-[22px] glass px-4 text-body text-ink-tertiary shadow-control sm:flex lg:w-[400px]">
        <Icon name="search" size={17} strokeWidth={2} className="text-ink-secondary" />
        Search another address
      </span>
    </div>
  );
}
