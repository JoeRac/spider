'use client';
/**
 * Spider command palette — ⌘K / Ctrl+K.
 *
 * Design:
 *   - Opens via global keyboard shortcut OR by dispatching the same
 *     synthetic keydown from the sidebar's quick-jump trigger.
 *   - Empty state: shows static navigation jumps + global actions
 *     so even a fresh user can navigate with zero typing.
 *   - Typing → live search via /api/search (debounced 120ms).
 *     Sections: Navigation · Clients · Content · Actions.
 *   - Arrow keys move selection; Enter activates; Escape closes.
 *
 * No external dependency. The same pattern Raven/Badger use, but with
 * Spider's nav surface and entity types.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import {
  LayoutDashboard, Users, FileText, Sparkles, CalendarClock,
  Search as SearchIcon, BarChart3, Server, BookOpen,
  ArrowRight, Download, Plug,
} from 'lucide-react';

type Item = {
  key: string;
  label: string;
  secondary?: string;
  icon: React.ReactNode;
  section: 'Navigation' | 'Clients' | 'Content' | 'Actions';
  href?: string;
  onSelect?: () => Promise<void> | void;
};

const STATIC_NAV: Item[] = [
  { key: 'nav:dashboard',  section: 'Navigation', label: 'Dashboard',       href: '/',           icon: <LayoutDashboard size={14} /> },
  { key: 'nav:clients',    section: 'Navigation', label: 'Clients',         href: '/clients',    icon: <Users size={14} /> },
  { key: 'nav:content',    section: 'Navigation', label: 'Content library', href: '/content',    icon: <FileText size={14} /> },
  { key: 'nav:generation', section: 'Navigation', label: 'Generation',      href: '/generation', icon: <Sparkles size={14} /> },
  { key: 'nav:schedule',   section: 'Navigation', label: 'Schedule',        href: '/schedule',   icon: <CalendarClock size={14} /> },
  { key: 'nav:seo',        section: 'Navigation', label: 'SEO',             href: '/seo',        icon: <SearchIcon size={14} /> },
  { key: 'nav:analytics',  section: 'Navigation', label: 'Analytics',       href: '/analytics',  icon: <BarChart3 size={14} /> },
  { key: 'nav:system',     section: 'Navigation', label: 'System',          href: '/system',     icon: <Server size={14} /> },
  { key: 'nav:help',       section: 'Navigation', label: 'Help',            href: '/help',       icon: <BookOpen size={14} /> },
];

const STATIC_ACTIONS: Item[] = [
  { key: 'act:import-badger', section: 'Actions', label: 'Import clients from Badger', icon: <Download size={14} />, onSelect: async () => {
      const res = await fetch('/api/clients/import-badger', { method: 'POST' });
      if (!res.ok) alert(`Import failed (${res.status})`);
    }
  },
];

type SearchResult = {
  clients: Array<{ id: string; name: string; city: string | null; state: string | null; status: string }>;
  content: Array<{ id: string; title: string | null; body: string; kind: string; status: string; clientId: string }>;
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [active, setActive] = useState(0);
  const [mac, setMac] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMac(typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)); }, []);

  /* ───── Global keyboard shortcut (⌘K / Ctrl+K) ───── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((x) => !x);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ───── Reset state when opened ───── */
  useEffect(() => {
    if (open) {
      setQ('');
      setResults(null);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  /* ───── Debounced search ───── */
  useEffect(() => {
    if (!open) return;
    const trimmed = q.trim();
    if (!trimmed) { setResults(null); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        const json = await res.json();
        if (json?.data) setResults(json.data);
      } catch { /* ignore */ }
    }, 120);
    return () => clearTimeout(timer);
  }, [q, open]);

  /* ───── Build the filtered/grouped item list ───── */
  const items: Item[] = useMemo(() => {
    const trimmed = q.trim().toLowerCase();

    if (!trimmed) {
      return [...STATIC_NAV, ...STATIC_ACTIONS];
    }

    const out: Item[] = [];

    // Navigation: prefix match on label
    for (const n of STATIC_NAV) {
      if (n.label.toLowerCase().includes(trimmed)) out.push(n);
    }

    // Server search results
    if (results) {
      for (const c of results.clients) {
        out.push({
          key: `client:${c.id}`,
          section: 'Clients',
          label: c.name,
          secondary: [c.city, c.state].filter(Boolean).join(', ') || c.status,
          icon: <Users size={14} />,
          href: `/clients/${c.id}`,
        });
      }
      for (const item of results.content) {
        const title = item.title ?? item.body.slice(0, 90).replace(/\s+/g, ' ');
        out.push({
          key: `content:${item.id}`,
          section: 'Content',
          label: title,
          secondary: `${item.kind} · ${item.status}`,
          icon: <FileText size={14} />,
          href: `/content/${item.id}`,
        });
      }
    }

    // Always include actions
    for (const a of STATIC_ACTIONS) {
      if (a.label.toLowerCase().includes(trimmed)) out.push(a);
    }

    return out;
  }, [q, results]);

  /* ───── Keep active in range when items change ───── */
  useEffect(() => {
    if (active >= items.length) setActive(0);
  }, [items, active]);

  function selectItem(item: Item) {
    setOpen(false);
    if (item.onSelect) Promise.resolve(item.onSelect()).catch(() => {});
    else if (item.href) router.push(item.href);
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[active];
      if (item) selectItem(item);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh] animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="absolute inset-0 bg-fg/30 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <div className="relative w-full max-w-2xl mx-4 rounded-lg bg-panel border border-border shadow-card-hover overflow-hidden animate-slide-up">
        <div className="flex items-center gap-2 px-4 h-12 border-b border-border">
          <SearchIcon size={15} className="text-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={onInputKeyDown}
            placeholder="Search clients, content, or jump to…"
            className="flex-1 bg-transparent text-sm text-fg placeholder:text-faint focus:outline-none"
            aria-label="Search"
          />
          <span className="text-[10px] text-faint hidden sm:inline">esc to close</span>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-1">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted">
              No matches.
            </div>
          ) : (
            renderGrouped(items, active, selectItem, setActive)
          )}
        </div>

        <div className="border-t border-border px-4 py-2 flex items-center gap-3 text-[10px] text-faint">
          <KeyHint label={mac ? '⌘' : 'Ctrl'} suffix="K" hint="toggle" />
          <KeyHint label="↑↓" hint="navigate" />
          <KeyHint label="↵" hint="select" />
          <KeyHint label="esc" hint="close" />
        </div>
      </div>
    </div>
  );
}

function renderGrouped(items: Item[], active: number, onSelect: (i: Item) => void, setActive: (n: number) => void) {
  // Walk items in order, grouping consecutive ones by section so the
  // search-rank ordering is preserved within each group.
  const out: React.ReactNode[] = [];
  let currentSection: string | null = null;
  items.forEach((item, idx) => {
    if (item.section !== currentSection) {
      currentSection = item.section;
      out.push(
        <div key={`hdr-${idx}`} className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-faint font-semibold">
          {item.section}
        </div>
      );
    }
    const isActive = idx === active;
    out.push(
      <button
        key={item.key}
        type="button"
        onClick={() => onSelect(item)}
        onMouseEnter={() => setActive(idx)}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-2 text-sm text-left',
          'transition-colors duration-[100ms]',
          isActive ? 'bg-accent-soft text-fg' : 'text-fg hover:bg-subtle/60',
        )}
      >
        <span className={cn('flex-none', isActive ? 'text-accent' : 'text-faint')}>{item.icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block truncate">{item.label}</span>
          {item.secondary && <span className="block text-xs text-muted truncate">{item.secondary}</span>}
        </span>
        <ArrowRight size={12} className={cn('flex-none', isActive ? 'text-accent' : 'text-faint opacity-0')} />
      </button>
    );
  });
  return out;
}

function KeyHint({ label, suffix, hint }: { label: string; suffix?: string; hint: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <kbd className="inline-flex items-center justify-center min-w-[14px] h-4 px-1 rounded bg-bg border border-border text-fg text-[10px] font-sans tabular-nums">{label}</kbd>
      {suffix && <kbd className="inline-flex items-center justify-center min-w-[14px] h-4 px-1 rounded bg-bg border border-border text-fg text-[10px] font-sans tabular-nums">{suffix}</kbd>}
      <span>{hint}</span>
    </span>
  );
}

/**
 * Helper for the sidebar's quick-jump trigger — dispatches the same
 * synthetic keydown the global listener picks up, so we don't need to
 * lift the open state into a shared store.
 */
export function openCommandPalette(): void {
  const ev = new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true });
  window.dispatchEvent(ev);
}
