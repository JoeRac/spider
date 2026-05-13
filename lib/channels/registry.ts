/**
 * Channel adapter registry — single source of truth for routes + UI.
 *
 * To add a channel:
 *   1. Add the slug to `CHANNELS` in `lib/db/schema.ts`.
 *   2. Build an adapter implementing `ChannelAdapter`.
 *   3. Register it here.
 *
 * Routes (/api/integrations/[channel]/...) and the integrations UI both
 * iterate this map; no other place needs to know about the channel.
 */
import type { Channel } from '@/lib/db/schema';
import type { ChannelAdapter } from './types';
import { googleMyBusinessAdapter } from './google_my_business';
import { youtubeAdapter } from './youtube';
import { facebookAdapter, instagramAdapter } from './facebook';
import { twitterAdapter } from './twitter';
import { linkedinAdapter } from './linkedin';
import { tiktokAdapter } from './tiktok';
import { websiteBlogAdapter } from './website_blog';

const ADAPTERS: Record<Channel, ChannelAdapter> = {
  google_my_business: googleMyBusinessAdapter,
  youtube: youtubeAdapter,
  facebook: facebookAdapter,
  instagram: instagramAdapter,
  twitter: twitterAdapter,
  linkedin: linkedinAdapter,
  tiktok: tiktokAdapter,
  website_blog: websiteBlogAdapter,
};

export function getAdapter(channel: Channel): ChannelAdapter {
  const adapter = ADAPTERS[channel];
  if (!adapter) throw new Error(`No adapter registered for channel: ${channel}`);
  return adapter;
}

export function listAdapters(): ChannelAdapter[] {
  return Object.values(ADAPTERS);
}
