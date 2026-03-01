import { requestUrl } from "obsidian";
import type { PosterSize } from "./settings";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

/**
 * Fetch the poster URL for a movie by its TMDB ID.
 * Returns the full image URL or empty string if unavailable.
 */
export async function fetchMoviePosterUrl(
  tmdbId: number,
  apiKey: string,
  size: PosterSize
): Promise<string> {
  return fetchPosterUrl("movie", tmdbId, apiKey, size);
}

/**
 * Fetch the poster URL for a TV show by its TMDB ID.
 * Returns the full image URL or empty string if unavailable.
 */
export async function fetchTvPosterUrl(
  tmdbId: number,
  apiKey: string,
  size: PosterSize
): Promise<string> {
  return fetchPosterUrl("tv", tmdbId, apiKey, size);
}

async function fetchPosterUrl(
  mediaType: "movie" | "tv",
  tmdbId: number,
  apiKey: string,
  size: PosterSize
): Promise<string> {
  try {
    const resp = await requestUrl({
      url: `${TMDB_BASE}/${mediaType}/${tmdbId}?api_key=${apiKey}`,
      method: "GET",
      headers: { "Content-Type": "application/json" },
      throw: false,
    });

    if (resp.status !== 200) {
      console.warn(
        `TMDB lookup failed for ${mediaType}/${tmdbId}: ${resp.status}`
      );
      return "";
    }

    const data = resp.json as { poster_path: string | null };
    if (!data.poster_path) return "";

    return `${TMDB_IMAGE_BASE}/${size}${data.poster_path}`;
  } catch (e) {
    console.warn(`TMDB lookup error for ${mediaType}/${tmdbId}:`, e);
    return "";
  }
}
