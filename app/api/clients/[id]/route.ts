import { type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { clients, integrations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ok, err, readJson } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!row) return err(404, 'Client not found');
  const integrationRows = await db.select().from(integrations).where(eq(integrations.clientId, id));
  return ok({ client: row, integrations: integrationRows });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<Partial<{
    name: string;
    website: string | null;
    phone: string | null;
    email: string | null;
    description: string | null;
    status: string;
    tags: string[];
    settings: Record<string, unknown>;
  }>>(req);
  if (body instanceof Response) return body;

  const [row] = await db.update(clients)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(clients.id, id))
    .returning();
  if (!row) return err(404, 'Client not found');
  return ok(row);
}
