/**
 * TikTok publisher — phase 4 is a stub. Real TikTok publishing requires
 * uploading a video to their inbox via the Content Posting API, which
 * needs a media pipeline Spider doesn't have yet.
 *
 * Until phase 5 wires up media uploads, this publisher records an
 * informative error so the operator sees the work is queued but not
 * automatable. Drafts stay in the library and can be hand-published.
 */
import type { ChannelPublisher, PublishContext, PublishResult } from './types';

export const tiktokPublisher: ChannelPublisher = {
  channel: 'tiktok',
  async publish(_ctx: PublishContext): Promise<PublishResult> {
    throw new Error('TikTok auto-publish ships in phase 5 (requires media pipeline). The draft is in the library — hand-publish for now.');
  },
};
