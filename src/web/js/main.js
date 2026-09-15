import { api } from './api.js';
import { authManager } from './auth.js';
import { uiManager } from './ui.js';

document.addEventListener('DOMContentLoaded', async () => {
    await api.ready();
    handleOAuthRedirect();
    setupNavigation();
    uiManager.showHome();
    await authManager.checkAuthStatus();
    await setupPlaylistSidebar();
});

window.addEventListener('auth:ready', async () => {
    await uiManager.showHome();
    await setupPlaylistSidebar();
});

function handleOAuthRedirect() {
    const params       = new URLSearchParams(window.location.search);
    const token        = params.get('token');
    const refreshToken = params.get('refreshToken');

    if (token) {
        api.setToken(token);
        if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
        authManager.isAuthenticated = true;
        window.history.replaceState({}, document.title, window.location.pathname);
    }
};

function setupNavigation() {
    const logo              = document.getElementById('logo');
    const homeBtn           = document.getElementById('homeBtn');
    const actionMenuToggle  = document.getElementById('actionMenuToggle');
    const actionMenu        = document.getElementById('actionMenu');
    const navLibraryBtn     = document.getElementById('navLibraryBtn');
    const navHistoryBtn     = document.getElementById('navHistoryBtn');
    const navDownloadBtn    = document.getElementById('navDownloadBtn');
    const navFingerprintBtn = document.getElementById('navFingerprintBtn');
    const logInBtn          = document.getElementById('logInBtn');
    const accountBtn        = document.getElementById('account');

    const showHome = async () => {
        await uiManager.showHome();
        actionMenu?.classList.remove('open');
        actionMenuToggle?.setAttribute('aria-expanded', 'false');
    };

    logo?.addEventListener('click', showHome);
    homeBtn?.addEventListener('click', showHome);
    navLibraryBtn?.addEventListener('click', () => uiManager.showLibraryView());
    navDownloadBtn?.addEventListener('click', () => uiManager.showBatchDownloadView());

    navHistoryBtn?.addEventListener('click', () => {
        if (!authManager.isAuthenticated) {
            authManager.showAuthModal();
        } else {
            uiManager.showHistoryView();
        }
    });

    navFingerprintBtn?.addEventListener('click', () => {
        // Fingerprinting view is handled by fingerprinting.js which listens
        // on the same button. This stub is kept for explicit documentation.
    });

    actionMenuToggle?.addEventListener('click', () => {
        const isOpen = actionMenu?.classList.toggle('open') || false;
        actionMenuToggle.setAttribute('aria-expanded', String(isOpen));
    });

    document.addEventListener('click', (event) => {
        if (actionMenu && !actionMenu.contains(event.target)) {
            actionMenu.classList.remove('open');
            actionMenuToggle?.setAttribute('aria-expanded', 'false');
        }
    });

    logInBtn?.addEventListener('click',  () => authManager.showAuthModal());
    accountBtn?.addEventListener('click', () => authManager.showProfileModal());

    const searchForm = document.getElementById('searchForm');
    searchForm?.addEventListener('submit', (e) => uiManager.handleSearch(e));
}

async function setupPlaylistSidebar() {
    if (!authManager.isAuthenticated) return;

    const playlistBar = document.getElementById('playlistBar');
    if (!playlistBar) return;

    try {
        const response  = await api.getUserPlaylists();
        const playlists = response.data || response.playlists || [];

        if (!playlists.length) return;

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

        playlistBar.querySelectorAll('.playlist-item').forEach(item => {
            item.addEventListener('click', () => {
                uiManager.showPlaylistView(item.dataset.playlistId);
            });
        });
    } catch (err) {
        console.error('Error loading playlists sidebar:', err);
    }
}

window.addEventListener('click', (e) => {
    const playBtn = e.target.closest('.play-btn, .play-btn-row');
    if (playBtn) {
        uiManager.playSong(playBtn.dataset.songId);
        return;
    }

    const songCard = e.target.closest('.song-card');
    if (songCard && !e.target.closest('.play-btn')) {
        uiManager.playSong(songCard.dataset.songId);
        return;
    }

    const playlistCard = e.target.closest('.playlist-card');
    if (playlistCard && !e.target.closest('.play-btn-playlist')) {
        uiManager.showPlaylistView(playlistCard.dataset.playlistId);
    }
});


export { uiManager, authManager, api };