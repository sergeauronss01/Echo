import { query } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';

export class SongsService {
    async createSong(songData) {
        const { youtubeId, title, artist, duration, filePath, album, genre, year } = songData;

        const existingResult = await query('SELECT id FROM songs WHERE youtube_id = $1', [youtubeId]);

        if (existingResult.rows.length > 0) {
            return existingResult.rows[0];
        }

        const result = await query(
            `INSERT INTO songs (youtube_id, title, artist, duration, file_path, album, genre, year)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id, youtube_id, title, artist, duration, file_path, album, genre, year, created_at`,
            [youtubeId, title, artist, duration, filePath, album, genre, year]
        );

        return result.rows[0];
    }

    async getSong(songId) {
        const result = await query(
            'SELECT * FROM songs WHERE id = $1',
            [songId]
        );

        if (result.rows.length === 0) {
            throw new AppError('Song not found', 404);
        }

        return result.rows[0];
    }

    async searchSongs(query_text, page = 1, limit = 20) {
        const offset = (page - 1) * limit;
        const searchTerm = `%${query_text}%`;

        const songResults = await query(
            `SELECT id, youtube_id, title, artist, duration, album, genre, year, cover_art_url, created_at
             FROM songs
             WHERE title ILIKE $1 OR artist ILIKE $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [searchTerm, limit, offset]
        );

        const countResult = await query(
            `SELECT COUNT(*) FROM songs WHERE title ILIKE $1 OR artist ILIKE $1`,
            [searchTerm]
        );

        const total = parseInt(countResult.rows[0].count);

        return {
            songs: songResults.rows,
            total,
            page,
            pages: Math.ceil(total / limit),
        };
    }

    async getAllSongs(page = 1, limit = 20) {
        const offset = (page - 1) * limit;

        const songResults = await query(
            `SELECT id, youtube_id, title, artist, duration, album, genre, year, cover_art_url, created_at
             FROM songs
             ORDER BY created_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        const countResult = await query('SELECT COUNT(*) FROM songs');
        const total = parseInt(countResult.rows[0].count);

        return {
            songs: songResults.rows,
            total,
            page,
            pages: Math.ceil(total / limit),
        };
    }

    async updateSongFingerprint(songId, fingerprint, fingerprintHash, version = '1.0') {
        const result = await query(
            `UPDATE songs
             SET acoustic_fingerprint = $1, fingerprint_hash = $2, fingerprint_version = $3, updated_at = NOW()
             WHERE id = $4
             RETURNING *`,
            [fingerprint, fingerprintHash, version, songId]
        );

        return result.rows[0];
    }
}

export default new SongsService();
