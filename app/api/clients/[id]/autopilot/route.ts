/**
 * GET  /api/clients/[id]/autopilot   — current policy
 * PUT  /api/clients/[id]/autopilot   — replace it
 */
import { type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ok, err, readJson } from '@/lib/api-helpers';
import { autopilotFromClientSettings, autopilotSchema } from '@/lib/content/autopilot';
import { updateAutopilot } from '@/lib/content/autopilot-store';
import { verifySession, FLEET_SESSION_COOKIE } from '@/lib/fleet-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession(req.cookies.get(FLEET_SESSION_COOKIE)?.value);
  if (!session) return err(401, 'Operator session required.');
  const { id } = await params;
  const [row] = await db.select({ settings: clients.settings }).from(clients).where(eq(clients.id, id)).limit(1);
  if (!row) return err(404, 'Client not found');
  return ok(autopilotFromClientSettings(row.settings));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session2 = await verifySession(req.cookies.get(FLEET_SESSION_COOKIE)?.value);
  if (!session2) return err(401, 'Operator session required.');
  const { id } = await params;
  const body = await readJson<unknown>(req);
  if (body instanceof Response) return body;
  const parsed = autopilotSchema.safeParse(body);
  if (!parsed.success) return err(400, parsed.error.message);
  const next = await updateAutopilot(id, parsed.data);
  return ok(next);
}
