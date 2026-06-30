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
//
// We send `infoHash` + `fileIdx` + `behaviorHints.filename` and let Stremio do
// peer discovery via its own trackers + DHT (no `sources` list), matching
// Torrentio / TorrentsDB. The fileIdx + filename are what make Stremio attach
// its buffering-progress and network/stats UI to the right file in the torrent.
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
  if (fileInfo) {
    stream.fileIdx = fileInfo.fileIdx;
    stream.behaviorHints.filename = fileInfo.filename;
  }
  return stream;
}

module.exports = { formatType, compareTorrents, sortTorrents, toStream };
