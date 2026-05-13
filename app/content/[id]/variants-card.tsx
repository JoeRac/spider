'use client';
/**
 * Per-channel variants editor. Lets the operator review or tweak each
 * channel-specific body the engine produced. Falls back to the canonical
 * body when a variant is empty.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, Button, Textarea, Spinner, Badge } from '@/components/ui';
import { Save } from 'lucide-react';

export function VariantsCard({
  itemId, baseBody, variants,
}: {
  itemId: string;
  baseBody: string;
  variants: Record<string, string>;
}) {
  const router = useRouter();
  const [local, setLocal] = useState<Record<string, string>>(variants);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const channels = Object.keys(local);
  if (channels.length === 0) return null;

  function update(channel: string, body: string) {
    setLocal((prev) => ({ ...prev, [channel]: body }));
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      // We persist the whole metadata.variants via the PATCH endpoint,
      // letting it merge with the existing metadata blob server-side.
      const res = await fetch(`/api/content/${itemId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ metadataPatch: { variants: local } }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setMessage(body?.error ?? `Failed (${res.status})`);
      } else {
        setMessage('Variants saved.');
        router.refresh();
      }
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader
        title="Channel variants"
        subtitle="Channel-tailored rewrites. The publisher picks the matching variant; empty = canonical body."
        action={<Button size="sm" variant="primary" onClick={save} disabled={busy}>{busy ? <Spinner size={12} /> : <Save size={12} />}Save variants</Button>}
      />
      <div className="p-5 space-y-4">
        {channels.map((channel) => (
          <div key={channel}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs font-medium text-fg uppercase tracking-wider">{channel}</div>
              {!local[channel] && <Badge tone="warn">empty — falls back to base</Badge>}
            </div>
            <Textarea
              rows={4}
              value={local[channel] ?? ''}
              onChange={(e) => update(channel, e.target.value)}
              placeholder={baseBody.slice(0, 120) + (baseBody.length > 120 ? '…' : '')}
              className="font-mono text-[13px]"
            />
          </div>
        ))}
        {message && <div className="text-xs text-muted">{message}</div>}
      </div>
    </Card>
  );
}
