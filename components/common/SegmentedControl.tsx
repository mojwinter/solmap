import { cn } from '@/lib/utils';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

/**
 * Daylight SegmentedControl: two to four mutually exclusive choices, the selected one sky-600.
 * Sits on a fill-quiet well inside a card; `onMap` swaps the well for glass-thin frost (map controls).
 * `stretch` makes it fill its row with equal segments. Not for navigation.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  onMap = false,
  stretch = false,
  className,
}: {
  /** Accessible name for the group ("Rate plan"). */
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  onMap?: boolean;
  stretch?: boolean;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'items-center gap-0.5 rounded-pill',
        stretch ? 'flex w-full' : 'inline-flex',
        onMap ? 'h-10 glass-thin p-1' : 'bg-fill-quiet p-[3px]',
        className,
      )}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={selected}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center justify-center rounded-pill px-3.5 text-callout font-semibold whitespace-nowrap text-ink',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
              'motion-safe:transition-transform motion-safe:duration-150 motion-safe:active:scale-[.97]',
              'disabled:cursor-not-allowed disabled:opacity-45',
              onMap ? 'h-8' : 'min-h-[30px] py-1.5',
              stretch && 'flex-1',
              selected ? 'bg-sky-600 text-on-sky-600 shadow-control' : 'hover:bg-fill-quiet',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
