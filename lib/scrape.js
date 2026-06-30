const dgram = require('dgram');
const crypto = require('crypto');

// Reliable open UDP trackers that YTS magnets announce to, so they actually
// hold seeder data for these infohashes. Used only for scraping seed counts
// (separate from the big tracker list that goes into the magnet/sources).
const SCRAPE_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://exodus.desync.com:6969/announce',
];

const PROTOCOL_ID = 0x41727101980n; // BEP 15 magic constant

// Scrape one UDP tracker for one infohash (BEP 15).
// Resolves { seeders, completed, leechers } or null on any failure/timeout.
function udpScrape(trackerUrl, infoHashHex, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(trackerUrl);
    } catch {
      return resolve(null);
    }
    if (url.protocol !== 'udp:') return resolve(null);

    const host = url.hostname;
    const port = Number(url.port) || 6969;
    const infoHash = Buffer.from(infoHashHex, 'hex');
    if (infoHash.length !== 20) return resolve(null);

    const socket = dgram.createSocket('udp4');
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket.close(); } catch {}
      resolve(val);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);

    // 1) connect request
    const connTxId = crypto.randomBytes(4);
    const connReq = Buffer.alloc(16);
    connReq.writeBigUInt64BE(PROTOCOL_ID, 0);
    connReq.writeUInt32BE(0, 8); // action = connect
    connTxId.copy(connReq, 12);

    socket.on('error', () => finish(null));

    socket.on('message', (msg) => {
      if (msg.length < 8) return;
      const action = msg.readUInt32BE(0);

      if (action === 0 && msg.length >= 16) {
        // connect response -> send scrape request
        const connId = msg.subarray(8, 16);
        const scrapeTxId = crypto.randomBytes(4);
        const scrapeReq = Buffer.alloc(36);
        connId.copy(scrapeReq, 0);
        scrapeReq.writeUInt32BE(2, 8); // action = scrape
        scrapeTxId.copy(scrapeReq, 12);
        infoHash.copy(scrapeReq, 16);
        socket.send(scrapeReq, 0, scrapeReq.length, port, host, (err) => {
          if (err) finish(null);
        });
      } else if (action === 2 && msg.length >= 20) {
        // scrape response: action(4) txid(4) seeders(4) completed(4) leechers(4)
        finish({
          seeders: msg.readUInt32BE(8),
          completed: msg.readUInt32BE(12),
          leechers: msg.readUInt32BE(16),
        });
      } else if (action === 3) {
        finish(null); // tracker error
      }
    });

    socket.send(connReq, 0, connReq.length, port, host, (err) => {
      if (err) finish(null);
    });
  });
}

// Scrape several trackers in parallel for one infohash; return the highest
// seeder count found, or null if no tracker answered.
async function getSeeders(infoHashHex, { trackers = SCRAPE_TRACKERS, timeoutMs = 2500 } = {}) {
  const results = await Promise.all(trackers.map((t) => udpScrape(t, infoHashHex, timeoutMs)));
  const counts = results.filter(Boolean).map((r) => r.seeders);
  return counts.length ? Math.max(...counts) : null;
}

// Per-infohash cache so we don't re-scrape on every Stremio request.
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function getSeedersCached(infoHashHex, opts = {}) {
  const key = infoHashHex.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.seeders;
  const seeders = await getSeeders(key, opts);
  cache.set(key, { seeders, ts: Date.now() });
  return seeders;
}

module.exports = { udpScrape, getSeeders, getSeedersCached, SCRAPE_TRACKERS };
