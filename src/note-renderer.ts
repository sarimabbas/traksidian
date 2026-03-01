import type { NormalizedWatchlistItem } from "./types";
import type { TraktWatchlistSettings } from "./settings";
import { renderTemplate, toFrontmatter } from "./utils";

/**
 * Build the full template context (variables available for {{interpolation}})
 * from a normalized watchlist item.
 */
function buildTemplateContext(
  item: NormalizedWatchlistItem
): Record<string, unknown> {
  return {
    title: item.title,
    year: item.year,
    type: item.type,
    overview: item.overview,
    genres: item.genres.join(", "),
    runtime: item.runtime,
    trakt_rating: item.rating,
    trakt_votes: item.votes,
    certification: item.certification,
    country: item.country,
    language: item.language,
    status: item.status,
    listed_at: item.listed_at,
    trakt_id: item.ids.trakt,
    trakt_slug: item.ids.slug,
    imdb_id: item.ids.imdb || "",
    tmdb_id: item.ids.tmdb || "",
    tvdb_id: item.ids.tvdb || "",
    trakt_url: `https://trakt.tv/${item.type === "movie" ? "movies" : "shows"}/${item.ids.slug}`,
    imdb_url: item.ids.imdb
      ? `https://www.imdb.com/title/${item.ids.imdb}`
      : "",
    poster_url: item.poster_url || "",
    // Movie-specific
    tagline: item.tagline || "",
    released: item.released || "",
    // Show-specific
    network: item.network || "",
    aired_episodes: item.aired_episodes || "",
    first_aired: item.first_aired
      ? item.first_aired.split("T")[0]
      : "",
  };
}

/**
 * Build the YAML frontmatter data object for a watchlist item.
 */
function buildFrontmatterData(
  item: NormalizedWatchlistItem,
  settings: TraktWatchlistSettings
): Record<string, unknown> {
  const prefix = settings.tagPrefix;
  const tags = [`${prefix}/${item.type}`];
  for (const genre of item.genres) {
    tags.push(`${prefix}/genre/${genre}`);
  }

  const data: Record<string, unknown> = {
    title: item.title,
    year: item.year,
    type: item.type,
    trakt_id: item.ids.trakt,
    trakt_slug: item.ids.slug,
    imdb_id: item.ids.imdb || null,
    tmdb_id: item.ids.tmdb || null,
    genres: item.genres,
    runtime: item.runtime,
    certification: item.certification,
    trakt_rating: item.rating,
    trakt_votes: item.votes,
    country: item.country,
    language: item.language,
    status: item.status,
  };

  if (item.type === "movie") {
    data.released = item.released || null;
  } else {
    data.tvdb_id = item.ids.tvdb || null;
    data.network = item.network || null;
    data.aired_episodes = item.aired_episodes || null;
    data.first_aired = item.first_aired
      ? item.first_aired.split("T")[0]
      : null;
  }

  data.listed_at = item.listed_at;
  data.trakt_url = `https://trakt.tv/${item.type === "movie" ? "movies" : "shows"}/${item.ids.slug}`;
  data.imdb_url = item.ids.imdb
    ? `https://www.imdb.com/title/${item.ids.imdb}`
    : null;
  data.poster_url = item.poster_url || null;
  data.synced_at = new Date().toISOString();
  data.tags = tags;

  return data;
}

/**
 * Render a complete note (frontmatter + body) for a watchlist item.
 */
export function renderNote(
  item: NormalizedWatchlistItem,
  settings: TraktWatchlistSettings
): string {
  const fmData = buildFrontmatterData(item, settings);
  const frontmatter = toFrontmatter(fmData);

  const template =
    item.type === "movie"
      ? settings.movieNoteTemplate
      : settings.showNoteTemplate;

  const context = buildTemplateContext(item);
  const body = renderTemplate(template, context);

  return `---\n${frontmatter}\n---\n${body}`;
}

/**
 * Render only the frontmatter section for a watchlist item.
 * Used when updating existing notes without overwriting the body.
 */
export function renderFrontmatterOnly(
  item: NormalizedWatchlistItem,
  settings: TraktWatchlistSettings
): string {
  const fmData = buildFrontmatterData(item, settings);
  return toFrontmatter(fmData);
}
