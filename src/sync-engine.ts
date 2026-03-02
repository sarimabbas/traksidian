import { App, Notice, TFile, TFolder } from "obsidian";
import type { TraktWatchlistSettings } from "./settings";
import type {
  TraktWatchlistItem,
  TraktWatchedMovieItem,
  TraktWatchedShowItem,
  TraktFavoriteItem,
  TraktRatingItem,
  NormalizedItem,
  SyncResult,
  TraktMovie,
  TraktShow,
  TraktIds,
  ItemType,
} from "./types";
import {
  fetchWatchlist,
  fetchWatchedMovies,
  fetchWatchedShows,
  fetchFavorites,
  fetchRatings,
} from "./trakt-api";
import { fetchMoviePosterUrl, fetchTvPosterUrl } from "./tmdb-api";
import { ensureValidToken } from "./trakt-auth";
import { renderNote, renderFrontmatterOnly } from "./note-renderer";
import { sanitizeFilename, renderTemplate, parseFrontmatter } from "./utils";

// ── Normalization helpers ──

function baseFromMovie(m: TraktMovie): NormalizedItem {
  return {
    type: "movie",
    title: m.title,
    year: m.year,
    ids: m.ids,
    overview: m.overview || "",
    genres: m.genres || [],
    runtime: m.runtime || 0,
    rating: m.rating || 0,
    votes: m.votes || 0,
    certification: m.certification || "",
    country: m.country || "",
    language: m.language || "",
    status: m.status || "",
    tagline: m.tagline,
    released: m.released,
  };
}

function baseFromShow(s: TraktShow): NormalizedItem {
  return {
    type: "show",
    title: s.title,
    year: s.year,
    ids: s.ids,
    overview: s.overview || "",
    genres: s.genres || [],
    runtime: s.runtime || 0,
    rating: s.rating || 0,
    votes: s.votes || 0,
    certification: s.certification || "",
    country: s.country || "",
    language: s.language || "",
    status: s.status || "",
    network: s.network,
    aired_episodes: s.aired_episodes,
    first_aired: s.first_aired,
  };
}

function getOrCreateItem(
  map: Map<number, NormalizedItem>,
  ids: TraktIds,
  type: ItemType,
  movie?: TraktMovie,
  show?: TraktShow
): NormalizedItem {
  const existing = map.get(ids.trakt);
  if (existing) return existing;

  let item: NormalizedItem;
  if (type === "movie" && movie) {
    item = baseFromMovie(movie);
  } else if (type === "show" && show) {
    item = baseFromShow(show);
  } else {
    throw new Error(`Cannot create item: missing ${type} data`);
  }

  map.set(ids.trakt, item);
  return item;
}

// ── Folder & file helpers ──

async function ensureFolder(app: App, path: string): Promise<void> {
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFolder) return;
  if (!existing) {
    await app.vault.createFolder(path);
  }
}

function buildFilename(
  item: NormalizedItem,
  template: string
): string {
  const context: Record<string, unknown> = {
    title: item.title,
    year: item.year,
    imdb_id: item.ids.imdb || "",
    trakt_id: item.ids.trakt,
  };
  const raw = renderTemplate(template, context);
  return sanitizeFilename(raw);
}

/**
 * Scan a folder for notes and extract the trakt_id from frontmatter.
 * The trakt_id property key depends on the configured prefix.
 */
async function scanExistingNotes(
  app: App,
  folderPath: string,
  propertyPrefix: string
): Promise<Map<number, TFile>> {
  const map = new Map<number, TFile>();
  const folder = app.vault.getAbstractFileByPath(folderPath);
  if (!(folder instanceof TFolder)) return map;

  const idKey = `${propertyPrefix}id`;

  for (const child of folder.children) {
    if (!(child instanceof TFile) || child.extension !== "md") continue;
    const content = await app.vault.cachedRead(child);
    const { frontmatter } = parseFrontmatter(content);
    const traktId = parseInt(frontmatter[idKey], 10);
    if (!isNaN(traktId)) {
      map.set(traktId, child);
    }
  }

  return map;
}

// ── Sync Engine ──

export class SyncEngine {
  private app: App;
  private settings: TraktWatchlistSettings;
  private saveSettings: () => Promise<void>;
  private syncing = false;

  constructor(
    app: App,
    settings: TraktWatchlistSettings,
    saveSettings: () => Promise<void>
  ) {
    this.app = app;
    this.settings = settings;
    this.saveSettings = saveSettings;
  }

  async sync(): Promise<SyncResult> {
    if (this.syncing) {
      new Notice("Sync already in progress.");
      return { added: 0, updated: 0, removed: 0, failed: 0, errors: [] };
    }

    this.syncing = true;
    const result: SyncResult = {
      added: 0,
      updated: 0,
      removed: 0,
      failed: 0,
      errors: [],
    };

    try {
      // 1. Ensure valid token
      await ensureValidToken(this.settings, this.saveSettings);

      // 2. Fetch from all enabled sources and merge by trakt_id
      const mergedMovies = new Map<number, NormalizedItem>();
      const mergedShows = new Map<number, NormalizedItem>();

      if (this.settings.syncMovies) {
        await this.fetchAndMergeMovies(mergedMovies);
      }
      if (this.settings.syncShows) {
        await this.fetchAndMergeShows(mergedShows);
      }

      // 3. Process movies
      if (this.settings.syncMovies) {
        await this.reconcileType(
          mergedMovies,
          this.settings.movieFolder,
          result
        );
      }

      // 4. Process shows
      if (this.settings.syncShows) {
        await this.reconcileType(
          mergedShows,
          this.settings.showFolder,
          result
        );
      }

      // 5. Show result
      const msg = `Sync complete: ${result.added} added, ${result.updated} updated, ${result.removed} removed${result.failed > 0 ? `, ${result.failed} failed` : ""}`;
      new Notice(msg, 5000);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Unknown error during sync.";
      new Notice(`Trakt sync failed: ${msg}`, 10000);
      result.errors.push(msg);
    } finally {
      this.syncing = false;
    }

    return result;
  }

  /**
   * Fetch from all enabled sources for movies and merge into the map.
   */
  private async fetchAndMergeMovies(
    map: Map<number, NormalizedItem>
  ): Promise<void> {
    const { clientId, accessToken } = this.settings;

    // Watchlist
    if (this.settings.syncWatchlist) {
      const items = await fetchWatchlist("movies", clientId, accessToken);
      for (const raw of items) {
        if (!raw.movie) continue;
        const item = getOrCreateItem(
          map, raw.movie.ids, "movie", raw.movie
        );
        item.watchlist = true;
        item.watchlist_added_at = raw.listed_at;
      }
    }

    // Watched
    if (this.settings.syncWatched) {
      const items = await fetchWatchedMovies(clientId, accessToken);
      for (const raw of items) {
        const item = getOrCreateItem(
          map, raw.movie.ids, "movie", raw.movie
        );
        item.watched = true;
        item.plays = raw.plays;
        item.last_watched_at = raw.last_watched_at;
      }
    }

    // Favorites
    if (this.settings.syncFavorites) {
      const items = await fetchFavorites("movies", clientId, accessToken);
      for (const raw of items) {
        if (!raw.movie) continue;
        const item = getOrCreateItem(
          map, raw.movie.ids, "movie", raw.movie
        );
        item.favorite = true;
        item.favorited_at = raw.listed_at;
      }
    }

    // Ratings
    if (this.settings.syncRatings) {
      const items = await fetchRatings("movies", clientId, accessToken);
      for (const raw of items) {
        if (!raw.movie) continue;
        const item = getOrCreateItem(
          map, raw.movie.ids, "movie", raw.movie
        );
        item.my_rating = raw.rating;
        item.rated_at = raw.rated_at;
      }
    }
  }

  /**
   * Fetch from all enabled sources for shows and merge into the map.
   */
  private async fetchAndMergeShows(
    map: Map<number, NormalizedItem>
  ): Promise<void> {
    const { clientId, accessToken } = this.settings;

    // Watchlist
    if (this.settings.syncWatchlist) {
      const items = await fetchWatchlist("shows", clientId, accessToken);
      for (const raw of items) {
        if (!raw.show) continue;
        const item = getOrCreateItem(
          map, raw.show.ids, "show", undefined, raw.show
        );
        item.watchlist = true;
        item.watchlist_added_at = raw.listed_at;
      }
    }

    // Watched
    if (this.settings.syncWatched) {
      const items = await fetchWatchedShows(clientId, accessToken);
      for (const raw of items) {
        const item = getOrCreateItem(
          map, raw.show.ids, "show", undefined, raw.show
        );
        item.watched = true;
        item.plays = raw.plays;
        item.last_watched_at = raw.last_watched_at;
        // Count total episodes watched from seasons data
        if (raw.seasons) {
          let count = 0;
          for (const season of raw.seasons) {
            count += season.episodes.length;
          }
          item.episodes_watched = count;
        }
      }
    }

    // Favorites
    if (this.settings.syncFavorites) {
      const items = await fetchFavorites("shows", clientId, accessToken);
      for (const raw of items) {
        if (!raw.show) continue;
        const item = getOrCreateItem(
          map, raw.show.ids, "show", undefined, raw.show
        );
        item.favorite = true;
        item.favorited_at = raw.listed_at;
      }
    }

    // Ratings
    if (this.settings.syncRatings) {
      const items = await fetchRatings("shows", clientId, accessToken);
      for (const raw of items) {
        if (!raw.show) continue;
        const item = getOrCreateItem(
          map, raw.show.ids, "show", undefined, raw.show
        );
        item.my_rating = raw.rating;
        item.rated_at = raw.rated_at;
      }
    }
  }

  /**
   * Reconcile merged items against the vault for a given type (movies or shows).
   */
  private async reconcileType(
    mergedItems: Map<number, NormalizedItem>,
    folderPath: string,
    result: SyncResult
  ): Promise<void> {
    await ensureFolder(this.app, folderPath);

    const localNotes = await scanExistingNotes(
      this.app,
      folderPath,
      this.settings.propertyPrefix
    );

    // Create or update
    for (const [traktId, item] of mergedItems) {
      try {
        // Fetch poster if TMDB key is configured
        if (this.settings.tmdbApiKey && item.ids.tmdb) {
          const posterFn =
            item.type === "movie" ? fetchMoviePosterUrl : fetchTvPosterUrl;
          item.poster_url = await posterFn(
            item.ids.tmdb,
            this.settings.tmdbApiKey,
            this.settings.posterSize
          );
        }

        const existingFile = localNotes.get(traktId);

        if (!existingFile) {
          // CREATE
          const filename = buildFilename(
            item,
            this.settings.filenameTemplate
          );
          const filePath = `${folderPath}/${filename}.md`;
          const content = renderNote(item, this.settings);
          await this.app.vault.create(filePath, content);
          result.added++;
        } else {
          // UPDATE
          if (this.settings.overwriteExisting) {
            const content = renderNote(item, this.settings);
            await this.app.vault.modify(existingFile, content);
          } else {
            // Frontmatter-only update: preserve the body
            const existingContent = await this.app.vault.read(existingFile);
            const { body } = parseFrontmatter(existingContent);
            const newFrontmatter = renderFrontmatterOnly(
              item,
              this.settings
            );
            const newContent = `---\n${newFrontmatter}\n---\n${body}`;
            await this.app.vault.modify(existingFile, newContent);
          }
          result.updated++;
        }
      } catch (e) {
        result.failed++;
        result.errors.push(
          `Failed to sync "${item.title}": ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }

    // Remove notes that are no longer in ANY synced source
    if (this.settings.deleteRemovedItems) {
      for (const [traktId, file] of localNotes) {
        if (!mergedItems.has(traktId)) {
          try {
            await this.app.vault.trash(file, true);
            result.removed++;
          } catch (e) {
            result.failed++;
            result.errors.push(
              `Failed to remove "${file.name}": ${e instanceof Error ? e.message : String(e)}`
            );
          }
        }
      }
    }
  }
}
