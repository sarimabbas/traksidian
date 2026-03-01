// ── Trakt API Response Types ──

export interface TraktIds {
  trakt: number;
  slug: string;
  imdb?: string;
  tmdb?: number;
  tvdb?: number;
}

export interface TraktMovie {
  title: string;
  year: number;
  ids: TraktIds;
  tagline?: string;
  overview?: string;
  released?: string;
  runtime?: number;
  country?: string;
  genres?: string[];
  rating?: number;
  votes?: number;
  certification?: string;
  language?: string;
  status?: string;
}

export interface TraktShow {
  title: string;
  year: number;
  ids: TraktIds;
  overview?: string;
  first_aired?: string;
  runtime?: number;
  certification?: string;
  network?: string;
  country?: string;
  genres?: string[];
  aired_episodes?: number;
  rating?: number;
  votes?: number;
  language?: string;
  status?: string;
}

export interface TraktWatchlistItem {
  rank: number;
  id: number;
  listed_at: string;
  notes: string | null;
  type: "movie" | "show";
  movie?: TraktMovie;
  show?: TraktShow;
}

export interface TraktDeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

export interface TraktTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  created_at: number;
}

// ── TMDB API Response Types ──

export interface TmdbMovieResponse {
  id: number;
  poster_path: string | null;
}

export interface TmdbTvResponse {
  id: number;
  poster_path: string | null;
}

// ── Internal Types ──

export type WatchlistItemType = "movie" | "show";

export interface NormalizedWatchlistItem {
  type: WatchlistItemType;
  title: string;
  year: number;
  ids: TraktIds;
  overview: string;
  genres: string[];
  runtime: number;
  rating: number;
  votes: number;
  certification: string;
  country: string;
  language: string;
  status: string;
  listed_at: string;
  // Movie-specific
  tagline?: string;
  released?: string;
  // Show-specific
  network?: string;
  aired_episodes?: number;
  first_aired?: string;
  // TMDB poster (populated during sync if TMDB key is set)
  poster_url?: string;
}

export interface SyncResult {
  added: number;
  updated: number;
  removed: number;
  failed: number;
  errors: string[];
}
