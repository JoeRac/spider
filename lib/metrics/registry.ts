/**
 * Metrics fetcher registry. Channels without a fetcher are simply
 * skipped by the cron worker.
 */
import type { Channel } from '@/lib/db/schema';
import type { MetricsFetcher } from './types';
import { twitterMetrics } from './twitter';
import { facebookMetrics, instagramMetrics } from './facebook';
import { linkedinMetrics } from './linkedin';
import { youtubeMetrics } from './youtube';

const REGISTRY: Partial<Record<Channel, MetricsFetcher>> = {
  twitter: twitterMetrics,
  facebook: facebookMetrics,
  instagram: instagramMetrics,
  linkedin: linkedinMetrics,
  youtube: youtubeMetrics,
};

export function getMetricsFetcher(channel: Channel): MetricsFetcher | null {
  return REGISTRY[channel] ?? null;
}

export function metricsChannels(): Channel[] {
  return Object.keys(REGISTRY) as Channel[];
}
