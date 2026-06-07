// --- Music Player Module ---
// Handles audio playback, timeline control, playback logging, and queue management

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
const repeatBtn = document.getElementById('repeatBtn');
const repeatBtnImg = repeatBtn?.querySelector('img');
const shuffleBtn = document.getElementById('shuffleBtn');
const shuffleBtnImg = shuffleBtn?.querySelector('img');
const nextBtn = document.getElementById('nextBtn');
const previousBtn = document.getElementById('previousBtn');
const songNameEl = document.querySelector('.songName');
const artistNameEl = document.querySelector('.artistName');
const songCoverEl = document.querySelector('.songCover');
const audioElement = document.getElementById('audioPlayer');

let duration = 180;
let current = 0;
let lastSecondUpdated = -1;
let isDragging = false;
let isPlaying = false;
let lastUpdate = performance.now();
let currentSongId = null;
let currentSongTotalDuration = null;
let audio = audioElement;
const REPEAT_MODES = ['off', 'all', 'one'];
let repeatModeIndex = 0;
let repeatMode = REPEAT_MODES[repeatModeIndex];
let hasLoadedSong = false;

// --- Queue Management ---
let queue = [];
let currentQueueIndex = -1;
let isPlaylistMode = false;
let isShuffleMode = false;
let shuffledQueue = [];

// --- Initialization ---

// Base visual state: no song loaded yet
if (currentTimeEl) currentTimeEl.textContent = '--:--';
if (totalTimeEl) totalTimeEl.textContent = '--:--';
if (progress) progress.style.width = '0%';
if (thumb) thumb.style.left = '0%';

if (audio) {
    audio.addEventListener('loadedmetadata', () => {
        if (!isNaN(audio.duration) && audio.duration > 0) {
            setDuration(audio.duration);
        }
        setCurrentTime(0);
    });

    audio.addEventListener('play', () => {
        isPlaying = true;
        if (pausePlayImg) {
            pausePlayImg.src = 'assets/pause.svg';
        }
    });

    audio.addEventListener('pause', () => {
        isPlaying = false;
        if (pausePlayImg) {
            pausePlayImg.src = 'assets/play.svg';
        }
    });

    audio.addEventListener('ended', async () => {
        if (currentSongId && authManager.isAuthenticated) {
            const played = Math.floor(audio.currentTime || current);
            const total = Math.floor(audio.duration || currentSongTotalDuration || played);
            api.logPlayback(currentSongId, played, total).catch(console.error);
        }

        if (repeatMode === 'one') {
            if (!isNaN(audio.duration)) {
                audio.currentTime = 0;
            } else {
                setCurrentTime(0);
            }
            isPlaying = true;
            if (pausePlayImg) pausePlayImg.src = 'assets/pause.svg';
            audio.play().catch(console.error);
        } else if (repeatMode === 'all') {
            await playNext().catch(console.error);
        } else {
            await playNext().catch(console.error);
        }
    });
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function updateUI(percent) {
    percent = Math.max(0, Math.min(1, percent));
    const displayPercent = (percent * 100).toFixed(2) + '%';

    if (progress) progress.style.width = displayPercent;
    if (thumb) thumb.style.left = displayPercent;
    if (currentTimeEl) currentTimeEl.textContent = formatTime(current);
}

function getPercentFromEvent(event) {
    if (!timeline) return 0;
    const rect = timeline.getBoundingClientRect();
    const clientX = event.touches?.[0]?.clientX ?? event.clientX;
    const x = clientX - rect.left;
    return x / rect.width;
}

function seekToPercent(percent) {
    percent = Math.max(0, Math.min(1, percent));
    const newTime = duration * percent;
    setCurrentTime(newTime);
}

// --- Event Listeners ---

if (pausePlayBtn) {
    pausePlayBtn.addEventListener('click', () => {
        if (!hasLoadedSong) return;
        if (!audio) return;
        if (audio.paused) {
            audio.play().catch(console.error);
            isPlaying = true;
        } else {
            audio.pause();
            isPlaying = false;
        }
        if (pausePlayImg) {
            pausePlayImg.src = isPlaying ? 'assets/pause.svg' : 'assets/play.svg';
        }
    });
}

if (repeatBtn) {
    repeatBtn.addEventListener('click', () => {
        if (!hasLoadedSong) return;
        repeatModeIndex = (repeatModeIndex + 1) % REPEAT_MODES.length;
        repeatMode = REPEAT_MODES[repeatModeIndex];

        if (!repeatBtnImg) return;

        if (repeatMode === 'off') {
            repeatBtnImg.src = 'assets/repeat.svg';
        } else if (repeatMode === 'all') {
            repeatBtnImg.src = 'assets/repeat_all.svg';
        } else if (repeatMode === 'one') {
            repeatBtnImg.src = 'assets/repeat_one.svg';
        }
    });
}

if (shuffleBtn) {
    shuffleBtn.addEventListener('click', () => {
        if (!hasLoadedSong || queue.length === 0) return;
        isShuffleMode = !isShuffleMode;

        if (shuffleBtnImg) {
            shuffleBtnImg.src = isShuffleMode ? 'assets/shuffle_activated.svg' : 'assets/shuffle.svg';
        }

        if (isShuffleMode) {
            generateShuffledQueue();
        }
    });
}

if (nextBtn) {
    nextBtn.addEventListener('click', async () => {
        if (!hasLoadedSong || queue.length === 0) return;
        await playNext().catch(console.error);
    });
}

if (previousBtn) {
    previousBtn.addEventListener('click', async () => {
        if (!hasLoadedSong || queue.length === 0) return;
        await playPrevious().catch(console.error);
    });
}

if (timeline) {
    timeline.addEventListener('mousedown', (event) => {
        if (!hasLoadedSong) return;
        isDragging = true;
        timeline.classList.add('active');
        seekToPercent(getPercentFromEvent(event));
        document.body.style.userSelect = 'none';
    });

    timeline.addEventListener('touchstart', (event) => {
        if (!hasLoadedSong) return;
        isDragging = true;
        timeline.classList.add('active');
        seekToPercent(getPercentFromEvent(event));
        document.body.style.userSelect = 'none';
        event.preventDefault();
    }, { passive: false });
}

document.addEventListener('mousemove', (event) => {
    if (!isDragging || !timeline) return;
    seekToPercent(getPercentFromEvent(event));
});

document.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        timeline.classList.remove('active');
        document.body.style.userSelect = '';
    }
});

document.addEventListener('touchmove', (event) => {
    if (!isDragging || !timeline) return;
    seekToPercent(getPercentFromEvent(event));
    event.preventDefault();
}, { passive: false });

document.addEventListener('touchend', () => {
    if (isDragging) {
        isDragging = false;
        timeline.classList.remove('active');
        document.body.style.userSelect = '';
    }
}, { passive: false });

// --- Song Control Functions ---

export async function loadSong(song, queueToLoad = null, isPlaylist = false) {
    if (!song || !song.id) return;

    hasLoadedSong = true;

    currentSongId = song.id;
    currentSongTotalDuration = song.duration || null;

    if (queueToLoad && queueToLoad.length > 0) {
        queue = queueToLoad;
        currentQueueIndex = Math.max(0, Math.min(queue.findIndex(s => s.id === song.id), queue.length - 1));
        if (currentQueueIndex === -1 || queue[currentQueueIndex]?.id !== song.id) {
            currentQueueIndex = 0;
        }
        isPlaylistMode = isPlaylist;
    } else {
        queue = [song];
        currentQueueIndex = 0;
        isPlaylistMode = false;
    }

    let streamUrl = null;
    try {
        streamUrl = await api.getStreamUrl(song.id);
    } catch (err) {
        console.error('Error fetching stream URL:', err);
        return;
    }

    if (songNameEl) songNameEl.textContent = song.title || 'Unknown';
    if (artistNameEl) artistNameEl.textContent = song.artist || 'Unknown Artist';
    if (songCoverEl) songCoverEl.src = song.coverUrl || 'assets/siacover.jpg';

    current = 0;
    isPlaying = false;
    duration = typeof song.duration === 'number' && song.duration > 0
        ? song.duration
        : duration;

    if (totalTimeEl) totalTimeEl.textContent = formatTime(duration);
    updateUI(0);

    if (pausePlayImg) {
        pausePlayImg.src = 'assets/play.svg';
    }

    if (audio && streamUrl) {
        audio.src = streamUrl;
        audio.load();
    }
}

export function setQueue(newQueue, startIndex = 0, isPlaylist = false) {
    queue = newQueue || [];
    currentQueueIndex = Math.max(0, Math.min(startIndex, queue.length - 1));
    isPlaylistMode = isPlaylist;
    isShuffleMode = false;
    if (shuffleBtnImg) {
        shuffleBtnImg.src = 'assets/shuffle.svg';
    }
}

function generateShuffledQueue() {
    shuffledQueue = [...queue].sort(() => Math.random() - 0.5);
}

async function playNext() {
    if (queue.length === 0) return;

    const currentSong = queue[currentQueueIndex];
    if (!currentSong) return;

    if (isShuffleMode) {
        if (shuffledQueue.length === 0) generateShuffledQueue();
        const shuffleIndex = shuffledQueue.findIndex(s => s.id === currentSong.id);
        if (shuffleIndex !== -1 && shuffleIndex < shuffledQueue.length - 1) {
            const nextSongInShufflQueue = shuffledQueue[shuffleIndex + 1];
            currentQueueIndex = queue.findIndex(s => s.id === nextSongInShufflQueue.id);
        } else {
            generateShuffledQueue();
            currentQueueIndex = queue.findIndex(s => s.id === shuffledQueue[0].id);
        }
    } else {
        if (currentQueueIndex < queue.length - 1) {
            currentQueueIndex++;
        } else {
            currentQueueIndex = 0;
        }
    }

    const nextSong = queue[currentQueueIndex];
    if (nextSong) {
        await loadSong(nextSong, queue, isPlaylistMode);
        audio?.play().catch(console.error);
    }
}

async function playPrevious() {
    if (queue.length === 0) return;

    const currentSong = queue[currentQueueIndex];
    if (!currentSong) return;

    if (isShuffleMode) {
        if (shuffledQueue.length === 0) generateShuffledQueue();
        const shuffleIndex = shuffledQueue.findIndex(s => s.id === currentSong.id);
        if (shuffleIndex > 0) {
            const prevSongInShufflQueue = shuffledQueue[shuffleIndex - 1];
            currentQueueIndex = queue.findIndex(s => s.id === prevSongInShufflQueue.id);
        } else {
            generateShuffledQueue();
            currentQueueIndex = queue.findIndex(s => s.id === shuffledQueue[shuffledQueue.length - 1].id);
        }
    } else {
        if (currentQueueIndex > 0) {
            currentQueueIndex--;
        } else {
            currentQueueIndex = queue.length - 1;
        }
    }

    const prevSong = queue[currentQueueIndex];
    if (prevSong) {
        await loadSong(prevSong, queue, isPlaylistMode);
        audio?.play().catch(console.error);
    }
}

export function setDuration(seconds) {
    if (typeof seconds === 'number' && seconds > 0) {
        duration = seconds;
        if (totalTimeEl) totalTimeEl.textContent = formatTime(duration);
    }
}

export function getCurrentTime() {
    return current;
}

export function setCurrentTime(seconds) {
    current = Math.max(0, Math.min(seconds, duration));
    const percent = duration > 0 ? current / duration : 0;
    updateUI(percent);
    if (audio && !isNaN(audio.duration)) {
        audio.currentTime = current;
    }
}

// --- Animation Loop ---

function animate(now) {
    const delta = (now - lastUpdate) / 1000;
    lastUpdate = now;

    if (audio && !audio.paused && !isDragging) {
        current = audio.currentTime || current + delta;
        const effectiveDuration = !isNaN(audio.duration) && audio.duration > 0 ? audio.duration : duration;
        const percent = effectiveDuration > 0 ? current / effectiveDuration : 0;
        const currentSec = Math.floor(current);

        if (currentSec !== lastSecondUpdated) {
            updateUI(percent);
            lastSecondUpdated = currentSec;
        }
    }
    requestAnimationFrame(animate);
}

requestAnimationFrame(animate);