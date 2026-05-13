/**
 * GET /api/cron/sitemap-refresh — daily.
 * Refreshes sitemap snapshots for every active client whose SEO profile
 * has a siteUrl (or whose client record has a website).
 */
import { type NextRequest } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { db } from '@/lib/db';
import { clients, seoProfiles } from '@/lib/db/schema';
import { eq, isNotNull } from 'drizzle-orm';
import { runSitemapForClient } from '@/lib/seo/sitemap';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  // Active clients with a siteUrl somewhere — prefer profile.siteUrl,
  // fall back to clients.website.
  const rows = await db
    .select({
      id: clients.id,
      website: clients.website,
      siteUrl: seoProfiles.siteUrl,
    })
    .from(clients)
    .leftJoin(seoProfiles, eq(seoProfiles.clientId, clients.id))
    .where(eq(clients.status, 'active'));

  const summary: Array<{ clientId: string; url: string; status: string; urlCount: number }> = [];
  for (const r of rows) {
    const url = r.siteUrl ?? r.website;
    if (!url) continue;
    try {
      const snap = await runSitemapForClient(r.id, url);
      summary.push({ clientId: r.id, url: snap.url, status: snap.status, urlCount: snap.urlCount });
    } catch (e) {
      summary.push({ clientId: r.id, url, status: 'failed', urlCount: 0 });
    }
  }
  return Response.json({ ok: true, processed: rows.length, summary });
}

export const POST = GET;

// silence isNotNull import (may be used later)
void isNotNull;
