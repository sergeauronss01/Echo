import { query } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';

export class SongsService {
    async createSong(songData) {
        const {
            youtubeId,
            title,
            artist,
            duration,
            filePath,
            album,
            genre,
            year,
            mbid,
            acoustid,
            acoustidConfidence,
        } = songData;

        const existingResult = await query(
            'SELECT id FROM songs WHERE youtube_id = $1 OR (mbid IS NOT NULL AND mbid = $2)',
            [youtubeId, mbid || null]
        );

        if (existingResult.rows.length > 0) {
            return existingResult.rows[0];
        }

        const result = await query(
            `INSERT INTO songs (youtube_id, title, artist, duration, file_path, album, genre, year, mbid, acoustid, acoustid_confidence, metadata_verified)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING id, youtube_id, title, artist, duration, file_path, album, genre, year, mbid, acoustid, acoustid_confidence, created_at`,
            [youtubeId, title, artist, duration, filePath, album, genre, year, mbid || null, acoustid || null, acoustidConfidence || null, !!mbid]
        );

        return result.rows[0];
    }

    async getSong(songId) {
        const result = await query(
            `SELECT id, youtube_id, title, artist, duration, album, genre, year, cover_art_url,
                    mbid, acoustid, acoustid_confidence, lyrics_content, lyrics_source,
                    metadata_verified, review_status, created_at
             FROM songs WHERE id = $1`,
            [songId]
        );

        if (result.rows.length === 0) {
            throw new AppError('Song not found', 404);
        }

        return result.rows[0];
    }

    async searchSongs(queryText, page = 1, limit = 20) {
        const offset = (page - 1) * limit;
        const searchTerm = `%${queryText}%`;

        const songResults = await query(
            `SELECT id, youtube_id, title, artist, duration, album, genre, year, cover_art_url,
                    mbid, acoustid, metadata_verified, created_at
             FROM songs
             WHERE title ILIKE $1 OR artist ILIKE $1 OR mbid::text ILIKE $1
             ORDER BY metadata_verified DESC, created_at DESC
             LIMIT $2 OFFSET $3`,
            [searchTerm, limit, offset]
        );

        const countResult = await query(
            `SELECT COUNT(*) FROM songs WHERE title ILIKE $1 OR artist ILIKE $1 OR mbid::text ILIKE $1`,
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
            `SELECT id, youtube_id, title, artist, duration, album, genre, year, cover_art_url,
                    mbid, acoustid, metadata_verified, created_at
             FROM songs
             ORDER BY metadata_verified DESC, created_at DESC
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

    async getSongByMbid(mbid) {
        const result = await query(
            `SELECT id, youtube_id, title, artist, duration, mbid, acoustid, metadata_verified
             FROM songs WHERE mbid = $1 LIMIT 1`,
            [mbid]
        );

        return result.rows[0] || null;
    }

    async updateSongMetadata(songId, metadata) {
        const { mbid, acoustid, acoustidConfidence, lyricsContent, lyricsSource } = metadata;

        const result = await query(
            `UPDATE songs
             SET mbid = COALESCE($1, mbid),
                 acoustid = COALESCE($2, acoustid),
                 acoustid_confidence = COALESCE($3, acoustid_confidence),
                 lyrics_content = COALESCE($4, lyrics_content),
                 lyrics_source = COALESCE($5, lyrics_source),
                 metadata_verified = true,
                 review_status = 'verified',
                 updated_at = NOW()
             WHERE id = $6
             RETURNING *`,
            [mbid || null, acoustid || null, acoustidConfidence || null, lyricsContent || null, lyricsSource || null, songId]
        );

        if (result.rows.length === 0) {
            throw new AppError('Song not found', 404);
        }

        return result.rows[0];
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

    async storeLyrics(songId, lyricsContent, source, sourceId) {
        try {
            await query(
                `INSERT INTO songs_lyrics (song_id, lyrics_content, source, source_id)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (song_id) DO UPDATE SET
                    lyrics_content = $2, source = $3, source_id = $4, fetched_at = NOW()`,
                [songId, lyricsContent, source, sourceId]
            );

            await query(
                'UPDATE songs SET lyrics_content = $1, lyrics_source = $2 WHERE id = $3',
                [lyricsContent, source, songId]
            );

            return { success: true };
        } catch (err) {
            throw new AppError('Failed to store lyrics: ' + err.message, 500);
        }
    }
}

export default new SongsService();
