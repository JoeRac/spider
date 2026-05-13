/**
 * POST /api/content/[id]/publish-now
 * Body: { channels: Channel[] }
 *
 * Convenience action — schedules the item with `scheduledFor=null`
 * (publish ASAP) and immediately runs the publisher dispatch loop
 * inline, so the operator sees results without waiting for the cron.
 */
import { type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { contentItems, contentTargets, integrations, CHANNELS, type Channel } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { ok, err, readJson } from '@/lib/api-helpers';
import { publishDueTargets } from '@/lib/publishers/dispatch';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

type Body = { channels: Channel[] };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<Body>(req);
  if (body instanceof Response) return body;
  if (!Array.isArray(body?.channels) || body.channels.length === 0) return err(400, 'channels required');
  const valid = body.channels.every((c) => CHANNELS.includes(c));
  if (!valid) return err(400, 'unknown channel in request');

  const [item] = await db.select().from(contentItems).where(eq(contentItems.id, id)).limit(1);
  if (!item) return err(404, 'Content not found');

  const liveIntegrations = await db.select().from(integrations).where(and(
    eq(integrations.clientId, item.clientId),
    inArray(integrations.channel, body.channels),
    eq(integrations.status, 'connected'),
  ));
  const byChannel = new Map(liveIntegrations.map((i) => [i.channel, i]));

  for (const channel of body.channels) {
    const integration = byChannel.get(channel);
    if (!integration) continue;
    const existing = await db.select({ id: contentTargets.id }).from(contentTargets)
      .where(and(eq(contentTargets.contentItemId, id), eq(contentTargets.integrationId, integration.id)))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(contentTargets).values({
        contentItemId: id, integrationId: integration.id, status: 'pending',
      });
    } else {
      await db.update(contentTargets).set({
        status: 'pending', attempts: 0, lastError: null, updatedAt: new Date(),
      }).where(eq(contentTargets.id, existing[0]!.id));
    }
  }

  await db.update(contentItems).set({ status: 'scheduled', scheduledFor: null, updatedAt: new Date() }).where(eq(contentItems.id, id));

  const result = await publishDueTargets();
  return ok({ ranInline: true, ...result });
}
