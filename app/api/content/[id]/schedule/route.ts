/**
 * POST /api/content/[id]/schedule
 * Body: { scheduledFor?: string|null, channels: Channel[] }
 *
 * Marks the item as `scheduled`, sets `scheduled_for`, and creates
 * `content_targets` rows for each channel where the client has a
 * `connected` integration. Channels without a live connection are
 * skipped silently (the response reports counts).
 */
import { type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { contentItems, contentTargets, integrations, CHANNELS, type Channel } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { ok, err, readJson } from '@/lib/api-helpers';
import { silverbackEnqueueForClient, spiderContentDeepLink } from '@/lib/integrations/silverback';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Body = {
  scheduledFor?: string | null;
  channels: Channel[];
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<Body>(req);
  if (body instanceof Response) return body;
  if (!Array.isArray(body?.channels) || body.channels.length === 0) return err(400, 'channels required');
  const valid = body.channels.every((c) => CHANNELS.includes(c));
  if (!valid) return err(400, 'unknown channel in request');

  const [item] = await db.select().from(contentItems).where(eq(contentItems.id, id)).limit(1);
  if (!item) return err(404, 'Content not found');

  const liveIntegrations = await db
    .select()
    .from(integrations)
    .where(and(
      eq(integrations.clientId, item.clientId),
      inArray(integrations.channel, body.channels),
      eq(integrations.status, 'connected'),
    ));
  const integrationByChannel = new Map(liveIntegrations.map((i) => [i.channel, i]));

  const skipped: Channel[] = [];
  const created: string[] = [];

  for (const channel of body.channels) {
    const integration = integrationByChannel.get(channel);
    if (!integration) { skipped.push(channel); continue; }

    // Upsert the target — re-scheduling reuses the row.
    const existing = await db.select({ id: contentTargets.id }).from(contentTargets)
      .where(and(eq(contentTargets.contentItemId, id), eq(contentTargets.integrationId, integration.id)))
      .limit(1);
    if (existing.length > 0) {
      await db.update(contentTargets).set({
        status: 'pending',
        attempts: 0,
        lastError: null,
        externalId: null,
        externalUrl: null,
        publishedAt: null,
        updatedAt: new Date(),
      }).where(eq(contentTargets.id, existing[0]!.id));
      created.push(existing[0]!.id);
    } else {
      const [row] = await db.insert(contentTargets).values({
        contentItemId: id,
        integrationId: integration.id,
        status: 'pending',
      }).returning({ id: contentTargets.id });
      if (row) created.push(row.id);
    }
  }

  await db.update(contentItems).set({
    status: 'scheduled',
    scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
    updatedAt: new Date(),
  }).where(eq(contentItems.id, id));

  /* Fleet timeline — surface the schedule decision with channel list
   * and the scheduled-for timestamp (or "now" when unset). Idempotency
   * keyed on item id + scheduledFor so re-scheduling produces a new
   * event but exact replays collapse. */
  const channelList = body.channels.filter((c) => !skipped.includes(c));
  await silverbackEnqueueForClient(item.clientId, {
    event_type: 'content.scheduled',
    summary: channelList.length === 0
      ? 'Content scheduled but no live channels'
      : body.scheduledFor
        ? `Scheduled ${item.kind} for ${new Date(body.scheduledFor).toLocaleString()} on ${channelList.join(', ')}`
        : `Queued ${item.kind} for ASAP publish on ${channelList.join(', ')}`,
    payload: {
      content_id: id,
      kind: item.kind,
      title: item.title,
      scheduled_for: body.scheduledFor ?? null,
      channels: channelList,
      skipped_channels: skipped,
    },
    deep_link: spiderContentDeepLink(id),
    idempotency_key: `spider:content.scheduled:${id}:${body.scheduledFor ?? 'now'}`,
  });

  return ok({
    scheduledFor: body.scheduledFor ?? null,
    created: created.length,
    skipped,
  });
}
