/**
 * Per-client voice profile.
 *
 * Stored under `clients.settings.voice` so we don't need a schema change
 * every time we tune the profile fields. The operator edits this in the
 * client detail page; the generator weaves it into prompts.
 *
 * Keep this small — the model gets the voice as a system prompt, so every
 * field is paid for in tokens on every generation. Add fields only when
 * they materially change output quality.
 */
import { z } from 'zod';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const voiceSchema = z.object({
  niche: z.string().optional(),
  tone: z.string().optional(),
  audience: z.string().optional(),
  sellingPoints: z.array(z.string()).optional(),
  avoid: z.array(z.string()).optional(),
  callToAction: z.string().optional(),
});

export type Voice = z.infer<typeof voiceSchema>;

const EMPTY: Voice = {};

export function voiceFromClientSettings(settings: unknown): Voice {
  if (!settings || typeof settings !== 'object') return EMPTY;
  const raw = (settings as Record<string, unknown>).voice;
  const parsed = voiceSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : EMPTY;
}

export async function updateVoice(clientId: string, voice: Voice): Promise<Voice> {
  const cleaned = voiceSchema.parse(voice);
  const [row] = await db.select({ settings: clients.settings }).from(clients).where(eq(clients.id, clientId)).limit(1);
  const next = { ...(row?.settings ?? {}), voice: cleaned };
  await db.update(clients).set({ settings: next, updatedAt: new Date() }).where(eq(clients.id, clientId));
  return cleaned;
}

/** Format the voice profile as a compact directive block for the LLM. */
export function voiceToSystemPrompt(voice: Voice, fallback: { name: string; city?: string | null; state?: string | null }): string {
  const lines: string[] = [];
  lines.push(`You are writing content on behalf of ${fallback.name}.`);
  const where = [fallback.city, fallback.state].filter(Boolean).join(', ');
  if (where) lines.push(`Location: ${where}.`);
  if (voice.niche) lines.push(`Niche: ${voice.niche}.`);
  if (voice.audience) lines.push(`Audience: ${voice.audience}.`);
  if (voice.tone) lines.push(`Tone: ${voice.tone}.`);
  if (voice.sellingPoints?.length) {
    lines.push(`Key selling points to weave in (don't force all of them every time): ${voice.sellingPoints.map((s) => `"${s}"`).join(', ')}.`);
  }
  if (voice.avoid?.length) {
    lines.push(`Avoid: ${voice.avoid.join('; ')}.`);
  }
  if (voice.callToAction) lines.push(`Preferred call to action: ${voice.callToAction}.`);
  lines.push('Write specifically and concretely. Do not invent facts, prices, or inventory you weren\'t given.');
  return lines.join('\n');
}
