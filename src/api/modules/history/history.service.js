import { query } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';

export class HistoryService {
    async logPlay(userId, songId, durationPlayed, totalDuration) {
        const completionPercentage = (durationPlayed / totalDuration) * 100;

        const result = await query(
            `INSERT INTO listening_history (user_id, song_id, duration_played, total_duration, completion_percentage)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [userId, songId, durationPlayed, totalDuration, completionPercentage]
        );

        return result.rows[0];
    }

    async getUserHistory(userId, page = 1, limit = 50, startDate = null, endDate = null) {
        const offset = (page - 1) * limit;

        let queryText = `SELECT lh.*, s.title, s.artist, s.duration FROM listening_history lh
                        JOIN songs s ON lh.song_id = s.id
                        WHERE lh.user_id = $1`;
        const params = [userId];

        if (startDate) {
            queryText += ` AND lh.played_at >= $${params.length + 1}`;
            params.push(new Date(startDate));
        }

        if (endDate) {
            queryText += ` AND lh.played_at <= $${params.length + 1}`;
            params.push(new Date(endDate));
        }

        queryText += ` ORDER BY lh.played_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const historyResult = await query(queryText, params);

        let countParams = [userId];
        let countQuery = 'SELECT COUNT(*) FROM listening_history WHERE user_id = $1';

        if (startDate) {
            countQuery += ` AND played_at >= $${countParams.length + 1}`;
            countParams.push(new Date(startDate));
        }

        if (endDate) {
            countQuery += ` AND played_at <= $${countParams.length + 1}`;
            countParams.push(new Date(endDate));
        }

        const countResult = await query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count);

        return {
            history: historyResult.rows,
            total,
            page,
            pages: Math.ceil(total / limit),
        };
    }

    async getTopSongs(userId, period = 'month', limit = 10) {
        let dateFilter = 'CURRENT_DATE - INTERVAL \'30 days\'';

        if (period === 'week') {
            dateFilter = 'CURRENT_DATE - INTERVAL \'7 days\'';
        } else if (period === 'year') {
            dateFilter = 'CURRENT_DATE - INTERVAL \'365 days\'';
        }

        const result = await query(
            `SELECT s.id, s.title, s.artist, s.duration, COUNT(lh.id) as listen_count
             FROM listening_history lh
             JOIN songs s ON lh.song_id = s.id
             WHERE lh.user_id = $1 AND lh.played_at >= ${dateFilter}
             GROUP BY s.id, s.title, s.artist, s.duration
             ORDER BY listen_count DESC
             LIMIT $2`,
            [userId, limit]
        );

        return result.rows;
    }

    async getRecommendations(userId, limit = 20) {
        const result = await query(
            `SELECT DISTINCT s.id, s.title, s.artist, s.genre, s.album
             FROM songs s
             WHERE s.id NOT IN (
                SELECT DISTINCT song_id FROM listening_history WHERE user_id = $1
             )
             AND s.genre IN (
                SELECT s2.genre FROM listening_history lh
                JOIN songs s2 ON lh.song_id = s2.id
                WHERE lh.user_id = $1 AND s2.genre IS NOT NULL
                GROUP BY s2.genre
                ORDER BY COUNT(*) DESC LIMIT 3
             )
             LIMIT $2`,
            [userId, limit]
        );

        return result.rows;
    }

    async getListeningStats(userId) {
        const totalListensResult = await query(
            'SELECT COUNT(*) FROM listening_history WHERE user_id = $1',
            [userId]
        );

        const totalDurationResult = await query(
            'SELECT COALESCE(SUM(duration_played), 0) as total_duration FROM listening_history WHERE user_id = $1',
            [userId]
        );

        const averageCompletionResult = await query(
            'SELECT COALESCE(AVG(completion_percentage), 0) as avg_completion FROM listening_history WHERE user_id = $1',
            [userId]
        );

        const uniqueSongsResult = await query(
            'SELECT COUNT(DISTINCT song_id) FROM listening_history WHERE user_id = $1',
            [userId]
        );

        const lastListenResult = await query(
            'SELECT played_at FROM listening_history WHERE user_id = $1 ORDER BY played_at DESC LIMIT 1',
            [userId]
        );

        return {
            totalListens: parseInt(totalListensResult.rows[0].count),
            totalDurationSeconds: parseInt(totalDurationResult.rows[0].total_duration),
            totalDurationHours: Math.round(parseInt(totalDurationResult.rows[0].total_duration) / 3600),
            averageCompletionPercentage: parseFloat(averageCompletionResult.rows[0].avg_completion),
            uniqueSongsListened: parseInt(uniqueSongsResult.rows[0].count),
            lastListenedAt: lastListenResult.rows[0]?.played_at || null,
        };
    }
}

export default new HistoryService();
