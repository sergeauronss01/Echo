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
        return this.request('/users/profile');
    }

    async updateProfile(username, profilePicture = null) {
        return this.request('/users/profile', {
            method: 'PUT',
            body: JSON.stringify({ username, profilePicture }),
        });
    }

    async getUserStats() {
        return this.request('/users/stats');
    }

    async getPublicProfile(userId) {
        return this.request(`/users/${userId}`, { authenticated: false });
    }

    async getAllSongs(limit = 50, offset = 0) {
        return this.request(`/songs?limit=${limit}&offset=${offset}`, { authenticated: false });
    }

    async searchSongs(query, limit = 50) {
        return this.request(`/songs/search?q=${encodeURIComponent(query)}&limit=${limit}`, { authenticated: false });
    }

    async getSongDetails(songId) {
        return this.request(`/songs/${songId}`, { authenticated: false });
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
            authenticated: false,
        });
    }

    async addDownloadedSong(title, artist, url) {
        return this.request('/download/add-song', {
            method: 'POST',
            body: JSON.stringify({ title, artist, url }),
        });
    }

    async getUserDownloadedSongs() {
        return this.request('/download/my-songs');
    }

    async removeDownloadedSong(songId) {
        return this.request(`/download/remove/${songId}`, {
            method: 'DELETE',
        });
    }

    async toggleFavorite(songId) {
        return this.request(`/download/favorite/${songId}`, {
            method: 'PUT',
        });
    }

    async logPlayback(songId, duration) {
        return this.request('/history', {
            method: 'POST',
            body: JSON.stringify({ songId, duration }),
        });
    }

    async getPlaybackHistory(limit = 50) {
        return this.request(`/history?limit=${limit}`);
    }

    async getTopSongs(limit = 10) {
        return this.request(`/history/top-songs?limit=${limit}`);
    }

    async getRecommendations(limit = 20) {
        return this.request(`/history/recommendations?limit=${limit}`);
    }

    async getHistoryStats() {
        return this.request('/history/stats');
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
        return this.request('/fingerprinting/history');
    }

    async generateFingerprint(songId) {
        return this.request(`/fingerprinting/generate/${songId}`, {
            method: 'POST',
        });
    }
}

export const api = new APIService();