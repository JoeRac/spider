'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Spinner } from '@/components/ui';
import { Download } from 'lucide-react';

export function ImportFromBadgerButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function importNow() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/clients/import-badger', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        setMessage(body?.error ?? 'Import failed');
        setBusy(false);
        return;
      }
      const { imported, updated, total } = body.data ?? {};
      setMessage(`Imported ${imported} new, refreshed ${updated} (of ${total} from Badger)`);
      startTransition(() => router.refresh());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  const loading = busy || pending;

  return (
    <div className="flex items-center gap-3">
      {message && <span className="text-xs text-muted">{message}</span>}
      <Button variant="primary" onClick={importNow} disabled={loading}>
        {loading ? <Spinner size={14} /> : <Download size={14} />}
        Import from Badger
      </Button>
    </div>
  );
}
