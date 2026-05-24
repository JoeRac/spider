import { type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { contentItems, clients } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { ok, err } from '@/lib/api-helpers';
import { verifySession, FLEET_SESSION_COOKIE } from '@/lib/fleet-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await verifySession(req.cookies.get(FLEET_SESSION_COOKIE)?.value);
  if (!session) return err(401, 'Operator session required.');
  const url = req.nextUrl;
  const clientId = url.searchParams.get('clientId') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;
  const kind = url.searchParams.get('kind') ?? undefined;

  const where = [];
  if (clientId) where.push(eq(contentItems.clientId, clientId));
  if (status) where.push(eq(contentItems.status, status));
  if (kind) where.push(eq(contentItems.kind, kind));

  const rows = await db
    .select({
      id: contentItems.id,
      clientId: contentItems.clientId,
      clientName: clients.name,
      kind: contentItems.kind,
      title: contentItems.title,
      body: contentItems.body,
      status: contentItems.status,
      scheduledFor: contentItems.scheduledFor,
      createdAt: contentItems.createdAt,
      updatedAt: contentItems.updatedAt,
    })
    .from(contentItems)
    .leftJoin(clients, eq(clients.id, contentItems.clientId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(contentItems.createdAt))
    .limit(500);

  return ok({ items: rows, total: rows.length });
}
