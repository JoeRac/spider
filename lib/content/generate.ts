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
import { clients, generationRuns, contentItems, type Client } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { zaiChatJSON, estimateCostCents } from '@/lib/zai';
import { TEMPLATES, generationOutputSchema, type ContentKind } from './templates';
import { voiceFromClientSettings, voiceToSystemPrompt } from './voice';

export type GenerateInput = {
  clientId: string;
  kind: ContentKind;
  quantity?: number;
  /** Optional brief from the operator to bias this batch. Free text. */
  brief?: string;
  model?: string;
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

  // Persist a "pending" run up front so we always have a row to attach
  // errors to even if the LLM call itself blows up.
  const [run] = await db.insert(generationRuns).values({
    clientId: client.id,
    template: input.kind,
    prompt: `${systemPrompt}\n\n---\n\n${userPrompt}`,
    model: input.model ?? null,
    status: 'pending',
  }).returning();
  if (!run) throw new Error('Failed to record generation run');

  try {
    const { data, usage, model, text } = await zaiChatJSON({
      schema: generationOutputSchema,
      model: input.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      maxTokens: 2000,
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

    const inserted = await Promise.all(data.items.slice(0, quantity).map(async (item) => {
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
        },
      }).returning({ id: contentItems.id });
      return row!.id;
    }));

    return { runId: run.id, status: 'completed', itemIds: inserted, costCents };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Generation failed';
    await db.update(generationRuns).set({ status: 'failed', error: message }).where(eq(generationRuns.id, run.id));
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
