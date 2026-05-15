'use client';
/**
 * Per-client Generate trigger — channel-first.
 *
 * Compact inline picker: operator picks one of the client's connected
 * channels, we infer the right content kind from the channel-to-kind
 * map and fire the generation. Defaults the channel to whichever
 * the client has live.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Spinner, Select } from '@/components/ui';
import { Sparkles } from 'lucide-react';
import { kindForChannel } from '@/lib/content/channel-to-kind';
import type { Channel } from '@/lib/db/schema';

export type GenerateButtonChannel = { channel: Channel; label: string };

export function GenerateButton({
  clientId, channels,
}: {
  clientId: string;
  channels: GenerateButtonChannel[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<Channel>(channels[0]?.channel ?? 'google_my_business');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function fire() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/content/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId,
          kind: kindForChannel(channel),
          quantity: 3,
          withVariants: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setMessage(json?.error ?? `Failed (${res.status})`); return; }
      const ids: string[] = json.data?.itemIds ?? [];
      setMessage(`Generated ${ids.length} drafts.`);
      router.refresh();
    } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <Button variant="primary" size="sm" onClick={() => setOpen(true)} disabled={channels.length === 0} title={channels.length === 0 ? 'Connect a channel first' : undefined}>
        <Sparkles size={12} />
        Generate content
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className="h-8 py-0 text-xs">
        {channels.map((c) => <option key={c.channel} value={c.channel}>{c.label}</option>)}
      </Select>
      <Button variant="primary" size="sm" onClick={fire} disabled={busy}>
        {busy ? <Spinner size={12} /> : <Sparkles size={12} />}
        Run
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
        Cancel
      </Button>
      {message && <span className="text-xs text-muted">{message}</span>}
    </div>
  );
}
