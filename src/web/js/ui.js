// --- UI Manager Module ---
// Handles all UI views and state management

import { api } from './api.js';
import { authManager } from './auth.js';
import { loadSong } from './player.js';

class UIManager {
    constructor() {
        this.currentView = 'home';
        this.currentSong = null;
        this.playlist = [];
        this.setupEventListeners();

        document.addEventListener('error', (e) => {
            if (e.target.tagName && e.target.tagName.toLowerCase() === 'img') {
                if (!e.target.src.includes('assets/siacover.jpg')) {
                    e.target.src = 'assets/siacover.jpg';
                }
            }
        }, true);
    }

    setupEventListeners() {
        const homeBtn = document.getElementById('homeBtn');
        const searchForm = document.getElementById('searchForm');
        const accountBtn = document.getElementById('account');

        if (homeBtn) homeBtn.addEventListener('click', () => this.showHome());
        if (searchForm) searchForm.addEventListener('submit', (e) => this.handleSearch(e));
        if (accountBtn) accountBtn.addEventListener('click', () => authManager.showProfileModal());
    }

    async showHome() {
        const mainContainer = document.getElementById('view-container');
        mainContainer.innerHTML = `
            <div class="home-view">
                <section class="featured-section">
                    <h2>Recently Added</h2>
                    <div id="recentSongs" class="songs-grid">
                        <div class="loading">Loading songs...</div>
                    </div>
                </section>

                <section class="recommendations-section">
                    <h2>Top Songs</h2>
                    <div id="topSongs" class="songs-grid">
                        <div class="loading">Loading top songs...</div>
                    </div>
                </section>

                ${authManager.isAuthenticated ? `
                    <section class="playlists-section">
                        <h2>My Playlists</h2>
                        <button id="createPlaylistBtn" class="btn-accent">+ New Playlist</button>
                        <div id="playlistsList" class="playlists-grid">
                            <div class="loading">Loading playlists...</div>
                        </div>
                    </section>
                ` : ''}
            </div>
        `;

        this.loadRecentSongs();
        this.loadTopSongs();
        
        if (authManager.isAuthenticated) {
            this.loadUserPlaylists();
            document.getElementById('createPlaylistBtn')?.addEventListener('click', () => this.showCreatePlaylistModal());
        }
    }

    async loadRecentSongs() {
        try {
            const response = await api.getAllSongs(8);
            const container = document.getElementById('recentSongs');
            if (response.data && response.data.length > 0) {
                container.innerHTML = response.data.map(song => this.createSongCard(song)).join('');
            } else {
                container.innerHTML = '<p>No songs available</p>';
            }
        } catch (error) {
            console.error('Error loading recent songs:', error);
            document.getElementById('recentSongs').innerHTML = '<p>Error loading songs</p>';
        }
    }

    async loadTopSongs() {
        try {
            if (!authManager.isAuthenticated) return;
            const response = await api.getTopSongs(8);
            const container = document.getElementById('topSongs');
            
            if (response.data?.length > 0) {
                container.innerHTML = response.data.map(item => {
                    const songData = item.song ? item.song : item; 
                    return this.createSongCard(songData);
                }).join('');
            } else {
                container.innerHTML = '<p>No top songs yet</p>';
            }
        } catch (error) {
            console.error('Error loading top songs:', error);
        }
    }

    async loadUserPlaylists() {
        try {
            const response = await api.getUserPlaylists();
            const container = document.getElementById('playlistsList');
            if (response.data && response.data.length > 0) {
                container.innerHTML = response.data.map(playlist => this.createPlaylistCard(playlist)).join('');
            } else {
                container.innerHTML = '<p>No playlists yet</p>';
            }
        } catch (error) {
            console.error('Error loading playlists:', error);
        }
    }

    async showBatchDownloadView() {
        const mainContainer = document.getElementById('view-container');
        mainContainer.innerHTML = `
            <div class="batch-download-container">
                <div class="batch-download-panel">
                    <h2>🎵 Batch Download</h2>
                    <p>Enter song titles/artists (one per line) to download multiple songs</p>
                    
                    <form id="batchDownloadForm">
                        <textarea id="queries" placeholder="Song Name - Artist&#10;Song Name 2 - Artist 2&#10;..."></textarea>
                        <button type="submit" id="startDownloadBtn" class="btn-primary">Start Download</button>
                    </form>

                    <div id="results" class="download-results"></div>
                </div>
            </div>
        `;

        document.getElementById('batchDownloadForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const queries = document.getElementById('queries').value
                .trim()
                .split('\n')
                .map(q => q.trim())
                .filter(Boolean);

            if (!queries.length) {
                alert('Please enter at least one song to download');
                return;
            }

            document.getElementById('results').innerHTML = '<div class="loading">⏳ Processing...</div>';

            try {
                const response = await api.batchDownload(queries);
                this.renderDownloadResults(response.results || response.data?.results || []);
            } catch (error) {
                document.getElementById('results').innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
            }
        });
    }

    renderDownloadResults(results) {
        const resultsDiv = document.getElementById('results');
        if (!results || results.length === 0) {
            resultsDiv.innerHTML = '<p>No results</p>';
            return;
        }

        resultsDiv.innerHTML = `
            <div class="results-list">
                <h3>Download Results</h3>
                ${results.map(result => `
                    <div class="result-item ${result.success ? 'success' : 'error'}">
                        <span class="result-icon">${result.success ? '✅' : '❌'}</span>
                        <span class="result-query">${result.query || 'Unknown'}</span>
                        ${result.success ? 
                            `` :
                            `<span class="result-error">${result.error}</span>`
                        }
                    </div>
                `).join('')}
            </div>
        `;
    }

    cleanImageUrl(url) {
        if (!url || url === 'null' || url === 'undefined' || url === '') {
            return 'assets/siacover.jpg';
        }
        return url;
    }

    createSongCard(song) {
        const safeUrl = this.cleanImageUrl(song?.coverUrl); 
        return `
            <div class="song-card" data-song-id="${song?.id}">
                <div class="song-cover">
                    <img src="${safeUrl}" referrerpolicy="no-referrer" alt="${song?.title || 'Song'}">
                    <button class="play-btn" data-song-id="${song?.id}" title="Play">▶</button>
                </div>
                <div class="song-info">
                    <h4 class="song-title">${song.title}</h4>
                    <p class="song-artist">${song.artist || 'Unknown Artist'}</p>
                </div>
            </div>
        `;
    }

    createPlaylistCard(playlist) {
        return `
            <div class="playlist-card" data-playlist-id="${playlist.id}">
                <div class="playlist-cover">
                    <div class="playlist-thumbnail">${playlist.songs?.length || 0} songs</div>
                    <button class="play-btn-playlist">▶</button>
                </div>
                <div class="playlist-info">
                    <h4 class="playlist-name">${playlist.name}</h4>
                    <p class="playlist-desc">${playlist.description || 'No description'}</p>
                </div>
            </div>
        `;
    }

    async handleSearch(e) {
        e.preventDefault();
        const query = document.getElementById('searchBar').value.trim();
        if (!query) return;

        const mainContainer = document.getElementById('view-container');
        mainContainer.innerHTML = `<div class="loading">Searching for "${query}"...</div>`;

        try {
            const response = await api.searchSongs(query, 50);
            const container = document.getElementById('view-container');
            if (response.data && response.data.length > 0) {
                container.innerHTML = `
                    <div class="search-results">
                        <h2>Search Results for "${query}"</h2>
                        <div class="songs-grid">
                            ${response.data.map(song => this.createSongCard(song)).join('')}
                        </div>
                    </div>
                `;
            } else {
                container.innerHTML = '<p>No songs found</p>';
            }
        } catch (error) {
            mainContainer.innerHTML = `<p>Error searching: ${error.message}</p>`;
        }
    }

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
                            <button type="button" class="btn-secondary" onclick="location.reload()">Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.getElementById('createPlaylistForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('playlistName').value;
            const description = document.getElementById('playlistDesc').value;
            const isPublic = document.getElementById('playlistPublic').checked;

            try {
                await api.createPlaylist(name, description, isPublic);
                this.showHome();
            } catch (error) {
                alert(`Error creating playlist: ${error.message}`);
            }
        });
    }

    async showPlaylistView(playlistId) {
        const mainContainer = document.getElementById('view-container');
        mainContainer.innerHTML = '<div class="loading">Loading playlist...</div>';

        try {
            const response = await api.getPlaylistDetails(playlistId);
            const playlist = response.data;

            mainContainer.innerHTML = `
                <div class="playlist-view">
                    <div class="playlist-header">
                        <img src="assets/siacover.jpg" alt="${playlist.name}" class="playlist-cover-large">
                        <div class="playlist-header-info">
                            <span>PLAYLIST</span>
                            <h1>${playlist.name}</h1>
                            <p>${playlist.description || ''}</p>
                            <span class="playlist-meta">${playlist.songs?.length || 0} songs</span>
                        </div>
                    </div>

                    <div class="playlist-controls">
                        ${authManager.isAuthenticated ? `
                            <button id="addSongsBtn" class="btn-accent">+ Add Songs</button>
                            <button id="editPlaylistBtn" class="btn-secondary">Edit Playlist</button>
                        ` : ''}
                    </div>

                    <div id="playlistSongs" class="songs-list">
                        ${playlist.songs && playlist.songs.length > 0 ?
                            playlist.songs.map((item, idx) => this.createPlaylistSongRow(item.song, idx)).join('') :
                            '<p>No songs in this playlist</p>'
                        }
                    </div>
                </div>
            `;
        } catch (error) {
            mainContainer.innerHTML = `<p>Error loading playlist: ${error.message}</p>`;
        }
    }

    createPlaylistSongRow(song, index) {
        const safeUrl = (song?.coverUrl && song.coverUrl !== 'null' && song.coverUrl !== 'undefined') 
            ? song.coverUrl 
            : 'assets/siacover.jpg';

        return `
            <div class="playlist-song-row" data-song-id="${song.id}">
                <span class="song-index">${index + 1}</span>
                <img src="${safeUrl}" alt="${song.title}" class="song-thumb" referrerpolicy="no-referrer">
                <div class="song-row-info">
                    <h4>${song.title}</h4>
                    <p>${song.artist || 'Unknown Artist'}</p>
                </div>
                <button class="play-btn-row" data-song-id="${song.id}">▶</button>
            </div>
        `;
    }

    async showLibraryView() {
        const mainContainer = document.getElementById('view-container');

        if (!authManager.isAuthenticated) {
            mainContainer.innerHTML = `
                <div class="auth-required" style="place-self: center; align-self: center; width: 500px;">
                    <p>Please log in to use the fingerprinting feature</p>
                    <button id="login-redirect-btn">Log In</button>
                </div>`;
            
            document.getElementById('login-redirect-btn')?.addEventListener('click', () => {
                authManager.showAuthModal();
            });
            return;
        }

        mainContainer.innerHTML = '<div class="loading">Loading library...</div>';

        try {
            const response = await api.getUserDownloadedSongs();
            const mySongs = response.data || [];

            mainContainer.innerHTML = `
                <div class="library-view">
                    <h2>My Music Library</h2>
                    <div id="librarySongs" class="songs-grid">
                        ${mySongs.length > 0 ?
                            mySongs.map(song => this.createSongCard(song)).join('') :
                            '<p>No songs in your library yet</p>'
                        }
                    </div>
                </div>
            `;

            this.attachSongCardListeners();
        } catch (error) {
            mainContainer.innerHTML = `<p>Error loading library: ${error.message}</p>`;
        }
    }
    
    async showHistoryView() {
        const mainContainer = document.getElementById('view-container');

        if (!authManager.isAuthenticated) {
            mainContainer.innerHTML = `
                <div class="auth-required" style="place-self: center; align-self: center; width: 500px;">
                    <p>Please log in to use the fingerprinting feature</p>
                    <button id="login-redirect-btn">Log In</button>
                </div>`;
            
            document.getElementById('login-redirect-btn')?.addEventListener('click', () => {
                authManager.showAuthModal();
            });
            return;
        }

        mainContainer.innerHTML = '<div class="loading">Loading history...</div>';

        try {
            const response = await api.getPlaybackHistory(50);
            const history = response.data || [];

            mainContainer.innerHTML = `
                <div class="history-view">
                    <h2>Listening History</h2>
                    <div id="historyList" class="history-list">
                        ${history.length > 0 ? 
                            history.map((item, idx) => {
                                const safeUrl = (item.song?.coverUrl && item.song.coverUrl !== 'null') 
                                    ? item.song.coverUrl 
                                    : 'assets/siacover.jpg';

                                return `
                                    <div class="history-item">
                                        <span class="history-index">${idx + 1}</span>
                                        <img src="${safeUrl}" alt="" referrerpolicy="no-referrer">
                                        <div class="history-info">
                                            <h4>${item.song?.title || 'Unknown'}</h4>
                                            <p>${item.song?.artist || 'Unknown Artist'}</p>
                                        </div>
                                        <span class="history-time">${new Date(item.playedAt).toLocaleDateString()}</span>
                                    </div>`;
                            }).join('') : 
                            '<p>No history yet</p>'
                        }
                    </div>
                </div>`;
        } catch (error) {
            mainContainer.innerHTML = `<p>Error loading history: ${error.message}</p>`;
        }
    }
    attachSongCardListeners() {
        document.querySelectorAll('.play-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const songId = btn.dataset.songId;
                this.playSong(songId);
            });
        });

        document.querySelectorAll('.song-card').forEach(card => {
            card.addEventListener('click', () => {
                const songId = card.dataset.songId;
                this.playSong(songId);
            });
        });
    }

    async playSong(songId) {
        try {
            const response = await api.getSongDetails(songId);
            const song = response.data;

            await loadSong(song);

            const audio = document.getElementById('audioPlayer');
            if (audio) {
                await audio.play().catch(console.error);
            }

            this.currentSong = song;
        } catch (error) {
            console.error('Error playing song:', error);
        }
    }
}

export const uiManager = new UIManager();
