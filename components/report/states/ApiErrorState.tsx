import { Icon } from '@/components/common/Icon';

/** Something went wrong fetching the roof (rate limit, upstream outage, a bug). Always offers a retry. */
export function ApiErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <section className="grid gap-3" role="alert">
      <span className="grid size-[30px] place-items-center rounded-sm bg-fill-quiet text-ink-secondary">
        <Icon name="cloud" size={18} />
      </span>
      <h2 className="font-display text-title">We couldn&rsquo;t load this roof</h2>
      <p className="text-body text-ink-secondary">
        {message ?? 'The solar data service didn’t answer. Please try again in a minute.'}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-10 items-center justify-center gap-2 justify-self-start rounded-pill bg-sky-600 px-5 text-headline text-on-sky-600 shadow-control transition-transform hover:brightness-105 active:scale-[.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <Icon name="refresh" size={18} />
        Try again
      </button>
    </section>
  );
}
