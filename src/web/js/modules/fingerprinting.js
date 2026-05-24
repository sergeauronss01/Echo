// --- Fingerprinting Module ---
// Audio identification through acoustic fingerprinting

import { api } from '../api.js';
import { authManager } from '../auth.js';

document.addEventListener('DOMContentLoaded', () => {
    const fingerprintBtn = document.getElementById('navFingerprintBtn');
    const viewContainer = document.getElementById('view-container');

    if (fingerprintBtn) {
        fingerprintBtn.addEventListener('click', () => loadFingerprintView());
    }
});

async function loadFingerprintView() {
    const viewContainer = document.getElementById('view-container');
    const token = localStorage.getItem('token');

    if (!token) {
        viewContainer.innerHTML = `
            <div class="auth-required" style="place-self: center; align-self: center; width: 500px;">
                <p>Please log in to use the fingerprinting feature</p>
                <button id="login-redirect-btn">Log In</button>
            </div>`;
        
        document.getElementById('login-redirect-btn')?.addEventListener('click', () => {
            authManager.showAuthModal();
        });
        return;
    }

    viewContainer.innerHTML = `
        <div class="fingerprint-container">
            <div class="fingerprint-header">
                <h2>🎧 Identify Songs</h2>
                <p>Upload an audio file or record a snippet to find matching songs</p>
            </div>

            <div class="fingerprint-tabs">
                <button class="tab-btn active" data-tab="upload">Upload Audio</button>
                <button class="tab-btn" data-tab="record">Record Audio</button>
                <button class="tab-btn" data-tab="history">Match History</button>
            </div>

            <div id="upload-tab" class="tab-content active">
                <div class="upload-area" id="uploadArea">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                    <p>Drag audio here or <span class="browse-link">browse files</span></p>
                    <input type="file" accept="audio/*" hidden id="audioInput">
                </div>
            </div>

            <div id="record-tab" class="tab-content">
                <div class="record-controls">
                    <button id="recordBtn" class="record-btn">🎤 Start Recording</button>
                    <span id="recordingTime" class="recording-time" style="display: none;">00:00</span>
                </div>
                <p class="record-hint">Record at least 10 seconds of audio for better matching</p>
            </div>

            <div id="history-tab" class="tab-content">
                <div id="matchHistoryList" class="history-list">
                    <div class="loading">Loading history...</div>
                </div>
            </div>

            <div id="loading" class="fingerprinting-loading" style="display: none;">
                <div class="spinner"></div>
                <p>Analyzing audio...</p>
            </div>

            <div id="results" class="fingerprinting-results" style="display: none;">
                <h3>Matches Found</h3>
                <div id="matchesList" class="matches-list"></div>
            </div>

            <div id="error" class="error-message" style="display: none;"></div>
        </div>
    `;

    setupFingerprintingHandlers();
}

function setupFingerprintingHandlers() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const uploadArea = document.getElementById('uploadArea');
    const audioInput = document.getElementById('audioInput');
    const recordBtn = document.getElementById('recordBtn');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(tc => tc.classList.remove('active'));
            btn.classList.add('active');
            const tab = document.getElementById(`${tabName}-tab`);
            if (tab) {
                tab.classList.add('active');
                if (tabName === 'history') loadMatchHistory();
            }
        });
    });

    uploadArea.addEventListener('click', () => audioInput.click());
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#1F969A';
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = '#444';
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file?.type.startsWith('audio/')) {
            processAudio(file);
        }
    });

    audioInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) processAudio(file);
    });

    const browseLink = document.querySelector('.browse-link');
    if (browseLink) browseLink.addEventListener('click', () => audioInput.click());

    let mediaRecorder;
    let recordingChunks = [];
    let recordingStartTime;

    recordBtn.addEventListener('click', async () => {
        if (recordBtn.textContent.includes('Start')) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                recordingChunks = [];
                recordingStartTime = Date.now();

                mediaRecorder.ondataavailable = (e) => recordingChunks.push(e.data);
                mediaRecorder.onstop = async () => {
                    const audioBlob = new Blob(recordingChunks, { type: 'audio/webm' });
                    processRecording(audioBlob);
                    stream.getTracks().forEach(track => track.stop());
                };

                mediaRecorder.start();
                recordBtn.textContent = '⏹ Stop Recording';
                document.getElementById('recordingTime').style.display = 'inline';

                const timerId = setInterval(() => {
                    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
                    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
                    const secs = String(elapsed % 60).padStart(2, '0');
                    document.getElementById('recordingTime').textContent = `${mins}:${secs}`;
                }, 100);

                recordBtn.dataset.timerId = timerId;
            } catch (err) {
                showError('Microphone access denied');
            }
        } else {
            mediaRecorder.stop();
            recordBtn.textContent = '🎤 Start Recording';
            clearInterval(recordBtn.dataset.timerId);
            document.getElementById('recordingTime').style.display = 'none';
        }
    });
}

async function processAudio(file) {
    const loaderEl = document.getElementById('loading');
    const resultsEl = document.getElementById('results');
    const errorEl = document.getElementById('error');

    if (loaderEl) loaderEl.style.display = 'flex';
    if (resultsEl) resultsEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';

    try {
        const data = await api.fingerprintUpload(file);
        const identification = data.data?.identification || {};
        displayMatches(identification.matches || [], identification.confidence || 0);
    } catch (err) {
        showError(err.message || 'Failed to identify song');
    } finally {
        if (loaderEl) loaderEl.style.display = 'none';
    }
}

async function processRecording(audioBlob) {
    const loaderEl = document.getElementById('loading');
    const resultsEl = document.getElementById('results');
    const errorEl = document.getElementById('error');

    if (loaderEl) loaderEl.style.display = 'flex';
    if (resultsEl) resultsEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';

    try {
        const data = await api.fingerprintRecord(audioBlob);
        const identification = data.data?.identification || {};
        displayMatches(identification.matches || [], identification.confidence || 0);
    } catch (err) {
        showError(err.message || 'Failed to analyze recording');
    } finally {
        if (loaderEl) loaderEl.style.display = 'none';
    }
}

function displayMatches(matches, confidence = 0) {
    const resultsEl = document.getElementById('results');
    const matchesListEl = document.getElementById('matchesList');

    if (!matches || matches.length === 0) {
        if (matchesListEl) matchesListEl.innerHTML = '<p class="no-matches">No matches found. Try another audio sample.</p>';
        if (resultsEl) resultsEl.style.display = 'block';
        return;
    }

    if (matchesListEl) {
        matchesListEl.innerHTML = matches.map(match => `
            <div class="match-item">
                <div class="match-info">
                    <h4>${match.title || 'Unknown'}</h4>
                    <p>${match.artists || 'Unknown Artist'}</p>
                    <div class="confidence-bar">
                        <div class="confidence-fill" style="width: ${(confidence * 100).toFixed(1)}%"></div>
                    </div>
                    <span class="confidence-text">${(confidence * 100).toFixed(1)}% match</span>
                </div>
                <button class="add-btn"
                    data-title="${match.title}"
                    data-artist="${match.artists}">
                    Add to Library
                </button>
            </div>
        `).join('');

        matchesListEl.querySelectorAll('.add-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const title  = btn.dataset.title;
                const artist = btn.dataset.artist;
                const query  = `${artist} - ${title}`;

                btn.textContent = '⏳ Downloading…';
                btn.disabled = true;

                try {
                    const response = await api.batchDownload([query]);
                    const result   = response.results?.[0];

                    if (result?.success) {
                        btn.textContent = '✓ Added to Library';
                    } else {
                        btn.textContent = 'Add to Library';
                        btn.disabled = false;
                        alert(`Download failed: ${result?.error || 'Unknown error'}`);
                    }
                } catch (err) {
                    btn.textContent = 'Add to Library';
                    btn.disabled = false;
                    alert(`Error: ${err.message}`);
                }
            });
        });
    }

    if (resultsEl) resultsEl.style.display = 'block';
}

async function loadMatchHistory() {
    const historyList = document.getElementById('matchHistoryList');
    if (!historyList) return;

    historyList.innerHTML = '<div class="loading">Loading history...</div>';

    try {
        const data = await api.getFingerprintHistory();
        const history = data.data || [];

        if (history.length === 0) {
            historyList.innerHTML = '<p>No matching history yet</p>';
            return;
        }

        historyList.innerHTML = history.map(item => `
            <div class="history-item">
                <div class="history-info">
                    <h4>${item.title || 'Unknown'}</h4>
                    <p>${item.artist || 'Unknown Artist'}</p>
                    <span class="history-date">${new Date(item.matched_at).toLocaleDateString()}</span>
                </div>
                <span class="confidence-badge">${((item.confidence || 0) * 100).toFixed(0)}%</span>
            </div>
        `).join('');
    } catch (error) {
        historyList.innerHTML = `<p>Error loading history: ${error.message}</p>`;
    }
}

function showError(message) {
    const errorEl = document.getElementById('error');
    if (errorEl) {
        errorEl.textContent = `❌ ${message}`;
        errorEl.style.display = 'block';
    }
}
