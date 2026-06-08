import fetch from 'node-fetch';
import PQueue from 'p-queue';

const LRCLIB_API = 'https://lrclib.net/api';
const LYRICS_RATE_LIMIT_MS = 500; 

const lyricsQueue = new PQueue({
    interval: LYRICS_RATE_LIMIT_MS,
    intervalCap: 2,
    timeout: 10000,
    throwOnTimeout: true,
});

export class LrclibService {
    constructor() {
        // We define a User-Agent, which LRCLIB requests use.
        this.userAgent = 'Echo/1.0 (https://github.com/sergeauronss01/echo)'; 
    }

    async searchLyrics(title, artist) {
        return await lyricsQueue.add(async () => {
            try {
                const params = new URLSearchParams({
                    q: `${title} ${artist}`
                });

                const response = await fetch(
                    `${LRCLIB_API}/search?${params}`,
                    { 
                        headers: { 'User-Agent': this.userAgent },
                        timeout: 5000 
                    }
                );

                if (!response.ok) return null;

                const data = await response.json();

                if (data && data.length > 0) {
                    return this._formatResponse(data[0]);
                }

                return null;
            } catch (err) {
                console.error('LRCLIB search failed:', err.message);
                return null;
            }
        });
    }

    async getTrackLyrics(trackId) {
        return await lyricsQueue.add(async () => {
            try {
                const response = await fetch(
                    `${LRCLIB_API}/get/${trackId}`,
                    { 
                        headers: { 'User-Agent': this.userAgent },
                        timeout: 5000 
                    }
                );

                if (!response.ok) return null;

                const data = await response.json();
                
                if (data && (data.plainLyrics || data.syncedLyrics)) {
                    return this._formatResponse(data);
                }

                return null;
            } catch (err) {
                console.error('LRCLIB getTrackLyrics failed:', err.message);
                return null;
            }
        });
    }

    // BONUS: it is the most accurate way to use LRCLIB if the app happens to have the duration and album data.
    async getExactLyrics(title, artist, album, durationInSeconds) {
        return await lyricsQueue.add(async () => {
            try {
                const params = new URLSearchParams({
                    track_name: title,
                    artist_name: artist,
                    album_name: album,
                    duration: durationInSeconds
                });

                const response = await fetch(
                    `${LRCLIB_API}/get?${params}`,
                    { 
                        headers: { 'User-Agent': this.userAgent },
                        timeout: 5000 
                    }
                );

                if (!response.ok) return null;

                const data = await response.json();
                return this._formatResponse(data);
            } catch (err) {
                console.error('LRCLIB exact search failed:', err.message);
                return null;
            }
        });
    }

    _formatResponse(data) {
        return {
            source: 'lrclib',
            sourceId: data.id,
            plainLyrics: data.plainLyrics || null,
            syncedLyrics: data.syncedLyrics || null,
            isInstrumental: data.instrumental || false,
            trackName: data.trackName,
            artistName: data.artistName,
            albumName: data.albumName,
            duration: data.duration 
        };
    }
}

export default new LrclibService();