/**
 * Generation orchestrator — wraps Z.AI, persists a `generation_runs` audit
 * row, and writes draft `content_items` ready for review.
 *
 * Strategy:
 *   1. Build a system prompt from the client + voice profile.
 *   2. Pick a template (kind) and ask for N items in JSON.
 *   3. Insert each item as a draft, link it to the run.
 *   4. Return the run + new items so the caller can render them.
 *
 * Errors are caught and recorded against the run; we never throw all the
 * way to the API layer without leaving an audit trail.
 */
import { db } from '@/lib/db';
import { clients, generationRuns, contentItems, integrations, type Client, type Channel } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { zaiChatJSON, estimateCostCents } from '@/lib/zai';
import { TEMPLATES, generationOutputSchema, type ContentKind } from './templates';
import { voiceFromClientSettings, voiceToSystemPrompt } from './voice';
import { getAdapter } from '@/lib/channels/registry';
import { getAiConfig } from '@/lib/ai-config';
import { notify } from '@/lib/notify';

export type GenerateInput = {
  clientId: string;
  kind: ContentKind;
  quantity?: number;
  /** Optional brief from the operator to bias this batch. Free text. */
  brief?: string;
  model?: string;
  /** When true, also generate per-channel variants for every channel the
   *  client has a connected integration with. Stored under
   *  `metadata.variants[channel]`. */
  withVariants?: boolean;
};

export type GenerationOutcome = {
  runId: string;
  status: 'completed' | 'failed';
  itemIds: string[];
  error?: string;
  costCents?: number;
};

export async function runGeneration(input: GenerateInput): Promise<GenerationOutcome> {
  const [client] = await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1);
  if (!client) throw new Error('Client not found');

  const template = TEMPLATES[input.kind];
  const quantity = clamp(input.quantity ?? 3, 1, 10);

  const { systemPrompt, userPrompt } = buildPrompts(client, template, quantity, input.brief);

  /* Resolve the model. Explicit input.model wins; otherwise fetch the
   * (spider, content-draft.<kind>) assignment from Silverback. Falls
   * back to the AI config's default if Silverback is unreachable. */
  const cfg = await getAiConfig(`content-draft.${input.kind}`);
  const resolvedModel = input.model ?? cfg.model;

  // Persist a "pending" run up front so we always have a row to attach
  // errors to even if the LLM call itself blows up.
  const [run] = await db.insert(generationRuns).values({
    clientId: client.id,
    template: input.kind,
    prompt: `${systemPrompt}\n\n---\n\n${userPrompt}`,
    model: resolvedModel,
    status: 'pending',
  }).returning();
  if (!run) throw new Error('Failed to record generation run');

  try {
    const { data, usage, model, text } = await zaiChatJSON({
      schema: generationOutputSchema,
      model: resolvedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: cfg.temperature ?? 0.8,
      maxTokens: cfg.maxTokens ?? 2000,
    });

    const costCents = estimateCostCents(usage);

    await db.update(generationRuns).set({
      response: text,
      model,
      inputTokens: usage.promptTokens,
      outputTokens: usage.completionTokens,
      costCents,
      status: 'completed',
    }).where(eq(generationRuns.id, run.id));

    // Optional: derive per-channel variants for every connected channel
    // on this client. Single follow-up call to the model with the original
    // bodies — cheap because the variants are short rewrites.
    const variantsByItem = input.withVariants
      ? await generateVariants({
          client,
          baseItems: data.items.slice(0, quantity).map((i) => ({ title: i.title ?? null, body: i.body })),
          kind: input.kind,
          model: input.model,
        })
      : null;

    const inserted = await Promise.all(data.items.slice(0, quantity).map(async (item, idx) => {
      const variants = variantsByItem?.[idx];
      const [row] = await db.insert(contentItems).values({
        clientId: client.id,
        kind: input.kind,
        title: item.title ?? null,
        body: item.body,
        status: 'draft',
        generationRunId: run.id,
        metadata: {
          hashtags: item.hashtags ?? [],
          notes: item.notes ?? null,
          brief: input.brief ?? null,
          variants: variants ?? undefined,
        },
      }).returning({ id: contentItems.id, title: contentItems.title });
      return row!;
    }));

    /* Fleet timeline — one event per drafted item so the dossier shows
     * each piece individually. Idempotency keyed on the row id; safe
     * if the generation route is retried. */
    const { silverbackEnqueueForClient, spiderContentDeepLink } = await import('@/lib/integrations/silverback');
    for (const row of inserted) {
      await silverbackEnqueueForClient(client.id, {
        event_type: 'content.drafted',
        summary: `Drafted ${input.kind}${row.title ? `: "${row.title}"` : ''}`,
        payload: {
          content_id: row.id,
          kind: input.kind,
          title: row.title,
          generation_run_id: run.id,
          model: input.model ?? null,
          brief: input.brief ?? null,
        },
        deep_link: spiderContentDeepLink(row.id),
        actor: 'system',
        idempotency_key: `spider:content.drafted:${row.id}`,
      });
    }

    return { runId: run.id, status: 'completed', itemIds: inserted.map((r) => r.id), costCents };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Generation failed';
    await db.update(generationRuns).set({ status: 'failed', error: message }).where(eq(generationRuns.id, run.id));
    /* Alert the operator. Hourly idempotency bucket per (client, kind,
     * hour) so a repeating client-prompt issue produces one alert per
     * hour rather than one per failed attempt. */
    const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000));
    await notify({
      severity: 'warn',
      title: `Content generation failed for ${client.name}`,
      body: `kind=${input.kind} · model=${resolvedModel} · ${message.slice(0, 200)}`,
      tags: ['ai-failure', 'content-draft'],
      idempotencyKey: `spider:ai-failure:content-draft:${client.id}:${input.kind}:${hourBucket}`,
    });
    return { runId: run.id, status: 'failed', itemIds: [], error: message };
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function buildPrompts(client: Client, template: typeof TEMPLATES[ContentKind], quantity: number, brief?: string): { systemPrompt: string; userPrompt: string } {
  const voice = voiceFromClientSettings(client.settings);
  const voiceBlock = voiceToSystemPrompt(voice, {
    name: client.name,
    city: client.addressCity,
    state: client.addressState,
  });

  const systemPrompt = [
    voiceBlock,
    '',
    `Content kind: ${template.label} (${template.kind}).`,
    `Target length: ${template.targetLength}.`,
    `Description: ${template.description}`,
    'Instructions:',
    template.instructions,
    '',
    'Output schema:',
    '{ "items": [ { "title"?: string|null, "body": string, "hashtags"?: string[], "notes"?: string } ] }',
    `Return exactly ${quantity} items.`,
  ].join('\n');

  const userPrompt = [
    `Client: ${client.name}.`,
    client.description ? `About the client: ${client.description}` : null,
    brief?.trim() ? `Operator brief for this batch: ${brief.trim()}` : null,
    `Generate ${quantity} ${template.label.toLowerCase()} items.`,
  ].filter(Boolean).join('\n');

  return { systemPrompt, userPrompt };
}

// Surface the validation schema so route handlers can use the same one.
export { generationOutputSchema };
export type { z };

/* ──────────────────────────────────────────────────────────────────────────
   Per-channel variants — one extra LLM call rewrites each base item into a
   short, channel-tailored body. We use the channel adapter labels to keep
   prompts honest about what each surface expects.
   ────────────────────────────────────────────────────────────────────────── */

const variantsSchema = z.object({
  items: z.array(z.object({
    variants: z.record(z.string(), z.string()),
  })),
});

async function generateVariants(opts: {
  client: Client;
  baseItems: Array<{ title: string | null; body: string }>;
  kind: ContentKind;
  model?: string;
}): Promise<Record<string, string>[]> {
  const liveChannels = await db
    .select({ channel: integrations.channel })
    .from(integrations)
    .where(and(eq(integrations.clientId, opts.client.id), eq(integrations.status, 'connected')));
  const channels = liveChannels.map((r) => r.channel as Channel);
  if (channels.length === 0) return opts.baseItems.map(() => ({}));

  const adapterDescriptions = channels.map((c) => {
    const adapter = getAdapter(c);
    return `- ${c}: ${adapter.label}`;
  }).join('\n');

  const voice = voiceFromClientSettings(opts.client.settings);
  const voiceBlock = voiceToSystemPrompt(voice, {
    name: opts.client.name,
    city: opts.client.addressCity,
    state: opts.client.addressState,
  });

  const systemPrompt = [
    voiceBlock,
    '',
    `You are rewriting a base content item into per-channel variants. Channels:`,
    adapterDescriptions,
    '',
    'Rules:',
    '- Each variant must respect the channel\'s norms (Twitter: <=280 chars; LinkedIn: professional; Instagram: punchy + hashtags; GMB: local + soft CTA; Facebook: warm; website_blog: longer; YouTube: description shape).',
    '- Do not invent facts beyond the source body.',
    '- Each variant should read like it was written for that channel, not translated.',
    '',
    'Output JSON: { items: [ { variants: { [channelKey]: "body" } } ] } — exactly one entry per source item, in input order.',
  ].join('\n');

  const userPrompt = opts.baseItems.map((it, i) =>
    `Item ${i + 1}${it.title ? ` (title: "${it.title}")` : ''}:\n${it.body}`
  ).join('\n\n---\n\n');

  try {
    const result = await zaiChatJSON({
      schema: variantsSchema,
      model: opts.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      maxTokens: 2500,
    });
    // Trim to known channels only.
    const out = opts.baseItems.map((_, i) => {
      const v = result.data.items[i]?.variants ?? {};
      const filtered: Record<string, string> = {};
      for (const channel of channels) {
        const candidate = v[channel];
        if (typeof candidate === 'string' && candidate.trim()) filtered[channel] = candidate.trim();
      }
      return filtered;
    });
    return out;
  } catch {
    // Variants are best-effort — if the call fails the base bodies still ship.
    return opts.baseItems.map(() => ({}));
  }
}
