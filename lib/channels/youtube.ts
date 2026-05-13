import { makeGoogleAdapter } from './google';

/**
 * YouTube — uses the YouTube Data v3 API. On connect we list the operator's
 * channels and pin the first one as the default upload target.
 */
export const youtubeAdapter = makeGoogleAdapter({
  channel: 'youtube',
  label: 'YouTube',
  scopes: [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly',
  ],
  async resolveIds(tokens): Promise<Record<string, string>> {
    try {
      const res = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        { headers: { authorization: `Bearer ${tokens.access_token}` } },
      );
      if (!res.ok) return {};
      const body = await res.json() as {
        items?: Array<{ id?: string; snippet?: { title?: string } }>;
      };
      const ch = body.items?.[0];
      if (!ch?.id) return {};
      return { channel_id: ch.id, channel_title: ch.snippet?.title ?? '' };
    } catch {
      return {};
    }
  },
});
