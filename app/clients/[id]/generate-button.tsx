'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Spinner, Select } from '@/components/ui';
import { Sparkles } from 'lucide-react';
import { CONTENT_KINDS, TEMPLATES, type ContentKind } from '@/lib/content/templates';

export function GenerateButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ContentKind>('post');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function fire() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/content/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId, kind, quantity: 3 }),
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
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        <Sparkles size={12} />
        Generate content
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={kind} onChange={(e) => setKind(e.target.value as ContentKind)} className="h-8 py-0 text-xs">
        {CONTENT_KINDS.map((k) => <option key={k} value={k}>{TEMPLATES[k].label}</option>)}
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
