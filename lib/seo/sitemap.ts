/**
 * Sitemap fetcher.
 *
 * Resolves the sitemap location (tries `/sitemap.xml` first, then
 * `robots.txt` for a `Sitemap:` directive), recursively walks index
 * sitemaps, counts <url> entries, captures the newest <lastmod>.
 *
 * Append-only — every successful run writes a new `seo_sitemaps` row so
 * the operator can chart URL count over time.
 */
import { db } from '@/lib/db';
import { seoSitemaps } from '@/lib/db/schema';

export type SitemapSnapshot = {
  url: string;
  urlCount: number;
  lastmodAt: Date | null;
  status: 'completed' | 'failed';
  error?: string;
};

const MAX_DEPTH = 3;
const MAX_URLS_VISITED = 50;
const FETCH_TIMEOUT_MS = 15_000;

export async function fetchSitemap(rootUrl: string): Promise<SitemapSnapshot> {
  const sitemapUrl = await resolveSitemapUrl(rootUrl);
  if (!sitemapUrl) {
    return { url: rootUrl, urlCount: 0, lastmodAt: null, status: 'failed', error: 'No sitemap found at /sitemap.xml or in robots.txt' };
  }

  const visited = new Set<string>();
  let urlCount = 0;
  let newestLastmod: Date | null = null;

  async function walk(url: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) return;
    if (visited.has(url) || visited.size >= MAX_URLS_VISITED) return;
    visited.add(url);

    const xml = await fetchText(url);
    if (!xml) return;

    if (xml.includes('<sitemapindex')) {
      const childUrls = pickAll(xml, /<sitemap>\s*<loc>([^<]+)<\/loc>/gi);
      for (const child of childUrls) {
        await walk(child.trim(), depth + 1);
      }
      return;
    }

    // Leaf sitemap — count entries + track lastmod.
    const entries = pickAll(xml, /<url>([\s\S]*?)<\/url>/gi);
    urlCount += entries.length;
    for (const entry of entries) {
      const lastmodStr = entry.match(/<lastmod>([^<]+)<\/lastmod>/i)?.[1];
      if (lastmodStr) {
        const ts = Date.parse(lastmodStr.trim());
        if (Number.isFinite(ts)) {
          const d = new Date(ts);
          if (!newestLastmod || d > newestLastmod) newestLastmod = d;
        }
      }
    }
  }

  try {
    await walk(sitemapUrl, 0);
  } catch (e) {
    return {
      url: sitemapUrl,
      urlCount,
      lastmodAt: newestLastmod,
      status: 'failed',
      error: e instanceof Error ? e.message : 'walk failed',
    };
  }

  return { url: sitemapUrl, urlCount, lastmodAt: newestLastmod, status: 'completed' };
}

export async function runSitemapForClient(clientId: string, rootUrl: string) {
  const snap = await fetchSitemap(rootUrl);
  const [row] = await db.insert(seoSitemaps).values({
    clientId,
    url: snap.url,
    urlCount: snap.urlCount,
    lastmodAt: snap.lastmodAt,
    status: snap.status,
    error: snap.error ?? null,
  }).returning();
  return row!;
}

/* ──────────────────────────────────────────────────────────────────────── */

async function resolveSitemapUrl(rootUrl: string): Promise<string | null> {
  const candidate = new URL('/sitemap.xml', rootUrl).toString();
  const head = await fetch(candidate, { method: 'HEAD', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }).catch(() => null);
  if (head?.ok) return candidate;

  // Try robots.txt.
  const robots = await fetchText(new URL('/robots.txt', rootUrl).toString());
  if (!robots) return null;
  const m = robots.match(/^\s*Sitemap:\s*(.+)$/im);
  return m ? m[1]!.trim() : null;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'SpiderSEOBot/1.0' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function pickAll(xml: string, re: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1] ?? '');
  return out;
}
