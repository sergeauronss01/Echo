// --- Main Application Initialization ---
// Bootstraps the application and sets up all modules

import { api } from './api.js';
import { authManager } from './auth.js';
import { uiManager } from './ui.js';

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
    await authManager.checkAuthStatus();
    setupNavigation();
    uiManager.showHome();
});

function setupNavigation() {
    const homeBtn = document.getElementById('homeBtn');
    const navLibraryBtn = document.getElementById('navLibraryBtn');
    const navHistoryBtn = document.getElementById('navHistoryBtn');
    const navDownloadBtn = document.getElementById('navDownloadBtn');
    const navFingerprintBtn = document.getElementById('navFingerprintBtn');
    const logInBtn = document.getElementById('logInBtn');
    const accountBtn = document.getElementById('account');

    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            uiManager.showHome();
        });
    }

    if (navLibraryBtn) {
        navLibraryBtn.addEventListener('click', () => {
            uiManager.showLibraryView();
        });
    }

    if (navHistoryBtn) {
        navHistoryBtn.addEventListener('click', () => {
            if (!authManager.isAuthenticated) {
                authManager.showAuthModal();
            } else {
                uiManager.showHistoryView();
            }
        });
    }

    if (navDownloadBtn) {
        navDownloadBtn.addEventListener('click', () => {
            uiManager.showBatchDownloadView();
        });
    }

    if (navFingerprintBtn) {
        navFingerprintBtn.addEventListener('click', () => {
            // This is handled by fingerprinting.js
        });
    }

    if (logInBtn) {
        logInBtn.addEventListener('click', () => {
            authManager.showAuthModal();
        });
    }

    if (accountBtn) {
        accountBtn.addEventListener('click', () => {
            authManager.showProfileModal(); 
        });
    }
}

// Setup playlist navigation from sidebar
window.addEventListener('load', () => {
    setupPlaylistSidebar();
});

async function setupPlaylistSidebar() {
    if (!authManager.isAuthenticated) return;

    const playlistBar = document.getElementById('playlistBar');
    
    try {
        const response = await api.getUserPlaylists();
        const playlists = response.data || [];

        if (playlists && playlists.length > 0) {
            playlistBar.innerHTML = `
                <div class="playlists-menu">
                    <h4>Playlists</h4>
                    <div class="playlists-list">
                        ${playlists.map(p => `
                            <button class="playlist-item" data-playlist-id="${p.id}">
                                ${p.name}
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;

            // Add click handlers
            document.querySelectorAll('.playlist-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    const playlistId = item.dataset.playlistId;
                    uiManager.showPlaylistView(playlistId);
                });
            });
        }
    } catch (error) {
        console.error('Error loading playlists sidebar:', error);
    }
}

// Setup song card listeners globally
window.addEventListener('click', (e) => {
    if (e.target.closest('.play-btn')) {
        const btn = e.target.closest('.play-btn');
        const songId = btn.dataset.songId;
        uiManager.playSong(songId);
    }

    if (e.target.closest('.song-card')) {
        const card = e.target.closest('.song-card');
        if (!e.target.closest('.play-btn')) {
            const songId = card.dataset.songId;
            uiManager.playSong(songId);
        }
    }

    if (e.target.closest('.playlist-card')) {
        const card = e.target.closest('.playlist-card');
        if (!e.target.closest('.play-btn-playlist')) {
            const playlistId = card.dataset.playlistId;
            uiManager.showPlaylistView(playlistId);
        }
    }
});

function handleOAuthRedirect() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const refreshToken = urlParams.get('refreshToken');

    if (token) {
        api.setToken(token);
        localStorage.setItem('refreshToken', refreshToken); 
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
    }
}
handleOAuthRedirect();

export { uiManager, authManager, api };
