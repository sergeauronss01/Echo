const mainContainer = document.getElementById('view-container');
const navDownloadBtn = document.getElementById('navDownloadBtn');

// Navigation Logic
navDownloadBtn.addEventListener('click', async () => {
    const response = await fetch('views/batch.html');
    const html = await response.text();
    mainContainer.innerHTML = html;
    initDownloader(); // Re-bind events after HTML is injected
});

function initDownloader() {
    const btn = document.getElementById("startDownloadBtn");
    if (!btn) return;

    btn.addEventListener("click", async () => {
        const text = document.getElementById("queries").value.trim();
        const queries = text.split("\n").map(q => q.trim()).filter(Boolean);
        
        document.getElementById("results").innerHTML = "⏳ Processing...";

        const res = await fetch("/api/batch-download", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ queries })
        });

        const data = await res.json();
        renderResults(data.results);
    });
}

function renderResults(results) {
    const resultsDiv = document.getElementById("results");
    resultsDiv.innerHTML = results.map(r => `
        <div class="item">
            ${r.success ? `✅ ${r.fileName}` : `❌ ${r.query}: ${r.error}`}
        </div>
    `).join('');
}