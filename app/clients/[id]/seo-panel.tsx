'use client';
/**
 * SEO panel on the client detail page. Operator edits the profile (site
 * URL, keywords, location), then can run an audit on demand. The latest
 * audit's findings render below the form as a checklist.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, Button, FieldGroup, Input, Textarea, Spinner, Badge, SectionLabel } from '@/components/ui';
import { Search, Play, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

type Finding = {
  id: string;
  severity: 'info' | 'warn' | 'fail';
  title: string;
  detail?: string;
  hint?: string;
};

type Audit = {
  id: string;
  score: number;
  url: string;
  findings: Finding[];
  createdAt: string;
};

export function SeoPanel({
  clientId,
  fallbackWebsite,
  initialProfile,
  initialAudit,
}: {
  clientId: string;
  fallbackWebsite: string | null;
  initialProfile: {
    siteUrl: string | null;
    primaryLocation: string | null;
    targetKeywords: string[];
    schemaType: string | null;
    notes: string | null;
  } | null;
  initialAudit: Audit | null;
}) {
  const router = useRouter();
  const [siteUrl, setSiteUrl] = useState(initialProfile?.siteUrl ?? fallbackWebsite ?? '');
  const [primaryLocation, setPrimaryLocation] = useState(initialProfile?.primaryLocation ?? '');
  const [keywords, setKeywords] = useState((initialProfile?.targetKeywords ?? []).join('\n'));
  const [schemaType, setSchemaType] = useState(initialProfile?.schemaType ?? '');
  const [notes, setNotes] = useState(initialProfile?.notes ?? '');
  const [audit, setAudit] = useState<Audit | null>(initialAudit);
  const [busy, setBusy] = useState<null | 'save' | 'audit'>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setBusy('save');
    setMessage(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/seo`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          siteUrl: siteUrl || null,
          primaryLocation: primaryLocation || null,
          targetKeywords: keywords.split('\n').map((s) => s.trim()).filter(Boolean),
          schemaType: schemaType || null,
          notes: notes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) setMessage(json?.error ?? `Failed (${res.status})`);
      else { setMessage('Saved.'); router.refresh(); }
    } finally { setBusy(null); }
  }

  async function runAudit() {
    setBusy('audit');
    setMessage(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/seo/audit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: siteUrl || undefined }),
      });
      const json = await res.json();
      if (!res.ok) { setMessage(json?.error ?? `Audit failed (${res.status})`); return; }
      setAudit({
        id: json.data.id,
        score: json.data.score,
        url: json.data.url,
        findings: json.data.findings,
        createdAt: new Date().toISOString(),
      });
      router.refresh();
    } finally { setBusy(null); }
  }

  const fails = audit?.findings.filter((f) => f.severity === 'fail') ?? [];
  const warns = audit?.findings.filter((f) => f.severity === 'warn') ?? [];
  const infos = audit?.findings.filter((f) => f.severity === 'info') ?? [];

  return (
    <Card id="seo">
      <CardHeader
        title="SEO"
        subtitle="Profile + on-page audit. The generator reads this to bias content toward target keywords + locations."
        action={<>
          <Button size="sm" variant="primary" onClick={save} disabled={!!busy}>{busy === 'save' ? <Spinner size={12} /> : null}Save</Button>
          <Button size="sm" variant="outline" onClick={runAudit} disabled={!!busy || !siteUrl}>{busy === 'audit' ? <Spinner size={12} /> : <Play size={12} />}Run audit</Button>
        </>}
      />
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FieldGroup label="Site URL" hint="The page to audit + use as the canonical site.">
            <Input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://dealership.com" />
          </FieldGroup>
          <FieldGroup label="Primary location" hint="City, region — e.g. Phoenix, AZ.">
            <Input value={primaryLocation} onChange={(e) => setPrimaryLocation(e.target.value)} placeholder="Phoenix, AZ" />
          </FieldGroup>
        </div>
        <FieldGroup label="Target keywords" hint="One per line. Used by content generation + future SERP tracking.">
          <Textarea rows={3} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder={'used trucks phoenix\nbest car dealership phoenix\n4x4 financing'} />
        </FieldGroup>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FieldGroup label="Schema type" hint="e.g. AutoDealer, LocalBusiness — used by structured-data generators later.">
            <Input value={schemaType} onChange={(e) => setSchemaType(e.target.value)} placeholder="AutoDealer" />
          </FieldGroup>
          <FieldGroup label="Notes">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything off-the-record about this client's SEO posture." />
          </FieldGroup>
        </div>
        {message && <div className="text-xs text-muted">{message}</div>}

        {audit && (
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-3">
              <SectionLabel>Latest audit</SectionLabel>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">{new Date(audit.createdAt).toLocaleString()}</span>
                <Badge tone={audit.score >= 85 ? 'ok' : audit.score >= 70 ? 'info' : audit.score >= 50 ? 'warn' : 'err'}>
                  {audit.score}/100
                </Badge>
              </div>
            </div>
            <ul className="space-y-1.5">
              {[...fails, ...warns, ...infos].map((f) => (
                <li key={f.id} className="flex items-start gap-2.5 text-sm">
                  <FindingIcon severity={f.severity} />
                  <div className="min-w-0">
                    <div className="text-fg font-medium">{f.title}{f.detail ? <span className="text-muted font-normal ml-2">{f.detail}</span> : null}</div>
                    {f.hint && <div className="text-xs text-muted mt-0.5">{f.hint}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function FindingIcon({ severity }: { severity: 'info' | 'warn' | 'fail' }) {
  if (severity === 'fail') return <AlertTriangle size={14} className="text-err mt-0.5 flex-none" />;
  if (severity === 'warn') return <AlertTriangle size={14} className="text-warn mt-0.5 flex-none" />;
  return <Info size={14} className="text-info mt-0.5 flex-none" />;
}

// Hush unused import in some builds.
void Search;
