'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardHeader, FieldGroup, Input, Textarea, Spinner, Segmented } from '@/components/ui';
import { Trash2, Save, CalendarClock, Archive } from 'lucide-react';

type Item = {
  id: string;
  title: string | null;
  body: string;
  status: string;
  scheduledFor: string | null;
};

export function ContentEditor({ item }: { item: Item }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(item.title ?? '');
  const [body, setBody] = useState(item.body);
  const [status, setStatus] = useState<'draft' | 'scheduled' | 'published' | 'failed' | 'archived'>(item.status as never);
  const [scheduledFor, setScheduledFor] = useState(item.scheduledFor ? toLocalInput(item.scheduledFor) : '');
  const [busy, setBusy] = useState<null | 'save' | 'schedule' | 'archive' | 'delete'>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function save(extra: Partial<{ status: string; scheduledFor: string | null }> = {}, kind: 'save' | 'schedule' | 'archive' = 'save') {
    setBusy(kind);
    setMessage(null);
    try {
      const res = await fetch(`/api/content/${item.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: title || null,
          body,
          status: extra.status ?? status,
          scheduledFor: extra.scheduledFor !== undefined
            ? extra.scheduledFor
            : (scheduledFor ? new Date(scheduledFor).toISOString() : null),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setMessage(json?.error ?? `Failed (${res.status})`); return; }
      setMessage('Saved.');
      startTransition(() => router.refresh());
    } finally { setBusy(null); }
  }

  async function destroy() {
    if (!confirm('Delete this content item permanently?')) return;
    setBusy('delete');
    try {
      const res = await fetch(`/api/content/${item.id}`, { method: 'DELETE' });
      if (res.ok) router.push('/content');
      else setMessage('Delete failed.');
    } finally { setBusy(null); }
  }

  return (
    <Card>
      <CardHeader
        title="Edit"
        action={<>
          <Button size="sm" variant="ghost" onClick={destroy} disabled={!!busy}>
            {busy === 'delete' ? <Spinner size={12} /> : <Trash2 size={12} />}
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => save({ status: 'archived' }, 'archive')} disabled={!!busy}>
            {busy === 'archive' ? <Spinner size={12} /> : <Archive size={12} />}
            Archive
          </Button>
          <Button size="sm" variant="primary" onClick={() => save()} disabled={!!busy}>
            {busy === 'save' ? <Spinner size={12} /> : <Save size={12} />}
            Save
          </Button>
        </>}
      />
      <div className="p-5 space-y-4">
        <FieldGroup label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional title" />
        </FieldGroup>

        <FieldGroup label="Body">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            className="font-mono text-[13px]"
          />
        </FieldGroup>

        <div className="border-t border-border pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <FieldGroup label="Status">
            <Segmented
              value={status}
              onChange={setStatus}
              options={[
                { value: 'draft',     label: 'Draft' },
                { value: 'scheduled', label: 'Scheduled' },
                { value: 'published', label: 'Published' },
                { value: 'archived',  label: 'Archived' },
              ]}
              fullWidth
            />
          </FieldGroup>
          <FieldGroup label="Schedule for" hint="Phase 4 publish cron picks up scheduled items">
            <Input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
            />
          </FieldGroup>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted">{message ?? ''}</div>
          <Button size="sm" variant="outline" onClick={() => save({ status: 'scheduled' }, 'schedule')} disabled={!!busy || !scheduledFor}>
            {busy === 'schedule' ? <Spinner size={12} /> : <CalendarClock size={12} />}
            Save + schedule
          </Button>
        </div>
      </div>
    </Card>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
