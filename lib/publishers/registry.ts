/**
 * Publisher registry — picked up by the cron worker.
 * Add a channel → add a publisher → register here.
 */
import type { ChannelPublisher } from './types';
import type { Channel } from '@/lib/db/schema';
import { twitterPublisher } from './twitter';
import { facebookPublisher, instagramPublisher } from './facebook';
import { linkedinPublisher } from './linkedin';
import { googleMyBusinessPublisher } from './google_my_business';
import { youtubePublisher } from './youtube';
import { tiktokPublisher } from './tiktok';
import { websiteBlogPublisher } from './website_blog';

const PUBLISHERS: Record<Channel, ChannelPublisher> = {
  twitter: twitterPublisher,
  facebook: facebookPublisher,
  instagram: instagramPublisher,
  linkedin: linkedinPublisher,
  google_my_business: googleMyBusinessPublisher,
  youtube: youtubePublisher,
  tiktok: tiktokPublisher,
  website_blog: websiteBlogPublisher,
};

export function getPublisher(channel: Channel): ChannelPublisher {
  const p = PUBLISHERS[channel];
  if (!p) throw new Error(`No publisher for channel: ${channel}`);
  return p;
}
