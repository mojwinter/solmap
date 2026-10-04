import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/common/Icon';

/** A plain note about the whole report (not a verdict, not an error): icon tile + one callout line. */
export function Notice({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <p role="note" className="flex items-start gap-3 rounded-md bg-fill-quiet p-3 text-callout text-ink">
      <span className="grid size-[30px] flex-none place-items-center rounded-sm bg-sky-050 text-ink-secondary">
        <Icon name={icon} size={18} />
      </span>
      <span className="self-center">{children}</span>
    </p>
  );
}
