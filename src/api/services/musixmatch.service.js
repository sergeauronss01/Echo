import fetch from 'node-fetch';
import PQueue from 'p-queue';

const MUSIXMATCH_API = 'https://api.musixmatch.com/ws/1.1';
const LYRICS_RATE_LIMIT_MS = 500;

const lyricsQueue = new PQueue({
    interval: LYRICS_RATE_LIMIT_MS,
    intervalCap: 2,
    timeout: 10000,
    throwOnTimeout: true,
});

export class MusixmatchService {
    constructor() {
        this.apiKey = process.env.MUSIXMATCH_API_KEY;
        if (!this.apiKey && process.env.NODE_ENV !== 'test') {
            console.warn('⚠️  MUSIXMATCH_API_KEY not set - lyrics retrieval will be disabled');
        }
    }

    async searchLyrics(title, artist) {
        if (!this.apiKey) {
            return null;
        }

        return await lyricsQueue.add(async () => {
            try {
                const params = new URLSearchParams({
                    q_track: title,
                    q_artist: artist,
                    apikey: this.apiKey,
                    f_has_lyrics: 1,
                });

                const response = await fetch(
                    `${MUSIXMATCH_API}/matcher.lyrics.get?${params}`,
                    { timeout: 5000 }
                );

                if (!response.ok) {
                    return null;
                }

                const data = await response.json();

                if (data.message.header.status_code === 200 && data.message.body.lyrics) {
                    const lyrics = data.message.body.lyrics;
                    return {
                        lyrics: lyrics.lyrics_body,
                        source: 'musixmatch',
                        sourceId: lyrics.lyrics_id,
                        copyright: lyrics.lyrics_copyright,
                        synced: lyrics.lyrics_sync_type === 1,
                    };
                }

                return null;
            } catch (err) {
                console.error('Musixmatch search failed:', err.message);
                return null;
            }
        });
    }

    async getTrackLyrics(trackId) {
        if (!this.apiKey) {
            return null;
        }

        return await lyricsQueue.add(async () => {
            try {
                const params = new URLSearchParams({
                    track_id: trackId,
                    apikey: this.apiKey,
                });

                const response = await fetch(
                    `${MUSIXMATCH_API}/track.lyrics.get?${params}`,
                    { timeout: 5000 }
                );

                if (!response.ok) {
                    return null;
                }

                const data = await response.json();

                if (data.message.header.status_code === 200 && data.message.body.lyrics) {
                    const lyrics = data.message.body.lyrics;
                    return {
                        lyrics: lyrics.lyrics_body,
                        source: 'musixmatch',
                        sourceId: lyrics.lyrics_id,
                        copyright: lyrics.lyrics_copyright,
                        synced: lyrics.lyrics_sync_type === 1,
                    };
                }

                return null;
            } catch (err) {
                console.error('Musixmatch.getTrackLyrics failed:', err.message);
                return null;
            }
        });
    }
}

export default new MusixmatchService();
