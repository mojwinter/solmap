'use client';

import type { ReactNode } from 'react';
import { Tabs } from '@base-ui/react/tabs';

export interface ReportTab {
  value: string;
  label: string;
  content: ReactNode;
}

/**
 * The detail under the payback answer and the size slider, grouped so the panel isn't one long
 * scroll: a pill tab list on a fill-quiet well (white selected tab, unlike the sky-600
 * SegmentedControl, which picks a value rather than a view). Every panel stays mounted, so what
 * you typed on one tab (the bill) survives a look at another.
 */
export function ReportTabs({ tabs, defaultValue }: { tabs: ReportTab[]; defaultValue?: string }) {
  return (
    <Tabs.Root defaultValue={defaultValue ?? tabs[0]?.value} className="grid gap-4">
      <Tabs.List
        aria-label="Report details"
        className="flex gap-0.5 rounded-pill bg-fill-quiet p-[3px]"
      >
        {tabs.map((t) => (
          <Tabs.Tab
            key={t.value}
            value={t.value}
            className="inline-flex min-h-[34px] flex-1 items-center justify-center rounded-pill px-3 text-callout font-semibold text-ink-secondary hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring motion-safe:transition-[color,background-color,transform] motion-safe:duration-150 motion-safe:active:scale-[.97] data-[active]:bg-white data-[active]:text-ink data-[active]:shadow-control dark:data-[active]:bg-white/15"
          >
            {t.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {tabs.map((t) => (
        <Tabs.Panel
          key={t.value}
          value={t.value}
          keepMounted
          className="grid gap-6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 data-[hidden]:hidden"
        >
          {t.content}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}
