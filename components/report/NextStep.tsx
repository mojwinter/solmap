import { BcHydroLogo } from '@/components/common/BcHydroLogo';
import { Icon } from '@/components/common/Icon';
import { REBATES } from '@/src/config/bc';

/**
 * The one call to action once the numbers are in: an estimate isn't a quote, so point at BC Hydro's
 * rebate page, where the real steps are (apply before you buy, use an HPCN installer).
 */
export function NextStep() {
  return (
    <a
      href={REBATES.source}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-4 rounded-xl bg-sky-600 p-5 text-on-sky-600 shadow-control transition-transform hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring motion-safe:active:scale-[.99] print:hidden"
    >
      <span className="grid size-11 flex-none place-items-center rounded-md bg-white/15">
        <BcHydroLogo size={26} />
      </span>
      <span className="grid flex-1 gap-0.5">
        <span className="text-headline">Get real quotes</span>
        <span className="text-callout opacity-90">
          Apply to BC Hydro before you buy, then use an HPCN installer to get the rebate.
        </span>
      </span>
      <Icon name="chevron" size={20} className="flex-none transition-transform group-hover:translate-x-0.5" />
    </a>
  );
}
