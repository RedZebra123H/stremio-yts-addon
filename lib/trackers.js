// Trackers used in every magnet / as Stremio `sources`.
//
// The live list is fetched from ngosang/trackerslist (updated frequently) and
// merged with the static fallback below, so dead trackers get replaced over time
// without code changes. If the fetch fails we keep using the static list.
const REMOTE_URL = 'https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt';
const REFRESH_MS = 12 * 60 * 60 * 1000; // re-fetch every 12h

// Static fallback (used until the first fetch succeeds, or if it fails).
const STATIC_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://open.stealth.si:80/announce',
  'udp://open.demonii.com:1337/announce',
  'https://tracker.moeblog.cn:443/announce',
  'udp://open.dstud.io:6969/announce',
  'udp://tracker.srv00.com:6969/announce',
  'https://tracker.zhuqiy.com:443/announce',
  'https://tracker.pmman.tech:443/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.tiny-vps.com:6969/announce',
  'udp://tracker.cyberia.is:6969/announce',
  'udp://explodie.org:6969/announce',
];

function dedupe(list) {
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))];
}

let current = dedupe(STATIC_TRACKERS);

// Returns the current (possibly live-updated) tracker list.
function getTrackers() {
  return current;
}

// Fetch the remote list and merge it ahead of the static fallback.
async function refresh({ timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(REMOTE_URL, { signal: controller.signal });
    if (!res.ok) {
      console.error(`[trackers] HTTP ${res.status} fetching list, keeping ${current.length}`);
      return current;
    }
    const text = await res.text();
    const remote = text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((t) => /^(udp|https?):\/\//i.test(t));

    if (remote.length) {
      current = dedupe([...remote, ...STATIC_TRACKERS]);
      console.log(`[trackers] updated from trackerslist: ${current.length} trackers`);
    }
  } catch (err) {
    console.error('[trackers] refresh failed, keeping current list:', err.message);
  } finally {
    clearTimeout(timer);
  }
  return current;
}

// Fetch once now, then on an interval. Safe to call once at startup.
let started = false;
function startAutoRefresh(intervalMs = REFRESH_MS) {
  refresh();
  if (started) return;
  started = true;
  const id = setInterval(refresh, intervalMs);
  if (id.unref) id.unref(); // don't keep the process alive just for this
}

module.exports = { getTrackers, refresh, startAutoRefresh, STATIC_TRACKERS, REMOTE_URL };
