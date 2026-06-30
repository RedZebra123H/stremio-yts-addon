# YTS Magnets — Stremio Addon

A [Stremio](https://www.stremio.com/) addon that provides **movie** torrent streams,
sourced from the YTS movie-details API, with live seeder counts and quality ranking.

## How it works

1. Stremio asks for streams for a movie by its IMDb id, e.g. `tt0113375`.
2. The addon fetches `https://movies-api.accel.li/api/v2/movie_details.json?imdb_id=tt0113375`.
3. For each torrent it returns a Stremio stream, in parallel adding:
   - **`fileIdx` + `filename`** — parsed from the actual `.torrent` (`lib/torrentfile.js`).
   - **live seeder count** — scraped from trackers (`lib/scrape.js`).

A returned stream looks like:

```json
{
  "name": "YTS 1080p BluRay",
  "title": "Avengers: Endgame (2019)\n👤 482 • 💾 3.01 GB • ⚙️ x264 • 1080p",
  "infoHash": "223f7484d326ad8efd3cf1e548ded524833cb77e",
  "fileIdx": 0,
  "behaviorHints": {
    "bingeGroup": "yts-tt4154796-1080p-bluray",
    "filename": "Avengers.Endgame.2019.1080p.BluRay.x264-[YTS.LT].mp4"
  }
}
```

### Why `fileIdx` + `filename` matter

Stremio only attaches its **buffering-progress ring and network/peers/speed stats UI**
when it knows *which file inside the torrent* is the movie. Sending just `infoHash` plays
the video (Stremio auto-picks the largest file) but leaves those indicators greyed out.

So the addon fetches each `.torrent`, bencode-parses it, and sets the real `fileIdx` +
`filename`. This must be parsed, not guessed — e.g. YTS **3D** torrents put the movie at
`fileIdx: 1`, not 0.

We deliberately do **not** send a `sources` (tracker) list on streams — Stremio handles
peer discovery via its own trackers + DHT, exactly like Torrentio / TorrentsDB.

### Stream name & description

- **name**: `YTS <quality> <source>` — e.g. `YTS 1080p BluRay`, `YTS 720p WEB`.
- **description** (line 2): `👤 seeders • 💾 size • ⚙️ codec • quality`. Seeders are
  live-scraped (the YTS API always reports `0`); omitted if no tracker answers.

### Ranking

Streams are ordered by:

1. **Quality** — `2160p` (4K) → `3D` → `1080p` → `720p` → `480p`
2. **Source** — `BluRay` above `WEB`
3. **Codec** — `x265` (HEVC) above `x264`

So for two streams of the same quality, BluRay wins; if source also matches, x265 wins.
The maps live in `lib/torrent.js` (`QUALITY_RANK` / `TYPE_RANK` / `CODEC_RANK`).

## Live seeders

Seeder counts are scraped on each request: `lib/scrape.js` does a BEP 15 UDP scrape of a
few reliable open trackers (opentrackr, demonii, stealth, …) for each infoHash, in
parallel, and shows the highest count found. Results are cached per infoHash for 10
minutes, so only the first request for a movie pays the cost.

(The download speed / connected peers shown *in the player during playback* come from
Stremio's own torrent engine — this seeder count is a pre-playback estimate.)

## Run locally

```bash
npm install
PORT=7700 npm start        # serves on http://127.0.0.1:7700
```

Then in Stremio, open the addons screen and paste:

```
http://127.0.0.1:7700/manifest.json
```

> Port 7000 is the SDK default but is taken by macOS Control Center (AirPlay), so use
> another port. `npm run dev` uses `node --watch` to auto-restart on file changes.

## Deploy (HTTPS, always-on)

To use it on other devices the addon must be reachable over HTTPS. See
[`DEPLOY.md`](DEPLOY.md) for the full free setup (cloud VM + Docker + Caddy + DuckDNS).
Update workflow once deployed:

```bash
# Mac:  git add -A && git commit -m "..." && git push
# VM:   git pull && sudo docker compose up -d --build
```

Bump `version` in `addon.js` when behavior changes, and uninstall/re-add the addon in
Stremio to force a refresh.

## Test (no Stremio needed)

```bash
npm test                  # defaults to tt4154796 (Avengers: Endgame)
node test/smoke.js tt0111161
```

Hits the live API and prints the ranked streams (with scraped seeders).

## Project layout

| File | Purpose |
| --- | --- |
| `addon.js` | Manifest + stream handler (movies only, `tt` IMDb ids). |
| `server.js` | Boots the HTTP server via `serveHTTP`. |
| `lib/yts.js` | Fetches movie details from the YTS API. |
| `lib/torrent.js` | `toStream` + quality/source/codec ranking. |
| `lib/torrentfile.js` | Fetches/parses each `.torrent` for `fileIdx` + filename. |
| `lib/scrape.js` | Live seeder counts via UDP tracker scrape (BEP 15). |
| `test/smoke.js` | Headless verification against the real API. |
| `Dockerfile`, `docker-compose.yml`, `Caddyfile` | Deploy stack (see `DEPLOY.md`). |

## Notes

- Unknown / non-movie ids return `{ "streams": [] }`.
- Seeder scraping and `.torrent` parsing run in parallel per request and are cached, so
  only the first request for a given movie pays the cost.
