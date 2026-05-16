'use client';
/**
 * Autopilot policy editor for a single client. Lives on the Overview
 * tab so the operator can see "what does Spider do for this client when
 * I'm not looking?" without leaving the workspace.
 *
 * Honest UI rule: when the operator hasn't set a cadence, the cron
 * silently applies an agency default (defined in lib/content/autopilot).
 * The card surfaces that explicitly (a "default cadence applied" chip)
 * and shows the *effective* weekly total — what Spider will actually
 * post per week — in both modes so the operator never has to do mental
 * arithmetic.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, Button, Spinner, Segmented, FieldGroup, Input, SectionLabel, Badge, Dot } from '@/components/ui';
import { Save, Plug, Zap, ZapOff, Sparkles } from 'lucide-react';
import {
  effectiveCadence,
  isUsingDefaultCadence,
  type AutopilotPolicy,
  type AutopilotMode,
} from '@/lib/content/autopilot';
import type { Channel } from '@/lib/db/schema';

type ChannelRow = { channel: string; label: string; status: string };

export function AutopilotCard({
  clientId,
  clientStatus,
  initial,
  channels,
}: {
  clientId: string;
  clientStatus: string;
  initial: AutopilotPolicy;
  channels: ChannelRow[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<AutopilotMode>(initial.mode);
  const [cadence, setCadence] = useState<Record<string, number>>(initial.cadence);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const liveChannels = channels.filter((c) => c.status === 'connected');

  // Mirror the cron's resolution so the operator sees exactly what
  // Spider will do per week — not just what they've "configured."
  const liveChannelKeys = useMemo(
    () => liveChannels.map((c) => c.channel as Channel),
    [liveChannels],
  );
  const persistedShape = useMemo(() => {
    // The same filtering save() does — only positive, live-channel entries
    // are persisted. Compute it now so the chip + summary react live as
    // the operator edits.
    const out: Record<string, number> = {};
    for (const c of liveChannels) {
      const v = cadence[c.channel];
      if (typeof v === 'number' && v > 0) out[c.channel] = v;
    }
    return out;
  }, [cadence, liveChannels]);
  const usingDefault = useMemo(
    () => isUsingDefaultCadence(persistedShape),
    [persistedShape],
  );
  const effective = useMemo(
    () => effectiveCadence(persistedShape, liveChannelKeys),
    [persistedShape, liveChannelKeys],
  );
  const weeklyTotal = useMemo(
    () => Object.values(effective).reduce((sum, n) => sum + (n ?? 0), 0),
    [effective],
  );

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/autopilot`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode, cadence: persistedShape }),
      });
      const json = await res.json();
      if (!res.ok) { setMessage(json?.error ?? `Failed (${res.status})`); return; }
      setMessage('Policy saved.');
      router.refresh();
    } finally { setBusy(false); }
  }

  const modeBadge = (() => {
    if (clientStatus === 'archived') return { tone: 'neutral' as const, label: 'archived — autopilot off' };
    if (clientStatus === 'paused')   return { tone: 'warn' as const,    label: 'client paused — autopilot off' };
    if (mode === 'paused')           return { tone: 'warn' as const,    label: 'autopilot paused' };
    if (clientStatus !== 'active')   return { tone: 'info' as const,    label: 'inactive — onboarding' };
    if (mode === 'full')             return { tone: 'ok' as const,      label: 'full autopilot' };
    return                                { tone: 'info' as const,    label: 'review-then-publish' };
  })();

  return (
    <Card>
      <CardHeader
        title="Autopilot"
        subtitle="How aggressive should Spider be for this client when you're not looking?"
        action={<>
          <Badge tone={modeBadge.tone}><Dot tone={modeBadge.tone} />{modeBadge.label}</Badge>
          <Button size="sm" variant="primary" onClick={save} disabled={busy}>{busy ? <Spinner size={12} /> : <Save size={12} />}Save</Button>
        </>}
      />
      <div className="p-5 space-y-5">
        <FieldGroup label="Mode" hint="Pause to stop generation + publish for this client without archiving them.">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'full' as AutopilotMode,   label: 'Full',    icon: () => <Zap size={12} /> },
              { value: 'review' as AutopilotMode, label: 'Review',  icon: () => <Plug size={12} /> },
              { value: 'paused' as AutopilotMode, label: 'Paused',  icon: () => <ZapOff size={12} /> },
            ]}
            fullWidth
          />
        </FieldGroup>
        <div className="text-xs text-muted leading-relaxed border-l-2 border-border pl-3">
          {mode === 'full'   && 'Spider generates daily and the publish cron ships content the moment its schedule arrives. The operator can still edit, but doesn\'t need to gate every batch.'}
          {mode === 'review' && 'Spider generates daily, but every draft sits in the library until you promote it to scheduled. Safe default.'}
          {mode === 'paused' && 'Spider stops generating and publishing for this client. Existing scheduled items will not fire while paused.'}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <SectionLabel>Per-channel cadence</SectionLabel>
            {usingDefault && liveChannels.length > 0 && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent-soft text-accent ring-1 ring-inset ring-accent/20"
                title="No cadence set — Spider is applying its agency default (about 1/week on GMB, blog, and Facebook where they're connected)."
              >
                <Sparkles size={10} />
                default cadence applied
              </span>
            )}
          </div>
          {liveChannels.length === 0 ? (
            <div className="text-xs text-muted">Connect channels first; cadence applies once a channel is live.</div>
          ) : (
            <div className="space-y-2">
              {liveChannels.map((c) => {
                const defaultTarget = usingDefault ? (effective[c.channel] ?? 0) : 0;
                return (
                  <div key={c.channel} className="flex items-center gap-3">
                    <div className="flex-1 text-sm text-fg">
                      {c.label}
                      {usingDefault && defaultTarget > 0 && (
                        <span className="ml-2 text-[10px] text-faint">default: {defaultTarget}/wk</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={50}
                        value={cadence[c.channel] ?? ''}
                        onChange={(e) => {
                          const v = e.target.value === '' ? 0 : Number(e.target.value);
                          setCadence((prev) => ({ ...prev, [c.channel]: v }));
                        }}
                        placeholder={defaultTarget > 0 ? String(defaultTarget) : '0'}
                        className="h-7 py-0 text-xs w-16 text-right tabular-nums"
                      />
                      <span className="text-xs text-muted w-16">posts/week</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {liveChannels.length > 0 && (
            <div className="mt-3 flex items-center justify-between text-[11px] text-muted bg-bg/40 border border-border rounded px-3 py-2">
              <span>
                {weeklyTotal === 0
                  ? <>No channels are scheduled. Spider won&apos;t auto-generate for this client until you set at least one.</>
                  : usingDefault
                    ? <>Spider will post about <span className="text-fg font-medium tabular-nums">{weeklyTotal}/week</span> total (default cadence). Set any value above to override.</>
                    : <>Spider will post about <span className="text-fg font-medium tabular-nums">{weeklyTotal}/week</span> total. 0 = skip that channel.</>}
              </span>
            </div>
          )}
          <div className="text-[11px] text-muted mt-3">
            Cadence is captured now and used by the daily-generation cron to pick which channel needs fresh content. 0 = don&apos;t auto-generate for that channel.
          </div>
        </div>

        {message && <div className="text-xs text-muted">{message}</div>}
      </div>
    </Card>
  );
}
