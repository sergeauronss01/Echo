// --- API Service Module ---
// Centralized API communication layer for all backend endpoints

class APIService {
    constructor() {
        this.baseUrl = '/api';
        this.token = localStorage.getItem('token');
    }

    getHeaders(includeAuth = true) {
        const headers = {
            'Content-Type': 'application/json',
        };
        if (includeAuth && this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    }

    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('token', token);
        } else {
            localStorage.removeItem('token');
        }
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        let response = await fetch(url, {
            ...options,
            headers: this.getHeaders(options.authenticated !== false),
        });
        if (response.status === 401 && options.authenticated !== false) {
            try {
                await this.refreshToken();
                response = await fetch(url, {
                    ...options,
                    headers: this.getHeaders(true),
                });
            } catch {
                this.setToken(null);
                localStorage.removeItem('refreshToken');
                throw new Error('Session expired');
            }
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(error.message || `API Error: ${response.status}`);
        }

        return response.json().catch(() => ({}));
    }

    async register(email, password, username) {
        return this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, username }),
            authenticated: false,
        });
    }

    async login(email, password) {
        const response = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
            authenticated: false,
        });
        if (response.token) {
            this.setToken(response.token);
        }
        if (response.refreshToken) {
            localStorage.setItem('refreshToken', response.refreshToken);
        }
        return response;
    }

    async logout() {
        this.setToken(null);
        return this.request('/auth/logout', { method: 'POST' });
    }

    getGoogleAuthUrl() {
        window.location.href = '/api/auth/google/url';
    }

    async refreshToken() {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
            throw new Error('No refresh token');
        }
        const response = await this.request('/auth/refresh', {
            method: 'POST',
            body: JSON.stringify({ refreshToken }),
            authenticated: false,
        });
        if (response.token) {
            this.setToken(response.token);
        }
        return response;
    }

    async getProfile() {
        const profile = await this.request('/users/profile');
        return { data: profile };
    }

    async updateProfile(username, profilePicture = null) {
        return this.request('/users/profile', {
            method: 'PUT',
            body: JSON.stringify({ username, profilePicture }),
        });
    }

    async getUserStats() {
        const stats = await this.request('/users/stats');
        return { data: stats };
    }

    async getPublicProfile(userId) {
        const user = await this.request(`/users/${userId}`, { authenticated: false });
        return { data: user };
    }

    async getAllSongs(limit = 50, offset = 0) {
        const page = Math.floor(offset / limit) + 1;
        const result = await this.request(`/songs?page=${page}&limit=${limit}`, { authenticated: false });
        const songs = (result.songs || []).map(song => this.normalizeSong(song));
        return {
            data: songs,
            pagination: {
                total: result.total,
                page: result.page,
                pages: result.pages,
            },
        };
    }

    async searchSongs(query, limit = 50) {
        const result = await this.request(
            `/songs/search?q=${encodeURIComponent(query)}&page=1&limit=${limit}`,
            { authenticated: false }
        );
        const songs = (result.songs || []).map(song => this.normalizeSong(song));
        return {
            data: songs,
            pagination: {
                total: result.total,
                page: result.page,
                pages: result.pages,
            },
        };
    }

    async getSongDetails(songId) {
        const song = await this.request(`/songs/${songId}`, { authenticated: false });
        return { data: this.normalizeSong(song) };
    }

    async createSong(songData) {
        return this.request('/songs', {
            method: 'POST',
            body: JSON.stringify(songData),
        });
    }

    async createPlaylist(name, description = '', isPublic = false) {
        return this.request('/playlists', {
            method: 'POST',
            body: JSON.stringify({ name, description, isPublic }),
        });
    }

    async getUserPlaylists() {
        return this.request('/playlists');
    }

    async getPublicPlaylists() {
        return this.request('/playlists/public', { authenticated: false });
    }

    async getPlaylistDetails(playlistId) {
        return this.request(`/playlists/${playlistId}`, { authenticated: false });
    }

    async updatePlaylist(playlistId, name, description, isPublic) {
        return this.request(`/playlists/${playlistId}`, {
            method: 'PUT',
            body: JSON.stringify({ name, description, isPublic }),
        });
    }

    async deletePlaylist(playlistId) {
        return this.request(`/playlists/${playlistId}`, {
            method: 'DELETE',
        });
    }

    async addSongToPlaylist(playlistId, songId) {
        return this.request(`/playlists/${playlistId}/songs`, {
            method: 'POST',
            body: JSON.stringify({ songId }),
        });
    }

    async removeSongFromPlaylist(playlistId, songId) {
        return this.request(`/playlists/${playlistId}/songs/${songId}`, {
            method: 'DELETE',
        });
    }

    async reorderPlaylistSong(playlistId, songId, newPosition) {
        return this.request(`/playlists/${playlistId}/songs/${songId}/reorder`, {
            method: 'PUT',
            body: JSON.stringify({ newPosition }),
        });
    }

    async batchDownload(queries) {
        return this.request('/download/batch', {
            method: 'POST',
            body: JSON.stringify({ queries }),
        });
    }

    async addDownloadedSong(songId) {
        return this.request('/download/add-song', {
            method: 'POST',
            body: JSON.stringify({ songId }),
        });
    }

    async getUserDownloadedSongs() {
        const result = await this.request('/download/my-songs');
        const songs = (result.songs || []).map(song => this.normalizeSong(song));
        return {
            data: songs,
            pagination: {
                total: result.total,
                page: result.page,
                pages: result.pages,
            },
        };
    }

    async removeDownloadedSong(songId) {
        return this.request(`/download/remove/${songId}`, {
            method: 'DELETE',
        });
    }

    async toggleFavorite(songId) {
        return this.request(`/download/favorite/${songId}`, {
            method: 'PUT',
            body: JSON.stringify({ isFavorite: true }),
        });
    }

    async logPlayback(songId, durationPlayed, totalDuration) {
        return this.request('/history', {
            method: 'POST',
            body: JSON.stringify({ songId, durationPlayed, totalDuration }),
        });
    }

    async getPlaybackHistory(limit = 50) {
        const result = await this.request(`/history?limit=${limit}`);
        const historyItems = (result.history || []).map(item => ({
            ...item,
            playedAt: item.played_at || item.playedAt,
            song: {
                id: item.song_id,
                title: item.title,
                artist: item.artist,
                coverUrl: item.cover_art_url || null,
            },
        }));
        return {
            data: historyItems,
            pagination: {
                total: result.total,
                page: result.page,
                pages: result.pages,
            },
        };
    }

    async getTopSongs(limit = 10) {
        const result = await this.request(`/history/top-songs?limit=${limit}`);
        const topSongs = (result.topSongs || []).map(row => ({
            song: this.normalizeSong(row),
            listenCount: row.listen_count ?? row.listenCount ?? 0,
        }));
        return { data: topSongs };
    }

    async getRecommendations(limit = 20) {
        const result = await this.request(`/history/recommendations?limit=${limit}`);
        const recs = (result.recommendations || result.data || []).map(song =>
            this.normalizeSong(song)
        );
        return { data: recs };
    }

    async getHistoryStats() {
        const stats = await this.request('/history/stats');
        return { data: stats };
    }

    async fingerprintUpload(audioFile) {
        const formData = new FormData();
        formData.append('audio', audioFile);
        
        const response = await fetch(`${this.baseUrl}/fingerprinting/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${this.token}` },
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(error.message || `Fingerprinting Error: ${response.status}`);
        }

        return response.json();
    }

    async fingerprintRecord(audioBlob) {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');
        
        const response = await fetch(`${this.baseUrl}/fingerprinting/record`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${this.token}` },
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(error.message || `Fingerprinting Error: ${response.status}`);
        }

        return response.json();
    }

    async getFingerprintHistory() {
        const result = await this.request('/fingerprinting/history');
        return { data: result.history || result.data || [] };
    }

    async generateFingerprint(songId) {
        return this.request(`/fingerprinting/generate/${songId}`, {
            method: 'POST',
        });
    }

    normalizeSong(song) {
        if (!song) return song;
        const coverUrl = song.cover_art_url || null;
        const id = song.id;
        const streamUrl = id ? `${this.baseUrl}/songs/${id}/stream` : null;

        return {
            ...song,
            coverUrl,
            streamUrl,
        };
    }
}

export const api = new APIService();