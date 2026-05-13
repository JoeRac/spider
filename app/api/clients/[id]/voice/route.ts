/**
 * GET  /api/clients/[id]/voice    — return the current voice profile
 * PUT  /api/clients/[id]/voice    — replace it
 */
import { type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ok, err, readJson } from '@/lib/api-helpers';
import { voiceFromClientSettings, updateVoice, voiceSchema } from '@/lib/content/voice';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.select({ settings: clients.settings }).from(clients).where(eq(clients.id, id)).limit(1);
  if (!row) return err(404, 'Client not found');
  return ok(voiceFromClientSettings(row.settings));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<unknown>(req);
  if (body instanceof Response) return body;
  const parsed = voiceSchema.safeParse(body);
  if (!parsed.success) return err(400, parsed.error.message);
  const next = await updateVoice(id, parsed.data);
  return ok(next);
}
