'use client';
/**
 * Media panel — sits under the editor. Two actions:
 *   - Upload an image (multipart → /api/media/upload)
 *   - Generate one with Z.AI (prompt → /api/media/generate)
 *
 * Lists the URLs currently attached to the content item with a remove
 * button each. Instagram + image-aware publishers pull from this list.
 */
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, Button, FieldGroup, Textarea, Spinner } from '@/components/ui';
import { Upload, Sparkles, Trash2, Image as ImageIcon } from 'lucide-react';

export function MediaPanel({
  itemId, clientId, urls,
}: {
  itemId: string;
  clientId: string;
  urls: string[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState<null | 'upload' | 'generate' | 'remove'>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy('upload');
    setMessage(null);
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('clientId', clientId);
      fd.set('contentItemId', itemId);
      const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) { setMessage(json?.error ?? `Upload failed (${res.status})`); return; }
      setMessage('Uploaded.');
      router.refresh();
    } finally { setBusy(null); }
  }

  async function generate() {
    if (!prompt.trim()) { setMessage('Add a prompt for the image first.'); return; }
    setBusy('generate');
    setMessage(null);
    try {
      const res = await fetch('/api/media/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId, contentItemId: itemId, prompt }),
      });
      const json = await res.json();
      if (!res.ok) { setMessage(json?.error ?? `Generation failed (${res.status})`); return; }
      setMessage('Image generated.');
      setPrompt('');
      router.refresh();
    } finally { setBusy(null); }
  }

  async function remove(url: string) {
    setBusy('remove');
    setMessage(null);
    try {
      const res = await fetch(`/api/content/${itemId}/media?url=${encodeURIComponent(url)}`, { method: 'DELETE' });
      if (!res.ok) { setMessage(`Remove failed (${res.status})`); return; }
      router.refresh();
    } finally { setBusy(null); }
  }

  return (
    <Card>
      <CardHeader title="Media" subtitle="Attached images for this content item. Instagram + image-aware publishers pull from this list." />
      <div className="p-5 space-y-4">
        {urls.length === 0 ? (
          <div className="text-xs text-muted flex items-center gap-2"><ImageIcon size={14} className="text-faint" />No images attached yet.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {urls.map((u) => (
              <div key={u} className="relative group border border-border rounded-md overflow-hidden bg-bg/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="attached" className="w-full h-32 object-cover" />
                <button
                  type="button"
                  onClick={() => remove(u)}
                  disabled={!!busy}
                  className="absolute top-1.5 right-1.5 inline-flex items-center justify-center h-6 w-6 rounded bg-fg/70 text-panel opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-border pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }}
            />
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={!!busy}>
              {busy === 'upload' ? <Spinner size={12} /> : <Upload size={12} />}
              Upload image
            </Button>
          </div>
          <FieldGroup label="Generate with AI" hint="Z.AI CogView. Prompt should describe the visual exactly.">
            <Textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="A sunlit dealership lot with three trucks lined up, golden hour, photorealistic." />
          </FieldGroup>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="primary" onClick={generate} disabled={!!busy}>
              {busy === 'generate' ? <Spinner size={12} /> : <Sparkles size={12} />}
              Generate
            </Button>
            {message && <span className="text-xs text-muted">{message}</span>}
          </div>
        </div>
      </div>
    </Card>
  );
}
