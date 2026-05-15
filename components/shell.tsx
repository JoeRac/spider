'use client';
/**
 * Spider app shell — 232px left sidebar + main content.
 *
 * Visual DNA mirrors Raven: soft pill highlights with indigo accent bar,
 * uppercase section labels, 120ms hover/active transitions, collapsible to
 * an icon rail on desktop (Cmd-\), drawer on mobile.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { SectionLabel } from './ui';
import {
  LayoutDashboard, Users, FileText,
  BookOpen, Search, BarChart3, Server,
  PanelLeftClose, PanelLeftOpen, Menu, X as XIcon,
  Search as SearchIcon,
} from 'lucide-react';
import { CommandPalette, openCommandPalette } from './command-palette';

type NavItem = { href: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }> };
type NavSection = { label: string; items: NavItem[] };

const NAV: NavSection[] = [
  {
    label: 'Workspace',
    items: [
      { href: '/',          label: 'Dashboard',  icon: LayoutDashboard },
      { href: '/clients',   label: 'Clients',    icon: Users },
    ],
  },
  {
    label: 'Content',
    items: [
      { href: '/content', label: 'Content', icon: FileText },
    ],
  },
  {
    label: 'Growth',
    items: [
      { href: '/seo',       label: 'SEO',       icon: Search },
      { href: '/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
];

const FOOTER: NavItem[] = [
  { href: '/system', label: 'System', icon: Server },
  { href: '/help',   label: 'Help',   icon: BookOpen },
];

const COLLAPSED_KEY = 'spider:sidebar-collapsed';

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mac, setMac] = useState(false);

  useEffect(() => {
    setMac(typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform));
    try {
      if (localStorage.getItem(COLLAPSED_KEY) === '1') setCollapsed(true);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setCollapsed((c) => {
          const next = !c;
          try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch { /* ignore */ }
          return next;
        });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }

  const sidebarInner = (
    <SidebarContent
      pathname={pathname}
      mac={mac}
      collapsed={collapsed}
      onCollapseToggle={toggleCollapsed}
      onMobileClose={() => setMobileOpen(false)}
    />
  );

  return (
    <div className={cn(
      'min-h-screen md:grid',
      collapsed ? 'md:grid-cols-[60px_1fr]' : 'md:grid-cols-[232px_1fr]',
      'transition-[grid-template-columns] duration-200 ease-out',
    )}>
      <aside
        className={cn(
          'hidden md:flex border-r border-border bg-panel flex-col sticky top-0 h-screen',
          'transition-[width] duration-200 ease-out overflow-hidden',
        )}
        aria-label="Sidebar"
      >
        {sidebarInner}
      </aside>

      <div className="md:hidden sticky top-0 z-30 flex items-center gap-2 px-3 h-12 border-b border-border bg-panel/95 backdrop-blur">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          className="inline-flex items-center justify-center h-9 w-9 rounded-md text-muted hover:bg-subtle hover:text-fg"
        >
          <Menu size={16} />
        </button>
        <SpiderMark />
        <span className="text-sm font-semibold text-fg">Spider</span>
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 animate-fade-in" aria-modal="true" role="dialog">
          <div className="absolute inset-0 bg-fg/30 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-[260px] bg-panel border-r border-border shadow-xl flex flex-col animate-slide-up">
            {sidebarInner}
          </aside>
        </div>
      )}

      <main className="min-w-0 min-h-screen flex flex-col">
        {children}
      </main>

      <CommandPalette />
    </div>
  );
}

function SidebarContent({
  pathname, mac, collapsed, onCollapseToggle, onMobileClose,
}: {
  pathname: string;
  mac: boolean;
  collapsed: boolean;
  onCollapseToggle: () => void;
  onMobileClose: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border">
        <Link
          href="/"
          aria-label="Spider home"
          className="flex items-center gap-2.5 hover:bg-subtle/40 -mx-1 -my-1 px-1 py-1 rounded-md transition-colors duration-[120ms] min-w-0"
        >
          <SpiderMark />
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-semibold text-sm text-fg tracking-tight leading-tight">Spider</div>
              <div className="text-[10px] text-muted leading-tight mt-px">client workflow hub</div>
            </div>
          )}
        </Link>
        <button
          type="button"
          onClick={onCollapseToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'hidden md:inline-flex ml-auto items-center justify-center h-7 w-7 rounded',
            'text-faint hover:text-fg hover:bg-subtle transition-colors',
            collapsed && 'mx-auto',
          )}
          title={collapsed ? `Expand sidebar (${mac ? '⌘' : 'Ctrl'}\\)` : `Collapse sidebar (${mac ? '⌘' : 'Ctrl'}\\)`}
        >
          {collapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
        </button>
        <button
          type="button"
          onClick={onMobileClose}
          aria-label="Close navigation"
          className="md:hidden ml-auto inline-flex items-center justify-center h-7 w-7 rounded text-faint hover:text-fg hover:bg-subtle"
        >
          <XIcon size={14} />
        </button>
      </div>

      {/* Quick jump trigger — opens the ⌘K palette */}
      <div className={cn('pt-3 pb-2', collapsed ? 'px-2' : 'px-3')}>
        {collapsed ? (
          <button
            type="button"
            onClick={openCommandPalette}
            aria-label="Quick jump (⌘K)"
            title="Quick jump (⌘K)"
            className="w-full inline-flex items-center justify-center h-8 rounded-md bg-bg/70 border border-border text-muted hover:bg-subtle hover:border-border-strong hover:text-fg transition-colors"
          >
            <SearchIcon size={13} />
          </button>
        ) : (
          <button
            type="button"
            onClick={openCommandPalette}
            className={cn(
              'w-full flex items-center gap-2 h-8 px-2.5 rounded-md text-xs',
              'bg-bg/70 border border-border text-muted',
              'transition-[background-color,border-color,color] duration-[120ms] ease-out',
              'hover:bg-subtle hover:border-border-strong hover:text-fg',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel',
            )}
          >
            <SearchIcon size={13} />
            <span className="flex-1 text-left">Quick jump</span>
            <span className="inline-flex items-center gap-0.5">
              <kbd className="px-1 rounded border border-border bg-panel text-[9px] text-faint">{mac ? '⌘' : 'Ctrl'}</kbd>
              <kbd className="px-1 rounded border border-border bg-panel text-[9px] text-faint">K</kbd>
            </span>
          </button>
        )}
      </div>

      <nav className={cn('flex-1 pb-3 overflow-y-auto', collapsed ? 'px-1.5' : 'px-2')} aria-label="Primary">
        {NAV.map((section) => (
          <div key={section.label} className="mb-2.5">
            {!collapsed && <SectionLabel className="px-3 mb-1">{section.label}</SectionLabel>}
            <NavGroup items={section.items} pathname={pathname} collapsed={collapsed} />
          </div>
        ))}
      </nav>

      <div className={cn('border-t border-border space-y-1', collapsed ? 'p-1.5' : 'p-2')}>
        <NavGroup items={FOOTER} pathname={pathname} collapsed={collapsed} />
      </div>
    </>
  );
}

function NavGroup({ items, pathname, collapsed = false }: { items: NavItem[]; pathname: string; collapsed?: boolean }) {
  return (
    <div className="space-y-px">
      {items.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            aria-label={collapsed ? item.label : undefined}
            title={collapsed ? item.label : undefined}
            className={cn(
              'group relative flex items-center rounded-md text-[13px]',
              'transition-[background-color,color] duration-[120ms] ease-out',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel',
              collapsed ? 'justify-center h-9 w-9 mx-auto' : 'gap-2.5 px-3 h-8',
              active ? 'bg-accent-soft text-accent font-medium' : 'text-muted hover:text-fg hover:bg-subtle',
            )}
          >
            {active && !collapsed && (
              <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-accent" />
            )}
            <Icon
              size={collapsed ? 16 : 15}
              className={cn(
                'transition-colors duration-[120ms] ease-out',
                active ? 'text-accent' : 'text-faint group-hover:text-fg',
              )}
            />
            {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Spider mark — bitmap logo served from /public/spider-logo.png.
 * Same asset is auto-routed by Next 16 as the browser favicon via
 * app/icon.png + app/apple-icon.png.
 */
function SpiderMark({ size = 28 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/spider-logo.png"
      alt=""
      width={size}
      height={size}
      className="flex-none"
      aria-hidden
    />
  );
}
