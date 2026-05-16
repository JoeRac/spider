'use client';
/**
 * "Run autopilot now" button — fires the same per-client tick the daily
 * cron uses, surfaced from the AutopilotPreviewStrip.
 *
 * Disabled when the preview says nothing would happen (paused / no
 * channels / cadence already met) so the operator can't waste an LLM
 * call against the same gates the server is about to apply.
 *
 * On success, we refresh the page so the ActivityTimeline + the strip
 * itself re-render with the new draft.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Spinner } from '@/components/ui';
import { Play } from 'lucide-react';

type TickResult =
  | { clientId: string; status: 'not-found' }
  | { clientId: string; status: 'skipped'; reason: string; items?: number }
  | { clientId: string; status: 'completed'; runId: string; channel: string; items: number }
  | { clientId: string; status: 'failed'; reason: string };

export function AutopilotRunButton({
  clientId,
  enabled,
  hint,
}: {
  clientId: string;
  enabled: boolean;
  hint?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'ok' | 'warn' | 'err' | 'muted'>('muted');

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/autopilot/run`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json?.error ?? `Failed (${res.status})`);
        setTone('err');
        return;
      }
      const result: TickResult = json.data;
      if (result.status === 'completed') {
        setMessage(`Drafted ${result.items} item${result.items === 1 ? '' : 's'} on ${shortLabel(result.channel)}`);
        setTone('ok');
      } else if (result.status === 'skipped') {
        setMessage(`Skipped — ${result.reason}`);
        setTone('warn');
      } else if (result.status === 'failed') {
        setMessage(`Failed — ${result.reason}`);
        setTone('err');
      } else {
        setMessage('Client not found');
        setTone('err');
      }
      startTransition(() => router.refresh());
    } finally { setBusy(false); }
  }

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span className={
          tone === 'ok'   ? 'text-xs text-ok'   :
          tone === 'warn' ? 'text-xs text-warn' :
          tone === 'err'  ? 'text-xs text-err'  :
                            'text-xs text-muted'
        }>{message}</span>
      )}
      <Button
        size="sm"
        variant={enabled ? 'primary' : 'ghost'}
        onClick={run}
        disabled={!enabled || busy || pending}
        title={hint}
      >
        {busy || pending ? <Spinner size={12} /> : <Play size={12} />}
        Run now
      </Button>
    </div>
  );
}

function shortLabel(channel: string): string {
  switch (channel) {
    case 'google_my_business': return 'GMB';
    case 'facebook':           return 'Facebook';
    case 'twitter':            return 'Twitter';
    case 'instagram':          return 'Instagram';
    case 'linkedin':           return 'LinkedIn';
    case 'youtube':            return 'YouTube';
    case 'tiktok':             return 'TikTok';
    case 'website_blog':       return 'Blog';
    default:                   return channel;
  }
}
