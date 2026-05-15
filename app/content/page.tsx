import { Shell } from '@/components/shell';
import { Page, PageHeader, LinkButton } from '@/components/ui';
import { Sparkles } from 'lucide-react';
import { ContentViewTabs, type ContentView } from './view-tabs';
import { LibraryView } from './library-view';
import { CalendarView } from './calendar-view';
import { GenerateView } from './generate-view';

export const dynamic = 'force-dynamic';

export default async function ContentHubPage({ searchParams }: {
  searchParams: Promise<{ view?: string; status?: string; kind?: string; clientId?: string; campaign?: string; weekOffset?: string }>;
}) {
  const sp = await searchParams;
  const view: ContentView =
    sp.view === 'calendar' ? 'calendar' :
    sp.view === 'generate' ? 'generate' :
    'library';

  const weekOffset = sp.weekOffset ? Number(sp.weekOffset) : 0;

  return (
    <Shell>
      <PageHeader
        title="Content"
        subtitle="Everything generated, scheduled, or published across every client. Switch views below."
        eyebrow="Content"
        actions={view !== 'generate' ? (
          <LinkButton href="/content?view=generate" variant="primary" size="sm">
            <Sparkles size={12} />Generate
          </LinkButton>
        ) : undefined}
      />
      <ContentViewTabs current={view} />
      <Page>
        {view === 'library' && (
          <LibraryView
            status={sp.status}
            kind={sp.kind}
            clientId={sp.clientId}
            campaign={sp.campaign}
          />
        )}
        {view === 'calendar' && <CalendarView weekOffset={weekOffset} />}
        {view === 'generate' && <GenerateView />}
      </Page>
    </Shell>
  );
}
