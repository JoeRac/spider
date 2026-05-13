/**
 * Content templates — one entry per `ContentKind`. Each template tells the
 * generator: what the channel expects, what shape the output should take,
 * and how long it should be. The orchestrator (`lib/content/generate.ts`)
 * combines this with the per-client voice profile.
 *
 * Keep templates plain text — they're easy to tune without redeploys when
 * paired with the prompt editor (phase 3 follow-up).
 */
import { z } from 'zod';

export const CONTENT_KINDS = ['post', 'article', 'tweet', 'video_desc', 'reply'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export type Template = {
  kind: ContentKind;
  label: string;
  /** Which channels this kind is intended for. Surfaced in the UI but the
   *  fan-out logic doesn't enforce it — operator can override. */
  channels: string[];
  description: string;
  /** Soft target — passed to the model as guidance, not enforced. */
  targetLength: string;
  /** Instructions for what each generated item should contain. */
  instructions: string;
};

export const TEMPLATES: Record<ContentKind, Template> = {
  post: {
    kind: 'post',
    label: 'Local post',
    channels: ['google_my_business', 'facebook', 'linkedin'],
    description: 'Short-form update for Google My Business, Facebook page, or LinkedIn page.',
    targetLength: '60–120 words',
    instructions: [
      'A locally-flavoured update that reads like the dealership/business posted it themselves.',
      'Include one specific hook (e.g. a customer scenario, a recent arrival, a service tip).',
      'End with a soft call to action.',
    ].join(' '),
  },
  article: {
    kind: 'article',
    label: 'Blog article',
    channels: ['website_blog', 'linkedin'],
    description: 'Long-form blog post for the client\'s website. SEO-aware, scannable.',
    targetLength: '500–800 words',
    instructions: [
      'Structure: an H2 introduction hook, 3–5 H2 sections with substance, a closing H2 CTA.',
      'Use H2 headings (## in markdown). Keep paragraphs to 2–4 sentences for scannability.',
      'Weave a clear SEO target (suggest one) and natural variations of it across the piece.',
      'No fabricated statistics. No generic "in conclusion" filler.',
    ].join(' '),
  },
  tweet: {
    kind: 'tweet',
    label: 'Tweet',
    channels: ['twitter'],
    description: 'Single tweet under 280 characters.',
    targetLength: 'under 280 characters',
    instructions: [
      'One self-contained tweet, no thread.',
      'Strong hook, concrete value, no buzzwords.',
      'Hashtags optional and never more than two.',
    ].join(' '),
  },
  video_desc: {
    kind: 'video_desc',
    label: 'Video description',
    channels: ['youtube', 'tiktok'],
    description: 'YouTube or TikTok description for a generated video segment.',
    targetLength: '150–250 words',
    instructions: [
      'First two lines must hook (they appear above the fold).',
      'Then 2–3 short paragraphs of context.',
      'End with chapter timestamps placeholder (e.g. "00:00 Intro") and 4–6 hashtags.',
    ].join(' '),
  },
  reply: {
    kind: 'reply',
    label: 'Reply / engagement',
    channels: ['twitter', 'instagram', 'facebook'],
    description: 'Short engagement reply for comments, mentions, or DMs.',
    targetLength: '20–60 words',
    instructions: [
      'A direct, helpful reply in the client\'s voice.',
      'Never sound like a chatbot — read it out loud, would a real person say this?',
    ].join(' '),
  },
};

/* ──────────────────────────────────────────────────────────────────────────
   Structured-output schemas (for `zaiChatJSON`)
   ────────────────────────────────────────────────────────────────────────── */

const itemBase = z.object({
  title: z.string().nullable().optional(),
  body: z.string().min(1, 'body required'),
  hashtags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const generationOutputSchema = z.object({
  items: z.array(itemBase).min(1),
});

export type GenerationOutput = z.infer<typeof generationOutputSchema>;
