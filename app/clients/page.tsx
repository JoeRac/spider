import { Shell } from '@/components/shell';
import { Page, PageHeader, Card, Empty, Badge, Dot } from '@/components/ui';
import { Users, Plug, MapPin } from 'lucide-react';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import Link from 'next/link';
import { ImportFromBadgerButton } from './import-button';

export const dynamic = 'force-dynamic';

async function loadClients() {
  try {
    return await db.select().from(clients).orderBy(desc(clients.importedAt)).limit(500);
  } catch {
    return [];
  }
}

function statusTone(status: string) {
  if (status === 'active') return 'ok' as const;
  if (status === 'paused') return 'warn' as const;
  if (status === 'archived') return 'neutral' as const;
  return 'info' as const; // onboarding
}

export default async function ClientsPage() {
  const rows = await loadClients();

  return (
    <Shell>
      <PageHeader
        title="Clients"
        subtitle="Every WON dealership imported from Badger. Each becomes a workspace for content + channel management."
        actions={<ImportFromBadgerButton />}
      />
      <Page>
        {rows.length === 0 ? (
          <Empty
            icon={<Users size={28} />}
            title="No clients yet"
            hint="Import every WON deal from Badger to bootstrap Spider. You can run this again at any time — it's idempotent."
            action={<ImportFromBadgerButton />}
          />
        ) : (
          <Card>
            <table className="w-full text-sm">
              <thead className="bg-subtle/60 text-xs uppercase tracking-wider text-faint">
                <tr>
                  <th className="text-left font-semibold px-5 py-2.5">Client</th>
                  <th className="text-left font-semibold px-5 py-2.5">Status</th>
                  <th className="text-left font-semibold px-5 py-2.5">Location</th>
                  <th className="text-left font-semibold px-5 py-2.5">Website</th>
                  <th className="text-left font-semibold px-5 py-2.5">Imported</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-subtle/40 transition-colors duration-[120ms]">
                    <td className="px-5 py-3">
                      <Link href={`/clients/${c.id}`} className="font-medium text-fg hover:text-accent transition-colors">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={statusTone(c.status)}>
                        <Dot tone={statusTone(c.status)} />
                        {c.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {(c.addressCity || c.addressState) ? (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin size={12} className="text-faint" />
                          {[c.addressCity, c.addressState].filter(Boolean).join(', ')}
                        </span>
                      ) : <span className="text-faint">—</span>}
                    </td>
                    <td className="px-5 py-3 text-muted truncate max-w-xs">
                      {c.website ? (
                        <a href={c.website} target="_blank" rel="noopener noreferrer" className="hover:text-accent transition-colors">
                          {c.website.replace(/^https?:\/\//, '')}
                        </a>
                      ) : <span className="text-faint">—</span>}
                    </td>
                    <td className="px-5 py-3 text-muted tabular-nums">
                      {new Date(c.importedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </Page>
    </Shell>
  );
}
