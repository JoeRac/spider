'use client';
/**
 * Citations checklist on the client detail page. Operator flips the
 * status per directory and pastes the live listing URL.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, Badge, Spinner, Input, Select, SectionLabel } from '@/components/ui';

type Status = 'missing' | 'partial' | 'complete' | 'na';
type Item = {
  directory: {
    key: string;
    name: string;
    url: string;
    priority: 1 | 2 | 3;
    category: string;
    notes?: string;
  };
  status: Status;
  url: string | null;
  notes: string | null;
};

export function CitationsCard({ clientId, items }: { clientId: string; items: Item[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [local, setLocal] = useState<Map<string, Item>>(() => new Map(items.map((i) => [i.directory.key, i])));

  async function patch(key: string, fields: Partial<{ status: Status; url: string | null }>) {
    setBusyKey(key);
    try {
      const res = await fetch(`/api/clients/${clientId}/citations`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ directoryKey: key, ...fields }),
      });
      if (res.ok) {
        setLocal((prev) => {
          const next = new Map(prev);
          const cur = next.get(key);
          if (cur) next.set(key, { ...cur, ...fields, status: fields.status ?? cur.status });
          return next;
        });
        startTransition(() => router.refresh());
      }
    } finally { setBusyKey(null); }
  }

  const grouped: Record<1 | 2 | 3, Item[]> = { 1: [], 2: [], 3: [] };
  for (const item of local.values()) grouped[item.directory.priority].push(item);

  const totals = countByStatus(Array.from(local.values()));

  return (
    <Card>
      <CardHeader
        title="Citations"
        subtitle="Local-business directories. Tier 1 = critical; tier 3 = long tail."
        action={<div className="flex gap-2">
          <Badge tone="ok">{totals.complete} complete</Badge>
          <Badge tone="warn">{totals.partial} partial</Badge>
          <Badge tone="err">{totals.missing} missing</Badge>
        </div>}
      />
      <div className="p-5 space-y-5">
        {[1 as const, 2 as const, 3 as const].map((tier) => (
          <div key={tier}>
            <SectionLabel className="mb-2">{tier === 1 ? 'Critical' : tier === 2 ? 'Strong' : 'Long tail'}</SectionLabel>
            <ul className="space-y-1.5">
              {grouped[tier].map((item) => (
                <li key={item.directory.key} className="flex items-center gap-3 px-3 py-2 rounded-md border border-border bg-bg/40">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-fg font-medium truncate">
                      <a href={item.directory.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent">{item.directory.name}</a>
                    </div>
                    {item.directory.notes && <div className="text-[11px] text-muted truncate">{item.directory.notes}</div>}
                  </div>
                  <Input
                    placeholder="Listing URL"
                    value={item.url ?? ''}
                    onChange={(e) => setLocal((prev) => { const next = new Map(prev); next.set(item.directory.key, { ...item, url: e.target.value }); return next; })}
                    onBlur={(e) => { if ((item.url ?? '') !== e.target.value) patch(item.directory.key, { url: e.target.value || null }); }}
                    className="h-7 text-xs w-48 flex-none"
                  />
                  <Select
                    value={item.status}
                    onChange={(e) => patch(item.directory.key, { status: e.target.value as Status })}
                    className="h-7 py-0 text-xs w-32 flex-none"
                  >
                    <option value="missing">Missing</option>
                    <option value="partial">Partial</option>
                    <option value="complete">Complete</option>
                    <option value="na">N/A</option>
                  </Select>
                  {busyKey === item.directory.key && <Spinner size={12} />}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="text-xs text-muted">{pending ? 'Saving…' : ''}</div>
      </div>
    </Card>
  );
}

function countByStatus(items: Item[]): Record<Status, number> {
  const out: Record<Status, number> = { missing: 0, partial: 0, complete: 0, na: 0 };
  for (const i of items) out[i.status] = (out[i.status] ?? 0) + 1;
  return out;
}
