// --- Music Player Module (Union) ---
// Handles audio playback, timeline control, playback logging, queue management, volume, and synced lyrics

import { api } from './api.js';
import { authManager } from './auth.js';

// ─── Selectors ────────────────────────────────────────────────────────────────

const timeline = document.querySelector('.timeline');
const progress = document.querySelector('.progress');
const thumb = document.querySelector('.thumb');
const currentTimeEl = document.querySelector('.current');
const totalTimeEl = document.querySelector('.total');
const pausePlayBtn = document.getElementById('pausePlayBtn');
const pausePlayImg = pausePlayBtn?.querySelector('img');
const repeatBtn = document.getElementById('repeatBtn');
const repeatBtnImg = repeatBtn?.querySelector('img');
const shuffleBtn = document.getElementById('shuffleBtn'); // From File 1
const shuffleBtnImg = shuffleBtn?.querySelector('img');     // From File 1
const nextBtn = document.getElementById('nextBtn');       // From File 1
const previousBtn = document.getElementById('previousBtn'); // From File 1
const songNameEl = document.querySelector('.songName');
const artistNameEl = document.querySelector('.artistName');
const songCoverEl = document.querySelector('.songCover');
const audioElement = document.getElementById('audioPlayer');

// Volume (From File 2)
const volumeSlider = document.getElementById('volumeSlider');

// Lyrics panel (From File 2)
const lyricsBtn = document.getElementById('lyricsBtn');
const lyricsBtnImg = lyricsBtn?.querySelector('img');
const lyricsPanel = document.getElementById('lyricsPanel');
const closeLyricsBtn = document.getElementById('closeLyricsBtn');
const syncedLyricsBtn = document.getElementById('syncedLyricsBtn');
const plainLyricsBtn = document.getElementById('plainLyricsBtn');
const lyricsContent = document.getElementById('lyricsContent');
const lyricsSongTitle = document.getElementById('lyricsSongTitle');
const lyricsSongArtist = document.getElementById('lyricsSongArtist');

// ─── Playback & Queue State ───────────────────────────────────────────────────

let duration = 180;
let current = 0;
let lastSecondUpdated = -1;
let isDragging = false;
let isPlaying = false;
let lastUpdate = performance.now();
let currentSongId = null;
let currentSongTotalDuration = null;
let audio = audioElement;
let hasLoadedSong = false;

const REPEAT_MODES = ['off', 'all', 'one'];
let repeatModeIndex = 0;
let repeatMode = REPEAT_MODES[repeatModeIndex];

// Queue Management (From File 1)
let queue = [];
let currentQueueIndex = -1;
let isPlaylistMode = false;
let isShuffleMode = false;
let shuffledQueue = [];

// Supabase URL (Priority: File 2)
const supabaseUrl = 'https://outtpsqnptpihgyhznmy.supabase.co';

// ─── Lyrics State (From File 2) ───────────────────────────────────────────────

let currentPlainLyrics = null;   
let syncedLyricsData = [];     
let lyricsVisible = false;
let lyricsMode = 'synced'; 
let lastActiveLyricsIndex = -1;
let currentSongTitle = '';
let currentSongArtist = '';

// ─── Initial UI state ─────────────────────────────────────────────────────────

if (currentTimeEl) currentTimeEl.textContent = '--:--';
if (totalTimeEl) totalTimeEl.textContent = '--:--';
if (progress) progress.style.width = '0%';
if (thumb) thumb.style.left = '0%';

// ─── Audio element listeners ──────────────────────────────────────────────────

if (audio) {
    audio.addEventListener('loadedmetadata', () => {
        if (!isNaN(audio.duration) && audio.duration > 0) {
            setDuration(audio.duration);
        }
        setCurrentTime(0);
    });

    audio.addEventListener('play', () => {
        isPlaying = true;
        if (pausePlayImg) pausePlayImg.src = 'assets/pause.svg';
    });

    audio.addEventListener('pause', () => {
        isPlaying = false;
        if (pausePlayImg) pausePlayImg.src = 'assets/play.svg';
    });

    audio.addEventListener('ended', async () => {
        if (currentSongId && authManager.isAuthenticated) {
            const played = Math.floor(audio.currentTime || current);
            const total = Math.floor(audio.duration || currentSongTotalDuration || played);
            api.logPlayback(currentSongId, played, total).catch(console.error);
        }

        // Union: Retained File 2's specific 'one' logic, mapped File 1's queue traversal to 'all' & 'off'
        if (repeatMode === 'one') {
            audio.currentTime = isNaN(audio.duration) ? 0 : 0;
            setCurrentTime(0);
            isPlaying = true;
            if (pausePlayImg) pausePlayImg.src = 'assets/pause.svg';
            audio.play().catch(console.error);
        } else {
            await playNext().catch(console.error);
        }
    });
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function updateUI(percent) {
    percent = Math.max(0, Math.min(1, percent));
    const pct = (percent * 100).toFixed(2) + '%';
    if (progress) progress.style.width = pct;
    if (thumb) thumb.style.left = pct;
    if (currentTimeEl) currentTimeEl.textContent = formatTime(current);
}

function getPercentFromEvent(event) {
    if (!timeline) return 0;
    const rect = timeline.getBoundingClientRect();
    const clientX = event.touches?.[0]?.clientX ?? event.clientX;
    return (clientX - rect.left) / rect.width;
}

function seekToPercent(percent) {
    percent = Math.max(0, Math.min(1, percent));
    setCurrentTime(duration * percent);
}

// ─── Volume (Priority: File 2) ────────────────────────────────────────────────

function updateVolumeTrack() {
    if (!volumeSlider) return;
    volumeSlider.style.setProperty('--volume-pct', volumeSlider.value + '%');
}

if (volumeSlider) {
    volumeSlider.addEventListener('input', () => {
        if (audio) audio.volume = volumeSlider.value / 100;
        updateVolumeTrack();
    });
    updateVolumeTrack(); 
}

// ─── Lyrics Parser & Rendering (Priority: File 2) ─────────────────────────────

function parseLRC(lrcText) {
    if (!lrcText) return [];
    const result = [];
    for (const line of lrcText.split('\n')) {
        const m = line.match(/^\[(\d{1,2}):(\d{2})\.(\d{2,3})\](.*)/);
        if (!m) continue;
        const time = parseInt(m[1]) * 60
                   + parseInt(m[2])
                   + parseInt(m[3]) / (m[3].length === 3 ? 1000 : 100);
        const text = m[4].trim();
        if (text) result.push({ time, text });
    }
    return result.sort((a, b) => a.time - b.time);
}

function renderLyrics() {
    if (!lyricsContent) return;

    const hasSynced = syncedLyricsData.length > 0;
    const hasPlain = !!currentPlainLyrics;

    if (!hasSynced && !hasPlain) {
        lyricsContent.innerHTML = '<p class="lyrics-empty">No lyrics available for this song</p>';
        return;
    }

    if (lyricsMode === 'synced') {
        if (hasSynced) {
            lyricsContent.innerHTML = syncedLyricsData
                .map((line, i) => `<div class="lyrics-line" data-index="${i}" data-time="${line.time}">${line.text}</div>`)
                .join('');
            lastActiveLyricsIndex = -1; 
        } else {
            lyricsContent.innerHTML = '<p class="lyrics-notice">Synced lyrics unavailable</p>' +
                (hasPlain ? currentPlainLyrics.split('\n').map(l => `<p class="lyrics-plain-line">${l.trim() || '&nbsp;'}</p>`).join('') : '');
        }
    } else {
        const text = currentPlainLyrics || (hasSynced ? syncedLyricsData.map(l => l.text).join('\n') : null);
        lyricsContent.innerHTML = text
            ? text.split('\n').map(l => `<p class="lyrics-plain-line">${l.trim() || '&nbsp;'}</p>`).join('')
            : '<p class="lyrics-empty">No lyrics available</p>';
    }
}

function updateSyncedLyrics() {
    if (!lyricsVisible || lyricsMode !== 'synced' || syncedLyricsData.length === 0 || !lyricsContent) return;

    const now = audio ? audio.currentTime : current;
    let activeIndex = -1;

    for (let i = 0; i < syncedLyricsData.length; i++) {
        if (syncedLyricsData[i].time <= now) activeIndex = i;
        else break;
    }

    if (activeIndex === lastActiveLyricsIndex) return;
    lastActiveLyricsIndex = activeIndex;

    const lines = lyricsContent.querySelectorAll('.lyrics-line');
    lines.forEach((line, i) => line.classList.toggle('active', i === activeIndex));

    if (activeIndex >= 0 && lines[activeIndex]) {
        lines[activeIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function jumpToCurrentLyric() {
    if (lyricsMode !== 'synced' || syncedLyricsData.length === 0 || !lyricsContent) return;

    const now = audio ? audio.currentTime : current;
    let activeIndex = -1;
    for (let i = 0; i < syncedLyricsData.length; i++) {
        if (syncedLyricsData[i].time <= now) activeIndex = i;
        else break;
    }

    lastActiveLyricsIndex = activeIndex;
    const lines = lyricsContent.querySelectorAll('.lyrics-line');
    lines.forEach((line, i) => line.classList.toggle('active', i === activeIndex));
    if (activeIndex >= 0 && lines[activeIndex]) {
        lines[activeIndex].scrollIntoView({ behavior: 'instant', block: 'center' });
    }
}

function openLyricsPanel() {
    if (!hasLoadedSong) return;
    lyricsVisible = true;
    lyricsPanel?.classList.add('active');
    if (lyricsBtnImg) lyricsBtnImg.src = 'assets/lyrics_activated.svg';
    if (lyricsSongTitle) lyricsSongTitle.textContent = currentSongTitle;
    if (lyricsSongArtist) lyricsSongArtist.textContent = currentSongArtist;
    renderLyrics();
    requestAnimationFrame(jumpToCurrentLyric);
}

function closeLyricsPanel() {
    lyricsVisible = false;
    lyricsPanel?.classList.remove('active');
    if (lyricsBtnImg) lyricsBtnImg.src = 'assets/lyrics.svg';
}

// ─── Queue Management (From File 1) ───────────────────────────────────────────

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

// ─── Event Listeners ──────────────────────────────────────────────────────────

if (pausePlayBtn) {
    pausePlayBtn.addEventListener('click', () => {
        if (!hasLoadedSong || !audio) return;
        if (audio.paused) {
            audio.play().catch(console.error);
        } else {
            audio.pause();
        }
    });
}

if (repeatBtn) {
    repeatBtn.addEventListener('click', () => {
        if (!hasLoadedSong) return;
        repeatModeIndex = (repeatModeIndex + 1) % REPEAT_MODES.length;
        repeatMode = REPEAT_MODES[repeatModeIndex];
        if (!repeatBtnImg) return;
        repeatBtnImg.src = repeatMode === 'off' ? 'assets/repeat.svg'
                         : repeatMode === 'all' ? 'assets/repeat_all.svg'
                         : 'assets/repeat_one.svg';
    });
}

// Queue listeners (From File 1)
if (shuffleBtn) {
    shuffleBtn.addEventListener('click', () => {
        if (!hasLoadedSong || queue.length === 0) return;
        isShuffleMode = !isShuffleMode;
        if (shuffleBtnImg) shuffleBtnImg.src = isShuffleMode ? 'assets/shuffle_activated.svg' : 'assets/shuffle.svg';
        if (isShuffleMode) generateShuffledQueue();
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

// Timeline Listeners
if (timeline) {
    timeline.addEventListener('mousedown', e => {
        if (!hasLoadedSong) return;
        isDragging = true;
        timeline.classList.add('active');
        seekToPercent(getPercentFromEvent(e));
        document.body.style.userSelect = 'none';
    });
    timeline.addEventListener('touchstart', e => {
        if (!hasLoadedSong) return;
        isDragging = true;
        timeline.classList.add('active');
        seekToPercent(getPercentFromEvent(e));
        document.body.style.userSelect = 'none';
        e.preventDefault();
    }, { passive: false });
}

document.addEventListener('mousemove', e => {
    if (!isDragging || !timeline) return;
    seekToPercent(getPercentFromEvent(e));
});
document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    timeline?.classList.remove('active');
    document.body.style.userSelect = '';
});
document.addEventListener('touchmove', e => {
    if (!isDragging || !timeline) return;
    seekToPercent(getPercentFromEvent(e));
    e.preventDefault();
}, { passive: false });
document.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    timeline?.classList.remove('active');
    document.body.style.userSelect = '';
}, { passive: false });

// Lyrics Listeners (From File 2)
lyricsBtn?.addEventListener('click', () => {
    lyricsVisible ? closeLyricsPanel() : openLyricsPanel();
});
closeLyricsBtn?.addEventListener('click', closeLyricsPanel);
syncedLyricsBtn?.addEventListener('click', () => {
    lyricsMode = 'synced';
    syncedLyricsBtn.classList.add('active');
    plainLyricsBtn?.classList.remove('active');
    lastActiveLyricsIndex = -1;
    renderLyrics();
    requestAnimationFrame(jumpToCurrentLyric);
});
plainLyricsBtn?.addEventListener('click', () => {
    lyricsMode = 'plain';
    plainLyricsBtn.classList.add('active');
    syncedLyricsBtn?.classList.remove('active');
    renderLyrics();
});
lyricsContent?.addEventListener('click', e => {
    const line = e.target.closest('.lyrics-line');
    if (!line || !line.dataset.time) return;
    const t = parseFloat(line.dataset.time);
    if (!isNaN(t) && audio) {
        setCurrentTime(t);
        if (audio.paused) audio.play().catch(console.error);
    }
});

// ─── Song loading (Union implementation) ──────────────────────────────────────

export async function loadSong(song, queueToLoad = null, isPlaylist = false) {
    if (!song?.id) return;

    hasLoadedSong = true;
    currentSongId = song.id;
    currentSongTotalDuration = song.duration || null;
    currentSongTitle = song.title || 'Unknown';
    currentSongArtist = song.artist || 'Unknown Artist';

    // Queue Logic (From File 1)
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

    // Lyrics State (From File 2)
    currentPlainLyrics = song.lyrics_content || null;
    syncedLyricsData = parseLRC(song.synced_lyrics || null);
    lastActiveLyricsIndex = -1;

    // Stream URL (Priority: File 2 Supabase implementation)
    const streamUrl = `${supabaseUrl}/storage/v1/object/public/songs/audio/${song.youtube_id}.m4a`;

    if (songNameEl) songNameEl.textContent = currentSongTitle;
    if (artistNameEl) artistNameEl.textContent = currentSongArtist;
    if (songCoverEl) songCoverEl.src = song.coverUrl || 'assets/siacover.jpg';

    current = 0;
    isPlaying = false;
    duration = typeof song.duration === 'number' && song.duration > 0 ? song.duration : duration;

    if (totalTimeEl) totalTimeEl.textContent = formatTime(duration);
    updateUI(0);
    if (pausePlayImg) pausePlayImg.src = 'assets/play.svg';

    if (audio && streamUrl) {
        audio.src = streamUrl;
        audio.load();
    }

    // Refresh lyrics panel if already open (From File 2)
    if (lyricsVisible) {
        if (lyricsSongTitle) lyricsSongTitle.textContent = currentSongTitle;
        if (lyricsSongArtist) lyricsSongArtist.textContent = currentSongArtist;
        renderLyrics();
        requestAnimationFrame(jumpToCurrentLyric);
    }
}

export function setDuration(seconds) {
    if (typeof seconds === 'number' && seconds > 0) {
        duration = seconds;
        if (totalTimeEl) totalTimeEl.textContent = formatTime(duration);
    }
}

export function getCurrentTime() { return current; }

export function setCurrentTime(seconds) {
    current = Math.max(0, Math.min(seconds, duration));
    updateUI(duration > 0 ? current / duration : 0);
    if (audio && !isNaN(audio.duration)) audio.currentTime = current;
}

// ─── Animation loop (Priority: File 2 implementation) ─────────────────────────

function animate(now) {
    const delta = (now - lastUpdate) / 1000;
    lastUpdate = now;

    if (audio && !audio.paused && !isDragging) {
        current = audio.currentTime || current + delta;
        const eff = !isNaN(audio.duration) && audio.duration > 0 ? audio.duration : duration;
        const percent = eff > 0 ? current / eff : 0;
        const sec = Math.floor(current);

        if (sec !== lastSecondUpdated) {
            updateUI(percent);
            lastSecondUpdated = sec;
        }
    }

    updateSyncedLyrics();
    requestAnimationFrame(animate);
}

requestAnimationFrame(animate);