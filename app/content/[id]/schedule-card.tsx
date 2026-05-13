'use client';
/**
 * Schedule + publish-now controls + target list, rendered next to the
 * content editor on the detail page.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardHeader, Spinner, Badge, FieldGroup, Input } from '@/components/ui';
import { CalendarClock, Send } from 'lucide-react';
import type { Channel } from '@/lib/db/schema';

type IntegrationRow = {
  id: string;
  channel: Channel;
  channelLabel: string;
  status: string;
};

type TargetRow = {
  id: string;
  integrationId: string;
  channelLabel: string;
  status: string;
  externalUrl: string | null;
  publishedAt: string | null;
  lastError: string | null;
};

export function ScheduleCard({
  itemId, scheduledFor, availableIntegrations, targets,
}: {
  itemId: string;
  scheduledFor: string | null;
  availableIntegrations: IntegrationRow[];
  targets: TargetRow[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<Channel>>(() => new Set(targets
    .map((t) => availableIntegrations.find((i) => i.id === t.integrationId)?.channel)
    .filter(Boolean) as Channel[]));
  const [when, setWhen] = useState(scheduledFor ? toLocalInput(scheduledFor) : '');
  const [busy, setBusy] = useState<null | 'schedule' | 'publishNow'>(null);
  const [message, setMessage] = useState<string | null>(null);

  function toggle(channel: Channel) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(channel) ? next.delete(channel) : next.add(channel);
      return next;
    });
  }

  async function call(path: string, kind: 'schedule' | 'publishNow') {
    if (selected.size === 0) { setMessage('Pick at least one channel.'); return; }
    setBusy(kind);
    setMessage(null);
    try {
      const body: Record<string, unknown> = { channels: Array.from(selected) };
      if (kind === 'schedule') body.scheduledFor = when ? new Date(when).toISOString() : null;
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) setMessage(json?.error ?? `Failed (${res.status})`);
      else {
        setMessage(kind === 'schedule'
          ? `Scheduled to ${selected.size} channel${selected.size === 1 ? '' : 's'}.`
          : `Publish triggered. ${json.data?.published ?? 0} succeeded, ${json.data?.failed ?? 0} failed.`);
        router.refresh();
      }
    } finally { setBusy(null); }
  }

  return (
    <Card>
      <CardHeader title="Publish" subtitle="Pick channels, then schedule for later or fire now." />
      <div className="p-5 space-y-4">
        {availableIntegrations.length === 0 ? (
          <div className="text-xs text-muted">No channels connected yet for this client.</div>
        ) : (
          <div className="space-y-1.5">
            {availableIntegrations.map((i) => (
              <label key={i.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-subtle/40 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(i.channel)}
                  onChange={() => toggle(i.channel)}
                  disabled={i.status !== 'connected'}
                  className="accent-accent"
                />
                <span className="text-sm text-fg flex-1">{i.channelLabel}</span>
                <Badge tone={i.status === 'connected' ? 'ok' : 'neutral'}>{i.status}</Badge>
              </label>
            ))}
          </div>
        )}

        <FieldGroup label="Schedule for" hint="Leave blank for ASAP.">
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </FieldGroup>

        {message && <div className="text-xs text-muted">{message}</div>}

        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => call(`/api/content/${itemId}/schedule`, 'schedule')} disabled={busy !== null}>
            {busy === 'schedule' ? <Spinner size={12} /> : <CalendarClock size={12} />}
            Schedule
          </Button>
          <Button variant="outline" size="sm" onClick={() => call(`/api/content/${itemId}/publish-now`, 'publishNow')} disabled={busy !== null}>
            {busy === 'publishNow' ? <Spinner size={12} /> : <Send size={12} />}
            Publish now
          </Button>
        </div>

        {targets.length > 0 && (
          <div className="border-t border-border pt-4">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-faint mb-2">Fan-out status</div>
            <ul className="space-y-1.5">
              {targets.map((t) => {
                const tone =
                  t.status === 'published' ? 'ok' :
                  t.status === 'failed' ? 'err' :
                  t.status === 'publishing' ? 'info' : 'neutral';
                return (
                  <li key={t.id} className="flex items-center gap-2 text-xs">
                    <Badge tone={tone}>{t.status}</Badge>
                    <span className="text-fg">{t.channelLabel}</span>
                    {t.externalUrl && (
                      <a href={t.externalUrl} target="_blank" rel="noopener noreferrer" className="ml-1 text-muted hover:text-accent">View →</a>
                    )}
                    {t.lastError && <span className="ml-auto text-err truncate max-w-[200px]" title={t.lastError}>{t.lastError}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
