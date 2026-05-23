/**
 * On-page SEO audit.
 *
 * Fetches the target URL once, parses the HTML, and runs a battery of
 * lightweight checks. No headless browser — we want this to run inside a
 * 60-second Vercel route, not 10 minutes of Lighthouse warm-up. Findings
 * are deliberately conservative: each rule maps to an actionable change
 * the operator can make in the next content batch or the next CMS edit.
 *
 * Adding a check = one function returning a Finding|null. Aggregate
 * score is the inverse of weighted severities.
 */
import { db } from '@/lib/db';
import { seoAudits, seoProfiles } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { assertSafeHttpUrl } from '@/lib/security/safe-url';

type Severity = 'info' | 'warn' | 'fail';

export type Finding = {
  id: string;
  severity: Severity;
  title: string;
  detail?: string;
  hint?: string;
};

export type AuditResult = {
  id: string;
  url: string;
  score: number;
  findings: Finding[];
  snapshot: Record<string, unknown>;
  status: 'completed' | 'failed';
  error?: string;
};

const SEVERITY_WEIGHT: Record<Severity, number> = { fail: 15, warn: 6, info: 0 };

/**
 * Run an audit and persist it. Returns the saved row.
 */
export async function runAudit(clientId: string, url: string): Promise<AuditResult> {
  let html = '';
  let status = 'completed' as 'completed' | 'failed';
  let error: string | undefined;
  let snapshot: Record<string, unknown> = {};
  let findings: Finding[] = [];

  try {
    // SSRF guard: reject private / loopback / link-local / metadata targets.
    assertSafeHttpUrl(url);
    const res = await fetch(url, {
      headers: { 'user-agent': 'SpiderSEOAudit/1.0 (+https://spider-ruddy.vercel.app)' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Fetch ${res.status}`);
    html = await res.text();
    snapshot = extractSnapshot(html, url);
    findings = runChecks(snapshot, html);
  } catch (e) {
    status = 'failed';
    error = e instanceof Error ? e.message : 'fetch failed';
    findings = [{ id: 'fetch', severity: 'fail', title: 'Site fetch failed', detail: error }];
  }

  const score = computeScore(findings);

  const [row] = await db.insert(seoAudits).values({
    clientId, url, score, findings, snapshot, status, error: error ?? null,
  }).returning();

  return {
    id: row!.id,
    url, score, findings, snapshot, status, error,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   Snapshot extraction — cheap regex parse. We don't need a full DOM.
   ────────────────────────────────────────────────────────────────────────── */

function extractSnapshot(html: string, url: string): Record<string, unknown> {
  return {
    url,
    title: pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    metaDescription: meta(html, 'description'),
    ogTitle: meta(html, 'og:title', 'property'),
    ogImage: meta(html, 'og:image', 'property'),
    canonical: pickAttr(html, /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i),
    h1: allMatches(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi).map(stripTags),
    h2Count: allMatches(html, /<h2[\s>]/gi).length,
    images: allMatches(html, /<img[^>]+>/gi),
    imgAltMissing: allMatches(html, /<img(?![^>]*\balt=)[^>]*>/gi).length,
    linksInternal: allMatches(html, /<a[^>]+href=["']\/[^"'#][^"']*["']/gi).length,
    hasSchemaOrg: /application\/ld\+json/.test(html),
    bytes: html.length,
  };
}

function pick(html: string, re: RegExp): string {
  const m = html.match(re);
  return m ? stripTags(m[1] ?? '') : '';
}
function pickAttr(html: string, re: RegExp): string {
  const m = html.match(re);
  return m ? (m[1] ?? '').trim() : '';
}
function meta(html: string, name: string, attr: 'name' | 'property' = 'name'): string {
  const re = new RegExp(`<meta[^>]+${attr}=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i');
  const m = html.match(re);
  return m ? (m[1] ?? '').trim() : '';
}
function allMatches(s: string, re: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[1] ?? m[0]);
  return out;
}
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/* ──────────────────────────────────────────────────────────────────────────
   Checks
   ────────────────────────────────────────────────────────────────────────── */

function runChecks(s: Record<string, unknown>, _html: string): Finding[] {
  const out: Finding[] = [];

  const title = String(s.title ?? '');
  if (!title) out.push({ id: 'title-missing', severity: 'fail', title: 'Missing <title>', hint: 'Every page needs a unique, descriptive title tag.' });
  else if (title.length < 25) out.push({ id: 'title-short', severity: 'warn', title: 'Title is short', detail: `${title.length} chars`, hint: 'Aim for 30–60 characters that include your primary keyword.' });
  else if (title.length > 65) out.push({ id: 'title-long', severity: 'warn', title: 'Title is long', detail: `${title.length} chars`, hint: 'Google truncates titles over ~60 characters.' });
  else out.push({ id: 'title-ok', severity: 'info', title: 'Title length looks healthy', detail: `${title.length} chars` });

  const desc = String(s.metaDescription ?? '');
  if (!desc) out.push({ id: 'meta-desc-missing', severity: 'fail', title: 'Missing meta description', hint: 'Add a 140–160 character meta description summarising the page.' });
  else if (desc.length < 60) out.push({ id: 'meta-desc-short', severity: 'warn', title: 'Meta description is short', detail: `${desc.length} chars` });
  else if (desc.length > 165) out.push({ id: 'meta-desc-long', severity: 'warn', title: 'Meta description is long', detail: `${desc.length} chars` });
  else out.push({ id: 'meta-desc-ok', severity: 'info', title: 'Meta description length is good' });

  const h1s = (s.h1 as string[] | undefined) ?? [];
  if (h1s.length === 0) out.push({ id: 'h1-missing', severity: 'fail', title: 'No <h1> on the page', hint: 'Every page should have exactly one H1 stating its main topic.' });
  else if (h1s.length > 1) out.push({ id: 'h1-multiple', severity: 'warn', title: `Multiple <h1>s (${h1s.length})`, hint: 'Use one H1 per page; demote the rest to H2.' });

  const canonical = String(s.canonical ?? '');
  if (!canonical) out.push({ id: 'canonical-missing', severity: 'warn', title: 'No canonical tag', hint: 'Add <link rel="canonical"> to prevent duplicate-content penalties.' });

  const ogImage = String(s.ogImage ?? '');
  if (!ogImage) out.push({ id: 'og-image-missing', severity: 'warn', title: 'No Open Graph image', hint: 'Pages shared on Facebook/LinkedIn need an og:image for a rich preview.' });

  const imgMissing = Number(s.imgAltMissing ?? 0);
  if (imgMissing > 0) out.push({
    id: 'img-alt',
    severity: imgMissing > 5 ? 'fail' : 'warn',
    title: `${imgMissing} image${imgMissing === 1 ? '' : 's'} missing alt text`,
    hint: 'Alt text is required for screen-readers and helps image SEO.',
  });

  const hasSchema = Boolean(s.hasSchemaOrg);
  if (!hasSchema) out.push({ id: 'schema-missing', severity: 'warn', title: 'No JSON-LD schema detected', hint: 'Add LocalBusiness / Organization / Product structured data for richer SERP results.' });

  const internalLinks = Number(s.linksInternal ?? 0);
  if (internalLinks < 5) out.push({ id: 'internal-links-low', severity: 'warn', title: `Only ${internalLinks} internal link${internalLinks === 1 ? '' : 's'}`, hint: 'Internal links spread authority and help crawlers map your site.' });

  return out;
}

function computeScore(findings: Finding[]): number {
  const penalty = findings.reduce((acc, f) => acc + (SEVERITY_WEIGHT[f.severity] ?? 0), 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

/* ──────────────────────────────────────────────────────────────────────────
   Convenience: latest audit for a client
   ────────────────────────────────────────────────────────────────────────── */

export async function latestAudit(clientId: string) {
  const [row] = await db.select().from(seoAudits).where(eq(seoAudits.clientId, clientId)).orderBy(desc(seoAudits.createdAt)).limit(1);
  return row ?? null;
}

export async function getProfile(clientId: string) {
  const [row] = await db.select().from(seoProfiles).where(eq(seoProfiles.clientId, clientId)).limit(1);
  return row ?? null;
}

// silence unused import if `and` isn't used elsewhere
void and;
