const { addonBuilder } = require('stremio-addon-sdk');
const { fetchMovie } = require('./lib/yts');
const { toStream, sortTorrents } = require('./lib/torrent');
const { getSeedersCached } = require('./lib/scrape');
const { getFileInfo } = require('./lib/torrentfile');

const manifest = {
  id: 'community.yts.magnets',
  version: '1.0.6',
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
    p2p: true, // addon serves BitTorrent (P2P) streams
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

  // In parallel per torrent: live seeder counts (tracker scrape) and the
  // video file index/name (parsed from the .torrent). Both are cached.
  const [seeders, fileInfos] = await Promise.all([
    Promise.all(torrents.map((t) => getSeedersCached(t.hash.toLowerCase()))),
    Promise.all(torrents.map((t) => getFileInfo(t.url))),
  ]);

  const streams = torrents.map((t, i) =>
    toStream(t, movie, { seeders: seeders[i], fileInfo: fileInfos[i] })
  );

  // Cache for 5 min — long enough to be snappy, short enough for fresh seeders.
  return { streams, cacheMaxAge: 300 };
});

module.exports = builder.getInterface();
