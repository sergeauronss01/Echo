import { execFile } from 'child_process';
import { promisify } from 'util';
import { query } from '../../config/database.js';
import { google } from 'googleapis';
import { AppError } from '../../middleware/error.middleware.js';
import fs from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);
const readdirAsync = promisify(fs.readdir);

const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || path.join(process.env.HOME || process.env.USERPROFILE, 'Downloads', 'yt-batch-downloader');
const YT_API = google.youtube({ version: 'v3', auth: process.env.YT_API_KEY });

export class DownloadService {
    async getTopVideoId(query_text) {
        try {
            const searchText = `${query_text} official audio`;
            const response = await YT_API.search.list({
                part: 'snippet',
                q: searchText,
                maxResults: 1,
                type: 'video',
            });

            if (response.data.items && response.data.items.length > 0) {
                return response.data.items[0].id.videoId;
            }

            return null;
        } catch (err) {
            console.error(`Error searching for ${query_text}:`, err.message);
            return null;
        }
    }

    async waitForFile(dir, beforeSet, timeoutMs = 60000) {
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            const checkInterval = setInterval(async () => {
                try {
                    const files = await readdirAsync(dir);
                    const newFiles = files.filter(f => f.endsWith('.mp3') && !beforeSet.has(f));

                    if (newFiles.length > 0) {
                        clearInterval(checkInterval);
                        resolve(newFiles[0]);
                    }

                    if (Date.now() - startTime > timeoutMs) {
                        clearInterval(checkInterval);
                        reject(new Error('File download timeout'));
                    }
                } catch (err) {
                    clearInterval(checkInterval);
                    reject(err);
                }
            }, 1000);
        });
    }

    async downloadSong(youtubeUrl, songTitle) {
        try {
            const pythonOrPython3 = process.platform === 'win32' ? 'python' : 'python3';

            const outputTemplate = path.join(DOWNLOAD_DIR, '%(title)s.%(ext)s');

            await execFileAsync(pythonOrPython3, [
                '-m', 'yt_dlp',
                '--extract-audio',
                '--audio-format', 'mp3',
                '--audio-quality', '192',
                '--output', outputTemplate,
                youtubeUrl,
            ], { timeout: 300000 });

            return true;
        } catch (err) {
            console.error(`Error downloading ${youtubeUrl}:`, err.message);
            return false;
        }
    }

    async batchDownloadSongs(queries, userId = null) {
        if (!fs.existsSync(DOWNLOAD_DIR)) {
            fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
        }

        const results = [];

        for (const queryText of queries) {
            const query_trimmed = queryText.trim();

            if (!query_trimmed) {
                results.push({
                    query: queryText,
                    success: false,
                    error: 'Empty query',
                });
                continue;
            }

            try {
                const videoId = await this.getTopVideoId(query_trimmed);

                if (!videoId) {
                    results.push({
                        query: queryText,
                        success: false,
                        error: 'Video not found',
                    });
                    continue;
                }

                const beforeFiles = new Set(fs.readdirSync(DOWNLOAD_DIR));

                const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
                const downloadSuccess = await this.downloadSong(youtubeUrl, query_trimmed);

                if (!downloadSuccess) {
                    results.push({
                        query: queryText,
                        success: false,
                        error: 'Download failed',
                    });
                    continue;
                }

                const fileName = await this.waitForFile(DOWNLOAD_DIR, beforeFiles);
                const filePath = path.join(DOWNLOAD_DIR, fileName);
                const fileStats = fs.statSync(filePath);

                let song = await query(
                    'SELECT id FROM songs WHERE youtube_id = $1',
                    [videoId]
                );

                if (song.rows.length === 0) {
                    const songResult = await query(
                        `INSERT INTO songs (youtube_id, title, artist, file_path, file_size)
                         VALUES ($1, $2, $3, $4, $5)
                         RETURNING id, youtube_id, title, artist`,
                        [videoId, query_trimmed, 'Unknown', filePath, fileStats.size]
                    );
                    song = songResult.rows[0];
                } else {
                    song = song.rows[0];
                    await query(
                        'UPDATE songs SET file_path = $1, file_size = $2 WHERE id = $3',
                        [filePath, fileStats.size, song.id]
                    );
                }

                if (userId) {
                    await query(
                        `INSERT INTO user_songs (user_id, song_id, is_downloaded)
                         VALUES ($1, $2, true)
                         ON CONFLICT (user_id, song_id) DO NOTHING`,
                        [userId, song.id]
                    );
                }

                results.push({
                    query: queryText,
                    songId: song.id,
                    fileName,
                    success: true,
                });
            } catch (err) {
                results.push({
                    query: queryText,
                    success: false,
                    error: err.message,
                });
            }
        }

        return results;
    }

    async addUserSong(userId, songId) {
        const songExists = await query('SELECT id FROM songs WHERE id = $1', [songId]);

        if (songExists.rows.length === 0) {
            throw new AppError('Song not found', 404);
        }

        const result = await query(
            `INSERT INTO user_songs (user_id, song_id, is_downloaded)
             VALUES ($1, $2, true)
             ON CONFLICT (user_id, song_id) DO NOTHING
             RETURNING *`,
            [userId, songId]
        );

        return result.rows[0] || { message: 'Song already in library' };
    }

    async removeUserSong(userId, songId) {
        await query(
            'DELETE FROM user_songs WHERE user_id = $1 AND song_id = $2',
            [userId, songId]
        );

        return { message: 'Song removed from library' };
    }

    async getUserSongs(userId, page = 1, limit = 20) {
        const offset = (page - 1) * limit;

        const songsResult = await query(
            `SELECT s.id, s.youtube_id, s.title, s.artist, s.duration, s.album, s.genre, s.year, us.is_favorite, us.added_at
             FROM user_songs us
             JOIN songs s ON us.song_id = s.id
             WHERE us.user_id = $1
             ORDER BY us.added_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );

        const countResult = await query('SELECT COUNT(*) FROM user_songs WHERE user_id = $1', [userId]);
        const total = parseInt(countResult.rows[0].count);

        return {
            songs: songsResult.rows,
            total,
            page,
            pages: Math.ceil(total / limit),
        };
    }

    async toggleFavorite(userId, songId, isFavorite) {
        const result = await query(
            `UPDATE user_songs SET is_favorite = $1 WHERE user_id = $2 AND song_id = $3 RETURNING *`,
            [isFavorite, userId, songId]
        );

        if (result.rows.length === 0) {
            throw new AppError('Song not found in user library', 404);
        }

        return result.rows[0];
    }
}

export default new DownloadService();