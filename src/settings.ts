import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type TraksidianPlugin from "./main";

export const POSTER_SIZES = [
  "w92",
  "w154",
  "w185",
  "w342",
  "w500",
  "w780",
  "original",
] as const;

export type PosterSize = (typeof POSTER_SIZES)[number];

export interface TraksidianSettings {
  // Authentication
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number;

  // TMDB
  tmdbApiKey: string;
  posterSize: PosterSize;

  // Property namespace
  propertyPrefix: string;

  // Folders & file naming
  folder: string;
  filenameTemplate: string;

  // Note templates
  movieNoteTemplate: string;
  showNoteTemplate: string;
  tagPrefix: string;

  // Sync sources
  syncWatchlist: boolean;
  syncFavorites: boolean;
  syncWatched: boolean;
  syncRatings: boolean;

  // Sync behavior
  syncMovies: boolean;
  syncShows: boolean;
  autoSyncEnabled: boolean;
  autoSyncIntervalMinutes: number;
  syncOnStartup: boolean;
  overwriteExisting: boolean;
  deleteRemovedItems: boolean;
}

export const DEFAULT_MOVIE_TEMPLATE = `# {{title}} ({{year}})

![poster]({{poster_url}})

> {{tagline}}

## Overview
{{overview}}

## Details
- **Runtime**: {{runtime}} min
- **Genres**: {{genres}}
- **Rating**: {{trakt_rating}}/10 ({{trakt_votes}} votes)
- **Certification**: {{certification}}
- **Released**: {{released}}

## Trakt Status
- **Watchlist**: {{watchlist}}
- **Watched**: {{watched}} ({{plays}} plays, last: {{last_watched_at}})
- **Favorite**: {{favorite}}
- **My Rating**: {{my_rating}}/10

## Links
- [Trakt]({{trakt_url}})
- [IMDB]({{imdb_url}})

## My Notes

`;

export const DEFAULT_SHOW_TEMPLATE = `# {{title}} ({{year}})

![poster]({{poster_url}})

## Overview
{{overview}}

## Details
- **Network**: {{network}}
- **Runtime**: {{runtime}} min per episode
- **Episodes**: {{aired_episodes}} aired
- **Genres**: {{genres}}
- **Rating**: {{trakt_rating}}/10 ({{trakt_votes}} votes)
- **Certification**: {{certification}}
- **Status**: {{status}}
- **First Aired**: {{first_aired}}

## Trakt Status
- **Watchlist**: {{watchlist}}
- **Watched**: {{watched}} ({{plays}} plays, last: {{last_watched_at}})
- **Favorite**: {{favorite}}
- **My Rating**: {{my_rating}}/10

## Links
- [Trakt]({{trakt_url}})
- [IMDB]({{imdb_url}})

## My Notes

`;

export const DEFAULT_SETTINGS: TraksidianSettings = {
  clientId: "",
  clientSecret: "",
  accessToken: "",
  refreshToken: "",
  tokenExpiresAt: 0,

  tmdbApiKey: "",
  posterSize: "w500",

  propertyPrefix: "t_",

  folder: "Trakt",
  filenameTemplate: "{{title}} ({{year}})",

  movieNoteTemplate: DEFAULT_MOVIE_TEMPLATE,
  showNoteTemplate: DEFAULT_SHOW_TEMPLATE,
  tagPrefix: "trakt",

  syncWatchlist: true,
  syncFavorites: true,
  syncWatched: false,
  syncRatings: false,

  syncMovies: true,
  syncShows: true,
  autoSyncEnabled: false,
  autoSyncIntervalMinutes: 60,
  syncOnStartup: false,
  overwriteExisting: false,
  deleteRemovedItems: false,
};

export class TraksidianSettingTab extends PluginSettingTab {
  plugin: TraksidianPlugin;

  constructor(app: App, plugin: TraksidianPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── Authentication ──
    containerEl.createEl("h3", { text: "Authentication" });

    new Setting(containerEl)
      .setName("Trakt Client ID")
      .setDesc("Create an app at trakt.tv/oauth/applications to get this.")
      .addText((text) =>
        text
          .setPlaceholder("Paste your Trakt Client ID")
          .setValue(this.plugin.settings.clientId)
          .onChange(async (value) => {
            this.plugin.settings.clientId = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Trakt Client Secret")
      .setDesc("From the same Trakt application page.")
      .addText((text) =>
        text
          .setPlaceholder("Paste your Trakt Client Secret")
          .setValue(this.plugin.settings.clientSecret)
          .onChange(async (value) => {
            this.plugin.settings.clientSecret = value.trim();
            await this.plugin.saveSettings();
          })
      );

    const connectionSetting = new Setting(containerEl).setName(
      "Connection status"
    );

    if (this.plugin.settings.accessToken) {
      connectionSetting.setDesc("Connected to Trakt.");
      connectionSetting.addButton((btn) =>
        btn
          .setButtonText("Disconnect")
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.accessToken = "";
            this.plugin.settings.refreshToken = "";
            this.plugin.settings.tokenExpiresAt = 0;
            await this.plugin.saveSettings();
            new Notice("Disconnected from Trakt.");
            this.display();
          })
      );
    } else {
      connectionSetting.setDesc("Not connected.");
      connectionSetting.addButton((btn) =>
        btn
          .setButtonText("Connect to Trakt")
          .setCta()
          .onClick(async () => {
            if (
              !this.plugin.settings.clientId ||
              !this.plugin.settings.clientSecret
            ) {
              new Notice(
                "Please enter your Trakt Client ID and Secret first."
              );
              return;
            }
            await this.plugin.startAuth();
            this.display();
          })
      );
    }

    // ── TMDB (Poster Images) ──
    containerEl.createEl("h3", { text: "TMDB (Poster Images)" });

    new Setting(containerEl)
      .setName("TMDB API key")
      .setDesc(
        "Optional. Get a free key at themoviedb.org/settings/api. If blank, poster images are skipped."
      )
      .addText((text) =>
        text
          .setPlaceholder("Paste your TMDB API key")
          .setValue(this.plugin.settings.tmdbApiKey)
          .onChange(async (value) => {
            this.plugin.settings.tmdbApiKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Poster size")
      .setDesc("Image size for poster URLs embedded in notes.")
      .addDropdown((dd) => {
        for (const size of POSTER_SIZES) {
          dd.addOption(size, size);
        }
        dd.setValue(this.plugin.settings.posterSize);
        dd.onChange(async (value) => {
          this.plugin.settings.posterSize = value as PosterSize;
          await this.plugin.saveSettings();
        });
      });

    // ── Property Namespace ──
    containerEl.createEl("h3", { text: "Property Namespace" });

    new Setting(containerEl)
      .setName("Property prefix")
      .setDesc(
        'Prefixes all frontmatter properties from this plugin. E.g. "t_" → t_title, t_watched. Set to "" for no prefix.'
      )
      .addText((text) =>
        text
          .setPlaceholder("t_")
          .setValue(this.plugin.settings.propertyPrefix)
          .onChange(async (value) => {
            this.plugin.settings.propertyPrefix = value;
            await this.plugin.saveSettings();
          })
      );

    // ── Folders & File Naming ──
    containerEl.createEl("h3", { text: "Folders & File Naming" });

    new Setting(containerEl)
      .setName("Notes folder")
      .setDesc("Vault path where all Trakt notes are created. Movies and shows are distinguished by t_type frontmatter and tags.")
      .addText((text) =>
        text
          .setPlaceholder("Trakt")
          .setValue(this.plugin.settings.folder)
          .onChange(async (value) => {
            this.plugin.settings.folder = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Filename template")
      .setDesc(
        "Variables: {{title}}, {{year}}, {{imdb_id}}, {{trakt_id}}."
      )
      .addText((text) =>
        text
          .setPlaceholder("{{title}} ({{year}})")
          .setValue(this.plugin.settings.filenameTemplate)
          .onChange(async (value) => {
            this.plugin.settings.filenameTemplate = value;
            await this.plugin.saveSettings();
          })
      );

    // ── Note Templates ──
    containerEl.createEl("h3", { text: "Note Templates" });

    new Setting(containerEl)
      .setName("Tag prefix")
      .setDesc(
        'Prefix for auto-generated tags. E.g. "trakt" → #trakt/movie, #trakt/genre/action.'
      )
      .addText((text) =>
        text
          .setPlaceholder("trakt")
          .setValue(this.plugin.settings.tagPrefix)
          .onChange(async (value) => {
            this.plugin.settings.tagPrefix = value.trim();
            await this.plugin.saveSettings();
          })
      );

    const movieTemplateSetting = new Setting(containerEl)
      .setName("Movie note template")
      .setDesc("Template for the body of movie notes. Uses {{variable}} syntax.");
    movieTemplateSetting.addTextArea((ta) => {
      ta.inputEl.rows = 12;
      ta.inputEl.cols = 60;
      ta.setValue(this.plugin.settings.movieNoteTemplate).onChange(
        async (value) => {
          this.plugin.settings.movieNoteTemplate = value;
          await this.plugin.saveSettings();
        }
      );
    });
    movieTemplateSetting.addButton((btn) =>
      btn.setButtonText("Reset to default").onClick(async () => {
        this.plugin.settings.movieNoteTemplate = DEFAULT_MOVIE_TEMPLATE;
        await this.plugin.saveSettings();
        this.display();
      })
    );

    const showTemplateSetting = new Setting(containerEl)
      .setName("TV show note template")
      .setDesc(
        "Template for the body of TV show notes. Uses {{variable}} syntax."
      );
    showTemplateSetting.addTextArea((ta) => {
      ta.inputEl.rows = 12;
      ta.inputEl.cols = 60;
      ta.setValue(this.plugin.settings.showNoteTemplate).onChange(
        async (value) => {
          this.plugin.settings.showNoteTemplate = value;
          await this.plugin.saveSettings();
        }
      );
    });
    showTemplateSetting.addButton((btn) =>
      btn.setButtonText("Reset to default").onClick(async () => {
        this.plugin.settings.showNoteTemplate = DEFAULT_SHOW_TEMPLATE;
        await this.plugin.saveSettings();
        this.display();
      })
    );

    // ── Sync Sources ──
    containerEl.createEl("h3", { text: "Sync Sources" });

    new Setting(containerEl)
      .setName("Sync watchlist")
      .setDesc("Items you want to watch.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncWatchlist)
          .onChange(async (value) => {
            this.plugin.settings.syncWatchlist = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Sync favorites")
      .setDesc("Items you've marked as favorites.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncFavorites)
          .onChange(async (value) => {
            this.plugin.settings.syncFavorites = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Sync watch history")
      .setDesc("Items you've watched. Adds play count and last watched date. Can be large.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncWatched)
          .onChange(async (value) => {
            this.plugin.settings.syncWatched = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Sync ratings")
      .setDesc("Items you've rated (1–10 scale).")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncRatings)
          .onChange(async (value) => {
            this.plugin.settings.syncRatings = value;
            await this.plugin.saveSettings();
          })
      );

    // ── Sync Behavior ──
    containerEl.createEl("h3", { text: "Sync Behavior" });

    new Setting(containerEl)
      .setName("Sync movies")
      .setDesc("Include movies.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncMovies)
          .onChange(async (value) => {
            this.plugin.settings.syncMovies = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Sync TV shows")
      .setDesc("Include TV shows.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncShows)
          .onChange(async (value) => {
            this.plugin.settings.syncShows = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Sync on startup")
      .setDesc("Automatically sync when Obsidian starts.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncOnStartup)
          .onChange(async (value) => {
            this.plugin.settings.syncOnStartup = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto-sync")
      .setDesc("Periodically sync in the background.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoSyncEnabled)
          .onChange(async (value) => {
            this.plugin.settings.autoSyncEnabled = value;
            await this.plugin.saveSettings();
            this.plugin.configureAutoSync();
            this.display();
          })
      );

    if (this.plugin.settings.autoSyncEnabled) {
      new Setting(containerEl)
        .setName("Auto-sync interval (minutes)")
        .setDesc("How often to sync. Minimum 5 minutes.")
        .addSlider((slider) =>
          slider
            .setLimits(5, 360, 5)
            .setValue(this.plugin.settings.autoSyncIntervalMinutes)
            .setDynamicTooltip()
            .onChange(async (value) => {
              this.plugin.settings.autoSyncIntervalMinutes = value;
              await this.plugin.saveSettings();
              this.plugin.configureAutoSync();
            })
        );
    }

    new Setting(containerEl)
      .setName("Overwrite existing note body")
      .setDesc(
        "When off, only frontmatter is updated and your notes below are preserved. When on, the full note is regenerated from the template."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.overwriteExisting)
          .onChange(async (value) => {
            this.plugin.settings.overwriteExisting = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Remove notes for deleted items")
      .setDesc(
        "When on, notes for items removed from all synced Trakt sources are moved to trash."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.deleteRemovedItems)
          .onChange(async (value) => {
            this.plugin.settings.deleteRemovedItems = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
