'use client';

import type { ReactNode } from 'react';
import { Popover } from '@base-ui/react/popover';
import { Icon } from './Icon';

/**
 * A small ⓘ button that shows how a number was worked out. Opens on hover (desktop) and on tap or
 * Enter (touch, keyboard), so the detail is never hover-only. Hidden in print: callers print the
 * detail inline (Stat does).
 */
export function InfoPopover({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={100}
        aria-label={label}
        className="inline-grid size-5 place-items-center rounded-full text-ink-tertiary hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring data-[popup-open]:text-ink print:hidden"
      >
        <Icon name="info" size={16} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" sideOffset={6} collisionPadding={16} className="z-50">
          <Popover.Popup className="rounded-md bg-popover px-3 py-2 text-callout text-ink shadow-(--elev-control) outline-none">
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
