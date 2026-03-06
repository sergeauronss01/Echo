import { query } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';

export class PlaylistsService {
    async createPlaylist(userId, playlistData) {
        const { name, description, isPublic } = playlistData;

        const result = await query(
            `INSERT INTO playlists (user_id, name, description, is_public)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [userId, name, description, isPublic || false]
        );

        return result.rows[0];
    }

    async getPlaylist(playlistId, userId = null) {
        const playlistResult = await query(
            `SELECT p.* FROM playlists p
             WHERE p.id = $1 AND (p.is_public = true OR (p.user_id = $2 AND $2 IS NOT NULL))`,
            [playlistId, userId]
        );

        if (playlistResult.rows.length === 0) {
            throw new AppError('Playlist not found or access denied', 404);
        }

        const playlist = playlistResult.rows[0];

        const songsResult = await query(
            `SELECT s.id, s.youtube_id, s.title, s.artist, s.duration, s.album, s.genre, s.year, ps.position
             FROM playlist_songs ps
             JOIN songs s ON ps.song_id = s.id
             WHERE ps.playlist_id = $1
             ORDER BY ps.position ASC`,
            [playlistId]
        );

        playlist.songs = songsResult.rows;
        return playlist;
    }

    async getUserPlaylists(userId, page = 1, limit = 20) {
        const offset = (page - 1) * limit;

        const playlistsResult = await query(
            `SELECT id, user_id, name, description, is_public, cover_art_url, created_at, updated_at
             FROM playlists
             WHERE user_id = $1
             ORDER BY updated_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );

        const countResult = await query('SELECT COUNT(*) FROM playlists WHERE user_id = $1', [userId]);
        const total = parseInt(countResult.rows[0].count);

        return {
            playlists: playlistsResult.rows,
            total,
            page,
            pages: Math.ceil(total / limit),
        };
    }

    async getPublicPlaylists(page = 1, limit = 20) {
        const offset = (page - 1) * limit;

        const playlistsResult = await query(
            `SELECT id, user_id, name, description, is_public, cover_art_url, created_at, updated_at
             FROM playlists
             WHERE is_public = true
             ORDER BY updated_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        const countResult = await query('SELECT COUNT(*) FROM playlists WHERE is_public = true');
        const total = parseInt(countResult.rows[0].count);

        return {
            playlists: playlistsResult.rows,
            total,
            page,
            pages: Math.ceil(total / limit),
        };
    }

    async updatePlaylist(playlistId, userId, updateData) {
        const { name, description, isPublic, coverArtUrl } = updateData;

        const result = await query(
            `UPDATE playlists
             SET name = COALESCE($1, name),
                 description = COALESCE($2, description),
                 is_public = COALESCE($3, is_public),
                 cover_art_url = COALESCE($4, cover_art_url),
                 updated_at = NOW()
             WHERE id = $5 AND user_id = $6
             RETURNING *`,
            [name, description, isPublic, coverArtUrl, playlistId, userId]
        );

        if (result.rows.length === 0) {
            throw new AppError('Playlist not found or access denied', 404);
        }

        return result.rows[0];
    }

    async deletePlaylist(playlistId, userId) {
        const result = await query(
            'DELETE FROM playlists WHERE id = $1 AND user_id = $2 RETURNING id',
            [playlistId, userId]
        );

        if (result.rows.length === 0) {
            throw new AppError('Playlist not found or access denied', 404);
        }

        return { message: 'Playlist deleted' };
    }

    async addSongToPlaylist(playlistId, userId, songId) {
        const playlistCheck = await query(
            'SELECT id FROM playlists WHERE id = $1 AND user_id = $2',
            [playlistId, userId]
        );

        if (playlistCheck.rows.length === 0) {
            throw new AppError('Playlist not found', 404);
        }

        const posResult = await query(
            'SELECT MAX(position) as max_pos FROM playlist_songs WHERE playlist_id = $1',
            [playlistId]
        );

        const position = (posResult.rows[0].max_pos || 0) + 1;

        const result = await query(
            `INSERT INTO playlist_songs (playlist_id, song_id, position)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [playlistId, songId, position]
        );

        return result.rows[0];
    }

    async removeSongFromPlaylist(playlistId, userId, songId) {
        const playlistCheck = await query(
            'SELECT id FROM playlists WHERE id = $1 AND user_id = $2',
            [playlistId, userId]
        );

        if (playlistCheck.rows.length === 0) {
            throw new AppError('Playlist not found', 404);
        }

        await query(
            'DELETE FROM playlist_songs WHERE playlist_id = $1 AND song_id = $2',
            [playlistId, songId]
        );

        await this._reorderPlaylistSongs(playlistId);

        return { message: 'Song removed from playlist' };
    }

    async reorderSongInPlaylist(playlistId, userId, songId, newPosition) {
        const playlistCheck = await query(
            'SELECT id FROM playlists WHERE id = $1 AND user_id = $2',
            [playlistId, userId]
        );

        if (playlistCheck.rows.length === 0) {
            throw new AppError('Playlist not found', 404);
        }

        await query(
            'UPDATE playlist_songs SET position = $1 WHERE playlist_id = $2 AND song_id = $3',
            [newPosition, playlistId, songId]
        );

        await this._reorderPlaylistSongs(playlistId);

        return { message: 'Song reordered' };
    }

    async _reorderPlaylistSongs(playlistId) {
        const songs = await query(
            'SELECT id FROM playlist_songs WHERE playlist_id = $1 ORDER BY position ASC',
            [playlistId]
        );

        for (let i = 0; i < songs.rows.length; i++) {
            await query(
                'UPDATE playlist_songs SET position = $1 WHERE id = $2',
                [i + 1, songs.rows[i].id]
            );
        }
    }
}

export default new PlaylistsService();
