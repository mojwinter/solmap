import type { ScenarioWarning } from '@/src/types/app';
import { Icon } from '@/components/common/Icon';
import { WARNING_TEXT } from '../copy';

/** Engine warnings for the size on screen. */
export function Assumptions({ warnings }: { warnings: ScenarioWarning[] }) {
  return (
    <>
      {warnings.length > 0 && (
        <ul className="grid gap-2">
          {warnings.map((w) => (
            <li key={w} className="flex gap-2 rounded-md bg-fair-soft p-3 text-callout text-fair-ink">
              <Icon name="alert" size={16} className="mt-px flex-none" />
              {WARNING_TEXT[w]}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
