const API_BASE = 'https://movies-api.accel.li/api/v2/movie_details.json';

// Fetch a single movie's details (incl. torrents) by its IMDb id, e.g. "tt0113375".
// Returns the `data.movie` object, or null if the movie/torrents weren't found
// or the request failed.
async function fetchMovie(imdbId, { timeoutMs = 10000 } = {}) {
  const url = `${API_BASE}?imdb_id=${encodeURIComponent(imdbId)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'stremio-yts-addon/1.0' },
    });
    if (!res.ok) {
      console.error(`[yts] HTTP ${res.status} for ${imdbId}`);
      return null;
    }
    const json = await res.json();
    const movie = json && json.data && json.data.movie;

    // The API returns a movie with id 0 / empty imdb_code when nothing matches.
    if (!movie || !movie.imdb_code || !Array.isArray(movie.torrents) || movie.torrents.length === 0) {
      return null;
    }
    return movie;
  } catch (err) {
    console.error(`[yts] fetch failed for ${imdbId}:`, err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchMovie, API_BASE };
