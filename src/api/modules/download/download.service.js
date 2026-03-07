import songsService from '../songs/songs.service.js';
import { promisify } from 'util';
import { query } from '../../config/database.js';
import { google } from 'googleapis';
import { AppError } from '../../middleware/error.middleware.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import musicBrainzService from '../../services/musicbrainz.service.js';
import scoringService from '../../services/scoring.service.js';
import musixmatchService from '../../services/musixmatch.service.js';

const execFileAsync = promisify(execFile);
const readdirAsync = promisify(fs.readdir);

const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || path.join(os.homedir(), 'Downloads', 'echo-downloads');
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

    async getVideoDetails(videoId) {
        try {
            const response = await YT_API.videos.list({
                part: 'snippet,contentDetails',
                id: videoId,
            });

            if (response.data.items && response.data.items.length > 0) {
                const item = response.data.items[0];
                return {
                    title: item.snippet.title,
                    description: item.snippet.description,
                    duration: this.isoToDurationMs(item.contentDetails.duration),
                };
            }

            return null;
        } catch (err) {
            console.error(`Error fetching video details for ${videoId}:`, err.message);
            return null;
        }
    }

    isoToDurationMs(isoDuration) {
        const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
        const matches = isoDuration.match(regex);
        if (!matches) return 0;
        const hours = parseInt(matches[1]) || 0;
        const minutes = parseInt(matches[2]) || 0;
        const seconds = parseInt(matches[3]) || 0;
        return (hours * 3600 + minutes * 60 + seconds) * 1000;
    }

    parseMetadata(title, description) {
        const titleLower = title.toLowerCase();

        const artistPatterns = [
            /^(.*?)\s*[-–]\s*(.*?)(?:\s*\(|$)/,
            /^(.*?)\s*[-–]\s*/,
        ];

        let artist = 'Unknown';
        let parsedTitle = title;

        for (const pattern of artistPatterns) {
            const match = title.match(pattern);
            if (match) {
                artist = match[1]?.trim() || 'Unknown';
                parsedTitle = match[2]?.trim() || title;
                break;
            }
        }

        return {
            title: parsedTitle,
            artist: artist,
            description: description || '',
        };
    }

    async enrichWithMusicBrainz(title, artist, durationMs) {
        try {
            const candidates = await musicBrainzService.searchByTitleArtistDuration(
                title,
                artist,
                durationMs
            );

            if (candidates.length === 0) {
                return {
                    mbid: null,
                    score: 0,
                    candidates: [],
                    reviewNeeded: false,
                };
            }

            const scored = scoringService.scoreCandidates(title, artist, durationMs, candidates);
            const topMatch = scored[0];

            return {
                mbid: topMatch.mbid,
                score: topMatch.score,
                candidates: scored.slice(0, 5),
                reviewNeeded: scoringService.requiresReview(topMatch.score),
                autoAccepted: scoringService.isAutoAcceptable(topMatch.score),
            };
        } catch (err) {
            console.error('MusicBrainz enrichment failed:', err.message);
            return {
                mbid: null,
                score: 0,
                candidates: [],
                review_needed: false,
            };
        }
    }

    async enrichWithLyrics(title, artist) {
        try {
            const lyrics = await musixmatchService.searchLyrics(title, artist);
            return lyrics || null;
        } catch (err) {
            console.warn('Lyrics enrichment failed:', err.message);
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
            const queryTrimmed = queryText.trim();

            if (!queryTrimmed) {
                results.push({
                    query: queryText,
                    success: false,
                    error: 'Empty query',
                });
                continue;
            }

            try {
                const videoId = await this.getTopVideoId(queryTrimmed);

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
                const downloadSuccess = await this.downloadSong(youtubeUrl, queryTrimmed);

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

                let enrichmentData = {
                    mbid: null,
                    score: 0,
                    candidates: [],
                    lyrics: null,
                    reviewNeeded: false,
                };

                let title = queryTrimmed;
                let artist = 'Unknown';

                if (song.rows.length === 0) {
                    const videoDetails = await this.getVideoDetails(videoId);

                    if (videoDetails) {
                        const parsed = this.parseMetadata(videoDetails.title, videoDetails.description);
                        title = parsed.title;
                        artist = parsed.artist;

                        enrichmentData = await this.enrichWithMusicBrainz(
                            title,
                            artist,
                            videoDetails.duration
                        );

                        if (enrichmentData.mbid) {
                            enrichmentData.lyrics = await this.enrichWithLyrics(title, artist);
                        }

                        console.log(`📍 Song enrichment: "${title}" by ${artist}, Score: ${enrichmentData.score}, MBID: ${enrichmentData.mbid}`);
                    }

                    song = await songsService.createSong({
                        youtubeId: videoId,
                        title,
                        artist,
                        filePath,
                        mbid: enrichmentData.mbid || null,
                    });

                    if (enrichmentData.lyrics && song.id) {
                        await songsService.storeLyrics(
                            song.id,
                            enrichmentData.lyrics.lyrics,
                            enrichmentData.lyrics.source,
                            enrichmentData.lyrics.sourceId
                        ).catch(err => console.warn('Failed to store lyrics:', err.message));
                    }
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
                    enrichment: enrichmentData,
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