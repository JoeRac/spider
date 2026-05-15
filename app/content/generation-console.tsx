'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardHeader, FieldGroup, Input, Select, Textarea, Spinner } from '@/components/ui';
import { Sparkles } from 'lucide-react';
import { CONTENT_KINDS, TEMPLATES, type ContentKind } from '@/lib/content/templates';
import Link from 'next/link';

type ClientOption = { id: string; name: string };
type Outcome = {
  runId: string;
  status: 'completed' | 'failed';
  itemIds: string[];
  costCents?: number;
  error?: string;
};

export function GenerationConsole({ clients, disabled, defaultModel }: { clients: ClientOption[]; disabled: boolean; defaultModel: string }) {
  const router = useRouter();
  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [kind, setKind] = useState<ContentKind>('post');
  const [quantity, setQuantity] = useState(3);
  const [brief, setBrief] = useState('');
  const [model, setModel] = useState(defaultModel);
  const [withVariants, setWithVariants] = useState(true);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const template = TEMPLATES[kind];

  async function fire() {
    if (!clientId) { setError('Pick a client first.'); return; }
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      const res = await fetch('/api/content/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId, kind, quantity, brief: brief || undefined, model: model !== defaultModel ? model : undefined, withVariants }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json?.error ?? `Failed (${res.status})`); return; }
      setOutcome(json.data);
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader title="Generate" subtitle={`Template: ${template.label} · ${template.targetLength}`} />
      <div className="p-5 space-y-4">
        <FieldGroup label="Client">
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={disabled || clients.length === 0}>
            {clients.length === 0 && <option value="">No clients yet — import from Badger</option>}
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </FieldGroup>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FieldGroup label="Kind">
            <Select value={kind} onChange={(e) => setKind(e.target.value as ContentKind)} disabled={disabled}>
              {CONTENT_KINDS.map((k) => <option key={k} value={k}>{TEMPLATES[k].label}</option>)}
            </Select>
          </FieldGroup>
          <FieldGroup label="Quantity" hint="1 – 10">
            <Input type="number" min={1} max={10} value={quantity} onChange={(e) => setQuantity(Number(e.target.value) || 1)} disabled={disabled} />
          </FieldGroup>
          <FieldGroup label="Model" hint="Override Z.AI model id">
            <Input value={model} onChange={(e) => setModel(e.target.value)} disabled={disabled} />
          </FieldGroup>
        </div>

        <FieldGroup label="Operator brief" hint="Optional — bias this batch toward a specific angle.">
          <Textarea
            rows={3}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="e.g. focus on holiday inventory; mention winter tire promo."
            disabled={disabled}
          />
        </FieldGroup>

        <label className="flex items-center gap-2 text-sm text-fg cursor-pointer">
          <input
            type="checkbox"
            checked={withVariants}
            onChange={(e) => setWithVariants(e.target.checked)}
            disabled={disabled}
            className="accent-accent"
          />
          <span>Generate per-channel variants</span>
          <span className="text-xs text-muted">— one tailored body per connected channel, costs a second LLM call.</span>
        </label>

        {error && <div className="text-xs text-err">{error}</div>}

        {outcome && (
          <div className="rounded-md border border-ok/30 bg-ok-soft/50 p-3 text-xs">
            <div className="text-ok font-semibold">
              {outcome.status === 'completed' ? `Generated ${outcome.itemIds.length} drafts.` : 'Generation failed.'}
            </div>
            {outcome.error && <div className="text-err mt-1">{outcome.error}</div>}
            {outcome.costCents != null && (
              <div className="text-muted mt-1">Cost: {(outcome.costCents / 100).toFixed(2)} ¢</div>
            )}
            {outcome.itemIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {outcome.itemIds.map((id) => (
                  <Link key={id} href={`/content/${id}`} className="px-2 py-0.5 rounded bg-panel border border-border text-fg hover:bg-subtle font-mono text-[10px]">
                    {id.slice(0, 8)}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="primary" onClick={fire} disabled={disabled || busy || !clientId}>
            {busy ? <Spinner size={14} /> : <Sparkles size={14} />}
            Generate
          </Button>
        </div>
      </div>
    </Card>
  );
}
