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
              Spider sits downstream of Badger. When a deal closes-as-won in Badger, that dealership becomes a Spider <em>client</em> — a workspace where you manage every public surface for that customer.
            </p>
            <p>
              Each client gets a set of <em>integrations</em>: Google My Business, Facebook, Twitter, YouTube, Instagram, LinkedIn, TikTok, plus their own website-blog. Connect what they have; ignore what they don&apos;t.
            </p>
            <p>
              The content engine uses Z.AI to draft daily posts tuned to the client&apos;s voice + niche, and produces per-channel variants so a tweet doesn&apos;t read like a LinkedIn post. Drafts land in the library; the operator curates and schedules; the publish cron fans them out every five minutes.
            </p>
          </div>
        </Card>

        <div className="mt-6">
          <SectionLabel className="mb-2">Day-to-day loop</SectionLabel>
          <Card className="p-5">
            <ol className="text-sm text-muted space-y-2 list-decimal pl-5">
              <li><strong className="text-fg">Import</strong> — pull every WON deal from Badger on the Clients page.</li>
              <li><strong className="text-fg">Connect</strong> — open a client, switch to the Channels tab, click Connect for each surface they actually have.</li>
              <li><strong className="text-fg">Profile</strong> — fill the voice profile (niche, tone, audience, selling points) on the Content tab; set SEO target keywords on the SEO tab.</li>
              <li><strong className="text-fg">Activate</strong> — flip the client from onboarding to active. The onboarding checklist on the Overview tab walks you through this.</li>
              <li><strong className="text-fg">Review</strong> — every morning, drafts produced overnight land in the Content library. Edit per-channel variants, attach media, hit Schedule.</li>
              <li><strong className="text-fg">Watch</strong> — Analytics shows what's working; SEO shows what's drifting.</li>
            </ol>
          </Card>
        </div>

        <div className="mt-6">
          <SectionLabel className="mb-2">Where things live</SectionLabel>
          <Card className="p-5 text-sm text-muted leading-relaxed">
            <ul className="space-y-1.5">
              <li><strong className="text-fg">Clients</strong> — list view + per-client workspace with four tabs (Overview, Channels, Content, SEO).</li>
              <li><strong className="text-fg">Content</strong> — global library across every client; filter by status or kind.</li>
              <li><strong className="text-fg">Generation</strong> — bulk-generate batches for any client.</li>
              <li><strong className="text-fg">Schedule</strong> — every pending publish target across all clients.</li>
              <li><strong className="text-fg">SEO + Analytics</strong> — cross-client growth surfaces.</li>
              <li><strong className="text-fg">System</strong> — health, cron schedules, OAuth-app readiness, env configuration, recent activity. One page for the &quot;is this server healthy?&quot; question.</li>
            </ul>
          </Card>
        </div>
      </Page>
    </Shell>
  );
}
