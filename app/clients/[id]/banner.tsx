'use client';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

/**
 * One-shot banner for the integration_connected / integration_error query
 * params the OAuth callback sets. Renders the message, lets the operator
 * dismiss, and strips the query string so a refresh doesn't show it again.
 */
export function Banner({ message, tone }: { message: string; tone: 'ok' | 'err' }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    // Auto-strip the search params from the URL after a few seconds.
    const t = setTimeout(() => clear(), 8000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clear() {
    setOpen(false);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('integration_error');
      url.searchParams.delete('integration_connected');
      window.history.replaceState({}, '', url.toString());
      router.refresh();
    }
  }

  if (!open) return null;
  return (
    <div className={cn(
      'mb-4 flex items-center justify-between gap-3 px-4 py-2.5 rounded-md border',
      tone === 'ok' ? 'bg-ok-soft border-ok/30 text-ok' : 'bg-err-soft border-err/30 text-err',
    )}>
      <div className="text-sm">{message}</div>
      <button onClick={clear} className="text-current/70 hover:text-current">
        <X size={14} />
      </button>
    </div>
  );
}
