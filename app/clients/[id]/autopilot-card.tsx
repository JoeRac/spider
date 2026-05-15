'use client';
/**
 * Autopilot policy editor for a single client. Lives on the Overview
 * tab so the operator can see "what does Spider do for this client when
 * I'm not looking?" without leaving the workspace.
 *
 * The mode is the load-bearing knob. The per-channel cadence sliders
 * are advisory in phase-1 (the cron honors them best-effort; the data
 * is captured even when not enforced).
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, Button, Spinner, Segmented, FieldGroup, Input, SectionLabel, Badge, Dot } from '@/components/ui';
import { Save, Plug, Zap, ZapOff } from 'lucide-react';
import { type AutopilotPolicy, type AutopilotMode } from '@/lib/content/autopilot';

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

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const cleanCadence: Record<string, number> = {};
      for (const c of liveChannels) {
        const v = cadence[c.channel];
        if (typeof v === 'number' && v > 0) cleanCadence[c.channel] = v;
      }
      const res = await fetch(`/api/clients/${clientId}/autopilot`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode, cadence: cleanCadence }),
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
          <SectionLabel className="mb-2">Per-channel cadence</SectionLabel>
          {liveChannels.length === 0 ? (
            <div className="text-xs text-muted">Connect channels first; cadence applies once a channel is live.</div>
          ) : (
            <div className="space-y-2">
              {liveChannels.map((c) => (
                <div key={c.channel} className="flex items-center gap-3">
                  <div className="flex-1 text-sm text-fg">{c.label}</div>
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
                      placeholder="0"
                      className="h-7 py-0 text-xs w-16 text-right tabular-nums"
                    />
                    <span className="text-xs text-muted w-16">posts/week</span>
                  </div>
                </div>
              ))}
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
