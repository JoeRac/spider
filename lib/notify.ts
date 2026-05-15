/**
 * Send an admin alert to Silverback. Awaited so Vercel's serverless
 * platform doesn't kill the lambda before the HTTP request lands.
 * Failures are logged but never re-thrown.
 *
 * Quiet no-op when SILVERBACK_* envs aren't set.
 */
import 'server-only';

export type Severity = 'critical' | 'warn' | 'info';

export type NotifyInput = {
  severity: Severity;
  title: string;
  body?: string;
  tags?: string[];
  deepLink?: string;
  idempotencyKey: string;
};

const APP_NAME = 'spider';
const TIMEOUT_MS = 5_000;

export async function notify(input: NotifyInput): Promise<void> {
  const baseUrl = process.env.SILVERBACK_BASE_URL;
  const apiKey = process.env.SILVERBACK_API_KEY;
  if (!baseUrl || !apiKey) return;

  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/notify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        'x-integration-app': APP_NAME,
        'x-integration-timestamp': String(Date.now()),
      },
      body: JSON.stringify({
        severity: input.severity,
        title: input.title,
        body: input.body ?? null,
        tags: input.tags ?? [],
        source_app: APP_NAME,
        deep_link: input.deepLink ?? null,
        idempotency_key: input.idempotencyKey,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[notify] Silverback returned ${res.status}: ${await res.text().catch(() => '')}`);
    }
  } catch (err) {
    console.warn('[notify] dispatch failed:', err instanceof Error ? err.message : String(err));
  }
}
