'use client';
/**
 * View-mode tabs for the /content hub. The three pages that used to be
 * separate (Library / Schedule / Generation) now live as views inside
 * /content?view=... so the operator stays in one place to triage,
 * see what's coming, or run a new batch.
 */
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { LayoutGrid, CalendarClock, Sparkles } from 'lucide-react';

export type ContentView = 'library' | 'calendar' | 'generate';

const TABS: Array<{ key: ContentView; label: string; icon: React.ReactNode }> = [
  { key: 'library',  label: 'Library',  icon: <LayoutGrid size={13} /> },
  { key: 'calendar', label: 'Calendar', icon: <CalendarClock size={13} /> },
  { key: 'generate', label: 'Generate', icon: <Sparkles size={13} /> },
];

export function ContentViewTabs({ current }: { current: ContentView }) {
  return (
    <div className="border-b border-border bg-panel px-8">
      <nav className="flex items-center gap-1" aria-label="Content view">
        {TABS.map((t) => {
          const active = t.key === current;
          return (
            <Link
              key={t.key}
              href={t.key === 'library' ? '/content' : `/content?view=${t.key}`}
              className={cn(
                'relative inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium',
                'transition-colors duration-[120ms] ease-out',
                active ? 'text-fg' : 'text-muted hover:text-fg',
              )}
            >
              <span className={active ? 'text-accent' : 'text-faint'}>{t.icon}</span>
              {t.label}
              {active && <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-accent rounded-full" />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
