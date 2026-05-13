/**
 * Metrics fetcher contract — one optional fetcher per channel. Symmetrical
 * to the publisher contract: the metrics cron iterates connected
 * integrations and calls the fetcher with the same credentials + ids.
 *
 * Fetchers can return:
 *   - `channel`: snapshot of account-level metrics (followers, posts).
 *   - `content`: per-target engagement (one entry per externalId we know).
 *
 * Either field may be omitted when the channel doesn't expose it cheaply.
 */
import type { Channel } from '@/lib/db/schema';

export type ChannelMetricsSnapshot = {
  followers?: number | null;
  posts?: number | null;
  extra?: Record<string, number | string | null>;
};

export type ContentMetricsSnapshot = {
  externalId: string;
  impressions?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  clicks?: number | null;
  views?: number | null;
  extra?: Record<string, number | string | null>;
};

export type MetricsContext = {
  channel: Channel;
  credentials: Record<string, unknown>;
  externalIds: Record<string, string>;
  /** External post ids the cron needs metrics for. Empty array = "just
   *  account-level metrics please, skip the per-post fetch". */
  postIds: string[];
};

export type MetricsResult = {
  channel?: ChannelMetricsSnapshot | null;
  content?: ContentMetricsSnapshot[];
};

export type MetricsFetcher = {
  channel: Channel;
  fetchMetrics(ctx: MetricsContext): Promise<MetricsResult>;
};
