'use client';
/**
 * Sitemap monitor card — shows the latest snapshot for this client and a
 * "Refresh" button. Drops into the SEO operations column.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, Button, Spinner, Badge } from '@/components/ui';
import { RefreshCw, ChevronRight, AlertTriangle } from 'lucide-react';

type Snapshot = {
  id: string;
  url: string;
  urlCount: number;
  lastmodAt: string | null;
  status: string;
  error: string | null;
  fetchedAt: string;
};

export function SitemapCard({
  clientId,
  initialSnapshots,
}: {
  clientId: string;
  initialSnapshots: Snapshot[];
}) {
  const router = useRouter();
  const [snaps, setSnaps] = useState<Snapshot[]>(initialSnapshots);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/sitemap`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) { setMessage(json?.error ?? `Failed (${res.status})`); return; }
      setSnaps([{
        id: json.data.id,
        url: json.data.url,
        urlCount: json.data.urlCount,
        lastmodAt: json.data.lastmodAt ? new Date(json.data.lastmodAt).toISOString() : null,
        status: json.data.status,
        error: json.data.error,
        fetchedAt: new Date(json.data.fetchedAt).toISOString(),
      }, ...snaps].slice(0, 20));
      router.refresh();
    } finally { setBusy(false); }
  }

  const latest = snaps[0];
  const earlier = snaps.slice(1, 5);

  return (
    <Card>
      <CardHeader
        title="Sitemap"
        subtitle="Sitemap.xml snapshots. Refreshed daily by /api/cron/sitemap-refresh."
        action={<Button size="sm" variant="outline" onClick={refresh} disabled={busy}>
          {busy ? <Spinner size={12} /> : <RefreshCw size={12} />}
          Refresh
        </Button>}
      />
      <div className="p-5 space-y-4">
        {!latest ? (
          <div className="text-xs text-muted">No snapshots yet. Hit Refresh to pull the sitemap.</div>
        ) : (
          <>
            <div className="rounded-md border border-border bg-bg/40 px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-medium text-fg truncate">{latest.url}</div>
                <Badge tone={latest.status === 'completed' ? 'ok' : 'err'}>{latest.status}</Badge>
              </div>
              <div className="flex items-center gap-5 mt-2 text-xs">
                <Stat label="URLs"     value={latest.urlCount.toLocaleString()} />
                <Stat label="Newest lastmod" value={latest.lastmodAt ? new Date(latest.lastmodAt).toLocaleString() : '—'} />
                <Stat label="Fetched"  value={new Date(latest.fetchedAt).toLocaleString()} />
              </div>
              {latest.error && (
                <div className="mt-2 text-xs text-err inline-flex items-center gap-1"><AlertTriangle size={12} />{latest.error}</div>
              )}
            </div>

            {earlier.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-faint font-semibold mb-2">History</div>
                <ul className="space-y-1">
                  {earlier.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 text-xs text-muted">
                      <ChevronRight size={10} className="text-faint" />
                      <span className="tabular-nums">{s.urlCount.toLocaleString()} URLs</span>
                      <span className="text-faint">·</span>
                      <span>{new Date(s.fetchedAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        {message && <div className="text-xs text-muted">{message}</div>}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div className="text-fg font-medium mt-0.5">{value}</div>
    </div>
  );
}
