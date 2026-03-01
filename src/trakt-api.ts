import { requestUrl } from "obsidian";
import type {
  TraktDeviceCodeResponse,
  TraktTokenResponse,
  TraktWatchlistItem,
} from "./types";

const TRAKT_BASE = "https://api.trakt.tv";

export class TraktApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public isRetryable: boolean
  ) {
    super(message);
    this.name = "TraktApiError";
  }
}

function traktHeaders(clientId: string, accessToken?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": clientId,
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  return headers;
}

/**
 * Request a device code for the device auth flow.
 */
export async function requestDeviceCode(
  clientId: string
): Promise<TraktDeviceCodeResponse> {
  const resp = await requestUrl({
    url: `${TRAKT_BASE}/oauth/device/code`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId }),
  });

  if (resp.status !== 200) {
    throw new TraktApiError(
      `Device code request failed: ${resp.status}`,
      resp.status,
      false
    );
  }

  return resp.json as TraktDeviceCodeResponse;
}

/**
 * Poll for an access token during device auth.
 * Returns null if the user hasn't authorized yet (400),
 * throws on other errors.
 */
export async function pollDeviceToken(
  deviceCode: string,
  clientId: string,
  clientSecret: string
): Promise<TraktTokenResponse | null> {
  const resp = await requestUrl({
    url: `${TRAKT_BASE}/oauth/device/token`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: deviceCode,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    throw: false,
  });

  if (resp.status === 200) {
    return resp.json as TraktTokenResponse;
  }
  if (resp.status === 400) {
    // User hasn't authorized yet — keep polling
    return null;
  }
  if (resp.status === 404) {
    throw new TraktApiError("Invalid device code.", 404, false);
  }
  if (resp.status === 409) {
    throw new TraktApiError("User denied authorization.", 409, false);
  }
  if (resp.status === 410) {
    throw new TraktApiError("Device code expired.", 410, false);
  }
  if (resp.status === 418) {
    throw new TraktApiError("User denied authorization.", 418, false);
  }
  if (resp.status === 429) {
    throw new TraktApiError("Polling too fast.", 429, true);
  }
  throw new TraktApiError(
    `Token poll failed: ${resp.status}`,
    resp.status,
    false
  );
}

/**
 * Refresh an expired access token.
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<TraktTokenResponse> {
  const resp = await requestUrl({
    url: `${TRAKT_BASE}/oauth/token`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
      grant_type: "refresh_token",
    }),
  });

  if (resp.status !== 200) {
    throw new TraktApiError(
      `Token refresh failed: ${resp.status}`,
      resp.status,
      false
    );
  }

  return resp.json as TraktTokenResponse;
}

/**
 * Fetch all watchlist items of a given type, handling pagination.
 */
export async function fetchWatchlist(
  type: "movies" | "shows",
  clientId: string,
  accessToken: string
): Promise<TraktWatchlistItem[]> {
  const items: TraktWatchlistItem[] = [];
  let page = 1;

  while (true) {
    const url = `${TRAKT_BASE}/sync/watchlist/${type}?extended=full&page=${page}&limit=100`;
    const resp = await requestUrl({
      url,
      method: "GET",
      headers: traktHeaders(clientId, accessToken),
      throw: false,
    });

    if (resp.status === 429) {
      throw new TraktApiError(
        "Trakt rate limit reached. Try again in a few minutes.",
        429,
        true
      );
    }
    if (resp.status === 401) {
      throw new TraktApiError(
        "Trakt session expired. Please reconnect.",
        401,
        false
      );
    }
    if (resp.status >= 500) {
      throw new TraktApiError(
        "Trakt is experiencing issues. Try again later.",
        resp.status,
        true
      );
    }
    if (resp.status !== 200) {
      throw new TraktApiError(
        `Watchlist fetch failed: ${resp.status}`,
        resp.status,
        false
      );
    }

    const pageItems = resp.json as TraktWatchlistItem[];
    items.push(...pageItems);

    // Check pagination headers
    const pageCount = parseInt(
      resp.headers["x-pagination-page-count"] || "1",
      10
    );
    if (page >= pageCount) break;
    page++;
  }

  return items;
}
