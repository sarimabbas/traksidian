# Traksidian — User Manual

## 1. What it does

Traksidian is an Obsidian plugin that pulls your [Trakt.tv](https://trakt.tv) data and creates one Markdown note per movie or TV show in your vault. Each note contains:

- **Frontmatter** — structured metadata (title, year, genres, ratings, watch status, Trakt/IMDB/TMDB IDs, poster URL, sync timestamp)
- **Body** — rendered from a customizable template with `{{variable}}` placeholders
- **Tags** — automatically generated from the type, genres, and sync sources

Movies and shows live in the same folder and are distinguished by the `t_type` frontmatter field (`movie` or `show`) and tags like `#trakt/movie` / `#trakt/show`. Dataview queries can filter by either.

---

## 2. Installation (manual)

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. In your vault, create the folder `.obsidian/plugins/traksidian/`.
3. Copy the three files into that folder.
4. Open Obsidian → Settings → Community plugins → enable **Traksidian**.

> The plugin is not yet listed in the Obsidian community plugin registry. Until then, manual installation is required.

---

## 3. Initial setup

### 3a. Create a Trakt application

1. Sign in to [trakt.tv](https://trakt.tv) and go to **Settings → Your API Apps → New Application**.
2. Give it any name (e.g. "Traksidian").
3. For **Redirect URI**, enter `urn:ietf:wg:oauth:2.0:oob`.
4. Save. Copy the **Client ID** and **Client Secret**.

### 3b. (Optional) Get a TMDB API key

Poster images are fetched from [The Movie Database](https://themoviedb.org). A free API key is sufficient.

1. Create an account at themoviedb.org.
2. Go to **Settings → API → Create → Developer**.
3. Copy the **API Key (v3 auth)**.

---

## 4. Authentication flow

1. Open **Settings → Traksidian**.
2. Paste your **Trakt Client ID** and **Client Secret**.
3. Click **Connect to Trakt**. A modal opens showing a URL and a short device code.
4. Visit the URL in a browser, enter the code, and approve access.
5. The modal polls Trakt and closes automatically once authorized.
6. The Connection status field will show "Connected to Trakt."

To revoke access, click **Disconnect** in the settings tab or run the command **Traksidian: Disconnect account**.

---

## 5. Settings reference

### Authentication

| Setting | Description |
|---|---|
| Trakt Client ID | From your Trakt API application. |
| Trakt Client Secret | From the same application page. |
| Connection status | Shows current state; buttons to connect or disconnect. |

### TMDB (Poster Images)

| Setting | Default | Description |
|---|---|---|
| TMDB API key | _(blank)_ | Optional. Leave blank to skip poster images. |
| Poster size | `w500` | Image width variant fetched from TMDB. Options: w92, w154, w185, w342, w500, w780, original. |

### Property Namespace

| Setting | Default | Description |
|---|---|---|
| Property prefix | `t_` | Prepended to all frontmatter keys written by the plugin (e.g. `t_title`, `t_watched`). Set to `""` for no prefix. |

### Folders & File Naming

| Setting | Default | Description |
|---|---|---|
| Notes folder | `Trakt` | Vault path where all notes are created. The folder is created automatically if missing. |
| Filename template | `{{title}} ({{year}})` | Template for the note filename. Variables: `{{title}}`, `{{year}}`, `{{imdb_id}}`, `{{trakt_id}}`. |

### Note Templates

| Setting | Default | Description |
|---|---|---|
| Tag prefix | `trakt` | Prefix for auto-generated tags (e.g. `trakt` → `#trakt/movie`, `#trakt/genre/action`). |
| Movie note template | _(see below)_ | Markdown template for the body of movie notes. |
| TV show note template | _(see below)_ | Markdown template for the body of TV show notes. |

### Sync Sources

| Setting | Default | Description |
|---|---|---|
| Sync watchlist | on | Items on your Trakt watchlist (things you want to watch). |
| Sync favorites | on | Items you've marked as favorites. |
| Sync watch history | off | Items you've watched. Adds play count and last-watched date. Can be a large dataset. |
| Sync ratings | off | Items you've rated (1–10). |

### Sync Behavior

| Setting | Default | Description |
|---|---|---|
| Sync movies | on | Include movies in the sync. |
| Sync TV shows | on | Include TV shows in the sync. |
| Sync on startup | off | Automatically run a sync when Obsidian loads. |
| Auto-sync | off | Periodically sync in the background. |
| Auto-sync interval | 60 min | How often to auto-sync (5–360 minutes). Visible only when auto-sync is on. |
| Overwrite existing note body | off | When **off**, only frontmatter is updated and the body of existing notes is preserved. When **on**, the full note is regenerated from the template on every sync. |
| Remove notes for deleted items | off | When **on**, notes for items no longer present in any enabled sync source are moved to the system trash. |

---

## 6. Note format

### Frontmatter fields

All fields below are prefixed with the configured **Property prefix** (default `t_`).

| Field | Type | Description |
|---|---|---|
| `t_title` | string | Title of the movie or show. |
| `t_year` | number | Release year. |
| `t_type` | `movie` \| `show` | Content type. |
| `t_id` | number | Trakt numeric ID. |
| `t_slug` | string | Trakt URL slug. |
| `t_imdb_id` | string | IMDB ID (e.g. `tt1234567`). |
| `t_tmdb_id` | number | TMDB numeric ID. |
| `t_tvdb_id` | number | TVDB ID (shows only). |
| `t_genres` | list | Genre list. |
| `t_runtime` | number | Runtime in minutes (per episode for shows). |
| `t_certification` | string | Age certification (e.g. `PG-13`). |
| `t_rating` | number | Trakt community rating (0–10). |
| `t_votes` | number | Number of Trakt votes. |
| `t_country` | string | Country of origin code. |
| `t_language` | string | Primary language code. |
| `t_status` | string | Status (e.g. `released`, `ended`, `returning series`). |
| `t_overview` | string | Plot summary. |
| `t_released` | string | Release date (movies only, YYYY-MM-DD). |
| `t_tagline` | string | Tagline (movies only). |
| `t_network` | string | Broadcasting network (shows only). |
| `t_aired_episodes` | number | Total aired episodes (shows only). |
| `t_first_aired` | string | First air date (shows only, YYYY-MM-DD). |
| `t_watchlist` | boolean | Present if synced from watchlist. |
| `t_watchlist_added_at` | string | ISO timestamp when added to watchlist. |
| `t_watched` | boolean | Present if synced from watch history. |
| `t_plays` | number | Number of times watched/played. |
| `t_last_watched_at` | string | ISO timestamp of last watch. |
| `t_episodes_watched` | number | Total episodes watched (shows only). |
| `t_favorite` | boolean | Present if synced from favorites. |
| `t_favorited_at` | string | ISO timestamp when favorited. |
| `t_my_rating` | number | Your personal rating (1–10). |
| `t_rated_at` | string | ISO timestamp when rated. |
| `t_url` | string | Trakt page URL. |
| `t_imdb_url` | string | IMDB page URL. |
| `t_poster_url` | string | TMDB poster image URL. |
| `t_synced_at` | string | ISO timestamp of last sync. |
| `tags` | list | Auto-generated tags (see below). |

### Auto-generated tags

With the default tag prefix `trakt`:

- `#trakt/movie` or `#trakt/show`
- `#trakt/genre/<genre>` for each genre
- `#trakt/watchlist` if on your watchlist
- `#trakt/watched` if you've watched it
- `#trakt/favorite` if favorited
- `#trakt/rated` if you've rated it

### Template variables

The note body template uses `{{variable}}` syntax. Available variables:

| Variable | Description |
|---|---|
| `{{title}}` | Title |
| `{{year}}` | Release year |
| `{{type}}` | `movie` or `show` |
| `{{overview}}` | Plot summary |
| `{{genres}}` | Comma-separated genre list |
| `{{runtime}}` | Runtime in minutes |
| `{{trakt_rating}}` | Community rating |
| `{{trakt_votes}}` | Vote count |
| `{{certification}}` | Age certification |
| `{{country}}` | Country code |
| `{{language}}` | Language code |
| `{{status}}` | Release/air status |
| `{{trakt_id}}` | Trakt numeric ID |
| `{{trakt_slug}}` | Trakt slug |
| `{{imdb_id}}` | IMDB ID |
| `{{tmdb_id}}` | TMDB ID |
| `{{tvdb_id}}` | TVDB ID |
| `{{trakt_url}}` | Trakt URL |
| `{{imdb_url}}` | IMDB URL |
| `{{poster_url}}` | Poster image URL |
| `{{tagline}}` | Tagline (movies) |
| `{{released}}` | Release date (movies) |
| `{{network}}` | Network (shows) |
| `{{aired_episodes}}` | Aired episode count (shows) |
| `{{first_aired}}` | First air date (shows) |
| `{{watchlist}}` | `true` if on watchlist |
| `{{watchlist_added_at}}` | Watchlist add date |
| `{{watched}}` | `true` if watched |
| `{{plays}}` | Play count |
| `{{last_watched_at}}` | Last watched date |
| `{{episodes_watched}}` | Episodes watched (shows) |
| `{{favorite}}` | `true` if favorited |
| `{{favorited_at}}` | Favorited date |
| `{{my_rating}}` | Your rating (1–10) |
| `{{rated_at}}` | Rated date |

---

## 7. Sync behavior

### Create vs. update

- **New item** (no existing note with matching `t_type` + `t_id`): a note is created using the full template.
- **Existing item**: behavior depends on the **Overwrite existing note body** setting:
  - **Off** (default): only the frontmatter block is replaced; everything below `---` is left untouched, so your personal notes are preserved.
  - **On**: the entire note (frontmatter + body) is regenerated from the template.

### Delete

When **Remove notes for deleted items** is enabled, any note whose composite `type:id` is no longer found in any enabled sync source is moved to the system trash at the end of each sync.

### Running a sync

- **Manual**: ribbon icon, or command **Traksidian: Sync watchlist**.
- **On startup**: enable **Sync on startup** in settings (runs 5 seconds after Obsidian loads).
- **Scheduled**: enable **Auto-sync** and set an interval.

### Dataview example queries

Filter by type:
```dataview
TABLE t_year, t_rating, t_watched
FROM "Trakt"
WHERE t_type = "movie"
SORT t_rating DESC
```

Show only favorites:
```dataview
TABLE t_year, t_my_rating
FROM "Trakt"
WHERE t_favorite = true
SORT t_my_rating DESC
```
