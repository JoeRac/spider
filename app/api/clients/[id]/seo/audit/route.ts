/**
 * POST /api/clients/[id]/seo/audit
 * Body: { url?: string }   — override the profile's site_url for this run.
 */
import { type NextRequest } from 'next/server';
import { ok, err, readJson } from '@/lib/api-helpers';
import { runAudit, getProfile } from '@/lib/seo/audit';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { verifySession, FLEET_SESSION_COOKIE } from '@/lib/fleet-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession(req.cookies.get(FLEET_SESSION_COOKIE)?.value);
  if (!session) return err(401, 'Operator session required.');
  const { id } = await params;
  const body = (await readJson<{ url?: string }>(req).catch(() => ({}))) as { url?: string };
  let url = body?.url;
  if (!url) {
    const profile = await getProfile(id);
    url = profile?.siteUrl ?? undefined;
  }
  if (!url) {
    const [client] = await db.select({ website: clients.website }).from(clients).where(eq(clients.id, id)).limit(1);
    url = client?.website ?? undefined;
  }
  if (!url) return err(400, 'No URL to audit. Set siteUrl on the SEO profile or website on the client first.');

  const result = await runAudit(id, url);
  return ok(result);
}
