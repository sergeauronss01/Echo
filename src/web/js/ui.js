import { api }         from './api.js';
import { authManager } from './auth.js';
import { loadSong }    from './player.js';

class UIManager {
    constructor() {
        this.currentSong = null;
        this.playlist    = [];
        this._setupGlobalImageFallback();
    }

    _setupGlobalImageFallback() {
        document.addEventListener('error', (e) => {
            if (e.target.tagName?.toLowerCase() === 'img') {
                if (!e.target.src.includes('assets/siacover.jpg')) {
                    e.target.src = 'assets/siacover.jpg';
                }
            }
        }, true);
    }

    // ── Home ────────────────────────────────────────────────────

    async showHome() {
        const mainContainer = document.getElementById('view-container');
        mainContainer.innerHTML = `
            <div class="home-view">
                <section class="featured-section">
                    <h2>Recently Added</h2>
                    <div id="recentSongs" class="songs-grid">
                        <div class="loading">Loading songs…</div>
                    </div>
                </section>

                <section class="recommendations-section">
                    <h2>Top Songs</h2>
                    <div id="topSongs" class="songs-grid">
                        <div class="loading">Loading top songs…</div>
                    </div>
                </section>

                ${authManager.isAuthenticated ? `
                    <section class="playlists-section">
                        <h2>My Playlists</h2>
                        <button id="createPlaylistBtn" class="btn-accent">+ New Playlist</button>
                        <div id="playlistsList" class="playlists-grid">
                            <div class="loading">Loading playlists…</div>
                        </div>
                    </section>
                ` : ''}
            </div>
        `;

        this.loadRecentSongs();
        this.loadTopSongs();

        if (authManager.isAuthenticated) {
            this.loadUserPlaylists();
            document.getElementById('createPlaylistBtn')
                ?.addEventListener('click', () => this.showCreatePlaylistModal());
        }
    }

    async loadRecentSongs() {
        try {
            const response  = await api.getAllSongs(8);
            const container = document.getElementById('recentSongs');
            if (!container) return;
            container.innerHTML = response.data?.length
                ? response.data.map(s => this.createSongCard(s)).join('')
                : '<p>No songs available</p>';
        } catch (err) {
            console.error('Error loading recent songs:', err);
            const c = document.getElementById('recentSongs');
            if (c) c.innerHTML = '<p>Error loading songs</p>';
        }
    }

    async loadTopSongs() {
        if (!authManager.isAuthenticated) {
            const c = document.getElementById('topSongs');
            if (c) c.innerHTML = '<p>Log in to see your top songs</p>';
            return;
        }
        try {
            const response  = await api.getTopSongs(8);
            const container = document.getElementById('topSongs');
            if (!container) return;
            container.innerHTML = response.data?.length
                ? response.data.map(item => {
                    const song = item.song ?? item;
                    return this.createSongCard(song);
                  }).join('')
                : '<p>No top songs yet — start listening!</p>';
        } catch (err) {
            console.error('Error loading top songs:', err);
        }
    }

    async loadUserPlaylists() {
        try {
            const response  = await api.getUserPlaylists();
            const playlists = response.playlists || response.data || [];
            const container = document.getElementById('playlistsList');
            if (!container) return;
            container.innerHTML = playlists.length
                ? playlists.map(p => this.createPlaylistCard(p)).join('')
                : '<p>No playlists yet</p>';
        } catch (err) {
            console.error('Error loading playlists:', err);
        }
    }

    // ── Search ──────────────────────────────────────────────────

    async handleSearch(e) {
        e.preventDefault();
        const query = document.getElementById('searchBar').value.trim();
        if (!query) return;

        const mainContainer = document.getElementById('view-container');
        mainContainer.innerHTML = `<div class="loading">Searching for "${query}"…</div>`;

        try {
            const response = await api.searchSongs(query, 50);
            mainContainer.innerHTML = response.data?.length
                ? `<div class="search-results">
                       <h2>Results for "${query}"</h2>
                       <div class="songs-grid">
                           ${response.data.map(s => this.createSongCard(s)).join('')}
                       </div>
                   </div>`
                : '<p>No songs found</p>';
        } catch (err) {
            mainContainer.innerHTML = `<p>Error searching: ${err.message}</p>`;
        }
    }

    // ── Batch Download ──────────────────────────────────────────

    async showBatchDownloadView() {
        const mainContainer = document.getElementById('view-container');
        mainContainer.innerHTML = `
            <div class="batch-download-container">
                <div class="batch-download-panel">
                    <h2>🎵 Batch Download</h2>
                    <p>Enter song titles/artists (one per line) to download multiple songs</p>
                    <form id="batchDownloadForm">
                        <textarea id="queries"
                            placeholder="Song Name - Artist&#10;Song Name 2 - Artist 2&#10;…"></textarea>
                        <button type="submit" id="startDownloadBtn" class="btn-primary">
                            Start Download
                        </button>
                    </form>
                    <div id="results" class="download-results"></div>
                </div>
            </div>
        `;

        document.getElementById('batchDownloadForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const queries = document.getElementById('queries').value
                .trim().split('\n').map(q => q.trim()).filter(Boolean);

            if (!queries.length) {
                alert('Please enter at least one song to download');
                return;
            }

            document.getElementById('results').innerHTML =
                '<div class="loading">⏳ Processing — this may take a few minutes…</div>';

            try {
                const response = await api.batchDownload(queries);
                this._renderDownloadResults(response.results || response.data?.results || []);
            } catch (err) {
                document.getElementById('results').innerHTML =
                    `<div class="error-message">Error: ${err.message}</div>`;
            }
        });
    }

    _renderDownloadResults(results) {
        const resultsDiv = document.getElementById('results');
        if (!results?.length) { resultsDiv.innerHTML = '<p>No results</p>'; return; }

        resultsDiv.innerHTML = `
            <div class="results-list">
                <h3>Download Results</h3>
                ${results.map(r => `
                    <div class="result-item ${r.success ? 'success' : 'error'}">
                        <span class="result-icon">${r.success ? '✅' : '❌'}</span>
                        <span class="result-query">${r.query || 'Unknown'}</span>
                        ${!r.success
                            ? `<span class="result-error">${r.error}</span>`
                            : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    // ── Playlist ────────────────────────────────────────────────

    showCreatePlaylistModal() {
        const mainContainer = document.getElementById('view-container');
        mainContainer.innerHTML = `
            <div class="modal-overlay" id="playlistModal">
                <div class="modal-content">
                    <h3>Create New Playlist</h3>
                    <form id="createPlaylistForm">
                        <input type="text" id="playlistName" placeholder="Playlist Name" required>
                        <textarea id="playlistDesc" placeholder="Description (optional)"></textarea>
                        <label>
                            <input type="checkbox" id="playlistPublic">
                            Make playlist public
                        </label>
                        <div class="modal-buttons">
                            <button type="submit" class="btn-primary">Create</button>
                            <button type="button" class="btn-secondary"
                                onclick="document.getElementById('homeBtn').click()">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.getElementById('createPlaylistForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name      = document.getElementById('playlistName').value;
            const desc      = document.getElementById('playlistDesc').value;
            const isPublic  = document.getElementById('playlistPublic').checked;
            try {
                await api.createPlaylist(name, desc, isPublic);
                this.showHome();
            } catch (err) {
                alert(`Error creating playlist: ${err.message}`);
            }
        });
    }

    async showPlaylistView(playlistId) {
        const mainContainer = document.getElementById('view-container');
        mainContainer.innerHTML = '<div class="loading">Loading playlist…</div>';

        try {
            const playlist = await api.getPlaylistDetails(playlistId);
            const p = playlist.data ?? playlist;

            mainContainer.innerHTML = `
                <div class="playlist-view">
                    <div class="playlist-header">
                        <img src="assets/siacover.jpg" alt="${p.name}" class="playlist-cover-large">
                        <div class="playlist-header-info">
                            <span>PLAYLIST</span>
                            <h1>${p.name}</h1>
                            <p>${p.description || ''}</p>
                            <span class="playlist-meta">${p.songs?.length || 0} songs</span>
                        </div>
                    </div>

                    <div class="playlist-controls">
                        ${authManager.isAuthenticated ? `
                            <button id="addSongsBtn"     class="btn-accent">+ Add Songs</button>
                            <button id="editPlaylistBtn" class="btn-secondary">Edit Playlist</button>
                        ` : ''}
                    </div>

                    <div id="playlistActionPanel"></div>

                    <div id="playlistSongs" class="songs-list">
                        ${p.songs?.length
                            ? p.songs.map((item, idx) =>
                                this._createPlaylistSongRow(item.song ?? item, idx)).join('')
                            : '<p>No songs in this playlist</p>'
                        }
                    </div>
                </div>
            `;

            document.getElementById('addSongsBtn')
                ?.addEventListener('click', () => this._showAddSongsPanel(playlistId, p.songs || []));

            document.getElementById('editPlaylistBtn')
                ?.addEventListener('click', () => this._showEditPlaylistPanel(playlistId, p));

        } catch (err) {
            mainContainer.innerHTML = `<p>Error loading playlist: ${err.message}</p>`;
        }
    }

    _createPlaylistSongRow(song, index) {
        const safeUrl = this._cleanImageUrl(song?.cover_art_url || song?.coverUrl);
        return `
            <div class="playlist-song-row" data-song-id="${song.id}">
                <span class="song-index">${index + 1}</span>
                <img src="${safeUrl}" alt="${song.title}"
                     class="song-thumb" referrerpolicy="no-referrer">
                <div class="song-row-info">
                    <h4>${song.title}</h4>
                    <p>${song.artist || 'Unknown Artist'}</p>
                </div>
                <button class="play-btn-row" data-song-id="${song.id}"><img src="assets/play_arrow.svg" alt="Play"></button>
            </div>
        `;
    }

    // ── Library ─────────────────────────────────────────────────

    async showLibraryView() {
        const mainContainer = document.getElementById('view-container');

        if (!authManager.isAuthenticated) {
            mainContainer.innerHTML = this._authRequired();
            document.getElementById('login-redirect-btn')
                ?.addEventListener('click', () => authManager.showAuthModal());
            return;
        }

        mainContainer.innerHTML = '<div class="loading">Loading library…</div>';

        try {
            const response = await api.getUserDownloadedSongs();
            const songs    = response.data || [];

            mainContainer.innerHTML = `
                <div class="library-view">
                    <h2>My Music Library</h2>
                    <div id="librarySongs" class="songs-grid">
                        ${songs.length
                            ? songs.map(s => this.createSongCard(s)).join('')
                            : '<p>No songs in your library yet</p>'}
                    </div>
                </div>
            `;
        } catch (err) {
            mainContainer.innerHTML = `<p>Error loading library: ${err.message}</p>`;
        }
    }

    // ── History ─────────────────────────────────────────────────

    async showHistoryView() {
        const mainContainer = document.getElementById('view-container');

        if (!authManager.isAuthenticated) {
            mainContainer.innerHTML = this._authRequired();
            document.getElementById('login-redirect-btn')
                ?.addEventListener('click', () => authManager.showAuthModal());
            return;
        }

        mainContainer.innerHTML = '<div class="loading">Loading history…</div>';

        try {
            const response = await api.getPlaybackHistory(50);
            const history  = response.data || [];

            mainContainer.innerHTML = `
                <div class="history-view">
                    <h2>Listening History</h2>
                    <div id="historyList" class="history-list">
                        ${history.length
                            ? history.map((item, idx) => {
                                const safeUrl = this._cleanImageUrl(item.song?.coverUrl);
                                return `
                                    <div class="history-item">
                                        <span class="history-index">${idx + 1}</span>
                                        <img src="${safeUrl}" alt=""
                                             referrerpolicy="no-referrer">
                                        <div class="history-info">
                                            <h4>${item.song?.title  || 'Unknown'}</h4>
                                            <p>${item.song?.artist  || 'Unknown Artist'}</p>
                                        </div>
                                        <span class="history-time">
                                            ${new Date(item.playedAt).toLocaleDateString()}
                                        </span>
                                    </div>`;
                              }).join('')
                            : '<p>No history yet</p>'
                        }
                    </div>
                </div>
            `;
        } catch (err) {
            mainContainer.innerHTML = `<p>Error loading history: ${err.message}</p>`;
        }
    }

    // ── Playback ────────────────────────────────────────────────

    async playSong(songId) {
        if (!songId) return;
        try {
            const response = await api.getSongDetails(songId);
            const song     = response.data;
            await loadSong(song);

            const audio = document.getElementById('audioPlayer');
            if (audio) await audio.play().catch(console.error);

            this.currentSong = song;

            if (authManager.isAuthenticated) {
                audio?.addEventListener('ended', () => {
                    const played = Math.floor(audio.currentTime || 0);
                    const total  = Math.floor(audio.duration   || played);
                    api.logPlayback(song.id, played, total).catch(() => {});
                }, { once: true });
            }
        } catch (err) {
            console.error('Error playing song:', err);
        }
    }

    // ── Card templates ──────────────────────────────────────────

    createSongCard(song) {
        const safeUrl = this._cleanImageUrl(song?.cover_art_url);
        return `
            <div class="song-card" data-song-id="${song?.id}">
                <div class="song-cover">
                    <img src="${safeUrl}" referrerpolicy="no-referrer"
                         alt="${song?.title || 'Song'}">
                    <button class="play-btn" data-song-id="${song?.id}" title="Play"><img src="assets/play_arrow.svg" alt="Play"></button>
                </div>
                <div class="song-info">
                    <h4 class="song-title">${song?.title || 'Unknown'}</h4>
                    <p  class="song-artist">${song?.artist || 'Unknown Artist'}</p>
                </div>
            </div>
        `;
    }

    createPlaylistCard(playlist) {
        return `
            <div class="playlist-card" data-playlist-id="${playlist.id}">
                <div class="playlist-cover">
                    <div class="playlist-thumbnail">${playlist.songs?.length || 0} songs</div>
                    <button class="play-btn-playlist"><img src="assets/play_arrow.svg" alt="Play"></button>
                </div>
                <div class="playlist-info">
                    <h4 class="playlist-name">${playlist.name}</h4>
                    <p  class="playlist-desc">${playlist.description || 'No description'}</p>
                </div>
            </div>
        `;
    }

    // ── Utilities ───────────────────────────────────────────────
    async _showAddSongsPanel(playlistId, existingSongs) {
        const panel      = document.getElementById('playlistActionPanel');
        const existingIds = new Set(existingSongs.map(item => (item.song ?? item).id));

        panel.innerHTML = `
            <div class="action-panel">
                <h3>Add Songs</h3>
                <div style="display:flex; gap:10px; margin-bottom:15px;">
                    <input type="text" id="songSearchInput"
                        placeholder="Search by title or artist…"
                        style="flex:1; background:var(--bg); border:1px solid #333;
                            color:white; padding:10px; border-radius:6px;">
                    <button id="songSearchBtn" class="btn-accent">Search</button>
                </div>
                <div id="songSearchResults"></div>
            </div>
        `;

        const doSearch = async () => {
            const q = document.getElementById('songSearchInput').value.trim();
            if (!q) return;

            const resultsDiv = document.getElementById('songSearchResults');
            resultsDiv.innerHTML = '<div class="loading">Searching…</div>';

            try {
                const response = await api.searchSongs(q, 10);
                const songs    = response.data || [];

                if (!songs.length) {
                    resultsDiv.innerHTML = '<p>No songs found.</p>';
                    return;
                }

                resultsDiv.innerHTML = songs.map(song => `
                    <div class="playlist-song-row" style="margin-bottom:8px;">
                        <img src="${this._cleanImageUrl(song.cover_art_url)}"
                            class="song-thumb" referrerpolicy="no-referrer">
                        <div class="song-row-info">
                            <h4>${song.title}</h4>
                            <p>${song.artist || 'Unknown Artist'}</p>
                        </div>
                        <button class="add-to-playlist-btn btn-accent"
                                data-song-id="${song.id}"
                                ${existingIds.has(song.id) ? 'disabled' : ''}>
                            ${existingIds.has(song.id) ? '✓ Added' : '+ Add'}
                        </button>
                    </div>
                `).join('');

                resultsDiv.querySelectorAll('.add-to-playlist-btn').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const songId = parseInt(btn.dataset.songId);
                        btn.disabled    = true;
                        btn.textContent = 'Adding…';
                        try {
                            await api.addSongToPlaylist(playlistId, songId);
                            btn.textContent = '✓ Added';
                            existingIds.add(songId);
                            const meta = document.querySelector('.playlist-meta');
                            if (meta) meta.textContent = `${existingIds.size} songs`;
                        } catch (err) {
                            btn.disabled    = false;
                            btn.textContent = '+ Add';
                            alert(`Error: ${err.message}`);
                        }
                    });
                });
            } catch (err) {
                document.getElementById('songSearchResults').innerHTML =
                    `<p>Error: ${err.message}</p>`;
            }
        };

        document.getElementById('songSearchBtn')
            ?.addEventListener('click', doSearch);
        document.getElementById('songSearchInput')
            ?.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
    }

    _showEditPlaylistPanel(playlistId, playlist) {
        const panel = document.getElementById('playlistActionPanel');

        panel.innerHTML = `
            <div class="action-panel">
                <h3>Edit Playlist</h3>
                <div style="display:flex; flex-direction:column; gap:12px; margin-top:15px;">
                    <input type="text" id="editPlaylistName"
                        value="${playlist.name || ''}"
                        placeholder="Playlist name"
                        style="background:var(--bg); border:1px solid #333;
                            color:white; padding:10px; border-radius:6px;">
                    <textarea id="editPlaylistDesc"
                        placeholder="Description (optional)"
                        style="background:var(--bg); border:1px solid #333; color:white;
                            padding:10px; border-radius:6px; resize:vertical; min-height:80px;"
                    >${playlist.description || ''}</textarea>
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                        <input type="checkbox" id="editPlaylistPublic"
                            ${playlist.is_public ? 'checked' : ''}>
                        Make playlist public
                    </label>
                    <div style="display:flex; gap:10px;">
                        <button id="savePlaylistBtn" class="btn-primary">Save</button>
                        <button id="cancelEditBtn" class="btn-secondary">Cancel</button>
                        <button id="deletePlaylistBtn" class="btn-primary">Delete</button>
                    </div>
                    <span id="editPlaylistError" class="error-message"></span>
                </div>
            </div>
        `;

        document.getElementById('savePlaylistBtn')?.addEventListener('click', async () => {
            const name     = document.getElementById('editPlaylistName').value.trim();
            const desc     = document.getElementById('editPlaylistDesc').value.trim();
            const isPublic = document.getElementById('editPlaylistPublic').checked;
            const errorEl  = document.getElementById('editPlaylistError');

            if (!name) { errorEl.textContent = 'Name is required.'; return; }

            const btn = document.getElementById('savePlaylistBtn');
            btn.textContent = 'Saving…';
            btn.disabled    = true;

            try {
                await api.updatePlaylist(playlistId, name, desc, isPublic);

                // Update header live without reloading
                document.querySelector('.playlist-header-info h1').textContent = name;
                document.querySelector('.playlist-header-info p').textContent  = desc;
                panel.innerHTML = '';
            } catch (err) {
                errorEl.textContent = err.message;
                btn.textContent     = 'Save';
                btn.disabled        = false;
            }
        });

        document.getElementById('cancelEditBtn')
            ?.addEventListener('click', () => { panel.innerHTML = ''; });
        
        document.getElementById('detelePlaylistBtn')?.addEventListener('click', () => {
            try{
                //await api.deletePlaylist(playlistId);
            } catch (err) {
                console.log(err.message);
            }
        });
    }

    _cleanImageUrl(url) {
        if (!url || url === 'null' || url === 'undefined' || url === '') {
            return 'assets/siacover.jpg';
        }
        return url;
    }

    _authRequired() {
        return `
            <div class="auth-required"
                 style="place-self:center;align-self:center;width:500px;">
                <p>Please log in to access this feature</p>
                <button id="login-redirect-btn">Log In</button>
            </div>`;
    }
}

export const uiManager = new UIManager();