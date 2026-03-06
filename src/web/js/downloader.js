// --- Batch Download Module ---
// Handles batch downloading through API

import { api } from './api.js';

export async function initDownloader() {
    const btn = document.getElementById("startDownloadBtn");
    if (!btn) return;

    btn.addEventListener("click", async () => {
        const text = document.getElementById("queries").value.trim();
        const queries = text.split("\n").map(query => query.trim()).filter(Boolean);
        
        if (!queries.length) {
            document.getElementById("results").innerHTML = '<p class="error-message">Please enter at least one query</p>';
            return;
        }

        document.getElementById("results").innerHTML = '<div class="loading">⏳ Processing...</div>';

        try {
            const data = await api.batchDownload(queries);
            renderResults(data.results || data.data?.results || []);
        } catch (error) {
            document.getElementById("results").innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
        }
    });
}

function renderResults(results) {
    const resultsDiv = document.getElementById("results");
    if (!results || results.length === 0) {
        resultsDiv.innerHTML = '<p>No results</p>';
        return;
    }

    resultsDiv.innerHTML = `
        <div class="results-list">
            ${results.map(result => `
                <div class="result-item ${result.success ? 'success' : 'error'}">
                    <span class="result-icon">${result.success ? '✅' : '❌'}</span>
                    <span class="result-query">${result.query || 'Unknown'}</span>
                    ${result.success ? 
                        `<span class="result-file">${result.fileName}</span>` :
                        `<span class="result-error">${result.error}</span>`
                    }
                </div>
            `).join('')}
        </div>
    `;
}