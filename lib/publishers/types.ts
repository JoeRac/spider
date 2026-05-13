/**
 * Channel publisher contract — symmetrical to the OAuth adapter contract,
 * but the verb is "publish" instead of "authenticate".
 *
 * One publisher per channel. `lib/publishers/registry.ts` wires them up;
 * the cron worker (`/api/cron/publish`) dispatches into them when a
 * `content_targets` row is ready to fire.
 *
 * Each publisher is given the decrypted credentials + the channel's
 * externalIds + the content item itself. It returns the external post id
 * + URL on success, or throws on failure. The framework records both
 * outcomes against the target row.
 */
import type { Channel } from '@/lib/db/schema';

export type PublishContext = {
  channel: Channel;
  credentials: Record<string, unknown>;
  externalIds: Record<string, string>;
  item: PublishableItem;
};

export type PublishableItem = {
  id: string;
  kind: string;
  title: string | null;
  body: string;
  mediaUrls: string[];
  metadata: Record<string, unknown>;
};

export type PublishResult = {
  externalId: string;
  externalUrl: string | null;
};

export type ChannelPublisher = {
  channel: Channel;
  publish(ctx: PublishContext): Promise<PublishResult>;
};
