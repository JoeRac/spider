'use client';
/**
 * Composer — the new primary editing surface for a content item.
 *
 * Replaces the legacy split of ContentEditor (canonical-first) + VariantsCard
 * (sub-card). The mental model:
 *
 *   1. **Per-channel variants are what publish.**
 *      Each connected channel gets its own card-as-editor up top. The
 *      operator works channel-first — "what does this say on Twitter?"
 *      not "what's the canonical body?"
 *
 *   2. **Canonical body is the fallback.**
 *      The bottom of the page hosts a single textarea labelled "Default
 *      body — used when no channel override is set." Collapsed by default
 *      to keep the canonical surface visually quieter than the variants.
 *
 *   3. **Metadata stays in a header bar.**
 *      Title, status, schedule, kind — all in one strip at the top so the
 *      "what is this and when does it go out" answer is always visible.
 *
 * Saves:
 *   - Header bar  → PATCH /api/content/[id] (title, status, scheduledFor)
 *   - Variants    → PATCH /api/content/[id] with metadataPatch
 *   - Canonical   → PATCH /api/content/[id] (body)
 *
 * Channel-aware tips (e.g. Twitter's 280-char limit) render inline. When
 * a connected client has no variant for a channel yet, the variant card
 * shows the canonical body as a placeholder + a "Use a different version
 * for [channel]" CTA — clicking activates the per-channel override.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { Card, CardHeader, Button, Input, Textarea, Segmented, Spinner, Badge } from '@/components/ui';
import { Save, Trash2, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

type Status = 'draft' | 'scheduled' | 'published' | 'failed' | 'archived';

type ChannelMeta = {
  channel: string;
  label: string;
  status: 'connected' | 'disconnected' | 'error' | 'expired' | string;
  limit?: number;
};

export type ComposerItem = {
  id: string;
  title: string | null;
  body: string;
  kind: string;
  status: Status;
  scheduledFor: string | null;
  variants: Record<string, string>;
  campaign: string | null;
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
  item,
  channels,
}: {
  item: ComposerItem;
  channels: ChannelMeta[];
}) {
  const router = useRouter();

  /* ───── Header bar state ───── */
  const [title, setTitle] = useState(item.title ?? '');
  const [status, setStatus] = useState<Status>(item.status);
  const [scheduledFor, setScheduledFor] = useState(item.scheduledFor ? toLocalInput(item.scheduledFor) : '');

  /* ───── Body + variant state ───── */
  const [canonical, setCanonical] = useState(item.body);
  const [variants, setVariants] = useState<Record<string, string>>(item.variants ?? {});
  const [canonicalOpen, setCanonicalOpen] = useState(Object.keys(item.variants).length === 0);
  const [campaign, setCampaign] = useState(item.campaign ?? '');

  /* ───── Save state ───── */
  const [busy, setBusy] = useState<null | 'save' | 'archive' | 'delete'>(null);
  const [message, setMessage] = useState<string | null>(null);
  const dirty = useRef(false);

  // Mark dirty when any state changes after first paint.
  useEffect(() => { dirty.current = true; }, [title, status, scheduledFor, canonical, variants, campaign]);

  async function save(extra: Partial<{ status: Status }> = {}, kind: 'save' | 'archive' = 'save') {
    setBusy(kind);
    setMessage(null);
    try {
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
      const json = await res.json();
      if (!res.ok) { setMessage(json?.error ?? `Failed (${res.status})`); return; }
      dirty.current = false;
      setMessage('Saved.');
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

  function setVariantBody(channel: string, body: string) {
    setVariants((prev) => ({ ...prev, [channel]: body }));
  }

  function clearVariant(channel: string) {
    setVariants((prev) => {
      const next = { ...prev };
      delete next[channel];
      return next;
    });
  }

  const variantChannels = channels.filter((c) => c.status === 'connected');
  const dormantChannels = channels.filter((c) => c.status !== 'connected');

  return (
    <Card>
      <CardHeader
        title="Edit"
        subtitle={`${item.kind} · variants per channel publish first; canonical body is the fallback`}
        action={<>
          <Button size="sm" variant="ghost" onClick={destroy} disabled={!!busy}>
            {busy === 'delete' ? <Spinner size={12} /> : <Trash2 size={12} />}
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => save({ status: 'archived' }, 'archive')} disabled={!!busy}>
            {busy === 'archive' ? <Spinner size={12} /> : null}
            Archive
          </Button>
          <Button size="sm" variant="primary" onClick={() => save()} disabled={!!busy}>
            {busy === 'save' ? <Spinner size={12} /> : <Save size={12} />}
            Save
          </Button>
        </>}
      />

      {/* Metadata bar — title, status, schedule */}
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
            <Input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
            />
          </label>
        </div>
        <label className="block">
          <span className="block text-xs font-medium text-fg mb-1.5">Campaign <span className="text-muted font-normal">— group related content across clients</span></span>
          <Input
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            placeholder="e.g. summer-sale-2026"
          />
        </label>
        {message && <div className="text-xs text-muted">{message}</div>}
      </div>

      {/* Per-channel variants — primary surface */}
      <div className="px-5 py-4">
        {variantChannels.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-bg/40 px-4 py-6 text-center text-sm text-muted">
            No channels connected for this client yet.<br />
            <span className="text-xs">Connect channels and per-channel variants will appear here for editing.</span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-accent" />
              <span className="text-sm font-semibold text-fg">Per-channel variants</span>
              <span className="text-xs text-muted">— the body that actually publishes for each channel</span>
            </div>
            <div className="space-y-3">
              {variantChannels.map((c) => (
                <VariantBlock
                  key={c.channel}
                  channel={c}
                  override={variants[c.channel]}
                  canonical={canonical}
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

      {/* Canonical body — fallback */}
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

function VariantBlock({
  channel, override, canonical, onChange, onReset, onActivate,
}: {
  channel: ChannelMeta;
  override: string | undefined;
  canonical: string;
  onChange: (body: string) => void;
  onReset: () => void;
  onActivate: () => void;
}) {
  const limit = CHANNEL_LIMITS[channel.channel];
  const hasOverride = typeof override === 'string';
  const effectiveBody = hasOverride ? override : canonical;
  const overLimit = limit != null && effectiveBody.length > limit;

  return (
    <div className={cn(
      'rounded-md border bg-panel',
      hasOverride ? 'border-accent/40' : 'border-border',
    )}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-bg/40">
        <span className="text-xs font-semibold text-fg uppercase tracking-wider">{channel.label}</span>
        {hasOverride
          ? <Badge tone="accent">override</Badge>
          : <Badge tone="neutral">canonical fallback</Badge>}
        <span className="ml-auto text-xs text-muted tabular-nums">
          {effectiveBody.length}{limit ? ` / ${limit}` : ''}
          {overLimit && <span className="text-err ml-1">over limit</span>}
        </span>
      </div>
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
            {hasOverride
              ? `${channel.label} publishes this exact text.`
              : `Falls back to the default body. Edit above to override.`}
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

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
