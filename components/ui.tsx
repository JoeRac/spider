/**
 * Spider design primitives — same visual DNA as Raven and Badger.
 *
 * Light theme, indigo accent, 28/36/40px sizing system. Buttons + inputs
 * align side-by-side at h-9, focus rings live on `shadow-focus`, and every
 * interactive surface transitions over 120ms. Mirror these tokens whenever
 * adding new UI so the apps feel like siblings.
 */
'use client';

import { cn } from '@/lib/cn';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { forwardRef } from 'react';

/* ────────────────────────────────────────────────────────────
   Shared utility classes
   ──────────────────────────────────────────────────────────── */
const TRANSITION = 'transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] ease-out';
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg';
const DISABLED = 'disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none';

/* ────────────────────────────────────────────────────────────
   Page scaffolding
   ──────────────────────────────────────────────────────────── */

export function PageHeader({
  title, subtitle, actions, breadcrumbs, eyebrow,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="bg-panel border-b border-border">
      <div className="px-8 py-6 flex items-start justify-between gap-6">
        <div className="min-w-0">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted mb-2">
              {breadcrumbs.map((b, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={11} className="text-faint" />}
                  {b.href ? (
                    <Link href={b.href} className="hover:text-fg transition-colors duration-[120ms]">{b.label}</Link>
                  ) : (
                    <span className="text-fg">{b.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
          {eyebrow && <div className="text-[11px] uppercase tracking-wider text-accent font-semibold mb-1.5">{eyebrow}</div>}
          <h1 className="text-[22px] font-semibold tracking-tight text-fg leading-[1.15]">{title}</h1>
          {subtitle && <div className="text-sm text-muted mt-1.5 max-w-2xl leading-relaxed">{subtitle}</div>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-none pt-0.5">{actions}</div>}
      </div>
    </div>
  );
}

export function Page({ children, max = 'full' }: { children: React.ReactNode; max?: 'full' | '7xl' | '5xl' | '3xl' }) {
  const maxClass =
    max === 'full' ? 'max-w-none' :
    max === '7xl'  ? 'max-w-7xl' :
    max === '5xl'  ? 'max-w-5xl' :
    'max-w-3xl';
  return <div className={cn('w-full px-8 py-7 mx-auto', maxClass)}>{children}</div>;
}

export function SectionLabel({
  children, icon, className,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(
      'text-[10px] uppercase tracking-wider font-semibold text-faint inline-flex items-center gap-1.5',
      className,
    )}>
      {icon}
      {children}
    </div>
  );
}

export function SectionTitle({ title, hint, action }: { title: React.ReactNode; hint?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between mb-3">
      <div>
        <div className="text-sm font-semibold text-fg">{title}</div>
        {hint && <div className="text-xs text-muted mt-0.5">{hint}</div>}
      </div>
      {action}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Buttons
   ──────────────────────────────────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-10 px-4 text-sm gap-2',
};

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-fg shadow-xs ' +
    'hover:bg-accent-strong hover:shadow-sm ' +
    'active:bg-accent-strong/95 active:scale-[0.99]',
  secondary:
    'bg-panel border border-border text-fg shadow-xs ' +
    'hover:bg-subtle hover:border-border-strong hover:shadow-sm ' +
    'active:bg-subtle/80',
  outline:
    'border border-accent/30 text-accent bg-accent-soft/60 ' +
    'hover:bg-accent-soft hover:border-accent/50',
  ghost:
    'text-muted hover:text-fg hover:bg-subtle ' +
    'active:bg-subtle/80',
  danger:
    'bg-err/5 border border-err/30 text-err shadow-xs ' +
    'hover:bg-err/10 hover:border-err/40 ' +
    'active:bg-err/15',
};

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
  }
>(function Button({ className, variant = 'secondary', size = 'md', ...props }, ref) {
  return (
    <button
      ref={ref}
      {...props}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium select-none',
        TRANSITION, FOCUS, DISABLED,
        BUTTON_SIZES[size], BUTTON_VARIANTS[variant],
        className,
      )}
    />
  );
});

export function LinkButton({
  href, variant = 'secondary', size = 'md', className, children, target, rel,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
  target?: string;
  rel?: string;
}) {
  return (
    <Link
      href={href}
      target={target}
      rel={rel}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium select-none',
        TRANSITION, FOCUS,
        BUTTON_SIZES[size], BUTTON_VARIANTS[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}

/* ────────────────────────────────────────────────────────────
   Form fields
   ──────────────────────────────────────────────────────────── */

const INPUT_BASE =
  'w-full px-3 h-9 rounded-md bg-panel border border-border text-sm text-fg shadow-xs ' +
  'placeholder:text-faint ' +
  'transition-[border-color,box-shadow] duration-[120ms] ease-out ' +
  'focus:outline-none focus:border-accent focus:shadow-focus ' +
  'disabled:bg-subtle disabled:text-muted disabled:cursor-not-allowed disabled:shadow-none';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} {...props} className={cn(INPUT_BASE, className)} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        {...props}
        className={cn(
          'w-full px-3 py-2 rounded-md bg-panel border border-border text-sm text-fg shadow-xs',
          'placeholder:text-faint leading-relaxed',
          'transition-[border-color,box-shadow] duration-[120ms] ease-out',
          'focus:outline-none focus:border-accent focus:shadow-focus',
          'disabled:bg-subtle disabled:text-muted disabled:cursor-not-allowed disabled:shadow-none',
          className,
        )}
      />
    );
  },
);

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        INPUT_BASE, 'pr-8 appearance-none bg-no-repeat bg-[right_0.5rem_center] cursor-pointer',
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='none' stroke='%235b6473' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")",
      }}
    />
  );
}

export function Label({ children, htmlFor, hint }: { children: React.ReactNode; htmlFor?: string; hint?: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-fg mb-1.5">
      {children}
      {hint && <span className="ml-1.5 text-[11px] text-muted font-normal">{hint}</span>}
    </label>
  );
}

export function FieldGroup({ label, hint, children, error, htmlFor }: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  error?: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div>
      {label && <Label htmlFor={htmlFor} hint={hint}>{label}</Label>}
      {children}
      {error && <div className="text-xs text-err mt-1">{error}</div>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Display: badges, dots, cards, stats, empty
   ──────────────────────────────────────────────────────────── */

export function Badge({
  children, tone = 'neutral', icon,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'ok' | 'warn' | 'err' | 'info' | 'accent';
  icon?: React.ReactNode;
}) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide',
      tone === 'neutral' && 'bg-subtle text-muted ring-1 ring-inset ring-border',
      tone === 'ok' && 'bg-ok-soft text-ok ring-1 ring-inset ring-ok/20',
      tone === 'warn' && 'bg-warn-soft text-warn ring-1 ring-inset ring-warn/20',
      tone === 'err' && 'bg-err-soft text-err ring-1 ring-inset ring-err/20',
      tone === 'info' && 'bg-info-soft text-info ring-1 ring-inset ring-info/20',
      tone === 'accent' && 'bg-accent-soft text-accent ring-1 ring-inset ring-accent/20',
    )}>
      {icon}
      {children}
    </span>
  );
}

export function Dot({ tone = 'neutral' }: { tone?: 'neutral' | 'ok' | 'warn' | 'err' | 'info' | 'accent' }) {
  return (
    <span className={cn(
      'inline-block h-1.5 w-1.5 rounded-full',
      tone === 'neutral' && 'bg-faint',
      tone === 'ok' && 'bg-ok',
      tone === 'warn' && 'bg-warn',
      tone === 'err' && 'bg-err',
      tone === 'info' && 'bg-info',
      tone === 'accent' && 'bg-accent',
    )} />
  );
}

export function Card({ className, hoverable, ...props }: React.HTMLAttributes<HTMLDivElement> & { hoverable?: boolean }) {
  return (
    <div
      {...props}
      className={cn(
        'rounded-lg border border-border bg-panel shadow-sm',
        hoverable && 'transition-shadow duration-[180ms] ease-out hover:shadow-card-hover hover:border-border-strong',
        className,
      )}
    />
  );
}

export function CardHeader({ title, subtitle, action, className }: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-4 px-5 py-4 border-b border-border', className)}>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-fg leading-tight">{title}</div>
        {subtitle && <div className="text-xs text-muted mt-1 leading-snug">{subtitle}</div>}
      </div>
      {action && <div className="flex items-center gap-1.5 flex-none">{action}</div>}
    </div>
  );
}

export function StatTile({
  label, value, hint, tone = 'neutral', icon,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'neutral' | 'ok' | 'warn' | 'err' | 'accent' | 'info';
  icon?: React.ReactNode;
}) {
  const valueColor =
    tone === 'ok' ? 'text-ok' :
    tone === 'warn' ? 'text-warn' :
    tone === 'err' ? 'text-err' :
    tone === 'accent' ? 'text-accent' :
    tone === 'info' ? 'text-info' :
    'text-fg';

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>{label}</SectionLabel>
        {icon && <div className="text-faint">{icon}</div>}
      </div>
      <div className={cn('mt-2 text-[26px] font-semibold tabular-nums leading-none', valueColor)}>
        {value}
      </div>
      {hint && <div className="mt-2 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

export function Empty({
  title, hint, action, icon,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="p-12 flex flex-col items-center justify-center text-center">
      {icon && <div className="text-faint mb-3">{icon}</div>}
      <div className="text-sm font-semibold text-fg">{title}</div>
      {hint && <div className="text-xs text-muted mt-1.5 max-w-md leading-relaxed">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}

export function MetaList({ items, className }: {
  items: Array<{ label: React.ReactNode; value: React.ReactNode }>;
  className?: string;
}) {
  return (
    <dl className={cn('text-sm divide-y divide-border', className)}>
      {items.map((it, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-2">
          <dt className="text-muted">{it.label}</dt>
          <dd className="text-fg text-right tabular-nums min-w-0 truncate">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn('animate-spin text-current', className)}
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
