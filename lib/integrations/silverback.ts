/**
 * Silverback emit — durable, never-loses-events.
 *
 * Mirrors the pattern used in Badger/Raven/Meerkat/Ibex. Each call site
 * does ONE local INSERT into silverback_outbox; the cron at
 * /api/cron/silverback-drain replays pending rows to Silverback's
 * /api/events with exponential backoff. Silverback dedupes on
 * (source_app, idempotency_key) so retries are safe.
 *
 * Spider keys events on the canonical `lead_id` (= badger.companies.id)
 * — every Spider client is bound by schema design (NOT NULL), so we
 * always have one. Other apps fall back to alt_keys; here we don't
 * need to.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { silverbackOutbox, clients } from '../db/schema';

export type SilverbackEvent = {
  lead_id?: string | null;
  spider_client_id?: string | null;
  hint_phone?: string | null;
  alt_keys?: Record<string, string>;
  event_type: string;
  summary?: string | null;
  payload?: Record<string, unknown>;
  deep_link?: string | null;
  actor?: string | null;
  occurred_at?: Date;
  idempotency_key: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Synchronously enqueue an event. One local INSERT (~20ms). */
export async function silverbackEnqueue(event: SilverbackEvent): Promise<void> {
  const altKeys: Record<string, string> = { ...(event.alt_keys ?? {}) };
  if (event.spider_client_id && !altKeys.spider_client) altKeys.spider_client = event.spider_client_id;

  let leadId = event.lead_id ?? null;
  if (!leadId && typeof altKeys.badger_company === 'string' && UUID_RE.test(altKeys.badger_company)) {
    leadId = altKeys.badger_company;
  }

  const body = {
    lead_id: leadId,
    hint_phone: event.hint_phone ?? null,
    alt_keys: altKeys,
    source_app: 'spider',
    event_type: event.event_type,
    summary: event.summary ?? null,
    payload: event.payload ?? {},
    deep_link: event.deep_link ?? null,
    actor: event.actor ?? 'system',
    occurred_at: (event.occurred_at ?? new Date()).toISOString(),
    idempotency_key: event.idempotency_key,
  };
  try {
    await db.insert(silverbackOutbox).values({
      event: body,
      idempotencyKey: event.idempotency_key,
    }).onConflictDoNothing({ target: silverbackOutbox.idempotencyKey });
  } catch (err) {
    console.warn('[silverback] outbox insert failed:', err instanceof Error ? err.message : String(err));
  }
}

/**
 * Convenience wrapper: look up the Spider client to pull the canonical
 * lead_id + phone, then enqueue.
 */
export async function silverbackEnqueueForClient(
  clientId: string,
  event: Omit<SilverbackEvent, 'lead_id' | 'spider_client_id' | 'hint_phone' | 'alt_keys'> & {
    alt_keys?: Record<string, string>;
  },
): Promise<void> {
  const [client] = await db.select({
    id: clients.id,
    name: clients.name,
    phone: clients.phone,
    leadId: clients.leadId,
  }).from(clients).where(eq(clients.id, clientId)).limit(1);

  const altKeys: Record<string, string> = { ...(event.alt_keys ?? {}), spider_client: clientId };

  await silverbackEnqueue({
    lead_id: client?.leadId ?? null,
    spider_client_id: clientId,
    hint_phone: client?.phone ?? null,
    alt_keys: altKeys,
    ...event,
  });
}

export function spiderClientDeepLink(clientId: string): string {
  const base = (process.env.NEXT_PUBLIC_SPIDER_BASE_URL ?? 'https://spider-ruddy.vercel.app').replace(/\/+$/, '');
  return `${base}/clients/${clientId}`;
}

export function spiderContentDeepLink(contentId: string): string {
  const base = (process.env.NEXT_PUBLIC_SPIDER_BASE_URL ?? 'https://spider-ruddy.vercel.app').replace(/\/+$/, '');
  return `${base}/content/${contentId}`;
}
