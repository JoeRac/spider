'use client';
/**
 * Single channel card on the client-detail page. Renders the right CTA
 * for whatever lifecycle stage the connection is in:
 *
 *   - disconnected:                      [Connect] (or [Configure] for manual)
 *   - connected:                         [Disconnect] [Refresh?]
 *   - error / expired:                   [Reconnect]
 *   - OAuth app not configured on server: [Set up OAuth →] linking to Settings
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Badge, Spinner } from '@/components/ui';
import { Plug, RefreshCw, Unplug, Settings as SettingsIcon } from 'lucide-react';
import type { Channel } from '@/lib/db/schema';

export type ChannelCardData = {
  channel: Channel;
  label: string;
  kind: 'oauth' | 'manual';
  configured: boolean;
  supportsRefresh: boolean;
  integration: null | {
    id: string;
    status: string;
    lastSyncAt: string | null;
    lastError: string | null;
    externalIds: Record<string, string>;
  };
};

export function ChannelCard({ clientId, data }: { clientId: string; data: ChannelCardData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<null | 'connect' | 'disconnect' | 'refresh' | 'configure'>(null);
  const [error, setError] = useState<string | null>(null);

  const status = data.integration?.status ?? 'disconnected';
  const tone =
    status === 'connected' ? 'ok' :
    status === 'error' ? 'err' :
    status === 'expired' ? 'warn' : 'neutral';

  const subtitle =
    data.integration?.externalIds?.page_name ??
    data.integration?.externalIds?.channel_title ??
    data.integration?.externalIds?.account_name ??
    data.integration?.externalIds?.username ??
    data.integration?.externalIds?.base_url ??
    (data.integration?.lastSyncAt
      ? `Last sync ${new Date(data.integration.lastSyncAt).toLocaleString()}`
      : null);

  async function startConnect() {
    if (!data.configured && data.kind === 'oauth') {
      setError(`${data.label} OAuth app isn't configured on this server.`);
      return;
    }
    setBusy('connect');
    setError(null);
    if (data.kind === 'oauth') {
      window.location.href = `/api/integrations/${data.channel}/connect?clientId=${encodeURIComponent(clientId)}`;
      return;
    }
    // Manual (website_blog) — for phase 2 we land them on a dedicated
    // form page via a hash; the form lives next to this card.
    document.getElementById(`configure-${data.channel}`)?.scrollIntoView({ behavior: 'smooth' });
    setBusy(null);
  }

  async function disconnect() {
    if (!data.integration) return;
    setBusy('disconnect');
    setError(null);
    try {
      const res = await fetch(`/api/connections/${data.integration.id}/disconnect`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Disconnect failed (${res.status})`);
      } else {
        startTransition(() => router.refresh());
      }
    } finally { setBusy(null); }
  }

  async function refresh() {
    if (!data.integration) return;
    setBusy('refresh');
    setError(null);
    try {
      const res = await fetch(`/api/connections/${data.integration.id}/refresh`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Refresh failed (${res.status})`);
      } else {
        startTransition(() => router.refresh());
      }
    } finally { setBusy(null); }
  }

  const isBusy = busy !== null || pending;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-md border border-border bg-bg/40">
      <div className="min-w-0">
        <div className="text-sm font-medium text-fg flex items-center gap-2">
          {data.label}
          {!data.configured && data.kind === 'oauth' && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-warn">
              <SettingsIcon size={10} /> needs setup
            </span>
          )}
        </div>
        <div className="text-xs text-muted mt-0.5 truncate">
          {error ? <span className="text-err">{error}</span> :
           data.integration?.lastError ? <span className="text-err truncate">{data.integration.lastError}</span> :
           subtitle ?? 'Not connected yet'}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-none">
        <Badge tone={tone}>{status}</Badge>
        {data.integration && status === 'connected' ? (
          <>
            {data.supportsRefresh && (
              <Button size="sm" variant="ghost" onClick={refresh} disabled={isBusy} title="Refresh tokens">
                {busy === 'refresh' ? <Spinner size={12} /> : <RefreshCw size={12} />}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={disconnect} disabled={isBusy}>
              {busy === 'disconnect' ? <Spinner size={12} /> : <Unplug size={12} />}
              Disconnect
            </Button>
          </>
        ) : (
          <Button size="sm" variant="primary" onClick={startConnect} disabled={isBusy || (!data.configured && data.kind === 'oauth')}>
            {busy === 'connect' ? <Spinner size={12} /> : <Plug size={12} />}
            {status === 'error' || status === 'expired' ? 'Reconnect' : 'Connect'}
          </Button>
        )}
      </div>
    </div>
  );
}
