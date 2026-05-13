import { Shell } from '@/components/shell';
import { Page, PageHeader, Card, CardHeader, Empty, StatTile, Badge, Dot } from '@/components/ui';
import { Search, AlertTriangle, CheckCircle2, MapPin } from 'lucide-react';
import { db } from '@/lib/db';
import { clients, seoProfiles, seoAudits } from '@/lib/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function SeoPage() {
  const profiles = await db
    .select({
      profile: seoProfiles,
      clientId: clients.id,
      clientName: clients.name,
    })
    .from(seoProfiles)
    .innerJoin(clients, eq(clients.id, seoProfiles.clientId))
    .orderBy(seoProfiles.updatedAt);

  // For each profile, attach the latest audit (one query per — fine at
  // typical agency sizes; we can batch later if we hit hundreds).
  const enriched = await Promise.all(profiles.map(async (p) => {
    const [audit] = await db.select().from(seoAudits)
      .where(eq(seoAudits.clientId, p.clientId))
      .orderBy(desc(seoAudits.createdAt))
      .limit(1);
    return { ...p, audit: audit ?? null };
  }));

  const [auditCount] = await db.select({ n: sql<number>`count(*)::int` }).from(seoAudits);
  const avg = enriched.length
    ? Math.round(enriched.reduce((s, e) => s + (e.audit?.score ?? 0), 0) / enriched.length)
    : 0;
  const failing = enriched.filter((e) => e.audit && e.audit.score < 70).length;

  return (
    <Shell>
      <PageHeader
        title="SEO"
        subtitle="On-page audits, target keywords, and local SEO health across every client."
        eyebrow="SEO"
      />
      <Page>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <StatTile label="Profiles"   value={profiles.length} hint="Clients with an SEO profile" icon={<Search size={14} />} />
          <StatTile label="Audits run" value={auditCount?.n ?? 0} hint="All-time" />
          <StatTile label="Avg score"  value={`${avg}/100`} tone={avg >= 70 ? 'ok' : 'warn'} hint="across latest audits" icon={<CheckCircle2 size={14} />} />
          <StatTile label="Below 70"   value={failing} tone={failing > 0 ? 'err' : 'ok'} hint="needs attention" icon={<AlertTriangle size={14} />} />
        </div>

        {enriched.length === 0 ? (
          <Empty
            icon={<Search size={28} />}
            title="No SEO profiles yet"
            hint="Open a client and fill in the SEO panel (site URL, keywords, location) to start running audits."
          />
        ) : (
          <Card>
            <CardHeader title="Clients" subtitle="Latest audit per client. Click through to drill in." />
            <ul className="divide-y divide-border">
              {enriched.map((e) => {
                const score = e.audit?.score ?? null;
                const tone =
                  score == null ? 'neutral' :
                  score >= 85 ? 'ok' :
                  score >= 70 ? 'info' :
                  score >= 50 ? 'warn' : 'err';
                const fails = (e.audit?.findings ?? []).filter((f) => f.severity === 'fail').length;
                const warns = (e.audit?.findings ?? []).filter((f) => f.severity === 'warn').length;
                return (
                  <li key={e.profile.id}>
                    <Link href={`/clients/${e.clientId}#seo`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-subtle/40 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-fg flex items-center gap-2">
                          {e.clientName}
                          {e.profile.primaryLocation && <span className="text-xs text-muted inline-flex items-center gap-1"><MapPin size={11} className="text-faint" />{e.profile.primaryLocation}</span>}
                        </div>
                        <div className="text-xs text-muted mt-0.5">
                          {e.profile.siteUrl ?? <span className="text-faint">no site URL</span>}
                          {(e.profile.targetKeywords ?? []).length > 0 && (
                            <span className="ml-2">· {e.profile.targetKeywords?.length} keyword{e.profile.targetKeywords?.length === 1 ? '' : 's'}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        {score == null ? (
                          <Badge tone="neutral">no audit yet</Badge>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div>
                              {fails > 0 && <Badge tone="err">{fails} fail</Badge>}
                              {warns > 0 && <Badge tone="warn">{warns} warn</Badge>}
                            </div>
                            <div className={`text-xl font-semibold tabular-nums ${tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'err' ? 'text-err' : 'text-fg'}`}>{score}</div>
                            <Dot tone={tone} />
                          </div>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </Page>
    </Shell>
  );
}
