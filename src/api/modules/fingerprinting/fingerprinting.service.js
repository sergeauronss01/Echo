import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import { query } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import ChromaprintService from '../../services/chromaprint.service.js';
import AcoustIDService from '../../services/acoustid.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFileAsync = promisify(execFile);

export class FingerprintingService {
    // ─────────────────────────────────────────────────────────────
    // Core fingerprint generation
    // ─────────────────────────────────────────────────────────────

    async generateFingerprint(filePath) {
        const fpcalcAvailable = await ChromaprintService.isFpcalcAvailable();

        if (fpcalcAvailable) {
            return await this.generateChromaprintFingerprint(filePath);
        }

        return await this.generateEssentiaFingerprint(filePath);
    }

    async generateChromaprintFingerprint(filePath) {
        try {
            const result = await ChromaprintService.generateFingerprint(filePath);
            return { method: 'chromaprint', fingerprint: result.fingerprint, duration: result.duration };
        } catch (err) {
            console.warn('Chromaprint failed, falling back to Essentia:', err.message);
            return await this.generateEssentiaFingerprint(filePath);
        }
    }

    async generateEssentiaFingerprint(filePath) {
        try {
        const pythonScript = path.join(__dirname, 'essentia_fingerprint.py');
        
        const pythonOrPython3 = process.env.PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3');

            const { stdout } = await execFileAsync(
                pythonOrPython3,
                [pythonScript, '--input', filePath],
                { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
            );

            return JSON.parse(stdout);
        } catch (err) {
            console.error('Fingerprint generation (Essentia fallback) failed:', err.message);
            throw new AppError(`Fingerprint generation failed: ${err.message}`, 500);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // AcoustID lookup
    // ─────────────────────────────────────────────────────────────

    async identifyViaAcoustID(fingerprint, duration) {
        try {
            if (fingerprint.method !== 'chromaprint') {
                console.warn('AcoustID works best with Chromaprint fingerprints');
            }
            const result = await AcoustIDService.lookup(fingerprint.fingerprint, duration);
            return { matches: result.matches, mbids: result.mbids, confidence: result.confidence };
        } catch (err) {
            console.error('AcoustID identification failed:', err.message);
            return { matches: [], mbids: [], confidence: 0, error: err.message };
        }
    }

    async uploadAndIdentify(filePath, userId) {
        try {
            const fingerprint = await this.generateFingerprint(filePath);
            const identificationResult = await this.identifyViaAcoustID(
                fingerprint,
                fingerprint.duration
            );

            const matched = identificationResult.mbids?.[0] || null;
            await query(
                `INSERT INTO fingerprint_matches
                     (user_id, uploaded_fingerprint, matched_song_id, confidence)
                 VALUES ($1, $2, NULL, $3)`,
                [userId, JSON.stringify(fingerprint), identificationResult.confidence || 0]
            ).catch((err) => console.error('Match log error:', err.message));

            return { fingerprint, identification: identificationResult };
        } finally {
            try { fs.unlinkSync(filePath); } catch (_) { /* ignore */ }
        }
    }

    async identifyFromRecording(filePath, userId) {
        return this.uploadAndIdentify(filePath, userId);
    }

    async generateFingerprintForSong(songId) {
        const songResult = await query('SELECT file_path FROM songs WHERE id = $1', [songId]);

        if (songResult.rows.length === 0) {
            throw new AppError('Song not found', 404);
        }

        const filePath = songResult.rows[0].file_path;

        if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
            throw new AppError(
                'Song is stored remotely (Supabase). Download the file locally before generating a fingerprint.',
                400
            );
        }

        if (!fs.existsSync(filePath)) {
            throw new AppError('Local audio file not found', 404);
        }

        const fingerprint = await this.generateFingerprint(filePath);
        const updatedSong = await this.storeFingerprint(songId, fingerprint);

        return { song: updatedSong, fingerprint };
    }

    async batchGenerateFingerprints(songIds) {
        const results = { success: [], failed: [] };

        for (const songId of songIds) {
            try {
                const result = await this.generateFingerprintForSong(songId);
                results.success.push({ songId, ...result });
            } catch (err) {
                results.failed.push({ songId, error: err.message });
            }
        }

        return results;
    }

    async storeFingerprint(songId, fingerprint) {
        const fingerprintJson = JSON.stringify(fingerprint);
        const fingerprintHash = fingerprint.fingerprint_hash || fingerprint.fingerprint;
        const version = fingerprint.method || '2.0';

        const result = await query(
            `UPDATE songs
             SET acoustic_fingerprint = $1, fingerprint_hash = $2,
                 fingerprint_version = $3, updated_at = NOW()
             WHERE id = $4
             RETURNING *`,
            [fingerprintJson, fingerprintHash, version, songId]
        );

        if (result.rows.length === 0) {
            throw new AppError('Song not found', 404);
        }

        return result.rows[0];
    }

    async getMatchHistory(userId, limit = 50) {
        const result = await query(
            `SELECT fm.*, s.title, s.artist
             FROM fingerprint_matches fm
             LEFT JOIN songs s ON fm.matched_song_id = s.id
             WHERE fm.user_id = $1
             ORDER BY fm.matched_at DESC
             LIMIT $2`,
            [userId, limit]
        );

        return result.rows;
    }
}

export default new FingerprintingService();