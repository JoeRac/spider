import { Shell } from '@/components/shell';
import { Page, PageHeader, Card, CardHeader, SectionLabel } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default function HelpPage() {
  return (
    <Shell>
      <PageHeader title="Help" eyebrow="Guide" subtitle="How Spider works, and how the pieces fit together." />
      <Page max="3xl">
        <Card>
          <CardHeader title="Spider" subtitle="Workflow + content hub for agency clients" />
          <div className="px-5 py-4 text-sm text-muted leading-relaxed space-y-3">
            <p>
              Spider sits downstream of Badger. Once a deal closes-as-won in Badger, that dealership becomes a Spider <em>client</em> — a workspace where you manage every public surface for that customer.
            </p>
            <p>
              Each client gets a set of <em>integrations</em>: Google My Business, Facebook, Twitter, YouTube, Instagram, LinkedIn, TikTok, plus their own website-blog. Connect what they have; ignore what they don&apos;t.
            </p>
            <p>
              The content engine (phase 3) uses Z.AI GLM 4.6 to draft daily posts tuned to the client&apos;s voice + niche. Drafts land in the library; you curate; the scheduler publishes.
            </p>
          </div>
        </Card>

        <div className="mt-6">
          <SectionLabel className="mb-2">Build phases</SectionLabel>
          <Card className="p-5">
            <ol className="text-sm text-muted space-y-2 list-decimal pl-5">
              <li><strong className="text-fg">Phase 1</strong> (now) — Foundation: schema, clients, Badger import, design system.</li>
              <li><strong className="text-fg">Phase 2</strong> — Integration OAuth + credential vault.</li>
              <li><strong className="text-fg">Phase 3</strong> — Content engine: templates, voice, GLM 4.6, library.</li>
              <li><strong className="text-fg">Phase 4</strong> — Autopilot: cron + publish fan-out + SEO.</li>
            </ol>
          </Card>
        </div>
      </Page>
    </Shell>
  );
}
