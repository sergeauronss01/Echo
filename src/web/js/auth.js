import { api } from './api.js';

class AuthManager {
    constructor() {
        this.currentUser     = null;
        this.isAuthenticated = !!localStorage.getItem('token');

        const token = localStorage.getItem('token');
        if (token) api.setToken(token);
    }

    updateUI() {
        const logInBtn   = document.getElementById('logInBtn');
        const accountBtn = document.getElementById('account');

        if (this.isAuthenticated && this.currentUser) {
            logInBtn  && (logInBtn.style.display  = 'none');
            accountBtn && (accountBtn.style.display = 'flex');
            if (accountBtn) accountBtn.title = this.currentUser.username || this.currentUser.email;
        } else {
            if (logInBtn) {
                logInBtn.style.display  = 'block';
                logInBtn.textContent    = 'Log in';
            }
            accountBtn && (accountBtn.style.display = 'none');
        }
    }

    async checkAuthStatus() {
        if (!this.isAuthenticated) return;

        try {
            const profile    = await api.getProfile();
            this.currentUser = profile.data;
            this.updateUI();
        } catch {
            this.isAuthenticated = false;
            api.setToken(null);
            localStorage.removeItem('refreshToken');
            this.updateUI();
        }
    }

    async register(email, password, username) {
        const response       = await api.register(email, password, username);
        this.currentUser     = response.user || response.data;
        this.isAuthenticated = true;
        this.updateUI();
        return response;
    }

    async login(email, password) {
        const response       = await api.login(email, password);
        this.currentUser     = response.user;
        this.isAuthenticated = true;
        this.updateUI();
        return response;
    }

    async logout() {
        try { await api.logout(); } catch { /* ignore network errors on logout */ }
        this.currentUser     = null;
        this.isAuthenticated = false;
        api.setToken(null);
        localStorage.removeItem('refreshToken');
        this.updateUI();
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
                        <button class="tab-btn"        data-tab="register">Register</button>
                    </div>

                    <div id="login-tab" class="tab-content active">
                        <form id="loginForm">
                            <input type="email"    placeholder="Email"    required>
                            <input type="password" placeholder="Password" required>
                            <button type="submit">Login</button>
                            <div class="error-message" id="loginError"></div>
                        </form>
                    </div>

                    <div id="register-tab" class="tab-content">
                        <form id="registerForm">
                            <input type="email"    placeholder="Email"            required>
                            <input type="text"     placeholder="Display Name"     required>
                            <input type="password" placeholder="Password"         required>
                            <input type="password" placeholder="Confirm Password" required>
                            <button type="submit">Register</button>
                            <div class="error-message" id="registerError"></div>
                        </form>
                    </div>

                    <div class="auth-divider">or</div>

                    <button id="googleAuthBtn" class="oauth-btn">
                        <img src="assets/google_icon.svg" alt="Google"
                             style="width:20px;height:20px;margin-right:10px;">
                        Continue with Google
                    </button>
                </div>
            </div>
        `;

        this._setupAuthHandlers();
    }

    _setupAuthHandlers() {
        const tabButtons  = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');
        const loginForm   = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');
        const googleBtn   = document.getElementById('googleAuthBtn');

        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                tabButtons.forEach(b  => b.classList.remove('active'));
                tabContents.forEach(tc => tc.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(`${btn.dataset.tab}-tab`).classList.add('active');
            });
        });

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email    = loginForm.querySelector('input[type="email"]').value;
            const password = loginForm.querySelector('input[type="password"]').value;
            try {
                await this.login(email, password);
                document.getElementById('homeBtn').click();
            } catch (err) {
                document.getElementById('loginError').textContent = err.message;
            }
        });

        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const inputs = registerForm.querySelectorAll('input');
            const [email, username, password, confirm] = [...inputs].map(i => i.value);

            if (password !== confirm) {
                document.getElementById('registerError').textContent = 'Passwords do not match';
                return;
            }
            try {
                await this.register(email, password, username);
                document.getElementById('homeBtn').click();
            } catch (err) {
                document.getElementById('registerError').textContent = err.message;
            }
        });

        googleBtn.addEventListener('click', () => {
            window.location.href = '/api/auth/google/url';
        });
    }

    showProfileModal() {
        if (!this.isAuthenticated) { this.showAuthModal(); return; }

        const mainContainer = document.getElementById('view-container');
        mainContainer.innerHTML = `
            <div class="profile-container">
                <div class="profile-header">
                    <img src="${this.currentUser.profile_picture_url || 'assets/siacover.jpg'}"
                         alt="Profile" class="profile-pic"
                         onerror="this.src='assets/siacover.jpg'">
                    <div class="profile-info">
                        <h2>${this.currentUser.username || this.currentUser.email}</h2>
                        <p>${this.currentUser.email}</p>
                    </div>
                </div>

                <div class="profile-section">
                    <h3>Statistics</h3>
                    <div id="profileStats" class="stats-grid">
                        <div class="stat-item">
                            <span class="stat-value" id="stat-plays">—</span>
                            <span class="stat-label">Songs Listened</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value" id="stat-playlists">—</span>
                            <span class="stat-label">Playlists Created</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value" id="stat-favorites">—</span>
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
                if (items[1]) items[1].querySelector('.stat-value').textContent = stats.data.totalPlaylists || 0;
                if (items[2]) items[2].querySelector('.stat-value').textContent = stats.data.totalListens || 0;
            }
        }).catch(console.error);
    }
}

export const authManager = new AuthManager();
