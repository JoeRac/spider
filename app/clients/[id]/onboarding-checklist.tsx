'use client';
/**
 * Onboarding checklist — appears on the Overview tab when the client is
 * still in `onboarding` status. Lists the 4 things an operator should
 * complete before flipping the client to `active`, with a one-click
 * status promotion at the bottom.
 *
 * Each step links to the relevant tab/section instead of expanding
 * inline — we want the operator inside the right context to fill the
 * field, not bouncing through nested forms.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, Button, Spinner } from '@/components/ui';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';

export type OnboardingStep = {
  key: 'channels' | 'voice' | 'seo' | 'activate';
  label: string;
  detail: string;
  done: boolean;
  href: string;
};

export function OnboardingChecklist({
  clientId,
  steps,
  status,
}: {
  clientId: string;
  steps: OnboardingStep[];
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const allDone = steps.every((s) => s.done);

  async function activate() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setMessage(json?.error ?? `Failed (${res.status})`);
        return;
      }
      setMessage('Activated.');
      startTransition(() => router.refresh());
    } finally { setBusy(false); }
  }

  return (
    <Card className="border-info/30 bg-info-soft/30">
      <CardHeader
        title="Onboarding"
        subtitle="Finish these to flip this client to active and let autopilot start."
      />
      <ul className="divide-y divide-border">
        {steps.map((s) => (
          <li key={s.key} className="px-5 py-3 flex items-center gap-3">
            {s.done
              ? <CheckCircle2 size={16} className="text-ok flex-none" />
              : <Circle size={16} className="text-faint flex-none" />}
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-medium ${s.done ? 'text-muted line-through' : 'text-fg'}`}>{s.label}</div>
              <div className="text-xs text-muted truncate">{s.detail}</div>
            </div>
            {!s.done && (
              <Link
                href={s.href}
                className="text-xs text-accent hover:text-accent-strong inline-flex items-center gap-1"
              >
                Fix <ArrowRight size={12} />
              </Link>
            )}
          </li>
        ))}
      </ul>
      <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-3">
        <div className="text-xs text-muted">{message ?? (allDone ? 'Everything\'s ready — activate to enable cron + autopilot.' : `${steps.filter((s) => s.done).length} of ${steps.length} complete`)}</div>
        <Button
          variant="primary"
          size="sm"
          onClick={activate}
          disabled={busy || pending || !allDone || status === 'active'}
        >
          {busy ? <Spinner size={12} /> : null}
          {status === 'active' ? 'Already active' : 'Mark active'}
        </Button>
      </div>
    </Card>
  );
}
