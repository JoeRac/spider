/**
 * GET  /api/clients/[id]/sitemap         — recent snapshots
 * POST /api/clients/[id]/sitemap/refresh — fetch + persist a new snapshot
 */
import { type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { seoSitemaps, clients } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { ok, err } from '@/lib/api-helpers';
import { runSitemapForClient } from '@/lib/seo/sitemap';
import { getProfile } from '@/lib/seo/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await db.select().from(seoSitemaps).where(eq(seoSitemaps.clientId, id)).orderBy(desc(seoSitemaps.fetchedAt)).limit(20);
  return ok({ snapshots: rows });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Use the SEO profile's siteUrl if present; otherwise fall back to clients.website.
  const profile = await getProfile(id);
  let siteUrl = profile?.siteUrl ?? null;
  if (!siteUrl) {
    const [client] = await db.select({ website: clients.website }).from(clients).where(eq(clients.id, id)).limit(1);
    siteUrl = client?.website ?? null;
  }
  if (!siteUrl) return err(400, 'No site URL — set one on the SEO profile.');
  const snap = await runSitemapForClient(id, siteUrl);
  return ok(snap);
}
