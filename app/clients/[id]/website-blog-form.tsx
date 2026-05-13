'use client';
/**
 * The manual configure form for `website_blog`. Lives below the channel
 * matrix on the client-detail page so we don't need a separate route
 * for what is essentially one form.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label, FieldGroup, Segmented, Spinner, Card, CardHeader } from '@/components/ui';

export function WebsiteBlogForm({ clientId, currentMode }: { clientId: string; currentMode: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<'wordpress' | 'webhook'>(currentMode === 'webhook' ? 'webhook' : 'wordpress');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // WordPress
  const [baseUrl, setBaseUrl] = useState('');
  const [username, setUsername] = useState('');
  const [appPassword, setAppPassword] = useState('');

  // Webhook
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const body = mode === 'wordpress'
        ? { clientId, mode, wordpress: { baseUrl, username, applicationPassword: appPassword } }
        : { clientId, mode, webhook: { url: webhookUrl, secret: webhookSecret || undefined } };
      const res = await fetch('/api/integrations/website_blog/configure', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setError(json?.error ?? `Failed (${res.status})`); return; }
      setMessage('Saved. Connection is live.');
      startTransition(() => router.refresh());
    } finally { setBusy(false); }
  }

  return (
    <Card id="configure-website_blog" className="mt-6">
      <CardHeader title="Configure website blog" subtitle="Spider supports WordPress REST API or a generic webhook for any other CMS." />
      <form onSubmit={submit} className="p-5 space-y-4">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'wordpress', label: 'WordPress' },
            { value: 'webhook', label: 'Webhook' },
          ]}
          fullWidth
        />

        {mode === 'wordpress' ? (
          <div className="space-y-3">
            <FieldGroup label="Site URL" hint="e.g. https://dealership.com">
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://dealership.com" />
            </FieldGroup>
            <FieldGroup label="WordPress username">
              <Input value={username} onChange={(e) => setUsername(e.target.value)} />
            </FieldGroup>
            <FieldGroup label="Application password" hint="Generate one under Users → Profile → Application Passwords.">
              <Input type="password" value={appPassword} onChange={(e) => setAppPassword(e.target.value)} />
            </FieldGroup>
          </div>
        ) : (
          <div className="space-y-3">
            <FieldGroup label="Webhook URL" hint="Spider POSTs JSON to this URL on every publish.">
              <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://hooks.example.com/spider" />
            </FieldGroup>
            <FieldGroup label="Shared secret (optional)" hint="Sent as X-Spider-Signature for HMAC verification.">
              <Input type="password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} />
            </FieldGroup>
          </div>
        )}

        {error && <div className="text-xs text-err">{error}</div>}
        {message && <div className="text-xs text-ok">{message}</div>}

        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <Spinner size={12} /> : null}
            Save connection
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Re-export Label for symmetry with form usage above (avoids an unused
 *  warning if we tweak the form later). */
export { Label };
