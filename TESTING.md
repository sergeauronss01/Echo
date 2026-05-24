# Echo — Manual Testing Guide

A comprehensive list of every issue you are likely to encounter while testing,
grouped by feature slice, with exact steps to reproduce and what to expect.

---

## Prerequisites before testing

```bash
# 1. Copy and fill in .env
cp .env.example .env

# 2. Install dependencies
npm install

# 3. Install Python packages
pip install -r requirements.txt   # or pip3

# 4. Start the server
npm run dev
# Expected: "Echo running on http://localhost:3000" printed, browser opens automatically
```

---

## 1. Authentication

### 1.1 Register a new account
**Steps**
1. Click **Log in** in the header.
2. Switch to the **Register** tab.
3. Fill in a valid email, display name, password (≥8 chars), confirm password.
4. Click **Register**.

**Expected** — The form disappears; the home view loads; the avatar button appears
in the header replacing the "Log in" button.

**Common failure** — "Email or username already exists" (409). Use a different email.

---

### 1.2 Login with bad credentials
**Steps**
1. Click **Log in**.
2. Enter a correct email but wrong password.
3. Click **Login**.

**Expected** — Red error text "Invalid email or password" appears under the form.
The page must not navigate away.

---

### 1.3 Token refresh
**Steps**
1. Log in.
2. Open DevTools → Application → Local Storage.
3. Change the value of `token` to the string `"bad"`.
4. Navigate to **Library**.

**Expected** — The app silently calls `POST /api/auth/refresh` with the stored
refresh token, receives a new access token, stores it, and loads the Library.
If the refresh token is also invalid, you are logged out and see the auth screen.

---

### 1.4 Google OAuth login
**Steps**
1. Click **Log in** → **Continue with Google**.

**Expected** — Browser navigates to Google's consent page. After granting access
you are redirected to `http://localhost:3000?token=…&refreshToken=…`. The URL
parameters are stripped immediately and the home view loads with your account active.

**What to verify in .env**
```
GOOGLE_CLIENT_ID=<your id>
GOOGLE_CLIENT_SECRET=<your secret>
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
```
The callback URI must match exactly what is set in Google Cloud Console.

---

### 1.5 Profile stats display
**Steps**
1. Log in and play several songs to build history.
2. Click the avatar button in the header.

**Expected** — Three stat boxes show correct non-zero numbers:
- **Songs Listened** = total rows in `listening_history` for your user.
- **Playlists Created** = total playlists you own.
- **Favorites** = songs you have favourited.

**Previous bug (fixed)** — Stats always showed 0 because the server returned
`totalSongs / totalPlaylists / totalListens` but the UI read
`totalPlays / playlistsCount / favoritesCount`.

---

### 1.6 Logout
**Steps**
1. While logged in, click the avatar → **Logout**.

**Expected** — Avatar hides, "Log in" button reappears, home view reloads.
Local Storage `token` and `refreshToken` are cleared.

---

## 2. Song browsing and search

### 2.1 Home page loads recent songs
**Steps**
1. Open the app without logging in (or after logging in).

**Expected** — "Recently Added" section populates with song cards. Each card
shows the song cover, title, and artist. Missing covers fall back to
`assets/siacover.jpg`.

---

### 2.2 Home page top songs (authenticated)
**Steps**
1. Log in and play several songs.
2. Navigate home.

**Expected** — "Top Songs" section shows the most-listened songs for your account.

**Without history** — "No top songs yet — start listening!" message shown.

---

### 2.3 Search
**Steps**
1. Type an artist or song name in the search bar.
2. Press Enter or click the search button.

**Expected** — Results view replaces the home view with matching song cards.
Empty query does nothing (no navigation).

---

### 2.4 Song playback from card
**Steps**
1. Hover a song card — a play button appears.
2. Click it.

**Expected**
- The now-playing bar at the bottom populates with the song title, artist, and cover.
- Audio begins playing (you can hear it or see the browser tab audio indicator).
- The timeline thumb moves.
- The play button switches to a pause icon.

**What to verify** — Audio loads directly from Supabase Storage
(`https://<project>.supabase.co/storage/v1/object/public/songs/audio/<youtube_id>.m4a`).
Open DevTools → Network → filter "m4a" to confirm.

---

### 2.5 Timeline scrubbing
**Steps**
1. While a song is playing, click anywhere on the timeline bar.
2. Click and drag the white thumb left and right.

**Expected** — Playback jumps to the clicked position. Dragging moves it smoothly.
Current time label updates in real time.

---

### 2.6 Repeat modes
**Steps**
1. Play any song.
2. Click the repeat button multiple times.

**Expected** — Three states cycle:
- Default icon = repeat off (song stops after finishing).
- `repeat_all.svg` = repeats the current song continuously (same behaviour as
  "repeat one" since there is no queue yet).
- `repeat_one.svg` = same.

---

## 3. Batch download

### 3.1 Basic batch download (unauthenticated)
**Steps**
1. Click **⬇️ Download** without logging in.
2. Enter:
   ```
   Daft Punk - Get Lucky
   The Weeknd - Blinding Lights
   ```
3. Click **Start Download**.

**Expected**
- "⏳ Processing" spinner shown (may take 1–3 minutes per song).
- Results list appears with ✅ for each success and ❌ for any failure.
- Songs appear in the "Recently Added" section on the home page.

**Server-side checks**
- File is downloaded by yt-dlp to `DOWNLOAD_DIR`.
- File is uploaded to Supabase Storage bucket `songs` under path `audio/<videoId>.m4a`.
- Row inserted in `songs` table with `file_path` = the Supabase public URL.

**What can go wrong**
- `YT_API_KEY` quota exhausted (10 000 units/day free) → error "Video not found".
- `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` missing → upload throws; server
  should have exited at startup with a validation error.
- yt-dlp not installed or Python not in PATH → "Download failed".

---

### 3.2 Batch download (authenticated — songs linked to library)
**Steps**
1. Log in first.
2. Repeat 3.1.

**Expected** — Same as above, plus rows are inserted in `user_songs` linking your
account to the downloaded songs. They appear in **🎵 Library**.

---

### 3.3 Invalid / unresolvable query
**Steps**
1. In the download form enter:
   ```
   xyzqqqnonexistentsong123456789abc
   ```
2. Click **Start Download**.

**Expected** — Result row shows ❌ "Video not found".

---

## 4. Library

### 4.1 Library requires login
**Steps**
1. Log out (or use a private window).
2. Click **🎵 Library**.

**Expected** — "Please log in to access this feature" message with a **Log In** button.

---

### 4.2 Library lists downloaded songs
**Steps**
1. Log in and download at least one song (see 3.2).
2. Click **🎵 Library**.

**Expected** — Song cards appear for every song linked to your account.
Each card plays when clicked.

---

## 5. Playlists

### 5.1 Create playlist
**Steps**
1. Log in.
2. On the home page click **+ New Playlist**.
3. Enter a name (e.g. "Road Trip") and optional description.
4. Click **Create**.

**Expected** — Home view reloads; new playlist appears in "My Playlists".
Playlist also appears in the left sidebar.

---

### 5.2 View playlist
**Steps**
1. Click a playlist card on the home page or a sidebar button.

**Expected** — Playlist detail view shows the playlist name, description, song count,
and a list of songs (if any). Each song row has a play button.

---

### 5.3 Sidebar populates on login
**Steps**
1. Open the app already logged in (tokens in Local Storage).

**Expected** — Left sidebar shows your playlist names immediately without needing
to navigate anywhere.

**Previous bug (fixed)** — Sidebar was populated on the `window.load` event before
`checkAuthStatus()` resolved; it was always empty on first load for authenticated users.

---

## 6. Listening history

### 6.1 History requires login
**Steps**
1. Log out.
2. Click **📊 History**.

**Expected** — Auth modal shown (same redirect as Library).

---

### 6.2 History records plays
**Steps**
1. Log in and play a song to completion (or let it play for > 10 seconds then skip).
2. Click **📊 History**.

**Expected** — The played song appears at the top of the history list with today's date.

---

### 6.3 History pagination
**Steps**
1. After many plays, open History.

**Expected** — Up to 50 most recent plays shown. All have the correct song title,
artist, and date.

---

## 7. Song identification (Fingerprinting)

### 7.1 Auth gate
**Steps**
1. Log out.
2. Click **🎧 Identify**.

**Expected** — "Please log in to use the fingerprinting feature" shown.

---

### 7.2 Upload file identification
**Steps**
1. Log in.
2. Click **🎧 Identify** → **Upload Audio** tab.
3. Drag an audio file onto the upload area (or click to browse).

**Expected**
- "Analyzing audio…" spinner appears.
- Results appear with a list of matches, each showing title, artist, confidence bar,
  and an **Add to Library** button.
- No matches → "No matches found. Try another audio sample."

**What can go wrong**
- `ACOUSTID_CLIENT_ID` not set → spinner shows then error "AcoustID client ID not configured".
  Register for free at https://acoustid.org/new-application.
- `fpcalc` (Chromaprint) not installed → falls back to the Essentia/librosa Python
  fingerprinter which is less accurate but functional.

---

### 7.3 Record audio identification
**Steps**
1. Log in → **🎧 Identify** → **Record Audio** tab.
2. Click **🎤 Start Recording**.
3. Play a recognisable song from a speaker near your device for 15+ seconds.
4. Click **⏹ Stop Recording**.

**Expected**
- Timer counts up while recording.
- On stop: spinner then identification results (same layout as upload).

**Browser requirement** — Browser must have microphone permission. On Chrome/Firefox
a permission prompt appears on first use.

---

### 7.4 Match history
**Steps**
1. After a successful identification click the **Match History** tab.

**Expected** — A list of past identifications with song title, artist, date,
and confidence percentage badge.

---

## 8. Server health

### 8.1 Basic health check
```bash
curl http://localhost:3000/health
```
**Expected JSON**
```json
{ "status": "ok", "timestamp": "...", "uptime": 42.1 }
```

---

### 8.2 Dependency health check
```bash
curl http://localhost:3000/health/dependencies
```
**Expected JSON**
```json
{
  "status": "ok",
  "checks": {
    "node": "v20.x.x",
    "python": "Python 3.x.x",
    "ffmpeg": "ffmpeg version ..."
  }
}
```
**Previous bug (fixed)** — This route used `require('child_process')` inside an
ES module, which throws `ReferenceError: require is not defined`.

---

## 9. Rate limiting

### 9.1 Auth rate limit
**Steps**
1. Attempt to log in 11 times in 15 minutes with wrong credentials.

**Expected** — The 11th attempt returns HTTP 429 with:
```json
{ "message": "Too many authentication attempts, please try again later." }
```

---

### 9.2 Disable for dev
In `.env` set:
```
DISABLE_RATE_LIMIT=true
```
Restart the server. All rate limits are bypassed without code changes.

---

## 10. Database / migration

### 10.1 First boot migration
**Steps**
1. Ensure `DATABASE_URL` points to a fresh Supabase project.
2. Start the server.

**Expected** — Console output:
```
Running 3 pending migration(s)…
  ✓ 001_init_schema.sql
  ✓ 002_add_musicbrainz_support.sql
  ✓ 003_add_user_role.sql
All migrations completed successfully.
```

### 10.2 Subsequent boot (no re-run)
**Steps**
1. Restart the server.

**Expected** — Console output:
```
✓ All migrations already applied.
```
**Previous bug (fixed)** — All SQL files re-ran every boot. Now a
`schema_migrations` tracking table prevents duplicate execution.

---

## 11. CSP / network

### 11.1 Cover art from Cover Art Archive
**Steps**
1. Download a well-known track (e.g. "Daft Punk - Harder Better Faster").
2. View it in the home grid.

**Expected** — Cover art loads (from MusicBrainz Cover Art Archive CDN).

**What to verify** — `coverartarchive.org` is now in the CSP `img-src` directive.
Previously it was missing, causing the browser to block images from that domain
with a CSP violation in the console.

---

## 12. Supabase Storage

### 12.1 Verify bucket exists
In Supabase dashboard → Storage → confirm bucket named `songs` exists with
public access enabled.

**If missing** — Create it:
```
Bucket name: songs
Public: ✅ (toggle on)
```

### 12.2 Audio actually plays from Supabase
**Steps**
1. After a successful download, open DevTools → Network.
2. Click the song card to play.
3. Filter requests by "m4a".

**Expected** — One request to
`https://<your-project>.supabase.co/storage/v1/object/public/songs/audio/<id>.m4a`
returns HTTP 200 or 206 (partial content for range requests).

---

## 13. Edge cases

### 13.1 Song with no cover art
**Expected** — `assets/siacover.jpg` used as fallback. No broken image icon.
Confirmed by the global `error` event listener on `img` tags.

### 13.2 Searching while unauthenticated
**Expected** — Search works normally; top songs section shows "Log in to see
your top songs" instead of attempting an authenticated request.

### 13.3 Playing a song card vs clicking the card body
**Expected** — Both the play button and clicking anywhere on the card trigger playback
(handled by global click delegation in `main.js`).

### 13.4 Very long song titles / artist names
**Expected** — Text is truncated with `text-overflow: ellipsis` inside cards. No
layout overflow.

### 13.5 Network offline during download
**Expected** — yt-dlp subprocess times out after 5 minutes. The result entry shows
❌ with the error message. Server does not crash.
