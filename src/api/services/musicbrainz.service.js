import fetch from 'node-fetch';
import PQueue from 'p-queue';

const MUSICBRAINZ_API = 'https://musicbrainz.org/ws/2';
const RATE_LIMIT_MS = 1000;

const httpQueue = new PQueue({
    interval: RATE_LIMIT_MS,
    intervalCap: 1,
    timeout: 5000,
    throwOnTimeout: true,
});

export class MusicBrainzService {
    constructor() {
        this.userAgent = 'Echo/1.0 (https://github.com/yourusername/echo)';
    }

    async searchRecording(query) {
        return await httpQueue.add(async () => {
            try {
                const searchUrl = `${MUSICBRAINZ_API}/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=5`;

                const response = await fetch(searchUrl, {
                    headers: {
                        'User-Agent': this.userAgent,
                    },
                });

                if (!response.ok) {
                    throw new Error(`MusicBrainz API error: ${response.status}`);
                }

                const data = await response.json();
                return data.recordings || [];
            } catch (err) {
                console.error('MusicBrainz search failed:', err.message);
                return [];
            }
        });
    }

    async searchByTitleArtistDuration(title, artist, durationMs) {
        const durationSec = Math.round(durationMs / 1000);
        const query = `recording:"${title}" AND artist:"${artist}" AND length:${durationSec}`;

        const recordings = await this.searchRecording(query);
        return this.enrichRecordings(recordings);
    }

    enrichRecordings(recordings) {
        return recordings.map(rec => ({
            mbid: rec.id,
            title: rec.title,
            artistCredit: rec['artist-credit']?.map(ac => ac.artist?.name).join(', '),
            duration: rec.length,
            releaseGroups: rec['release-groups']?.slice(0, 3) || [],
            disambiguation: rec.disambiguation,
        }));
    }

    async getRecordingDetails(mbid) {
        return await httpQueue.add(async () => {
            try {
                const url = `${MUSICBRAINZ_API}/recording/${mbid}?fmt=json&inc=artists+releases`;

                const response = await fetch(url, {
                    headers: {
                        'User-Agent': this.userAgent,
                    },
                });

                if (!response.ok) {
                    throw new Error(`MusicBrainz API error: ${response.status}`);
                }

                const data = await response.json();
                return {
                    mbid: data.id,
                    title: data.title,
                    artists: data['artist-credit']?.map(ac => ({
                        mbid: ac.artist?.id,
                        name: ac.artist?.name,
                    })) || [],
                    duration: data.length,
                    releases: data.releases?.slice(0, 3) || [],
                    disambiguation: data.disambiguation,
                };
            } catch (err) {
                console.error(`Failed to fetch MBID ${mbid}:`, err.message);
                return null;
            }
        });
    }
}

export default new MusicBrainzService();
