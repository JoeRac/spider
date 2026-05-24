/**
 * GET /api/clients         — list clients (optionally filter by status / search)
 * POST /api/clients        — manually create a client (rare; usually they
 *                            arrive via the Badger import). Body shape:
 *                            { name, leadId, website?, phone? }.
 */
import { type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { ok, err, readJson } from '@/lib/api-helpers';
import { verifySession, FLEET_SESSION_COOKIE } from '@/lib/fleet-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await verifySession(req.cookies.get(FLEET_SESSION_COOKIE)?.value);
  if (!session) return err(401, 'Operator session required.');
  const url = req.nextUrl;
  const status = url.searchParams.get('status') ?? undefined;
  const search = (url.searchParams.get('search') ?? '').trim();

  const where = [];
  if (status) where.push(eq(clients.status, status));
  if (search) {
    const pattern = `%${search}%`;
    where.push(or(
      ilike(clients.name, pattern),
      ilike(clients.website, pattern),
      ilike(clients.addressCity, pattern),
    )!);
  }

  const rows = await db
    .select()
    .from(clients)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(clients.importedAt))
    .limit(500);

  return ok({ clients: rows, total: rows.length });
}

export async function POST(req: NextRequest) {
  const session2 = await verifySession(req.cookies.get(FLEET_SESSION_COOKIE)?.value);
  if (!session2) return err(401, 'Operator session required.');
  const body = await readJson<{
    name: string;
    leadId: string;
    website?: string;
    phone?: string;
  }>(req);
  if (body instanceof Response) return body;
  if (!body?.name) return err(400, 'name required');
  if (!body?.leadId) return err(400, 'leadId required');

  const [row] = await db.insert(clients).values({
    name: body.name,
    leadId: body.leadId,
    website: body.website ?? null,
    phone: body.phone ?? null,
  }).returning();

  return ok(row, { status: 201 });
}
