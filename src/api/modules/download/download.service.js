import songsService from '../songs/songs.service.js';
import { query }     from '../../config/database.js';
import { google }    from 'googleapis';
import { AppError }  from '../../middleware/error.middleware.js';
import { createRequire } from 'node:module';
import fetch from 'node-fetch';
import fs   from 'fs';
import path from 'path';
import os   from 'os';
import musicBrainzService from '../../services/musicbrainz.service.js';
import scoringService     from '../../services/scoring.service.js';
import LrclibService      from '../../services/lrclib.service.js';
import { createClient }   from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const { Tubidy } = require('tubidy-scrape');
const tubidy = Tubidy();

const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR
    || path.join(os.homedir(), 'Downloads', 'echo-downloads');

const YT_API = google.youtube({ version: 'v3', auth: process.env.YT_API_KEY });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export class DownloadService {

    // ── YouTube helpers ─────────────────────────────────────────

    async getTopVideoId(queryText) {
        try {
            const response = await YT_API.search.list({
                part: 'snippet',
                q: `${queryText} official audio`,
                maxResults: 1,
                type: 'video',
            });
            return response.data.items?.[0]?.id?.videoId || null;
        } catch (err) {
            console.error(`YT search error for "${queryText}":`, err.message);
            return null;
        }
    }

    async getVideoDetails(videoId) {
        try {
            const response = await YT_API.videos.list({
                part: 'snippet,contentDetails',
                id: videoId,
            });
            const item = response.data.items?.[0];
            if (!item) return null;
            return {
                title:       item.snippet.title,
                description: item.snippet.description,
                duration:    this._isoToDurationMs(item.contentDetails.duration),
            };
        } catch (err) {
            console.error(`YT details error for ${videoId}:`, err.message);
            return null;
        }
    }

    _isoToDurationMs(isoDuration) {
        const m = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!m) return 0;
        return ((parseInt(m[1]) || 0) * 3600 + (parseInt(m[2]) || 0) * 60 + (parseInt(m[3]) || 0)) * 1000;
    }

    cleanSearchTerm(text) {
        return text
            .replace(/\[[^\]]*\]/g, '')   
            .replace(/\([^\)]*\)/g, '')
            .replace(/(?:feat|ft)\.?\s+[^\-\(\)\[\]]+/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    parseMetadata(title) {
        const patterns = [
            /^(.*?)\s*[-–]\s*(.*?)(?:\s*\(|$)/,
            /^(.*?)\s*[-–]\s*/,
            /^(.*?)\s*[-–]\s*(.*?)(?:\s*[\(\[]|$)/,
        ];
        let artist = 'Unknown';
        let parsedTitle = title;
        for (const pattern of patterns) {
            const match = title.match(pattern);
            if (match) {
                artist      = match[1]?.trim() || 'Unknown';
                parsedTitle = match[2]?.trim() || title;
                break;
            }
        }
        return { title: parsedTitle, artist };
    }

    // ── Metadata enrichment ─────────────────────────────────────

    async enrichWithMusicBrainz(title, artist, durationMs) {
        try {
            const response      = await musicBrainzService.searchByTitleArtistDuration(title, artist, durationMs);
            const candidateList = Array.isArray(response) ? response : (response?.candidates || []);

            if (!candidateList.length) return { mbid: null, score: 0, candidates: [], reviewNeeded: false, autoAccepted: false };

            const scored   = scoringService.scoreCandidates(title, artist, durationMs, candidateList);
            if (!scored?.length) return { mbid: null, score: 0, candidates: [], reviewNeeded: false, autoAccepted: false };

            const topMatch = scored[0];
            const finalScore = topMatch?.score || 0;

            return {
                mbid:         topMatch?.mbid || null,
                score:        finalScore,
                candidates:   scored.slice(0, 5),
                reviewNeeded: scoringService.requiresReview(finalScore),
                autoAccepted: scoringService.isAutoAcceptable(finalScore),
            };
        } catch (err) {
            console.error('MusicBrainz enrichment error:', err.message);
            return { mbid: null, score: 0, candidates: [], reviewNeeded: false, autoAccepted: false };
        }
    }

    async enrichWithLyrics(title, artist) {
        try {
            return await LrclibService.searchLyrics(title, artist) || null;
        } catch (err) {
            console.warn('Lyrics enrichment failed:', err.message);
            return null;
        }
    }

    // ── Supabase Storage upload ─────────────────────────────────

    async uploadToSupabase(filePath, fileName) {
        const fileBuffer = fs.readFileSync(filePath);
        const ext        = path.extname(fileName).toLowerCase();
        const contentType = ext === '.mp3' ? 'audio/mpeg' : ext === '.webm' ? 'audio/webm' : 'audio/mp4';

        const { error } = await supabase.storage
            .from('songs')
            .upload(`audio/${fileName}`, fileBuffer, { contentType, upsert: true });

        if (error) throw new Error(`Supabase upload failed: ${error.message}`);

        const { data: urlData } = supabase.storage
            .from('songs')
            .getPublicUrl(`audio/${fileName}`);

        return urlData.publicUrl;
    }

    // ── Tubidy download ────────────────────────────────────────

    async downloadSong(queryText, videoId) {
        if (!fs.existsSync(DOWNLOAD_DIR)) {
            fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
        }

        try {
            const results = await tubidy.search(queryText, 1);
            const outputPath = path.join(DOWNLOAD_DIR, `${videoId}.mp3`);
            if (!results?.length) {
                console.warn(`Tubidy returned no results for "${queryText}"`);
                return null;
            }

            for (const match of results) {
                if (!match?.id) continue;

                const review = await tubidy.review(match.id);
                if (review?.error || !review?.success) {
                    console.warn(`Tubidy result unavailable for "${match.title}": ${review?.error || 'unknown reason'}`);
                    continue;
                }

                const links = await tubidy.download(match.id, 'mp3audio');
                if (!links?.download) {
                    console.warn(`Tubidy result has no MP3 link for "${match.title}"`);
                    continue;
                }

                const response = await fetch(links.download);
                if (!response.ok || !response.body) {
                    console.warn(`Tubidy MP3 request failed for "${match.title}" with HTTP ${response.status}`);
                    continue;
                }

                try {
                    await new Promise((resolve, reject) => {
                        const output = fs.createWriteStream(outputPath);
                        response.body.pipe(output);
                        response.body.on('error', reject);
                        output.on('finish', resolve);
                        output.on('error', reject);
                    });
                    return outputPath;
                } catch (err) {
                    fs.rmSync(outputPath, { force: true });
                    console.warn(`Tubidy MP3 transfer failed for "${match.title}": ${err.message}`);
                }
            }

            console.error(`Tubidy found no downloadable MP3 for "${queryText}"`);
            return null;
        } catch (err) {
            console.error(`Tubidy download error for "${queryText}":`, err.message);
            return null;
        }
    }

    // ── Batch pipeline ──────────────────────────────────────────

    async batchDownloadSongs(queries, userId = null) {
        const results = [];

        for (const queryText of queries) {
            const q = queryText.trim();
            if (!q) continue;

            try {
                // 1. Find video
                const videoId = await this.getTopVideoId(q);
                if (!videoId) {
                    results.push({ query: q, success: false, error: 'Video not found' });
                    continue;
                }

                // 2. Download locally
                const localFilePath = await this.downloadSong(q, videoId);
                if (!localFilePath) {
                    results.push({ query: q, success: false, error: 'Download failed' });
                    continue;
                }

                // 3. Upload to Supabase Storage
                const fileName    = path.basename(localFilePath);
                const supabaseUrl = await this.uploadToSupabase(localFilePath, fileName);
                fs.unlinkSync(localFilePath); 

                // 4. Parse / enrich metadata
                let title  = q;
                let artist = 'Unknown';
                let enrichmentData = {
                    mbid:     null,
                    album:    null,
                    year:     null,
                    genre:    null,
                    lyrics:   null,
                    coverUrl: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
                };

                const videoDetails = await this.getVideoDetails(videoId);
                if (videoDetails) {
                    const parsed = this.parseMetadata(videoDetails.title);
                    title  = this.cleanSearchTerm(parsed.title);
                    artist = this.cleanSearchTerm(parsed.artist);

                    const mbResults = await this.enrichWithMusicBrainz(
                        title,
                        artist,
                        videoDetails.duration
                    );

                    if (mbResults.candidates?.length && mbResults.autoAccepted) {
                        const top  = mbResults.candidates[0];
                        title      = top.title       || title;
                        artist     = top.artistCredit || artist;
                        enrichmentData = { ...enrichmentData, ...top };
                    }

                    enrichmentData.lyrics = await this.enrichWithLyrics(title, artist);
                }

                // 5. Insert or update song in DB (Supabase PostgreSQL)
                let song;
                const existing = await query('SELECT id FROM songs WHERE youtube_id = $1', [videoId]);

                if (existing.rows.length === 0) {
                    song = await songsService.createSong({
                        youtubeId:   videoId,
                        title,
                        artist,
                        duration:    videoDetails?.duration,
                        filePath:    supabaseUrl,   
                        mbid:        enrichmentData.mbid,
                        album:       enrichmentData.album,
                        genre:       enrichmentData.genre,
                        year:        enrichmentData.year,
                        coverArtUrl: enrichmentData.coverUrl,
                    });

                    if (enrichmentData.lyrics && song?.id) {
                        await songsService.storeLyrics(
                            song.id,
                            enrichmentData.lyrics.plainLyrics,
                            enrichmentData.lyrics.syncedLyrics,
                            enrichmentData.lyrics.source,
                            enrichmentData.lyrics.sourceId
                        ).catch(err => console.error('Lyric storage error:', err.message));
                    }
                } else {
                    song = existing.rows[0];
                    await query(
                        `UPDATE songs
                         SET file_path    = $1,
                             album        = COALESCE(album,        $2),
                             genre        = COALESCE(genre,        $3),
                             year         = COALESCE(year,         $4),
                             cover_art_url = COALESCE(cover_art_url, $5)
                         WHERE id = $6`,
                        [supabaseUrl, enrichmentData.album, enrichmentData.genre,
                         enrichmentData.year, enrichmentData.coverUrl, song.id]
                    );
                }

                // 6. Link song to user library
                if (userId && song?.id) {
                    await query(
                        `INSERT INTO user_songs (user_id, song_id, is_downloaded)
                         VALUES ($1, $2, true)
                         ON CONFLICT (user_id, song_id) DO NOTHING`,
                        [userId, song.id]
                    );
                }

                results.push({ query: q, songId: song?.id, url: supabaseUrl, success: true });
            } catch (err) {
                console.error(`Pipeline error for "${q}":`, err.message);
                results.push({ query: q, success: false, error: err.message });
            }
        }

        return results;
    }

    // ── Library management ──────────────────────────────────────

    async addUserSong(userId, songId) {
        const exists = await query('SELECT id FROM songs WHERE id = $1', [songId]);
        if (!exists.rows.length) throw new AppError('Song not found', 404);

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
        await query('DELETE FROM user_songs WHERE user_id = $1 AND song_id = $2', [userId, songId]);
        return { message: 'Song removed from library' };
    }

    async getUserSongs(userId, page = 1, limit = 20) {
        const offset = (page - 1) * limit;

        const songsResult = await query(
            `SELECT s.id, s.youtube_id, s.title, s.artist, s.duration,
                    s.album, s.genre, s.year, s.cover_art_url,
                    us.is_favorite, us.added_at
             FROM user_songs us
             JOIN songs s ON us.song_id = s.id
             WHERE us.user_id = $1
             ORDER BY us.added_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );

        const countResult = await query(
            'SELECT COUNT(*) FROM user_songs WHERE user_id = $1', [userId]
        );
        const total = parseInt(countResult.rows[0].count);

        return { songs: songsResult.rows, total, page, pages: Math.ceil(total / limit) };
    }

    async toggleFavorite(userId, songId, isFavorite) {
        const result = await query(
            `UPDATE user_songs SET is_favorite = $1
             WHERE user_id = $2 AND song_id = $3
             RETURNING *`,
            [isFavorite, userId, songId]
        );
        if (!result.rows.length) throw new AppError('Song not found in user library', 404);
        return result.rows[0];
    }
}

export default new DownloadService();