// --- Music Player Module ---
// Handles audio playback, timeline control, and playback logging

import { api } from './api.js';
import { authManager } from './auth.js';

// --- Selectors ---

const timeline = document.querySelector('.timeline');
const progress = document.querySelector('.progress');
const thumb = document.querySelector('.thumb');
const currentTimeEl = document.querySelector('.current');
const totalTimeEl = document.querySelector('.total');
const pausePlayBtn = document.getElementById('pausePlayBtn');
const pausePlayImg = pausePlayBtn?.querySelector('img');
const songNameEl = document.querySelector('.songName');
const artistNameEl = document.querySelector('.artistName');
const songCoverEl = document.querySelector('.songCover');

let duration = 180;
let current = 0;
let lastSecondUpdated = -1;
let isDragging = false;
let isPlaying = false;
let lastUpdate = performance.now();
let currentSongId = null;
let audio = null;

// --- Initialization ---

if (totalTimeEl) totalTimeEl.textContent = formatTime(duration);
updateUI(0);

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function updateUI(percent) {
    percent = Math.max(0, Math.min(1, percent));
    current = percent * duration;
    const displayPercent = (percent * 100).toFixed(2) + '%';
    
    if (progress) progress.style.width = displayPercent;
    if (thumb) thumb.style.left = displayPercent;
    if (currentTimeEl) currentTimeEl.textContent = formatTime(current);
}

function getPercentFromEvent(event) {
    if (!timeline) return 0;
    const rect = timeline.getBoundingClientRect();
    const x = (event.clientX || event.touches?.[0].clientX) - rect.left;
    return x / rect.width;
}

// --- Event Listeners ---

if (pausePlayBtn) {
    pausePlayBtn.addEventListener('click', () => {
        isPlaying = !isPlaying;
        if (pausePlayImg) {
            pausePlayImg.src = isPlaying ? 'assets/pause.svg' : 'assets/play.svg';
        }
    });
}

if (timeline) {
    timeline.addEventListener('mousedown', (event) => {
        isDragging = true;
        timeline.classList.add('active');
        updateUI(getPercentFromEvent(event));
        document.body.style.userSelect = 'none';
    });
}

document.addEventListener('mousemove', (event) => {
    if (!isDragging || !timeline) return;
    updateUI(getPercentFromEvent(event));
});

document.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        timeline.classList.remove('active');
        document.body.style.userSelect = '';
    }
});

// --- Song Control Functions ---

export async function loadSong(songId, title, artist, coverUrl) {
    currentSongId = songId;
    
    if (songNameEl) songNameEl.textContent = title;
    if (artistNameEl) artistNameEl.textContent = artist;
    if (songCoverEl) songCoverEl.src = coverUrl || 'assets/siacover.jpg';
    
    current = 0;
    isPlaying = false;
    duration = 180;
    
    if (totalTimeEl) totalTimeEl.textContent = formatTime(duration);
    updateUI(0);
    
    if (pausePlayImg) {
        pausePlayImg.src = 'assets/play.svg';
    }
    
    if (authManager.isAuthenticated) {
        try {
            await api.logPlayback(songId, 0);
        } catch (error) {
            console.error('Error logging playback:', error);
        }
    }
}

export function setDuration(seconds) {
    duration = seconds;
    if (totalTimeEl) totalTimeEl.textContent = formatTime(duration);
}

export function getCurrentTime() {
    return current;
}

export function setCurrentTime(seconds) {
    current = Math.max(0, Math.min(seconds, duration));
    const percent = duration > 0 ? current / duration : 0;
    updateUI(percent);
}

// --- Animation Loop ---

function animate(now) {
    const delta = (now - lastUpdate) / 1000;
    lastUpdate = now;

    if (isPlaying && !isDragging) {
        current = Math.min(current + delta, duration);
        const percent = duration > 0 ? current / duration : 0;
        const currentSec = Math.floor(current);

        if (currentSec !== lastSecondUpdated) {
            updateUI(percent);
            lastSecondUpdated = currentSec;
        }

        if (current >= duration) {
            isPlaying = false;
            if (pausePlayImg) pausePlayImg.src = 'assets/play.svg';
            if (currentSongId && authManager.isAuthenticated) {
                api.logPlayback(currentSongId, duration).catch(console.error);
            }
        }
    }
    requestAnimationFrame(animate);
}

requestAnimationFrame(animate);