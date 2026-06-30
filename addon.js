const { addonBuilder } = require('stremio-addon-sdk');
const { fetchMovie } = require('./lib/yts');
const { toStream, sortTorrents } = require('./lib/torrent');
const { getSeedersCached } = require('./lib/scrape');

const manifest = {
  id: 'community.yts.magnets',
  version: '1.0.3',
  name: 'YTS Magnets',
  description:
    'Movie torrent streams sourced from YTS and served to Stremio as magnets (infoHash + trackers).',
  logo: 'https://yts.gg/assets/images/website/logo-YTS.svg',
  // This addon only provides streams, only for movies, keyed by IMDb id.
  resources: ['stream'],
  types: ['movie'],
  catalogs: [],
  idPrefixes: ['tt'],
  behaviorHints: {
    configurable: false,
    adult: false,
  },
};

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async ({ type, id }) => {
  // Only movies. For movies, `id` is the plain IMDb id (e.g. "tt0113375").
  if (type !== 'movie') return { streams: [] };

  const imdbId = id.split(':')[0];
  const movie = await fetchMovie(imdbId);
  if (!movie) return { streams: [] };

  // Ranked: quality (4K > 3D > 1080p > 720p), then BluRay > WEB, then x265 > x264.
  const torrents = sortTorrents(movie.torrents);

  // Live seeder counts (scraped in parallel, cached per infohash).
  const seeders = await Promise.all(
    torrents.map((t) => getSeedersCached(t.hash.toLowerCase()))
  );

  const streams = torrents.map((t, i) => toStream(t, movie, { seeders: seeders[i] }));

  // Cache for 5 min — long enough to be snappy, short enough for fresh seeders.
  return { streams, cacheMaxAge: 300 };
});

module.exports = builder.getInterface();
