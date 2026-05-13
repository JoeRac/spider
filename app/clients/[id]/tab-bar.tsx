'use client';
/**
 * Tab bar for the client detail page. Server-rendered tabs would be
 * cleaner but Next 16 inherits the layout's pathname and uses URL params
 * for tab state, which lets us keep RSC for each tab's content.
 *
 * Visual: borrows the same indigo accent under-bar pattern as Raven's
 * top-level tabs.
 */
import Link from 'next/link';
import { cn } from '@/lib/cn';

export type ClientTab = 'overview' | 'channels' | 'content' | 'seo';

const TABS: Array<{ key: ClientTab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'channels', label: 'Channels' },
  { key: 'content',  label: 'Content' },
  { key: 'seo',      label: 'SEO' },
];

export function ClientTabBar({ clientId, current, counts }: {
  clientId: string;
  current: ClientTab;
  counts?: Partial<Record<ClientTab, number>>;
}) {
  return (
    <div className="border-b border-border bg-panel px-8">
      <nav className="flex items-center gap-1" aria-label="Client sections">
        {TABS.map((t) => {
          const active = t.key === current;
          const count = counts?.[t.key];
          return (
            <Link
              key={t.key}
              href={t.key === 'overview' ? `/clients/${clientId}` : `/clients/${clientId}?tab=${t.key}`}
              className={cn(
                'relative px-3.5 py-2.5 text-sm font-medium',
                'transition-colors duration-[120ms] ease-out',
                active ? 'text-fg' : 'text-muted hover:text-fg',
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                {t.label}
                {typeof count === 'number' && (
                  <span className={cn(
                    'inline-flex items-center justify-center min-w-[20px] px-1.5 h-[18px] rounded-full text-[10px] font-semibold tabular-nums',
                    active ? 'bg-accent text-accent-fg' : 'bg-subtle text-muted',
                  )}>{count}</span>
                )}
              </span>
              {active && <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-accent rounded-full" />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
