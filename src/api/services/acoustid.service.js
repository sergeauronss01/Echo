import fetch from 'node-fetch';
import PQueue from 'p-queue';
import { AppError } from '../middleware/error.middleware.js';

const ACOUSTID_API = 'https://api.acoustid.org/v2';
const RATE_LIMIT_MS = 350;

const httpQueue = new PQueue({
    interval: RATE_LIMIT_MS,
    intervalCap: 1,
    timeout: 10000,
    throwOnTimeout: true,
});

export class AcoustIDService {
    constructor() {
        this.clientId = process.env.ACOUSTID_CLIENT_ID;
        if (!this.clientId && process.env.NODE_ENV !== 'test') {
            console.warn('⚠️  ACOUSTID_CLIENT_ID not set - song fingerprint verification will not work');
        }
    }

    async lookup(fingerprint, duration) {
        if (!this.clientId) {
            throw new AppError('AcoustID client ID not configured', 500);
        }

        return await httpQueue.add(async () => {
            try {
                const params = {
                    client: this.clientId,
                    duration: Math.round(duration / 1000),
                    fingerprint: fingerprint,
                    meta: 'recordings',
                };

                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 5000);

                const response = await fetch(
                    `${ACOUSTID_API}/lookup`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams(params).toString(),
                        signal: controller.signal
                    }
                );
                clearTimeout(timer);

                if (!response.ok) {
                    throw new Error(`AcoustID API error: ${response.status}`);
                }

                const data = await response.json();

                if (data.status !== 'ok') {
                    throw new Error(`AcoustID error: ${data.error}`);
                }

                if (!data.results || data.results.length === 0) {
                    return {
                        matches: [],
                        mbids: [],
                    };
                }

                const result = data.results[0];
                const resultScore = result.score || 0; 
                const recordings = result.recordings || [];

                const matches = recordings
                    .slice(0, 5)
                    .map(rec => ({
                        mbid: rec.id,
                        title: rec.title,
                        artists: (rec.artists || []).map(a => a.name).join(', '),
                        score: resultScore,
                        duration: rec.duration || null,
                    }));

                const mbids = [...new Set(matches.map(m => m.mbid))];

                return {
                    matches,
                    mbids,
                    confidence: result.score || 0,
                };
            } catch (err) {
                console.error('AcoustID lookup failed:', err.message);
                throw new AppError(`AcoustID lookup failed: ${err.message}`, 500);
            }
        });
    }

    async verify(fingerprint, duration, expectedMbid) {
        if (!expectedMbid) {
            return {
                verified: false,
                reason: 'No expected MBID provided',
            };
        }

        try {
            const result = await this.lookup(fingerprint, duration);

            if (result.mbids.length === 0) {
                return {
                    verified: false,
                    reason: 'No matches found',
                    confidence: 0,
                };
            }

            const topMatch = result.matches[0];

            if (topMatch.mbid === expectedMbid) {
                return {
                    verified: true,
                    reason: 'MBID matches',
                    confidence: topMatch.score,
                    match: topMatch,
                };
            }

            return {
                verified: false,
                reason: 'MBID mismatch',
                expected: expectedMbid,
                found: topMatch.mbid,
                confidence: topMatch.score,
                matches: result.matches,
            };
        } catch (err) {
            return {
                verified: false,
                reason: 'Verification failed: ' + err.message,
                error: true,
            };
        }
    }
}

export default new AcoustIDService();
