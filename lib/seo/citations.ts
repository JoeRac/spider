/**
 * Citation directory catalog.
 *
 * The set of local-business directories Spider tracks. Keys are stable
 * (used as the FK in `seo_citations.directory_key`) so adding a new
 * directory is a code change — no DB migration. Operators mark per-client
 * status in the UI; gaps surface as priority work in the SEO dashboard.
 *
 * `priority` ranks directories so the UI can highlight the must-haves
 * before the long tail. Tier 1 = critical (Google, Yelp, Apple, Bing,
 * Facebook), tier 2 = strong (industry-specific or large general),
 * tier 3 = nice-to-have / long tail.
 */
export type CitationDirectory = {
  key: string;
  name: string;
  url: string;
  priority: 1 | 2 | 3;
  category: 'core' | 'maps' | 'reviews' | 'industry' | 'directory';
  /** Notes the operator should know when submitting. */
  notes?: string;
};

export const CITATION_DIRECTORIES: CitationDirectory[] = [
  // Tier 1 — non-negotiable
  { key: 'google_business', name: 'Google Business Profile', url: 'https://business.google.com/', priority: 1, category: 'core',    notes: 'Most important. Also drives the GMB integration in Spider.' },
  { key: 'bing_places',     name: 'Bing Places',             url: 'https://www.bingplaces.com/', priority: 1, category: 'core' },
  { key: 'apple_maps',      name: 'Apple Maps (Business Connect)', url: 'https://businessconnect.apple.com/', priority: 1, category: 'maps' },
  { key: 'facebook_page',   name: 'Facebook Page',           url: 'https://facebook.com/business/pages', priority: 1, category: 'core' },
  { key: 'yelp',            name: 'Yelp',                    url: 'https://biz.yelp.com/', priority: 1, category: 'reviews' },

  // Tier 2 — strong signal
  { key: 'better_business_bureau', name: 'Better Business Bureau', url: 'https://www.bbb.org/', priority: 2, category: 'reviews' },
  { key: 'yellow_pages',           name: 'Yellow Pages',           url: 'https://www.yellowpages.com/', priority: 2, category: 'directory' },
  { key: 'foursquare',             name: 'Foursquare for Business', url: 'https://business.foursquare.com/', priority: 2, category: 'maps' },
  { key: 'mapquest',               name: 'MapQuest',               url: 'https://business.mapquest.com/', priority: 2, category: 'maps' },
  { key: 'tomtom',                 name: 'TomTom Map Share',       url: 'https://www.tomtom.com/mapshare/', priority: 3, category: 'maps' },
  { key: 'here_maps',              name: 'HERE Maps',              url: 'https://www.here.com/', priority: 3, category: 'maps' },

  // Tier 2 — industry (auto-specific given Badger's used-car focus, but operator can mark NA for non-auto clients)
  { key: 'cars_com',         name: 'Cars.com',           url: 'https://dealers.cars.com/', priority: 2, category: 'industry', notes: 'Auto-specific — mark NA for non-dealer clients.' },
  { key: 'autotrader',       name: 'Autotrader',         url: 'https://www.autotrader.com/sell-my-car', priority: 2, category: 'industry', notes: 'Auto-specific.' },
  { key: 'cargurus',         name: 'CarGurus',           url: 'https://www.cargurus.com/Cars/dealersignup.action', priority: 2, category: 'industry', notes: 'Auto-specific.' },
  { key: 'edmunds',          name: 'Edmunds',            url: 'https://www.edmunds.com/dealerships/', priority: 3, category: 'industry', notes: 'Auto-specific.' },

  // Tier 2-3 — general directories
  { key: 'manta',                  name: 'Manta',                  url: 'https://www.manta.com/', priority: 3, category: 'directory' },
  { key: 'angi',                   name: 'Angi',                   url: 'https://www.angi.com/', priority: 3, category: 'directory' },
  { key: 'nextdoor',               name: 'Nextdoor Business',      url: 'https://business.nextdoor.com/', priority: 2, category: 'directory' },
  { key: 'whitepages',             name: 'Whitepages',             url: 'https://www.whitepages.com/', priority: 3, category: 'directory' },
  { key: 'foursquare_swarm',       name: 'Tripadvisor Business',   url: 'https://www.tripadvisor.com/Owners', priority: 3, category: 'reviews' },

  // Tier 3 — long-tail aggregators
  { key: 'localeze',  name: 'Localeze (Data Axle)', url: 'https://www.localeze.com/', priority: 3, category: 'directory', notes: 'Aggregator — feeds many smaller directories.' },
  { key: 'factual',   name: 'Factual / Foursquare Places', url: 'https://foursquare.com/products/places/', priority: 3, category: 'directory', notes: 'Aggregator.' },
];

export function getDirectory(key: string): CitationDirectory | null {
  return CITATION_DIRECTORIES.find((d) => d.key === key) ?? null;
}
