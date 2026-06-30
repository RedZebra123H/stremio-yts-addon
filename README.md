# YTS Magnets — Stremio Addon

A [Stremio](https://www.stremio.com/) addon that provides **movie** streams sourced
from the YTS movie-details API. Torrent entries are converted to magnets on the fly
(the addon does the conversion itself — YTS only returns `.torrent` links).

## How it works

1. Stremio asks for streams for a movie by its IMDb id, e.g. `tt0113375`.
2. The addon fetches `https://movies-api.accel.li/api/v2/movie_details.json?imdb_id=tt0113375`.
3. Each torrent in the response is turned into a Stremio stream.

### Magnet conversion

A magnet looks like:

```
magnet:?xt=urn:btih:HASH&dn=Url+Encoded+Name&tr=...&tr=...
```

- `HASH` — the torrent `hash`
- `dn` — `title_long` + ` [quality] [YTS.GG]`, url-encoded (spaces → `+`)
- `tr` — every tracker in [`lib/trackers.js`](lib/trackers.js)

**Important:** Stremio's stream object has no `magnet` field. For torrents it takes
`infoHash` + `sources` (the trackers) and assembles the magnet internally — that is
the functional equivalent of the magnet string. So each stream is returned as:

```json
{
  "name": "YTS 1080p BluRay",
  "title": "Avengers: Endgame (2019)\n👤 482 • 💾 3.01 GB • ⚙️ x264 • 1080p",
  "infoHash": "...",
  "sources": ["tracker:udp://...", "...", "dht:..."],
  "behaviorHints": { "bingeGroup": "yts-tt4154796-1080p-bluray" }
}
```

The stream `name` shows `quality + source` (e.g. `1080p BluRay` / `720p WEB`) and the
`title`/description shows `👤 seeders • size • codec • quality`. Seeders are live-scraped
from trackers (see "Network stats / seeders" below) — not from the YTS API, which always
reports `0`.

### Ranking

Streams are ordered by:

1. **Quality** — `2160p` (4K) → `3D` → `1080p` → `720p` → `480p`
2. **Source** — `BluRay` above `WEB`
3. **Codec** — `x265` (HEVC) above `x264`

So for two streams of the same quality, BluRay wins; if source also matches, x265 wins.

The exact magnet string is still built by `buildMagnet()` in
[`lib/torrent.js`](lib/torrent.js) (matches your example byte-for-byte) and is
printed by the smoke test, in case you want it elsewhere.

## Run it

```bash
npm install
npm start          # serves on http://127.0.0.1:7000
```

Then in Stremio: open the addons screen and paste the install URL:

```
http://127.0.0.1:7000/manifest.json
```

Set a different port with `PORT=7700 npm start`.

## Test (no Stremio needed)

Hits the live API and prints the streams + magnets it generates:

```bash
npm test                  # defaults to tt4154796 (Avengers: Endgame)
node test/smoke.js tt0111161
```

## Project layout

| File | Purpose |
| --- | --- |
| `addon.js` | Manifest + stream handler (movies only, `tt` IMDb ids). |
| `server.js` | Boots the HTTP server via `serveHTTP`. |
| `lib/yts.js` | Fetches movie details from the YTS API. |
| `lib/torrent.js` | `buildMagnet`, `buildSources`, `toStream`, ranking, name encoding. |
| `lib/trackers.js` | Tracker list — static fallback + live updates from trackerslist. |
| `lib/scrape.js` | Live seeder counts via UDP tracker scrape (BEP 15). |
| `test/smoke.js` | Headless verification against the real API. |

## Notes

- Streams are ranked: quality (4K → 3D → 1080p → 720p), then BluRay > WEB, then x265 > x264.
- Unknown / non-movie ids return `{ "streams": [] }`.
- Trackers are fetched from [ngosang/trackerslist](https://github.com/ngosang/trackerslist)
  (`trackers_best.txt`) on startup and refreshed every 12h, merged with a static fallback
  in `lib/trackers.js`.
- Display naming (`name`/`title`) and the ranking maps live in `lib/torrent.js`
  (`toStream`, `QUALITY_RANK` / `TYPE_RANK` / `CODEC_RANK`) — easy to tweak.

## Network stats / seeders

The seeder counts in the stream list are **scraped live** by this addon — the YTS API
always reports `0`, so we don't use it. On each request, `lib/scrape.js` does a BEP 15
UDP scrape of a few reliable open trackers (opentrackr, demonii, stealth, …) for each
infoHash, in parallel, and shows the highest seeder count found. Results are cached per
infoHash for 10 minutes, so only the first request for a movie pays the ~2–3s cost.

If no tracker answers, the seeder part is simply omitted for that stream.

(The download speed / connected peers shown *in the player during playback* come from
Stremio's own torrent engine — separate from this.)

## Publishing

To use the addon from other devices it must be reachable over **HTTPS** (Stremio
requires it for non-localhost addons). Host it anywhere that gives you HTTPS
(e.g. a small VPS behind a reverse proxy, or a serverless host) and optionally
announce it to the public catalog:

```js
const { publishToCentral } = require('stremio-addon-sdk');
publishToCentral('https://your-domain/manifest.json');
```
