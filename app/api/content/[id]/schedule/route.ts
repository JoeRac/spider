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

  return ok({
    scheduledFor: body.scheduledFor ?? null,
    created: created.length,
    skipped,
  });
}
