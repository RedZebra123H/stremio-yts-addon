const { getTrackers } = require('./trackers');

// Encode a string the way magnet `dn=` (and form bodies) expect:
// spaces become "+", and reserved chars like ( ) become %28 %29.
// encodeURIComponent leaves !'()* alone, so we escape those too, then
// turn %20 back into "+". This reproduces the canonical YTS magnet naming.
function encodeName(name) {
  return encodeURIComponent(name)
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%20/g, '+');
}

// Human-readable display name used for the magnet `dn` field, e.g.
// "I.D. (1995) [1080p] [YTS.GG]"
function displayName(movie, torrent) {
  return `${movie.title_long} [${torrent.quality}] [YTS.GG]`;
}

// Build a full magnet URI from a YTS torrent entry + its movie.
// magnet:?xt=urn:btih:HASH&dn=Url+Encoded+Name&tr=...&tr=...
function buildMagnet(torrent, movie, trackers = getTrackers()) {
  const hash = torrent.hash.toUpperCase();
  const dn = encodeName(displayName(movie, torrent));
  const tr = trackers.map((t) => `&tr=${encodeURIComponent(t)}`).join('');
  return `magnet:?xt=urn:btih:${hash}&dn=${dn}${tr}`;
}

// Stremio's `sources` format: trackers are prefixed with "tracker:" and a
// "dht:" entry is added so peers can also be found over the DHT.
function buildSources(hash, trackers = getTrackers()) {
  return [...trackers.map((t) => `tracker:${t}`), `dht:${hash}`];
}

// Pretty label for the YTS `type` field ("bluray" -> "BluRay", "web" -> "WEB").
const TYPE_LABELS = { bluray: 'BluRay', web: 'WEB' };
function formatType(type) {
  return TYPE_LABELS[String(type).toLowerCase()] || String(type).toUpperCase();
}

// Sort ranking (lower number = listed higher/first).
const QUALITY_RANK = { '2160p': 0, '3d': 1, '1080p': 2, '720p': 3, '480p': 4 }; // 4K > 3D > 1080p > 720p
const TYPE_RANK = { bluray: 0, web: 1 }; // BluRay above WEB
const CODEC_RANK = { x265: 0, x264: 1 }; // x265 (HEVC) above x264

function rankOf(map, key) {
  const k = String(key).toLowerCase();
  return k in map ? map[k] : 99; // unknowns sink to the bottom
}

// Order torrents: by quality first, then BluRay over WEB, then x265 over x264.
function compareTorrents(a, b) {
  return (
    rankOf(QUALITY_RANK, a.quality) - rankOf(QUALITY_RANK, b.quality) ||
    rankOf(TYPE_RANK, a.type) - rankOf(TYPE_RANK, b.type) ||
    rankOf(CODEC_RANK, a.video_codec) - rankOf(CODEC_RANK, b.video_codec)
  );
}

function sortTorrents(torrents) {
  return [...torrents].sort(compareTorrents);
}

// Convert one YTS torrent into a Stremio stream object.
// NOTE: we deliberately do NOT set `sources` here. Working torrent addons
// (Torrentio, TorrentsDB) only send infoHash and let Stremio's streaming
// server handle peer discovery via its built-in trackers + DHT; adding a
// custom `sources` list appears to stop Stremio attaching its network/stats
// UI. (The trackers still live in buildMagnet() for the raw magnet form.)
function toStream(torrent, movie, { seeders = null, fileInfo = null } = {}) {
  const hash = torrent.hash.toLowerCase();
  const type = formatType(torrent.type); // BluRay / WEB
  const codec = torrent.video_codec; // x264 / x265
  // Line 2: 👤 seeders • size • ⚙️ codec • quality.
  // Seeders are live-scraped from trackers; omitted if no tracker answered.
  const seedPart = seeders != null ? `👤 ${seeders} • ` : '';
  const stream = {
    name: `YTS ${torrent.quality} ${type}`,
    title: `${movie.title_long}\n${seedPart}💾 ${torrent.size} • ⚙️ ${codec} • ${torrent.quality}`,
    infoHash: hash,
    behaviorHints: {
      bingeGroup: `yts-${movie.imdb_code}-${torrent.quality}-${torrent.type}`,
    },
  };
  // fileIdx + filename let Stremio bind its buffering-progress and network/stats
  // UI to the right file inside the torrent (parsed from the .torrent).
  if (fileInfo) {
    stream.fileIdx = fileInfo.fileIdx;
    stream.behaviorHints.filename = fileInfo.filename;
  }
  return stream;
}

module.exports = {
  encodeName,
  displayName,
  buildMagnet,
  buildSources,
  formatType,
  compareTorrents,
  sortTorrents,
  toStream,
};
