// --- Authentication Module ---
// Handles login, registration, and user authentication state

import { api } from './api.js';

class AuthManager {
    constructor() {
        this.currentUser = null;    
        const token = localStorage.getItem('token');
        const refreshToken = localStorage.getItem('refreshToken');
        this.isAuthenticated = !!token;
        if (token) {
            api.setToken(token);
        }
        this.handleOAuthRedirect();
        if (token || refreshToken) {
            this.checkAuthStatus();
        }
    }
    
    updateUI() {
        const logInBtn = document.getElementById('logInBtn');
        const accountBtn = document.getElementById('account');

        if (this.isAuthenticated && this.currentUser) {
            if (logInBtn) {
                logInBtn.style.display = 'none';
            }
            if (accountBtn) {
                accountBtn.style.display = 'flex';
                accountBtn.title = this.currentUser.username || this.currentUser.email;
            }
        } else {
            if (logInBtn) {
                logInBtn.style.display = 'block';
                logInBtn.textContent = 'Log in';
            }
            if (accountBtn) {
                accountBtn.style.display = 'none';
            }
        }
    }

    async checkAuthStatus() {
        if (this.isAuthenticated) {
            try {
                const profile = await api.getProfile();
                this.currentUser = profile.data;
                this.updateUI();
            } catch (error) {
                this.logout();
            }
        }
    }
    
    async register(email, password, username) {
        try {
            const response = await api.register(email, password, username);
            this.currentUser = response.data;
            this.isAuthenticated = true;
            this.updateUI();
            return response;
        } catch (error) {
            throw new Error(error.message || 'Registration failed');
        }
    }

    async login(email, password) {
        try {
            const response = await api.login(email, password);
            api.setToken(response.token);   
            this.currentUser = response.user;
            this.isAuthenticated = true;
            this.updateUI();
            return response;
        } catch (error) {
            throw new Error(error.message || 'Login failed');
        }
    }

    async logout() {
        try {
            await api.logout();
        } catch (error) {
            console.error('Logout error:', error);
        }
        this.currentUser = null;
        this.isAuthenticated = false;
        api.setToken(null);
        this.updateUI();
    }

    handleOAuthRedirect() {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        const refreshToken = params.get('refreshToken');

        if (token) {
            api.setToken(token);
            localStorage.setItem('refreshToken', refreshToken);

            this.isAuthenticated = true;
            window.history.replaceState({}, document.title, window.location.pathname);

            this.checkAuthStatus();
        }
    }

    showAuthModal() {
        const mainContainer = document.getElementById('view-container');
        mainContainer.innerHTML = `
            <div class="auth-container">
                <div class="auth-panel">
                    <h2>Echo</h2>
                    <p>Your personal music app</p>
                    
                    <div class="auth-tabs">
                        <button class="tab-btn active" data-tab="login">Login</button>
                        <button class="tab-btn" data-tab="register">Register</button>
                    </div>

                    <div id="login-tab" class="tab-content active">
                        <form id="loginForm">
                            <input type="email" placeholder="Email" required>
                            <input type="password" placeholder="Password" required>
                            <button type="submit">Login</button>
                            <div class="error-message" id="loginError"></div>
                        </form>
                    </div>

                    <div id="register-tab" class="tab-content">
                        <form id="registerForm">
                            <input type="email" placeholder="Email" required>
                            <input type="text" placeholder="Display Name" required>
                            <input type="password" placeholder="Password" required>
                            <input type="password" placeholder="Confirm Password" required>
                            <button type="submit">Register</button>
                            <div class="error-message" id="registerError"></div>
                        </form>
                    </div>

                    <div class="auth-divider">or</div>
                    
                    <button id="googleAuthBtn" class="oauth-btn">
                        <img src="assets/google_icon.svg" alt="Google" style="width: 20px; height: 20px; margin-right: 10px;">
                        Continue with Google
                    </button>
                </div>
            </div>
        `;

        this.setupAuthHandlers();
    }

    setupAuthHandlers() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');
        const googleAuthBtn = document.getElementById('googleAuthBtn');

        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                tabButtons.forEach(b => b.classList.remove('active'));
                tabContents.forEach(tc => tc.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(`${tabName}-tab`).classList.add('active');
            });
        });

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const [email, password] = [
                loginForm.querySelector('input[type="email"]').value,
                loginForm.querySelector('input[type="password"]').value, /*Password Security through encryption is yet to be added*/
            ];
            try {
                await this.login(email, password);
                document.getElementById('homeBtn').click();
            } catch (error) {
                document.getElementById('loginError').textContent = error.message;
            }
        });

        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const [email, username, password, confirmPassword] = [
                registerForm.querySelectorAll('input')[0].value,
                registerForm.querySelectorAll('input')[1].value,
                registerForm.querySelectorAll('input')[2].value,
                registerForm.querySelectorAll('input')[3].value,
            ];

            if (password !== confirmPassword) {
                document.getElementById('registerError').textContent = 'Passwords do not match';
                return;
            }

            try {
                await this.register(email, password, username);
                document.getElementById('homeBtn').click();
            } catch (error) {
                document.getElementById('registerError').textContent = error.message;
            }
        });

        googleAuthBtn.addEventListener('click', async () => {
            try {
                const authUrl = await api.getGoogleAuthUrl();
                window.location.href = authUrl.url;
                setTimeout(() => this.checkAuthStatus(), 2000);
            } catch (error) {
                console.error('Google auth error:', error);
            }
        });
    }

    showProfileModal() {
        if (!this.isAuthenticated) {
            this.showAuthModal();
            return;
        }

        const mainContainer = document.getElementById('view-container');
        mainContainer.innerHTML = `
            <div class="profile-container">
                <div class="profile-header">
                    <img src="assets/siacover.jpg" alt="Profile" class="profile-pic">
                    <div class="profile-info">
                        <h2>${this.currentUser.username || this.currentUser.email}</h2>
                        <p>${this.currentUser.email}</p>
                    </div>
                </div>

                <div class="profile-section">
                    <h3>Statistics</h3>
                    <div id="profileStats" class="stats-grid">
                        <div class="stat-item">
                            <span class="stat-value">0</span>
                            <span class="stat-label">Songs Listened</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value">0</span>
                            <span class="stat-label">Playlists Created</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value">0</span>
                            <span class="stat-label">Favorites</span>
                        </div>
                    </div>
                </div>

                <div class="profile-section">
                    <h3>Settings</h3>
                    <button id="logoutBtn" class="btn-primary">Logout</button>
                </div>
            </div>
        `;

        document.getElementById('logoutBtn').addEventListener('click', async () => {
            await this.logout();
            document.getElementById('homeBtn').click();
        });

        api.getUserStats().then(stats => {
            const statsDiv = document.getElementById('profileStats');
            if (statsDiv && stats.data) {
                const items = statsDiv.querySelectorAll('.stat-item');
                if (items[0]) items[0].querySelector('.stat-value').textContent = stats.data.totalPlays || 0;
                if (items[1]) items[1].querySelector('.stat-value').textContent = stats.data.playlistsCount || 0;
                if (items[2]) items[2].querySelector('.stat-value').textContent = stats.data.favoritesCount || 0;
            }
        }).catch(console.error);
    }
}

export const authManager = new AuthManager();
