'use client';
/**
 * Composer — the single editing surface for a content item.
 *
 * After the strategic pass that collapsed the three legacy cards
 * (editor / media / schedule) into one, every per-channel decision
 * lives on a single row: body variant, media slot, publish toggle,
 * fan-out status. Top metadata bar keeps title/status/schedule/campaign
 * visible at all times.
 *
 * Save semantics:
 *   - Save                  → PATCH item (title, body, status, scheduledFor,
 *                              variants, campaign). Doesn't change targets.
 *   - Approve & schedule    → PATCH + POST /schedule with the selected
 *                              channels. Item becomes 'scheduled'; the
 *                              publish cron picks it up next pass.
 *   - Publish now           → PATCH + POST /publish-now with selected
 *                              channels. Inline dispatch runs immediately.
 *
 * The per-channel "Include" toggle is the load-bearing UI primitive
 * — it directly controls whether a content_target row exists for
 * that channel on save. Drafts that exist with no variants stored
 * still publish from the canonical fallback.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { Card, CardHeader, Button, Input, Textarea, Segmented, Spinner, Badge } from '@/components/ui';
import { Save, Trash2, ChevronDown, ChevronUp, Sparkles, Upload, Image as ImageIcon, Send, Check, ExternalLink } from 'lucide-react';

type Status = 'draft' | 'scheduled' | 'published' | 'failed' | 'archived';

export type ComposerChannel = {
  channel: string;
  label: string;
  status: 'connected' | 'disconnected' | 'error' | 'expired' | string;
  /** Existing target for this channel, if any. */
  target?: {
    id: string;
    status: 'pending' | 'publishing' | 'published' | 'failed' | 'skipped' | string;
    externalUrl: string | null;
    lastError: string | null;
    publishedAt: string | null;
  } | null;
};

export type ComposerItem = {
  id: string;
  clientId: string;
  title: string | null;
  body: string;
  kind: string;
  status: Status;
  scheduledFor: string | null;
  variants: Record<string, string>;
  campaign: string | null;
  mediaUrls: string[];
};

const CHANNEL_LIMITS: Record<string, number | undefined> = {
  twitter: 280,
  facebook: 63206,
  linkedin: 3000,
  instagram: 2200,
  google_my_business: 1500,
  tiktok: 2200,
  youtube: 5000,
  website_blog: undefined,
};

export function Composer({
  item, channels,
}: {
  item: ComposerItem;
  channels: ComposerChannel[];
}) {
  const router = useRouter();

  /* ─── Header bar state ─── */
  const [title, setTitle] = useState(item.title ?? '');
  const [status, setStatus] = useState<Status>(item.status);
  const [scheduledFor, setScheduledFor] = useState(item.scheduledFor ? toLocalInput(item.scheduledFor) : '');
  const [campaign, setCampaign] = useState(item.campaign ?? '');

  /* ─── Body + variant state ─── */
  const [canonical, setCanonical] = useState(item.body);
  const [variants, setVariants] = useState<Record<string, string>>(item.variants ?? {});
  const [canonicalOpen, setCanonicalOpen] = useState(Object.keys(item.variants).length === 0);

  /* ─── Per-channel publish-include set ─── */
  // Default: channels that already have a target are checked.
  const [includeChannels, setIncludeChannels] = useState<Set<string>>(
    () => new Set(channels.filter((c) => c.target).map((c) => c.channel)),
  );

  /* ─── Media state ─── */
  const [mediaUrls, setMediaUrls] = useState<string[]>(item.mediaUrls ?? []);
  const [mediaPrompt, setMediaPrompt] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  /* ─── Save state ─── */
  const [busy, setBusy] = useState<null | 'save' | 'approve' | 'publish-now' | 'archive' | 'delete' | 'upload' | 'gen-image' | 'remove-media'>(null);
  const [message, setMessage] = useState<string | null>(null);
  const dirty = useRef(false);

  useEffect(() => { dirty.current = true; }, [title, status, scheduledFor, canonical, variants, campaign, includeChannels, mediaUrls]);

  /* ─── Save primitives ─── */

  async function patchItem(extra: Partial<{ status: Status }> = {}): Promise<boolean> {
    const res = await fetch(`/api/content/${item.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: title || null,
        body: canonical,
        status: extra.status ?? status,
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
        metadataPatch: { variants, campaign: campaign.trim() || null },
      }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setMessage(json?.error ?? `Save failed (${res.status})`);
      return false;
    }
    return true;
  }

  async function scheduleTargets(): Promise<boolean> {
    const list = Array.from(includeChannels);
    if (list.length === 0) return true; // nothing to schedule
    const res = await fetch(`/api/content/${item.id}/schedule`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
        channels: list,
      }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setMessage(json?.error ?? `Schedule failed (${res.status})`);
      return false;
    }
    return true;
  }

  async function publishNowTargets(): Promise<boolean> {
    const list = Array.from(includeChannels);
    if (list.length === 0) {
      setMessage('Pick at least one channel before publishing now.');
      return false;
    }
    const res = await fetch(`/api/content/${item.id}/publish-now`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channels: list }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setMessage(json?.error ?? `Publish failed (${res.status})`);
      return false;
    }
    const json = await res.json().catch(() => null);
    setMessage(`Triggered publish. ${json?.data?.published ?? 0} succeeded, ${json?.data?.failed ?? 0} failed.`);
    return true;
  }

  async function save() {
    setBusy('save'); setMessage(null);
    try {
      if (await patchItem()) { setMessage('Saved.'); dirty.current = false; router.refresh(); }
    } finally { setBusy(null); }
  }

  async function approveAndSchedule() {
    setBusy('approve'); setMessage(null);
    try {
      if (!(await patchItem({ status: 'scheduled' }))) return;
      if (!(await scheduleTargets())) return;
      setStatus('scheduled');
      setMessage(`Approved. Scheduled to ${includeChannels.size} channel${includeChannels.size === 1 ? '' : 's'}.`);
      dirty.current = false;
      router.refresh();
    } finally { setBusy(null); }
  }

  async function publishNow() {
    setBusy('publish-now'); setMessage(null);
    try {
      if (!(await patchItem({ status: 'scheduled' }))) return;
      if (!(await publishNowTargets())) return;
      setStatus('scheduled');
      dirty.current = false;
      router.refresh();
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

  /* ─── Variant helpers ─── */

  function setVariantBody(channel: string, body: string) {
    setVariants((prev) => ({ ...prev, [channel]: body }));
  }
  function clearVariant(channel: string) {
    setVariants((prev) => { const next = { ...prev }; delete next[channel]; return next; });
  }
  function toggleInclude(channel: string, on: boolean) {
    setIncludeChannels((prev) => { const next = new Set(prev); on ? next.add(channel) : next.delete(channel); return next; });
  }

  /* ─── Media handlers ─── */

  async function uploadMedia(file: File) {
    setBusy('upload'); setMessage(null);
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('clientId', item.clientId);
      fd.set('contentItemId', item.id);
      const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) { setMessage(json?.error ?? `Upload failed (${res.status})`); return; }
      setMediaUrls((prev) => [...prev, json.data.url]);
      setMessage('Uploaded.');
      router.refresh();
    } finally { setBusy(null); }
  }
  async function generateImage() {
    if (!mediaPrompt.trim()) { setMessage('Add a prompt first.'); return; }
    setBusy('gen-image'); setMessage(null);
    try {
      const res = await fetch('/api/media/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: item.clientId, contentItemId: item.id, prompt: mediaPrompt }),
      });
      const json = await res.json();
      if (!res.ok) { setMessage(json?.error ?? `Generation failed (${res.status})`); return; }
      setMediaUrls((prev) => [...prev, json.data.url]);
      setMediaPrompt('');
      setMessage('Image generated.');
      router.refresh();
    } finally { setBusy(null); }
  }
  async function removeMedia(url: string) {
    setBusy('remove-media'); setMessage(null);
    try {
      const res = await fetch(`/api/content/${item.id}/media?url=${encodeURIComponent(url)}`, { method: 'DELETE' });
      if (!res.ok) { setMessage(`Remove failed (${res.status})`); return; }
      setMediaUrls((prev) => prev.filter((u) => u !== url));
      router.refresh();
    } finally { setBusy(null); }
  }

  const connectedChannels = channels.filter((c) => c.status === 'connected');
  const dormantChannels = channels.filter((c) => c.status !== 'connected');
  const includeCount = includeChannels.size;

  return (
    <Card>
      <CardHeader
        title="Compose"
        subtitle={`${item.kind} · everything for this item — content, media, publish targets — lives here`}
        action={<>
          <Button size="sm" variant="ghost" onClick={destroy} disabled={!!busy}>
            {busy === 'delete' ? <Spinner size={12} /> : <Trash2 size={12} />}
            Delete
          </Button>
          <Button size="sm" variant="primary" onClick={save} disabled={!!busy}>
            {busy === 'save' ? <Spinner size={12} /> : <Save size={12} />}
            Save
          </Button>
          {status === 'draft' && (
            <Button size="sm" variant="outline" onClick={approveAndSchedule} disabled={!!busy || includeCount === 0}>
              {busy === 'approve' ? <Spinner size={12} /> : <Check size={12} />}
              Approve &amp; schedule
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={publishNow} disabled={!!busy || includeCount === 0}>
            {busy === 'publish-now' ? <Spinner size={12} /> : <Send size={12} />}
            Publish now
          </Button>
        </>}
      />

      {/* Metadata bar */}
      <div className="px-5 py-4 border-b border-border bg-bg/40 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_220px] gap-3 items-end">
          <label className="block">
            <span className="block text-xs font-medium text-fg mb-1.5">Title</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional title" />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-fg mb-1.5">Status</span>
            <Segmented
              value={status}
              onChange={setStatus}
              options={[
                { value: 'draft' as Status,     label: 'Draft' },
                { value: 'scheduled' as Status, label: 'Scheduled' },
                { value: 'published' as Status, label: 'Published' },
              ]}
              fullWidth
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-fg mb-1.5">Schedule</span>
            <Input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
          </label>
        </div>
        <label className="block">
          <span className="block text-xs font-medium text-fg mb-1.5">
            Campaign <span className="text-muted font-normal">— group related content across clients</span>
          </span>
          <Input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="e.g. summer-sale-2026" />
        </label>
        {message && <div className="text-xs text-muted">{message}</div>}
      </div>

      {/* Channels — the publish surface */}
      <div className="px-5 py-4">
        {connectedChannels.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-bg/40 px-4 py-6 text-center text-sm text-muted">
            No channels connected for this client yet.<br />
            <span className="text-xs">Connect channels and per-channel variants + publish toggles will appear here.</span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-accent" />
              <span className="text-sm font-semibold text-fg">Channels</span>
              <span className="text-xs text-muted">— check &ldquo;Include&rdquo; on the channels you want this item to publish to</span>
              <span className="ml-auto text-xs text-muted">{includeCount} of {connectedChannels.length} selected</span>
            </div>
            <div className="space-y-3">
              {connectedChannels.map((c) => (
                <ChannelRow
                  key={c.channel}
                  channel={c}
                  override={variants[c.channel]}
                  canonical={canonical}
                  included={includeChannels.has(c.channel)}
                  onIncludeChange={(on) => toggleInclude(c.channel, on)}
                  onChange={(body) => setVariantBody(c.channel, body)}
                  onReset={() => clearVariant(c.channel)}
                  onActivate={() => setVariantBody(c.channel, canonical)}
                />
              ))}
            </div>
            {dormantChannels.length > 0 && (
              <div className="mt-4 text-xs text-muted">
                {dormantChannels.length} other channel{dormantChannels.length === 1 ? '' : 's'} ({dormantChannels.map((c) => c.label).join(', ')}) {dormantChannels.length === 1 ? 'is' : 'are'} not connected — they won&apos;t publish until reconnected.
              </div>
            )}
          </>
        )}
      </div>

      {/* Media — inline, no longer a separate card */}
      <div className="px-5 py-4 border-t border-border bg-bg/20">
        <div className="flex items-center gap-2 mb-3">
          <ImageIcon size={14} className="text-accent" />
          <span className="text-sm font-semibold text-fg">Media</span>
          <span className="text-xs text-muted">— images attached to this item. Instagram + image-aware channels pull from this list.</span>
        </div>

        {mediaUrls.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            {mediaUrls.map((u) => (
              <div key={u} className="relative group border border-border rounded-md overflow-hidden bg-bg/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="attached" className="w-full h-28 object-cover" />
                <button
                  type="button"
                  onClick={() => removeMedia(u)}
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

        <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3 items-start">
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMedia(f); e.target.value = ''; }}
            />
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={!!busy}>
              {busy === 'upload' ? <Spinner size={12} /> : <Upload size={12} />}
              Upload image
            </Button>
          </div>
          <div className="space-y-2">
            <Textarea
              rows={2}
              value={mediaPrompt}
              onChange={(e) => setMediaPrompt(e.target.value)}
              placeholder="Generate an image with AI — describe the visual exactly."
              className="text-[13px]"
            />
            <Button size="sm" variant="primary" onClick={generateImage} disabled={!!busy}>
              {busy === 'gen-image' ? <Spinner size={12} /> : <Sparkles size={12} />}
              Generate image
            </Button>
          </div>
        </div>
      </div>

      {/* Canonical fallback */}
      <div className="px-5 py-4 border-t border-border bg-bg/30">
        <button
          type="button"
          onClick={() => setCanonicalOpen((x) => !x)}
          className="w-full flex items-center gap-2 text-xs text-fg"
        >
          {canonicalOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <span className="font-semibold">Default body</span>
          <span className="text-muted font-normal">— used when a channel has no override</span>
          <span className="ml-auto"><Badge tone="neutral">{canonical.length} chars</Badge></span>
        </button>
        {canonicalOpen && (
          <div className="mt-3">
            <Textarea
              value={canonical}
              onChange={(e) => setCanonical(e.target.value)}
              rows={6}
              className="font-mono text-[13px]"
            />
            <div className="text-xs text-muted mt-2">
              A variant overrides this on a per-channel basis. If no variant exists for a channel, the publisher sends this body.
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

function ChannelRow({
  channel, override, canonical, included, onIncludeChange, onChange, onReset, onActivate,
}: {
  channel: ComposerChannel;
  override: string | undefined;
  canonical: string;
  included: boolean;
  onIncludeChange: (on: boolean) => void;
  onChange: (body: string) => void;
  onReset: () => void;
  onActivate: () => void;
}) {
  const limit = CHANNEL_LIMITS[channel.channel];
  const hasOverride = typeof override === 'string';
  const effectiveBody = hasOverride ? override : canonical;
  const overLimit = limit != null && effectiveBody.length > limit;
  const target = channel.target;

  return (
    <div className={cn(
      'rounded-md border bg-panel',
      included
        ? (hasOverride ? 'border-accent/40' : 'border-border-strong')
        : 'border-border opacity-80',
    )}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-bg/40">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={included}
            onChange={(e) => onIncludeChange(e.target.checked)}
            className="accent-accent"
            aria-label={`Include ${channel.label}`}
          />
          <span className="text-xs font-semibold text-fg uppercase tracking-wider">{channel.label}</span>
        </label>
        {hasOverride
          ? <Badge tone="accent">override</Badge>
          : <Badge tone="neutral">canonical fallback</Badge>}

        {target && <TargetStatusBadge status={target.status} />}

        <span className="ml-auto text-xs text-muted tabular-nums">
          {effectiveBody.length}{limit ? ` / ${limit}` : ''}
          {overLimit && <span className="text-err ml-1">over limit</span>}
        </span>
      </div>

      {target && (target.externalUrl || target.lastError) && (
        <div className="px-3 py-1.5 border-b border-border bg-bg/20 text-xs flex items-center justify-between gap-2">
          {target.externalUrl ? (
            <a href={target.externalUrl} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-accent inline-flex items-center gap-1">
              {target.externalUrl} <ExternalLink size={10} />
            </a>
          ) : <span />}
          {target.lastError && <span className="text-err truncate ml-auto" title={target.lastError}>{target.lastError}</span>}
        </div>
      )}

      <div className="p-3 space-y-2">
        <Textarea
          rows={4}
          value={effectiveBody}
          onChange={(e) => {
            if (!hasOverride) onActivate();
            onChange(e.target.value);
          }}
          className={cn('font-mono text-[13px]', overLimit && 'border-err')}
        />
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted">
            {included
              ? (hasOverride ? `${channel.label} publishes this exact text.` : 'Falls back to default body. Edit above to override.')
              : `Not included — ${channel.label} won't publish.`}
          </span>
          {hasOverride && (
            <button
              type="button"
              onClick={onReset}
              className="text-muted hover:text-fg transition-colors duration-[120ms]"
            >
              Reset to canonical
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TargetStatusBadge({ status }: { status: string }) {
  const tone =
    status === 'published' ? 'ok' :
    status === 'failed' ? 'err' :
    status === 'publishing' ? 'info' : 'neutral';
  return <Badge tone={tone}>{status}</Badge>;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
