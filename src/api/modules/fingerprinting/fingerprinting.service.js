import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { query } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFileAsync = promisify(execFile);

export class FingerprintingService {
    async generateFingerprint(filePath) {
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
            console.error('Fingerprint generation failed:', err.message);
            throw new AppError(`Fingerprint generation failed: ${err.message}`, 500);
        }
    }

    async findSimilarSongs(fingerprint, threshold = 0.80, limit = 10) {
        try {
            const uploadedVector = fingerprint.fingerprint_vector || [];

            const songsResult = await query(
                'SELECT id, title, artist, acoustic_fingerprint FROM songs WHERE acoustic_fingerprint IS NOT NULL LIMIT 1000'
            );

            const matches = [];

            for (const song of songsResult.rows) {
                try {
                    const storedFingerprint = JSON.parse(song.acoustic_fingerprint);
                    const storedVector = storedFingerprint.fingerprint_vector || [];

                    const similarity = this._calculateCosineSimilarity(uploadedVector, storedVector);

                    if (similarity >= threshold) {
                        matches.push({
                            songId: song.id,
                            title: song.title,
                            artist: song.artist,
                            confidence: parseFloat((similarity * 100).toFixed(2)),
                            similarity,
                        });
                    }
                } catch (err) {
                    console.warn(`Failed to parse fingerprint for song ${song.id}`);
                    continue;
                }
            }

            matches.sort((a, b) => b.similarity - a.similarity);
            return matches.slice(0, limit);
        } catch (err) {
            console.error('Song matching failed:', err.message);
            throw new AppError('Song matching failed', 500);
        }
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

    async storeFingerprint(songId, fingerprint) {
        try {
            const fingerprintJson = JSON.stringify(fingerprint);
            const fingerprintHash = fingerprint.fingerprint_hash;
            const version = fingerprint.version || '1.0';

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

    async uploadAndIdentify(filePath, userId) {
        try {
            const fingerprint = await this.generateFingerprint(filePath);
            const matches = await this.findSimilarSongs(fingerprint, 0.75, 10);

            const result = await query(
                `INSERT INTO fingerprint_matches (user_id, uploaded_fingerprint, matched_song_id, confidence)
                 VALUES ($1, $2, $3, $4) RETURNING *`,
                [userId, JSON.stringify(fingerprint), matches[0]?.songId || null, matches[0]?.confidence || 0]
            );

            return {
                fingerprint,
                matches,
                matchRecord: result.rows[0],
            };
        } catch (err) {
            if (err.statusCode) throw err;
            throw new AppError('Identification failed: ' + err.message, 500);
        }
    }

    async identifyFromRecording(audioBuffer, userId) {
        const tempPath = path.join('/tmp', `recording_${Date.now()}.wav`);

        try {
            fs.writeFileSync(tempPath, audioBuffer);
            const result = await this.uploadAndIdentify(tempPath, userId);

            fs.unlinkSync(tempPath);
            return result;
        } catch (err) {
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
            }
            throw err;
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
}

export default new FingerprintingService();
