// Fetches a .torrent file and works out which file inside it is the movie,
// so streams can carry `fileIdx` + `behaviorHints.filename` like Torrentio.
// Stremio uses those to attach its buffering-progress and network/stats UI.

const VIDEO_EXT = /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|mpg|mpeg|m2ts|ts)$/i;

// Minimal bencode decoder. Strings are returned as Buffers; ints as numbers;
// lists as arrays; dicts as objects (keys decoded as utf8).
function bdecode(buf) {
  let i = 0;

  function decode() {
    const c = buf[i];
    if (c === 0x69) {
      // i<int>e
      const end = buf.indexOf(0x65, i);
      const n = parseInt(buf.toString('ascii', i + 1, end), 10);
      i = end + 1;
      return n;
    }
    if (c === 0x6c) {
      // l...e
      i++;
      const list = [];
      while (buf[i] !== 0x65) list.push(decode());
      i++;
      return list;
    }
    if (c === 0x64) {
      // d...e
      i++;
      const dict = {};
      while (buf[i] !== 0x65) {
        const key = decode().toString('utf8');
        dict[key] = decode();
      }
      i++;
      return dict;
    }
    if (c >= 0x30 && c <= 0x39) {
      // <len>:<bytes>
      const colon = buf.indexOf(0x3a, i);
      const len = parseInt(buf.toString('ascii', i, colon), 10);
      const start = colon + 1;
      const out = buf.subarray(start, start + len);
      i = start + len;
      return out;
    }
    throw new Error(`bad bencode byte 0x${c?.toString(16)} at ${i}`);
  }

  return decode();
}

// Given decoded torrent metadata, return { fileIdx, filename } for the movie
// (largest video file, or largest file overall as a fallback).
function pickVideoFile(meta) {
  const info = meta && meta.info;
  if (!info) return null;

  // Single-file torrent: no `files` list, just `name`.
  if (!info.files) {
    const name = Buffer.isBuffer(info.name) ? info.name.toString('utf8') : String(info.name || '');
    return { fileIdx: 0, filename: name };
  }

  // Multi-file: choose the largest video file (fall back to largest file).
  const files = info.files.map((f, idx) => ({
    idx,
    len: typeof f.length === 'number' ? f.length : 0,
    name: (f.path || []).map((p) => (Buffer.isBuffer(p) ? p.toString('utf8') : p)).join('/'),
  }));
  const videos = files.filter((f) => VIDEO_EXT.test(f.name));
  const pool = videos.length ? videos : files;
  const best = pool.reduce((a, b) => (b.len > a.len ? b : a));
  return { fileIdx: best.idx, filename: best.name.split('/').pop() };
}

// Torrent contents are immutable, so cache forever (keyed by url). We even
// cache null/misses to avoid hammering a flaky source.
const cache = new Map();

async function getFileInfo(torrentUrl, { timeoutMs = 8000 } = {}) {
  if (cache.has(torrentUrl)) return cache.get(torrentUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let result = null;
  try {
    const res = await fetch(torrentUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'stremio-yts-addon/1.0' },
    });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      result = pickVideoFile(bdecode(buf));
    } else {
      console.error(`[torrentfile] HTTP ${res.status} for ${torrentUrl}`);
    }
  } catch (err) {
    console.error('[torrentfile] fetch/parse failed:', err.message);
  } finally {
    clearTimeout(timer);
  }

  cache.set(torrentUrl, result);
  return result;
}

module.exports = { getFileInfo, bdecode, pickVideoFile };
