/**
 * Channel → ContentKind defaults.
 *
 * Operators think "I want a Facebook update" or "I want a tweet" — not
 * "I want a post-type item." This map flips our internal kind vocabulary
 * to channel-first so the Generate surface matches the way agency work
 * is actually requested.
 *
 * Picking the kind isn't trivial — most kinds apply to multiple
 * channels (`post` covers GMB/FB/LI, `reply` covers Twitter/IG/FB),
 * but each channel has a single *best fit* for one-shot generation.
 * That mapping lives here.
 */
import type { Channel } from '@/lib/db/schema';
import type { ContentKind } from './templates';

export const CHANNEL_DEFAULT_KIND: Record<Channel, ContentKind> = {
  google_my_business: 'post',
  facebook:           'post',
  linkedin:           'post',
  instagram:          'post',
  twitter:            'tweet',
  youtube:            'video_desc',
  tiktok:             'video_desc',
  website_blog:       'article',
};

export function kindForChannel(channel: Channel): ContentKind {
  return CHANNEL_DEFAULT_KIND[channel] ?? 'post';
}

/**
 * Friendly description used in the Generate UI to confirm what the
 * operator is asking for. E.g. "Facebook → local post (60–120 words)".
 */
export function generateActionLabel(channel: Channel): string {
  const kind = kindForChannel(channel);
  switch (kind) {
    case 'post':       return 'local post';
    case 'article':    return 'long-form article';
    case 'tweet':      return 'tweet';
    case 'video_desc': return 'video description';
    case 'reply':      return 'engagement reply';
  }
}
