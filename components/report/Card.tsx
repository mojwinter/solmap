import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** A report card on the page: solid surface, xl corners. Inside it, tiles use fill-quiet and md corners. */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('card rounded-xl p-5', className)} {...props} />;
}
