'use client';

import { Dialog } from '@base-ui/react/dialog';
import type { FinanceInputs } from '@/src/types/app';
import { Icon } from '@/components/common/Icon';
import { cn } from '@/lib/utils';
import { DEFAULT_INPUTS } from '@/src/config/bc';
import { AssumptionsPanel } from './AssumptionsPanel';

/** The assumption knobs AssumptionsPanel edits: a dot on the button when any differs from BC's default. */
const KNOBS = ['costPerWatt', 'costIncrease', 'daytimeLoadShare', 'discountRate', 'panelWatts', 'rebateEligible'] as const;

/**
 * [P1, `assumptions` flag] "Advanced settings": a pill in the title row (beside Save as PDF) that opens
 * What we assumed in a modal dialog. Every change reruns the report behind it, live. Escape, the close
 * button or a click outside closes it; focus returns to the button.
 */
export function AdvancedSettings({ inputs, onChange }: { inputs: FinanceInputs; onChange: (next: FinanceInputs) => void }) {
  const changed = KNOBS.some((k) => inputs[k] !== DEFAULT_INPUTS[k]);
  return (
    <Dialog.Root>
      <Dialog.Trigger
        className={cn(
          'relative inline-flex items-center gap-1.5 rounded-pill bg-fill-quiet px-3 py-1 text-callout font-semibold text-sky-700',
          'hover:bg-fill-selected focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring print:hidden',
        )}
      >
        <Icon name="sliders" size={14} strokeWidth={2} />
        Advanced settings
        {changed && (
          <span className="size-1.5 rounded-full bg-sky-600" role="img" aria-label="(changed from BC defaults)" />
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-ink/30 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup
          className={cn(
            'card fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl p-5 outline-none',
            'transition-[opacity,transform] duration-150 data-[ending-style]:scale-[.97] data-[ending-style]:opacity-0 data-[starting-style]:scale-[.97] data-[starting-style]:opacity-0 motion-reduce:transition-none',
          )}
        >
          <AssumptionsPanel
            inputs={inputs}
            onChange={onChange}
            heading={<Dialog.Title className="text-headline">Advanced settings</Dialog.Title>}
            actions={
              <Dialog.Close
                aria-label="Close"
                className="grid size-8 flex-none place-items-center rounded-full bg-fill-quiet text-ink hover:bg-fill-selected focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <Icon name="x" size={16} strokeWidth={2} />
              </Dialog.Close>
            }
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
