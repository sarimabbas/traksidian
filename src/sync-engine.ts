import { App, Notice, TFile, TFolder } from "obsidian";
import type { TraktWatchlistSettings } from "./settings";
import type {
  TraktWatchlistItem,
  NormalizedWatchlistItem,
  SyncResult,
} from "./types";
import { fetchWatchlist } from "./trakt-api";
import { fetchMoviePosterUrl, fetchTvPosterUrl } from "./tmdb-api";
import { ensureValidToken } from "./trakt-auth";
import { renderNote, renderFrontmatterOnly } from "./note-renderer";
import { sanitizeFilename, renderTemplate, parseFrontmatter } from "./utils";

/**
 * Normalize a raw Trakt watchlist item into a flat structure.
 */
function normalize(raw: TraktWatchlistItem): NormalizedWatchlistItem {
  if (raw.type === "movie" && raw.movie) {
    const m = raw.movie;
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
      listed_at: raw.listed_at,
      tagline: m.tagline,
      released: m.released,
    };
  } else if (raw.type === "show" && raw.show) {
    const s = raw.show;
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
      listed_at: raw.listed_at,
      network: s.network,
      aired_episodes: s.aired_episodes,
      first_aired: s.first_aired,
    };
  }

  // Fallback (shouldn't happen)
  throw new Error(`Unknown watchlist item type: ${raw.type}`);
}

/**
 * Ensure a folder exists in the vault, creating it if necessary.
 */
async function ensureFolder(app: App, path: string): Promise<void> {
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFolder) return;
  if (!existing) {
    await app.vault.createFolder(path);
  }
}

/**
 * Build the filename for a watchlist item based on the template.
 */
function buildFilename(
  item: NormalizedWatchlistItem,
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
 * Build a map of trakt_id -> TFile for all existing notes in a folder.
 */
async function scanExistingNotes(
  app: App,
  folderPath: string
): Promise<Map<number, TFile>> {
  const map = new Map<number, TFile>();
  const folder = app.vault.getAbstractFileByPath(folderPath);
  if (!(folder instanceof TFolder)) return map;

  for (const child of folder.children) {
    if (!(child instanceof TFile) || child.extension !== "md") continue;
    const content = await app.vault.cachedRead(child);
    const { frontmatter } = parseFrontmatter(content);
    const traktId = parseInt(frontmatter["trakt_id"], 10);
    if (!isNaN(traktId)) {
      map.set(traktId, child);
    }
  }

  return map;
}

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

      // 2. Fetch watchlist items from Trakt
      const allItems: NormalizedWatchlistItem[] = [];

      if (this.settings.syncMovies) {
        const rawMovies = await fetchWatchlist(
          "movies",
          this.settings.clientId,
          this.settings.accessToken
        );
        allItems.push(...rawMovies.map(normalize));
      }

      if (this.settings.syncShows) {
        const rawShows = await fetchWatchlist(
          "shows",
          this.settings.clientId,
          this.settings.accessToken
        );
        allItems.push(...rawShows.map(normalize));
      }

      // 3. Build remote map
      const remoteMovies = new Map<number, NormalizedWatchlistItem>();
      const remoteShows = new Map<number, NormalizedWatchlistItem>();

      for (const item of allItems) {
        if (item.type === "movie") {
          remoteMovies.set(item.ids.trakt, item);
        } else {
          remoteShows.set(item.ids.trakt, item);
        }
      }

      // 4. Process movies
      if (this.settings.syncMovies) {
        await this.syncType(
          remoteMovies,
          this.settings.movieFolder,
          result
        );
      }

      // 5. Process shows
      if (this.settings.syncShows) {
        await this.syncType(
          remoteShows,
          this.settings.showFolder,
          result
        );
      }

      // 6. Show result
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

  private async syncType(
    remoteItems: Map<number, NormalizedWatchlistItem>,
    folderPath: string,
    result: SyncResult
  ): Promise<void> {
    // Ensure folder exists
    await ensureFolder(this.app, folderPath);

    // Scan existing notes
    const localNotes = await scanExistingNotes(this.app, folderPath);

    // Compute TO_CREATE and TO_UPDATE
    for (const [traktId, item] of remoteItems) {
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

    // Compute TO_REMOVE
    if (this.settings.deleteRemovedItems) {
      for (const [traktId, file] of localNotes) {
        if (!remoteItems.has(traktId)) {
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
