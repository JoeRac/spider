'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, Button, FieldGroup, Input, Textarea, Spinner } from '@/components/ui';
import { Save } from 'lucide-react';
import type { Voice } from '@/lib/content/voice';

export function VoiceEditor({ clientId, initial }: { clientId: string; initial: Voice }) {
  const router = useRouter();
  const [niche, setNiche] = useState(initial.niche ?? '');
  const [tone, setTone] = useState(initial.tone ?? '');
  const [audience, setAudience] = useState(initial.audience ?? '');
  const [sellingPoints, setSellingPoints] = useState((initial.sellingPoints ?? []).join('\n'));
  const [avoid, setAvoid] = useState((initial.avoid ?? []).join('\n'));
  const [cta, setCta] = useState(initial.callToAction ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/voice`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          niche: niche || undefined,
          tone: tone || undefined,
          audience: audience || undefined,
          sellingPoints: sellingPoints.split('\n').map((s) => s.trim()).filter(Boolean),
          avoid: avoid.split('\n').map((s) => s.trim()).filter(Boolean),
          callToAction: cta || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setMessage(json?.error ?? `Failed (${res.status})`); return; }
      setMessage('Voice saved.');
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader
        title="Voice"
        subtitle="Bias every generation for this client. Compact — every line shows up as a system-prompt directive."
        action={<Button variant="primary" size="sm" onClick={save} disabled={busy}>{busy ? <Spinner size={12} /> : <Save size={12} />}Save</Button>}
      />
      <div className="p-5 space-y-3">
        <FieldGroup label="Niche" hint="What kind of business?">
          <Input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="e.g. independent used-car dealership specialising in trucks" />
        </FieldGroup>
        <FieldGroup label="Tone">
          <Input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="e.g. friendly + direct, no jargon" />
        </FieldGroup>
        <FieldGroup label="Audience">
          <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. working families in the Phoenix metro" />
        </FieldGroup>
        <FieldGroup label="Selling points" hint="One per line">
          <Textarea rows={3} value={sellingPoints} onChange={(e) => setSellingPoints(e.target.value)} placeholder={'On-site financing\nCarFax on every vehicle\nFamily-owned since 1998'} />
        </FieldGroup>
        <FieldGroup label="Avoid" hint="One per line">
          <Textarea rows={2} value={avoid} onChange={(e) => setAvoid(e.target.value)} placeholder={'Pushy sales language\nFake urgency'} />
        </FieldGroup>
        <FieldGroup label="Preferred CTA">
          <Input value={cta} onChange={(e) => setCta(e.target.value)} placeholder='e.g. "Swing by the lot — we&apos;re open till 8."' />
        </FieldGroup>
        {message && <div className="text-xs text-muted">{message}</div>}
      </div>
    </Card>
  );
}
