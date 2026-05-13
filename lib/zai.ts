/**
 * Z.AI client — Spider's content generation backbone.
 *
 * Z.AI exposes an OpenAI-compatible API at `${ZAI_BASE_URL}/chat/completions`.
 * The model default is `glm-4.6`; override with `ZAI_MODEL` to swap to
 * `glm-4.5`, `glm-4.5-air`, or a newer release without code changes.
 *
 * Two entry points:
 *   - `zaiChat({...})`       — general purpose, returns the raw assistant
 *                              message + usage.
 *   - `zaiChatJSON<T>({...})`— forces JSON output. Validates with the
 *                              zod schema you pass in. Used by content
 *                              generation so the orchestrator gets typed
 *                              structured output instead of free text.
 */
import { config } from '@/lib/config';
import { z } from 'zod';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type ChatResult = {
  text: string;
  usage: ChatUsage;
  model: string;
};

export type ChatOptions = {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** When true, sets `response_format: { type: 'json_object' }`. */
  jsonMode?: boolean;
};

const DEFAULT_TIMEOUT_MS = 60_000;

async function callChat(opts: ChatOptions): Promise<ChatResult> {
  if (!config.zaiApiKey) {
    throw new Error('ZAI_API_KEY not configured — set it in Vercel env to use the content engine.');
  }

  const url = `${config.zaiBaseUrl.replace(/\/$/, '')}/chat/completions`;
  const model = opts.model ?? config.zaiModel;

  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.7,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.jsonMode) body.response_format = { type: 'json_object' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'authorization': `Bearer ${config.zaiApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Z.AI ${res.status}: ${text.slice(0, 500)}`);
  }

  const payload = await res.json() as {
    choices: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    model?: string;
  };
  const text = payload.choices?.[0]?.message?.content ?? '';
  const usage: ChatUsage = {
    promptTokens: payload.usage?.prompt_tokens ?? 0,
    completionTokens: payload.usage?.completion_tokens ?? 0,
    totalTokens: payload.usage?.total_tokens ?? 0,
  };
  return { text, usage, model: payload.model ?? model };
}

export async function zaiChat(opts: ChatOptions): Promise<ChatResult> {
  return callChat(opts);
}

export async function zaiChatJSON<T>(opts: ChatOptions & { schema: z.ZodType<T> }): Promise<ChatResult & { data: T }> {
  const merged: ChatOptions = { ...opts, jsonMode: true };
  // Coerce the system message to remind the model about the JSON contract.
  // Models occasionally drift; explicit instructions + jsonMode is belt-and-braces.
  const messages = ensureJsonReminder(merged.messages);
  const result = await callChat({ ...merged, messages });
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJSON(result.text));
  } catch (e) {
    throw new Error(`Z.AI returned non-JSON despite jsonMode: ${result.text.slice(0, 300)}`);
  }
  const validated = opts.schema.parse(parsed);
  return { ...result, data: validated };
}

function ensureJsonReminder(messages: ChatMessage[]): ChatMessage[] {
  const hasSystem = messages[0]?.role === 'system';
  const reminder = '\n\nRespond with a single JSON object — no markdown fences, no prose before or after.';
  if (hasSystem) {
    const head = messages[0]!;
    return [{ ...head, content: head.content + reminder }, ...messages.slice(1)];
  }
  return [{ role: 'system' as const, content: `You are a careful assistant.${reminder}` }, ...messages];
}

/**
 * Some models still wrap JSON in ```json fences even with jsonMode on.
 * Strip them defensively so the parser doesn't choke.
 */
function extractJSON(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  return fenced ? fenced[1]! : trimmed;
}

/**
 * Rough Z.AI cost estimate (cents). Pricing per million tokens; tune in
 * one place when the price list changes. Used to populate
 * `generation_runs.cost_cents` so the operator can sanity-check spend
 * without leaving Spider.
 *
 * Defaults track Z.AI's public GLM 4.6 pricing as of 2026:
 *   $0.60 / 1M input, $2.20 / 1M output
 *
 * Override with ZAI_INPUT_COST_PER_MTOK / ZAI_OUTPUT_COST_PER_MTOK in env
 * for finance-grade accuracy without code changes.
 */
export function estimateCostCents(usage: ChatUsage): number {
  const inputPerMtok = Number(process.env.ZAI_INPUT_COST_PER_MTOK ?? '0.60');
  const outputPerMtok = Number(process.env.ZAI_OUTPUT_COST_PER_MTOK ?? '2.20');
  const cents = (usage.promptTokens / 1_000_000) * inputPerMtok * 100
              + (usage.completionTokens / 1_000_000) * outputPerMtok * 100;
  return Math.round(cents);
}
