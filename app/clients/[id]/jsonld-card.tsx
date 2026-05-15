'use client';
/**
 * Copy-paste schema.org JSON-LD block for the client's website.
 *
 * Render-only — the JSON is computed server-side from the client +
 * SEO profile + connected integrations and serialized for display.
 * One copy-to-clipboard button per format (raw JSON vs `<script>`
 * tag for easy paste-into-CMS).
 */
import { useState } from 'react';
import { Card, CardHeader, Button, SectionLabel, Badge } from '@/components/ui';
import { Copy, Check, Code } from 'lucide-react';

export function JsonLdCard({
  scriptTag,
  rawJson,
}: {
  scriptTag: string;
  rawJson: string;
}) {
  const [copied, setCopied] = useState<'script' | 'json' | null>(null);

  async function copyText(text: string, kind: 'script' | 'json') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* ignore */ }
  }

  return (
    <Card>
      <CardHeader
        title="Structured data (JSON-LD)"
        subtitle="Paste this into the <head> of the client's site. Search engines + LLMs use this as a structured citation source."
        action={<>
          <Button size="sm" variant="ghost" onClick={() => copyText(rawJson, 'json')}>
            {copied === 'json' ? <Check size={12} /> : <Copy size={12} />}
            JSON
          </Button>
          <Button size="sm" variant="primary" onClick={() => copyText(scriptTag, 'script')}>
            {copied === 'script' ? <Check size={12} /> : <Code size={12} />}
            &lt;script&gt; tag
          </Button>
        </>}
      />
      <div className="p-5 space-y-3">
        <div className="flex items-center gap-2 text-xs">
          <Badge tone="ok">free</Badge>
          <span className="text-muted">No external API. Validate at <a href="https://search.google.com/test/rich-results" target="_blank" rel="noopener noreferrer" className="hover:text-accent">Google&apos;s Rich Results Test</a>.</span>
        </div>
        <pre className="text-[11px] text-fg bg-bg/40 rounded p-3 overflow-x-auto leading-snug max-h-[420px]">
          {scriptTag}
        </pre>

        <SectionLabel>Why this matters</SectionLabel>
        <div className="text-xs text-muted leading-relaxed">
          Search engines parse this block directly for rich-result eligibility (knowledge panel, business hours, ratings). Modern LLM-search products (ChatGPT search, Perplexity, Copilot) treat it as a structured citation source — connected social profiles in <code className="font-mono text-[10px] bg-bg px-1 rounded border border-border">sameAs</code> are particularly load-bearing for cross-source verification.
        </div>
      </div>
    </Card>
  );
}
