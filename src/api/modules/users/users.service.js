import { query } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';

export class UsersService {
    async getProfile(userId) {
        const result = await query(
            `SELECT id, username, email, first_name, last_name, profile_picture_url, created_at, last_login
             FROM users WHERE id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            throw new AppError('User not found', 404);
        }

        return result.rows[0];
    }

    async getPublicProfile(userId) {
        const result = await query(
            `SELECT id, username, profile_picture_url, first_name, last_name
             FROM users WHERE id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            throw new AppError('User not found', 404);
        }

        return result.rows[0];
    }

    async updateProfile(userId, updateData) {
        const { firstName, lastName, profilePictureUrl } = updateData;

        const result = await query(
            `UPDATE users
             SET first_name = COALESCE($1, first_name),
                 last_name = COALESCE($2, last_name),
                 profile_picture_url = COALESCE($3, profile_picture_url),
                 updated_at = NOW()
             WHERE id = $4
             RETURNING id, username, email, first_name, last_name, profile_picture_url, updated_at`,
            [firstName, lastName, profilePictureUrl, userId]
        );

        if (result.rows.length === 0) {
            throw new AppError('User not found', 404);
        }

        return result.rows[0];
    }

    async getUserStats(userId) {
        const songsResult = await query('SELECT COUNT(*) FROM user_songs WHERE user_id = $1', [userId]);
        const playlistsResult = await query('SELECT COUNT(*) FROM playlists WHERE user_id = $1', [userId]);
        const historyResult = await query('SELECT COUNT(*) FROM listening_history WHERE user_id = $1', [userId]);

        return {
            totalSongs: parseInt(songsResult.rows[0].count),
            totalPlaylists: parseInt(playlistsResult.rows[0].count),
            totalListens: parseInt(historyResult.rows[0].count),
        };
    }
}

export default new UsersService();
