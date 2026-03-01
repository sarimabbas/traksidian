import { Notice, Plugin } from "obsidian";
import {
  DEFAULT_SETTINGS,
  TraktWatchlistSettingTab,
  type TraktWatchlistSettings,
} from "./settings";
import { AuthModal } from "./trakt-auth";
import { SyncEngine } from "./sync-engine";

export default class TraktWatchlistPlugin extends Plugin {
  settings: TraktWatchlistSettings = DEFAULT_SETTINGS;
  private syncEngine!: SyncEngine;
  private autoSyncIntervalId: number | null = null;
  private statusBarEl: HTMLElement | null = null;

  async onload() {
    await this.loadSettings();

    this.syncEngine = new SyncEngine(
      this.app,
      this.settings,
      () => this.saveSettings()
    );

    // Settings tab
    this.addSettingTab(new TraktWatchlistSettingTab(this.app, this));

    // Commands
    this.addCommand({
      id: "trakt-sync-watchlist",
      name: "Sync watchlist",
      callback: async () => {
        if (!this.settings.accessToken) {
          new Notice(
            "Not connected to Trakt. Use Settings or the command palette to connect."
          );
          return;
        }
        this.updateStatusBar("Syncing...");
        await this.syncEngine.sync();
        this.updateStatusBar("Connected");
      },
    });

    this.addCommand({
      id: "trakt-connect",
      name: "Connect account",
      callback: async () => {
        if (
          !this.settings.clientId ||
          !this.settings.clientSecret
        ) {
          new Notice(
            "Please configure your Trakt Client ID and Secret in settings first."
          );
          return;
        }
        await this.startAuth();
      },
    });

    this.addCommand({
      id: "trakt-disconnect",
      name: "Disconnect account",
      callback: async () => {
        this.settings.accessToken = "";
        this.settings.refreshToken = "";
        this.settings.tokenExpiresAt = 0;
        await this.saveSettings();
        new Notice("Disconnected from Trakt.");
        this.updateStatusBar("Not connected");
      },
    });

    // Ribbon icon
    this.addRibbonIcon("film", "Sync Trakt Watchlist", async () => {
      if (!this.settings.accessToken) {
        new Notice(
          "Not connected to Trakt. Use Settings or the command palette to connect."
        );
        return;
      }
      this.updateStatusBar("Syncing...");
      await this.syncEngine.sync();
      this.updateStatusBar("Connected");
    });

    // Status bar
    this.statusBarEl = this.addStatusBarItem();
    this.updateStatusBar(
      this.settings.accessToken ? "Connected" : "Not connected"
    );

    // Auto-sync
    this.configureAutoSync();

    // Sync on startup
    if (this.settings.syncOnStartup && this.settings.accessToken) {
      // Delay slightly to let Obsidian finish loading
      this.registerInterval(
        window.setTimeout(async () => {
          this.updateStatusBar("Syncing...");
          await this.syncEngine.sync();
          this.updateStatusBar("Connected");
        }, 5000)
      );
    }
  }

  onunload() {
    if (this.autoSyncIntervalId !== null) {
      window.clearInterval(this.autoSyncIntervalId);
      this.autoSyncIntervalId = null;
    }
  }

  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData()
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /**
   * Start the Trakt device auth flow.
   */
  async startAuth(): Promise<void> {
    const modal = new AuthModal(this.app, this.settings, async () => {
      await this.saveSettings();
      this.updateStatusBar("Connected");
    });
    modal.open();
  }

  /**
   * Configure or reconfigure the auto-sync interval.
   */
  configureAutoSync() {
    // Clear existing interval
    if (this.autoSyncIntervalId !== null) {
      window.clearInterval(this.autoSyncIntervalId);
      this.autoSyncIntervalId = null;
    }

    if (
      this.settings.autoSyncEnabled &&
      this.settings.accessToken
    ) {
      const intervalMs =
        this.settings.autoSyncIntervalMinutes * 60 * 1000;
      this.autoSyncIntervalId = window.setInterval(async () => {
        try {
          await this.syncEngine.sync();
        } catch (e) {
          console.error("Trakt auto-sync failed:", e);
        }
      }, intervalMs);
      // Register for cleanup
      this.registerInterval(this.autoSyncIntervalId);
    }
  }

  private updateStatusBar(status: string) {
    if (this.statusBarEl) {
      this.statusBarEl.setText(`Trakt: ${status}`);
    }
  }
}
