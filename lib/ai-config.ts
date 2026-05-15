/**
 * Fetch the AI model assignment for a given (app, feature) slot from
 * Silverback. Same shape as every other fleet app's helper.
 *
 * Note: Spider's primary AI path goes through Z.AI (lib/zai.ts), not
 * Anthropic. The `model` field returned here is passed straight to
 * zaiChatJSON when input.model is unset. Operators configure
 * Z.AI-flavored model ids in Silverback's AI config admin page (e.g.
 * 'glm-4.5', 'glm-4-air') for the (app=spider, feature=content-draft)
 * slot.
 *
 * The `provider` field is informational here — we always speak to
 * Z.AI regardless. If we later want to swap providers for specific
 * features, that's where we'd branch.
 */
import 'server-only';

export type AiConfig = {
  provider: string;
  model: string;
  temperature: number | null;
  maxTokens: number | null;
  systemPrompt: string | null;
  source: 'configured' | 'default' | 'fallback';
};

const FALLBACK: AiConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  temperature: null,
  maxTokens: null,
  systemPrompt: null,
  source: 'fallback',
};

const CACHE_TTL_MS = 60_000;
const APP_NAME = 'spider';
const cache = new Map<string, { config: AiConfig; expiresAt: number }>();

export async function getAiConfig(feature: string): Promise<AiConfig> {
  const cached = cache.get(feature);
  if (cached && cached.expiresAt > Date.now()) return cached.config;

  const baseUrl = process.env.SILVERBACK_BASE_URL;
  const apiKey = process.env.SILVERBACK_API_KEY;
  if (!baseUrl || !apiKey) return FALLBACK;

  const url = `${baseUrl.replace(/\/+$/, '')}/api/ai-config?app=${encodeURIComponent(APP_NAME)}&feature=${encodeURIComponent(feature)}`;
  try {
    const res = await fetch(url, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        'x-integration-app': APP_NAME,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) {
      console.warn(`[ai-config] Silverback returned ${res.status} for ${feature}; using fallback`);
      return FALLBACK;
    }
    const json = (await res.json()) as { source: 'configured' | 'default'; config: Omit<AiConfig, 'source'> };
    const config: AiConfig = { ...json.config, source: json.source };
    cache.set(feature, { config, expiresAt: Date.now() + CACHE_TTL_MS });
    return config;
  } catch (err) {
    console.warn(`[ai-config] Silverback unreachable for ${feature}; using fallback:`, err instanceof Error ? err.message : String(err));
    return FALLBACK;
  }
}
