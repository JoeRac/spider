import { Shell } from '@/components/shell';
import { Page, PageHeader, Empty } from '@/components/ui';
import { FileText } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function ContentPage() {
  return (
    <Shell>
      <PageHeader
        title="Content library"
        subtitle="Every piece of generated content across all clients — drafts, scheduled, published, archived."
        eyebrow="Content"
      />
      <Page>
        <Empty
          icon={<FileText size={28} />}
          title="Content engine ships in phase 3"
          hint="The schema is already in place (content_items + content_targets). Once GLM 4.6 generation is wired and you have integrations connected, drafts will start arriving here."
        />
      </Page>
    </Shell>
  );
}
