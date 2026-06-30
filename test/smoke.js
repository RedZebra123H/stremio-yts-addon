// Headless smoke test: hits the real YTS API, converts torrents, and prints
// both the Stremio stream objects and the equivalent magnet URIs.
// Usage: node test/smoke.js [tt0113375]
const { fetchMovie } = require('../lib/yts');
const { toStream, buildMagnet, sortTorrents } = require('../lib/torrent');
const { getSeeders } = require('../lib/scrape');
const { refresh, getTrackers } = require('../lib/trackers');

(async () => {
  const imdb = process.argv[2] || 'tt4154796';

  console.log('Refreshing tracker list from trackerslist ...');
  await refresh();
  console.log(`Tracker count: ${getTrackers().length}\n`);

  console.log(`Fetching ${imdb} ...\n`);
  const movie = await fetchMovie(imdb);
  if (!movie) {
    console.error('FAIL: no movie / no torrents returned.');
    process.exit(1);
  }

  console.log(`${movie.title_long} — ${movie.torrents.length} torrent(s), ranked:\n`);

  for (const t of sortTorrents(movie.torrents)) {
    const seeders = await getSeeders(t.hash.toLowerCase());
    const stream = toStream(t, movie, { seeders });
    console.log(`[${t.quality} ${t.type} ${t.video_codec}]  ->  name: "${stream.name}"`);
    console.log('  desc   :', JSON.stringify(stream.title));
    console.log('  magnet :', buildMagnet(t, movie).slice(0, 90) + '...');
    console.log('');
  }

  // Basic assertions.
  const s = toStream(movie.torrents[0], movie);
  if (!s.infoHash || s.infoHash.length !== 40) throw new Error('bad infoHash');
  if (!s.sources.some((x) => x.startsWith('tracker:'))) throw new Error('no tracker sources');
  if (!s.sources.some((x) => x.startsWith('dht:'))) throw new Error('no dht source');

  console.log('OK ✅');
})().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
