import { Shell } from '@/components/shell';
import { Page, PageHeader, Empty } from '@/components/ui';
import { Sparkles } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function GenerationPage() {
  return (
    <Shell>
      <PageHeader
        title="Generation"
        subtitle="Z.AI GLM 4.6 content engine. Manage templates, voice profiles, run on-demand generation."
        eyebrow="AI"
      />
      <Page>
        <Empty
          icon={<Sparkles size={28} />}
          title="Generation wires up in phase 3"
          hint="ZAI_API_KEY env var is already plumbed through lib/config.ts; this page becomes the generation console once templates land."
        />
      </Page>
    </Shell>
  );
}
