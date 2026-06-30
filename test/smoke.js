// Headless smoke test: hits the real YTS API and builds the exact stream
// objects Stremio would receive (ranked, with live seeders + fileIdx/filename).
// Usage: node test/smoke.js [tt4154796]
const { fetchMovie } = require('../lib/yts');
const { toStream, sortTorrents } = require('../lib/torrent');
const { getSeeders } = require('../lib/scrape');
const { getFileInfo } = require('../lib/torrentfile');

(async () => {
  const imdb = process.argv[2] || 'tt4154796';

  console.log(`Fetching ${imdb} ...\n`);
  const movie = await fetchMovie(imdb);
  if (!movie) {
    console.error('FAIL: no movie / no torrents returned.');
    process.exit(1);
  }

  console.log(`${movie.title_long} — ${movie.torrents.length} torrent(s), ranked:\n`);

  for (const t of sortTorrents(movie.torrents)) {
    const [seeders, fileInfo] = await Promise.all([
      getSeeders(t.hash.toLowerCase()),
      getFileInfo(t.url),
    ]);
    const stream = toStream(t, movie, { seeders, fileInfo });
    console.log(`[${t.quality} ${t.type} ${t.video_codec}]`);
    console.log('  ', JSON.stringify(stream));
    console.log('');
  }

  // Basic assertions on the first (top-ranked) stream.
  const [seeders, fileInfo] = await Promise.all([
    getSeeders(movie.torrents[0].hash.toLowerCase()),
    getFileInfo(movie.torrents[0].url),
  ]);
  const s = toStream(movie.torrents[0], movie, { seeders, fileInfo });
  if (!s.infoHash || s.infoHash.length !== 40) throw new Error('bad infoHash');
  if (!('fileIdx' in s) || typeof s.behaviorHints.filename !== 'string') {
    throw new Error('missing fileIdx/filename (torrent parse failed)');
  }

  console.log('OK ✅');
})().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
