import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import { query } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';
import chromaprintService from '../../services/chromaprint.service.js';
import acoustidService from '../../services/acoustid.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFileAsync = promisify(execFile);

export class FingerprintingService {
    async generateFingerprint(filePath) {
        const fpcalcAvailable = await chromaprintService.isFpcalcAvailable();

        if (fpcalcAvailable) {
            return await this.generateChromaprintFingerprint(filePath);
        }

        return await this.generateEssentiaFingerprint(filePath);
    }

    async generateChromaprintFingerprint(filePath) {
        try {
            const result = await chromaprintService.generateFingerprint(filePath);
            return {
                method: 'chromaprint',
                fingerprint: result.fingerprint,
                duration: result.duration,
            };
        } catch (err) {
            console.warn('Chromaprint failed, falling back to Essentia:', err.message);
            return await this.generateEssentiaFingerprint(filePath);
        }
    }

    async generateEssentiaFingerprint(filePath) {
        try {
            const pythonScript = path.join(__dirname, 'essentia_fingerprint.py');
            const pythonOrPython3 = process.platform === 'win32' ? 'python' : 'python3';

            const { stdout } = await execFileAsync(pythonOrPython3, [pythonScript, '--input', filePath], {
                timeout: 120000,
                maxBuffer: 10 * 1024 * 1024,
            });

            const fingerprint = JSON.parse(stdout);
            return fingerprint;
        } catch (err) {
            console.error('Fingerprint generation (Essentia fallback) failed:', err.message);
            throw new AppError(`Fingerprint generation failed: ${err.message}`, 500);
        }
    }

    async identifyViaAcoustID(fingerprint, duration) {
        try {
            if (fingerprint.method !== 'chromaprint') {
                console.warn('AcoustID works best with Chromaprint fingerprints');
            }

            const result = await acoustidService.lookup(fingerprint.fingerprint, duration);
            return {
                matches: result.matches,
                mbids: result.mbids,
                confidence: result.confidence,
            };
        } catch (err) {
            console.error('AcoustID identification failed:', err.message);
            return {
                matches: [],
                mbids: [],
                confidence: 0,
                error: err.message,
            };
        }
    }

    async identifyFromRecording(audioBuffer, userId) {
        const tempPath = path.join(os.tmpdir(), `recording_${Date.now()}.wav`);

        try {
            fs.writeFileSync(tempPath, audioBuffer);
            const fingerprint = await this.generateFingerprint(tempPath);
            const identificationResult = await this.identifyViaAcoustID(fingerprint, fingerprint.duration);

            const result = await query(
                `INSERT INTO fingerprint_matches (user_id, uploaded_fingerprint, matched_song_id, confidence)
                 VALUES ($1, $2, $3, $4) RETURNING *`,
                [
                    userId,
                    JSON.stringify(fingerprint),
                    identificationResult.mbids?.[0] || null,
                    identificationResult.confidence || 0,
                ]
            );

            fs.unlinkSync(tempPath);
            return {
                fingerprint,
                identification: identificationResult,
                matchRecord: result.rows[0],
            };
        } catch (err) {
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
            }
            throw err;
        }
    }

    async storeFingerprint(songId, fingerprint) {
        try {
            const fingerprintJson = JSON.stringify(fingerprint);
            const fingerprintHash = fingerprint.fingerprint_hash || fingerprint.fingerprint;
            const version = fingerprint.method || '2.0';

            const result = await query(
                `UPDATE songs SET acoustic_fingerprint = $1, fingerprint_hash = $2, fingerprint_version = $3, updated_at = NOW()
                 WHERE id = $4 RETURNING *`,
                [fingerprintJson, fingerprintHash, version, songId]
            );

            if (result.rows.length === 0) {
                throw new AppError('Song not found', 404);
            }

            return result.rows[0];
        } catch (err) {
            if (err.statusCode) throw err;
            throw new AppError('Failed to store fingerprint', 500);
        }
    }

    async generateFingerprintForSong(songId) {
        try {
            const songResult = await query('SELECT file_path FROM songs WHERE id = $1', [songId]);

            if (songResult.rows.length === 0) {
                throw new AppError('Song not found', 404);
            }

            const filePath = songResult.rows[0].file_path;

            if (!fs.existsSync(filePath)) {
                throw new AppError('Audio file not found', 404);
            }

            const fingerprint = await this.generateFingerprint(filePath);
            const updatedSong = await this.storeFingerprint(songId, fingerprint);

            return {
                song: updatedSong,
                fingerprint,
            };
        } catch (err) {
            if (err.statusCode) throw err;
            throw new AppError('Fingerprint generation failed: ' + err.message, 500);
        }
    }

    async batchGenerateFingerprints(songIds) {
        const results = {
            success: [],
            failed: [],
        };

        for (const songId of songIds) {
            try {
                const result = await this.generateFingerprintForSong(songId);
                results.success.push({
                    songId,
                    ...result,
                });
            } catch (err) {
                results.failed.push({
                    songId,
                    error: err.message,
                });
            }
        }

        return results;
    }

    async getMatchHistory(userId, limit = 50) {
        const result = await query(
            `SELECT fm.*, s.title, s.artist FROM fingerprint_matches fm
             LEFT JOIN songs s ON fm.matched_song_id = s.id
             WHERE fm.user_id = $1
             ORDER BY fm.matched_at DESC
             LIMIT $2`,
            [userId, limit]
        );

        return result.rows;
    }

    _calculateCosineSimilarity(vec1, vec2) {
        if (vec1.length !== vec2.length) {
            const maxLen = Math.max(vec1.length, vec2.length);
            vec1 = [...vec1, ...Array(maxLen - vec1.length).fill(0)];
            vec2 = [...vec2, ...Array(maxLen - vec2.length).fill(0)];
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            normA += vec1[i] * vec1[i];
            normB += vec2[i] * vec2[i];
        }

        normA = Math.sqrt(normA);
        normB = Math.sqrt(normB);

        if (normA === 0 || normB === 0) {
            return 0;
        }

        return dotProduct / (normA * normB);
    }
}

export default new FingerprintingService();
