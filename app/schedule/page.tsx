import { Shell } from '@/components/shell';
import { Page, PageHeader, Empty } from '@/components/ui';
import { CalendarClock } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function SchedulePage() {
  return (
    <Shell>
      <PageHeader
        title="Schedule"
        subtitle="Upcoming publish events across every client + channel."
        eyebrow="Schedule"
      />
      <Page>
        <Empty
          icon={<CalendarClock size={28} />}
          title="Schedule lights up in phase 4"
          hint="Once content items have scheduled_for timestamps and the cron worker is running, this is the calendar of upcoming pushes to GMB / FB / etc."
        />
      </Page>
    </Shell>
  );
}
