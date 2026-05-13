import { Shell } from '@/components/shell';
import { Page, PageHeader, Empty } from '@/components/ui';
import { Workflow } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function WorkflowsPage() {
  return (
    <Shell>
      <PageHeader
        title="Workflows"
        subtitle="Per-client automation rules: which channels post which kinds of content, on what cadence."
        eyebrow="Automation"
      />
      <Page>
        <Empty
          icon={<Workflow size={28} />}
          title="Workflows arrive in phase 4"
          hint="The jobs table is already in the schema. This UI becomes the rule-builder once the cron worker is up."
        />
      </Page>
    </Shell>
  );
}
