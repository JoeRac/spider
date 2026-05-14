/**
 * Publisher dispatch layer — turns a `content_targets` row into a real
 * publish call against the right channel, including just-in-time token
 * refresh.
 *
 * Loop:
 *   1. Pull due `content_targets` (status='pending', scheduled_for <= now).
 *   2. For each, load the integration + decrypt creds.
 *   3. If the access_token's expires_at is past, refresh via the adapter.
 *   4. Call the publisher.
 *   5. Update the target row with externalId/url or lastError.
 *   6. Cap retries; failed-too-many becomes status='failed'.
 *
 * Designed to run from the cron worker (`/api/cron/publish`) every 5
 * minutes and to be safely re-entrant — the per-target status flip
 * acts as a soft lock.
 */
import { db } from '@/lib/db';
import { contentItems, contentTargets, integrations, type Channel } from '@/lib/db/schema';
import { eq, and, lte, isNull, or, lt, ne } from 'drizzle-orm';
import { decryptJSON } from '@/lib/crypto';
import { getPublisher } from './registry';
import { getAdapter } from '@/lib/channels/registry';
import { pingIndexNow } from '@/lib/seo/indexnow';
import { silverbackEnqueueForClient, spiderContentDeepLink } from '@/lib/integrations/silverback';

const MAX_ATTEMPTS = 4;
const BATCH_SIZE = 25;

export async function publishDueTargets(now: Date = new Date()): Promise<{
  considered: number;
  published: number;
  failed: number;
  skipped: number;
}> {
  // Pull due rows. A target is due when:
  //   - status='pending', and
  //   - the parent content_item is 'scheduled', and
  //   - the item's scheduled_for <= now (or null = ASAP).
  const due = await db
    .select({
      target: contentTargets,
      item: contentItems,
      integration: integrations,
    })
    .from(contentTargets)
    .innerJoin(contentItems, eq(contentItems.id, contentTargets.contentItemId))
    .innerJoin(integrations, eq(integrations.id, contentTargets.integrationId))
    .where(and(
      eq(contentTargets.status, 'pending'),
      eq(contentItems.status, 'scheduled'),
      or(isNull(contentItems.scheduledFor), lte(contentItems.scheduledFor, now)),
      ne(integrations.status, 'disconnected'),
    ))
    .limit(BATCH_SIZE);

  let published = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of due) {
    // Optimistic lock: flip to 'publishing' so re-entrant cron doesn't
    // pick the same row up twice. If the update affects 0 rows another
    // worker beat us — skip.
    const lock = await db
      .update(contentTargets)
      .set({ status: 'publishing', updatedAt: new Date(), attempts: row.target.attempts + 1 })
      .where(and(eq(contentTargets.id, row.target.id), eq(contentTargets.status, 'pending')))
      .returning({ id: contentTargets.id });
    if (lock.length === 0) { skipped += 1; continue; }

    try {
      const integration = row.integration;
      const credentials = decryptStored(integration.credentials as unknown);
      // JIT token refresh if we have an adapter that supports it and the
      // token is past expiry.
      const refreshed = await maybeRefreshToken(integration.id, integration.channel as Channel, credentials);
      const publisher = getPublisher(integration.channel as Channel);
      const meta = (row.item.metadata as Record<string, unknown>) ?? {};
      // Prefer the per-channel variant when available; fall back to the
      // canonical body so older items + variant-less generations still
      // publish correctly.
      const variants = (meta.variants as Record<string, string> | undefined) ?? {};
      const variantBody = variants[integration.channel] ?? row.item.body;
      const result = await publisher.publish({
        channel: integration.channel as Channel,
        credentials: refreshed,
        externalIds: integration.externalIds as Record<string, string>,
        item: {
          id: row.item.id,
          kind: row.item.kind,
          title: row.item.title,
          body: variantBody,
          mediaUrls: (row.item.mediaUrls as string[]) ?? [],
          metadata: meta,
        },
      });
      await db.update(contentTargets).set({
        status: 'published',
        externalId: result.externalId || null,
        externalUrl: result.externalUrl,
        publishedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      }).where(eq(contentTargets.id, row.target.id));
      published += 1;

      // SEO side-effect: when a website_blog post lands, ping IndexNow
      // so Bing/Yandex/etc reindex quickly. Best-effort — errors don't
      // unwind the publish.
      if (integration.channel === 'website_blog' && result.externalUrl) {
        try { await pingIndexNow(integration.clientId, result.externalUrl); }
        catch { /* logged inside pingIndexNow */ }
      }

      /* Fleet timeline — one event per channel publish. Idempotency
       * keyed on the target id so retried-then-succeeded rows don't
       * fire twice. */
      await silverbackEnqueueForClient(integration.clientId, {
        event_type: 'content.published',
        summary: `Published ${row.item.kind} on ${integration.channel}${row.item.title ? `: "${row.item.title}"` : ''}`,
        payload: {
          content_id: row.item.id,
          target_id: row.target.id,
          channel: integration.channel,
          kind: row.item.kind,
          title: row.item.title,
          external_id: result.externalId || null,
          external_url: result.externalUrl ?? null,
        },
        deep_link: spiderContentDeepLink(row.item.id),
        actor: 'cron:publisher',
        idempotency_key: `spider:content.published:${row.target.id}`,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'publish failed';
      const giveUp = row.target.attempts + 1 >= MAX_ATTEMPTS;
      await db.update(contentTargets).set({
        status: giveUp ? 'failed' : 'pending',
        lastError: message,
        updatedAt: new Date(),
      }).where(eq(contentTargets.id, row.target.id));
      failed += 1;

      /* Emit on PERMANENT failure only — transient retries shouldn't
       * spam the timeline. Idempotency keyed on target id, terminal. */
      if (giveUp) {
        await silverbackEnqueueForClient(row.integration.clientId, {
          event_type: 'content.failed',
          summary: `Failed publishing ${row.item.kind} on ${row.integration.channel}: ${message.slice(0, 120)}`,
          payload: {
            content_id: row.item.id,
            target_id: row.target.id,
            channel: row.integration.channel,
            kind: row.item.kind,
            title: row.item.title,
            attempts: row.target.attempts + 1,
            error: message,
          },
          deep_link: spiderContentDeepLink(row.item.id),
          actor: 'cron:publisher',
          idempotency_key: `spider:content.failed:${row.target.id}`,
        });
      }
    }
  }

  // After processing, advance the parent item to 'published' if every
  // target is published, or 'failed' if any are permanent-failed and
  // nothing pending remains.
  await reconcileItemStatuses();

  return { considered: due.length, published, failed, skipped };
}

async function maybeRefreshToken(integrationId: string, channel: Channel, credentials: Record<string, unknown>): Promise<Record<string, unknown>> {
  const expiresAt = credentials.expires_at as string | undefined;
  if (!expiresAt) return credentials;
  const expiresMs = Date.parse(expiresAt);
  if (Number.isFinite(expiresMs) && expiresMs > Date.now() + 60_000) return credentials;
  const adapter = getAdapter(channel);
  if (!adapter.refresh) return credentials;
  try {
    const result = await adapter.refresh({ credentials });
    // Persist the refreshed creds back through the integration store so
    // future publishes use them (avoid re-importing to dodge cycles).
    const { encryptJSON } = await import('@/lib/crypto');
    const newCt = encryptJSON(result.credentials);
    await db.update(integrations).set({
      credentials: { __ciphertext: newCt },
      updatedAt: new Date(),
    }).where(eq(integrations.id, integrationId));
    return result.credentials;
  } catch {
    return credentials; // fall through; the publish call will likely 401 and we'll record that
  }
}

async function reconcileItemStatuses(): Promise<void> {
  // Mark items 'published' once every target row is published/failed.
  const itemRows = await db
    .select({
      id: contentItems.id,
      status: contentItems.status,
    })
    .from(contentItems)
    .where(eq(contentItems.status, 'scheduled'))
    .limit(200);
  for (const it of itemRows) {
    const targets = await db.select({ status: contentTargets.status })
      .from(contentTargets)
      .where(eq(contentTargets.contentItemId, it.id));
    if (targets.length === 0) continue;
    const pending = targets.some((t) => t.status === 'pending' || t.status === 'publishing');
    if (pending) continue;
    const anyPublished = targets.some((t) => t.status === 'published');
    const allFailed = targets.every((t) => t.status === 'failed' || t.status === 'skipped');
    await db.update(contentItems).set({
      status: anyPublished ? 'published' : allFailed ? 'failed' : 'published',
      updatedAt: new Date(),
    }).where(eq(contentItems.id, it.id));
  }
}

function decryptStored(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  const obj = value as Record<string, unknown>;
  const ct = obj.__ciphertext;
  if (typeof ct === 'string') {
    try { return decryptJSON<Record<string, unknown>>(ct); }
    catch { return {}; }
  }
  return obj;
}

// Reference lt so the import isn't tree-shaken if we wire deadline logic.
void lt;
