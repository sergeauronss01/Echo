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
        this.userAgent = 'Echo/1.0 (https://github.com/sergeauronss01/Echo)';
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
        const cleanTitle = title
            .replace(/\(Official.*\)|\[Official.*\]/gi, '')
            .replace(/official\s+(video|audio|music\s+video)/gi, '')
            .trim();

        const queryStr = `recording:"${cleanTitle}" AND artist:"${artist}"`;
        
        try {
            const response = await fetch(`${MUSICBRAINZ_API}/recording/?query=${encodeURIComponent(queryStr)}&fmt=json&limit=5`, {
                headers: { 'User-Agent': this.userAgent }
            });
            const data = await response.json();
            const candidates = this.enrichRecordings(data.recordings || []);

            return {
                mbid: candidates.length > 0 ? candidates[0].mbid : null,
                candidates: candidates
            };
        } catch (err) {
            console.error('MusicBrainz search failed:', err.message);
            return { mbid: null, candidates: [] };
        }
    }

    enrichRecordings(recordings) {
        return recordings.map(rec => {
            const year = rec['first-release-date'] ? rec['first-release-date'].split('-')[0] : null;
            const releaseGroup = rec['release-groups']?.[0];
            const album = releaseGroup?.title || null;
            const genre = rec.tags?.sort((a, b) => b.count - a.count)[0]?.name || null;

            const coverArtUrl = releaseGroup?.id 
                ? `https://coverartarchive.org/release-group/${releaseGroup.id}/front` 
                : null;

            return {
                mbid: rec.id,
                title: rec.title,
                artistCredit: rec['artist-credit']?.map(ac => ac.artist?.name).join(', '),
                duration: rec.length,
                year: year,
                album: album,
                genre: genre,
                coverArtUrl: coverArtUrl,
                score: rec.score
            };
        });
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