import songsService from '../songs/songs.service.js';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { query } from '../../config/database.js';
import { google } from 'googleapis';
import { AppError } from '../../middleware/error.middleware.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import musicBrainzService from '../../services/musicbrainz.service.js';
import scoringService from '../../services/scoring.service.js';
import LrclibService from '../../services/Lrclib.service.js';
import { createClient } from '@supabase/supabase-js';

const execFileAsync = promisify(execFile);
const readdirAsync = promisify(fs.readdir);

const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || path.join(os.homedir(), 'Downloads', 'echo-downloads');
const YT_API = google.youtube({ version: 'v3', auth: process.env.YT_API_KEY });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export class DownloadService {
    async getTopVideoId(queryText) {
        try {
            const searchText = `${queryText} official audio`;
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
            console.error(`Error searching for ${queryText}:`, err.message);
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

    cleanSearchTerm(text) {
        return text
            .replace(/\(official.*\)/gi, '')
            .replace(/\[official.*\]/gi, '')
            .replace(/\(lyrics.*\)/gi, '')
            .replace(/ft\.|feat\./gi, '')
            .trim();
    }

    parseMetadata(title, description) {
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
            // 1. Fetch data from the service
            const response = await musicBrainzService.searchByTitleArtistDuration(
                title,
                artist,
                durationMs
            );

            // 2. Validate the response structure (Handle both array or object types)
            const candidateList = Array.isArray(response) ? response : (response?.candidates || []);

            if (candidateList.length === 0) {
                console.log(`[MusicBrainz] No results found for: ${title}`);
                return {
                    mbid: null,
                    score: 0,
                    candidates: [],
                    reviewNeeded: false,
                    autoAccepted: false
                };
            }

            // 3. Score the candidates safely
            const scored = scoringService.scoreCandidates(title, artist, durationMs, candidateList);

            // 4. Ensure scoring actually returned results
            if (!scored || scored.length === 0) {
                return {
                    mbid: null,
                    score: 0,
                    candidates: [],
                    reviewNeeded: false,
                    autoAccepted: false
                };
            }

            const topMatch = scored[0];

            // 5. Final safety check on topMatch properties
            const finalScore = topMatch?.score || 0;

            return {
                mbid: topMatch?.mbid || null,
                score: finalScore,
                candidates: scored.slice(0, 5),
                reviewNeeded: scoringService.requiresReview(finalScore),
                autoAccepted: scoringService.isAutoAcceptable(finalScore),
            };

        } catch (err) {
            // This catches "Cannot read properties of undefined" and other logic crashes
            console.error('MusicBrainz enrichment internal crash:', err.message);
            return {
                mbid: null,
                score: 0,
                candidates: [],
                reviewNeeded: false,
                autoAccepted: false
            };
        }
    }

    async enrichWithLyrics(title, artist) {
        try {
            const lyrics = await LrclibService.searchLyrics(title, artist);
            return lyrics || null;
        } catch (err) {
            console.warn('Lyrics enrichment failed:', err.message);
            return null;
        }
    }

    async uploadToSupabase(filePath, fileName) {
            try {
                const fileBuffer = fs.readFileSync(filePath);
                
                const ext = path.extname(fileName).toLowerCase();
                const contentType = ext === '.webm' ? 'audio/webm' : 'audio/mp4';

                const { data, error } = await supabase.storage
                    .from('songs')
                    .upload(`audio/${fileName}`, fileBuffer, {
                        contentType: contentType,
                        upsert: true
                    });

                if (error) throw error;

                const { data: publicUrlData } = supabase.storage
                    .from('songs')
                    .getPublicUrl(`audio/${fileName}`);

                return publicUrlData.publicUrl;
            } catch (err) {
                console.error('Erreur lors de l\'upload sur Supabase:', err.message);
                throw err;
            }
        }

    async downloadSong(youtubeUrl, videoId) {
        try {
            const pythonOrPython3 = process.platform === 'win32' ? 'python' : 'python3';
            
            const outputTemplate = path.join(DOWNLOAD_DIR, `${videoId}.%(ext)s`);

            await execFileAsync(pythonOrPython3, [
                '-m', 'yt_dlp',
                '-f', 'ba[ext=m4a]/ba[ext=webm]/ba', 
                '--js-runtimes',
                'node',
                '--output', outputTemplate,
                youtubeUrl,
            ], { timeout: 300000 });

            const files = await readdirAsync(DOWNLOAD_DIR);
            const downloadedFileName = files.find(f => f.startsWith(videoId));

            if (!downloadedFileName) {
                return null;
            }

            return path.join(DOWNLOAD_DIR, downloadedFileName);
        } catch (err) {
            console.error(`Error downloading ${youtubeUrl}:`, err.message);
            return null;
        }
    }

async batchDownloadSongs(queries, userId = null) {
        if (!fs.existsSync(DOWNLOAD_DIR)) {
            fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
        }

        const results = [];

        for (const queryText of queries) {
            const queryTrimmed = queryText.trim();
            if (!queryTrimmed) continue;

            try {
                const videoId = await this.getTopVideoId(queryTrimmed);
                if (!videoId) {
                    results.push({ query: queryText, success: false, error: 'Video not found' });
                    continue;
                }

                const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
                const localFilePath = await this.downloadSong(youtubeUrl, videoId);

                if (!localFilePath) {
                    results.push({ query: queryText, success: false, error: 'Download failed' });
                    continue;
                }

                const fileName = path.basename(localFilePath);
                const fileStats = fs.statSync(localFilePath);
                const supabaseUrl = await this.uploadToSupabase(localFilePath, fileName);
                fs.unlinkSync(localFilePath); 

                let song = await query('SELECT id FROM songs WHERE youtube_id = $1', [videoId]);
                
                // Initialize enrichment data with YouTube cover as a baseline fallback
                let enrichmentData = { 
                    mbid: null, 
                    album: null, 
                    year: null, 
                    genre: null, 
                    lyrics: null, 
                    coverUrl: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` 
                };
                
                let title = queryTrimmed;
                let artist = 'Unknown';

                const videoDetails = await this.getVideoDetails(videoId);
                if (videoDetails) {
                    const parsed = this.parseMetadata(videoDetails.title, videoDetails.description);
                    title = parsed.title;
                    artist = parsed.artist;
                    
                    const cleanTitle = this.cleanSearchTerm(title);
                    const cleanArtist = this.cleanSearchTerm(artist);

                    const mbResults = await this.enrichWithMusicBrainz(cleanTitle, cleanArtist, videoDetails.duration);
                    console.log(`[MusicBrainz] Top candidate for "${cleanTitle}" has score: ${mbResults.score}`);

                    if (mbResults.candidates && mbResults.candidates.length > 0 && mbResults.autoAccepted) {
                        const topMatch = mbResults.candidates[0];

                        title = topMatch.title; 
                        artist = topMatch.artistCredit;

                        enrichmentData.mbid = topMatch.mbid;
                        enrichmentData.album = topMatch.album;
                        enrichmentData.year = topMatch.year;
                        enrichmentData.genre = topMatch.genre; 
                        
                        if (topMatch.coverArtUrl || topMatch.coverUrl) {
                            enrichmentData.coverUrl = topMatch.coverArtUrl || topMatch.coverUrl;
                        }

                        enrichmentData.lyrics = await this.enrichWithLyrics(title, artist);
                    } else{
                        console.log(`[Enrichment] Skipping MB data for ${title} - Score: ${mbResults.score}`);
                    }
                }

                if (song.rows.length === 0) {
                    song = await songsService.createSong({
                        youtubeId: videoId,
                        title,
                        artist,
                        duration: videoDetails?.duration,
                        filePath: supabaseUrl,
                        mbid: enrichmentData.mbid,
                        album: enrichmentData.album,
                        genre: enrichmentData.genre,
                        year: enrichmentData.year,
                        coverArtUrl: enrichmentData.coverUrl // Uses prioritized MB cover or YT fallback
                    });

                    if (enrichmentData.lyrics && song.id) {
                        // Using 'lyricsSynced' to match the updated SongsService parameter name
                        await songsService.storeLyrics(
                            song.id, 
                            enrichmentData.lyrics.plainLyrics, 
                            enrichmentData.lyrics.syncedLyrics, 
                            enrichmentData.lyrics.source, 
                            enrichmentData.lyrics.sourceId
                        ).catch(err => console.error('Lyric storage error:', err.message));
                    }
                } else {
                    song = song.rows[0];
                    await query(
                        `UPDATE songs SET 
                            file_path = $1, 
                            file_size = $2, 
                            album = COALESCE(album, $3), 
                            genre = COALESCE(genre, $4), 
                            year = COALESCE(year, $5),
                            cover_art_url = COALESCE(cover_art_url, $6)
                            WHERE id = $7`,
                        [supabaseUrl, fileStats.size, enrichmentData.album, enrichmentData.genre, enrichmentData.year, enrichmentData.coverUrl, song.id] 
                    );
                }

                if (userId) {
                    await query(
                        `INSERT INTO user_songs (user_id, song_id, is_downloaded) VALUES ($1, $2, true) ON CONFLICT (user_id, song_id) DO NOTHING`,
                        [userId, song.id]
                    );
                }

                results.push({
                    query: queryText,
                    songId: song.id,
                    url: supabaseUrl,
                    success: true,
                    enrichment: enrichmentData,
                });
            } catch (err) {
                results.push({ query: queryText, success: false, error: err.message });
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