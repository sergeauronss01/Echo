import fingerprintingService from './fingerprinting.service.js';
import { AppError } from '../../middleware/error.middleware.js';

export class FingerprintingController {
    async uploadAndIdentify(req, res, next) {
        try {
            if (!req.file) {
                throw new AppError('No audio file received. Send multipart/form-data with field "audio".', 400);
            }

            const result = await fingerprintingService.uploadAndIdentify(req.file.path, req.userId);
            res.json({ data: result });
        } catch (err) {
            next(err);
        }
    }

    async recordAndIdentify(req, res, next) {
        try {
            if (!req.file) {
                throw new AppError('No audio recording received. Send multipart/form-data with field "audio".', 400);
            }

            const result = await fingerprintingService.identifyFromRecording(req.file.path, req.userId);
            res.json({ data: result });
        } catch (err) {
            next(err);
        }
    }

    async generateForSong(req, res, next) {
        try {
            const { songId } = req.params;
            const result = await fingerprintingService.generateFingerprintForSong(parseInt(songId));
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async batchGenerate(req, res, next) {
        try {
            const { songIds } = req.body;

            if (!Array.isArray(songIds) || songIds.length === 0) {
                throw new AppError('Invalid songIds array', 400);
            }

            const results = await fingerprintingService.batchGenerateFingerprints(songIds);
            res.json(results);
        } catch (err) {
            next(err);
        }
    }

    async getMatchHistory(req, res, next) {
        try {
            const { limit = 50 } = req.query;
            const history = await fingerprintingService.getMatchHistory(req.userId, parseInt(limit));
            res.json({ history });
        } catch (err) {
            next(err);
        }
    }
}

export default new FingerprintingController();