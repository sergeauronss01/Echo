// --- Selectors ---
const timeline = document.querySelector('.timeline');
const progress = document.querySelector('.progress');
const thumb = document.querySelector('.thumb');
const currentTimeEl = document.querySelector('.current');
const totalTimeEl = document.querySelector('.total');
const pausePlayBtn = document.getElementById('pausePlayBtn');

// --- State ---
let duration = 163;
let current = 0;
let isDragging = false;
let isPlaying = false; // Start paused by default
let lastUpdate = performance.now(); 

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
    const displayPercent = (percent * 100).toFixed(2);
    if (progress) progress.style.width = `${displayPercent}%`;
    if (thumb) thumb.style.left = `${displayPercent}%`;
    if (currentTimeEl) currentTimeEl.textContent = formatTime(current);
}

function getPercentFromEvent(event) {
    const rect = timeline.getBoundingClientRect();
    const x = (event.clientX || event.touches?.[0].clientX) - rect.left;
    return x / rect.width;
}

// --- Event Listeners ---
if (pausePlayBtn) {
    pausePlayBtn.addEventListener('click', () => {
        isPlaying = !isPlaying;
        const img = pausePlayBtn.querySelector('img');
        if (img) img.src = isPlaying ? 'assets/pause.svg' : 'assets/play.svg';
    });
}

if (timeline) {
    timeline.addEventListener('mousedown', (event) => {
        isDragging = true;
        updateUI(getPercentFromEvent(event));
        document.body.style.userSelect = 'none';
    });
}

document.addEventListener('mousemove', (event) => {
    if (!isDragging) return;
    updateUI(getPercentFromEvent(event));
});

document.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        document.body.style.userSelect = '';
    }
});

// --- Animation Loop ---
function animate(now) {
    const delta = (now - lastUpdate) / 1000;
    lastUpdate = now;

    if (isPlaying && !isDragging) {
        current = Math.min(current + delta, duration);
        const percent = current / duration;
        updateUI(percent);
    }
    requestAnimationFrame(animate);
}

requestAnimationFrame(animate);