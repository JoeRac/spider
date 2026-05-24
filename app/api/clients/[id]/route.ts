import { type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { clients, integrations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ok, err, readJson } from '@/lib/api-helpers';
import { verifySession, FLEET_SESSION_COOKIE } from '@/lib/fleet-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* Fields owned by Badger (the lead-facts source of truth). Every Spider
 * client is bound to a lead by schema design (lead_id is NOT NULL), so
 * we always strip these from PATCH bodies — edits to lead facts must
 * happen in Badger and sync back. */
const BADGER_OWNED_FIELDS = [
  'name', 'website', 'phone', 'email',
  'addressStreet', 'addressCity', 'addressState', 'addressPostcode', 'addressCountry',
] as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession(req.cookies.get(FLEET_SESSION_COOKIE)?.value);
  if (!session) return err(401, 'Operator session required.');
  const { id } = await params;
  const [row] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!row) return err(404, 'Client not found');
  const integrationRows = await db.select().from(integrations).where(eq(integrations.clientId, id));
  return ok({ client: row, integrations: integrationRows });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session2 = await verifySession(req.cookies.get(FLEET_SESSION_COOKIE)?.value);
  if (!session2) return err(401, 'Operator session required.');
  const { id } = await params;
  const body = await readJson<Partial<{
    name: string;
    website: string | null;
    phone: string | null;
    email: string | null;
    addressStreet: string | null;
    addressCity: string | null;
    addressState: string | null;
    addressPostcode: string | null;
    addressCountry: string | null;
    description: string | null;
    status: string;
    tags: string[];
    settings: Record<string, unknown>;
  }>>(req);
  if (body instanceof Response) return body;

  const patch: Record<string, unknown> = { ...body };
  for (const f of BADGER_OWNED_FIELDS) delete patch[f];

  const [row] = await db.update(clients)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(clients.id, id))
    .returning();
  if (!row) return err(404, 'Client not found');
  return ok(row);
}
