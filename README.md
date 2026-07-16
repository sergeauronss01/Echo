# Echo — Personal Music Manager

> A full-stack personal music acquisition and management system.
> Download songs from YouTube, identify tracks by audio, manage playlists,
> and browse your listening history — all from a single self-hosted web interface.

---

## Table of contents

1. [Project overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Directory structure](#3-directory-structure)
4. [Data flow walkthrough](#4-data-flow-walkthrough)
5. [External service connections](#5-external-service-connections)
6. [Database schema](#6-database-schema)
7. [API reference](#7-api-reference)
8. [Frontend architecture](#8-frontend-architecture)
9. [Audio fingerprinting pipeline](#9-audio-fingerprinting-pipeline)
10. [Metadata enrichment pipeline](#10-metadata-enrichment-pipeline)
11. [Authentication flow](#11-authentication-flow)
12. [Setup and running](#12-setup-and-running)
13. [Environment variables](#13-environment-variables)
14. [Known limitations](#14-known-limitations)

---

## 1. Project overview

Echo is a Node.js / Express backend paired with a vanilla-JavaScript single-page
frontend. It is designed to be run locally by a single user. There is no build step
— the frontend is plain ES modules served as static files.

**Core capabilities**

| Feature | How it works |
|---|---|
| Song download | yt-dlp (Python) downloads audio; file is uploaded to Supabase Storage |
| Batch download | One call triggers a serial pipeline for each query |
| Metadata enrichment | MusicBrainz + LRCLib called after every download |
| Audio fingerprinting | fpcalc (Chromaprint) or librosa; lookup via AcoustID |
| Playlist management | Full CRUD with reordering, stored in Supabase PostgreSQL |
| Listening history | Every play is logged; top-songs and recommendations derived from it |
| Google OAuth | Passport-free implementation using the `googleapis` SDK directly |

---

## 2. Architecture

```
Browser (Vanilla JS SPA)
        │  REST / JSON over HTTP
        ▼
┌───────────────────────────────────────────┐
│           Express server  (Node 20+)      │
│                                           │
│  Middleware stack                         │
│  ├─ Helmet  (CSP, security headers)       │
│  ├─ CORS                                  │
│  ├─ express-rate-limit (3 tiers)          │
│  ├─ JSON body parser  (50 MB limit)       │
│  └─ multer  (audio file uploads)          │
│                                           │
│  Route modules  (/api/*)                  │
│  ├─ /auth          JWT + Google OAuth     │
│  ├─ /users         Profile & stats        │
│  ├─ /songs         Browse & stream        │
│  ├─ /playlists     CRUD + reorder         │
│  ├─ /download      yt-dlp pipeline        │
│  ├─ /history       Play logging           │
│  └─ /fingerprinting  Identify audio       │
│                                           │
│  Services (shared logic)                  │
│  ├─ MusicBrainzService                    │
│  ├─ ScoringService                        │ 
│  ├─ AcoustIDService                       │
│  ├─ ChromaprintService  (wraps fpcalc)    │
│  └─ LrclibService                         │
│                                           │
│  Python subprocess                        │
│  └─ yt-dlp  (download)                    │
│  └─ essentia_fingerprint.py  (fallback)   │
└───────────────────────────────────────────┘
        │                      │
        ▼                      ▼
Supabase PostgreSQL      Supabase Storage
(all metadata,           (audio files:
 users, songs,           songs/audio/*.m4a)
 playlists, history)
        │
        ▼
External APIs (HTTPS)
├─ YouTube Data API v3
├─ MusicBrainz WS/2
├─ AcoustID API
├─ Cover Art Archive
└─ LRCLib API
```

The server and the browser both talk to Supabase PostgreSQL. The browser never
talks to Supabase directly — all DB writes go through the Express API. Audio
playback, however, streams directly from Supabase Storage to the browser without
proxying through Express, because the public URL is embedded in the song object
returned by the API.

---

## 3. Directory structure

```
Echo/
├── .env.example               # Template for all required environment variables
├── package.json               # Node dependencies (includes multer)
├── requirements.txt           # Python dependencies (yt-dlp, librosa, soundfile)
└── src/
    ├── api/                   # Express backend
    │   ├── server.js          # Entry point: middleware, routes, migration runner
    │   ├── config/
    │   │   ├── database.js    # pg.Pool factory; exports query(), getClient()
    │   │   └── environment.js # Startup validation of env vars and Python deps
    │   ├── middleware/
    │   │   ├── auth.middleware.js       # authenticate, requireAdmin, optional
    │   │   ├── error.middleware.js      # errorHandler, notFoundHandler, AppError
    │   │   └── validation.middleware.js # Joi schema runner, asyncHandler
    │   ├── migrations/        # SQL files run once in order at startup
    │   │   ├── 001_init_schema.sql
    │   │   ├── 002_add_musicbrainz_support.sql
    │   │   └── 003_add_user_role.sql
    │   ├── modules/           # Feature slices (routes + controller + service)
    │   │   ├── auth/
    │   │   ├── download/
    │   │   ├── fingerprinting/
    │   │   ├── history/
    │   │   ├── playlists/
    │   │   ├── songs/
    │   │   └── users/
    │   ├── services/          # Shared external-API clients
    │   │   ├── acoustid.service.js
    │   │   ├── chromaprint.service.js
    │   │   ├── lrclib.service.js
    │   │   ├── musicbrainz.service.js
    │   │   └── scoring.service.js
    │   └── utils/
    │       ├── jwt.utils.js       # Token generation and verification
    │       ├── runMigrations.js   # Migration runner with schema_migrations tracking
    │       └── validators.js      # Joi schemas for all request bodies
    └── web/                   # Static frontend (served by Express)
        ├── index.html
        ├── assets/            # SVG icons, fallback cover image
        ├── css/main.css
        └── js/
            ├── api.js             # All fetch calls; token refresh logic; normalizeSong
            ├── auth.js            # AuthManager: login, register, Google OAuth, profile
            ├── main.js            # Bootstrap, navigation wiring, global click delegation
            ├── player.js          # Audio element control, timeline, playback logging
            ├── ui.js              # All view renderers (home, search, library, history…)
            └── fingerprinting.js  # Fingerprint UI: upload, record, history
```

---

## 4. Data flow walkthrough

### Downloading and playing a song

```
User types "Daft Punk - Get Lucky" → clicks Start Download
                │
                ▼
POST /api/download/batch  { queries: ["Daft Punk - Get Lucky"] }
                │
                ▼
DownloadService.batchDownloadSongs()
  1. YouTube Data API search → videoId
  2. yt-dlp subprocess downloads audio to DOWNLOAD_DIR/<videoId>.m4a
  3. File read → uploaded to Supabase Storage (bucket: songs, path: audio/<videoId>.m4a)
  4. Local file deleted
  5. MusicBrainz search (title + artist) → scored candidates
     → if autoAccepted: use MB title/artist/album/year/coverUrl
     → else:            keep YouTube parsed title/artist, use YT thumbnail as cover
  6. LRCLib search → plain + synced lyrics stored in songs_lyrics table
  7. INSERT INTO songs (youtube_id, title, artist, file_path=<supabaseUrl>, ...)
  8. INSERT INTO user_songs (if authenticated)
                │
                ▼
Response: { results: [{ query, songId, url, success: true }] }
                │
                ▼
User clicks the song card
                │
                ▼
GET /api/songs/:id  →  song row including youtube_id
normalizeSong() builds:
  streamUrl = https://<project>.supabase.co/storage/v1/object/public/songs/audio/<youtube_id>.m4a
                │
                ▼
player.js sets audio.src = streamUrl → browser streams audio directly from Supabase
```

### Identifying a song by audio

```
User uploads/records audio → fingerprinting.js sends FormData (field: "audio")
                │
                ▼
POST /api/fingerprinting/upload (or /record)
multer saves temp file to OS tmpdir
                │
                ▼
FingerprintingService.uploadAndIdentify(filePath, userId)
  1. Try fpcalc (Chromaprint) → { fingerprint, duration, method: "chromaprint" }
     Fallback: Python essentia_fingerprint.py → { fingerprint_vector, method: "librosa" }
  2. AcoustID lookup (fingerprint + duration) → { matches, mbids, confidence }
  3. INSERT INTO fingerprint_matches (user_id, fingerprint, confidence)
  4. Temp file deleted
                │
                ▼
Response: { data: { fingerprint, identification: { matches, confidence } } }
                │
                ▼
Frontend displays matches with confidence bars and "Add to Library" buttons
```

---

## 5. External service connections

### Supabase (PostgreSQL + Storage)

**Purpose** — Primary database and audio file host.

**Connection (database)**
`src/api/config/database.js` creates a `pg.Pool` from `DATABASE_URL`
(the Supabase connection string). SSL is enabled with `rejectUnauthorized: false`
as required by Supabase.

**Connection (storage)**
`src/api/modules/download/download.service.js` calls `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`
from `@supabase/supabase-js`. The service role key is required for server-side
writes. Audio files land at `songs/audio/<videoId>.m4a` in the `songs` bucket.

**Audio playback** — The Supabase Storage public URL is embedded in every song
object. The browser streams audio directly from that URL; Express is not in the
loop for playback at all. The `songs` bucket must have public access enabled.

---

### YouTube Data API v3

**Purpose** — Search for the best-matching video ID for a query string, and fetch
video title / description / duration for metadata parsing.

**Connection**
`googleapis` SDK initialised in `download.service.js`:
```js
const YT_API = google.youtube({ version: 'v3', auth: process.env.YT_API_KEY });
```
Two calls per download: `search.list` (1 unit) and `videos.list` (1 unit).
Free quota: 10 000 units/day. At 2 units/song that is 5 000 songs/day before hitting the limit.

**Obtaining a key**
Google Cloud Console → Enable "YouTube Data API v3" → Create API Key → restrict to
your server IP in production.

---

### MusicBrainz

**Purpose** — Enrich parsed YouTube metadata with canonical title, artist credits,
album, release year, and cover art URL.

**Connection**
`src/api/services/musicbrainz.service.js` makes HTTP requests to
`https://musicbrainz.org/ws/2/recording/` with `User-Agent: Echo/1.0 (...)`.
Rate-limited to 1 request/second (MusicBrainz policy). No API key required.

**Scoring**
`scoring.service.js` scores each candidate with a weighted Levenshtein similarity:
- Title: 40%
- Artist: 40%
- Duration: 20%

Auto-accept threshold: score ≥ 70. Below 45: rejected. 45–70: flagged for future review.

**Cover art**
Cover Art Archive URLs are constructed from the release group ID returned by MusicBrainz:
`https://coverartarchive.org/release-group/<id>/front`. This is a free, public CDN.
The domain is included in the server's CSP `img-src` directive.

---

### AcoustID

**Purpose** — Fingerprint-based song identification. Given a Chromaprint fingerprint
and duration, AcoustID returns a ranked list of MusicBrainz recording IDs with
confidence scores.

**Connection**
`src/api/services/acoustid.service.js` POST to `https://api.acoustid.org/v2/lookup`.
Rate-limited to 1 request per 350 ms. Requires `ACOUSTID_CLIENT_ID`.

**Obtaining a client ID**
Register at `https://acoustid.org/new-application` — completely free, no payment.

---

### LRCLib

**Purpose** — Fetch plain and time-synced (LRC format) lyrics for a song.

**Connection**
`src/api/services/lrclib.service.js` makes GET requests to `https://lrclib.net/api/search`.
No API key required. Rate-limited to 2 requests per 500 ms.
Stored in the `songs_lyrics` table and denormalised into `songs.lyrics_content`.

---

### Google OAuth 2.0

**Purpose** — "Continue with Google" login without storing a password.

**Flow**
1. `GET /api/auth/google/url` → server generates a Google consent URL and redirects the browser.
2. User authenticates on Google.
3. Google redirects to `GOOGLE_CALLBACK_URL` with a `code` parameter.
4. `GET /api/auth/google/callback` exchanges the code for tokens, fetches the user's
   profile from Google's userinfo endpoint, upserts the user in the DB, issues a
   JWT + refresh token, and redirects to `FRONTEND_URL?token=…&refreshToken=…`.
5. Frontend strips the query params, stores the tokens in Local Storage, and
   calls `/api/users/profile` to hydrate the session.

**Obtaining credentials**
Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client ID.
Application type: Web application.
Authorised redirect URI: `http://localhost:3000/api/auth/google/callback`.

---

## 6. Database schema

All tables live in Supabase PostgreSQL. Migrations are run automatically at startup
via `src/api/utils/runMigrations.js`, tracked in `schema_migrations`.

### `users`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| username | VARCHAR(255) UNIQUE | |
| email | VARCHAR(255) UNIQUE | |
| password_hash | VARCHAR(255) | null for OAuth users |
| google_id | VARCHAR(255) UNIQUE | |
| profile_picture_url | VARCHAR(512) | |
| role | VARCHAR(50) | default 'user'; set to 'admin' manually |
| is_active | BOOLEAN | |
| created_at / updated_at / last_login | TIMESTAMP | |

### `songs`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| youtube_id | VARCHAR(255) UNIQUE | source video |
| title / artist | VARCHAR(512) | |
| duration | INTEGER | milliseconds |
| file_path | VARCHAR(1024) | Supabase Storage public URL |
| cover_art_url | VARCHAR(512) | MusicBrainz CAA or YouTube thumbnail |
| album / genre / year | VARCHAR / INTEGER | from MusicBrainz |
| mbid | UUID | MusicBrainz recording ID |
| acoustid / acoustid_confidence | UUID / DECIMAL | |
| acoustic_fingerprint | TEXT | JSON from fingerprinter |
| fingerprint_hash / fingerprint_version | VARCHAR | |
| lyrics_content / lyrics_source | TEXT / VARCHAR | denormalised from songs_lyrics |
| metadata_verified | BOOLEAN | true when MB match accepted |
| review_status | VARCHAR(50) | 'pending' / 'verified' |

### `user_songs`
| Column | Type | Notes |
|---|---|---|
| user_id → users | FK | |
| song_id → songs | FK | |
| is_downloaded | BOOLEAN | |
| is_favorite | BOOLEAN | |
| UNIQUE(user_id, song_id) | | |

### `playlists`
| Column | Type | Notes |
|---|---|---|
| user_id → users | FK | |
| name / description | VARCHAR / TEXT | |
| is_public | BOOLEAN | |

### `playlist_songs`
| Column | Type | Notes |
|---|---|---|
| playlist_id → playlists | FK | |
| song_id → songs | FK | |
| position | INTEGER | 1-based, recomputed on add/remove |
| UNIQUE(playlist_id, song_id) | | |

### `listening_history`
| Column | Type | Notes |
|---|---|---|
| user_id → users | FK | |
| song_id → songs | FK | |
| played_at | TIMESTAMP | |
| duration_played / total_duration | INTEGER | seconds |
| completion_percentage | DECIMAL(5,2) | |

### `fingerprint_matches`
| Column | Type | Notes |
|---|---|---|
| user_id → users | FK | |
| uploaded_fingerprint | TEXT | JSON |
| matched_song_id → songs | FK nullable | null if not found in DB |
| confidence | DECIMAL(5,2) | |
| matched_at | TIMESTAMP | |

### `songs_lyrics`
| Column | Type | Notes |
|---|---|---|
| song_id → songs | FK UNIQUE | one row per song |
| lyrics_content | TEXT | plain text |
| synced | TEXT |  if LRC timed lyrics available |
| source / source_id | VARCHAR | 'lrclib' + lrclib internal id |
| fetched_at | TIMESTAMP | |

### `schema_migrations`
| Column | Type | Notes |
|---|---|---|
| filename | VARCHAR(255) UNIQUE | SQL file name |
| applied_at | TIMESTAMP | |

---

## 7. API reference

All routes are prefixed with `/api`.

### Auth — `/api/auth`

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/register` | — | `{ username, email, password }` | `{ user, token, refreshToken }` |
| POST | `/login` | — | `{ email, password }` | `{ user, token, refreshToken }` |
| POST | `/refresh` | — | `{ refreshToken }` | `{ token, refreshToken }` |
| POST | `/logout` | optional | — | `{ message }` |
| GET | `/google/url` | — | — | redirect to Google consent |
| GET | `/google/callback` | — | `?code=` (query) | redirect to frontend with tokens |

### Users — `/api/users`

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/profile` | ✅ | Full user object |
| PUT | `/profile` | ✅ | Updated user object |
| GET | `/stats` | ✅ | `{ totalPlays, playlistsCount, favoritesCount, totalSongs }` |
| GET | `/:userId` | — | Public profile |

### Songs — `/api/songs`

| Method | Path | Auth | Query / Body | Response |
|---|---|---|---|---|
| GET | `/` | optional | `?page&limit` | `{ songs[], total, page, pages }` |
| GET | `/search` | optional | `?q&page&limit` | same |
| GET | `/:songId` | optional | — | Song object with lyrics |
| GET | `/:songId/stream` | optional | — | 302 redirect to Supabase URL |
| POST | `/` | — | Song data | Created song |

### Playlists — `/api/playlists`

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/` | ✅ | `{ name, description, isPublic }` | Playlist |
| GET | `/` | ✅ | — | `{ playlists[], total, page, pages }` |
| GET | `/public` | optional | — | Public playlists |
| GET | `/:id` | optional | — | Playlist with songs[] |
| PUT | `/:id` | ✅ | Update fields | Updated playlist |
| DELETE | `/:id` | ✅ | — | `{ message }` |
| POST | `/:id/songs` | ✅ | `{ songId }` | Playlist-song row |
| DELETE | `/:id/songs/:songId` | ✅ | — | `{ message }` |
| PUT | `/:id/songs/:songId/reorder` | ✅ | `{ newPosition }` | `{ message }` |

### Download — `/api/download`

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/batch` | optional | `{ queries: string[] }` | `{ results[] }` |
| POST | `/add-song` | ✅ | `{ songId }` | user_songs row |
| GET | `/my-songs` | ✅ | `?page&limit` | `{ songs[], total, page, pages }` |
| DELETE | `/remove/:songId` | ✅ | — | `{ message }` |
| PUT | `/favorite/:songId` | ✅ | `{ isFavorite }` | user_songs row |

### History — `/api/history`

| Method | Path | Auth | Query / Body | Response |
|---|---|---|---|---|
| POST | `/` | ✅ | `{ songId, durationPlayed, totalDuration }` | History row |
| GET | `/` | ✅ | `?page&limit&startDate&endDate` | `{ history[], total, … }` |
| GET | `/top-songs` | ✅ | `?period&limit` | `{ topSongs[] }` |
| GET | `/recommendations` | ✅ | `?limit` | `{ recommendations[] }` |
| GET | `/stats` | ✅ | — | Listening statistics object |

### Fingerprinting — `/api/fingerprinting`

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/upload` | ✅ | multipart `audio` field | `{ data: { fingerprint, identification } }` |
| POST | `/record` | ✅ | multipart `audio` field | same |
| POST | `/generate/:songId` | ✅ admin | — | `{ song, fingerprint }` |
| POST | `/batch-generate` | ✅ admin | `{ songIds[] }` | `{ success[], failed[] }` |
| GET | `/history` | ✅ | `?limit` | `{ history[] }` |

---

## 8. Frontend architecture

The frontend is a vanilla-JS module system. There is no bundler, no framework,
no JSX. All `<script>` tags use `type="module"` which gives native ES module
semantics (imports, no global scope pollution, deferred execution).

### Module dependency graph

```
index.html
    └─ main.js  (bootstrap + navigation wiring)
        ├─ api.js      (all fetch calls)
        ├─ auth.js     (AuthManager — depends on api.js)
        ├─ ui.js       (UIManager — depends on api.js, auth.js, player.js)
        └─ player.js   (audio element control — depends on api.js, auth.js)

fingerprinting.js  (loaded independently; listens on navFingerprintBtn)
    └─ api.js
    └─ auth.js
```

### State management

There is no global state store. State is held in:
- `AuthManager.currentUser` / `AuthManager.isAuthenticated` — auth state
- `UIManager.currentSong` — currently loaded song object
- `player.js` module-level variables — `current`, `duration`, `isPlaying`, `repeatMode`
- `localStorage` — `token`, `refreshToken` (persisted across page loads)

### Token lifecycle

```
login() → api.setToken(token) → localStorage.setItem('token', token)
                                 localStorage.setItem('refreshToken', ...)

Every api.request() → Authorization: Bearer <token>
On 401 → api.refreshToken() → new token stored → original request retried
On refresh fail → tokens cleared → "Session expired" error thrown
```

### Global click delegation

Rather than attaching listeners to every dynamically-rendered card, `main.js`
attaches a single listener to `window`:

```js
window.addEventListener('click', (e) => {
    if (e.target.closest('.play-btn'))   → playSong(...)
    if (e.target.closest('.song-card'))  → playSong(...)
    if (e.target.closest('.playlist-card')) → showPlaylistView(...)
});
```

This means new song cards rendered by any view automatically get playback behaviour
without any post-render wiring.

---

## 9. Audio fingerprinting pipeline

```
Audio file (upload or recording)
        │
        ▼ multer saves to OS tmpdir
ChromaprintService.isFpcalcAvailable()
        │
   ┌────┴────┐
   │ yes     │ no
   ▼         ▼
fpcalc CLI   Python: essentia_fingerprint.py
             ├─ if essentia installed → Essentia MFCC
             ├─ elif librosa installed → librosa MFCC
             └─ else → SHA-256 file hash (minimal accuracy)
        │
        ▼
{ fingerprint, duration, method }
        │
        ▼
AcoustID API lookup (fingerprint + duration in seconds)
        │
        ▼
{ matches: [{ mbid, title, artists, score }], confidence }
        │
        ▼
INSERT fingerprint_matches
        │
        ▼
Response to frontend
```

**Why two fingerprinters?**

Chromaprint (`fpcalc`) is the standard — it produces a compact binary fingerprint
optimised for AcoustID. It requires a separate install (`apt install libchromaprint-tools`
on Ubuntu, Homebrew on macOS, installer on Windows). When it is not available, the
Python fallback runs inside the same process and produces a feature vector that is
still usable for internal matching but cannot be submitted to AcoustID for lookup.

---

## 10. Metadata enrichment pipeline

Every downloaded song goes through a two-stage enrichment immediately after the
yt-dlp download completes.

### Stage 1 — MusicBrainz

```
Parsed title + artist (from YouTube video title)
        │
        ▼
MusicBrainzService.searchByTitleArtistDuration()
    → GET /ws/2/recording/?query="<title>" AND artist:"<artist>"&limit=5
        │
        ▼
ScoringService.scoreCandidates()
    Weighted Levenshtein similarity:
    ├─ title similarity   × 0.40
    ├─ artist similarity  × 0.40
    └─ duration delta     × 0.20
        │
    score ≥ 70 → autoAccepted: update title/artist/album/year/coverUrl from MB
    score 45–69 → reviewNeeded (stored but YouTube metadata kept)
    score < 45  → rejected (YouTube metadata kept)
        │
        ▼
Cover art URL: https://coverartarchive.org/release-group/<id>/front
```

### Stage 2 — LRCLib lyrics

```
title + artist (post-enrichment)
        │
        ▼
LrclibService.searchLyrics()
    → GET /api/search?q="<title> <artist>"
        │
        ▼
{ plainLyrics, syncedLyrics, source: 'lrclib', sourceId }
        │
        ▼
INSERT / UPSERT songs_lyrics
UPDATE songs SET lyrics_content, lyrics_source
```

---

## 11. Authentication flow

### Email / password

```
POST /api/auth/register or /login
        │
AuthService.register() / login()
        ├─ bcrypt.hash(password, 10)  (register)
        ├─ bcrypt.compare(password, hash)  (login)
        └─ generateToken({ id, email, username })  → 1h expiry
           generateRefreshToken({ id })            → 7d expiry
        │
        ▼
{ user, token, refreshToken }
```

### Google OAuth

```
Browser → GET /api/auth/google/url
                │
         server: oauth2Client.generateAuthUrl(...)
                │
         302 → accounts.google.com/o/oauth2/...
                │
         User grants consent
                │
         302 → /api/auth/google/callback?code=...
                │
         oauth2Client.getToken(code)
         google.oauth2.userinfo.get()
                │
         AuthService.handleGoogleCallback(googleData)
         ├─ upsert user (match on google_id OR email)
         └─ issue JWT + refreshToken
                │
         302 → http://localhost:3000?token=...&refreshToken=...
                │
         main.js handleOAuthRedirect() strips query params, stores tokens
```

### JWT middleware

`authenticate` middleware in `auth.middleware.js`:
```
Authorization: Bearer <token>
        │
jwt.verify(token, JWT_SECRET)
        │
req.userId = decoded.id
req.user   = decoded
        │
next()  (or 401 if invalid/expired)
```

On 401, the frontend's `api.request()` automatically calls `POST /api/auth/refresh`
and retries the original request once. If the refresh also fails, the user is
logged out and tokens are cleared.

---

## 12. Setup and running

### Requirements

| Tool | Version | Install |
|---|---|---|
| Node.js | 20+ | https://nodejs.org |
| npm | 10+ | bundled with Node |
| Python | 3.8+ | https://python.org |
| FFmpeg | any | https://ffmpeg.org/download.html |
| fpcalc | optional | https://acoustid.org/chromaprint |

### Steps

```bash
# 1. Clone the repository
git clone <repo-url>
cd echo

# 2. Install Node dependencies
npm install

# 3. Install Python dependencies
pip install -r requirements.txt     # or pip3

# 4. Configure environment
cp .env.example .env
# Open .env and fill in every required variable (see §13)

# 5. Create Supabase bucket
# In Supabase dashboard → Storage → New bucket
# Name: songs   Public: ✅

# 6. Start development server
npm run dev
# Server starts, runs migrations automatically, opens browser
```

### Production

```bash
NODE_ENV=production npm start
```

Set all JWT secrets and Supabase keys to production values. Never commit `.env`.

---

## 13. Environment variables

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | ✅ | `development` or `production` |
| `PORT` | ✅ | HTTP port (default 3000) |
| `DATABASE_URL` | ✅ | Supabase PostgreSQL connection string |
| `SUPABASE_URL` | ✅ | Supabase project URL (`https://<ref>.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key for server-side storage writes |
| `JWT_SECRET` | ✅ | Random 32-byte hex string |
| `JWT_REFRESH_SECRET` | ✅ | Random 32-byte hex string (different from above) |
| `JWT_EXPIRES_IN` | ✅ | e.g. `1h` |
| `JWT_REFRESH_EXPIRES_IN` | ✅ | e.g. `7d` |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth client secret |
| `GOOGLE_CALLBACK_URL` | ✅ | Must match Google Console setting |
| `YT_API_KEY` | ✅ | YouTube Data API v3 key |
| `ACOUSTID_CLIENT_ID` | ⚠️ | Required for fingerprint identification |
| `DOWNLOAD_DIR` | — | Temp dir for yt-dlp (default `~/Downloads/echo-downloads`) |
| `CORS_ORIGIN` | — | Allowed origin (`*` in dev) |
| `DISABLE_RATE_LIMIT` | — | Set `true` in dev to skip rate limiters |
| `FRONTEND_URL` | — | Base URL for OAuth redirects (default `http://localhost:3000`) |

---

## 14. Known limitations

| Area | Limitation |
|---|---|
| Queue / next track | No automatic queue. After a song ends, playback stops (or repeats if repeat is on). |
| Admin panel | `requireAdmin` works but there is no UI to set a user's role to 'admin'. Do it directly in Supabase: `UPDATE users SET role = 'admin' WHERE email = 'you@example.com';` |
| Cover Art Archive | CAA images sometimes return 404 for releases without uploaded art. The browser falls back to the YouTube thumbnail via the `onerror` handler. |
| YouTube quota | 10 000 units/day free. Each batch download uses 2 units/song. At scale, consider caching search results. |
| Single-user design | There are no access controls between users beyond ownership checks on playlists and library. All songs in the `songs` table are visible to all users. |
